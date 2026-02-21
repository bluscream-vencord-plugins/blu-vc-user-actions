import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";

import { SocializeActions } from "./logic/actions";
import { moduleRegistry } from "./logic/moduleRegistry";
import { actionQueue } from "./utils/actionQueue";
import { WhitelistModule } from "./logic/whitelist";
import { ChannelNameRotationModule } from "./logic/channelNameRotation";
import { BlacklistModule } from "./logic/blacklist";
import { BansModule } from "./logic/bans";
import { stateManager } from "./utils/stateManager";
import { UserStore as Users } from "@webpack/common";

// All commands use flat names with spaces — Vencord's preferred approach for "subcommands"
export const socializeCommands = [
    {
        name: "socialize stats",
        description: "View SocializeGuild memory statistics",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry["settings"];
            if (!settings) return sendBotMessage(ctx.channel.id, { content: "Plugin not initialized." });
            sendBotMessage(ctx.channel.id, {
                content: `**SocializeGuild Stats**\nAction Delay: ${settings.queueInterval}s\nBan Pool: ${settings.banLimit}\nVoteBan %: ${settings.voteBanPercentage}%`
            });
        }
    },
    {
        name: "socialize sync",
        description: "Force manual sync of channel info and ownership",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry["settings"];
            if (!settings || !ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Plugin not initialized." });
            SocializeActions.syncInfo(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Information sync requested." });
        }
    },
    {
        name: "socialize ban",
        description: "Add a user to the local ban list",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to ban",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Missing user." });
            SocializeActions.banUser(ctx.channel.id, userId, true);
            sendBotMessage(ctx.channel.id, { content: `Triggered ban sequence for <@${userId}>` });
        }
    },
    {
        name: "socialize whitelist",
        description: "Add a user to the local whitelist",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to whitelist",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId) return sendBotMessage(ctx.channel.id, { content: "Missing user." });
            SocializeActions.whitelistUserLocally(userId);
            sendBotMessage(ctx.channel.id, { content: `Whitelisted <@${userId}> locally.` });
        }
    },
    {
        name: "socialize permit",
        description: "Permit a user into managed channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to permit",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Missing user." });
            SocializeActions.permitUser(ctx.channel.id, userId);
            sendBotMessage(ctx.channel.id, { content: `Permitted <@${userId}>` });
        }
    },
    {
        name: "socialize naming start",
        description: "Manually start name rotation for current channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            SocializeActions.startNameRotation(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Started name rotation." });
        }
    },
    {
        name: "socialize naming stop",
        description: "Manually stop name rotation",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            SocializeActions.stopNameRotation();
            sendBotMessage(ctx.channel.id, { content: "Stopped name rotation." });
        }
    },
    {
        name: "socialize config",
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
            if (!userId) return sendBotMessage(ctx.channel.id, { content: "Missing user." });

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

            sendBotMessage(ctx.channel.id, { content });
        }
    },
];
