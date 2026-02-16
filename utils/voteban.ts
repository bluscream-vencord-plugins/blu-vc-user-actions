import { settings } from "../settings";
import { actionQueue, ActionType } from "../state";
import { log } from "./logging";
import { getOwnerForChannel } from "./ownership";
import { isWhitelisted } from "./kicklist";
import { VoiceStateStore } from "@webpack/common";

const activeVotes = new Map<string, { voters: Set<string>, expires: number }>();

export function handleVoteBan(message: any, channelId: string) {
    const isEnabled = settings.store.voteBanEnabled;
    if (!isEnabled) return;

    const content = message.content;
    const voteCommandTemplate = settings.store.voteBanCommand;

    let regexSource: string = voteCommandTemplate;
    let regex: RegExp = new RegExp(regexSource, "i");

    const match = content.match(regex);
    if (!match) return;

    const targetArg = match[1].trim();
    let targetUserId = targetArg.match(/<@!?(\d+)>/)?.[1] || (targetArg.match(/^\d+$/) ? targetArg : null);

    if (!targetUserId) return;

    // Check if target is in our channel
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
    if (!voiceStates || !voiceStates[targetUserId]) return;

    // Check if target is whitelisted
    if (isWhitelisted(targetUserId)) return;

    const voterId = message.author.id;
    if (voterId === targetUserId) return;

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

    if (vote.voters.has(voterId)) return;

    vote.voters.add(voterId);

    // Send ephemeral confirmation
    const { sendBotMessage } = require("@api/Commands");
    const seconds = Math.floor(vote.expires / 1000);
    const uniqueVoteMsg = settings.store.voteSubmittedMessage
        .replace(/{user_id}/g, voterId)
        .replace(/{target_user_id}/g, targetUserId)
        .replace(/{expires}/g, seconds.toString());

    sendBotMessage(channelId, { content: uniqueVoteMsg });

    // Check if enough votes
    const totalUsersInVC = Object.keys(voiceStates).length;
    const votersRequiredPool = totalUsersInVC - (ownerInfo?.userId ? 1 : 0) - 1;
    const requiredVotes = Math.ceil((settings.store.voteRequiredPercent / 100) * votersRequiredPool);

    if (vote.voters.size >= requiredVotes) {
        log(`Voteban: Threshold reached for ${targetUserId}, banning...`);
        actionQueue.push({
            type: ActionType.BAN,
            userId: targetUserId,
            channelId: channelId,
        } as any);
        require("../logic").processQueue();
        activeVotes.delete(voteKey);
    }
}
