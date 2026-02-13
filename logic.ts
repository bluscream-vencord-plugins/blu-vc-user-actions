import { sendBotMessage } from "@api/Commands";
import { sendMessage } from "@utils/discord";
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
    ChannelActions,
} from "@webpack/common";
import { settings } from "./settings";
import { actionQueue, processedUsers, state, ChannelOwner, setChannelInfo, ChannelInfo, ActionType } from "./state";
import { log, formatMessageCommon, updateOwner, getOwnerForChannel, formatclaimCommand, getRotateNames, formatsetChannelNameCommand, parseBotInfoMessage, navigateToChannel, formatWhitelistSkipMessage } from "./utils";

import { getKickList, setKickList, isWhitelisted } from "./utils/kicklist";

export async function processQueue() {
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

        let template: string;
        switch (type) {
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
                console.error(`Unknown action type: ${type}`);
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
            ChannelActions.selectVoiceChannel(channelId);
            await new Promise(r => setTimeout(r, 500));
        }

        try {
            log(`Sending ${type} message: ${formattedMessage}`);
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

export function getMessageOwner(msg: any, botId: string): ChannelOwner | null {
    if (msg.author.id !== botId) return null;

    const embed = msg.embeds?.[0];
    if (!embed) return null;

    const authorName = embed.author?.name;
    if (authorName === "Channel Created") {
        const userId = msg.mentions?.[0]?.id || msg.mentions?.[0] || msg.content?.match(/<@!?(\d+)>/)?.[1];
        const timestamp = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
        if (userId) return { userId, reason: "Created", timestamp, updated: Date.now() };
    } else if (authorName === "Channel Claimed") {
        const iconURL = embed.author?.iconURL;
        if (iconURL) {
            const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
            const timestamp = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
            if (userIdFromUrl) return { userId: userIdFromUrl, reason: "Claimed", timestamp, updated: Date.now() };
        }
    }
    return null;
}

export async function checkChannelOwner(channelId: string, botId: string): Promise<ChannelOwner> {
    const fallback: ChannelOwner = { userId: "", reason: "Unknown", timestamp: Date.now(), updated: Date.now() };
    const cached = MessageStore.getMessages(channelId);
    let owner: ChannelOwner | null = null;

    if (cached) {
        const msgsArray = cached.toArray ? cached.toArray() : cached;
        for (let i = msgsArray.length - 1; i >= 0; i--) {
            owner = getMessageOwner(msgsArray[i], botId);
            if (owner) break;
        }
    }

    if (!owner) {
        try {
            const res = await RestAPI.get({
                url: Constants.Endpoints.MESSAGES(channelId),
                query: { limit: 50 }
            });
            if (res.body && Array.isArray(res.body)) {
                for (let i = 0; i < res.body.length; i++) {
                    owner = getMessageOwner(res.body[i], botId);
                    if (owner) break;
                }
            }
        } catch (e) {
            console.error("[SocializeGuild] Failed to fetch messages for ownership check:", e);
        }
    }

    if (owner) {
        updateOwner(channelId, owner);
        return owner;
    }

    return fallback;
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

export function rotateChannelName(channelId: string) {
    const names = getRotateNames();
    if (names.length === 0) {
        log(`No names to rotate for channel ${channelId}, stopping rotation.`);
        stopRotation(channelId);
        return;
    }

    let index = state.rotationIndex.get(channelId) ?? 0;
    if (index >= names.length) index = 0;

    const nextName = names[index];
    const formatted = formatsetChannelNameCommand(channelId, nextName);

    log(`Rotating channel ${channelId} to name: ${nextName} (Index: ${index})`);
    sendMessage(channelId, { content: formatted });

    state.rotationIndex.set(channelId, (index + 1) % names.length);
    state.lastRotationTime.set(channelId, Date.now());
}

export function startRotation(channelId: string) {
    if (!settings.store.enabled) return;
    if (state.rotationIntervals.has(channelId)) return;

    if (!settings.store.rotateChannelNamesEnabled) {
        log(`Channel name rotation is disabled in settings, skipping ${channelId}.`);
        return;
    }

    const intervalMinutes = settings.store.rotateChannelNamesTime;
    if (intervalMinutes < 10) {
        log(`Rotation interval for ${channelId} is less than 10 minutes, skipping to prevent rate limits.`);
        return;
    }

    const names = getRotateNames();
    if (names.length === 0) {
        log(`No names configured for rotation, skipping ${channelId}.`);
        return;
    }

    log(`Starting channel name rotation for ${channelId} every ${intervalMinutes} minutes.`);

    // Check if current name is in rotation list to determine starting index
    const channel = ChannelStore.getChannel(channelId);
    let startIndex = 0;
    if (channel) {
        // Strip potential configured prefixes/suffixes if needed? The user didn't ask for fuzzy matching, just "current channel name".
        // Assuming exact match for now as stored in getRotateNames().
        // Note: getRotateNames might return names to set. Channel name might effectively update.
        const currentName = channel.name;
        const idx = names.indexOf(currentName);
        if (idx !== -1) {
            startIndex = (idx + 1) % names.length;
            log(`Current name '${currentName}' found at index ${idx}. Next rotation will use index ${startIndex}.`);
        } else {
            log(`Current name '${currentName}' not found in rotation list. Starting from index 0.`);
        }
    }
    state.rotationIndex.set(channelId, startIndex);

    // Initial rotation Removed to wait for first interval
    // rotateChannelName(channelId);

    const intervalId = setInterval(() => {
        rotateChannelName(channelId);
    }, intervalMinutes * 60 * 1000);

    state.rotationIntervals.set(channelId, intervalId);
    state.lastRotationTime.set(channelId, Date.now());
}

export function stopRotation(channelId: string) {
    const intervalId = state.rotationIntervals.get(channelId);
    if (intervalId) {
        log(`Stopping channel name rotation for ${channelId}.`);
        clearInterval(intervalId);
        state.rotationIntervals.delete(channelId);
        state.rotationIndex.delete(channelId);
        state.lastRotationTime.delete(channelId);
    }
}

export function handleOwnershipChange(channelId: string, ownerId: string) {
    const me = UserStore.getCurrentUser();
    log(`Ownership change for ${channelId}: owner is ${ownerId}, me is ${me?.id}`);
    if (ownerId === me?.id) {
        // We became the owner - start rotation and fetch channel info
        log(`We are the owner! Starting rotation and requesting channel info`);
        startRotation(channelId);
        requestChannelInfo(channelId);

        if (settings.store.autoNavigateToOwnedChannel) {
            const channel = ChannelStore.getChannel(channelId);
            navigateToChannel(channelId, channel?.guild_id);
        }
    } else {
        log(`We are not the owner, stopping rotation`);
        stopRotation(channelId);
    }
}

export function handleOwnerUpdate(channelId: string, owner: ChannelOwner) {
    if (updateOwner(channelId, owner)) {
        notifyOwnership(channelId);
        handleOwnershipChange(channelId, owner.userId);

        const settingAny = settings.store.ownershipChangeNotificationAny;
        const isMyChannel = state.myLastVoiceChannelId === channelId;
        const isCurrentChat = SelectedChannelStore.getChannelId() === channelId;

        if (settingAny || isMyChannel || isCurrentChat) {
            const channel = ChannelStore.getChannel(channelId);
            const user = UserStore.getUser(owner.userId);
            const ownerName = user?.globalName || user?.username || owner.userId;
            const channelName = channel?.name || channelId;
            showToast(`Channel "${channelName}" now owned by "${ownerName}"`);
        }
    }
}

export function restartAllRotations() {
    log("Settings changed, updating rotations...");

    // Stop everything first
    const activeChannels = Array.from(state.rotationIntervals.keys());
    for (const channelId of activeChannels) {
        stopRotation(channelId);
    }

    // If enabled, try to start rotation in the current channel if we are the owner
    if (settings.store.enabled && settings.store.rotateChannelNamesEnabled && state.myLastVoiceChannelId) {
        const ownerInfo = getOwnerForChannel(state.myLastVoiceChannelId);
        const me = UserStore.getCurrentUser();
        if (ownerInfo?.userId === me?.id) {
            log(`Restarting rotation for current channel ${state.myLastVoiceChannelId}`);
            startRotation(state.myLastVoiceChannelId);
        }
    }
}

export function requestChannelInfo(channelId: string) {
    log(`Requesting channel info for ${channelId} using command: ${settings.store.infoCommand}`);
    sendMessage(channelId, { content: settings.store.infoCommand });
}

export function handleInfoUpdate(channelId: string, info: ChannelInfo) {
    setChannelInfo(info);
    log(`Updated channel info`);
}

state.onRotationSettingsChange = restartAllRotations;

export function bulkBanAndKick(userIds: string[], channelId: string, guildId: string): number {
    const currentList = getKickList();
    const uniqueNewUsers = userIds.filter(id => !currentList.includes(id));

    if (uniqueNewUsers.length > 0) {
        setKickList([...currentList, ...uniqueNewUsers]);
    }

    // Queue kick commands for users currently in the channel
    let count = 0;
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);

    for (const userId of userIds) {
        // Ensure user is still in the channel
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

    if (count > 0) {
        processQueue();
    }

    return count;
}

export function bulkUnban(userIds: string[]): number {
    const currentList = getKickList();
    const newList = currentList.filter(id => !userIds.includes(id));

    if (currentList.length !== newList.length) {
        setKickList(newList);
        return currentList.length - newList.length;
    }
    return 0;
}

export function claimAllDisbandedChannels(guildId: string) {
    if (!settings.store.enabled) return;
    const channels = GuildChannelStore.getChannels(guildId).VOCAL;
    if (!channels || channels.length === 0) {
        showToast("No voice channels found to check.");
        return;
    }

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
            // If owner is not in channel, consider it disbanded
            if (!voiceStates || !voiceStates[ownerInfo.userId]) {
                shouldClaim = true;
            }
        } else {
            // No known owner, consider it disbanded/claimable
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

    if (count > 0) {
        showToast(`Queued claims for ${count} disbanded channels...`);
        processQueue();
    } else {
        showToast("No disbanded channels found to claim.");
    }
}
