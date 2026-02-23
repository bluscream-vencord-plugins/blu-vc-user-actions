import { PluginModule } from "../types/module";
import { moduleRegistry } from "../core/moduleRegistry";
import { logger } from "../utils/logger";
import { ActionQueueItem } from "../types/state";
import { CoreEvent } from "../types/events";
import { Message } from "@vencord/discord-types";
import { OptionType } from "@utils/types";

// Track commands sent without immediate message ID
const executedCommands = new Map<string, Set<string>>();
let MessageActions: any = null;

export const commandCleanupSettings = {
    commandCleanup: { type: OptionType.BOOLEAN, description: "Delete command messages automatically after sending", default: true, restartNeeded: false },
    commandCleanupDelay: { type: OptionType.SLIDER, description: "Delay before deleting command (ms)", default: 1000, markers: [0, 500, 1000, 2000, 5000], stickToMarkers: false, restartNeeded: false },
};

export type CommandCleanupSettingsType = typeof commandCleanupSettings;

export const CommandCleanupModule: PluginModule = {
    name: "CommandCleanupModule",
    description: "Cleans up bot command messages sent by the plugin.",
    settingsSchema: commandCleanupSettings,
    settings: null,

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("CommandCleanupModule initializing");

        const common = require("@webpack/common");
        MessageActions = common.MessageActions;

        moduleRegistry.on(CoreEvent.ACTION_EXECUTED, (payload) => {
            if (!this.settings?.commandCleanup) return;
            const item: ActionQueueItem = payload.item;
            const cleanupDelay = this.settings.commandCleanupDelay ?? 1000;

            if (item.messageId) {
                setTimeout(() => {
                    MessageActions.deleteMessage(item.channelId, item.messageId);
                }, cleanupDelay);
            } else {
                if (!executedCommands.has(item.channelId)) {
                    executedCommands.set(item.channelId, new Set());
                }
                const normalized = item.command.trim().toLowerCase();
                executedCommands.get(item.channelId)!.add(normalized);

                setTimeout(() => {
                    const set = executedCommands.get(item.channelId);
                    if (set) {
                        set.delete(normalized);
                        if (set.size === 0) executedCommands.delete(item.channelId);
                    }
                }, 30000);
            }
        });
    },

    onMessageCreate(message: Message) {
        if (!this.settings?.commandCleanup) return;

        const { UserStore } = require("@webpack/common");
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (message.author?.id !== currentUserId) return;

        const content = (message.content ?? "").trim().toLowerCase();
        let matchedChannelId: string | null = null;
        for (const [trackChannelId, commands] of executedCommands.entries()) {
            if (commands.has(content)) {
                matchedChannelId = trackChannelId;
                break;
            }
        }

        if (matchedChannelId) {
            const cleanupDelay = this.settings.commandCleanupDelay ?? 500;
            setTimeout(() => {
                MessageActions.deleteMessage(message.channel_id, message.id);
            }, cleanupDelay);

            const set = executedCommands.get(matchedChannelId);
            if (set) {
                set.delete(content);
                if (set.size === 0) executedCommands.delete(matchedChannelId);
            }
        }
    },

    stop() {
        executedCommands.clear();
        logger.info("CommandCleanupModule stopping");
    }
};
