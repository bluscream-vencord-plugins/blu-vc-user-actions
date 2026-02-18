import { UserStore, ChannelStore, GuildStore } from "@webpack/common";

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

export function formatCommand(
    template: string,
    channelId: string,
    options?: {
        userId?: string;
        newChannelName?: string;
        reason?: string;
    }
): string {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

    let formatted = template
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
        .replace(/{guild_id}/g, channel?.guild_id || "")
        .replace(/{guild_name}/g, guild?.name || "Unknown Guild");

    // Handle optional user placeholders
    if (options?.userId) {
        const user = UserStore.getUser(options.userId);
        const userName = user?.globalName || user?.username || options.userId;
        formatted = formatted
            .replace(/{user_id}/g, options.userId)
            .replace(/{user_name}/g, userName);
    }

    // Handle optional channel name
    if (options?.newChannelName) {
        formatted = formatted.replace(/{channel_name_new}/g, options.newChannelName);
    }

    // Handle optional reason
    if (options?.reason) {
        formatted = formatted.replace(/{reason}/g, options.reason);
    }

    return formatMessageCommon(formatted);
}

export function formatLimitCommand(channelId: string, limit: number): string {
    const { settings } = require("..");
    const template = settings.store.setChannelUserLimitCommand;
    const formatted = template.replace(/{channel_limit}/g, limit.toString());
    return formatCommand(formatted, channelId);
}

export function formatsetChannelNameCommand(channelId: string, newChannelName: string): string {
    const { settings } = require("..");
    return formatCommand(settings.store.setChannelNameCommand, channelId, { newChannelName });
}

export function toDiscordTime(datetime: number | Date, relative = false): string {
    const timestamp = typeof datetime === 'number' ? datetime : datetime.getTime();
    const seconds = Math.floor(timestamp / 1000);
    return `<t:${seconds}${relative ? ":R" : ""}>`;
}
