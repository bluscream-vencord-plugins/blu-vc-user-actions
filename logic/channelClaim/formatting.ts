import { settings } from "../../settings";
import { formatCommand, formatMessageCommon } from "../../utils/formatting";

export function formatclaimCommand(channelId: string, formerOwnerId?: string): string {
    return formatCommand(settings.store.claimCommand, channelId, { userId: formerOwnerId });
}

export function formatInfoCommand(channelId: string): string {
    return formatCommand(settings.store.infoCommand, channelId);
}

export function formatLimitCommand(channelId: string, limit: number | string): string {
    let cmd = settings.store.setChannelUserLimitCommand;
    const { ChannelStore } = require("@webpack/common"); // Lazy load or assume available? Formatting usually synchronous.
    // formatCommand uses ChannelStore. We should probably just pass resolved values or assume formatCommand handles it.
    // logic/kickNotInRole used formatCommand.

    // logic.ts:
    // let msg = cmd.replace(/{channel_limit}/g, limit.toString())
    //             .replace(/{channel_id}/g, channelId)
    //             .replace(/{channel_name}/g, channel?.name || "Unknown Channel");
    // return formatMessageCommon(msg);

    // We can't import ChannelStore here easily without circulars?
    // formatCommand imports it in utils/formatting.ts.
    // So we can use formatMessageCommon?
    // But we need to replace {channel_limit} first.

    // Let's implement it here similar to how it was in utils/formatting.ts
    // Wait, utils/formatting.ts HAD formatLimitCommand.
    // I should move it here.

    // I need ChannelStore.
    // Since this is a formatting module, maybe I should use require() inside functions
    // or just assume it's fine.
    // logic/kickNotInRole/formatting.ts uses formatCommand which uses ChannelStore.
    // The issue is if I replicate logic that uses ChannelStore directly.

    const channel = require("@webpack/common").ChannelStore.getChannel(channelId);
    let msg = cmd.replace(/{channel_limit}/g, limit.toString())
                 .replace(/{channel_id}/g, channelId)
                 .replace(/{channel_name}/g, channel?.name || "Unknown Channel");
    return formatMessageCommon(msg);
}

export function formatLockCommand(channelId: string): string {
    return formatCommand(settings.store.lockCommand, channelId);
}

export function formatUnlockCommand(channelId: string): string {
    return formatCommand(settings.store.unlockCommand, channelId);
}

export function formatResetCommand(channelId: string): string {
    return formatCommand(settings.store.resetCommand, channelId);
}
