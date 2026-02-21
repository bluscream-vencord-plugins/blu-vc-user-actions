import { ChannelStore, showToast, Toasts } from "@webpack/common";

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
