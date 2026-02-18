import * as DataStore from "@api/DataStore";
import { ActionItem, ActionType, ChannelOwnership, MemberChannelInfo, OwnerEntry, ChannelOwner, ChannelCreator, ChannelClaimant } from "./types";
import { log, error } from "./utils/logging";

export { ActionItem, ActionType, ChannelOwnership, MemberChannelInfo, OwnerEntry, ChannelOwner, ChannelCreator, ChannelClaimant };

// Persistence Keys
const STORAGE_KEY_OWNERS = "SocializeGuild_Owners_v1";
const STORAGE_KEY_MEMBERS = "SocializeGuild_Members_v1";

export const channelOwners = new Map<string, ChannelOwnership>();
export const memberInfos = new Map<string, MemberChannelInfo>(); // Map<ownerId, MemberChannelInfo>

let saveTimeout: NodeJS.Timeout | null = null;

export async function saveState() {
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        try {
            await DataStore.set(STORAGE_KEY_OWNERS, Object.fromEntries(channelOwners));
            await DataStore.set(STORAGE_KEY_MEMBERS, Object.fromEntries(memberInfos));
            // log("[State] Automatically saved to DataStore");
        } catch (e) {
            error("[State] Failed to save state:", e);
        } finally {
            saveTimeout = null;
        }
    }, 2000); // 2 second debounce
}

export async function loadState() {
    try {
        const owners = await DataStore.get(STORAGE_KEY_OWNERS);
        if (owners) {
            for (const [k, v] of Object.entries(owners)) {
                channelOwners.set(k, v as ChannelOwnership);
            }
        }
        const members = await DataStore.get(STORAGE_KEY_MEMBERS);
        if (members) {
            for (const [k, v] of Object.entries(members)) {
                memberInfos.set(k, v as MemberChannelInfo);
            }
        }
        log(`[State] Loaded: ${channelOwners.size} owners, ${memberInfos.size} members`);
    } catch (e) {
        error("[State] Failed to load state:", e);
    }
}

export const actionQueue: Array<ActionItem> = [];

export const state = {
    isProcessing: false,
    myLastVoiceChannelId: undefined as string | null | undefined,
    rotationIndex: new Map<string, number>(),
    rotationIntervals: new Map<string, NodeJS.Timeout>(),
    lastRotationTime: new Map<string, number>(),
    roleKickedUsers: new Set<string>(),
    onRotationSettingsChange: () => {
        const { restartAllRotations } = require("./logic/channelName");
        restartAllRotations();
    },
    requestedInfo: new Map<string, number>(),
};

export function setMemberInfo(ownerId: string, info: MemberChannelInfo) {
    memberInfos.set(ownerId, info);
    saveState();
}

export function resetState() {
    channelOwners.clear();
    memberInfos.clear();
    state.rotationIndex.clear();
    state.roleKickedUsers.clear();
    saveState();
}
