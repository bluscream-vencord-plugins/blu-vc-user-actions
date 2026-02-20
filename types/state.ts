export interface ChannelOwnership {
    channelId: string;
    creatorId: string | null;
    claimantId: string | null;
    createdAt: number | null;
    claimedAt: number | null;
}

export interface MemberChannelInfo {
    userId: string;
    customName: string | null;
    userLimit: number | null;
    isLocked: boolean;
    bannedUsers: string[];
    permittedUsers: string[];
    whitelistedUsers: string[];
    nameRotationList: string[];
    nameRotationIndex: number;
}

export interface ActionQueueItem {
    id: string;
    command: string;
    channelId: string;
    priority: boolean;
    timestamp: number;
    messageId?: string;
    executeCondition?: () => boolean;
}

export interface PluginState {
    activeChannelOwnerships: Record<string, ChannelOwnership>; // Maps Channel ID to Ownership
    memberConfigs: Record<string, MemberChannelInfo>; // Maps User ID to Config
}
