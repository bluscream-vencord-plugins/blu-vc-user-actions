import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
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
import { BlacklistModule } from "./blacklist";
import { User, Channel } from "@vencord/discord-types";
import { Menu, React } from "@webpack/common";

export const BansModule: SocializeModule = {
    name: "BansModule",
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

        const isLocallyBlacklisted = this.settings.banInLocalBlacklist && BlacklistModule.isBlacklisted(userId);
        const isBlocked = this.settings.banBlockedUsers && RelationshipStore.isBlocked(userId);

        let isMissingRole = false;
        if (this.settings.banNotInRoles && this.settings.requiredRoleIds?.trim().length > 0) {
            const requiredRoleList = getNewLineList(this.settings.requiredRoleIds);
            const member = GuildMemberStore.getMember(guildId, userId);
            if (member && member.roles) {
                isMissingRole = requiredRoleList.length > 0 && !member.roles.some((r: string) => requiredRoleList.includes(r));
            } else {
                isMissingRole = true;
            }
        }

        if (isLocallyBlacklisted || isBlocked || isMissingRole) {
            const reason = [isLocallyBlacklisted && "Blacklisted", isBlocked && "Blocked", isMissingRole && "Missing Role"].filter(Boolean).join(", ");
            sendDebugMessage(channelId, `User <@${userId}> failed join check: ${reason}`);
            this.enforceBanPolicy(userId, channelId, true, reason);
            return true;
        }

        return false;
    },

    enforceBanPolicy(userId: string, channelId: string, kickFirst: boolean = false, reason?: string) {
        if (!this.settings) return;

        if (kickFirst) {
            const lastKickTime = this.recentlyKickedWaitlist.get(userId);
            const now = Date.now();
            const cooldownMs = this.settings.banRotateCooldown * 1000;

            if (!lastKickTime || (cooldownMs > 0 && (now - lastKickTime) > cooldownMs)) {
                sendDebugMessage(channelId, `Kick-First applied. Kicking user ${userId}`);
                actionQueue.enqueue(
                    formatCommand(this.settings.kickCommand, channelId, { userId, reason }),
                    channelId,
                    true,
                    () => !!VoiceStateStore.getVoiceStatesForChannel(channelId)?.[userId]
                );
                this.recentlyKickedWaitlist.set(userId, now);
                return;
            }
        }

        sendDebugMessage(channelId, `Executing ban rotation sequence for ${userId}`);
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const config = stateManager.getMemberConfig(currentUserId);

        if (this.settings.banRotateEnabled && config.bannedUsers.length >= this.settings.banLimit) {
            const oldestBannedUser = config.bannedUsers.shift();
            if (oldestBannedUser) {
                sendDebugMessage(channelId, `Ban list full. Unbanning ${oldestBannedUser} to make room...`);
                actionQueue.enqueue(formatCommand(this.settings.unbanCommand, channelId, { userId: oldestBannedUser }), channelId, true);

                if (this.settings.banRotationMessage) {
                    const rotationStr = this.settings.banRotationMessage
                        .replace(/{user_id}/g, oldestBannedUser)
                        .replace(/{user_id_new}/g, userId);
                    actionQueue.enqueue(rotationStr, channelId);
                }
            }
        }

        if (!config.bannedUsers.includes(userId)) {
            config.bannedUsers.push(userId);
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: config.bannedUsers });
        }

        actionQueue.enqueue(formatCommand(this.settings.banCommand, channelId, { userId, reason }), channelId, true);
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
    }
};
