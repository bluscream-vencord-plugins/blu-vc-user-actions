import { UserStore, ChannelStore, GuildStore } from "@webpack/common";
import { settings } from "../settings";
import { channelOwners } from "../state";

export function getRotateNames(): string[] {
    return settings.store.rotateChannelNames
        .split(/\r?\n/)
        .map(name => name.trim())
        .filter(name => name.length > 0);
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

function formatCommand(
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

export function formatCustomMessage(template: string, channelId: string, userId?: string, newChannelName?: string): string {
    return formatCommand(template, channelId, { userId, newChannelName });
}

export function formatclaimCommand(channelId: string, formerOwnerId?: string): string {
    return formatCommand(settings.store.claimCommand, channelId, { userId: formerOwnerId });
}

export function formatsetChannelNameCommand(channelId: string, name: string): string {
    const ownership = channelOwners.get(channelId);
    const ownerInfo = ownership?.claimant || ownership?.creator;
    return formatCommand(settings.store.setChannelNameCommand, channelId, {
        userId: ownerInfo?.userId,
        newChannelName: name,
        reason: ownerInfo?.reason
    });
}

export function formatBanCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.banCommand, channelId, { userId });
}

export function formatUnbanCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.unbanCommand, channelId, { userId });
}

export function formatBanRotationMessage(channelId: string, oldUserId: string, newUserId: string): string {
    const oldUser = UserStore.getUser(oldUserId);

    // Use formatCommand to handle channel, guild, and the new user (as primary user)
    let formatted = formatCommand(settings.store.banRotationMessage, channelId, { userId: newUserId });

    // Handle the specific old user placeholders
    formatted = formatted
        .replace(/{user_id_old}/g, oldUserId)
        .replace(/{user_name_old}/g, oldUser?.username || oldUserId);

    return formatted;
}

export function formatWhitelistSkipMessage(channelId: string, userId: string, actionType: string): string {
    let formatted = formatCommand(settings.store.whitelistSkipMessage, channelId, { userId });
    formatted = formatted.replace(/{action}/g, actionType);
    return formatted;
}

export function formatKickCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.kickCommand, channelId, { userId });
}

export function formatPermitCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.permitCommand, channelId, { userId });
}

export function formatUnpermitCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.unpermitCommand, channelId, { userId });
}

export function formatLockCommand(channelId: string): string {
    return formatCommand(settings.store.lockCommand, channelId);
}

export function formatUnlockCommand(channelId: string): string {
    return formatCommand(settings.store.unlockCommand, channelId);
}

export function formatLimitCommand(channelId: string, limit: number | string): string {
    // There is no specific setChannelUserLimitCommand template that takes a limit in the settings store currently shown in logic.ts switch,
    // assuming it exists or using the standard command.
    // logic.ts: case ActionType.LIMIT: return settings.store.setChannelUserLimitCommand;
    // We need to handle the limit replacement.
    let cmd = settings.store.setChannelUserLimitCommand;
    // formatCommand doesn't support generic replacements yet, let's look at logic.ts replacement.
    // .replace(/{channel_limit}/g, options.channelLimit?.toString() || "");
    // formatCommand supports options? No, let's check formatCommand above.
    // It supports newChannelName and reason.
    // We should probably update formatCommand or just do it here.

    // Let's implement it here using formatCommand as base if possible, or just raw.
    // formatCommand uses formatMessageCommon.
    const channel = ChannelStore.getChannel(channelId);
    let msg = cmd.replace(/{channel_limit}/g, limit.toString())
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel");
    return formatMessageCommon(msg);
}

export function formatChannelNameCommand(channelId: string, name: string): string {
    return formatsetChannelNameCommand(channelId, name);
}

export function formatResetCommand(channelId: string): string {
    return formatCommand(settings.store.resetCommand, channelId);
}

export function formatInfoCommand(channelId: string): string {
    return formatCommand(settings.store.infoCommand, channelId);
}

export function toDiscordTime(datetime: number | Date, relative = false): string {
    const timestamp = typeof datetime === 'number' ? datetime : datetime.getTime();
    const seconds = Math.floor(timestamp / 1000);
    return `<t:${seconds}${relative ? ":R" : ""}>`;
}
