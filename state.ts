export interface ChannelOwner {
    userId: string;
    reason: string;
    timestamp: number;
    updated: number;
}

export interface ChannelInfo {
    name?: string;
    limit?: number;
    status?: string;
    permitted: string[];
    banned: string[];
    timestamp: number;
    updated: number;
}

export const channelOwners = new Map<string, ChannelOwner>();
export const actionQueue: Array<{ userId: string; channelId: string; guildId?: string }> = [];
export const processedUsers = new Map<string, number>();

export const state = {
    isProcessing: false,
    myLastVoiceChannelId: undefined as string | null | undefined,
    rotationIndex: new Map<string, number>(),
    rotationIntervals: new Map<string, any>(),
    onRotationSettingsChange: () => { },
    channelInfo: null as ChannelInfo | null,
};

export function setChannelInfo(info: ChannelInfo | null) {
    state.channelInfo = info;
}
