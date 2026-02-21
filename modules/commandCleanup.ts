import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { logger } from "../utils/logger";
import { ActionQueueItem } from "../types/state";
import { PluginModuleEvent } from "../types/events";
import { Message } from "@vencord/discord-types";
import { OptionType } from "@utils/types";
import { defaultSettings } from "../settings";

/**
 * Settings definitions for the CommandCleanupModule.
 */
export const commandCleanupSettings = {
    // ── Command Cleanup ───────────────────────────────────────────────────
    /** When enabled, the plugin will automatically delete your bot command messages after sending them. */
    commandCleanup: { type: OptionType.BOOLEAN, description: "Delete command messages automatically after sending", default: true, restartNeeded: false },
    /** The delay in milliseconds to wait before deleting the command message. */
    commandCleanupDelay: { type: OptionType.SLIDER, description: "Delay before deleting command (ms)", default: 1000, markers: [0, 500, 1000, 2000, 5000], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.commandCleanupDelay = Math.round(v); } },
};

export type CommandCleanupSettingsType = typeof commandCleanupSettings;

// Tracking for commands sent without immediate message ID
const executedCommands = new Map<string, Set<string>>();
let messageActionsModule: any = null;

export const CommandCleanupModule: PluginModule = {
    name: "CommandCleanupModule",
    description: "Cleans up (deletes) bot command messages sent by the plugin.",
    settingsSchema: commandCleanupSettings,
    settings: null as unknown as Record<string, any>,

    init(settings: Record<string, any>) {
        logger.info("CommandCleanupModule initializing");

        messageActionsModule = require("@webpack/common").MessageActions;

        moduleRegistry.on<PluginModuleEvent.ACTION_EXECUTED>(PluginModuleEvent.ACTION_EXECUTED, (payload) => {
            const s = moduleRegistry.settings as any;
            if (!s?.commandCleanup) return;
            const item: ActionQueueItem = payload.item;

            const cleanupDelay = s.commandCleanupDelay ?? 1000;

            if (item.messageId) {
                logger.debug(`[Cleanup] Immediate deletion enqueued for ${item.messageId} ("${item.command}") in ${cleanupDelay}ms`);
                setTimeout(() => {
                    messageActionsModule.deleteMessage(item.channelId, item.messageId);
                }, cleanupDelay);
            } else {
                // Track for later cleanup in onMessageCreate
                if (!executedCommands.has(item.channelId)) {
                    executedCommands.set(item.channelId, new Set());
                }
                const normalized = item.command.trim().toLowerCase();
                executedCommands.get(item.channelId)!.add(normalized);

                logger.debug(`[Cleanup] No ID returned. Tracking fallback for "${normalized}" in channel ${item.channelId}`);

                // Auto-expire after 30 seconds
                setTimeout(() => {
                    const set = executedCommands.get(item.channelId);
                    if (set) {
                        if (set.has(normalized)) {
                            logger.warn(`[Cleanup] Fallback for "${normalized}" expired without matching a message.`);
                        }
                        set.delete(normalized);
                        if (set.size === 0) executedCommands.delete(item.channelId);
                    }
                }, 30000);
            }
        });
    },

    onMessageCreate(message: Message) {
        const s = moduleRegistry.settings as any;
        if (!s?.commandCleanup) return;

        // Use UserStore directly to avoid potential closure issues
        const users = require("@webpack/common").UserStore;
        const currentUserId = users.getCurrentUser()?.id;
        if (message.author?.id !== currentUserId) {
            // If it starts with !v but not from us, still log for debug
            if (message.content?.trim().toLowerCase().startsWith("!v")) {
                // logger.debug(`[Cleanup] Ignored !v message from ${message.author?.username} (not current user)`);
            }
            return;
        }

        const content = (message.content ?? "").trim().toLowerCase();
        const channelId = message.channel_id;

        // Check if this command is tracked in ANY channel (Discord IDs can be inconsistent between Voice/Text)
        let matchedChannelId: string | null = null;
        for (const [trackChannelId, commands] of executedCommands.entries()) {
            if (commands.has(content)) {
                matchedChannelId = trackChannelId;
                break;
            }
        }

        if (matchedChannelId) {
            const cleanupDelay = s.commandCleanupDelay ?? 500;
            logger.debug(`[Cleanup] Fallback MATCH! Command "${content}" found. Deleting original enqueued channel ${matchedChannelId} message ${message.id} in ${cleanupDelay}ms`);

            setTimeout(() => {
                messageActionsModule.deleteMessage(channelId, message.id);
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
