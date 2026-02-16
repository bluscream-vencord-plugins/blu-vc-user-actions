import { sendMessage as _sendMessage } from "@utils/discord";
import {
    ChannelStore,
    GuildStore,
    GuildChannelStore,
    UserStore,
    MessageStore,
    RestAPI,
    Constants,
    showToast,
    SelectedChannelStore,
    VoiceStateStore,
} from "@webpack/common";
import { findStoreLazy } from "@webpack";
const ReferencedMessageStore = findStoreLazy("ReferencedMessageStore");
import { settings } from "./settings";
import { actionQueue, processedUsers, state, setMemberInfo, memberInfos, ActionType, OwnerEntry, MemberChannelInfo, channelOwners } from "./state";
import { formatMessageCommon, updateOwner, getOwnerForChannel, formatclaimCommand, navigateTo, jumpToFirstMessage, formatWhitelistSkipMessage } from "./utils";
import { getKickList, setKickList, isWhitelisted } from "./utils/kicklist";
import { startRotation, stopRotation } from "./utils/rotation";
import { BotResponse, BotResponseType } from "./utils/BotResponse";

const sendMessage = (channelId: string, options: any) => {
    if (channelId === settings.store.createChannelId) {
        log(`Blocked message to createChannelId: ${channelId}`);
        return;
    }
    _sendMessage(channelId, options);
};

export async function processQueue() {
    const { sendBotMessage } = require("@api/Commands");
    if (state.isProcessing || actionQueue.length === 0) return;
    state.isProcessing = true;

    while (actionQueue.length > 0) {
        const item = actionQueue.shift();
        if (!item) continue;

        const { userId, channelId, guildId, type } = item;

        if ((type === ActionType.KICK || type === ActionType.BAN) && isWhitelisted(userId)) {
            log(`Skipping ${type} for whitelisted user ${userId}`);
            const skipMsg = formatWhitelistSkipMessage(channelId, userId, type);
            sendBotMessage(channelId, { content: skipMsg });
            processedUsers.set(userId, Date.now());
            continue;
        }

        const now = Date.now();
        const lastAction = processedUsers.get(userId) || 0;

        if (now - lastAction < settings.store.queueTime) {
            continue;
        }

        log(`Processing ${type} for ${userId} in ${channelId}`);
        const user = UserStore.getUser(userId);
        const channel = ChannelStore.getChannel(channelId);
        const guild = guildId ? GuildStore.getGuild(guildId) : null;

        if (item.ephemeralMessage) {
            let ephemeralMsg = item.ephemeralMessage
                .replace(/{user_id}/g, userId)
                .replace(/{channel_id}/g, channelId)
                .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
                .replace(/{guild_id}/g, guildId || "")
                .replace(/{guild_name}/g, guild?.name || "Unknown Guild");

            if (user) {
                ephemeralMsg = ephemeralMsg.replace(/{user_name}/g, user.username);
            } else {
                ephemeralMsg = ephemeralMsg.replace(/{user_name}/g, userId);
            }

            log(`Sending ephemeral message: ${ephemeralMsg}`);
            sendBotMessage(channelId, { content: ephemeralMsg });
            // Small delay to ensure the ephemeral message appears before the kick action
            await new Promise(r => setTimeout(r, 500));
        }

        let template: string;
        let activeType = type;

        if (activeType === ActionType.BAN) {
            const ownerInfo = getOwnerForChannel(channelId);
            if (ownerInfo?.reason?.toLowerCase().includes("claim")) {
                log(`Downgrading BAN to KICK for ${userId} in ${channelId} (Ownership Reason: ${ownerInfo.reason})`);
                activeType = ActionType.KICK;
            }
        }

        switch (activeType) {
            case ActionType.KICK:
                template = settings.store.kickCommand;
                break;
            case ActionType.BAN:
                template = settings.store.banCommand;
                break;
            case ActionType.UNBAN:
                template = settings.store.unbanCommand;
                break;
            case ActionType.CLAIM:
                template = settings.store.claimCommand;
                break;
            default:
                console.error(`Unknown action type: ${activeType}`);
                continue;
        }

        let formattedMessage = template
            .replace(/{user_id}/g, userId)
            .replace(/{channel_id}/g, channelId)
            .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
            .replace(/{guild_id}/g, guildId || "")
            .replace(/{guild_name}/g, guild?.name || "Unknown Guild");

        formattedMessage = formatMessageCommon(formattedMessage);

        if (user) {
            formattedMessage = formattedMessage.replace(/{user_name}/g, user.username);
        } else {
            formattedMessage = formattedMessage.replace(/{user_name}/g, userId);
        }

        if (type === ActionType.CLAIM) {
            jumpToFirstMessage(channelId, guildId);
            await new Promise(r => setTimeout(r, 1000));
        }

        try {
            log(`Sending ${activeType} message: ${formattedMessage}`);
            sendMessage(channelId, { content: formattedMessage });
            processedUsers.set(userId, now);
        } catch (e) {
            console.error(`[SocializeGuild] Failed to send message:`, e);
        }

        if (settings.store.queueTime > 0) {
            await new Promise(r => setTimeout(r, settings.store.queueTime));
        }
    }

    state.isProcessing = false;
}

export function notifyOwnership(channelId: string) {
    const { sendBotMessage } = require("@api/Commands");
    if (!settings.store.enabled) return;
    const ownerInfo = getOwnerForChannel(channelId);
    if (!ownerInfo || !ownerInfo.userId) return;

    const channel = ChannelStore.getChannel(channelId);
    if (channel?.parent_id !== settings.store.categoryId) return;

    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
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

        let logMsg = `[OwnershipCheck] [Cache] Msg ${msg.id}: type=${response.type}, initiator=${response.initiatorId}, isOwnership=${!!isOwnership}`;
        if (isBot && response.type === BotResponseType.UNKNOWN) {
            logMsg += ` (Title: "${response.embed?.title}", Author: "${response.embed?.author?.name}")`;
        }
        log(logMsg);

        if (isOwnership) {
            owner = {
                userId: response.initiatorId!,
                reason: response.type,
                timestamp: response.timestamp
            };
            updateOwner(channelId, owner);
        }
    }

    // If we haven't found a creator yet, try fetching more from API
    // We need to rebuild the history of ownership, so we fetch messages going back in time
    // and then replay them chronologically from the oldest we found.
    const currentOwnership = channelOwners.get(channelId);
    if (!currentOwnership?.creator) {
        const BATCH_LIMIT = 100;
        const MAX_BATCHES = 5; // Up to 500 messages
        let collectedBatches: any[][] = [];
        let beforeId: string | undefined;

        for (let batch = 0; batch < MAX_BATCHES; batch++) {
            try {
                const query: any = { limit: BATCH_LIMIT };
                if (beforeId) query.before = beforeId;

                log(`[OwnershipCheck] Fetching batch ${batch + 1} (before: ${beforeId || "latest"})...`);

                const res = await RestAPI.get({
                    url: Constants.Endpoints.MESSAGES(channelId),
                    query
                });

                if (!res.body || !Array.isArray(res.body) || res.body.length === 0) {
                    log(`[OwnershipCheck] Batch ${batch + 1} empty or invalid.`);
                    break;
                }

                const messages = res.body;
                collectedBatches.push(messages);

                // Check if we found the creation event in this batch
                let foundCreation = false;
                for (const msg of messages) {
                    const response = new BotResponse(msg, botId);
                    if (response.type === BotResponseType.CREATED) {
                        foundCreation = true;
                        break;
                    }
                }

                if (foundCreation) {
                    log(`[OwnershipCheck] Found creation event in batch ${batch + 1}. Stopping fetch.`);
                    break;
                }

                beforeId = messages[messages.length - 1].id;
            } catch (e) {
                log(`[OwnershipCheck] Error fetching batch ${batch + 1}:`, e);
                break;
            }
        }

        // Process batches from Oldest (last batch) to Newest (first batch)
        // Inside each batch, messages are Newest -> Oldest (Discord API default), so we iterate backwards.
        for (let b = collectedBatches.length - 1; b >= 0; b--) {
            const batch = collectedBatches[b];
            for (let i = batch.length - 1; i >= 0; i--) {
                const msg = batch[i];
                const response = new BotResponse(msg, botId);
                const isBot = msg.author.id === botId;
                const isOwnership = response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED);

                let logMsg = `[OwnershipCheck] [API] Msg ${msg.id}: type=${response.type}, initiator=${response.initiatorId}, isOwnership=${!!isOwnership}`;
                if (isBot && response.type === BotResponseType.UNKNOWN) {
                    logMsg += ` (Title: "${response.embed?.title}", Author: "${response.embed?.author?.name}")`;
                }
                log(logMsg);

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

const requestedInfo = new Map<string, number>();

export function requestChannelInfo(channelId: string) {
    const now = Date.now();
    const lastRequest = requestedInfo.get(channelId) || 0;
    if (now - lastRequest < 5000) { // 5 second cooldown
        log(`Skipping channel info request for ${channelId} (cooldown)`);
        return;
    }
    requestedInfo.set(channelId, now);

    log(`Requesting channel info for ${channelId} using command: ${settings.store.infoCommand}`);
    sendMessage(channelId, { content: settings.store.infoCommand });
}

export function getMemberInfoForChannel(channelId: string): MemberChannelInfo | undefined {
    const owner = getOwnerForChannel(channelId);
    if (!owner) return undefined;
    return memberInfos.get(owner.userId);
}

export function handleInfoUpdate(channelId: string, info: MemberChannelInfo) {
    let targetOwnerId = info.ownerId;

    if (!targetOwnerId) {
        const owner = getOwnerForChannel(channelId);
        targetOwnerId = owner?.userId;
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

        const embed = {
            title: "Channel Info Updated",
            description: lines.join("\n"),
            color: 0x5865F2,
            timestamp: new Date().toISOString()
        };

        sendBotMessage(channelId, { embeds: [embed] });
    }
}

export function bulkBanAndKick(userIds: string[], channelId: string, guildId: string): number {
    const currentList = getKickList();
    const uniqueNewUsers = userIds.filter(id => !currentList.includes(id));

    if (uniqueNewUsers.length > 0) {
        setKickList([...currentList, ...uniqueNewUsers]);
    }

    let count = 0;
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);

    for (const userId of userIds) {
        if (voiceStates && voiceStates[userId]) {
            actionQueue.push({
                type: ActionType.KICK,
                userId: userId,
                channelId: channelId,
                guildId: guildId
            });
            count++;
        }
    }

    if (count > 0) processQueue();
    return count;
}

export function bulkUnban(userIds: string[], channelId: string, guildId: string): number {
    const currentList = getKickList();
    const newList = currentList.filter(id => !userIds.includes(id));

    if (currentList.length !== newList.length) setKickList(newList);

    let count = 0;
    for (const userId of userIds) {
        actionQueue.push({
            type: ActionType.UNBAN,
            userId: userId,
            channelId: channelId,
            guildId: guildId
        });
        state.roleKickedUsers.delete(userId);
        count++;
    }

    if (count > 0) processQueue();
    return count;
}

export async function claimAllDisbandedChannels(guildId: string) {
    if (!settings.store.enabled) return;
    const channels = GuildChannelStore.getChannels(guildId).VOCAL;
    if (!channels || channels.length === 0) return;

    let count = 0;
    const me = UserStore.getCurrentUser();
    if (!me) return;

    for (const item of channels) {
        const channel = item.channel;
        if (channel.parent_id !== settings.store.categoryId) continue;

        const ownerInfo = getOwnerForChannel(channel.id);
        const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channel.id);

        let shouldClaim = false;
        if (ownerInfo?.userId) {
            if (ownerInfo.userId === me.id) continue;
            if (!voiceStates || !voiceStates[ownerInfo.userId]) shouldClaim = true;
        } else {
            shouldClaim = true;
        }

        if (shouldClaim) {
            actionQueue.push({
                type: ActionType.CLAIM,
                userId: me.id,
                channelId: channel.id,
                guildId: guildId
            });
            count++;
        }
    }

    if (count > 0) processQueue();
}

// Re-export rotation and voteban
export * from "./utils/rotation";
export * from "./utils/voteban";

// Local log helper
import { log as utilLog } from "./utils/logging";
const log = utilLog;
