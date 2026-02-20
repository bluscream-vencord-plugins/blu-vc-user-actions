import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent } from "../types/events";
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
        // Regex checking the embed title or description for "Channel Created" etc
        // Example: Update stateManager if we detect "Creator: <@id>"
        moduleRegistry.dispatch(SocializeEvent.BOT_EMBED_RECEIVED, {
            messageId: message.id,
            channelId: message.channel_id,
            embed: message.embeds?.[0]
        });
    }
};
