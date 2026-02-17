import { settings } from "../../settings";
import { formatCommand } from "../../utils/formatting";

export function formatKickNotInRoleMessage(channelId: string, userId: string): string {
    return formatCommand(settings.store.kickNotInRoleMessage, channelId, { userId });
}

export function formatKickNotInRoleExternalMessage(channelId: string, userId: string): string {
    return formatCommand(settings.store.kickNotInRoleMessageExternal, channelId, { userId });
}
