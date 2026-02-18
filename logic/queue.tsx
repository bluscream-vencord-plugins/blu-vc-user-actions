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
    const { action, ephemeral, external } = options;

    if (!ephemeral && !external) return;

    const item: ActionItem = {
        action,
        ephemeral,
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
    const channelId = state.myLastVoiceChannelId;
    if (!channelId) {
        log("No active channel, clearing queue.");
        actionQueue.length = 0;
        return;
    }

    state.isProcessing = true;

    while (actionQueue.length > 0) {
        const item = actionQueue[0];
        actionQueue.shift();

        // Let modules handle items with special actions themselves
        if (item.action) {
            Modules.forEach(m => m.onActionDequeue?.(item));
        }

        if (item.ephemeral) {
            sendBotMessage(channelId, { content: item.ephemeral });
            await new Promise(r => setTimeout(r, 500));
        }

        if (item.external) {
            log(`Sending command/message to ${channelId}: ${item.external}`);
            sendMessage(channelId, { content: item.external });
            if (settings.store.queueTime > 0) {
                await new Promise(r => setTimeout(r, settings.store.queueTime));
            }
        }
    }

    state.isProcessing = false;
}
// #endregion
