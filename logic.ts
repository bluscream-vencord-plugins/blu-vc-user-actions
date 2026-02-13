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
} from "@webpack/common";
import { settings } from "./settings";
import { actionQueue, processedUsers, state, ChannelOwner } from "./state";
import { log, formatMessageCommon, updateOwner, getOwnerForChannel, formatClaimMessage, getRotateNames, formatSetChannelNameMessage } from "./utils";

export async function processQueue() {
    if (state.isProcessing || actionQueue.length === 0) return;
    state.isProcessing = true;

    while (actionQueue.length > 0) {
        const item = actionQueue.shift();
        if (!item) continue;

        const { userId, channelId, guildId } = item;
        const now = Date.now();
        const lastAction = processedUsers.get(userId) || 0;

        if (now - lastAction < settings.store.queueTime) {
            continue;
        }

        log(`Processing kick for ${userId} in ${channelId}`);
        const user = UserStore.getUser(userId);
        const channel = ChannelStore.getChannel(channelId);
        const guild = guildId ? GuildStore.getGuild(guildId) : null;

        let formattedMessage = settings.store.autoKickMessage
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

        try {
            log(`Sending kick message: ${formattedMessage}`);
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
        if (userId) return { userId, reason: "Created" };
    } else if (authorName === "Channel Claimed") {
        const iconURL = embed.author?.iconURL;
        if (iconURL) {
            const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
            if (userIdFromUrl) return { userId: userIdFromUrl, reason: "Claimed" };
        }
    }
    return null;
}

export async function checkChannelOwner(channelId: string, botId: string): Promise<ChannelOwner> {
    const fallback: ChannelOwner = { userId: "", reason: "Unknown" };
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
    const formatted = formatClaimMessage(channelId, formerOwnerId);
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
    const formatted = formatSetChannelNameMessage(channelId, nextName);

    log(`Rotating channel ${channelId} to name: ${nextName} (Index: ${index})`);
    sendMessage(channelId, { content: formatted });

    state.rotationIndex.set(channelId, (index + 1) % names.length);
}

export function startRotation(channelId: string) {
    if (state.rotationIntervals.has(channelId)) return;

    const intervalSeconds = settings.store.rotateChannelNamesTime;
    if (intervalSeconds < 1) {
        log(`Rotation interval for ${channelId} is less than 1 second, skipping.`);
        return;
    }

    const names = getRotateNames();
    if (names.length === 0) {
        log(`No names configured for rotation, skipping ${channelId}.`);
        return;
    }

    log(`Starting channel name rotation for ${channelId} every ${intervalSeconds} seconds.`);

    // Initial rotation
    rotateChannelName(channelId);

    const intervalId = setInterval(() => {
        rotateChannelName(channelId);
    }, intervalSeconds * 1000);

    state.rotationIntervals.set(channelId, intervalId);
}

export function stopRotation(channelId: string) {
    const intervalId = state.rotationIntervals.get(channelId);
    if (intervalId) {
        log(`Stopping channel name rotation for ${channelId}.`);
        clearInterval(intervalId);
        state.rotationIntervals.delete(channelId);
        state.rotationIndex.delete(channelId);
    }
}

export function handleOwnershipChange(channelId: string, ownerId: string) {
    const me = UserStore.getCurrentUser();
    if (ownerId === me?.id) {
        startRotation(channelId);
    } else {
        stopRotation(channelId);
    }
}
