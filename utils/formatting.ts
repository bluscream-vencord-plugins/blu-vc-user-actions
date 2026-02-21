import { UserStore, ChannelStore, GuildStore } from "@webpack/common";

/**
 * Formats a string with common placeholders like {now}, {me_id}, {me_name}.
 * @param text The template string
 * @returns The formatted string
 */
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
        .replace(/{my_id}|{me_id}|{me}/g, (match) => {
            if (match === "{me}") return `<@${me?.id || ""}>`;
            return me?.id || "";
        })
        .replace(/{my_name}|{me_name}/g, me?.globalName || me?.username || "");
}

/**
 * Formats a bot command template with channel, guild, and user-specific metadata.
 * @param template The command string containing placeholders (e.g., {channel_name}, {user})
 * @param channelId The ID of the context channel
 * @param options Additional metadata for placeholder replacement
 * @returns The fully formatted command string
 */
export function formatCommand(
    template: string,
    channelId: string,
    options?: {
        /** The ID of the primary user targeted by the command */
        userId?: string;
        /** The ID of a secondary user (e.g., for transfers) */
        newUserId?: string;
        /** A new name for a channel */
        newChannelName?: string;
        /** A reason to be included in the command output */
        reason?: string;
        /** A size or limit value */
        size?: string;
        /** A generic name placeholder */
        name?: string;
    }
): string {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

    let formatted = template
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel}/g, `<#${channelId}>`)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
        .replace(/{guild_id}/g, channel?.guild_id || "")
        .replace(/{guild_name}/g, guild?.name || "Unknown Guild");

    // Handle optional user placeholders
    if (options?.userId) {
        const user = UserStore.getUser(options.userId);
        const userName = user?.globalName || user?.username || options.userId;
        formatted = formatted
            .replace(/{user_id}/g, options.userId)
            .replace(/{user}/g, `<@${options.userId}>`)
            .replace(/{user_name}/g, userName);
    }

    if (options?.newUserId) {
        const user = UserStore.getUser(options.newUserId);
        const userName = user?.globalName || user?.username || options.newUserId;
        formatted = formatted
            .replace(/{user_id_new}/g, options.newUserId)
            .replace(/{user_new}/g, `<@${options.newUserId}>`)
            .replace(/{user_name_new}/g, userName);
    }

    // Handle optional channel name
    if (options?.newChannelName || options?.name) {
        const name = options?.newChannelName || options?.name || "";
        formatted = formatted.replace(/{channel_name_new}|{name}/g, name);
    }

    // Handle optional reason
    if (options?.reason) {
        formatted = formatted.replace(/{reason}/g, options.reason);
    }

    // Handle optional size
    if (options?.size) {
        formatted = formatted.replace(/{size}/g, options.size);
    }

    return formatMessageCommon(formatted);
}

/**
 * Converts a timestamp or Date object to a Discord-formatted timestamp string (e.g., <t:1234567890:R>).
 * @param datetime The date/timestamp to format
 * @param relative If true, uses the relative time format (:R)
 * @returns The Discord timestamp string
 */
export function toDiscordTime(datetime: number | Date, relative = false): string {
    const timestamp = typeof datetime === 'number' ? datetime : datetime.getTime();
    const seconds = Math.floor(timestamp / 1000);
    return `<t:${seconds}${relative ? ":R" : ""}>`;
}
