import * as DataStore from "@api/DataStore";
import { ActionItem, PluginVoiceChannel, PluginGuildMember, MemberChannelInfo, OwnerEntry } from "./types";
import { log, error } from "./utils/logging";

export { ActionItem, PluginVoiceChannel, PluginGuildMember, MemberChannelInfo, OwnerEntry };

// Persistence Keys
const STORAGE_KEY_OWNERS = "SocializeGuild_Owners_v1";
const STORAGE_KEY_MEMBERS = "SocializeGuild_Members_v1";

export const channelOwners = new Map<string, PluginVoiceChannel>();
export const memberInfos = new Map<string, PluginGuildMember>(); // Map<ownerId, PluginGuildMember>

let saveTimeout: NodeJS.Timeout | null = null;

export async function saveState() {
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        try {
            const ownersObj = Object.fromEntries(
                Array.from(channelOwners.entries()).map(([k, v]) => [k, v.toJSON()])
            );
            await DataStore.set(STORAGE_KEY_OWNERS, ownersObj);
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
                channelOwners.set(k, PluginVoiceChannel.fromJSON(v as any));
            }
        }
        const members = await DataStore.get(STORAGE_KEY_MEMBERS);
        if (members) {
            for (const [k, v] of Object.entries(members)) {
                memberInfos.set(k, { id: k, channelInfo: v as MemberChannelInfo });
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
    const existing = memberInfos.get(ownerId);
    memberInfos.set(ownerId, { ...existing, id: ownerId, channelInfo: info });
    saveState();
}

export function resetState() {
    channelOwners.clear();
    memberInfos.clear();
    state.rotationIndex.clear();
    state.roleKickedUsers.clear();
    saveState();
}
