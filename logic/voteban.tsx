import { OptionType } from "@utils/types";
import { ActionType, channelOwners } from "../state";
import { log, error } from "../utils/logging";
import { queueAction } from "./queue";
import { formatBanCommand } from "../utils/formatting";
import { PluginModule } from "../types/PluginModule";
import { type Message } from "@vencord/discord-types";
import { sendBotMessage } from "@api/Commands";
import { VoiceStateStore } from "@webpack/common";

// #region Settings
// #endregion

export function formatVoteSubmitted(voterId: string, targetId: string, expireTime: number): string {
    const { settings } = require("../settings");
    const msg = settings.store.voteBanSubmitMessage as string;
    return msg
        .replace(/{voter_id}/g, voterId)
        .replace(/{target_id}/g, targetId)
        .replace(/{expire_time}/g, expireTime.toString());
}

// #region Logic
const activeVotes = new Map<string, Set<string>>(); // targetId -> Set<voterId>

export function handleVoteBan(message: Message, channelId: string, guildId: string) {
    const { settings } = require("../settings");
    if (!settings.store.voteBanEnabled) return;

    const regex = new RegExp(settings.store.voteBanRegex as string, "i");
    const match = message.content.match(regex);
    if (!match) return;

    const targetId = match[1];
    const voterId = message.author.id;

    const ownership = channelOwners.get(channelId);
    const isOwner = ownership?.creator?.userId === voterId || ownership?.claimant?.userId === voterId;

    if (isOwner) {
        log(`Owner ${voterId} used vote ban command, bypassing threshold.`);
        queueAction({
            type: ActionType.BAN,
            userId: targetId,
            channelId: channelId,
            guildId: guildId,
            external: formatBanCommand(channelId, targetId)
        });
        return;
    }

    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
    if (!voiceStates[voterId]) {
        log(`User ${voterId} not in channel ${channelId}, ignoring vote.`);
        return;
    }
    if (!voiceStates[targetId]) {
        log(`Target ${targetId} not in channel ${channelId}, ignoring vote.`);
        return;
    }

    let votes = activeVotes.get(targetId);
    if (!votes) {
        votes = new Set();
        activeVotes.set(targetId, votes);
        const expireTime = (settings.store.voteBanExpireTime as number) * 60 * 1000;
        setTimeout(() => activeVotes.delete(targetId), expireTime);
    }

    if (votes.has(voterId)) return;
    votes.add(voterId);

    const occupantCount = Object.keys(voiceStates).length;
    const percentage = settings.store.voteBanPercentage as number;
    const requiredVotes = Math.ceil((occupantCount * percentage) / 100);

    log(`Vote ban for ${targetId} in ${channelId}: ${votes.size}/${requiredVotes} (Occupants: ${occupantCount})`);

    if (votes.size >= requiredVotes) {
        sendBotMessage(channelId, { content: `✅ Vote threshold met! Banning <@${targetId}>.` });
        queueAction({
            type: ActionType.BAN,
            userId: targetId,
            channelId: channelId,
            guildId: guildId,
            external: formatBanCommand(channelId, targetId)
        });
        activeVotes.delete(targetId);
    } else {
        const expireTime = settings.store.voteBanExpireTime as number;
        sendBotMessage(channelId, { content: formatVoteSubmitted(voterId, targetId, expireTime) });
    }
}

export const VotebanModule: PluginModule = {
    id: "voteban",
    name: "Vote Banning",
    settings: {
        voteBanEnabled: {
            type: OptionType.BOOLEAN as const,
            description: "Enable vote ban system",
            default: false,
            restartNeeded: false,
        },
        voteBanPercentage: {
            type: OptionType.NUMBER as const,
            description: "Percentage of channel occupants required to ban",
            default: 51,
            min: 1,
            max: 100,
            restartNeeded: false,
        },
        voteBanExpireTime: {
            type: OptionType.NUMBER as const,
            description: "Time in minutes before a vote expires",
            default: 5,
            restartNeeded: false,
        },
        voteBanSubmitMessage: {
            type: OptionType.STRING as const,
            description: "Message to send when a vote is submitted",
            default: "🗳️ <@{voter_id}> voted to ban <@{target_id}>. (Expires in {expire_time}m)",
            restartNeeded: false,
        },
        voteBanRegex: {
            type: OptionType.STRING as const,
            description: "Regex to detect vote ban commands",
            default: "^vk\\s+<@!?(\\d+)>",
            restartNeeded: false,
        },
    },
    onMessageCreate: (message, channelId, guildId) => {
        if (channelId) {
            handleVoteBan(message, channelId, guildId || "");
        }
    }
};
