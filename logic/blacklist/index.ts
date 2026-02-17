import { settings } from "../../settings";
import { channelOwners, memberInfos, ActionType, state } from "../../state";
import { log } from "../../utils/logging";
import { formatUnbanCommand, formatBanCommand, formatKickCommand } from "./formatting";
import { queueAction } from "../queue";
import { getKickList, setKickList } from "./utils"; // Import setKickList

export function checkBanRotation(channelId: string, userId: string, guildId: string): boolean {
    if (!settings.store.banRotateEnabled) return false;

    const ownership = channelOwners.get(channelId);
    const ownerId = ownership?.creator?.userId || ownership?.claimant?.userId;

    if (!ownerId) return false;

    const info = memberInfos.get(ownerId);
    if (info?.banned && info.banned.length >= settings.store.banLimit) {
        const userToUnban = info.banned[0];
        log(`Ban limit reached for owner ${ownerId}. Rotating ban: unbanning ${userToUnban} for ${userId}`);
        const unbanMsg = formatUnbanCommand(channelId, userToUnban);
        queueAction({
            type: ActionType.UNBAN,
            userId: userToUnban,
            channelId,
            guildId,
            external: unbanMsg
        });
        return true;
    }
    return false;
}

export function checkBlacklistEnforcement(userId: string, channelId: string, guildId: string, oldChannelId: string | null): boolean {
    if (!settings.store.banRotateEnabled) return false;

    const kickList = getKickList();
    if (oldChannelId !== channelId && channelId && kickList.includes(userId)) {
        const hasBeenKicked = state.roleKickedUsers.has(userId);
        if (hasBeenKicked) {
            log(`User ${userId} rejoined while on kicklist, upgrading to BAN`);
            const banMsg = formatBanCommand(channelId, userId);
            queueAction({
                type: ActionType.BAN,
                userId: userId,
                channelId: channelId,
                guildId: guildId,
                external: banMsg
            });
        } else {
            log(`User ${userId} joined while on kicklist, queueing initial KICK`);
            state.roleKickedUsers.add(userId);
            const kickMsg = formatKickCommand(channelId, userId);
            queueAction({
                type: ActionType.KICK,
                userId: userId,
                channelId: channelId,
                guildId: guildId,
                external: kickMsg
            });
        }
        return true;
    }
    return false;
}

export function bulkBanAndKick(userIds: string[], channelId: string, guildId: string): number {
    const kickList = getKickList();
    const newKickList = [...kickList];
    let count = 0;

    for (const userId of userIds) {
        if (!newKickList.includes(userId)) {
            newKickList.push(userId);
        }

        // Queue Kick (Ban command is usually sent when they rejoin and are checked by enforcement,
        // but for "Ban All" we might want to ban them right away or just kick them and let enforcement handle re-joins?
        // The menu action says "Ban All Users in VC".
        // The original logic likely added them to kicklist and KICKED them.
        // Then `checkBlacklistEnforcement` handles the rest if they come back.
        // Or if we want to send BAN command immediately?
        // Let's stick to adding to kicklist + KICK.

        const kickMsg = formatKickCommand(channelId, userId);
        queueAction({
            type: ActionType.KICK,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: kickMsg
        });
        count++;
    }
    setKickList(newKickList);
    return count;
}

export function bulkUnban(userIds: string[], channelId: string, guildId: string): number {
    const kickList = getKickList();
    let newKickList = [...kickList];
    let count = 0;

    for (const userId of userIds) {
        if (newKickList.includes(userId)) {
            newKickList = newKickList.filter(id => id !== userId);

            // Also queue UNBAN if they were actually banned on Discord side?
            // The menu says "Unban All Users".
            // If we used `formatUnbanCommand`, we should probably send it.
            const unbanMsg = formatUnbanCommand(channelId, userId);
            queueAction({
                type: ActionType.UNBAN,
                userId: userId,
                channelId: channelId,
                guildId: guildId,
                external: unbanMsg
            });
            count++;
        }
    }
    setKickList(newKickList);
    return count;
}
