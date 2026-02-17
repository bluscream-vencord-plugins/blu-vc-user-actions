import { settings } from "../../settings";
import { channelOwners, memberInfos, state, ActionType } from "../../state";
import { log } from "../../utils/logging";
import { formatUnpermitCommand, formatPermitCommand } from "./formatting";
import { queueAction } from "../queue";

export function checkPermitRotation(channelId: string, userId: string, guildId: string): boolean {
    if (!settings.store.permitRotateEnabled) return false;

    const ownership = channelOwners.get(channelId);
    const ownerId = ownership?.creator?.userId || ownership?.claimant?.userId;
    if (ownerId) {
        const info = memberInfos.get(ownerId);
        if (info?.permitted && info.permitted.length >= settings.store.permitLimit) {
            const userToUnpermit = info.permitted[0];
            log(`Permit limit reached for owner ${ownerId}. Rotating permit: unpermitting ${userToUnpermit} for ${userId}`);
            const unpermitMsg = formatUnpermitCommand(channelId, userToUnpermit);
            queueAction({
                type: ActionType.UNPERMIT,
                userId: userToUnpermit,
                channelId,
                guildId,
                external: unpermitMsg
            });
            return true;
        }
    }

    return false;
}

export function bulkPermit(userIds: string[], channelId: string, guildId: string): number {
    let count = 0;
    for (const userId of userIds) {
        const permitMsg = formatPermitCommand(channelId, userId);
        queueAction({
            type: ActionType.PERMIT,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: permitMsg
        });
        count++;
    }
    return count;
}

export function bulkUnpermit(userIds: string[], channelId: string, guildId: string): number {
    let count = 0;
    for (const userId of userIds) {
        const unpermitMsg = formatUnpermitCommand(channelId, userId);
        queueAction({
            type: ActionType.UNPERMIT,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: unpermitMsg
        });
        count++;
    }
    return count;
}
