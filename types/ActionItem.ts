export interface ActionItem {
    /** The channel where this action should be executed (e.g. for sending external commands). */
    channelId: string;
    /** Set only when this item requires special treatment on dequeue (e.g. "INFO", "CLAIM" for priority). */
    action?: string;
    ephemeral?: string;
    external?: string;
}
