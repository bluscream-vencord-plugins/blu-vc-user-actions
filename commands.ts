import { ApplicationCommandInputType, ApplicationCommandOptionType, ApplicationCommandType, sendBotMessage } from "@api/Commands";
import { parseMultiUserIds } from "./utils/parsing";
import { pluginInfo } from "./info";
import { moduleRegistry } from "./core/moduleRegistry";
import { stateManager } from "./utils/state";
import { openSettings } from "./utils/settings";

import { ownershipCommands } from "./modules/ownership";
import { bansCommands } from "./modules/bans";
import { whitelistCommands } from "./modules/whitelist";
import { channelNameRotationCommands } from "./modules/channelNameRotation";

const coreCommands = [
    {
        name: `${pluginInfo.commandName} stats`,
        description: "View SocializeGuild memory statistics",
        type: ApplicationCommandType.CHAT_INPUT,
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry.settings;
            if (!settings) {
                sendBotMessage(ctx.channel.id, { content: "Plugin not initialized." });
                return;
            }
            const content = `**SocializeGuild Stats**\nAction Delay: ${settings.queueInterval}s\nBan Pool: ${settings.banLimit}\nVoteBan %: ${settings.voteBanPercentage}%`;
            sendBotMessage(ctx.channel.id, { content });
        }
    },
    {
        name: `${pluginInfo.commandName} config`,
        description: "View cached MemberChannelInfo for a user",
        type: ApplicationCommandType.CHAT_INPUT,
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "users",
                description: "The user(s) to lookup (comma-separated)",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const input = args.find(a => a.name === "users")?.value;
            if (!input || !ctx.channel) {
                sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing context." });
                return;
            }

            const userIds = parseMultiUserIds(input);
            for (const userId of userIds) {
                if (!stateManager.hasMemberConfig(userId)) {
                    sendBotMessage(ctx.channel.id, { content: `No cached configuration found for <@${userId}>.` });
                    continue;
                }

                const config = stateManager.getMemberConfig(userId);
                const content = [
                    `**Configuration for <@${userId}>**`,
                    `Custom Name: \`${config.customName || "None"}\``,
                    `User Limit: \`${config.userLimit || "Default"}\``,
                    `Is Locked: \`${config.isLocked}\``,
                    `Banned Users: ${config.bannedUsers.length > 0 ? config.bannedUsers.map(id => `<@${id}>`).join(", ") : "_None_"}`,
                    `Permitted Users: ${config.permittedUsers.length > 0 ? config.permittedUsers.map(id => `<@${id}>`).join(", ") : "_None_"}`
                ].join("\n");

                sendBotMessage(ctx.channel.id, { content });
            }
        }
    },
    {
        name: `${pluginInfo.commandName} settings`,
        description: `Open the ${pluginInfo.name} settings modal`,
        type: ApplicationCommandType.CHAT_INPUT,
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            openSettings();
            sendBotMessage(ctx.channel.id, { content: "Opened settings modal." });
        }
    }
];

export const socializeCommands = [
    ...coreCommands,
    ...ownershipCommands,
    ...bansCommands,
    ...whitelistCommands,
    ...channelNameRotationCommands
];
