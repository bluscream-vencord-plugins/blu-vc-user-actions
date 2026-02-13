import { UserStore, ChannelStore, GuildStore } from "@webpack/common";
import { settings, pluginName } from "./settings";
import { channelOwners, ChannelOwner } from "./state";

export function log(...args: any[]) {
    console.log(`[${pluginName}]`, ...args);
}

export function getKickList(): string[] {
    return settings.store.autoKickList.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

export function setKickList(list: string[]) {
    settings.store.autoKickList = list.join("\n");
}

export function getOwnerForChannel(channelId: string): ChannelOwner | undefined {
    return channelOwners.get(channelId);
}

export function formatClaimMessage(channelId: string, formerOwnerId?: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return settings.store.claimMessage;
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

    let formatted = settings.store.claimMessage
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
        .replace(/{guild_id}/g, channel?.guild_id || "")
        .replace(/{guild_name}/g, guild?.name || "Unknown Guild");

    if (formerOwnerId) {
        const user = UserStore.getUser(formerOwnerId);
        const name = user?.globalName || user?.username || formerOwnerId;
        formatted = formatted
            .replace(/{user_id}/g, formerOwnerId)
            .replace(/{user_name}/g, name);
    }

    return formatMessageCommon(formatted);
}

export function getRotateNames(): string[] {
    return settings.store.rotateChannelNames
        .split(/\r?\n/)
        .map(name => name.trim())
        .filter(name => name.length > 0);
}

export function formatSetChannelNameMessage(channelId: string, name: string): string {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
    const ownerInfo = getOwnerForChannel(channelId);
    const owner = ownerInfo?.userId ? UserStore.getUser(ownerInfo.userId) : null;

    let formatted = settings.store.setChannelNameMessage
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
        .replace(/{guild_id}/g, channel?.guild_id || "")
        .replace(/{guild_name}/g, guild?.name || "Unknown Guild")
        .replace(/{channel_name_new}/g, name);

    if (ownerInfo) {
        const ownerName = owner?.globalName || owner?.username || ownerInfo.userId;
        formatted = formatted
            .replace(/{user_id}/g, ownerInfo.userId)
            .replace(/{user_name}/g, ownerName)
            .replace(/{reason}/g, ownerInfo.reason);
    }

    return formatMessageCommon(formatted);
}

export function updateOwner(channelId: string, owner: ChannelOwner) {
    const existing = channelOwners.get(channelId);
    if (!existing || existing.userId !== owner.userId || existing.reason !== owner.reason) {
        channelOwners.set(channelId, owner);
        return true;
    }
    return false;
}

export function formatMessageCommon(text: string): string {
    const me = UserStore.getCurrentUser();
    const now = new Date();

    return text
        .replace(/{now(?::([^}]+))?}/g, (match, format) => {
            if (!format) return now.toLocaleString();
            const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
            return format
                .replace(/YYYY/g, String(now.getFullYear()))
                .replace(/YY/g, String(now.getFullYear()).slice(-2))
                .replace(/MMM/g, now.toLocaleString("default", { month: "short" }))
                .replace(/MM/g, pad(now.getMonth() + 1))
                .replace(/DD/g, pad(now.getDate()))
                .replace(/HH/g, pad(now.getHours()))
                .replace(/mm/g, pad(now.getMinutes()))
                .replace(/ss/g, pad(now.getSeconds()))
                .replace(/ms/g, pad(now.getMilliseconds(), 3));
        })
        .replace(/{my_id}|{me_id}/g, me?.id || "")
        .replace(/{my_name}|{me_name}/g, me?.globalName || me?.username || "");
}
