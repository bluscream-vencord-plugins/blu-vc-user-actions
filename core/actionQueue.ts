import { logger } from "../utils/logger";
import { sendDebugMessage } from "../utils/debug";
import { CoreEvent } from "../types/events";

/**
 * Represents an item in the execution queue.
 */
export interface ActionQueueItem {
    id: string;
    /** The actual command string to send */
    command: string;
    /** The target channel ID */
    channelId: string;
    /** Whether this action should be processed with high priority */
    priority: boolean;
    /** Timestamp when it was enqueued */
    timestamp: number;
    /** Optional check performed immediately before execution */
    executeCondition?: () => boolean;
    /** The ID of the resulting message once sent */
    messageId?: string;
}

/**
 * A throttled execution queue used to send bot commands with a forced delay, preventing rate limits.
 */
export class ActionQueue {
    private queue: ActionQueueItem[] = [];
    private priorityQueue: ActionQueueItem[] = [];
    private isProcessing: boolean = false;
    private delayMs: number = 2000;

    /** Callback responsible for the actual "sending" of the command */
    private sendCommandCallback: ((command: string, channelId: string) => Promise<any>) | null = null;

    public setDelay(ms: number) {
        this.delayMs = ms;
    }

    public setCommandSender(callback: (command: string, channelId: string) => Promise<any>) {
        this.sendCommandCallback = callback;
    }

    /**
     * Enqueues a new command for sequential processing.
     */
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

        // Circular dependency handling via dynamic import if needed, but registry is usually available
        try {
            const { moduleRegistry } = require("./moduleRegistry");
            moduleRegistry.dispatch(CoreEvent.ACTION_QUEUED, { item });
        } catch (e) { }

        this.processQueue();
    }

    /**
     * Adds a command directly to the very front of the execution queue.
     */
    public unshift(command: string, channelId: string, executeCondition?: () => boolean) {
        const item: ActionQueueItem = {
            id: Math.random().toString(36).substring(7),
            command,
            channelId,
            priority: true,
            timestamp: Date.now(),
            executeCondition
        };

        this.priorityQueue.unshift(item);

        try {
            const { moduleRegistry } = require("./moduleRegistry");
            moduleRegistry.dispatch(CoreEvent.ACTION_QUEUED, { item });
        } catch (e) { }

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
            const { moduleRegistry } = require("./moduleRegistry");
            settings = moduleRegistry.settings;
        } catch (e) { }

        const delay = settings && typeof settings.queueInterval === "number" ?
            (settings.queueInterval * 1000) : this.delayMs;

        if (settings?.queueEnabled === false) {
            // If disabled, just stop processing until it's enabled again or an item is queued
            return;
        }

        this.isProcessing = true;
        const item = this.priorityQueue.shift() || this.queue.shift();

        const finalize = () => {
            setTimeout(() => {
                this.isProcessing = false;
                this.processQueue();
            }, delay);
        };

        if (!item) {
            this.isProcessing = false;
            return;
        }

        if (item.executeCondition && !item.executeCondition()) {
            sendDebugMessage(`Pre-flight condition failed for \`${item.command}\`. Skipping.`, item.channelId);
            finalize();
            return;
        }

        if (!this.sendCommandCallback) {
            logger.error("ActionQueue: No command sender set!");
            finalize();
            return;
        }

        try {
            logger.info(`ActionQueue: Executing command "${item.command}" in ${item.channelId}`);
            sendDebugMessage(`🚀 Sending command: \`${item.command}\``, item.channelId);

            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Timeout after 10s")), 10000)
            );

            const result = await Promise.race([
                this.sendCommandCallback(item.command, item.channelId),
                timeoutPromise
            ]);

            // Attempt to extract message ID
            let messageId = result?.id || result?.message?.id || result?.body?.id;
            if (messageId) {
                item.messageId = messageId;
            }

            try {
                const { moduleRegistry } = require("./moduleRegistry");
                moduleRegistry.dispatch(CoreEvent.ACTION_EXECUTED, { item });
            } catch (e) { }

            finalize();
        } catch (e) {
            logger.error("ActionQueue: Execution failed:", e);
            finalize();
        }
    }
}

export const actionQueue = new ActionQueue();
