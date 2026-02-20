import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { ActionQueueItem } from "../types/state";
import { SocializeEvent, EventPayloads } from "../types/events";
import { MessageStore, ChannelStore } from "@webpack/common";

export const CommandCleanupModule: SocializeModule = {
    name: "CommandCleanupModule",

    init(settings: PluginSettings) {
        logger.info("CommandCleanupModule initializing");

        const { MessageActions } = require("@webpack/common");
        moduleRegistry.on(SocializeEvent.ACTION_EXECUTED, (payload: EventPayloads[SocializeEvent.ACTION_EXECUTED]) => {
            const item: ActionQueueItem = payload.item;
            if (!settings.commandCleanup) return;

            // In Equicord/Vencord, we want to delete the command message we just sent
            // payload.message could contain the message object if returned by actionQueue
            if (payload.item.messageId) {
                MessageActions.deleteMessage(item.channelId, payload.item.messageId);
                logger.debug(`Cleaned up command message: ${item.command}`);
            }
        });
    },

    stop() {
        logger.info("CommandCleanupModule stopping");
    }
};
