import { PluginModule } from "../utils/moduleRegistry";
import { logger } from "../utils/logger";
import { VoiceStateStore } from "@webpack/common";
import { ApplicationCommandOptionType } from "@api/Commands";
import { stateManager } from "../utils/stateManager";
import { sendDebugMessage } from "../utils/debug";
import { BansModule } from "./bans";
import { OptionType } from "@utils/types";
import { defaultSettings } from "../settings";

export const voteBanningSettings = {
    voteBanCommandString: { type: OptionType.STRING, description: "Command users type to vote-ban someone (e.g. !vote ban {user})", default: "!vote ban {user}", restartNeeded: false },
    voteBanPercentage: { type: OptionType.SLIDER, description: "Percentage of channel occupants required to pass a vote ban", default: 50, markers: [10, 25, 50, 75, 100], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanPercentage = Math.round(v); } },
    voteBanWindowSecs: { type: OptionType.SLIDER, description: "Seconds a vote-ban stays open before expiring", default: 5 * 60, markers: [30, 60, 120, 300, 600, 1800], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanWindowSecs = Math.round(v); } },
};

export type VoteBanningSettingsType = typeof voteBanningSettings;

export const VoteBanningModule: PluginModule = {
    name: "VoteBanningModule",
    requiredDependencies: ["BansModule"],
    settingsSchema: voteBanningSettings,
    settings: null as unknown as Record<string, any>,
    activeVotes: new Map<string, { targetUser: string, voters: Set<string>, expiresAt: number }>(),

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("VoteBanningModule initializing");

        // Cleanup expired votes every minute
        setInterval(() => this.cleanupExpiredVotes(), 60000);
    },

    stop() {
        this.activeVotes.clear();
        logger.info("VoteBanningModule stopping");
    },

    externalCommands: [
        {
            name: "vote ban",
            description: "Initiate a vote ban against a user",
            options: [
                { name: "target", description: "The user to vote ban", type: ApplicationCommandOptionType.USER, required: true },
                { name: "reason", description: "The reason for the vote ban", type: ApplicationCommandOptionType.STRING, required: false }
            ],
            checkPermission: (msg, s) => {
                const voterId = msg.author.id;
                const voterVoiceState = VoiceStateStore.getVoiceStateForUser(voterId);
                // Voter must be in a Voice Channel to initiate a vote ban
                return !!(voterVoiceState && voterVoiceState.channelId);
            },
            execute: (args, msg, channelId) => {
                const targetUser = args.target;
                const reason = args.reason || "";
                if (!targetUser) return false;

                const voterId = msg.author.id;
                const voterVoiceState = VoiceStateStore.getVoiceStateForUser(voterId);
                // We know this exists because checkPermission passed
                const vcId = voterVoiceState!.channelId!;
                const guildId = voterVoiceState!.guildId!;

                // Usually message is in text channel, but we bind vote to their current VC
                VoteBanningModule.registerVote(targetUser, voterId, vcId, guildId, reason);
                return true;
            }
        }
    ],

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
        const requiredVotes = Math.ceil(occupantCount * ((this.settings as any).voteBanPercentage / 100));

        sendDebugMessage(`Vote registered against ${targetUser} by ${voterId}. (${voteData.voters.size}/${requiredVotes})`, channelId);

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
