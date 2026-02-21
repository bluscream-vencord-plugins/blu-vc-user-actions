import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent } from "../types/events";
import { logger } from "../utils/logger";
import { formatCommand } from "../utils/formatting";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { MemberLike, extractId } from "../utils/parsing";
import { getUserIdList, setNewLineList } from "../utils/settingsHelpers";
import { sendDebugMessage } from "../utils/debug";
import { sendExternalMessage, sendEphemeralMessage } from "../utils/messaging";

import { User, Channel } from "@vencord/discord-types";
import { Menu, React, UserStore as Users } from "@webpack/common";
import { sendBotMessage } from "@api/Commands";
import { OptionType } from "@utils/types";
import { defaultSettings } from "../settings";

export const whitelistSettings = {
    // ── Whitelisting (exclude from auto-actions) ──────────────────────────
    localUserWhitelist: { type: OptionType.STRING, description: "Local whitelist — user IDs to exclude from auto-actions (one per line)", default: "", multiline: true, restartNeeded: false },
    whitelistSkipMessage: { type: OptionType.STRING, description: "Message sent when skipping an action for a whitelisted user (supports {action}, {user_id}, {user_name})", default: "⚪ Whitelist: Skipping {action} for <@{user_id}> ({user_name})", restartNeeded: false },

    // ── Permitting ────────────────────────────────────────────────────────
    permitLimit: { type: OptionType.SLIDER, description: "Max users in permit list before rotation", default: 5, markers: [1, 2, 3, 4, 5, 10, 15, 20, 50], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.permitLimit = Math.round(v); } },
    permitRotateEnabled: { type: OptionType.BOOLEAN, description: "Automatically unpermit oldest entry when permit limit is reached", default: false, restartNeeded: false },
    permitRotationMessage: { type: OptionType.STRING, description: "Message sent on permit rotation (supports {user_id}, {user_id_new})", default: "♻️ Permit rotated: <@{user_id}> was unpermitted to make room for <@{user_id_new}>", restartNeeded: false },
};

export type WhitelistSettingsType = typeof whitelistSettings;

export const WhitelistModule: PluginModule = {
    name: "WhitelistModule",
    settingsSchema: whitelistSettings,
    settings: undefined as Record<string, any> | undefined,


    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("WhitelistModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            if (this.isWhitelisted(payload.userId)) {
                payload.isAllowed = true;
                payload.reason = "Whitelisted";
                sendDebugMessage(`Whitelisted user <@${payload.userId}> join: **ALLOWED**`, payload.channelId);
            }
        });
    },

    stop() {
        logger.info("WhitelistModule stopping");
    },

    // ── Whitelist helpers ──────────────────────────────────────────────────

    getWhitelist(): string[] {
        return getUserIdList(this.settings?.localUserWhitelist);
    },

    setWhitelist(newList: string[]) {
        if (!this.settings) return;
        this.settings.localUserWhitelist = setNewLineList(newList);
    },

    isWhitelisted(userId: string): boolean {
        return this.getWhitelist().includes(userId);
    },

    whitelistUser(userId: string, channelId?: string) {
        if (!this.settings || this.isWhitelisted(userId)) return;
        this.setWhitelist([...this.getWhitelist(), userId]);
        sendDebugMessage(`User <@${userId}> added to local whitelist.`, channelId);
    },

    unwhitelistUser(userId: string, channelId?: string) {
        if (!this.settings || !this.isWhitelisted(userId)) return;
        this.setWhitelist(this.getWhitelist().filter(id => id !== userId));
        sendDebugMessage(`User <@${userId}> removed from local whitelist.`, channelId);
    },

    // ── Permit rotation ───────────────────────────────────────────────────
    // Mirrors the ban rotation in bans.tsx. When the permit list for the current
    // user reaches permitLimit and permitRotateEnabled is on, the oldest permitted
    // user is automatically unpermitted to make room for the new one.

    applyPermitRotation(userId: string, channelId: string) {
        if (!this.settings) return;
        const s = this.settings as any; // permitLimit / permitRotateEnabled are new fields

        const meId = Users.getCurrentUser()?.id;
        if (!meId) return;

        const config = stateManager.getMemberConfig(meId);
        const permitLimit: number = s.permitLimit ?? 10;
        const rotateEnabled: boolean = s.permitRotateEnabled ?? false;

        if (config.permittedUsers.includes(userId)) {
            sendDebugMessage(`<@${userId}> is already permitted, skipping duplicate.`, channelId);
            return; // Already in list
        }

        if (rotateEnabled && config.permittedUsers.length >= permitLimit) {
            const oldest = config.permittedUsers.shift();
            if (oldest) {
                sendDebugMessage(`Permit list full (${permitLimit}). Unpermitting oldest: <@${oldest}>`, channelId);
                actionQueue.enqueue(
                    formatCommand(this.settings.unpermitCommand, channelId, { userId: oldest }),
                    channelId, true
                );

                const rotMsg: string = s.permitRotationMessage || "♻️ Permit rotated: <@{user_id}> was unpermitted to make room for <@{user_id_new}>";
                const msg = formatCommand(rotMsg, channelId, {
                    userId: oldest,
                    newUserId: userId
                });
                sendEphemeralMessage(channelId, msg);
            }
        }

        config.permittedUsers.push(userId);
        stateManager.updateMemberConfig(meId, { permittedUsers: config.permittedUsers });
    },

    // ── Permit / Unpermit ─────────────────────────────────────────────────

    permitUsers(members: (MemberLike | string)[], channelId: string) {
        if (!this.settings) return;
        for (const member of members) {
            const userId = extractId(member);
            if (!userId) continue;
            // Apply rotation logic (adds to tracked list + handles overflow)
            this.applyPermitRotation(userId, channelId);
            // Queue the actual bot command
            const cmd = formatCommand(this.settings.permitCommand, channelId, { userId });
            sendDebugMessage(`Permitting user <@${userId}>`, channelId);
            actionQueue.enqueue(cmd, channelId);
        }
    },

    permitUser(member: MemberLike | string, channelId: string) {
        this.permitUsers([member], channelId);
    },

    unpermitUsers(members: (MemberLike | string)[], channelId: string) {
        if (!this.settings) return;
        const meId = Users.getCurrentUser()?.id;
        for (const member of members) {
            const userId = extractId(member);
            if (!userId) continue;
            const cmd = formatCommand(this.settings.unpermitCommand, channelId, { userId });
            sendDebugMessage(`Unpermitting user <@${userId}>`, channelId);
            actionQueue.enqueue(cmd, channelId);
            // Remove from tracked list
            if (meId && stateManager.hasMemberConfig(meId)) {
                const config = stateManager.getMemberConfig(meId);
                const filtered = config.permittedUsers.filter(id => id !== userId);
                if (filtered.length !== config.permittedUsers.length) {
                    stateManager.updateMemberConfig(meId, { permittedUsers: filtered });
                }
            }
        }
    },

    unpermitUser(member: MemberLike | string, channelId: string) {
        this.unpermitUsers([member], channelId);
    }
};
