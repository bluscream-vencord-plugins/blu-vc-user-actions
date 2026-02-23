import { PluginModule } from "../types/module";
import { moduleRegistry } from "../core/moduleRegistry";
import { CoreEvent } from "../types/events";
import { logger } from "../utils/logger";
import { actionQueue } from "../core/actionQueue";
import { stateManager } from "../utils/state";
import { UserStore as Users, RelationshipStore, GuildMemberStore } from "@webpack/common";
import { formatCommand } from "../utils/formatting";
import { MemberLike, extractId } from "../utils/parsing";
import { sendDebugMessage } from "../utils/debug";
import { sendEphemeralMessage } from "../utils/messaging";
import { getNewLineList } from "../utils/settings";
import { isUserInVoiceChannel } from "../utils/channels";
import { BlacklistModule } from "./blacklist";
import { OptionType } from "@utils/types";
import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { pluginInfo } from "../info";
import { RequiredRoleMode } from "./roleEnforcement";

/**
 * Settings definitions for the BansModule.
 */
export const banSettings = {
    /** Maximum number of users that can be in the bot's ban list before rotation logic triggers. */
    banLimit: { type: OptionType.SLIDER, description: "Max users in ban list before rotation", default: 5, markers: [1, 2, 3, 4, 5, 10, 15, 20, 50], stickToMarkers: false, restartNeeded: false },
    /** Whether to automatically unban the oldest entry when the ban limit is reached and a new ban is needed. */
    banRotateEnabled: { type: OptionType.BOOLEAN, description: "Automatically unpermit oldest ban when limit is reached", default: true, restartNeeded: false },
    /** Minimum duration in seconds to wait before re-kicking a user to prevent kick loops. */
    banRotateCooldown: { type: OptionType.NUMBER, description: "Minimum seconds before re-kicking a user (0 = infinite)", default: 0, restartNeeded: false },
    /** The message template used when a ban is rotated. */
    banRotationMessage: { type: OptionType.STRING, description: "Message sent on ban rotation (supports {user_id}, {user_id_new})", default: "♻️ Ban rotated: <@{user_id}> was unbanned to make room for <@{user_id_new}>", restartNeeded: false },
    /** Whether to automatically enforce the local user blacklist. */
    banInLocalBlacklist: { type: OptionType.BOOLEAN, description: "Auto-kick/ban users in the local blacklist", default: true, restartNeeded: false },
    /** Whether to automatically kick/ban users you have blocked on Discord. */
    banBlockedUsers: { type: OptionType.BOOLEAN, description: "Auto-kick/ban users you have blocked", default: true, restartNeeded: false },
};

export type BanSettingsType = typeof banSettings;

export const BansModule: PluginModule = {
    name: "BansModule",
    description: "Manages and enforces user bans and kicks in owned channels.",
    requiredDependencies: ["BlacklistModule"],
    settingsSchema: banSettings,
    settings: null,
    recentlyKickedWaitlist: new Map<string, number>(),


    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("BansModule initializing");

        moduleRegistry.on(CoreEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            if (payload.isAllowed || payload.isHandled) return;

            const currentUserId = Users.getCurrentUser()?.id;
            if (payload.userId === currentUserId) return;

            const ownership = stateManager.getOwnership(payload.channelId);
            if (!ownership) return;

            if (ownership.creatorId !== currentUserId && ownership.claimantId !== currentUserId) return;

            if (this.evaluateUserJoin(payload.userId, payload.channelId, payload.guildId)) {
                payload.isHandled = true;
                payload.reason = "Ban Policy Violation";
            }
        });

        moduleRegistry.on(CoreEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, () => {
            this.recentlyKickedWaitlist.clear();
        });
    },

    stop() {
        this.recentlyKickedWaitlist.clear();
        logger.info("BansModule stopping");
    },

    evaluateUserJoin(userId: string, channelId: string, guildId: string): boolean {
        if (!this.settings) return false;
        const currentUserId = Users.getCurrentUser()?.id;
        const config = (currentUserId && stateManager.hasMemberConfig(currentUserId))
            ? stateManager.getMemberConfig(currentUserId)
            : null;
        const isBannedInState = config?.bannedUsers.includes(userId) ?? false;

        const isLocallyBlacklisted = this.settings.banInLocalBlacklist && BlacklistModule.isBlacklisted(userId);
        const isBlocked = this.settings.banBlockedUsers && RelationshipStore.isBlocked(userId);

        let isMissingRole = false;
        if (this.settings.banNotInRoles && this.settings.requiredRoleIds?.trim().length > 0) {
            const requiredRoleList = getNewLineList(this.settings.requiredRoleIds);
            const member = GuildMemberStore.getMember(guildId, userId);

            if (member && member.roles && requiredRoleList.length > 0) {
                if (this.settings.requiredRoleMode === RequiredRoleMode.ALL) {
                    isMissingRole = !requiredRoleList.every((r: string) => member.roles.includes(r));
                } else if (this.settings.requiredRoleMode === RequiredRoleMode.NONE) {
                    isMissingRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                } else {
                    isMissingRole = !member.roles.some((r: string) => requiredRoleList.includes(r));
                }
            } else {
                isMissingRole = true;
            }
        }
        const stateBan = config?.bannedUsers.includes(userId) ?? false;
        const lastKickTime = this.recentlyKickedWaitlist.get(userId);
        const hasRecentKick = !!lastKickTime;

        if (isLocallyBlacklisted || isBlocked || isMissingRole || stateBan || hasRecentKick) {
            const reason = [
                isLocallyBlacklisted && "Blacklisted",
                isBlocked && "Blocked",
                isMissingRole && "Missing Role",
                stateBan && "Already Banned",
                hasRecentKick && "Repeat Join"
            ].filter(Boolean).join(", ");

            this.enforceBanPolicy(userId, channelId, true, reason);
            return true;
        }

        return false;
    },

    enforceBanPolicy(userId: string, channelId: string, kickFirst: boolean = false, reason?: string) {
        if (!this.settings) return;

        BlacklistModule.blacklistUsers([userId], channelId);

        const lastKickTime = this.recentlyKickedWaitlist.get(userId);
        const now = Date.now();
        const cooldownMs = (this.settings.banRotateCooldown || 0) * 1000;

        if (kickFirst) {
            const shouldKick = !lastKickTime || (cooldownMs > 0 && (now - lastKickTime) > cooldownMs);

            if (shouldKick) {
                this.recentlyKickedWaitlist.set(userId, now);
                actionQueue.enqueue(
                    formatCommand(this.settings.kickCommand, channelId, { userId, reason }),
                    channelId,
                    true,
                    () => isUserInVoiceChannel(userId, channelId)
                );
                return;
            }
        }

        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const config = stateManager.getMemberConfig(currentUserId);

        if (this.settings.banRotateEnabled && config.bannedUsers.length >= this.settings.banLimit) {
            const oldestBannedUser = config.bannedUsers.shift();
            if (oldestBannedUser) {
                this.unbanUsers([oldestBannedUser], channelId);
                if (this.settings.banRotationMessage) {
                    sendEphemeralMessage(channelId, formatCommand(this.settings.banRotationMessage, channelId, { userId: oldestBannedUser, newUserId: userId }));
                }
            }
        }

        if (!config.bannedUsers.includes(userId)) {
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: [...config.bannedUsers, userId] });
        }

        actionQueue.enqueue(formatCommand(this.settings.banCommand, channelId, { userId, reason }), channelId, true);
        this.recentlyKickedWaitlist.delete(userId);
    },

    banUsers(members: (MemberLike | string)[], channelId: string) {
        for (const member of members) {
            const userId = extractId(member);
            if (userId) this.enforceBanPolicy(userId, channelId, true);
        }
    },


    unbanUsers(userIds: string[], channelId: string) {
        if (!this.settings) return;
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        userIds.forEach(userId => {
            if (this.settings) {
                actionQueue.enqueue(formatCommand(this.settings.unbanCommand, channelId, { userId }), channelId);
            }
        });

        if (stateManager.hasMemberConfig(currentUserId)) {
            const ownerCfg = stateManager.getMemberConfig(currentUserId);
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: ownerCfg.bannedUsers.filter(id => !userIds.includes(id)) });
        }
        BlacklistModule.unblacklistUsers(userIds, channelId);
    }
};

export const bansCommands = [
    {
        name: `${pluginInfo.commandName} ban`,
        description: "Add a user to the local ban list",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to ban",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
            BansModule.enforceBanPolicy(userId, ctx.channel.id, true, "Manual Ban");
            return sendBotMessage(ctx.channel.id, { content: `Triggered ban sequence for <@${userId}>` });
        }
    },
    {
        name: `${pluginInfo.commandName} unban`,
        description: "Remove a user from the local ban list",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to unban",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
            BansModule.unbanUsers([userId], ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Triggered unban sequence for <@${userId}>` });
        }
    }
];
