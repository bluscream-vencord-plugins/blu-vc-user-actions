export interface OwnerEntry {
    userId: string;
    reason: string; // "Created" | "Claimed" | "Unknown"
    timestamp: number;
}

export interface ChannelOwnership {
    first?: OwnerEntry; // The creator
    last?: OwnerEntry;  // The current/last claimant
}

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

export enum ActionType {
    KICK = 'KICK',
    BAN = 'BAN',
    UNBAN = 'UNBAN',
    CLAIM = 'CLAIM'
}

export interface ActionItem {
    type: ActionType;
    userId: string;
    channelId: string;
    guildId?: string;
}

// Persistence - Try to load from localStorage
const STORAGE_KEY_OWNERS = "SocializeGuild_Owners_v1";
const STORAGE_KEY_INFO = "SocializeGuild_Info_v1";

let loadedOwners = new Map<string, ChannelOwnership>();
try {
    const raw = localStorage.getItem(STORAGE_KEY_OWNERS);
    if (raw) {
        const parsed = JSON.parse(raw);
        loadedOwners = new Map(Object.entries(parsed));
    }
} catch (e) {
    console.error("[SocializeGuild] Failed to load owners:", e);
}

let loadedInfo = new Map<string, MemberChannelInfo>();
try {
    const raw = localStorage.getItem(STORAGE_KEY_INFO);
    if (raw) {
        const parsed = JSON.parse(raw);
        loadedInfo = new Map(Object.entries(parsed));
    }
} catch (e) {
    console.error("[SocializeGuild] Failed to load info:", e);
}


export const channelOwners = loadedOwners;
export const channelInfos = loadedInfo; // Map<channelId, MemberChannelInfo>

export const actionQueue: Array<ActionItem> = [];
export const processedUsers = new Map<string, number>();

export const state = {
    isProcessing: false,
    myLastVoiceChannelId: undefined as string | null | undefined,
    rotationIndex: new Map<string, number>(),
    rotationIntervals: new Map<string, any>(),
    lastRotationTime: new Map<string, number>(),
    onRotationSettingsChange: () => { },
};

export function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY_OWNERS, JSON.stringify(Object.fromEntries(channelOwners)));
        localStorage.setItem(STORAGE_KEY_INFO, JSON.stringify(Object.fromEntries(channelInfos)));
    } catch (e) {
        console.error("[SocializeGuild] Failed to save state:", e);
    }
}

export function setChannelInfo(channelId: string, info: MemberChannelInfo) {
    channelInfos.set(channelId, info);
    saveState();
}

export function resetState() {
    channelOwners.clear();
    channelInfos.clear();
    state.rotationIndex.clear();
    processedUsers.clear();
    saveState();
}
