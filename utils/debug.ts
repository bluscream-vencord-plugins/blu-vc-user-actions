import { moduleRegistry } from "../logic/moduleRegistry";
import { logger } from "./logger";
import { MessageActions } from "@webpack/common";

/**
 * Sends an ephemeral debug message to the specified channel if enableDebug setting is on.
 */
export function sendDebugMessage(channelId: string, ...args: any[]) {
    logger.debug(...args);
    const content = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
    const settings = moduleRegistry["settings"];
    if (!settings || !settings.enableDebug) return;

    try {
        // Vencord's way of sending ephemeral "bot" messages (Clyde-like)
        // Usually it's MessageActions.sendBotMessage or similar.
        // We'll use a direct call if available or find the right one.
        // Based on common.ts, MessageActions has sendMessage.
        // Often there is a dedicated ephemeral helper.
        const { sendBotMessage } = require("@api/Commands");
        if (sendBotMessage) {
            sendBotMessage(channelId, { content: `${content}` });
        }
    } catch (e) {
        console.warn("[SocializeGuild] Failed to send debug message:", e);
    }
}
