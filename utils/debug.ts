import { moduleRegistry } from "../core/moduleRegistry";
import { logger } from "./logger";
import { SelectedChannelStore } from "@webpack/common";
import { sendEphemeralMessage } from "./messaging";

/**
 * Sends an ephemeral debug message.
 * @param content The message content.
 * @param channelId Optional channel ID. Defaults to current voice channel or current text channel.
 */
export function sendDebugMessage(content: any, channelId?: string) {
    logger.debug(content);
    const settings = moduleRegistry.settings as any;
    if (!settings || !settings.enableDebug) return;

    const targetChannelId = channelId || SelectedChannelStore.getVoiceChannelId() || SelectedChannelStore.getChannelId();
    if (!targetChannelId) {
        logger.warn("sendDebugMessage: No target channel found and none provided.");
        return;
    }

    const text = typeof content === "object" ? JSON.stringify(content) : String(content);
    sendEphemeralMessage(targetChannelId, text);
}
