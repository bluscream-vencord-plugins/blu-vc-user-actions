import { settings } from "../../settings";
import { formatMessageCommon } from "../../utils/formatting";

export function formatVoteSubmittedMessage(voterId: string, targetUserId: string, expires: number): string {
    const seconds = Math.floor(expires / 1000);
    const msg = settings.store.voteSubmittedMessage
        .replace(/{user_id}/g, voterId)
        .replace(/{target_user_id}/g, targetUserId)
        .replace(/{expires}/g, seconds.toString());
    return formatMessageCommon(msg);
}
