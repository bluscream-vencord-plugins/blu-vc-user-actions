import { ChannelOwnership, MemberChannelInfo, PluginState } from "../types/state";
import { logger } from "./logger";
import * as DataStore from "@api/DataStore";

const STORAGE_KEY_OWNERS = "SocializeGuild_Owners_v3";
const STORAGE_KEY_MEMBERS = "SocializeGuild_Members_v3";

/**
 * Internal store structure combining plugin settings with runtime state.
 */
type StoreWithState = any & { // Loose type for the Vencord store
    /** Map of channel IDs to their ownership metadata */
    activeChannelOwnerships: Record<string, ChannelOwnership>;
    /** Map of user IDs to their personal channel configurations */
    memberConfigs: Record<string, MemberChannelInfo>;
};

/**
 * Manages the persistent and runtime state of the plugin, including ownerships and user preferences.
 */
export class StateManager {
    private store!: StoreWithState;
    private initialized = false;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Initializes the state manager and loads stored data from the Vencord DataStore.
     * @param vencordStore The core Vencord settings store proxy
     */
    public async init(vencordStore: any) {
        this.store = vencordStore as StoreWithState;
        this.store.activeChannelOwnerships = {};
        this.store.memberConfigs = {};

        try {
            const [owners, members] = await Promise.all([
                DataStore.get<Record<string, ChannelOwnership>>(STORAGE_KEY_OWNERS),
                DataStore.get<Record<string, MemberChannelInfo>>(STORAGE_KEY_MEMBERS),
            ]);
            if (owners) this.store.activeChannelOwnerships = owners;
            if (members) this.store.memberConfigs = members;
            logger.info(`Loaded state: ${Object.keys(this.store.activeChannelOwnerships).length} ownerships, ${Object.keys(this.store.memberConfigs).length} members`);
        } catch (e) {
            logger.error("Failed to load plugin state:", e);
        }

        this.initialized = true;
    }

    /** Debounced save — coalesces rapid successive writes into one DB transaction */
    private scheduleSave() {
        if (!this.initialized) return; // Don't save before load completes
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flushSave(), 500);
    }

    /**
     * Performs a synchronous write to the backend storage.
     */
    private async flushSave() {
        this.saveTimer = null;
        try {
            const ownerships = JSON.parse(JSON.stringify(this.store.activeChannelOwnerships ?? {}));
            const members = JSON.parse(JSON.stringify(this.store.memberConfigs ?? {}));
            await DataStore.setMany([
                [STORAGE_KEY_OWNERS, ownerships],
                [STORAGE_KEY_MEMBERS, members],
            ]);
        } catch (e) {
            logger.error("Failed to save plugin state:", e);
        }
    }

    /**
     * Retrieves the ownership status of a voice channel.
     * @param channelId The ID of the channel to query
     * @returns The ownership metadata or null if unowned
     */
    public getOwnership(channelId: string): ChannelOwnership | null {
        return this.store?.activeChannelOwnerships?.[channelId] || null;
    }

    /**
     * Updates or removes the ownership record for a channel.
     * @param channelId The target channel ID
     * @param ownership The updated ownership data, or null to clear ownership
     */
    public setOwnership(channelId: string, ownership: Partial<ChannelOwnership> | null) {
        if (!this.store) return;
        if (ownership === null) {
            delete this.store.activeChannelOwnerships[channelId];
        } else {
            const existing = this.store.activeChannelOwnerships[channelId];
            this.store.activeChannelOwnerships[channelId] = existing
                ? { ...existing, ...(ownership as ChannelOwnership) }
                : (ownership as ChannelOwnership);
        }
        this.scheduleSave();
    }

    /**
     * Retrieves or initializes the channel preference configuration for a user.
     * @param userId The ID of the user
     * @returns The member configuration object
     */
    public getMemberConfig(userId: string): MemberChannelInfo {
        if (!this.store?.memberConfigs[userId]) {
            this.store.memberConfigs[userId] = {
                userId,
                customName: null,
                userLimit: null,
                isLocked: false,
                bannedUsers: [],
                permittedUsers: []
            };
        }
        return this.store.memberConfigs[userId];
    }

    /**
     * Checks if a user has an existing cached configuration.
     * @param userId The ID of the user
     */
    public hasMemberConfig(userId: string): boolean {
        return !!this.store?.memberConfigs[userId];
    }

    /**
     * Partially updates a user's channel configuration.
     * @param userId The ID of the user to update
     * @param update The partial configuration data to merge
     */
    public updateMemberConfig(userId: string, update: Partial<MemberChannelInfo>) {
        const config = this.getMemberConfig(userId);
        Object.assign(config, update);
        this.scheduleSave();
    }

    /**
     * Returns all active channel ownership records.
     */
    public getAllActiveOwnerships(): Record<string, ChannelOwnership> {
        return this.store?.activeChannelOwnerships || {};
    }

    /**
     * Finds all channels associated with a specific user (as creator or claimant).
     * @param userId The ID of the user to look up
     */
    public getChannelOwnershipsForUser(userId: string): ChannelOwnership[] {
        const ownerships: ChannelOwnership[] = [];
        for (const channelId in this.store?.activeChannelOwnerships) {
            const ownership = this.store.activeChannelOwnerships[channelId];
            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                ownerships.push(ownership);
            }
        }
        return ownerships;
    }
    /**
     * Resets the plugin's internal state to empty.
     */
    public resetState() {
        if (!this.store) return;
        this.store.activeChannelOwnerships = {};
        this.store.memberConfigs = {};
        this.scheduleSave();
    }
}


/**
 * The singleton instance of the StateManager.
 */
export const stateManager = new StateManager();
