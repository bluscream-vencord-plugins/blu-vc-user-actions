import { ActionQueueItem } from "../types/state";

import { logger } from "./logger";

// Simple Action Queue
export class ActionQueue {
    private queue: ActionQueueItem[] = [];
    private priorityQueue: ActionQueueItem[] = [];
    private isProcessing: boolean = false;
    private delayMs: number = 2000;

    // Injected dependency to actually send commands
    private sendCommandCallback: ((command: string, channelId: string) => Promise<void>) | null = null;

    public setDelay(ms: number) {
        this.delayMs = ms;
    }

    public setCommandSender(callback: (command: string, channelId: string) => Promise<void>) {
        this.sendCommandCallback = callback;
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
        this.processQueue();
    }

    public clear() {
        this.queue = [];
        this.priorityQueue = [];
    }

    private async processQueue() {
        if (this.isProcessing) return;
        if (this.queue.length === 0 && this.priorityQueue.length === 0) return;

        this.isProcessing = true;

        const item = this.priorityQueue.shift() || this.queue.shift();

        if (item && this.sendCommandCallback) {
            try {
                logger.debug("Executing queued command:", item.command);
                await this.sendCommandCallback(item.command, item.channelId);
            } catch (e) {
                logger.error("Failed to execute command:", item.command, e);
            }
        }

        setTimeout(() => {
            this.isProcessing = false;
            this.processQueue();
        }, this.delayMs);
    }
}

export const actionQueue = new ActionQueue();
