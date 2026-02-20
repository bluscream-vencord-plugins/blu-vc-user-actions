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

        moduleRegistry.on(SocializeEvent.ACTION_EXECUTED, (payload: EventPayloads[SocializeEvent.ACTION_EXECUTED]) => {
            const item: ActionQueueItem = payload.item;
            if (!settings.commandCleanup) return;

            // In a real Vencord plugin, we'd delete the message sent by the user locally
            // Vencord provides `deleteMessage` through the MessageActions or similar APIs
            // It could be complicated to cleanly intercept outgoing messages without patching `sendMessage`
            // For now, it logs the intent
            logger.debug(`Intercepted action execution for command cleanup: ${item.command}`);
        });
    },

    stop() {
        logger.info("CommandCleanupModule stopping");
    }
};
