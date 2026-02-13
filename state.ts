export interface ChannelOwner {
    userId: string;
    reason: string;
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
};
