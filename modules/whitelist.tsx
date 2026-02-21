import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { PluginModuleEvent } from "../types/events";
import { logger } from "../utils/logger";
import { formatCommand } from "../utils/formatting";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/state";
import { MemberLike, extractId } from "../utils/parsing";
import { getUserIdList, setNewLineList } from "../utils/settings";
import { sendDebugMessage } from "../utils/debug";
import { sendEphemeralMessage } from "../utils/messaging";

import { UserStore as Users } from "@webpack/common";
import { OptionType } from "@utils/types";
import { ApplicationCommandOptionType, ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { defaultSettings } from "../settings";

/**
 * Settings definitions for the WhitelistModule.
 */
export const whitelistSettings = {
    /** A newline-separated list of user IDs to exclude from automated enforcement actions. */
    localUserWhitelist: { type: OptionType.STRING, description: "Local whitelist — user IDs to exclude from auto-actions (one per line)", default: "", multiline: true, restartNeeded: false },
    /** Template for the message sent when an enforcement action is skipped due to whitelist. */
    whitelistSkipMessage: { type: OptionType.STRING, description: "Message sent when skipping an action for a whitelisted user (supports {action}, {user_id}, {user_name})", default: "⚪ Whitelist: Skipping {action} for <@{user_id}> ({user_name})", restartNeeded: false },
    /** Maximum number of users that can be in the temporary permit list before rotation occurs. */
    permitLimit: { type: OptionType.SLIDER, description: "Max users in permit list before rotation", default: 5, markers: [1, 2, 3, 4, 5, 10, 15, 20, 50], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.permitLimit = Math.round(v); } },
    /** Whether to automatically remove the oldest entry from the permit list when the limit is reached. */
    permitRotateEnabled: { type: OptionType.BOOLEAN, description: "Automatically unpermit oldest entry when permit limit is reached", default: false, restartNeeded: false },
    /** Template for the notification message sent when permit rotation occurs. */
    permitRotationMessage: { type: OptionType.STRING, description: "Message sent on permit rotation (supports {user_id}, {user_id_new})", default: "♻️ Permit rotated: <@{user_id}> was unpermitted to make room for <@{user_id_new}>", restartNeeded: false },
};

export type WhitelistSettingsType = typeof whitelistSettings;

export const WhitelistModule: PluginModule = {
    name: "WhitelistModule",
    description: "Manages whitelisted and temporarily permitted users. Whitelisting bypasses enforcement globally, while permitting allows access to specific channels.",
    settingsSchema: whitelistSettings,
    settings: undefined as Record<string, any> | undefined,


    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("WhitelistModule initializing");

        moduleRegistry.on<PluginModuleEvent.USER_JOINED_OWNED_CHANNEL>(PluginModuleEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
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

    /**
     * Handles permit list rotation logic for a user in a specific channel.
     * If the permit limit is reached and rotation is enabled, the oldest entry is removed.
     * @param userId The ID of the user to permit
     * @param channelId The target voice channel ID
     */
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

    /**
     * Permits multiple users into a voice channel, applying rotation logic if necessary.
     * @param members Array of user IDs or member-like objects to permit
     * @param channelId The target voice channel ID
     */
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

export const whitelistCommands = [
    {
        name: `socialize whitelist`,
        description: "Add a user to the local whitelist",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to whitelist",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) {
                return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing user." });
            }

            const whitelist = WhitelistModule.getWhitelist();
            if (!whitelist.includes(userId)) {
                whitelist.push(userId);
                WhitelistModule.setWhitelist(whitelist);
            }
            return sendBotMessage(ctx.channel.id, { content: `Whitelisted <@${userId}> locally.` });
        }
    },
    {
        name: `socialize unwhitelist`,
        description: "Remove a user from the local whitelist",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to unwhitelist",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) {
                return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing user." });
            }

            WhitelistModule.unwhitelistUser(userId, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Removed <@${userId}> from local whitelist.` });
        }
    },
    {
        name: `socialize permit`,
        description: "Permit a user into managed channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to permit",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) {
                return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing user." });
            }
            WhitelistModule.whitelistUser(userId, ctx.channel.id);
            WhitelistModule.permitUser(userId, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Permitted <@${userId}>` });
        }
    },
    {
        name: `socialize unpermit`,
        description: "Unpermit a user from managed channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to unpermit",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) {
                return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing user." });
            }
            WhitelistModule.unpermitUser(userId, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Unpermitted <@${userId}>` });
        }
    }
];
