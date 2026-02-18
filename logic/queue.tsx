import { OptionType } from "@utils/types";
import { sendMessage } from "@utils/discord";
import { sendBotMessage } from "@api/Commands";
import { state, actionQueue, ActionType } from "../state"; import { ActionItem } from "../types/ActionItem";
import { log } from "../utils/logging";
import { PluginModule } from "../types/PluginModule";

// #region Logic
export function queueAction(options: {
    type: ActionType;
    channelId: string;
    ephemeral?: string;
    external?: string;
    userId?: string;
    guildId?: string;
}) {
    const { type, ephemeral, external } = options;

    if (!ephemeral && !external) return;

    const item: ActionItem = {
        ephemeral,
        external
    };

    if (type === ActionType.INFO || type === ActionType.CLAIM) {
        actionQueue.unshift(item);
    } else {
        actionQueue.push(item);
    }

    processQueue();
}

export async function processQueue() {
    if (state.isProcessing || actionQueue.length === 0) return;

    const { settings } = require("../settings");
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
