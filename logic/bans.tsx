import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings, RequiredRoleMode } from "../types/settings";
import { SocializeEvent } from "../types/events";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { UserStore as Users, RelationshipStore, GuildMemberStore, VoiceStateStore } from "@webpack/common";
import { VoiceState } from "@vencord/discord-types";
import { formatCommand } from "../utils/formatting";
import { MemberLike, extractId } from "../utils/parsing";
import { sendDebugMessage } from "../utils/debug";
import { getNewLineList } from "../utils/settingsHelpers";
import { isUserInVoiceChannel } from "../utils/channels";
import { BlacklistModule } from "./blacklist";
import { User, Channel } from "@vencord/discord-types";
import { Menu, React } from "@webpack/common";
import { sendBotMessage } from "@api/Commands";

export const BansModule: SocializeModule = {
    name: "BansModule",
    requiredDependencies: ["BlacklistModule"],
    settings: null as unknown as PluginSettings,
    recentlyKickedWaitlist: new Map<string, number>(),


    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("BansModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
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

        moduleRegistry.on(SocializeEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, () => {
            this.recentlyKickedWaitlist.clear();
        });
    },

    stop() {
        this.recentlyKickedWaitlist.clear();
        logger.info("BansModule stopping");
    },

    onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        // Voice state updates are now handled via USER_JOINED_OWNED_CHANNEL in OwnershipModule -> BansModule
    },

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

        const lastKickTime = this.recentlyKickedWaitlist.get(userId);
        const now = Date.now();
        const cooldownMs = (this.settings.banRotateCooldown || 0) * 1000;

        logger.debug(`[BansModule] enforceBanPolicy for ${userId}: kickFirst=${kickFirst}, lastKick=${lastKickTime}, now=${now}, cooldown=${cooldownMs}`);

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
                actionQueue.enqueue(formatCommand(this.settings.unbanCommand, channelId, { userId: oldestBannedUser }), channelId, true);

                if (this.settings.banRotationMessage) {
                    const rotationStr = this.settings.banRotationMessage
                        .replace(/{user_id}/g, oldestBannedUser)
                        .replace(/{user_id_new}/g, userId);
                    sendBotMessage(channelId, { content: rotationStr });
                }
            }
        }

        if (!config.bannedUsers.includes(userId)) {
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: [...config.bannedUsers, userId] });
        }

        actionQueue.enqueue(
            formatCommand(this.settings.banCommand, channelId, { userId, reason }),
            channelId,
            true,
            () => isUserInVoiceChannel(userId, channelId)
        );
        this.recentlyKickedWaitlist.delete(userId);
    },

    banUsers(members: (MemberLike | string)[], channelId: string) {
        for (const member of members) {
            const userId = extractId(member);
            if (userId) this.enforceBanPolicy(userId, channelId, false);
        }
    },

    banUser(member: MemberLike | string, channelId: string) {
        this.banUsers([member], channelId);
    },

    unbanUser(userId: string, channelId: string) {
        if (!this.settings) return;
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        actionQueue.enqueue(formatCommand(this.settings.unbanCommand, channelId, { userId }), channelId);

        if (stateManager.hasMemberConfig(currentUserId)) {
            const ownerCfg = stateManager.getMemberConfig(currentUserId);
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: ownerCfg.bannedUsers.filter(id => id !== userId) });
        }
        BlacklistModule.unblacklistUser(userId, channelId);
    }
};
