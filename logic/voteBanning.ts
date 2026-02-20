import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { UserStore as Users, VoiceStateStore } from "@webpack/common";
export const VoteBanningModule: SocializeModule = {
    name: "VoteBanningModule",
    settings: null as any,
    activeVotes: new Map<string, { targetUser: string, voters: Set<string>, expiresAt: number }>(),

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("VoteBanningModule initializing");

        // Cleanup expired votes every minute
        setInterval(() => this.cleanupExpiredVotes(), 60000);
    },

    stop() {
        this.activeVotes.clear();
        logger.info("VoteBanningModule stopping");
    },

    onMessageCreate(message: any) {
        // Look for chat regex patterns, like "!voteban @user" or similar in our watched channel
        // For simplicity, checking if content starts with "!voteban"
        if (message.content.startsWith("!voteban")) {
            const mentions = message.mentions;
            if (!mentions || mentions.length === 0) return;

            const targetUser = mentions[0].id;
            const voterId = message.author.id;
            const channelId = message.channel_id; // Note: this is text channel. Need equivalent Voice Channel.

            // Assume the user is in a voice channel
            const voterVoiceState = VoiceStateStore.getVoiceStateForUser(voterId);
            if (!voterVoiceState || !voterVoiceState.channelId) return;

            this.registerVote(targetUser, voterId, voterVoiceState.channelId);
        }
    },

    registerVote(targetUser: string, voterId: string, channelId: string) {
        const ownership = stateManager.getOwnership(channelId);
        if (!ownership) return; // Only allow in managed channels

        const now = Date.now();
        const voteKey = `${channelId}-${targetUser}`;

        if (!this.activeVotes.has(voteKey)) {
            this.activeVotes.set(voteKey, {
                targetUser,
                voters: new Set(),
                expiresAt: now + this.settings.voteBanWindowMs
            });
        }

        const voteData = this.activeVotes.get(voteKey)!;
        voteData.voters.add(voterId);

        // Calculate threshold
        const currentVoiceStates = Object.values(VoiceStateStore.getVoiceStatesForChannel(channelId) || {});
        // +1 to exclude bot, basic estimation
        const occupantCount = currentVoiceStates.length;

        const requiredVotes = Math.ceil(occupantCount * (this.settings.voteBanPercentage / 100));

        logger.info(`Vote registered against ${targetUser} by ${voterId}. ${voteData.voters.size} / ${requiredVotes}`);

        if (voteData.voters.size >= requiredVotes) {
            logger.info(`Vote threshold reached for ${targetUser}. Executing ban.`);

            // Enqueue ban via action queue
            const cmd = this.settings.banCommand.replace("{user}", `<@${targetUser}>`);
            actionQueue.enqueue(cmd, channelId, true);

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
    }
};
