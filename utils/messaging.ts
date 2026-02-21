import { ChannelStore, showToast, Toasts, RestAPI } from "@webpack/common";
import { logger } from "./logger";
import { sendDebugMessage } from "./debug";

/**
 * Shows a toast notification for an external message sent to a channel.
 * @param channelId The target channel ID.
 * @param content The message content.
 */
export function showExternalMessageToast(channelId: string, content: string) {
    const channel = ChannelStore.getChannel(channelId);
    const channelName = channel ? channel.name : channelId;

    // Truncate long content for the toast
    const preview = content.length > 50 ? content.substring(0, 47) + "..." : content;

    showToast(`> ${channelName}: ${preview}`, Toasts.Type.MESSAGE);
}

/**
 * Sends an external message to a channel and shows a toast notification.
 * @param channelId The target channel ID.
 * @param content The message content.
 */
export function sendExternalMessage(channelId: string, content: string) {
    showExternalMessageToast(channelId, content);

    // Use Vencord's sendMessage wrapper for robustness
    try {
        const { sendMessage } = require("@utils/discord");
        return sendMessage(channelId, { content }, true);
    } catch (e) {
        // Fallback to sendBotMessage if sendMessage is not available (rare in Vencord)
        const { sendBotMessage } = require("@api/Commands");
        return sendBotMessage(channelId, { content });
    }
}
/**
 * Sends an ephemeral (local-only) bot message to a channel.
 * @param channelId The target channel ID.
 * @param content The message content.
 */
export function sendEphemeralMessage(channelId: string, content: string, authorName?: string, authorIconUrl?: string) {
    try {
        const { sendBotMessage } = require("@api/Commands");
        const { UserStore: Users } = require("@webpack/common");
        const { moduleRegistry } = require("../utils/moduleRegistry");

        const user = Users.getCurrentUser();
        const settings = moduleRegistry.settings as any;

        let finalAuthorName = authorName || settings.ephemeralAuthorName || "Socialize Voice [!]";
        let finalAuthorIconUrl = authorIconUrl || settings.ephemeralAuthorIconUrl || "";

        if (user) {
            const replacements = {
                "{username}": user.username,
                "{displayname}": user.globalName || user.username,
                "{userid}": user.id,
                "{avatar}": user.getAvatarURL?.() || ""
            };

            for (const [key, val] of Object.entries(replacements)) {
                finalAuthorName = finalAuthorName.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), val);
                finalAuthorIconUrl = finalAuthorIconUrl.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), val);
            }
        }

        const authorConfig: { username: string, avatar_url?: string } = {
            username: finalAuthorName
        };

        if (finalAuthorIconUrl && finalAuthorIconUrl.trim()) {
            authorConfig.avatar_url = finalAuthorIconUrl.trim();
        }

        return sendBotMessage(channelId, {
            content,
            author: authorConfig
        });
    } catch (e) {
        // Fallback to toast if command API is not available
        showToast(content, Toasts.Type.MESSAGE);
    }
}

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
