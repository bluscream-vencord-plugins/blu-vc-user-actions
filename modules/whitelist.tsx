import { PluginModule } from "../types/module";
import { moduleRegistry } from "../core/moduleRegistry";
import { CoreEvent } from "../types/events";
import { logger } from "../utils/logger";
import { formatCommand } from "../utils/formatting";
import { actionQueue } from "../core/actionQueue";
import { stateManager } from "../utils/state";
import { MemberLike, extractId, parseMultiUserIds } from "../utils/parsing";
import { getUserIdList, setNewLineList } from "../utils/settings";
import { sendDebugMessage } from "../utils/debug";
import { sendEphemeralMessage } from "../utils/messaging";

import { UserStore as Users } from "@webpack/common";
import { OptionType } from "@utils/types";
import { ApplicationCommandOptionType, ApplicationCommandInputType, sendBotMessage } from "@api/Commands";

/**
 * Settings definitions for the WhitelistModule.
 */
export const whitelistSettings = {
    /** A newline-separated list of user IDs to exclude from automated enforcement actions. */
    localUserWhitelist: { type: OptionType.STRING, description: "Local whitelist — user IDs to exclude from auto-actions (one per line)", default: "", multiline: true, restartNeeded: false },
    /** Template for the message sent when an enforcement action is skipped due to whitelist. */
    whitelistSkipMessage: { type: OptionType.STRING, description: "Message sent when skipping an action for a whitelisted user (supports {action}, {user_id}, {user_name})", default: "⚪ Whitelist: Skipping {action} for <@{user_id}> ({user_name})", restartNeeded: false },
    /** Maximum number of users that can be in the temporary permit list before rotation occurs. */
    permitLimit: { type: OptionType.SLIDER, description: "Max users in permit list before rotation", default: 5, markers: [1, 2, 3, 4, 5, 10, 15, 20, 50], stickToMarkers: false, restartNeeded: false },
    /** Whether to automatically remove the oldest entry from the permit list when the limit is reached. */
    permitRotateEnabled: { type: OptionType.BOOLEAN, description: "Automatically unpermit oldest entry when permit limit is reached", default: false, restartNeeded: false },
    /** Template for the notification message sent when permit rotation occurs. */
    permitRotationMessage: { type: OptionType.STRING, description: "Message sent on permit rotation (supports {user_id}, {user_id_new})", default: "♻️ Permit rotated: <@{user_id}> was unpermitted to make room for <@{user_id_new}>", restartNeeded: false },
};

export type WhitelistSettingsType = typeof whitelistSettings;

export const WhitelistModule: PluginModule = {
    name: "WhitelistModule",
    description: "Manages whitelisted and temporarily permitted users.",
    settingsSchema: whitelistSettings,
    settings: null,


    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("WhitelistModule initializing");

        moduleRegistry.on(CoreEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
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

    whitelistUsers(userIds: string[], channelId?: string) {
        if (!this.settings) return;
        const currentList = this.getWhitelist();
        const newList = [...new Set([...currentList, ...userIds])];
        if (newList.length !== currentList.length) {
            this.setWhitelist(newList);
            sendDebugMessage(`Added ${userIds.length} user(s) to local whitelist.`, channelId);
        }
    },

    unwhitelistUsers(userIds: string[], channelId?: string) {
        if (!this.settings) return;
        const currentList = this.getWhitelist();
        const newList = currentList.filter(id => !userIds.includes(id));
        if (newList.length !== currentList.length) {
            this.setWhitelist(newList);
            sendDebugMessage(`Removed ${userIds.length} user(s) from local whitelist.`, channelId);
        }
    },

    applyPermitRotation(userId: string, channelId: string) {
        if (!this.settings) return;
        const s = this.settings;

        const meId = Users.getCurrentUser()?.id;
        if (!meId) return;

        const config = stateManager.getMemberConfig(meId);
        const permitLimit: number = s.permitLimit ?? 10;
        const rotateEnabled: boolean = s.permitRotateEnabled ?? false;

        if (config.permittedUsers.includes(userId)) {
            sendDebugMessage(`<@${userId}> is already permitted, skipping duplicate.`, channelId);
            return;
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
            this.applyPermitRotation(userId, channelId);
            const cmd = formatCommand(this.settings.permitCommand, channelId, { userId });
            sendDebugMessage(`Permitting user <@${userId}>`, channelId);
            actionQueue.enqueue(cmd, channelId);
        }
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
            if (meId && stateManager.hasMemberConfig(meId)) {
                const config = stateManager.getMemberConfig(meId);
                const filtered = config.permittedUsers.filter(id => id !== userId);
                if (filtered.length !== config.permittedUsers.length) {
                    stateManager.updateMemberConfig(meId, { permittedUsers: filtered });
                }
            }
        }
    },

};

export const whitelistCommands = [
    {
        name: `socialize whitelist`,
        description: "Add a user to the local whitelist",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "users",
                description: "The user(s) to whitelist (comma-separated IDs or mentions)",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const input = args.find(a => a.name === "users")?.value;
            if (!input || !ctx.channel) return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
            const userIds = parseMultiUserIds(input);
            WhitelistModule.whitelistUsers(userIds, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Whitelisted ${userIds.length} user(s) locally.` });
        }
    },
    {
        name: `socialize unwhitelist`,
        description: "Remove a user from the local whitelist",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "users",
                description: "The user(s) to unwhitelist (comma-separated IDs or mentions)",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const input = args.find(a => a.name === "users")?.value;
            if (!input || !ctx.channel) return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
            const userIds = parseMultiUserIds(input);
            WhitelistModule.unwhitelistUsers(userIds, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Removed ${userIds.length} user(s) from local whitelist.` });
        }
    },
    {
        name: `socialize permit`,
        description: "Permit a user into managed channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "users",
                description: "The user(s) to permit (comma-separated IDs or mentions)",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const input = args.find(a => a.name === "users")?.value;
            if (!input || !ctx.channel) return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
            const userIds = parseMultiUserIds(input);
            WhitelistModule.permitUsers(userIds, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Permitted ${userIds.length} user(s)` });
        }
    },
    {
        name: `socialize unpermit`,
        description: "Unpermit a user from managed channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "users",
                description: "The user(s) to unpermit (comma-separated IDs or mentions)",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const input = args.find(a => a.name === "users")?.value;
            if (!input || !ctx.channel) return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
            const userIds = parseMultiUserIds(input);
            WhitelistModule.unpermitUsers(userIds, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Unpermitted ${userIds.length} user(s)` });
        }
    }
];
