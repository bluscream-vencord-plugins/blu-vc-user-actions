import { settings } from "../../settings";
import { formatCommand } from "../../utils/formatting";

export function formatPermitCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.permitCommand, channelId, { userId });
}

export function formatUnpermitCommand(channelId: string, userId: string): string {
    return formatCommand(settings.store.unpermitCommand, channelId, { userId });
}
