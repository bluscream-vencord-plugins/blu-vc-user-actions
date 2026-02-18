import { PluginModule } from "../types/PluginModule";
import { MessageActions, UserStore } from "@webpack/common";

export const CommandDeleteModule: PluginModule = {
    id: "command-delete",
    name: "Command Cleanup",
    settings: {
        commandDeleteEnabled: {
            type: 1, // OptionType.BOOLEAN
            description: "Automatically delete command messages after sending",
            default: false,
            restartNeeded: false,
        }
    },
    onActionDequeue: (item, message) => {
        const { settings } = require("..");
        if (!settings.store.commandDeleteEnabled) return;

        if (message?.id) {
            log(`[CommandDelete] Deleting dequeued message: ${message.id}`);
            MessageActions.deleteMessage(message.channel_id, message.id);
        }
    }
};

function log(msg: string) {
    const { log } = require("../utils/logging");
    log(msg);
}
