import { ActionQueueItem } from "../types/state";

import { logger } from "./logger";
import { sendDebugMessage } from "./debug";

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
            const { moduleRegistry } = require("../logic/moduleRegistry");
            const { SocializeEvent } = require("../types/events");
            moduleRegistry.dispatch(SocializeEvent.ACTION_QUEUED, { item });
        } catch (e) { }
    }

    public enqueue(command: string, channelId: string, priority: boolean = false) {
        // Auto-prioritize specific high value bot actions
        if (command.includes(" claim") || command.includes(" info")) {
            priority = true;
        }

        const item: ActionQueueItem = {
            id: Math.random().toString(36).substring(7),
            command,
            channelId,
            priority,
            timestamp: Date.now()
        };

        if (priority) {
            this.priorityQueue.push(item);
        } else {
            this.queue.push(item);
        }

        sendDebugMessage(channelId, `Enqueued command: \`${command.substring(0, 50)}${command.length > 50 ? "..." : ""}\` (Priority: ${priority})`);

        this.emitQueuedEvent(item);
        this.processQueue();
    }

    public unshift(command: string, channelId: string) {
        const item: ActionQueueItem = {
            id: Math.random().toString(36).substring(7),
            command,
            channelId,
            priority: true,
            timestamp: Date.now()
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
            const { moduleRegistry } = require("../logic/moduleRegistry");
            settings = moduleRegistry["settings"];
        } catch (e) { }

        if (settings && settings.queueEnabled === false) return; // Paused

        const delay = settings ? (settings.queueInterval * 1000) : this.delayMs;

        this.isProcessing = true;

        const item = this.priorityQueue.shift() || this.queue.shift();

        if (item && this.sendCommandCallback) {
            try {

                sendDebugMessage(item.channelId, `Executing command: \`${item.command}\``);
                const result = await this.sendCommandCallback(item.command, item.channelId);

                // If it's a message object from Discord
                if (result && result.id) {
                    item.messageId = result.id;
                }

                // Dispatch execution event for cleanup module
                try {
                    const { moduleRegistry } = require("../logic/moduleRegistry");
                    const { SocializeEvent } = require("../types/events");
                    moduleRegistry.dispatch(SocializeEvent.ACTION_EXECUTED, { item });
                } catch (e) { }

            } catch (e) {
                logger.error("Failed to execute command:", item.command, e);
            }
        }

        setTimeout(() => {
            this.isProcessing = false;
            this.processQueue();
        }, delay);
    }
}

export const actionQueue = new ActionQueue();
