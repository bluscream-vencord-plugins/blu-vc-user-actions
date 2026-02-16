export interface OwnerEntry {
    userId: string;
    reason: string; // "Created" | "Claimed" | "Unknown"
    timestamp: number;
}
