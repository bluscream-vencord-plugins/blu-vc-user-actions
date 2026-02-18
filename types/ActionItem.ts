export interface ActionItem {
    /** Set only when this item requires special treatment on dequeue (e.g. "INFO", "CLAIM" for priority). */
    action?: string;
    ephemeral?: string;
    external?: string;
}
