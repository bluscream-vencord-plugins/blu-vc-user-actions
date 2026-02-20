import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { VoiceStateStore } from "@webpack/common";
import { Message } from "@vencord/discord-types";
import { stateManager } from "../utils/stateManager";
import { sendDebugMessage } from "../utils/debug";
import { BansModule } from "./bans";

export const VoteBanningModule: SocializeModule = {
    name: "VoteBanningModule",
    settings: null as unknown as PluginSettings,
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

    onMessageCreate(message: Message) {
        if (!this.settings || !this.settings.botId || !this.settings.voteBanRegex) return;

        const regex = new RegExp(this.settings.voteBanRegex, "i");
        const match = message.content.match(regex);

        if (match) {
            const targetUser = match.groups?.target;
            const reason = match.groups?.reason || "";
            if (!targetUser) return;

            const voterId = message.author.id;
            const voterVoiceState = VoiceStateStore.getVoiceStateForUser(voterId);
            if (!voterVoiceState || !voterVoiceState.channelId) return;

            this.registerVote(targetUser, voterId, voterVoiceState.channelId, voterVoiceState.guildId, reason);
        }
    },

    registerVote(targetUser: string, voterId: string, channelId: string, guildId: string, reason?: string) {
        if (!this.settings) return;
        const ownership = stateManager.getOwnership(channelId);
        if (!ownership) return; // Only allow in managed channels

        const voteKey = `${channelId}-${targetUser}`;
        const now = Date.now();

        if (!this.activeVotes.has(voteKey)) {
            this.activeVotes.set(voteKey, {
                targetUser,
                voters: new Set(),
                expiresAt: now + ((this.settings as any).voteBanWindowSecs ?? 300) * 1000
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
            BansModule.enforceBanPolicy(targetUser, channelId, false, reason || "Vote Ban");
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
