import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";

import { moduleRegistry } from "./logic/moduleRegistry";
import { actionQueue } from "./utils/actionQueue";
import { WhitelistModule } from "./logic/whitelist";
import { ChannelNameRotationModule } from "./logic/channelNameRotation";
import { BlacklistModule } from "./logic/blacklist";
import { BansModule } from "./logic/bans";
import { stateManager } from "./utils/stateManager";
import { UserStore as Users } from "@webpack/common";
import { OwnershipActions } from "./logic/ownership";

export const commandName = "socialize";

// All commands use flat names with spaces — Vencord's preferred approach for "subcommands"
export const socializeCommands = [
    {
        name: `${commandName} stats`,
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
        name: `${commandName} sync`,
        description: "Force manual sync of channel info and ownership",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry["settings"];
            if (!settings || !ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Plugin not initialized." });
            OwnershipActions.syncInfo(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Information sync requested." });
        }
    },
    {
        name: `${commandName} claim`,
        description: "Claim the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            OwnershipActions.claimChannel(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Claim requested." });
        }
    },
    {
        name: `${commandName} lock`,
        description: "Lock the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            OwnershipActions.lockChannel(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Lock requested." });
        }
    },
    {
        name: `${commandName} unlock`,
        description: "Unlock the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            OwnershipActions.unlockChannel(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Unlock requested." });
        }
    },
    {
        name: `${commandName} reset`,
        description: "Reset the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            OwnershipActions.resetChannel(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Reset requested." });
        }
    },
    {
        name: `${commandName} rename`,
        description: "Rename the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "name",
                description: "The new name for the channel",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            const newName = args.find(a => a.name === "name")?.value;
            if (!newName) return sendBotMessage(ctx.channel.id, { content: "Missing name parameter." });

            OwnershipActions.renameChannel(ctx.channel.id, newName);
            sendBotMessage(ctx.channel.id, { content: `Rename to "${newName}" requested.` });
        }
    },
    {
        name: `${commandName} limit`,
        description: "Set the user limit for the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "size",
                description: "The new user limit (0 for unlimited)",
                type: ApplicationCommandOptionType.INTEGER,
                required: true,
                min_value: 0,
                max_value: 99
            }
        ],
        execute: (args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            const size = args.find(a => a.name === "size")?.value;
            if (typeof size !== 'number') return sendBotMessage(ctx.channel.id, { content: "Missing or invalid size parameter." });

            OwnershipActions.setChannelSize(ctx.channel.id, size);
            sendBotMessage(ctx.channel.id, { content: `User limit change to ${size} requested.` });
        }
    },
    {
        name: `${commandName} kick`,
        description: "Kick a user from the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to kick",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId) return sendBotMessage(ctx.channel.id, { content: "Missing user parameter." });

            OwnershipActions.kickUser(ctx.channel.id, userId);
            sendBotMessage(ctx.channel.id, { content: `Kick requested for <@${userId}>.` });
        }
    },
    {
        name: `${commandName} ban`,
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
            BansModule.enforceBanPolicy(userId, ctx.channel.id, true, "Manual Ban");
            sendBotMessage(ctx.channel.id, { content: `Triggered ban sequence for <@${userId}>` });
        }
    },
    {
        name: `${commandName} unban`,
        description: "Remove a user from the local ban list",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to unban",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Missing user." });
            BansModule.unbanUser(userId, ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: `Triggered unban sequence for <@${userId}>` });
        }
    },
    {
        name: `${commandName} whitelist`,
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
        name: `${commandName} unwhitelist`,
        description: "Remove a user from the local whitelist",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to unwhitelist",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId) return sendBotMessage(ctx.channel.id, { content: "Missing user." });

            WhitelistModule.unwhitelistUser(userId, ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: `Removed <@${userId}> from local whitelist.` });
        }
    },
    {
        name: `${commandName} permit`,
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
            WhitelistModule.whitelistUser(userId, ctx.channel.id);
            WhitelistModule.permitUser(userId, ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: `Permitted <@${userId}>` });
        }
    },
    {
        name: `${commandName} unpermit`,
        description: "Unpermit a user from managed channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "The user to unpermit",
                type: ApplicationCommandOptionType.USER,
                required: true
            }
        ],
        execute: (args: any[], ctx: any) => {
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId || !ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Missing user." });
            WhitelistModule.unpermitUser(userId, ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: `Unpermitted <@${userId}>` });
        }
    },
    {
        name: `${commandName} naming start`,
        description: "Manually start name rotation for current channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            ChannelNameRotationModule.startRotation(ctx.channel.id);
            sendBotMessage(ctx.channel.id, { content: "Started name rotation." });
        }
    },
    {
        name: `${commandName} naming stop`,
        description: "Manually stop name rotation",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            ChannelNameRotationModule.stopRotation();
            sendBotMessage(ctx.channel.id, { content: "Stopped name rotation." });
        }
    },
    {
        name: `${commandName} config`,
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
    {
        name: `${commandName} fetch-owners`,
        description: "Fetch all channel owners in the managed category",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const { OwnershipModule } = require("./logic/ownership");
            OwnershipModule.fetchAllOwners();
            sendBotMessage(ctx.channel.id, { content: "Started fetching all owners. This may take a moment." });
        }
    },
    {
        name: `${commandName} settings`,
        description: "Open the SocializeGuild settings modal",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const { openPluginModal } = require("@components/settings/tabs");
            const { plugins } = require("@api/PluginManager");
            try {
                openPluginModal(plugins["SocializeGuild"]);
                sendBotMessage(ctx.channel.id, { content: "Opened settings modal." });
            } catch (e) {
                sendBotMessage(ctx.channel.id, { content: "Failed to open settings modal." });
            }
        }
    }
];
