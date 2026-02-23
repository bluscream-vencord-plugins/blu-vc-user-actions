/**
 * Metadata record for the ownership of a voice channel.
 */
export interface ChannelOwnership {
    /** The unique ID of the voice channel */
    channelId: string;
    /** The ID of the user who originally created the channel */
    creatorId: string | null;
    /** The ID of the current active claimant/owner */
    claimantId: string | null;
    /** Timestamp when the channel was created */
    createdAt: number | null;
    /** Timestamp when the channel was last claimed */
    claimedAt: number | null;
}

/**
 * Persistent configuration data for a user's managed voice channel.
 */
export interface MemberChannelInfo {
    /** The ID of the user these settings belong to */
    userId: string;
    /** The preferred custom name for the user's channel */
    customName: string | null;
    /** The preferred user limit for the user's channel */
    userLimit: number | null;
    /** Whether the user's channel should default to locked */
    isLocked: boolean;
    /** List of user IDs explicitly banned from the user's channel */
    bannedUsers: string[];
    /** List of user IDs explicitly permitted to enter the user's channel */
    permittedUsers: string[];
}

/**
 * Represents an item in the execution queue.
 */
export interface ActionQueueItem {
    id: string;
    /** The actual command string to send */
    command: string;
    /** The target channel ID */
    channelId: string;
    /** Whether this action should be processed with high priority */
    priority: boolean;
    /** Timestamp when it was enqueued */
    timestamp: number;
    /** Optional check performed immediately before execution */
    executeCondition?: () => boolean;
    /** The ID of the resulting message once sent */
    messageId?: string;
}

/**
 * Represents the entire runtime state tree of the plugin.
 */
export interface PluginState {
    /** Map of channel IDs to their ownership records */
    activeChannelOwnerships: Record<string, ChannelOwnership>;
    /** Map of user IDs to their personal channel configurations */
    memberConfigs: Record<string, MemberChannelInfo>;
}
