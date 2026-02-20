import { moduleRegistry } from "../logic/moduleRegistry";
import { logger } from "./logger";
import { SelectedChannelStore } from "@webpack/common";

/**
 * Sends an ephemeral debug message.
 * @param content The message content.
 * @param channelId Optional channel ID. Defaults to current voice channel or current text channel.
 */
export function sendDebugMessage(content: any, channelId?: string) {
    logger.debug(content);
    const settings = moduleRegistry["settings"];
    if (!settings || !settings.enableDebug) return;

    const targetChannelId = channelId || SelectedChannelStore.getVoiceChannelId() || SelectedChannelStore.getChannelId();
    if (!targetChannelId) {
        logger.warn("sendDebugMessage: No target channel found and none provided.");
        return;
    }

    try {
        const { sendBotMessage } = require("@api/Commands");
        if (sendBotMessage) {
            const text = typeof content === "object" ? JSON.stringify(content) : String(content);
            sendBotMessage(targetChannelId, { content: text });
        }
    } catch (e) {
        console.warn("[SocializeGuild] Failed to send debug message:", e);
    }
}
