import { settings } from "../../settings";
import { formatCommand, formatMessageCommon } from "../../utils/formatting";

export function formatKickCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.kickCommand, channelId, { userId });
}

export function formatBanCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.banCommand, channelId, { userId });
}

export function formatUnbanCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.unbanCommand, channelId, { userId });
}

export function formatBanRotationMessage(userId: string, oldUserId: string): string {
    // This is ephemeral, so we use formatMessageCommon directly?
    // settings.ts: default: "♾️ Banned user <@{user_id_old}> has been replaced with <@{user_id}>"
    // formatCommand expects channelId, but this message might not need it for replacement if it only uses user ids.
    // However, formatMessageCommon is used by formatCommand.
    // Let's look at how it was used in utils/formatting.ts.

    // original:
    // export function formatBanRotationMessage(userId: string, oldUserId: string): string {
    //     let msg = settings.store.banRotationMessage
    //         .replace(/{user_id}/g, userId)
    //         .replace(/{user_id_old}/g, oldUserId);
    //     return formatMessageCommon(msg);
    // }

    let msg = settings.store.banRotationMessage
        .replace(/{user_id}/g, userId)
        .replace(/{user_id_old}/g, oldUserId);
    return formatMessageCommon(msg);
}
