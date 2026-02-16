export interface MemberChannelInfo {
    name?: string;
    limit?: number;
    status?: string;
    permitted: string[];
    banned: string[];
    timestamp: number;
    updated: number;
    ownerId?: string; // Captured from "Channel Settings" embed author icon if available
}
