import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent } from "../types/events";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { UserStore as Users, VoiceStateStore, RelationshipStore, GuildMemberStore } from "@webpack/common";
import { Message, VoiceState } from "@vencord/discord-types";
import { formatCommand } from "../utils/formatting";
import { parseVoiceUserFromInput, MemberLike, extractId } from "../utils/parsing";
import { sendDebugMessage } from "../utils/debug";
import { getNewLineList } from "../utils/settingsHelpers";
import { WhitelistingModule } from "./whitelisting";
export const VoteBanningModule: SocializeModule = {
    name: "VoteBanningModule",
    settings: null as unknown as PluginSettings,
    activeVotes: new Map<string, { targetUser: string, voters: Set<string>, expiresAt: number }>(),

    // Map tracking users that were kicked. Key: userId, Value: timestamp
    recentlyKickedWaitlist: new Map<string, number>(),

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("VoteBanningModule initializing");

        // Cleanup expired votes every minute
        setInterval(() => this.cleanupExpiredVotes(), 60000);

        // Listen to Local User Left to clear queues
        moduleRegistry.on(SocializeEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, () => {
            this.recentlyKickedWaitlist.clear();
            actionQueue.clear();
        });
    },

    stop() {
        this.activeVotes.clear();
        this.recentlyKickedWaitlist.clear();
        logger.info("VoteBanningModule stopping");
    },

    onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        if (!this.settings) return;

        // If user joins our channel (ignoring self)
        if (newState.channelId && oldState.channelId !== newState.channelId) {
            const currentUserId = Users.getCurrentUser()?.id;
            if (newState.userId === currentUserId) return; // Ignore ourselves

            const ownership = stateManager.getOwnership(newState.channelId);
            if (!ownership) return;

            // Make sure we are the ones enforcing (We must be creator or claimant)
            if (ownership.creatorId !== currentUserId && ownership.claimantId !== currentUserId) return;

            this.evaluateUserJoin(newState.userId, newState.channelId, newState.guildId);
        }
    },

    onMessageCreate(message: Message) {
        if (!this.settings || !this.settings.botId || !this.settings.voteBanCommandString) return;

        const cmdPrefix = this.settings.voteBanCommandString.split("{user}")[0].trim().toLowerCase();

        if (message.content.toLowerCase().startsWith(cmdPrefix)) {
            const inputArg = message.content.substring(cmdPrefix.length).trim();
            if (!inputArg) return;

            const voterId = message.author.id;
            const voterVoiceState = VoiceStateStore.getVoiceStateForUser(voterId);
            if (!voterVoiceState || !voterVoiceState.channelId) return;

            const targetUser = parseVoiceUserFromInput(inputArg, voterVoiceState.channelId);
            if (!targetUser) return;

            this.registerVote(targetUser, voterId, voterVoiceState.channelId, voterVoiceState.guildId);
        }
    },

    evaluateUserJoin(userId: string, channelId: string, guildId: string) {
        if (!this.settings) return;
        if (WhitelistingModule.isWhitelisted(userId)) return;

        // 1. Is user locally blacklisted?
        const isLocallyBlacklisted = this.settings.banInLocalBlacklist && getNewLineList(this.settings.localUserBlacklist).some(s => s === userId);

        // 2. Is user blocked by the channel owner (us)?
        // RelationshipStore types: 1 = Friend, 2 = Blocked
        const isBlocked = this.settings.banBlockedUsers && RelationshipStore.isBlocked(userId);

        // 3. Are they missing required roles?
        let isMissingRole = false;
        if (this.settings.enforceRequiredRoles && this.settings.banNotInRoles && this.settings.requiredRoleIds && this.settings.requiredRoleIds.trim().length > 0) {
            const requiredRoleList = getNewLineList(this.settings.requiredRoleIds);
            const member = GuildMemberStore.getMember(guildId, userId);
            if (member && member.roles) {
                // Return true if they do NOT have ANY of the required roles
                isMissingRole = requiredRoleList.length > 0 && !member.roles.some((r: string) => requiredRoleList.includes(r));
            } else {
                // If member object absent, assume missing
                isMissingRole = true;
            }
        }

        if (isLocallyBlacklisted || isBlocked || isMissingRole) {
            sendDebugMessage(channelId, `User <@${userId}> failed join check: ` +
                [isLocallyBlacklisted && "Blacklisted", isBlocked && "Blocked", isMissingRole && "Missing Role"].filter(Boolean).join(", "));

            this.enforceBanPolicy(userId, channelId, true);
        }
    },

    enforceBanPolicy(userId: string, channelId: string, kickFirst: boolean = false) {
        if (!this.settings) return;

        // Kick First Policy
        if (kickFirst) {
            const lastKickTime = this.recentlyKickedWaitlist.get(userId);
            const now = Date.now();
            const cooldownMs = this.settings.banRotateCooldown * 1000;

            if (!lastKickTime || (cooldownMs > 0 && (now - lastKickTime) > cooldownMs)) {
                // User hasn't been kicked recently, or cooldown expired. Kick them first.
                sendDebugMessage(channelId, `Kick-First applied. Kicking user ${userId}`);
                actionQueue.enqueue(formatCommand(this.settings.kickCommand, channelId, { userId }), channelId, true);

                // Track kick time so they get banned if they rejoin
                this.recentlyKickedWaitlist.set(userId, now);
                return;
            }
        }

        // Waitlist re-triggered (or immediate ban requested), process Ban Rotation
        sendDebugMessage(channelId, `Executing ban rotation sequence for ${userId}`);
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const config = stateManager.getMemberConfig(currentUserId);

        // Unban oldest if hitting limit
        if (this.settings.banRotateEnabled && config.bannedUsers.length >= this.settings.banLimit) {
            const oldestBannedUser = config.bannedUsers.shift();
            if (oldestBannedUser) {
                sendDebugMessage(channelId, `Ban list full. Unbanning ${oldestBannedUser} to make room...`);
                actionQueue.enqueue(formatCommand(this.settings.unbanCommand, channelId, { userId: oldestBannedUser }), channelId, true);

                if (this.settings.banRotationMessage) {
                    const rotationStr = this.settings.banRotationMessage
                        .replace(/{user_id}/g, oldestBannedUser)
                        .replace(/{user_id_new}/g, userId);
                    actionQueue.enqueue(rotationStr, channelId); // Not prioritized over the ban commands
                }
            }
        }

        // Apply final ban
        if (!config.bannedUsers.includes(userId)) {
            config.bannedUsers.push(userId);
            stateManager.updateMemberConfig(currentUserId, { bannedUsers: config.bannedUsers });
        }

        actionQueue.enqueue(formatCommand(this.settings.banCommand, channelId, { userId }), channelId, true);
        this.recentlyKickedWaitlist.delete(userId); // Consume the waitlist
    },

    registerVote(targetUser: string, voterId: string, channelId: string, guildId: string) {
        if (!this.settings) return;
        const ownership = stateManager.getOwnership(channelId);
        if (!ownership) return; // Only allow in managed channels

        const voteKey = `${channelId}-${targetUser}`;
        const now = Date.now();

        if (!this.activeVotes.has(voteKey)) {
            this.activeVotes.set(voteKey, {
                targetUser,
                voters: new Set(),
                expiresAt: now + this.settings.voteBanWindowMs
            });
        }

        const voteData = this.activeVotes.get(voteKey)!;
        voteData.voters.add(voterId);

        const currentVoiceStates = Object.values(VoiceStateStore.getVoiceStatesForChannel(channelId) || {});
        const occupantCount = currentVoiceStates.length;
        const requiredVotes = Math.ceil(occupantCount * (this.settings.voteBanPercentage / 100));

        sendDebugMessage(channelId, `Vote registered against ${targetUser} by ${voterId}. (${voteData.voters.size}/${requiredVotes})`);

        if (voteData.voters.size >= requiredVotes) {
            logger.info(`Vote threshold reached for ${targetUser}. Executing ban policy.`);
            this.enforceBanPolicy(targetUser, channelId, false); // Votebans do not offer kick warnings (immediate)
            this.activeVotes.delete(voteKey);
        }
    },

    cleanupExpiredVotes() {
        const now = Date.now();
        for (const [key, data] of this.activeVotes.entries()) {
            if (data.expiresAt < now) {
                logger.debug(`Expiring vote ban for ${key}`);
                this.activeVotes.delete(key);
            }
        }
    },

    banUsers(members: (MemberLike | string)[], channelId: string) {
        if (!this.settings) return;
        for (const member of members) {
            const userId = extractId(member);
            if (!userId) continue;
            this.enforceBanPolicy(userId, channelId, false);
        }
    },

    banUser(member: MemberLike | string, channelId: string) {
        this.banUsers([member], channelId);
    }
};
