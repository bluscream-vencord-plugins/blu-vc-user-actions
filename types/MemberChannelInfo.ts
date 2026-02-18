export interface MemberChannelInfo {
    name?: string;
    limit?: number;
    status?: string;
    permitted: string[];
    banned: string[];
    timestamp: number;
    updated: number;
}
