import { settings } from "../../settings";
import { formatCommand } from "../../utils/formatting";

export function formatsetChannelNameCommand(channelId: string, newChannelName: string): string {
    return formatCommand(settings.store.setChannelNameCommand, channelId, { newChannelName });
}

export function getRotateNames(): string[] {
    return settings.store.rotateChannelNames.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
}
