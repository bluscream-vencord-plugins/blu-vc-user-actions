import { ActionQueueItem, ChannelOwnership } from "./state";

/**
 * Categorizes the type of response received from the moderation bot.
 */
export enum BotResponseType {
    /** Bot confirmed channel creation */
    CREATED = "Channel Created",
    /** Bot confirmed channel claim */
    CLAIMED = "Channel Claimed",
    /** Bot sent channel settings information */
    INFO = "Channel Settings",
    /** Bot confirmed a user was banned */
    BANNED = "Banned",
    /** Bot confirmed a user was unbanned */
    UNBANNED = "Unbanned",
    /** Bot confirmed a user was permitted */
    PERMITTED = "Permitted",
    /** Bot confirmed a user was unpermitted */
    UNPERMITTED = "Unpermitted",
    /** Bot confirmed channel size was updated */
    SIZE_SET = "Size Set",
    /** Bot confirmed channel was locked */
    LOCKED = "Locked",
    /** Bot confirmed channel was unlocked */
    UNLOCKED = "Unlocked",
    /** Fallback for unrecognized bot responses */
    UNKNOWN = "Unknown"
}

/**
 * List of custom internal events used for communication between modules.
 */
export enum PluginModuleEvent {
    /** Fired when the internal state of a channel changes */
    CHANNEL_OWNERSHIP_CHANGED = "SOCIALIZE_CHANNEL_OWNERSHIP_CHANGED",

    /** Fired when the target bot confirms a change via embed */
    BOT_EMBED_RECEIVED = "SOCIALIZE_BOT_EMBED_RECEIVED",

    /** Fired before a command is sent by the action queue */
    ACTION_EXECUTED = "SOCIALIZE_ACTION_EXECUTED",

    /** Fired when a command is added to the action queue */
    ACTION_QUEUED = "SOCIALIZE_ACTION_QUEUED",

    /** Fired when our local user joins a managed channel */
    LOCAL_USER_JOINED_MANAGED_CHANNEL = "SOCIALIZE_LOCAL_USER_JOINED_MANAGED_CHANNEL",
    /** Fired when our local user leaves a managed channel */
    LOCAL_USER_LEFT_MANAGED_CHANNEL = "SOCIALIZE_LOCAL_USER_LEFT_MANAGED_CHANNEL",

    /** Fired when a different user joins our owned channel */
    USER_JOINED_OWNED_CHANNEL = "SOCIALIZE_USER_JOINED_OWNED_CHANNEL",
    /** Fired when a different user leaves our owned channel */
    USER_LEFT_OWNED_CHANNEL = "SOCIALIZE_USER_LEFT_OWNED_CHANNEL"
}

/**
 * Map of event types to their corresponding data payload shapes.
 */
export interface EventPayloads {
    [PluginModuleEvent.CHANNEL_OWNERSHIP_CHANGED]: {
        /** The ID of the channel */
        channelId: string;
        /** Previous ownership data */
        oldOwnership: ChannelOwnership | null;
        /** New ownership data */
        newOwnership: ChannelOwnership | null;
    };
    [PluginModuleEvent.BOT_EMBED_RECEIVED]: {
        /** ID of the message containing the embed */
        messageId: string;
        /** ID of the channel where the message appeared */
        channelId: string;
        /** Parsed type of the bot response */
        type: BotResponseType;
        /** The user who triggered the original action */
        initiatorId?: string;
        /** The target user of the action (e.g., user who was banned) */
        targetUserId?: string;
        /** The raw Discord embed object */
        embed: unknown;
    };
    [PluginModuleEvent.ACTION_EXECUTED]: {
        /** The queue item that was processed */
        item: ActionQueueItem;
    };
    [PluginModuleEvent.ACTION_QUEUED]: {
        /** The queue item that was created */
        item: ActionQueueItem;
    };
    [PluginModuleEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL]: {
        /** The ID of the managed channel */
        channelId: string;
    };
    [PluginModuleEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL]: {
        /** The ID of the managed channel */
        channelId: string;
    };
    [PluginModuleEvent.USER_JOINED_OWNED_CHANNEL]: {
        /** The ID of the voice channel */
        channelId: string;
        /** The ID of the user who joined */
        userId: string;
        /** The ID of the guild */
        guildId: string;
        /** If true, indicates this user has been granted permission to stay */
        isAllowed?: boolean;
        /** If true, indicates a module has already acted on this join */
        isHandled?: boolean;
        /** Narrative reason for the allow/handle decision */
        reason?: string;
    };
    [PluginModuleEvent.USER_LEFT_OWNED_CHANNEL]: {
        /** The ID of the voice channel */
        channelId: string;
        /** The ID of the user who left */
        userId: string;
    };
}
