import { OptionType } from "@utils/types";
import { ActionType } from "../state"; import { log } from "../utils/logging";
import { formatCommand } from "../utils/formatting";
import { queueAction } from "./queue";
import { PluginModule } from "../types/PluginModule";
import { ApplicationCommandOptionType, findOption } from "@api/Commands";
import { SelectedChannelStore } from "@webpack/common";

export function formatPermitCommand(channelId: string, userId: string): string {
    const { settings } = require("..");
    return formatCommand(settings.store.permitCommand, channelId, { userId });
}

export function formatUnpermitCommand(channelId: string, userId: string): string {
    const { settings } = require("..");
    return formatCommand(settings.store.unpermitCommand, channelId, { userId });
}

export const PermitModule: PluginModule = {
    id: "permit",
    name: "Permit Management",
    settings: {
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
    },
    commands: [
        {
            name: "permit", description: "Permit a user to the channel", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "user", description: "User to permit", type: ApplicationCommandOptionType.USER, required: true }], execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const userId = findOption(args, "user", "") as string;
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const cmd = formatPermitCommand(channelId, userId);
                queueAction({ type: ActionType.PERMIT, userId, channelId, guildId: ctx.channel.guild_id, external: cmd });
                sendBotMessage(ctx.channel.id, { content: `✅ Queued permit for <@${userId}>.` });
            }
        },
        {
            name: "unpermit", description: "Unpermit a user from the channel", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "user", description: "User to unpermit", type: ApplicationCommandOptionType.USER, required: true }], execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const userId = findOption(args, "user", "") as string;
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const cmd = formatUnpermitCommand(channelId, userId);
                queueAction({ type: ActionType.UNPERMIT, userId, channelId, guildId: ctx.channel.guild_id, external: cmd });
                sendBotMessage(ctx.channel.id, { content: `✅ Queued unpermit for <@${userId}>.` });
            }
        },
    ],
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
