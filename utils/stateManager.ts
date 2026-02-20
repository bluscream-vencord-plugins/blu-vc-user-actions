import { ChannelOwnership, MemberChannelInfo, PluginState } from "../types/state";
import { PluginSettings } from "../types/settings";
import { logger } from "./logger";


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
    private store!: StoreWithState; // Vencord plugin store definition

    public init(vencordStore: PluginSettings) {
        this.store = vencordStore as StoreWithState;

        // Ensure default state exists
        if (!this.store.activeChannelOwnerships) {
            this.store.activeChannelOwnerships = {};
        }
        if (!this.store.memberConfigs) {
            this.store.memberConfigs = {};
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
