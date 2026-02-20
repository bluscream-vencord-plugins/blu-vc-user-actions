import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";

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
            actionQueue.enqueue(settings.infoCommand, ctx.channel.id, true);
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
            BansModule.enforceBanPolicy(userId, ctx.channel.id, false);
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
            const whitelist = WhitelistModule.getWhitelist();
            if (!whitelist.includes(userId)) {
                whitelist.push(userId);
                WhitelistModule.setWhitelist(whitelist);
            }
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
            WhitelistModule.permitUser(userId, ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: `Permitted <@${userId}>` });
        }
    },
    {
        name: "socialize naming start",
        description: "Manually start name rotation for current channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            ChannelNameRotationModule.startRotation(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Started name rotation." });
        }
    },
    {
        name: "socialize naming stop",
        description: "Manually stop name rotation",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            ChannelNameRotationModule.stopRotation();
            sendBotMessage(ctx.channel.id, { content: "Stopped name rotation." });
        }
    },
];
