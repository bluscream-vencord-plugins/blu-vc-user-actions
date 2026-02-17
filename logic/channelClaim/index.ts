import { settings } from "../../settings";
import { state, channelOwners, memberInfos, setMemberInfo, OwnerEntry, ChannelCreator, ChannelClaimant, saveState, MemberChannelInfo, ActionType } from "../../state";
import { log } from "../../utils/logging";
import { formatclaimCommand, formatInfoCommand } from "./formatting";
import { formatMessageCommon } from "../../utils/formatting";
import { queueAction } from "../queue";
import { BotResponse, BotResponseType } from "../../utils/BotResponse";
import { startRotation, stopRotation } from "../channelName";
import { jumpToFirstMessage } from "../../utils/navigation"; // Assuming navigation stays in utils? Plan said nothing about navigation.
// logic.ts imported: navigateTo, jumpToFirstMessage from "./utils".
// I'll keep them in utils/navigation.ts (already there).

import {
    ChannelStore, GuildStore, GuildChannelStore, UserStore, MessageStore, RestAPI, Constants, SelectedChannelStore
} from "@webpack/common";
import { sendMessage } from "@utils/discord";

export function updateOwner(channelId: string, owner: OwnerEntry): boolean {
    let ownership = channelOwners.get(channelId);
    if (!ownership) {
        ownership = {};
        channelOwners.set(channelId, ownership);
    }

    let changed = false;

    if (owner.reason === "Channel Created" || owner.reason === "Created") {
        if (!ownership.creator || ownership.creator.userId !== owner.userId) {
            ownership.creator = new ChannelCreator(owner.userId, owner.reason, owner.timestamp);
            changed = true;
        }
    } else if (owner.reason === "Channel Claimed" || owner.reason === "Claimed") {
        if (ownership.claimant?.userId !== owner.userId) { // Logic fix: remove !
            // original logic.ts: if (ownership.claimant?.userId !== owner.userId)
            // wait, utils/ownership.ts had: if (ownership.claimant?.userId !== owner.userId)
            // I'll stick to original logic.
            if (ownership.claimant?.userId !== owner.userId) {
                ownership.claimant = new ChannelClaimant(owner.userId, owner.reason, owner.timestamp);
                changed = true;
            }
        }
    }

    if (changed) {
        saveState();
    }

    return changed;
}

export function notifyOwnership(channelId: string) {
    const { sendBotMessage } = require("@api/Commands");
    if (!settings.store.enabled) return;

    const ownership = channelOwners.get(channelId);
    if (!ownership) return;

    const channel = ChannelStore.getChannel(channelId);
    if (channel?.parent_id !== settings.store.categoryId) return;

    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

    const ownerInfo = ownership.claimant || ownership.creator;
    if (!ownerInfo) return;

    const owner = UserStore.getUser(ownerInfo.userId);
    const ownerName = owner?.globalName || owner?.username || ownerInfo.userId;
    const formatted = settings.store.ownershipChangeMessage
        .replace(/{reason}/g, ownerInfo.reason)
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
        .replace(/{guild_id}/g, channel?.guild_id || "")
        .replace(/{guild_name}/g, guild?.name || "Unknown Guild")
        .replace(/{user_id}/g, ownerInfo.userId)
        .replace(/{user_name}/g, ownerName);

    sendBotMessage(channelId, {
        content: formatMessageCommon(formatted),
    });
}

export async function checkChannelOwner(channelId: string, botId: string): Promise<OwnerEntry> {
    const fallback: OwnerEntry = { userId: "", reason: "Unknown", timestamp: Date.now() };
    const cached = MessageStore.getMessages(channelId);
    let owner: OwnerEntry | null = null;

    const msgsArray = cached ? (cached.toArray ? cached.toArray() : cached) : [];

    for (let i = 0; i < msgsArray.length; i++) {
        const msg = msgsArray[i];
        const response = new BotResponse(msg, botId);
        const isBot = msg.author.id === botId;
        const isOwnership = response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED);

        if (isOwnership) {
            owner = {
                userId: response.initiatorId!,
                reason: response.type,
                timestamp: response.timestamp
            };
            updateOwner(channelId, owner);
        }
    }

    const currentOwnership = channelOwners.get(channelId);
    if (!currentOwnership?.creator) {
        const BATCH_LIMIT = 100;
        const MAX_BATCHES = 5;
        let collectedBatches: any[][] = [];
        let beforeId: string | undefined;

        for (let batch = 0; batch < MAX_BATCHES; batch++) {
            try {
                const query: any = { limit: BATCH_LIMIT };
                if (beforeId) query.before = beforeId;

                const res = await RestAPI.get({
                    url: Constants.Endpoints.MESSAGES(channelId),
                    query
                });

                if (!res.body || !Array.isArray(res.body) || res.body.length === 0) break;

                const messages = res.body;
                collectedBatches.push(messages);

                let foundCreation = false;
                for (const msg of messages) {
                    const response = new BotResponse(msg, botId);
                    if (response.type === BotResponseType.CREATED) {
                        foundCreation = true;
                        break;
                    }
                }

                if (foundCreation) break;

                beforeId = messages[messages.length - 1].id;
            } catch (e) {
                log(`[OwnershipCheck] Error fetching batch ${batch + 1}:`, e);
                break;
            }
        }

        // Process batches from Oldest to Newest
        for (let b = collectedBatches.length - 1; b >= 0; b--) {
            const batch = collectedBatches[b];
            for (let i = batch.length - 1; i >= 0; i--) {
                const msg = batch[i];
                const response = new BotResponse(msg, botId);
                const isOwnership = response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED);

                if (isOwnership) {
                    owner = {
                        userId: response.initiatorId!,
                        reason: response.type,
                        timestamp: response.timestamp
                    };
                    updateOwner(channelId, owner);
                }
            }
        }
    }

    return owner || fallback;
}

export async function fetchAllOwners() {
    const guildId = settings.store.guildId;
    const categoryId = settings.store.categoryId;
    const channels = GuildChannelStore.getChannels(guildId);
    if (!channels || !channels.SELECTABLE) return;

    log(`Batch fetching owners for category ${categoryId}...`);
    const targetChannels = channels.SELECTABLE.filter(({ channel }) => channel.parent_id === categoryId);

    for (const { channel } of targetChannels) {
        await checkChannelOwner(channel.id, settings.store.botId);
        await new Promise(r => setTimeout(r, 200));
    }
    log(`Finished batch fetching owners.`);
}

export function claimChannel(channelId: string, formerOwnerId?: string) {
    const formatted = formatclaimCommand(channelId, formerOwnerId);
    log(`Automatically claiming channel ${channelId}: ${formatted}`);
    sendMessage(channelId, { content: formatted });
}

export function requestChannelInfo(channelId: string) {
    const requestedInfo = state.requestedInfo || new Map<string, number>(); // Need to ensure state has requestedInfo or module level variable?
    // logic.ts used module level variable `requestedInfo`.
    // I should probably use module level variable here too.
    // Or move it to state? Since state is persisted?
    // requestedInfo is cache, likely transient. logic.ts defined it outside function.

    // I need to declare it here.
    // But if I want to persist it across reloads (HMR), it should be in state.ts.
    // logic.ts had it as: const requestedInfo = new Map<string, number>();
    // So it resets on HMR.

    if (!state.requestedInfo) state.requestedInfo = new Map();

    const now = Date.now();
    const lastRequest = state.requestedInfo.get(channelId) || 0;
    if (now - lastRequest < 5000) {
        log(`Skipping channel info request for ${channelId} (cooldown)`);
        return;
    }
    state.requestedInfo.set(channelId, now);

    log(`Queuing channel info request for ${channelId}`);
    const msg = formatInfoCommand(channelId);
    queueAction({
        type: ActionType.INFO,
        userId: UserStore.getCurrentUser()?.id || "",
        channelId: channelId,
        guildId: ChannelStore.getChannel(channelId)?.guild_id || settings.store.guildId,
        external: msg
    });
}

export function getMemberInfoForChannel(channelId: string): MemberChannelInfo | undefined {
    const ownership = channelOwners.get(channelId);
    if (!ownership) return undefined;

    if (ownership.claimant) {
        const info = memberInfos.get(ownership.claimant.userId);
        if (info) return info;
    }
    if (ownership.creator) {
        return memberInfos.get(ownership.creator.userId);
    }
    return undefined;
}

export function handleInfoUpdate(channelId: string, info: MemberChannelInfo) {
    let targetOwnerId = info.ownerId;

    if (!targetOwnerId) {
        const ownership = channelOwners.get(channelId);
        targetOwnerId = ownership?.creator?.userId || ownership?.claimant?.userId;
    }

    if (targetOwnerId) {
        if (!info.ownerId) info.ownerId = targetOwnerId;
        setMemberInfo(targetOwnerId, info);
        log(`Updated member info for ${targetOwnerId} (via channel ${channelId})`);
    } else {
        log(`Could not update info for ${channelId}: Owner unknown.`);
    }

    if (settings.store.showChannelInfoChangeMessage) {
        const { sendBotMessage } = require("@api/Commands");
        const lines: string[] = [];
        if (info.name) lines.push(`**Name:** ${info.name}`);
        if (info.limit) lines.push(`**Limit:** ${info.limit}`);
        if (info.status) lines.push(`**Status:** ${info.status}`);
        if (info.permitted.length > 0) lines.push(`**Permitted:** ${info.permitted.length} users`);
        if (info.banned.length > 0) lines.push(`**Banned:** ${info.banned.length} users`);

        sendBotMessage(channelId, { content: lines.join("\n") });
    }
}

export function handleBotResponse(response: BotResponse) {
    const initiatorId = response.initiatorId;
    if (!initiatorId) return;

    const info = memberInfos.get(initiatorId);
    if (!info) return;

    const description = response.getRawDescription();
    const targetMatch = description.match(/<@!?(\d+)>/);
    const targetUserId = targetMatch ? targetMatch[1] : undefined;

    let changed = false;

    switch (response.type) {
        case BotResponseType.BANNED:
            if (targetUserId && !info.banned.includes(targetUserId)) {
                info.banned.push(targetUserId);
                changed = true;
                log(`Dynamically added ${targetUserId} to banned list for ${initiatorId}`);
            }
            break;
        case BotResponseType.UNBANNED:
            if (targetUserId) {
                const initialLen = info.banned.length;
                info.banned = info.banned.filter(id => id !== targetUserId);
                if (info.banned.length !== initialLen) {
                    changed = true;
                    log(`Dynamically removed ${targetUserId} from banned list for ${initiatorId}`);
                }
            }
            break;
        case BotResponseType.PERMITTED:
            if (targetUserId && !info.permitted.includes(targetUserId)) {
                info.permitted.push(targetUserId);
                changed = true;
                log(`Dynamically added ${targetUserId} to permitted list for ${initiatorId}`);
            }
            break;
        case BotResponseType.UNPERMITTED:
            if (targetUserId) {
                const initialLen = info.permitted.length;
                info.permitted = info.permitted.filter(id => id !== targetUserId);
                if (info.permitted.length !== initialLen) {
                    changed = true;
                    log(`Dynamically removed ${targetUserId} from permitted list for ${initiatorId}`);
                }
            }
            break;
        case BotResponseType.SIZE_SET:
            const sizeMatch = description.match(/\*\*(\d+)\*\*/);
            if (sizeMatch) {
                const newLimit = parseInt(sizeMatch[1]);
                if (info.limit !== newLimit) {
                    info.limit = newLimit;
                    changed = true;
                    log(`Dynamically updated limit to ${info.limit} for ${initiatorId}`);
                }
            }
            break;
        case BotResponseType.LOCKED:
            if (!info.status || !info.status.includes("locked")) {
                info.status = info.status ? info.status + ", locked" : "locked";
                changed = true;
                log(`Dynamically updated status to locked for ${initiatorId}`);
            }
            break;
        case BotResponseType.UNLOCKED:
            if (info.status && info.status.includes("locked")) {
                info.status = info.status.replace(/,? ?locked/, "").trim();
                if (info.status === "") info.status = undefined;
                changed = true;
                log(`Dynamically updated status to unlocked for ${initiatorId}`);
            }
            break;
    }

    if (changed) {
        setMemberInfo(initiatorId, info);
    }
}

export function handleOwnershipChange(channelId: string, ownerId: string) {
    const me = UserStore.getCurrentUser();
    const currentVoiceChannelId = SelectedChannelStore.getVoiceChannelId();

    // Only handle ownership changes for the current channel, or if we are not in a channel, or if we were already rotating this channel
    if (currentVoiceChannelId && channelId !== currentVoiceChannelId && !state.rotationIntervals.has(channelId)) {
        return;
    }

    log(`Ownership change for ${channelId}: owner is ${ownerId}, me is ${me?.id}`);
    if (ownerId === me?.id) {
        log(`We are the owner! Starting rotation and requesting channel info`);
        startRotation(channelId);
        requestChannelInfo(channelId);

        if (settings.store.autoNavigateToOwnedChannel && channelId === currentVoiceChannelId) {
            const channel = ChannelStore.getChannel(channelId);
            jumpToFirstMessage(channelId, channel?.guild_id);
        }
    } else {
        if (state.rotationIntervals.has(channelId)) {
            log(`We are no longer the owner of ${channelId}, stopping rotation.`);
        }
        stopRotation(channelId);
    }
}

export function handleOwnerUpdate(channelId: string, owner: OwnerEntry) {
    if (updateOwner(channelId, owner)) {
        notifyOwnership(channelId);
        handleOwnershipChange(channelId, owner.userId);
    }
}
