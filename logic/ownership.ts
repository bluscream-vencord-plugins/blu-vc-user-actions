import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent, BotResponseType } from "../types/events";
import { stateManager } from "../utils/stateManager";
import { logger } from "../utils/logger";
import { UserStore as Users } from "@webpack/common";
import { Message, VoiceState } from "@vencord/discord-types";

export const OwnershipModule: SocializeModule = {
    name: "OwnershipModule",

    init(settings: PluginSettings) {
        logger.info("OwnershipModule initializing");
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
        // Parse messages from the BOT to determine ownership
        // Example check for channel created message
        if (message.author.id === moduleRegistry["settings"]?.botId) {
            this.parseBotEmbed(message);
        }
    },

    // Internal helpers
    handleUserJoinedChannel(userId: string, channelId: string, currentUserId?: string) {
        if (userId === currentUserId) {
            moduleRegistry.dispatch(SocializeEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL, { channelId });
        }

        // If this is an owned channel, dispatch an event
        const ownership = stateManager.getOwnership(channelId);
        if (ownership) {
            moduleRegistry.dispatch(SocializeEvent.USER_JOINED_OWNED_CHANNEL, { channelId, userId });
        }
    },

    handleUserLeftChannel(userId: string, channelId: string, currentUserId?: string) {
        if (userId === currentUserId) {
            moduleRegistry.dispatch(SocializeEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, { channelId });
        }

        const ownership = stateManager.getOwnership(channelId);
        if (ownership) {
            moduleRegistry.dispatch(SocializeEvent.USER_LEFT_OWNED_CHANNEL, { channelId, userId });

            // Check if creator or claimant left
            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                logger.info(`Owner ${userId} left channel ${channelId}`);
                // Handle ownership transfer or loss logic here
            }
        }
    },

    parseBotEmbed(message: Message) {
        const embed = message.embeds?.[0] as any;
        if (!embed) return;

        const authorName = embed.author?.name?.toLowerCase() || "";
        const title = embed.title?.toLowerCase() || "";
        const description = (embed.rawDescription || embed.description || "").toLowerCase();

        const check = (str: string) => {
            const s = str.toLowerCase();
            return authorName.includes(s) || title.includes(s) || description.includes(s);
        };

        let type = BotResponseType.UNKNOWN;
        if (check("Channel Created")) type = BotResponseType.CREATED;
        else if (check("Channel Claimed")) type = BotResponseType.CLAIMED;
        else if (check("Channel Settings") || check("Channel Info Updated")) type = BotResponseType.INFO;
        else if (description.includes("__banned__")) type = BotResponseType.BANNED;
        else if (description.includes("__unbanned__")) type = BotResponseType.UNBANNED;
        else if (description.includes("__permitted")) type = BotResponseType.PERMITTED;
        else if (description.includes("__unpermitted")) type = BotResponseType.UNPERMITTED;
        else if (description.includes("__channel size__")) type = BotResponseType.SIZE_SET;
        else if (description.includes("__locked__")) type = BotResponseType.LOCKED;
        else if (description.includes("__unlocked__")) type = BotResponseType.UNLOCKED;

        let initiatorId: string | undefined;
        let targetUserId: string | undefined;

        // Extract target user if applicable
        const targetMatch = description.match(/<@!?(\d+)>/);
        if (targetMatch) {
            targetUserId = targetMatch[1];
        }

        // 1. Mentions (Created)
        if (type === BotResponseType.CREATED) {
            const mentionedUser = message.mentions?.[0];
            if (mentionedUser) {
                initiatorId = typeof mentionedUser === "string" ? mentionedUser : (mentionedUser as any).id;
            } else {
                initiatorId = targetUserId;
            }
        }

        // 2. Icon URL (Claimed/Info)
        if (!initiatorId) {
            const iconURL = embed.author?.icon_url || embed.author?.iconURL;
            if (iconURL) {
                const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
                if (userIdFromUrl) initiatorId = userIdFromUrl;
            }
        }

        moduleRegistry.dispatch(SocializeEvent.BOT_EMBED_RECEIVED, {
            messageId: message.id,
            channelId: message.channel_id,
            type,
            initiatorId,
            targetUserId,
            embed: embed
        });
    }
};
