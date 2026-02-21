import { ActionQueueItem } from "../types/state";

import { logger } from "./logger";
import { sendDebugMessage } from "./debug";
import { sendExternalMessage } from "./messaging";
import { OptionType } from "@utils/types";
import { defaultSettings } from "../settings"; // Temporary cross import until fully decoupled

export const actionQueueSettings = {
    queueEnabled: { type: OptionType.BOOLEAN, description: "Enable Action Queue", default: true, restartNeeded: false },
    queueInterval: { type: OptionType.SLIDER, description: "Action Queue Interval (seconds)", default: 2, markers: [1, 2, 5, 10], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.queueInterval = Math.round(v); } },
};

export type ActionQueueSettingsType = typeof actionQueueSettings;

// Simple Action Queue
export class ActionQueue {
    private queue: ActionQueueItem[] = [];
    private priorityQueue: ActionQueueItem[] = [];
    private isProcessing: boolean = false;
    private delayMs: number = 2000;

    // Injected dependency to actually send commands
    private sendCommandCallback: ((command: string, channelId: string) => Promise<any>) | null = null;

    public setDelay(ms: number) {
        this.delayMs = ms;
    }

    public setCommandSender(callback: (command: string, channelId: string) => Promise<any>) {
        this.sendCommandCallback = callback;
    }

    private emitQueuedEvent(item: ActionQueueItem) {
        try {
            const { moduleRegistry } = require("../utils/moduleRegistry");
            const { PluginModuleEvent } = require("../types/events");
            moduleRegistry.dispatch(PluginModuleEvent.ACTION_QUEUED, { item });
        } catch (e) { }
    }

    public enqueue(command: string, channelId: string, priority: boolean = false, executeCondition?: () => boolean) {
        // Auto-prioritize specific high value bot actions
        if (command.includes(" claim") || command.includes(" info")) {
            priority = true;
        }

        const item: ActionQueueItem = {
            id: Math.random().toString(36).substring(7),
            command,
            channelId,
            priority,
            timestamp: Date.now(),
            executeCondition
        };

        if (priority) {
            this.priorityQueue.push(item);
        } else {
            this.queue.push(item);
        }

        sendDebugMessage(`Enqueued command: \`${command.substring(0, 50)}${command.length > 50 ? "..." : ""}\` (Priority: ${priority})`, channelId);

        this.emitQueuedEvent(item);
        this.processQueue();
    }

    public unshift(command: string, channelId: string, executeCondition?: () => boolean) {
        const item: ActionQueueItem = {
            id: Math.random().toString(36).substring(7),
            command,
            channelId,
            priority: true,
            timestamp: Date.now(),
            executeCondition
        };

        // Push directly to front of priority queue
        this.priorityQueue.unshift(item);
        this.emitQueuedEvent(item);
        this.processQueue();
    }

    public clear() {
        this.queue = [];
        this.priorityQueue = [];
    }

    private async processQueue() {
        if (this.isProcessing) return;
        if (this.queue.length === 0 && this.priorityQueue.length === 0) return;

        let settings;
        try {
            const { moduleRegistry } = require("../utils/moduleRegistry");
            settings = moduleRegistry["settings"];
        } catch (e) { }

        if (settings && settings.queueEnabled === false) {
            logger.debug("actionQueue paused via settings.");
            return; // Paused
        }

        const delay = settings && typeof settings.queueInterval === "number" ?
            (settings.queueInterval * 1000) : this.delayMs;

        this.isProcessing = true;

        const item = this.priorityQueue.shift() || this.queue.shift();

        if (item) {
            if (item.executeCondition && !item.executeCondition()) {
                sendDebugMessage(`Pre-flight condition failed for \`${item.command}\`. Skipping.`, item.channelId);
                this.isProcessing = false;
                this.processQueue();
                return;
            }

            if (!this.sendCommandCallback) {
                logger.error("actionQueue error: sendCommandCallback is null. Queue will process but messages won't send.");
                sendDebugMessage(`actionQueue Error: sendCommandCallback is null for \`${item.command}\``, item.channelId);
            } else {
                try {
                    sendDebugMessage(`Executing command: \`${item.command}\``, item.channelId);

                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("Timeout after 10s waiting for sendCommandCallback")), 10000)
                    );

                    const result = await Promise.race([
                        this.sendCommandCallback(item.command, item.channelId),
                        timeoutPromise
                    ]);

                    // If it's a message object from Discord
                    let messageId = result?.id || result?.message?.id || result?.body?.id;

                    // Fallback for wrapped responses where body might not have been fully parsed or is deeply nested
                    if (!messageId && typeof result?.text === "string") {
                        try {
                            const parsed = JSON.parse(result.text);
                            messageId = parsed?.id;
                        } catch (e) { /* ignore */ }
                    }

                    if (messageId) {
                        item.messageId = messageId;
                        logger.debug(`Command execution result has messageId: ${item.messageId}`);
                    } else if (result) {
                        const keys = Object.keys(result).join(", ");
                        const bodyKeys = result.body ? Object.keys(result.body).join(", ") : "N/A";
                        logger.warn(`Command execution result for "${item.command}" lacks messageId. Keys: [${keys}]. BodyKeys: [${bodyKeys}]`);
                    } else {
                        logger.warn(`Command execution result for "${item.command}" is null/undefined.`);
                    }

                    // Dispatch execution event for cleanup module
                    try {
                        const { moduleRegistry: registry } = require("../utils/moduleRegistry");
                        const { PluginModuleEvent: events } = require("../types/events");
                        registry.dispatch(events.ACTION_EXECUTED, { item });
                    } catch (e) {
                        logger.error("Failed to dispatch ACTION_EXECUTED:", e);
                    }

                } catch (e) {
                    logger.error("Failed to execute command:", item.command, e);
                }
            }
        }

        setTimeout(() => {
            this.isProcessing = false;
            this.processQueue();
        }, delay);
    }
}

export const actionQueue = new ActionQueue();
