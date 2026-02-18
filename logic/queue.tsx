import { sendMessage } from "@utils/discord";
import { sendBotMessage } from "@api/Commands";
import { state, actionQueue } from "../state";
import { ActionItem } from "../types/ActionItem";
import { log } from "../utils/logging";
import { Modules } from "..";

// #region Logic
export function queueAction(options: {
    action?: string;
    channelId: string;
    ephemeral?: string;
    external?: string;
    userId?: string;
    guildId?: string;
}) {
    const { action, ephemeral, external, channelId } = options;

    // Send ephemeral messages immediately instead of queuing
    if (ephemeral) {
        sendBotMessage(channelId, { content: ephemeral });
    }

    if (!external) return;

    const item: ActionItem = {
        channelId,
        action,
        external
    };

    // INFO and CLAIM are priority actions — jump to front of queue
    if (action === "INFO" || action === "CLAIM") {
        actionQueue.unshift(item);
    } else {
        actionQueue.push(item);
    }

    processQueue();
}

export async function processQueue() {
    if (state.isProcessing || actionQueue.length === 0) return;

    const { settings } = require("..");
    state.isProcessing = true;

    while (actionQueue.length > 0) {
        const item = actionQueue[0];
        actionQueue.shift();

        let message: any;
        if (item.external) {
            log(`Sending command/message to ${item.channelId}: ${item.external}`);

            message = await sendMessage(item.channelId, { content: item.external });
            if (settings.store.queueTime > 0) {
                await new Promise(r => setTimeout(r, settings.store.queueTime));
            }
        }

        // Let modules handle dequeued items with the resulting message
        Modules.forEach(m => m.onActionDequeue?.(item, message));
    }

    state.isProcessing = false;
}
// #endregion
