import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";

import { moduleRegistry } from "./logic/moduleRegistry";
import { WhitelistModule } from "./logic/whitelist";
import { ChannelNameRotationModule } from "./logic/channelNameRotation";
import { BansModule } from "./logic/bans";
import { stateManager } from "./utils/stateManager";
import { OwnershipActions } from "./logic/ownership";
import { actionQueue } from "./utils/actionQueue";

export const commandName = "socialize";

// All commands use flat names with spaces — Vencord's preferred approach for "subcommands"
export const socializeCommands = [
    {
        name: `${commandName} stats`,
        description: "View SocializeGuild memory statistics",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry["settings"];
            if (!settings) {
                return actionQueue.enqueue("Plugin not initialized.", ctx.channel.id, true);
            }
            const content = `**SocializeGuild Stats**\nAction Delay: ${settings.queueInterval}s\nBan Pool: ${settings.banLimit}\nVoteBan %: ${settings.voteBanPercentage}%`;
            actionQueue.enqueue(content, ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} sync`,
        description: "Force manual sync of channel info and ownership",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const settings = moduleRegistry["settings"];
            if (!settings || !ctx.channel) {
                return actionQueue.enqueue("Plugin not initialized.", ctx.channel.id, true);
            }
            OwnershipActions.syncInfo(ctx.channel.id);
            actionQueue.enqueue("Information sync requested.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} claim`,
        description: "Claim the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            OwnershipActions.claimChannel(ctx.channel.id);
            actionQueue.enqueue("Claim requested.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} lock`,
        description: "Lock the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            OwnershipActions.lockChannel(ctx.channel.id);
            actionQueue.enqueue("Lock requested.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} unlock`,
        description: "Unlock the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            OwnershipActions.unlockChannel(ctx.channel.id);
            actionQueue.enqueue("Unlock requested.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} reset`,
        description: "Reset the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            OwnershipActions.resetChannel(ctx.channel.id);
            actionQueue.enqueue("Reset requested.", ctx.channel.id, true);
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
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            const newName = args.find(a => a.name === "name")?.value;
            if (!newName) {
                return actionQueue.enqueue("Missing name parameter.", ctx.channel.id, true);
            }

            OwnershipActions.renameChannel(ctx.channel.id, newName);
            actionQueue.enqueue(`Rename to "${newName}" requested.`, ctx.channel.id, true);
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
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            const size = args.find(a => a.name === "size")?.value;
            if (typeof size !== 'number') {
                return actionQueue.enqueue("Missing or invalid size parameter.", ctx.channel.id, true);
            }

            OwnershipActions.setChannelSize(ctx.channel.id, size);
            actionQueue.enqueue(`User limit change to ${size} requested.`, ctx.channel.id, true);
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
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            const userId = args.find(a => a.name === "user")?.value;
            if (!userId) {
                return actionQueue.enqueue("Missing user parameter.", ctx.channel.id, true);
            }

            OwnershipActions.kickUser(ctx.channel.id, userId);
            actionQueue.enqueue(`Kick requested for <@${userId}>.`, ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} kick-banned`,
        description: "Kick all locally banned users from the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }

            const n = OwnershipActions.kickBannedUsers(ctx.channel.id);
            let content = "";
            if (n === -1) {
                content = "No personal ban list found for this channel.";
            } else {
                content = n > 0 ? `Kicked ${n} banned user(s).` : "No banned users found in your channel.";
            }
            actionQueue.enqueue(content, ctx.channel.id, true);
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
            if (!userId || !ctx.channel) {
                return actionQueue.enqueue("Missing user or channel.", ctx.channel ? ctx.channel.id : "unknown", true);
            }
            BansModule.enforceBanPolicy(userId, ctx.channel.id, true, "Manual Ban");
            actionQueue.enqueue(`Triggered ban sequence for <@${userId}>`, ctx.channel.id, true);
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
            if (!userId || !ctx.channel) {
                return actionQueue.enqueue("Missing user or channel.", ctx.channel ? ctx.channel.id : "unknown", true);
            }
            BansModule.unbanUser(userId, ctx.channel.id);
            actionQueue.enqueue(`Triggered unban sequence for <@${userId}>`, ctx.channel.id, true);
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
            if (!userId || !ctx.channel) {
                return actionQueue.enqueue("Missing user.", ctx.channel ? ctx.channel.id : "unknown", true);
            }

            const whitelist = WhitelistModule.getWhitelist();
            if (!whitelist.includes(userId)) {
                whitelist.push(userId);
                WhitelistModule.setWhitelist(whitelist);
            }
            actionQueue.enqueue(`Whitelisted <@${userId}> locally.`, ctx.channel.id, true);
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
            if (!userId || !ctx.channel) {
                return actionQueue.enqueue("Missing user.", ctx.channel ? ctx.channel.id : "unknown", true);
            }

            WhitelistModule.unwhitelistUser(userId, ctx.channel.id);
            actionQueue.enqueue(`Removed <@${userId}> from local whitelist.`, ctx.channel.id, true);
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
            if (!userId || !ctx.channel) {
                return actionQueue.enqueue("Missing user.", ctx.channel ? ctx.channel.id : "unknown", true);
            }
            WhitelistModule.whitelistUser(userId, ctx.channel.id);
            WhitelistModule.permitUser(userId, ctx.channel.id);
            actionQueue.enqueue(`Permitted <@${userId}>`, ctx.channel.id, true);
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
            if (!userId || !ctx.channel) {
                return actionQueue.enqueue("Missing user.", ctx.channel ? ctx.channel.id : "unknown", true);
            }
            WhitelistModule.unpermitUser(userId, ctx.channel.id);
            actionQueue.enqueue(`Unpermitted <@${userId}>`, ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} name start`,
        description: "Manually start name rotation for current channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return actionQueue.enqueue("Join a channel first.", ctx.channel.id, true);
            }
            ChannelNameRotationModule.startRotation(ctx.channel.id);
            actionQueue.enqueue("Started name rotation.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} name stop`,
        description: "Manually stop name rotation",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            ChannelNameRotationModule.stopRotation();
            actionQueue.enqueue("Stopped name rotation.", ctx.channel.id, true);
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
            if (!userId || !ctx.channel) {
                return actionQueue.enqueue("Missing user.", ctx.channel ? ctx.channel.id : "unknown", true);
            }

            if (!stateManager.hasMemberConfig(userId)) {
                return actionQueue.enqueue(`No cached configuration found for <@${userId}>.`, ctx.channel.id, true);
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

            actionQueue.enqueue(content, ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} reset-state`,
        description: "Emergency reset of SocializeGuild internal state",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipActions.resetState();
            actionQueue.enqueue("Plugin state reset requested.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} create`,
        description: "Join the creation channel to create a new managed voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipActions.createChannel();
            actionQueue.enqueue("Channel creation requested.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} find`,
        description: "Find an existing owned channel or create a new one",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipActions.findOrCreateChannel(false);
        }
    },
    {
        name: `${commandName} fetch-owners`,
        description: "Fetch all channel owners in the managed category",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            const { OwnershipModule } = require("./logic/ownership");
            OwnershipModule.fetchAllOwners();
            actionQueue.enqueue("Started fetching all owners. This may take a moment.", ctx.channel.id, true);
        }
    },
    {
        name: `${commandName} settings`,
        description: "Open the SocializeGuild settings modal",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            OwnershipActions.openSettings();
            actionQueue.enqueue("Opened settings modal.", ctx.channel.id, true);
        }
    }
];
