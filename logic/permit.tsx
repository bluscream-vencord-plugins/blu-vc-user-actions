import { OptionType } from "@utils/types";
import { ActionType } from "../state"; import { log } from "../utils/logging";
import { formatCommand } from "../utils/formatting";
import { queueAction } from "./queue";
import { PluginModule } from "../types/PluginModule";

// #region Settings
export const permitSettings = {
    permitCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to permit a user",
        default: "!v permit {user_id}",
        restartNeeded: false,
    },
    unpermitCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to unpermit a user",
        default: "!v unpermit {user_id}",
        restartNeeded: false,
    },
    permitRotationEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Automatically cycle permits when limit reached",
        default: false,
        restartNeeded: false,
    },
};
// #endregion

// #region Utils / Formatting
export function formatPermitCommand(channelId: string, userId: string): string {
    const { settings } = require("../settings");
    return formatCommand(settings.store.permitCommand, channelId, { userId });
}

export function formatUnpermitCommand(channelId: string, userId: string): string {
    const { settings } = require("../settings");
    return formatCommand(settings.store.unpermitCommand, channelId, { userId });
}
// #endregion

export const PermitModule: PluginModule = {
    id: "permit",
    name: "Permit Management",
    settings: permitSettings
};

// #region Logic
export function bulkPermit(userIds: string[], channelId: string, guildId: string): number {
    let count = 0;
    for (const userId of userIds) {
        const cmd = formatPermitCommand(channelId, userId);
        log(`Queuing PERMIT for ${userId} in ${channelId}`);
        queueAction({
            type: ActionType.PERMIT,
            userId,
            channelId,
            guildId,
            external: cmd
        });
        count++;
    }
    return count;
}

export function bulkUnpermit(userIds: string[], channelId: string, guildId: string): number {
    let count = 0;
    for (const userId of userIds) {
        const cmd = formatUnpermitCommand(channelId, userId);
        log(`Queuing UNPERMIT for ${userId} in ${channelId}`);
        queueAction({
            type: ActionType.UNPERMIT,
            userId,
            channelId,
            guildId,
            external: cmd
        });
        count++;
    }
    return count;
}
// #endregion
