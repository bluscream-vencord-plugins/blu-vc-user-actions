import { settings } from "../../settings";
import { formatCommand } from "../../utils/formatting";

export function formatWhitelistSkipMessage(channelId: string, userId: string, actionType: string): string {
    let formatted = formatCommand(settings.store.whitelistSkipMessage, channelId, { userId });
    formatted = formatted.replace(/{action}/g, actionType);
    return formatted;
}
