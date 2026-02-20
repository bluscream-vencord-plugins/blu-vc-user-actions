import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent, BotResponseType } from "../types/events";
import { ChannelOwnership, MemberChannelInfo, PluginState } from "../types/state";
import { stateManager } from "../utils/stateManager";
import { logger } from "../utils/logger";
import { UserStore as Users } from "@webpack/common";
import { Message, VoiceState } from "@vencord/discord-types";
import { BotResponse } from "../utils/BotResponse";
import { parseBotInfoMessage } from "../utils/parsing";
import { actionQueue } from "../utils/actionQueue";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import { GuildChannelStore, ChannelStore, GuildStore } from "@webpack/common";
import { NamingModule } from "./naming";

export const OwnershipModule: SocializeModule = {
    name: "OwnershipModule",

    init(settings: PluginSettings) {
        logger.info("OwnershipModule initializing");
    },

    async fetchAllOwners() {
        const settings = moduleRegistry["settings"];
        if (!settings) return;

        const channels = GuildChannelStore.getChannels(settings.guildId);
        if (!channels || !channels.SELECTABLE) return;

        const targetChannels = channels.SELECTABLE.filter(({ channel }) => channel.parent_id === settings.categoryId);
        logger.info(`Batch fetching owners for ${targetChannels.length} channels...`);

        for (const { channel } of targetChannels) {
            this.requestChannelInfo(channel.id);
            await new Promise(r => setTimeout(r, 500));
        }
    },

    requestChannelInfo(channelId: string) {
        const settings = moduleRegistry["settings"];
        if (!settings) return;
        const msg = formatCommand(settings.infoCommand, channelId);
        actionQueue.enqueue(msg, channelId, false);
    },

    stop() {
        logger.info("OwnershipModule stopping");
    },

    onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        // Here we track when users join/leave the creation channel or owned channels
        // Since we don't have exact Vencord types right now, we use Any
        const currentUserId = Users.getCurrentUser()?.id;

        // Check if a user joined or left a voice channel
        if (oldState.channelId !== newState.channelId) {
            if (newState.channelId) {
                // User Joined a channel
                this.handleUserJoinedChannel(newState.userId, newState.channelId, currentUserId);
            }

            if (oldState.channelId) {
                // User Left a channel
                this.handleUserLeftChannel(oldState.userId, oldState.channelId, currentUserId);
            }
        }
    },

    onMessageCreate(message: Message) {
        const settings = moduleRegistry["settings"];
        if (!settings || message.author.id !== settings.botId) return;

        const response = new BotResponse(message, settings.botId);
        if (response.type === BotResponseType.UNKNOWN) return;

        sendDebugMessage(message.channel_id, `Received Bot Response: **${response.type}** from <@${response.initiatorId || "Unknown"}>`);

        // Dispatch general event
        moduleRegistry.dispatch(SocializeEvent.BOT_EMBED_RECEIVED, {
            messageId: message.id,
            channelId: message.channel_id,
            type: response.type,
            initiatorId: response.initiatorId,
            embed: response.embed
        });

        // Specific handling for Ownership
        if (response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED)) {
            const isCreator = response.type === BotResponseType.CREATED;
            const channelId = response.channelId;
            const userId = response.initiatorId;

            const oldOwnership = stateManager.getOwnership(channelId);
            const newOwnership = {
                channelId: channelId,
                creatorId: isCreator ? userId : null,
                claimantId: !isCreator ? userId : null,
                createdAt: isCreator ? response.timestamp : null,
                claimedAt: !isCreator ? response.timestamp : null
            };

            stateManager.setOwnership(channelId, newOwnership);
            this.handleOwnershipUpdate(channelId, userId, isCreator ? "creator" : "claimant", oldOwnership, newOwnership);
        }

        // Handle Info synchronization
        if (response.type === BotResponseType.INFO) {
            const result = parseBotInfoMessage(response);
            if (result && result.info.userId) {
                stateManager.updateMemberConfig(result.info.userId, result.info);
                sendDebugMessage(message.channel_id, `Synchronized info for user ${result.info.userId} via bot embed`);
            }
        }

        // Handle other updates (Bans, Locks, etc.)
        if (response.initiatorId) {
            const userId = response.initiatorId;
            const description = response.getRawDescription().toLowerCase();
            const targetMatch = description.match(/<@!?(\d+)>/);
            const targetUserId = targetMatch ? targetMatch[1] : undefined;

            switch (response.type) {
                case BotResponseType.BANNED:
                    if (targetUserId) {
                        const config = stateManager.getMemberConfig(userId);
                        if (!config.bannedUsers.includes(targetUserId)) {
                            config.bannedUsers.push(targetUserId);
                            stateManager.updateMemberConfig(userId, { bannedUsers: config.bannedUsers });
                        }
                    }
                    break;
                case BotResponseType.UNBANNED:
                    if (targetUserId) {
                        const config = stateManager.getMemberConfig(userId);
                        const filtered = config.bannedUsers.filter(id => id !== targetUserId);
                        if (filtered.length !== config.bannedUsers.length) {
                            stateManager.updateMemberConfig(userId, { bannedUsers: filtered });
                        }
                    }
                    break;
                case BotResponseType.PERMITTED:
                    if (targetUserId) {
                        const config = stateManager.getMemberConfig(userId);
                        if (!config.permittedUsers.includes(targetUserId)) {
                            config.permittedUsers.push(targetUserId);
                            stateManager.updateMemberConfig(userId, { permittedUsers: config.permittedUsers });
                        }
                    }
                    break;
                case BotResponseType.UNPERMITTED:
                    if (targetUserId) {
                        const config = stateManager.getMemberConfig(userId);
                        const filtered = config.permittedUsers.filter(id => id !== targetUserId);
                        if (filtered.length !== config.permittedUsers.length) {
                            stateManager.updateMemberConfig(userId, { permittedUsers: filtered });
                        }
                    }
                    break;
                case BotResponseType.SIZE_SET:
                    const sizeMatch = description.match(/(\d+)/);
                    if (sizeMatch) {
                        stateManager.updateMemberConfig(userId, { userLimit: parseInt(sizeMatch[1]) });
                    }
                    break;
                case BotResponseType.LOCKED:
                    stateManager.updateMemberConfig(userId, { isLocked: true });
                    break;
                case BotResponseType.UNLOCKED:
                    stateManager.updateMemberConfig(userId, { isLocked: false });
                    break;
            }
        }
    },

    // Internal helpers
    handleOwnershipUpdate(channelId: string, ownerId: string, type: "creator" | "claimant", oldOwnership: ChannelOwnership | null, newOwnership: ChannelOwnership | null) {
        const meId = Users.getCurrentUser()?.id;

        // Notify others if configured
        this.notifyOwnership(channelId, ownerId, type);

        sendDebugMessage(channelId, `Conflict Resolution: **${ownerId === meId ? "We" : "User"}** (${ownerId}) recognized as ${type}`);

        // Dispatch typed event for other modules
        moduleRegistry.dispatch(SocializeEvent.CHANNEL_OWNERSHIP_CHANGED, { channelId, oldOwnership, newOwnership });

        // Manage naming rotation
        if (ownerId === meId) {
            NamingModule.startRotation(channelId);
        } else {
            NamingModule.stopRotation(channelId);
        }
    },

    notifyOwnership(channelId: string, ownerId: string, type: string) {
        const settings = moduleRegistry["settings"];
        if (!settings) return;

        const channel = ChannelStore.getChannel(channelId);
        const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
        const owner = Users.getUser(ownerId);
        const ownerName = owner?.globalName || owner?.username || ownerId;

        const formatted = settings.ownershipChangeMessage
            .replace(/{reason}/g, type === "creator" ? "Created" : "Claimed")
            .replace(/{channel_id}/g, channelId)
            .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
            .replace(/{guild_id}/g, channel?.guild_id || "")
            .replace(/{guild_name}/g, guild?.name || "Unknown Guild")
            .replace(/{user_id}/g, ownerId)
            .replace(/{user_name}/g, ownerName);

        // We use the action queue to send the notification to avoid race conditions with bot info requests
        actionQueue.enqueue(formatted, channelId, true);
    },

    handleUserJoinedChannel(userId: string, channelId: string, currentUserId?: string) {
        if (userId === currentUserId) {
            sendDebugMessage(channelId, `You joined managed channel <#${channelId}>`);
            moduleRegistry.dispatch(SocializeEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL, { channelId });

            // Check if we are the owner, if so restart naming rotation
            const ownership = stateManager.getOwnership(channelId);
            if (ownership && (ownership.creatorId === userId || ownership.claimantId === userId)) {
                NamingModule.startRotation(channelId);
            }
        }

        // If this is an owned channel, dispatch an event
        const ownership = stateManager.getOwnership(channelId);
        if (ownership) {
            sendDebugMessage(channelId, `User Joined Owned Channel: <@${userId}> (Owner: <@${ownership.creatorId || ownership.claimantId}>)`);
            moduleRegistry.dispatch(SocializeEvent.USER_JOINED_OWNED_CHANNEL, { channelId, userId });
        }
    },

    handleUserLeftChannel(userId: string, channelId: string, currentUserId?: string) {
        if (userId === currentUserId) {
            moduleRegistry.dispatch(SocializeEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, { channelId });
            NamingModule.stopRotation(channelId);
        }

        const ownership = stateManager.getOwnership(channelId);
        if (ownership) {
            moduleRegistry.dispatch(SocializeEvent.USER_LEFT_OWNED_CHANNEL, { channelId, userId });

            // Check if creator or claimant left
            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                sendDebugMessage(channelId, `Owner ${userId} left channel ${channelId}`);

                // If the owner left and it was us, stop rotation
                if (userId === currentUserId) {
                    NamingModule.stopRotation(channelId);
                }
            }
        }
    },


};
