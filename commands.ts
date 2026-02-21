import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";

import { pluginInfo } from "./info";
import { moduleRegistry } from "./utils/moduleRegistry";
import { stateManager } from "./utils/state";
import { openSettings } from "./utils/settings";

import { ownershipCommands } from "./modules/ownership";
import { bansCommands } from "./modules/bans";
import { whitelistCommands } from "./modules/whitelist";
import { channelNameRotationCommands } from "./modules/channelNameRotation";
import { OwnershipActions } from "./modules/ownership";


const coreCommands = [
    {
        name: `${pluginInfo.commandName} stats`,
        description: "View SocializeGuild memory statistics",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry["settings"];
            if (!settings) {
                return sendBotMessage(ctx.channel.id, { content: "Plugin not initialized." });
            }
            const content = `**SocializeGuild Stats**\nAction Delay: ${settings.queueInterval}s\nBan Pool: ${settings.banLimit}\nVoteBan %: ${settings.voteBanPercentage}%`;
            return sendBotMessage(ctx.channel.id, { content });
        }
    },
    {
        name: `${pluginInfo.commandName} config`,
        description: "View cached MemberChannelInfo for a user",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to lookup",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) {
                return sendBotMessage(ctx.channel ? ctx.channel.id : "unknown", { content: "Missing user." });
            }

            if (!stateManager.hasMemberConfig(userId)) {
                return sendBotMessage(ctx.channel.id, { content: `No cached configuration found for <@${userId}>.` });
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

            return sendBotMessage(ctx.channel.id, { content });
        }
    },
    {
        name: `${pluginInfo.commandName} settings`,
        description: `Open the ${pluginInfo.name} settings modal`,
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            openSettings();
            return sendBotMessage(ctx.channel.id, { content: "Opened settings modal." });
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
