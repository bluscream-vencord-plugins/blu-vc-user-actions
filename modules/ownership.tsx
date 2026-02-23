import { PluginModule } from "../types/module";
import { moduleRegistry } from "../core/moduleRegistry";
import { CoreEvent, BotResponseType } from "../types/events";
import { ChannelOwnership } from "../types/state";
import { stateManager } from "../utils/state";
import { logger } from "../utils/logger";
import { Message, VoiceState, Channel, User, Guild, ChannelWithComparator, ThreadJoined } from "@vencord/discord-types";
import { BotResponse } from "../types/BotResponse";
import { parseBotInfoMessage, parseMultiUserIds } from "../utils/parsing";
import { actionQueue } from "../core/actionQueue";
import { formatCommand, formatMessageCommon } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import { sendEphemeralMessage } from "../utils/messaging";
import { isVoiceChannel, isUserInVoiceChannel } from "../utils/channels";
import {
    GuildChannelStore, ChannelStore,
    SelectedChannelStore, UserStore as Users,
    VoiceStateStore, ChannelActions,
    ChannelRouter,
    Menu, React, showToast
} from "@webpack/common";
import { openSettings, getNewLineList } from "../utils/settings";
import { ApplicationCommandOptionType, ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { OptionType } from "@utils/types";
import { pluginInfo } from "../info";

/**
 * Settings definitions for the OwnershipModule.
 */
export const ownershipSettings = {
    // ── Channel Claiming / Ownership ──────────────────────────────────────
    /** The message template used when a voice channel is successfully claimed. */
    ownershipChangeMessage: { type: OptionType.STRING, description: "Message sent when ownership changes (supports {reason}, {channel_id}, {channel_name}, {guild_id}, {guild_name}, {user_id}, {user_name})", default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})", restartNeeded: false },

    // ── Commands ──────────────────────────────────────────────────────────
    /** Command template to claim a channel. */
    claimCommand: { type: OptionType.STRING, description: "Claim Channel Command", default: "!v claim", restartNeeded: false },
    /** Command template to lock a channel. */
    lockCommand: { type: OptionType.STRING, description: "Lock Channel Command", default: "!v lock", restartNeeded: false },
    /** Command template to unlock a channel. */
    unlockCommand: { type: OptionType.STRING, description: "Unlock Channel Command", default: "!v unlock", restartNeeded: false },
    /** Command template to reset a channel's settings. */
    resetCommand: { type: OptionType.STRING, description: "Reset Channel Command", default: "!v name \"\" | !v limit 0 | !v unlock", restartNeeded: false },
    /** Command template to request channel info from the bot. */
    infoCommand: { type: OptionType.STRING, description: "Get Channel Info Command", default: "!v info", restartNeeded: false },
    /** Command template to kick a user. */
    kickCommand: { type: OptionType.STRING, description: "Kick Command Template (use {user_id})", default: "!v kick {user_id}", restartNeeded: false },
    /** Command template to set a channel's user limit. */
    setSizeCommand: { type: OptionType.STRING, description: "Set Channel Size Command Template (use {size})", default: "!v limit {size}", restartNeeded: false },
    /** Command template to rename a voice channel. */
    setChannelNameCommand: { type: OptionType.STRING, description: "Set Channel Name Command Template (use {name})", default: "!v name {name}", restartNeeded: false },

    // ── Ephermal Author Settings ──────────────────────────────────────────────────
    /** Displayed author name for local-only (ephemeral) plugin messages. Supports {username}, {displayname}, {userid}. */
    ephemeralAuthorName: { type: OptionType.STRING, description: "Author name for bot messages (displayed as the sender). Variables: {username}=username, {displayname}=display name, {userid}=user ID", default: "Socialize Voice [!]", placeholder: "Clyde or {username}", restartNeeded: false, },
    /** Author icon URL for ephemeral plugin messages. Supports {avatar}. */
    ephemeralAuthorIconUrl: { type: OptionType.STRING, description: "Author icon URL for bot messages (leave empty for default). Variables: {username}=username, {displayname}=display name, {userid}=user ID, {avatar}=avatar URL", default: "https://cdn.discordapp.com/avatars/913852862990262282/6cef25d3cdfad395b26e32260da0b320.webp?size=1024", placeholder: "https://example.com/avatar.png or {avatar}", restartNeeded: false, },
};

export type OwnershipSettingsType = typeof ownershipSettings;

function getSettings() {
    return moduleRegistry.settings as any;
}

/**
 * A central collection of actions for managing channel ownership and settings.
 * These actions bridge UI interactions and bot command execution.
 */
export const OwnershipActions = {
    syncInfo(channelId: string) {
        OwnershipModule.requestChannelInfo(channelId);
    },
    claimChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.claimCommand, channelId), channelId, true);
    },
    lockChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.lockCommand, channelId), channelId, true);
    },
    unlockChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.unlockCommand, channelId), channelId, true);
    },
    resetChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.resetCommand, channelId), channelId);
    },
    setChannelSize(channelId: string, size: number) {
        const s = getSettings();
        if (!s) return;
        const sizeCmd = formatCommand(s.setSizeCommand || "!v size {size}", channelId)
            .replace(/{size}/g, String(size))
            .replace(/{channel_limit}/g, String(size));
        actionQueue.enqueue(sizeCmd, channelId, false);
    },
    renameChannel(channelId: string, newName: string) {
        const s = getSettings();
        if (!s) return;
        actionQueue.enqueue(
            formatCommand(s.setChannelNameCommand || "!v name {name}", channelId, { name: newName }),
            channelId,
            true
        );
    },
    kickUsers(channelId: string, userIds: string[]) {
        const s = getSettings();
        if (!s) return;
        userIds.forEach(userId => {
            actionQueue.enqueue(
                formatCommand(s.kickCommand, channelId, { userId }),
                channelId,
                false,
                () => isUserInVoiceChannel(userId, channelId)
            );
        });
    },
    kickBannedUsers(channelId: string): number {
        const meId = Users.getCurrentUser()?.id || "";
        const states = VoiceStateStore.getVoiceStatesForChannel(channelId);
        if (!stateManager.hasMemberConfig(meId)) {
            return -1;
        }
        const config = stateManager.getMemberConfig(meId);
        const bannedUsersInChannel = Object.keys(states).filter(uid => config.bannedUsers.includes(uid));
        if (bannedUsersInChannel.length > 0) {
            this.kickUsers(channelId, bannedUsersInChannel);
        }
        return bannedUsersInChannel.length;
    },
    createChannel() {
        const settings = getSettings();
        if (settings?.creationChannelId) {
            ChannelActions?.selectVoiceChannel(settings.creationChannelId);
        } else {
            showToast("No creation channel ID configured.");
        }
    },
    findOrCreateChannel(create = true) {
        const settings = getSettings();
        if (!settings) return;

        const meId = Users.getCurrentUser()?.id;
        if (!meId) {
            this.createChannel();
            return;
        }

        let targetChannelId: string | undefined;

        // 1. Check if the last channel we are cached creator in still exists
        const ownerships = stateManager.getAllActiveOwnerships();
        const myOwnedChannels = Object.keys(ownerships).filter(
            id => ownerships[id].creatorId === meId || ownerships[id].claimantId === meId
        ).sort((a, b) => {
            const timeA = Math.max(ownerships[a].createdAt || 0, ownerships[a].claimedAt || 0);
            const timeB = Math.max(ownerships[b].createdAt || 0, ownerships[b].claimedAt || 0);
            return timeB - timeA; // Descending, newest first
        });

        for (const id of myOwnedChannels) {
            const channel = ChannelStore.getChannel(id);
            if (channel && channel.parent_id === settings.categoryId) {
                targetChannelId = id;
                logger.info(`findOrCreateChannel: Found existing owned channel ${id}`);
                break;
            }
        }

        const guildChannels = GuildChannelStore.getChannels(settings.guildId);
        let matchedChannel: ChannelWithComparator | ThreadJoined | undefined;

        // 2. Search for any channel that matches the channel name in our cached memberchannelinfo object
        if (!targetChannelId && stateManager.hasMemberConfig(meId)) {
            const config = stateManager.getMemberConfig(meId);
            if (config.customName && guildChannels?.SELECTABLE) {
                matchedChannel = guildChannels.SELECTABLE.find(({ channel }) =>
                    channel.parent_id === settings.categoryId &&
                    channel.name === config.customName
                );
                if (matchedChannel) {
                    targetChannelId = matchedChannel.channel.id;
                    logger.info(`findOrCreateChannel: Found channel matching custom name ${targetChannelId}`);
                }
            }
        }

        // 3. Search for any channels with names in our channel name rotation
        if (!targetChannelId && guildChannels?.SELECTABLE && settings.channelNameRotationNames) {
            const nameList = getNewLineList(settings.channelNameRotationNames);
            if (nameList.length > 0) {
                matchedChannel = guildChannels.SELECTABLE.find(({ channel }) =>
                    channel.parent_id === settings.categoryId &&
                    nameList.includes(channel.name)
                );
                if (matchedChannel) {
                    targetChannelId = matchedChannel.channel.id;
                    logger.info(`findOrCreateChannel: Found channel matching rotation name ${targetChannelId}`);
                }
            }
        }
        const channelName = matchedChannel ? matchedChannel.channel.name : targetChannelId;

        if (targetChannelId) {
            showToast(`Joining channel ${channelName}`);
            ChannelActions?.selectVoiceChannel(targetChannelId);
            // Wait 2 seconds before focusing the text chat
            setTimeout(() => {
                ChannelRouter?.transitionToChannel(targetChannelId);
            }, 2000);
        } else if (create) {
            logger.info("findOrCreateChannel: No existing channel found, creating a new one.");
            showToast("No channel found, creating one");
            this.createChannel();
        } else {
            logger.info("findOrCreateChannel: No existing channel found, not creating a new one.");
            showToast("No existing channel found");
        }
    },
    resetState() {
        stateManager.resetState();
        showToast("Plugin state has been reset.");
    },
};

export const ownershipCommands = [
    {
        name: `${pluginInfo.commandName} sync`,
        description: "Force manual sync of channel info and ownership",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry.settings;
            if (!settings || !ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Plugin not initialized." });
            }
            OwnershipActions.syncInfo(ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: "Information sync requested." });
        }
    },
    {
        name: `${pluginInfo.commandName} claim`,
        description: "Claim the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }
            OwnershipActions.claimChannel(ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: "Claim requested." });
        }
    },
    {
        name: `${pluginInfo.commandName} lock`,
        description: "Lock the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }
            OwnershipActions.lockChannel(ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: "Lock requested." });
        }
    },
    {
        name: `${pluginInfo.commandName} unlock`,
        description: "Unlock the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }
            OwnershipActions.unlockChannel(ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: "Unlock requested." });
        }
    },
    {
        name: `${pluginInfo.commandName} reset`,
        description: "Reset the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }
            OwnershipActions.resetChannel(ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: "Reset requested." });
        }
    },
    {
        name: `${pluginInfo.commandName} rename`,
        description: "Rename the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "name",
                description: "The new name for the channel",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }
            const newName = args.find(a => a.name === "name")?.value;
            if (!newName) {
                return sendBotMessage(ctx.channel.id, { content: "Missing name parameter." });
            }

            OwnershipActions.renameChannel(ctx.channel.id, newName);
            return sendBotMessage(ctx.channel.id, { content: `Rename to "${newName}" requested.` });
        }
    },
    {
        name: `${pluginInfo.commandName} limit`,
        description: "Set the user limit for the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "size",
                description: "The new user limit (0 for unlimited)",
                type: ApplicationCommandOptionType.INTEGER,
                required: true,
                min_value: 0,
                max_value: 99
            }
        ],
        execute: (args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }
            const size = args.find(a => a.name === "size")?.value;
            if (typeof size !== 'number') {
                return sendBotMessage(ctx.channel.id, { content: "Missing or invalid size parameter." });
            }

            OwnershipActions.setChannelSize(ctx.channel.id, size);
            return sendBotMessage(ctx.channel.id, { content: `User limit change to ${size} requested.` });
        }
    },
    {
        name: `${pluginInfo.commandName} kick`,
        description: "Kick a user from the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "users",
                description: "The user(s) to kick (comma-separated IDs or mentions)",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const input = args.find(a => a.name === "users")?.value;
            if (!input || !ctx.channel) return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
            const userIds = parseMultiUserIds(input);
            OwnershipActions.kickUsers(ctx.channel.id, userIds);
            return sendBotMessage(ctx.channel.id, { content: `Kick requested for ${userIds.length} user(s).` });
        }
    },
    {
        name: `${pluginInfo.commandName} kick-banned`,
        description: "Kick all locally banned users from the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }

            const n = OwnershipActions.kickBannedUsers(ctx.channel.id);
            let content = "";
            if (n === -1) {
                content = "No personal ban list found for this channel.";
            } else {
                content = n > 0 ? `Kicked ${n} banned user(s).` : "No banned users found in your channel.";
            }
            return sendBotMessage(ctx.channel.id, { content });
        }
    },
    {
        name: `${pluginInfo.commandName} reset-state`,
        description: "Emergency reset of SocializeGuild internal state",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipActions.resetState();
            return sendBotMessage(ctx.channel.id, { content: "Plugin state reset requested." });
        }
    },
    {
        name: `${pluginInfo.commandName} create`,
        description: "Join the creation channel to create a new managed voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipActions.createChannel();
            return sendBotMessage(ctx.channel.id, { content: "Channel creation requested." });
        }
    },
    {
        name: `${pluginInfo.commandName} find`,
        description: "Find an existing owned channel or create a new one",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipActions.findOrCreateChannel(false);
            return sendBotMessage(ctx.channel.id, { content: "Searching for or creating your channel..." });
        }
    },
    {
        name: `${pluginInfo.commandName} fetch-owners`,
        description: "Fetch all channel owners in the managed category",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipModule.fetchAllOwners();
            return sendBotMessage(ctx.channel.id, { content: "Started fetching all owners. This may take a moment." });
        }
    }
];

function getMyVoiceChannelId(): string | null {
    return SelectedChannelStore.getVoiceChannelId() ?? null;
}

function getUserDisplayName(userId: string): string {
    const u = Users.getUser(userId);
    return u?.globalName || u?.username || userId;
}

// ─────────────────────────────────────────────────────────────
// Module Export
// ─────────────────────────────────────────────────────────────

export const OwnershipModule: PluginModule = {
    name: "OwnershipModule",
    description: "The core module responsible for tracking and managing voice channel ownership.",
    requiredDependencies: ["WhitelistModule", "BansModule", "BlacklistModule", "ChannelNameRotationModule"],
    settingsSchema: ownershipSettings,
    settings: null,

    // ── Menu Item Hooks ──────────────────────────────────────

    getToolboxMenuItems(channel?: Channel) {
        return makeToolboxItems(channel);
    },

    getChannelMenuItems(channel: Channel) {
        const settings = getSettings();
        if (!settings) return null;
        if (channel.parent_id !== settings.categoryId && channel.id !== settings.creationChannelId) return null;
        if (!isVoiceChannel(channel)) return null;
        return makeChannelItems(channel);
    },

    getUserMenuItems(user: User, channel?: Channel) {
        return makeUserItems(user, channel);
    },

    getGuildMenuItems(guild: Guild) {
        const settings = getSettings();
        if (!settings || guild.id !== settings.guildId) return null;
        return makeGuildItems(guild);
    },

    // ── Lifecycle ────────────────────────────────────────────

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("OwnershipModule initializing");

        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const channelId = SelectedChannelStore.getVoiceChannelId();
        if (channelId) {
            const channel = ChannelStore.getChannel(channelId);
            if (channel && (channel.parent_id === settings.categoryId || channelId === settings.creationChannelId)) {
                this.handleUserJoinedChannel(currentUserId, channelId, currentUserId);
            }
        }
    },

    stop() {
        logger.info("OwnershipModule stopping");
    },

    // ── Logic Helpers ────────────────────────────────────────

    async fetchAllOwners() {
        const settings = getSettings();
        if (!settings) return;

        const channels = GuildChannelStore.getChannels(settings.guildId);
        if (!channels?.SELECTABLE) return;

        const targetChannels = channels.SELECTABLE.filter(({ channel }) => channel.parent_id === settings.categoryId);
        logger.info(`Batch fetching owners for ${targetChannels.length} channels...`);

        for (const { channel } of targetChannels) {
            this.requestChannelInfo(channel.id);
            await new Promise(r => setTimeout(r, 500));
        }
        logger.info("Batch fetch complete.");
    },

    requestChannelInfo(channelId: string) {
        const settings = getSettings();
        if (!settings) return;
        const msg = formatCommand(settings.infoCommand, channelId);
        actionQueue.enqueue(msg, channelId, true);
    },

    // ── Discord Event Handlers ───────────────────────────────

    onVoiceStateUpdate(oldState: any, newState: any) {
        const settings = getSettings();
        if (!settings) return;

        const currentUserId = Users.getCurrentUser()?.id;
        if (oldState.channelId !== newState.channelId) {
            if (newState.channelId) {
                const newChannel = ChannelStore.getChannel(newState.channelId);
                if (newChannel && (newChannel.parent_id === settings.categoryId || newState.channelId === settings.creationChannelId)) {
                    this.handleUserJoinedChannel(newState.userId, newState.channelId, currentUserId);
                }
            }
            if (oldState.channelId) {
                const oldChannel = ChannelStore.getChannel(oldState.channelId);
                if (oldChannel && (oldChannel.parent_id === settings.categoryId || oldState.channelId === settings.creationChannelId)) {
                    this.handleUserLeftChannel(oldState.userId, oldState.channelId, currentUserId);
                }
            }
        }
    },

    onCustomEvent(event: string, payload: any) {
        if (event === CoreEvent.BOT_EMBED_RECEIVED) {
            this.handleBotEmbed(payload);
        }
    },

    handleBotEmbed(payload: any) {
        const { messageId, channelId, type, initiatorId, targetUserId, embed } = payload;

        // Ownership handling
        if (initiatorId && (type === BotResponseType.CREATED || type === BotResponseType.CLAIMED)) {
            const isCreator = type === BotResponseType.CREATED;
            const oldOwnership = stateManager.getOwnership(channelId);
            const newOwnership: Partial<ChannelOwnership> = {
                channelId,
                ...(isCreator
                    ? { creatorId: initiatorId, createdAt: Date.now() } // Fallback to now if timestamp missing
                    : { claimantId: initiatorId, claimedAt: Date.now() })
            };

            stateManager.setOwnership(channelId, newOwnership);
            this.handleOwnershipUpdate(channelId, initiatorId, isCreator ? "creator" : "claimant", oldOwnership, stateManager.getOwnership(channelId));
        }

        // Info sync via manual parsing or delegated parse
        if (type === BotResponseType.INFO) {
            // Mocked BotResponse for parsing
            const mockResponse = { embed, initiatorId, channelId, getRawDescription: () => embed.description || "" } as any;
            const result = parseBotInfoMessage(mockResponse);
            if (result?.info.userId) {
                stateManager.updateMemberConfig(result.info.userId, result.info);
                sendDebugMessage(`Synchronized info for <@${result.info.userId}>`, channelId);
            }
        }

        // Dynamic config updates
        let userId = initiatorId;
        if (!userId) {
            const ownership = stateManager.getOwnership(channelId);
            userId = ownership?.claimantId || ownership?.creatorId || undefined;
        }

        if (userId) {
            const description = (embed.description || "").toLowerCase();
            const config = stateManager.getMemberConfig(userId);

            switch (type) {
                case BotResponseType.BANNED:
                    if (targetUserId && !config.bannedUsers.includes(targetUserId)) {
                        stateManager.updateMemberConfig(userId, { bannedUsers: [...config.bannedUsers, targetUserId] });
                    }
                    break;
                case BotResponseType.UNBANNED:
                    if (targetUserId) {
                        stateManager.updateMemberConfig(userId, { bannedUsers: config.bannedUsers.filter(id => id !== targetUserId) });
                    }
                    break;
                case BotResponseType.PERMITTED:
                    if (targetUserId && !config.permittedUsers.includes(targetUserId)) {
                        stateManager.updateMemberConfig(userId, { permittedUsers: [...config.permittedUsers, targetUserId] });
                    }
                    break;
                case BotResponseType.UNPERMITTED:
                    if (targetUserId) {
                        stateManager.updateMemberConfig(userId, { permittedUsers: config.permittedUsers.filter(id => id !== targetUserId) });
                    }
                    break;
                case BotResponseType.SIZE_SET: {
                    const sizeMatch = description.match(/(\d+)/);
                    if (sizeMatch) stateManager.updateMemberConfig(userId, { userLimit: parseInt(sizeMatch[1]) });
                    break;
                }
                case BotResponseType.LOCKED:
                    stateManager.updateMemberConfig(userId, { isLocked: true });
                    break;
                case BotResponseType.UNLOCKED:
                    stateManager.updateMemberConfig(userId, { isLocked: false });
                    break;
            }
        }
    },

    // ── Internal Helpers ─────────────────────────────────────

    handleOwnershipUpdate(channelId: string, ownerId: string, type: "creator" | "claimant", oldOwnership: ChannelOwnership | null, newOwnership: ChannelOwnership | null) {
        const meId = Users.getCurrentUser()?.id;

        this.notifyOwnership(channelId, ownerId, type);
        const debugMsg = formatMessageCommon(`Ownership: **${ownerId === meId ? "You" : `<@${ownerId}>`}** recognized as **${type}**`);
        sendDebugMessage(debugMsg, channelId);

        moduleRegistry.dispatch(CoreEvent.CHANNEL_OWNERSHIP_CHANGED, { channelId, oldOwnership, newOwnership });

        if (ownerId === meId) {
            // Dependencies handled via requiredDependencies, but we search for them globally
            const { ChannelNameRotationModule } = require("./channelNameRotation");
            ChannelNameRotationModule?.startRotation?.(channelId);
            this.requestChannelInfo(channelId);
        }
    },

    notifyOwnership(channelId: string, ownerId: string, type: string) {
        const settings = getSettings();
        if (!settings) return;

        const formatted = formatCommand(settings.ownershipChangeMessage, channelId, {
            userId: ownerId,
            reason: type === "creator" ? "Created" : "Claimed"
        });

        sendEphemeralMessage(channelId, formatted);
    },

    handleUserJoinedChannel(userId: string, channelId: string, currentUserId?: string) {
        const settings = getSettings();
        if (!settings) return;

        const ownership = stateManager.getOwnership(channelId);
        if (userId === currentUserId) {
            sendDebugMessage(`You joined managed channel <#${channelId}>`, channelId);
            moduleRegistry.dispatch(CoreEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL, { channelId });

            if (ownership) {
                if (ownership.creatorId === userId || ownership.claimantId === userId) {
                    const { ChannelNameRotationModule } = require("./channelNameRotation");
                    ChannelNameRotationModule?.startRotation?.(channelId);
                }
            } else if (channelId !== settings.creationChannelId) {
                sendDebugMessage(`Unknown channel <#${channelId}> joined. Requesting info.`, channelId);
                this.requestChannelInfo(channelId);
            }
        }

        if (ownership) {
            if (userId !== currentUserId && channelId !== getMyVoiceChannelId()) return;
            const guildId = ChannelStore.getChannel(channelId)?.guild_id || settings.guildId;
            sendDebugMessage(`<@${userId}> joined owned channel`, channelId);
            moduleRegistry.dispatch(CoreEvent.USER_JOINED_OWNED_CHANNEL, { channelId, userId, guildId });
        }
    },

    handleUserLeftChannel(userId: string, channelId: string, currentUserId?: string) {
        if (userId === currentUserId) {
            moduleRegistry.dispatch(CoreEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, { channelId });
            const { ChannelNameRotationModule } = require("./channelNameRotation");
            ChannelNameRotationModule?.stopRotation?.(channelId);
        }

        const ownership = stateManager.getOwnership(channelId);
        if (ownership) {
            if (userId !== currentUserId && channelId !== getMyVoiceChannelId()) return;
            moduleRegistry.dispatch(CoreEvent.USER_LEFT_OWNED_CHANNEL, { channelId, userId });
        }
    },
};

// ── Menu Implementation ──

function makeChannelItems(channel: Channel): React.ReactElement[] {
    const meId = Users.getCurrentUser()?.id || "";
    const ownership = stateManager.getOwnership(channel.id);
    const amOwner = ownership?.creatorId === meId || ownership?.claimantId === meId;

    const items: React.ReactElement[] = [
        <Menu.MenuItem id="socialize-claim-channel" label="Claim Channel" action={() => OwnershipActions.claimChannel(channel.id)} />,
        <Menu.MenuItem id="socialize-lock-channel" label="Lock Channel" action={() => OwnershipActions.lockChannel(channel.id)} />,
        <Menu.MenuItem id="socialize-unlock-channel" label="Unlock Channel" action={() => OwnershipActions.unlockChannel(channel.id)} />,
        <Menu.MenuItem id="socialize-reset-channel" label="Reset Channel" action={() => OwnershipActions.resetChannel(channel.id)} />,
        <Menu.MenuItem id="socialize-info-channel" label="Channel Info" action={() => OwnershipActions.syncInfo(channel.id)} />,
        <Menu.MenuItem id="socialize-set-size-submenu" label="Set Channel Size">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(size => (
                <Menu.MenuItem key={size} id={`size-${size}`} label={size === 0 ? "Unlimited" : `${size} Users`} action={() => OwnershipActions.setChannelSize(channel.id, size)} />
            ))}
        </Menu.MenuItem>,
    ];

    if (amOwner) {
        items.push(<Menu.MenuSeparator key="sep" />);
        items.push(<Menu.MenuItem id="socialize-rename-channel" label="Rename Channel" action={() => {
            // Simplified rename for now, implementation could use a prompt
            let name = prompt("Enter new channel name", channel.name);
            if (name) OwnershipActions.renameChannel(channel.id, name);
        }} />);
        items.push(<Menu.MenuItem id="socialize-kick-banned" label="Kick Banned Users" color="danger" action={() => OwnershipActions.kickBannedUsers(channel.id)} />);
    }
    return items;
}

function makeUserItems(user: User, channel?: Channel): React.ReactElement[] {
    const myChannelId = getMyVoiceChannelId();
    const amOwner = myChannelId ? isUserOwner(Users.getCurrentUser()?.id || "", myChannelId) : false;
    const items: React.ReactElement[] = [];

    if (myChannelId) {
        const o = stateManager.getOwnership(myChannelId);
        if (o?.creatorId === user.id || o?.claimantId === user.id) {
            items.push(<Menu.MenuItem id="owner-status" label={o.claimantId === user.id ? "👑 Is Claimant" : "✨ Is Creator"} disabled action={() => { }} />);
        }
    }

    if (amOwner && myChannelId) {
        items.push(<Menu.MenuItem id="kick-user" label="Kick from VC" action={() => OwnershipActions.kickUsers(myChannelId, [user.id])} />);
    }

    // Other items (whitelist, blacklist, ban) will be added by their respective modules
    return items;
}

function makeGuildItems(guild: Guild): React.ReactElement[] {
    return [
        ...makeStatusItems(getMyVoiceChannelId() || undefined, "guild"),
        <Menu.MenuSeparator key="sep" />,
        <Menu.MenuItem id="fetch-owners" label="Fetch All Owners" action={() => OwnershipModule.fetchAllOwners()} />,
        <Menu.MenuItem id="create-channel" label="Create Channel" action={() => OwnershipActions.createChannel()} />,
        <Menu.MenuItem id="open-settings" label="Open Settings" action={() => openSettings()} />,
    ];
}

function makeToolboxItems(channel?: Channel): React.ReactElement[] {
    const vcId = channel?.id || getMyVoiceChannelId() || undefined;
    return [
        ...makeStatusItems(vcId, "toolbox"),
        <Menu.MenuSeparator key="sep" />,
        <Menu.MenuItem id="toolbox-create" label="Create Channel" action={() => OwnershipActions.createChannel()} />,
        <Menu.MenuItem id="toolbox-fetch-owners" label="Fetch All Owners" action={() => OwnershipModule.fetchAllOwners()} />,
        <Menu.MenuItem id="toolbox-settings" label="Open Settings" action={() => openSettings()} />,
    ];
}

function makeStatusItems(vcId?: string, prefix = "item"): React.ReactElement[] {
    const s = getSettings();
    const o = vcId ? stateManager.getOwnership(vcId) : null;
    return [
        <Menu.MenuItem key="creator" id={`${prefix}-creator`} label={`✨ Creator: ${o?.creatorId ? getUserDisplayName(o.creatorId) : "None"}`} disabled action={() => { }} />,
        <Menu.MenuItem key="claimant" id={`${prefix}-claimant`} label={`👑 Claimant: ${o?.claimantId ? getUserDisplayName(o.claimantId) : "None"}`} disabled action={() => { }} />,
        <Menu.MenuSeparator key="sep" />,
        <Menu.MenuCheckboxItem key="queue" id={`${prefix}-queue`} label="Queue Actions" checked={!!s?.queueEnabled} action={() => { if (s) s.queueEnabled = !s.queueEnabled; }} />,
        <Menu.MenuCheckboxItem key="debug" id={`${prefix}-debug`} label="Debug Mode" checked={!!s?.enableDebug} action={() => { if (s) s.enableDebug = !s.enableDebug; }} />,
    ];
}

export function isUserOwner(userId: string, channelId: string): boolean {
    const o = stateManager.getOwnership(channelId);
    return o?.creatorId === userId || o?.claimantId === userId;
}
