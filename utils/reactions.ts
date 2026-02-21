import { RestAPI } from "@webpack/common";
import { logger } from "./logger";
import { sendDebugMessage } from "./debug";

/**
 * Adds a reaction to a specific message in a channel.
 *
 * @param channelId The ID of the channel containing the message
 * @param messageId The ID of the message to react to
 * @param emoji The URL-encoded emoji string (e.g. "%E2%9C%85" for ✅)
 * @returns A promise that resolves to true if successful, false otherwise
 */
export async function addReaction(channelId: string, messageId: string, emoji: string): Promise<boolean> {
    try {
        await RestAPI.put({
            url: `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`
        });
        return true;
    } catch (e: any) {
        logger.error(`Failed to add reaction ${emoji} to message ${messageId}:`, e);
        sendDebugMessage(`⚠️ Failed to add reaction: ${e?.message || e?.statusText || String(e)}`, channelId);
        return false;
    }
}
