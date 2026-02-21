import { ActionQueueItem, ChannelOwnership, MemberChannelInfo } from "./state";
import { Message } from "@vencord/discord-types";

export enum BotResponseType {
    CREATED = "Channel Created",
    CLAIMED = "Channel Claimed",
    INFO = "Channel Settings",
    BANNED = "Banned",
    UNBANNED = "Unbanned",
    PERMITTED = "Permitted",
    UNPERMITTED = "Unpermitted",
    SIZE_SET = "Size Set",
    LOCKED = "Locked",
    UNLOCKED = "Unlocked",
    UNKNOWN = "Unknown"
}

export enum PluginModuleEvent {
    // Fired when the internal state of a channel changes
    CHANNEL_OWNERSHIP_CHANGED = "SOCIALIZE_CHANNEL_OWNERSHIP_CHANGED",

    // Fired when the target bot confirms a change via embed
    BOT_EMBED_RECEIVED = "SOCIALIZE_BOT_EMBED_RECEIVED",

    // Fired before a command is sent by the action queue
    ACTION_EXECUTED = "SOCIALIZE_ACTION_EXECUTED",

    // Fired when a command is added to the action queue
    ACTION_QUEUED = "SOCIALIZE_ACTION_QUEUED",

    // Fired when our local user joins or leaves a managed channel
    LOCAL_USER_JOINED_MANAGED_CHANNEL = "SOCIALIZE_LOCAL_USER_JOINED_MANAGED_CHANNEL",
    LOCAL_USER_LEFT_MANAGED_CHANNEL = "SOCIALIZE_LOCAL_USER_LEFT_MANAGED_CHANNEL",

    // Fired when a different user joins our owned channel
    USER_JOINED_OWNED_CHANNEL = "SOCIALIZE_USER_JOINED_OWNED_CHANNEL",
    USER_LEFT_OWNED_CHANNEL = "SOCIALIZE_USER_LEFT_OWNED_CHANNEL"
}

export interface EventPayloads {
    [PluginModuleEvent.CHANNEL_OWNERSHIP_CHANGED]: {
        channelId: string;
        oldOwnership: ChannelOwnership | null;
        newOwnership: ChannelOwnership | null;
    };
    [PluginModuleEvent.BOT_EMBED_RECEIVED]: {
        messageId: string;
        channelId: string;
        type: BotResponseType;
        initiatorId?: string;
        targetUserId?: string;
        embed: unknown; // Ideally Discord Embed type
    };
    [PluginModuleEvent.ACTION_EXECUTED]: {
        item: ActionQueueItem;
    };
    [PluginModuleEvent.ACTION_QUEUED]: {
        item: ActionQueueItem;
    };
    [PluginModuleEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL]: {
        channelId: string;
    };
    [PluginModuleEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL]: {
        channelId: string;
    };
    [PluginModuleEvent.USER_JOINED_OWNED_CHANNEL]: {
        channelId: string;
        userId: string;
        guildId: string;
        isAllowed?: boolean; // If true, other modules shouldn't kick/ban
        isHandled?: boolean; // If true, an action has already been taken
        reason?: string;      // Optional reason if handled/allowed
    };
    [PluginModuleEvent.USER_LEFT_OWNED_CHANNEL]: {
        channelId: string;
        userId: string;
    };
}
