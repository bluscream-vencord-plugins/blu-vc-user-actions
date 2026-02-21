import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { RequiredRoleMode } from "./roleEnforcement";
import { PluginModuleEvent } from "../types/events";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/queue";
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
import { defaultSettings } from "../settings";
import { pluginInfo } from "../info";

/**
 * Settings definitions for the BansModule.
 */
export const banSettings = {
    // ── Banning ───────────────────────────────────────────────────────────
    /** Maximum number of users that can be in the bot's ban list before rotation logic triggers. */
    banLimit: { type: OptionType.SLIDER, description: "Max users in ban list before rotation", default: 5, markers: [1, 2, 3, 4, 5, 10, 15, 20, 50], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.banLimit = Math.round(v); } },
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
    /** A local list of user IDs to be automatically kicked from your channels. */
    localUserBlacklist: { type: OptionType.STRING, description: "Local ban list — user IDs to auto-kick (one per line)", default: "", multiline: true, restartNeeded: false },
};

export type BanSettingsType = typeof banSettings;

export const BansModule: PluginModule = {
    name: "BansModule",
    description: "Manages and enforces user bans and kicks in owned channels.",
    requiredDependencies: ["BlacklistModule"],
    settingsSchema: banSettings,
    settings: null as unknown as Record<string, any>,
    /** Temporary internal map to track users who were recently kicked to prevent spam. */
    recentlyKickedWaitlist: new Map<string, number>(),


    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("BansModule initializing");

        moduleRegistry.on<PluginModuleEvent.USER_JOINED_OWNED_CHANNEL>(PluginModuleEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
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

        moduleRegistry.on<PluginModuleEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL>(PluginModuleEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, () => {
            this.recentlyKickedWaitlist.clear();
        });
    },

    stop() {
        this.recentlyKickedWaitlist.clear();
        logger.info("BansModule stopping");
    },

    /**
     * Evaluates whether a user's join violates ban policies (blacklist, blocked, roles).
     * @param userId The ID of the user who joined
     * @param channelId The target channel ID
     * @param guildId The target guild ID
     * @returns True if an enforcement action was taken, false otherwise
     */
    evaluateUserJoin(userId: string, channelId: string, guildId: string): boolean {
        if (!this.settings) return false;
        logger.debug(`Evaluating join for ${userId} in ${channelId}`);

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
                    const hasAllRoles = requiredRoleList.every((r: string) => member.roles.includes(r));
                    isMissingRole = !hasAllRoles;
                } else if (this.settings.requiredRoleMode === RequiredRoleMode.NONE) {
                    const hasAnyRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                    isMissingRole = hasAnyRole;
                } else {
                    // Default / ANY
                    const hasAnyRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                    isMissingRole = !hasAnyRole;
                }
            } else {
                isMissingRole = true;
            }
        }
        const stateBan = config?.bannedUsers.includes(userId) ?? false;
        const lastKickTime = this.recentlyKickedWaitlist.get(userId);
        const hasRecentKick = !!lastKickTime;

        logger.debug(`[BansModule] Evaluation details for ${userId}: blacklisted=${isLocallyBlacklisted}, blocked=${isBlocked}, missingRole=${isMissingRole}, stateBan=${stateBan}, recentKick=${hasRecentKick}`);

        if (isLocallyBlacklisted || isBlocked || isMissingRole || stateBan || hasRecentKick) {
            const reason = [
                isLocallyBlacklisted && "Blacklisted",
                isBlocked && "Blocked",
                isMissingRole && "Missing Role",
                stateBan && "Already Banned",
                hasRecentKick && "Repeat Join"
            ].filter(Boolean).join(", ");

            sendDebugMessage(`User <@${userId}> join evaluation: **FAILED** (${reason}) [StateBan: ${stateBan}, Waitlist: ${hasRecentKick}]`, channelId);
            this.enforceBanPolicy(userId, channelId, true, reason);
            return true;
        }

        logger.debug(`[BansModule] User ${userId} passed join evaluation`);

        return false;
    },

    enforceBanPolicy(userId: string, channelId: string, kickFirst: boolean = false, reason?: string) {
        if (!this.settings) return;

        BlacklistModule.blacklistUser(userId, channelId);

        const lastKickTime = this.recentlyKickedWaitlist.get(userId);
        const now = Date.now();
        const cooldownMs = (this.settings.banRotateCooldown || 0) * 1000;

        logger.debug(`[BansModule] enforceBanPolicy for ${userId}: lastKick=${lastKickTime}, now=${now}, cooldown=${cooldownMs}`);

        if (kickFirst) {
            const shouldKick = !lastKickTime || (cooldownMs > 0 && (now - lastKickTime) > cooldownMs);

            if (shouldKick) {
                sendDebugMessage(`Phase 1: Kick-First applied for <@${userId}>`, channelId);
                this.recentlyKickedWaitlist.set(userId, now);
                actionQueue.enqueue(
                    formatCommand(this.settings.kickCommand, channelId, { userId, reason }),
                    channelId,
                    true,
                    () => isUserInVoiceChannel(userId, channelId)
                );
                return;
            } else {
                sendDebugMessage(`Phase 2: User <@${userId}> rejoined within cooldown. Escalating to BAN.`, channelId);
            }
        }

        sendDebugMessage(`Executing ban rotation sequence for ${userId}`, channelId);
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const config = stateManager.getMemberConfig(currentUserId);

        if (this.settings.banRotateEnabled && config.bannedUsers.length >= this.settings.banLimit) {
            const oldestBannedUser = config.bannedUsers.shift();
            if (oldestBannedUser) {
                sendDebugMessage(`Ban list full. Unbanning ${oldestBannedUser} to make room...`, channelId);
                const unbanCmd = formatCommand(this.settings.unbanCommand, channelId, { userId: oldestBannedUser });
                actionQueue.enqueue(unbanCmd, channelId, true);

                if (this.settings.banRotationMessage) {
                    const rotationStr = formatCommand(this.settings.banRotationMessage, channelId, {
                        userId: oldestBannedUser,
                        newUserId: userId
                    });
                    sendEphemeralMessage(channelId, rotationStr);
                }
            }
        }

        if (!config.bannedUsers.includes(userId)) {
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: [...config.bannedUsers, userId] });
        }

        const banCmd = formatCommand(this.settings.banCommand, channelId, { userId, reason });
        actionQueue.enqueue(
            banCmd,
            channelId,
            true
        );
        this.recentlyKickedWaitlist.delete(userId);
    },

    banUsers(members: (MemberLike | string)[], channelId: string) {
        for (const member of members) {
            const userId = extractId(member);
            if (userId) this.enforceBanPolicy(userId, channelId, true);
        }
    },

    banUser(member: MemberLike | string, channelId: string) {
        this.banUsers([member], channelId);
    },

    unbanUser(userId: string, channelId: string) {
        if (!this.settings) return;
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const cmd = formatCommand(this.settings.unbanCommand, channelId, { userId });
        actionQueue.enqueue(cmd, channelId);

        if (stateManager.hasMemberConfig(currentUserId)) {
            const ownerCfg = stateManager.getMemberConfig(currentUserId);
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: ownerCfg.bannedUsers.filter(id => id !== userId) });
        }
        BlacklistModule.unblacklistUser(userId, channelId);
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
            if (!userId || !ctx.channel) {
                return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing user or channel." });
            }
            BansModule.enforceBanPolicy(userId, ctx.channel.id, true, "Manual Ban");
            return sendBotMessage(ctx.channel.id, { content: `Triggered ban sequence for <@${userId}>` });
        }
    },
    {
        name: `${pluginInfo.commandName}  unban`,
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
            if (!userId || !ctx.channel) {
                return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing user or channel." });
            }
            BansModule.unbanUser(userId, ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: `Triggered unban sequence for <@${userId}>` });
        }
    }
];
