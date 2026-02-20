import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent } from "../types/events";
import { logger } from "../utils/logger";
import { formatCommand } from "../utils/formatting";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { MemberLike, extractId } from "../utils/parsing";
import { getUserIdList, setNewLineList } from "../utils/settingsHelpers";
import { sendDebugMessage } from "../utils/debug";

import { User, Channel } from "@vencord/discord-types";
import { Menu, React, UserStore as Users } from "@webpack/common";

export const WhitelistModule: SocializeModule = {
    name: "WhitelistModule",
    settings: undefined as PluginSettings | undefined,


    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("WhitelistModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            if (this.isWhitelisted(payload.userId)) {
                payload.isAllowed = true;
                payload.reason = "Whitelisted";
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
            sendDebugMessage(channelId, `<@${userId}> is already permitted, skipping duplicate.`);
            return; // Already in list
        }

        if (rotateEnabled && config.permittedUsers.length >= permitLimit) {
            const oldest = config.permittedUsers.shift();
            if (oldest) {
                sendDebugMessage(channelId, `Permit list full (${permitLimit}). Unpermitting oldest: <@${oldest}>`);
                actionQueue.enqueue(
                    formatCommand(this.settings.unpermitCommand, channelId, { userId: oldest }),
                    channelId, true
                );

                const rotMsg: string = s.permitRotationMessage || "♻️ Permit rotated: <@{user_id}> was unpermitted to make room for <@{user_id_new}>";
                const msg = rotMsg
                    .replace(/{user_id}/g, oldest)
                    .replace(/{user_id_new}/g, userId);
                actionQueue.enqueue(msg, channelId);
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
            sendDebugMessage(channelId, `Permitting user <@${userId}>`);
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
            sendDebugMessage(channelId, `Unpermitting user <@${userId}>`);
            actionQueue.enqueue(cmd, channelId);
            // Remove from tracked list
            if (meId) {
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
