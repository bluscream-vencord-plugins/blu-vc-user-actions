import { ChannelOwnership, MemberChannelInfo, PluginState } from "../types/state";
import { PluginSettings } from "../types/settings";
import { logger } from "./logger";
import * as DataStore from "@api/DataStore";

const STORAGE_KEY_OWNERS = "SocializeGuild_Owners_v2";
const STORAGE_KEY_MEMBERS = "SocializeGuild_Members_v2";

type StoreWithState = PluginSettings & {
    activeChannelOwnerships: Record<string, ChannelOwnership>;
    memberConfigs: Record<string, MemberChannelInfo>;
};

export class StateManager {
    private store!: StoreWithState;
    private initialized = false;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    public async init(vencordStore: PluginSettings) {
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

    private async flushSave() {
        this.saveTimer = null;
        try {
            // Deep-clone via JSON round-trip to produce a plain object.
            // this.store is a Vencord Proxy — the structured clone algorithm
            // used by IndexedDB cannot serialize Proxy objects directly, causing
            // DataCloneError. The JSON round-trip strips the Proxy wrapper.
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

    public getOwnership(channelId: string): ChannelOwnership | null {
        return this.store?.activeChannelOwnerships?.[channelId] || null;
    }

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

    public getMemberConfig(userId: string): MemberChannelInfo {
        if (!this.store?.memberConfigs[userId]) {
            this.store.memberConfigs[userId] = {
                userId,
                customName: null,
                userLimit: null,
                isLocked: false,
                bannedUsers: [],
                permittedUsers: [],
                whitelistedUsers: [],
                nameRotationList: [],
                nameRotationIndex: 0
            };
        }
        return this.store.memberConfigs[userId];
    }

    public updateMemberConfig(userId: string, update: Partial<MemberChannelInfo>) {
        const config = this.getMemberConfig(userId);
        Object.assign(config, update);
        this.scheduleSave();
    }

    public getAllActiveOwnerships(): Record<string, ChannelOwnership> {
        return this.store?.activeChannelOwnerships || {};
    }

    public getChannelOwnershipForUser(userId: string): ChannelOwnership | null {
        for (const channelId in this.store?.activeChannelOwnerships) {
            const ownership = this.store.activeChannelOwnerships[channelId];
            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                return ownership;
            }
        }
        return null;
    }
}

export const stateManager = new StateManager();
