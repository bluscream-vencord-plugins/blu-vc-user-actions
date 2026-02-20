import { ChannelOwnership, MemberChannelInfo, PluginState } from "../types/state";
import { PluginSettings } from "../types/settings";
import { logger } from "./logger";
import * as DataStore from "@api/DataStore";

const STORAGE_KEY_OWNERS = "SocializeGuild_Owners_v2";
const STORAGE_KEY_MEMBERS = "SocializeGuild_Members_v2";

// Helper generic store interface
interface Store<T> {
    get(): T;
    set(val: T): void;
    subscribe(listener: () => void): () => void;
}

type StoreWithState = PluginSettings & {
    activeChannelOwnerships: Record<string, ChannelOwnership>;
    memberConfigs: Record<string, MemberChannelInfo>;
};

export class StateManager {
    private store!: StoreWithState;

    public async init(vencordStore: PluginSettings) {
        this.store = vencordStore as StoreWithState;

        this.store.activeChannelOwnerships = {};
        this.store.memberConfigs = {};

        try {
            const owners = await DataStore.get(STORAGE_KEY_OWNERS);
            if (owners) {
                this.store.activeChannelOwnerships = owners as Record<string, ChannelOwnership>;
            }

            const members = await DataStore.get(STORAGE_KEY_MEMBERS);
            if (members) {
                this.store.memberConfigs = members as Record<string, MemberChannelInfo>;
            }
            logger.info(`Loaded state: ${Object.keys(this.store.activeChannelOwnerships).length} ownerships, ${Object.keys(this.store.memberConfigs).length} members`);
        } catch (e) {
            logger.error("Failed to load plugin state:", e);
        }
    }

    public async saveState() {
        try {
            await DataStore.set(STORAGE_KEY_OWNERS, this.store.activeChannelOwnerships);
            await DataStore.set(STORAGE_KEY_MEMBERS, this.store.memberConfigs);
        } catch (e) {
            logger.error("Failed to save plugin state:", e);
        }
    }

    public getOwnership(channelId: string): ChannelOwnership | null {
        return this.store.activeChannelOwnerships[channelId] || null;
    }

    public setOwnership(channelId: string, ownership: ChannelOwnership | null) {
        if (ownership === null) {
            delete this.store.activeChannelOwnerships[channelId];
        } else {
            this.store.activeChannelOwnerships[channelId] = ownership;
        }
        this.saveState();
    }

    public getMemberConfig(userId: string): MemberChannelInfo {
        if (!this.store.memberConfigs[userId]) {
            // Default config
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
        this.saveState();
    }

    public getAllActiveOwnerships(): Record<string, ChannelOwnership> {
        return this.store.activeChannelOwnerships || {};
    }

    public getChannelOwnershipForUser(userId: string): ChannelOwnership | null {
        for (const channelId in this.store.activeChannelOwnerships) {
            const ownership = this.store.activeChannelOwnerships[channelId];
            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                return ownership;
            }
        }
        return null;
    }
}

export const stateManager = new StateManager();
