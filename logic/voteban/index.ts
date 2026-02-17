import { settings } from "../../settings";
import { ActionType, channelOwners } from "../../state";
import { log } from "../../utils/logging";
import { isWhitelisted } from "../whitelist";
import { queueAction } from "../queue";
import { formatBanCommand } from "../blacklist/formatting";
import { formatVoteSubmittedMessage } from "./formatting";
import { VoiceStateStore, UserStore } from "@webpack/common";

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

    // Check if we are the owner (Voting only works if WE are the owner)
    const me = UserStore.getCurrentUser();
    const ownership = channelOwners.get(channelId);

    if (!me || !ownership) return;

    const isOwner = (ownership.creator?.userId === me.id) || (ownership.claimant?.userId === me.id);
    if (!isOwner) return;

    // Check if target is in our channel
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
    if (!voiceStates || !voiceStates[targetUserId]) return;

    // Check if target is whitelisted
    if (isWhitelisted(targetUserId)) return;

    const voterId = message.author.id;
    if (voterId === targetUserId) return;

    // Check if owner is excluded (Owner cannot vote, they should just ban)
    if (voterId === ownership.creator?.userId || voterId === ownership.claimant?.userId) return;

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
    const uniqueVoteMsg = formatVoteSubmittedMessage(voterId, targetUserId, vote.expires);

    sendBotMessage(channelId, { content: uniqueVoteMsg });

    // Check if enough votes
    const totalUsersInVC = Object.keys(voiceStates).length;
    const ownerCount = (ownership.creator?.userId ? 1 : 0) + (ownership.claimant?.userId && ownership.claimant.userId !== ownership.creator?.userId ? 1 : 0);
    const votersRequiredPool = totalUsersInVC - ownerCount - 1;
    const requiredVotes = Math.ceil((settings.store.voteRequiredPercent / 100) * votersRequiredPool);

    if (vote.voters.size >= requiredVotes) {
        log(`Voteban: Threshold reached for ${targetUserId}, banning...`);
        const banMsg = formatBanCommand(channelId, targetUserId);
        queueAction({
            type: ActionType.BAN,
            userId: targetUserId,
            channelId: channelId,
            external: banMsg
        });
        activeVotes.delete(voteKey);
    }
}
