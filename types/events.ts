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
export enum CoreEvent {
    /** Dispatched when a module is fully initialized */
    MODULE_INIT = "MODULE_INIT",
    /** Dispatched when a message is created in a relevant channel */
    MESSAGE_CREATE = "MESSAGE_CREATE",
    /** Dispatched when a voice state change is detected */
    VOICE_STATE_UPDATE = "VOICE_STATE_UPDATE",
    /** Dispatched when an action is added to the ActionQueue */
    ACTION_QUEUED = "ACTION_QUEUED",
    /** Dispatched when an action is successfully executed from the ActionQueue */
    ACTION_EXECUTED = "ACTION_EXECUTED",

    /** Fired when the internal state of a channel changes */
    CHANNEL_OWNERSHIP_CHANGED = "SOCIALIZE_CHANNEL_OWNERSHIP_CHANGED",

    /** Fired when the target bot confirms a change via embed */
    BOT_EMBED_RECEIVED = "SOCIALIZE_BOT_EMBED_RECEIVED",

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
    [CoreEvent.MODULE_INIT]: { moduleName: string };
    [CoreEvent.MESSAGE_CREATE]: { message: any };
    [CoreEvent.VOICE_STATE_UPDATE]: { oldState: any; newState: any };
    [CoreEvent.ACTION_QUEUED]: { item: any };
    [CoreEvent.ACTION_EXECUTED]: { item: any };

    [CoreEvent.CHANNEL_OWNERSHIP_CHANGED]: {
        /** The ID of the channel */
        channelId: string;
        /** Previous ownership data */
        oldOwnership: ChannelOwnership | null;
        /** New ownership data */
        newOwnership: ChannelOwnership | null;
    };
    [CoreEvent.BOT_EMBED_RECEIVED]: {
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
    [CoreEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL]: {
        /** The ID of the managed channel */
        channelId: string;
    };
    [CoreEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL]: {
        /** The ID of the managed channel */
        channelId: string;
    };
    [CoreEvent.USER_JOINED_OWNED_CHANNEL]: {
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
        /** Whether the user is currently being moderated (kicking/banning) */
        isModerated?: boolean;
    };
    [CoreEvent.USER_LEFT_OWNED_CHANNEL]: {
        /** The ID of the voice channel */
        channelId: string;
        /** The ID of the user who left */
        userId: string;
    };
    // Fallback for custom string events
    [key: string]: any;
}
