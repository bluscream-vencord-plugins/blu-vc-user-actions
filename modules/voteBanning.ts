import { PluginModule } from "../types/module";
import { logger } from "../utils/logger";
import { VoiceStateStore } from "@webpack/common";
import { ApplicationCommandOptionType } from "@api/Commands";
import { stateManager } from "../utils/state";
import { sendDebugMessage } from "../utils/debug";
import { BansModule } from "./bans";
import { OptionType } from "@utils/types";

/**
 * Settings definitions for the VoteBanningModule.
 */
export const voteBanningSettings = {
    /** The command template for initiating a vote ban via text. */
    voteBanCommandString: { type: OptionType.STRING, description: "Command users type to vote-ban someone (e.g. !vote ban {user})", default: "!vote ban {user}", restartNeeded: false },
    /** The percentage of users in the voice channel required to approve a ban. */
    voteBanPercentage: { type: OptionType.SLIDER, description: "Percentage of channel occupants required to pass a vote ban", default: 50, markers: [10, 25, 50, 75, 100], stickToMarkers: false, restartNeeded: false },
    /** The time window in seconds during which a vote-ban remains active. */
    voteBanWindowSecs: { type: OptionType.SLIDER, description: "Seconds a vote-ban stays open before expiring", default: 300, markers: [30, 60, 120, 300, 600, 1800], stickToMarkers: false, restartNeeded: false },
};

export type VoteBanningSettingsType = typeof voteBanningSettings;

export const VoteBanningModule: PluginModule = {
    name: "VoteBanningModule",
    description: "Allows users in a voice channel to collectively vote to ban another user.",
    requiredDependencies: ["BansModule"],
    settingsSchema: voteBanningSettings,
    settings: null,
    activeVotes: new Map<string, { targetUser: string, voters: Set<string>, expiresAt: number }>(),

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("VoteBanningModule initializing");
        setInterval(() => this.cleanupExpiredVotes(), 60000);
    },

    stop() {
        this.activeVotes.clear();
        logger.info("VoteBanningModule stopping");
    },

    /**
     * Internal command definitions that ModuleRegistry can handle.
     */
    externalCommands: [
        {
            name: "vote ban",
            description: "Initiate a vote ban against a user",
            options: [
                { name: "target", description: "The user to vote ban", type: ApplicationCommandOptionType.USER, required: true },
                { name: "reason", description: "The reason for the vote ban", type: ApplicationCommandOptionType.STRING, required: false }
            ],
            checkPermission: (msg) => {
                const voterId = msg.author.id;
                const voterVoiceState = VoiceStateStore.getVoiceStateForUser(voterId);
                return !!(voterVoiceState && voterVoiceState.channelId);
            },
            execute: (args, msg) => {
                const targetUser = args.target;
                const reason = args.reason || "";
                if (!targetUser) return false;

                const voterId = msg.author.id;
                const voterVoiceState = VoiceStateStore.getVoiceStateForUser(voterId);
                const vcId = voterVoiceState!.channelId!;
                const guildId = voterVoiceState!.guildId!;

                VoteBanningModule.registerVote(targetUser, voterId, vcId, guildId, reason);
                return true;
            }
        }
    ],

    registerVote(targetUser: string, voterId: string, channelId: string, guildId: string, reason?: string) {
        if (!this.settings) return;
        const ownership = stateManager.getOwnership(channelId);
        if (!ownership) return;

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
            BansModule.enforceBanPolicy(targetUser, channelId, false, reason || "Vote Ban");
            this.activeVotes.delete(voteKey);
        }
    },

    cleanupExpiredVotes() {
        const now = Date.now();
        for (const [key, data] of this.activeVotes.entries()) {
            if (data.expiresAt < now) {
                this.activeVotes.delete(key);
            }
        }
    }
};
