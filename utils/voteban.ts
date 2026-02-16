import { settings } from "../settings";
import { actionQueue, ActionType } from "../state";
import { log } from "./logging";
import { getOwnerForChannel } from "./ownership";
import { isWhitelisted } from "./kicklist";
import { processQueue } from "../logic";
import { VoiceStateStore } from "@webpack/common";
import { toDiscordTime } from "./formatting";

const activeVotes = new Map<string, { voters: Set<string>, expires: number }>();

export function handleVoteBan(message: any, channelId: string) {
    if (!settings.store.voteBanEnabled) return;

    const content = message.content;
    const voteCommand = settings.store.voteBanCommand.replace("{target}", "(\\d+| <@!?(\\d+)>|.*?)");
    const regex = new RegExp(voteCommand, "i");
    const match = content.match(regex);

    if (!match) return;

    const targetArg = match[1].trim();
    let targetUserId = targetArg.match(/<@!?(\d+)>/)?.[1] || (targetArg.match(/^\d+$/) ? targetArg : null);

    if (!targetUserId) {
        log(`Voteban: Could not parse user ID from ${targetArg}`);
        return;
    }

    // Check if target is in our channel
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
    if (!voiceStates || !voiceStates[targetUserId]) return;

    // Check if target is whitelisted
    if (isWhitelisted(targetUserId)) {
        log(`Voteban: Target ${targetUserId} is whitelisted, ignoring.`);
        return;
    }

    const voterId = message.author.id;
    if (voterId === targetUserId) return; // Can't vote ban self

    // Check if owner is excluded
    const ownerInfo = getOwnerForChannel(channelId);
    if (voterId === ownerInfo?.userId) return;

    const voteKey = `${channelId}:${targetUserId}`;
    let vote = activeVotes.get(voteKey);
    const now = Date.now();

    if (!vote || vote.expires < now) {
        vote = { voters: new Set(), expires: now + (settings.store.voteExpireMinutes * 60 * 1000) };
        activeVotes.set(voteKey, vote);
    }

    vote.voters.add(voterId);

    // Send ephemeral confirmation
    const { sendBotMessage } = require("@api/Commands");
    const uniqueVoteMsg = settings.store.voteSubmittedMessage
        .replace(/{user_id}/g, voterId)
        .replace(/{target_user_id}/g, targetUserId)
        .replace(/{discordtime}/g, toDiscordTime(vote.expires, true));

    sendBotMessage(channelId, { content: uniqueVoteMsg });

    // Check if enough votes
    const totalUsersInVC = Object.keys(voiceStates).length;
    const votersRequiredPool = totalUsersInVC - (ownerInfo?.userId ? 1 : 0) - 1;
    const requiredVotes = Math.ceil((settings.store.voteRequiredPercent / 100) * votersRequiredPool);

    log(`Voteban status for ${targetUserId} in ${channelId}: ${vote.voters.size}/${requiredVotes} (Pool: ${votersRequiredPool})`);

    if (vote.voters.size >= requiredVotes) {
        log(`Voteban: Threshold reached for ${targetUserId}, banning...`);
        actionQueue.push({
            type: ActionType.BAN,
            userId: targetUserId,
            channelId: channelId,
        } as any);
        processQueue();
        activeVotes.delete(voteKey);
    }
}
