import { sendMessage as _sendMessage } from "@utils/discord";
import {
    ChannelStore,
    GuildStore,
    GuildChannelStore,
    UserStore,
    MessageStore,
    RestAPI,
    Constants,
    SelectedChannelStore,
    VoiceStateStore,
    RelationshipStore,
    PresenceStore,
    GuildMemberStore,
} from "@webpack/common";
import { settings } from "./settings";
import { ActionItem } from "./types/ActionItem";
import { actionQueue, state, setMemberInfo, memberInfos, ActionType, OwnerEntry, MemberChannelInfo, channelOwners } from "./state";
import {
    formatMessageCommon, updateOwner, formatclaimCommand, navigateTo, jumpToFirstMessage,
    formatWhitelistSkipMessage, requestGuildMembers, formatKickCommand, formatBanCommand,
    formatUnbanCommand, formatPermitCommand, formatUnpermitCommand, formatLimitCommand,
    formatLockCommand, formatUnlockCommand, formatChannelNameCommand, formatResetCommand,
    formatInfoCommand
} from "./utils";
import { getKickList, setKickList, isWhitelisted, getWhitelist, setWhitelist } from "./utils/kicklist";
import { startRotation, stopRotation } from "./utils/rotation";
import { BotResponse, BotResponseType } from "./utils/BotResponse";

const sendMessage = (channelId: string, options: any) => {
    if (channelId === settings.store.createChannelId) {
        log(`Blocked message to createChannelId: ${channelId}`);
        return;
    }
    _sendMessage(channelId, options);
};

export function queueAction(options: {
    type: ActionType;
    userId: string;
    channelId: string;
    guildId?: string;
    rotationTriggered?: boolean;
    ephemeral?: string;
    external?: string;
    // channelName and channelLimit removed as they are for formatting only
}) {
    const { userId, channelId, guildId, type, rotationTriggered, ephemeral, external } = options;
    const { sendBotMessage } = require("@api/Commands");

    // 1. Whitelist Check
    if ((type === ActionType.KICK || type === ActionType.BAN) && isWhitelisted(userId)) {
        log(`Skipping ${type} for whitelisted user ${userId}`);
        const skipMsg = formatWhitelistSkipMessage(channelId, userId, type);
        sendBotMessage(channelId, { content: skipMsg });
        return;
    }

    // 2. Rotation / Ownership Check
    if (type === ActionType.BAN && !rotationTriggered) {
        const ownership = channelOwners.get(channelId);
        const isClaim = (ownership?.claimant?.reason?.toLowerCase().includes("claim")) || (ownership?.creator?.reason?.toLowerCase().includes("claim"));
        if (isClaim) {
            log(`Downgrading BAN to KICK for ${userId} (Claim channel)`);
            // We need to re-queue with KICK type and KICK message.
            // Since queueAction no longer formats, we must format it here.
            const kickMsg = formatKickCommand(channelId, userId);
            queueAction({ ...options, type: ActionType.KICK, external: kickMsg });
            return;
        }

        const ownerId = ownership?.creator?.userId || ownership?.claimant?.userId;
        if (ownerId && settings.store.banRotateEnabled) {
            const info = memberInfos.get(ownerId);
            if (info?.banned && info.banned.length >= settings.store.banLimit) {
                const userToUnban = info.banned[0];
                log(`Ban limit reached for owner ${ownerId}. Rotating ban: unbanning ${userToUnban} for ${userId}`);
                const unbanMsg = formatUnbanCommand(channelId, userToUnban);
                queueAction({ type: ActionType.UNBAN, userId: userToUnban, channelId, guildId, external: unbanMsg });
                queueAction({ ...options, rotationTriggered: true });
                return;
            }
        }
    } else if (type === ActionType.PERMIT && !rotationTriggered && settings.store.permitRotateEnabled) {
        const ownership = channelOwners.get(channelId);
        const ownerId = ownership?.creator?.userId || ownership?.claimant?.userId;
        if (ownerId) {
            const info = memberInfos.get(ownerId);
            if (info?.permitted && info.permitted.length >= settings.store.permitLimit) {
                const userToUnpermit = info.permitted[0];
                log(`Permit limit reached for owner ${ownerId}. Rotating permit: unpermitting ${userToUnpermit} for ${userId}`);
                const unpermitMsg = formatUnpermitCommand(channelId, userToUnpermit);
                queueAction({ type: ActionType.UNPERMIT, userId: userToUnpermit, channelId, guildId, external: unpermitMsg });
                queueAction({ ...options, rotationTriggered: true });
                return;
            }
        }
    }

    // 3. Queue Item
    // We already have formatted messages in options.ephemeral and options.external
    const item: ActionItem = {
        ephemeral,
        external
    };

    if (type === ActionType.INFO || type === ActionType.CLAIM) {
        actionQueue.unshift(item);
    } else {
        actionQueue.push(item);
    }

    processQueue();
}

export async function processQueue() {
    const { sendBotMessage } = require("@api/Commands");
    if (state.isProcessing || actionQueue.length === 0) return;
    const channelId = state.myLastVoiceChannelId;
    if (!channelId) {
        log("No active channel, clearing queue.");
        actionQueue.length = 0;
        return;
    }

    state.isProcessing = true;

    while (actionQueue.length > 0) {
        const item = actionQueue[0];

        // Consume item
        actionQueue.shift();

        if (item.ephemeral) {
            sendBotMessage(channelId, { content: item.ephemeral });
            // Small delay after ephemeral
            await new Promise(r => setTimeout(r, 500));
        }

        if (item.external) {
            log(`Sending command/message to ${channelId}: ${item.external}`);
            sendMessage(channelId, { content: item.external });
        // Full queue delay after external
            if (settings.store.queueTime > 0) {
                await new Promise(r => setTimeout(r, settings.store.queueTime));
            }
        }
    }

    state.isProcessing = false;
}

export function notifyOwnership(channelId: string) {
    const { sendBotMessage } = require("@api/Commands");
    if (!settings.store.enabled) return;

    const ownership = channelOwners.get(channelId);
    if (!ownership) return;

    const channel = ChannelStore.getChannel(channelId);
    if (channel?.parent_id !== settings.store.categoryId) return;

    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

    // Notify about claimant if it exists, otherwise creator.
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

    // Claimant takes precedence for settings retrieval
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
            const msg = formatKickCommand(channelId, userId);
            queueAction({
                type: ActionType.KICK,
                userId: userId,
                channelId: channelId,
                guildId: guildId,
                external: msg
            });
            count++;
        }
    }

    return count;
}

export function bulkUnban(userIds: string[], channelId: string, guildId: string): number {
    const currentList = getKickList();
    const newList = currentList.filter(id => !userIds.includes(id));

    if (currentList.length !== newList.length) setKickList(newList);

    let count = 0;
    for (const userId of userIds) {
        const msg = formatUnbanCommand(channelId, userId);
        queueAction({
            type: ActionType.UNBAN,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: msg
        });
        state.roleKickedUsers.delete(userId);
        count++;
    }

    return count;
}

export function bulkPermit(userIds: string[], channelId: string, guildId: string): number {
    const currentList = getWhitelist();
    const uniqueNewUsers = userIds.filter(id => !currentList.includes(id));

    if (uniqueNewUsers.length > 0) {
        setWhitelist([...currentList, ...uniqueNewUsers]);
    }

    let count = 0;
    for (const userId of userIds) {
        const msg = formatPermitCommand(channelId, userId);
        queueAction({
            type: ActionType.PERMIT,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: msg
        });
        count++;
    }

    return count;
}

export function bulkUnpermit(userIds: string[], channelId: string, guildId: string): number {
    const currentList = getWhitelist();
    const newList = currentList.filter(id => !userIds.includes(id));

    if (currentList.length !== newList.length) setWhitelist(newList);

    let count = 0;
    for (const userId of userIds) {
        const msg = formatUnpermitCommand(channelId, userId);
        queueAction({
            type: ActionType.UNPERMIT,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: msg
        });
        count++;
    }

    return count;
}


export async function getFriendsOnGuild(guildId: string): Promise<string> {
    const friendIds = RelationshipStore.getFriendIDs();

    const allVoiceStates = VoiceStateStore.getAllVoiceStates();
    const voiceStates: Record<string, any> = {};
    for (const gid in allVoiceStates) {
        if (gid === guildId) {
            Object.assign(voiceStates, allVoiceStates[gid]);
        }
    }

    const missing = friendIds.filter(id => !GuildMemberStore.isMember(guildId, id));
    let syncTriggered = false;
    if (missing.length > 0) {
        requestGuildMembers(guildId, missing);
        syncTriggered = true;
        await new Promise(r => setTimeout(r, 500));
    }

    const friendOnGuild = friendIds.filter(id => GuildMemberStore.isMember(guildId, id) || !!voiceStates?.[id]);

    if (friendOnGuild.length === 0) return "No friends on this guild.";

    const statusMap: Record<string, number> = {
        online: 0,
        streaming: 1,
        idle: 2,
        dnd: 3,
        offline: 4,
        invisible: 5,
        unknown: 6
    };

    const statusEmojis: Record<string, string> = {
        online: "🟢",
        idle: "🟡",
        dnd: "🔴",
        offline: "⚪",
        invisible: "⚪",
        unknown: "❓"
    };

    const friendInfo = friendOnGuild.map(id => {
        const user = UserStore.getUser(id);
        const status = PresenceStore.getStatus(id) || "offline";
        const channelId = voiceStates?.[id]?.channelId;
        const name = user?.globalName || user?.username || id;
        return { id, name, status, channelId };
    });

    // Sort by status priority then name
    friendInfo.sort((a, b) => {
        const statusA = statusMap[a.status] ?? 6;
        const statusB = statusMap[b.status] ?? 6;
        if (statusA !== statusB) return statusA - statusB;
        return a.name.localeCompare(b.name);
    });

    const lines = friendInfo.map(f => {
        const emoji = statusEmojis[f.status] || "❓";
        const channel = f.channelId ? `: <#${f.channelId}>` : "";
        return `${emoji} <@${f.id}>${channel}`;
    });

    let output = `### Mutual Friends on Guild\n${lines.join("\n")}`;
    if (syncTriggered) output += "\n\n*Note: Some friends may still be syncing. Try running again if anyone is missing.*";
    return output;
}

// Re-export rotation and voteban
export * from "./utils/rotation";
export * from "./utils/voteban";

// Local log helper
import { log as utilLog } from "./utils/logging";
const log = utilLog;
