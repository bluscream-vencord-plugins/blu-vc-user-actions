
import { moduleRegistry } from "./logic/moduleRegistry";
import { actionQueue } from "./utils/actionQueue";
import { VoteBanningModule } from "./logic/voteBanning";
import { WhitelistingModule } from "./logic/whitelisting";
import { NamingModule } from "./logic/naming";
import { stateManager } from "./utils/stateManager";
import { UserStore as Users } from "@webpack/common";

import { CommandArgument, CommandContext } from "@vencord/discord-types";

// Mocking Vencord's command registration.
// Vencord uses a specific structure for ApplicationCommands for plugins.

export const socializeCommand = {
    name: "socialize",
    description: "SocializeGuild Control Command",
    options: [
        {
            name: "stats",
            description: "View memory statistics",
            type: 1, // Subcommand
            execute: (args: CommandArgument[], ctx: CommandContext) => {
                const settings = moduleRegistry["settings"];
                if (!settings) return;

                return {
                    content: `**SocializeStats**\nAction Delay: ${settings.queueInterval}s\nBan Pool: ${settings.banLimit}\nVoteBan %: ${settings.voteBanPercentage}%`
                };
            }
        },
        {
            name: "sync",
            description: "Force manual sync of channel info and ownership",
            type: 1, // Subcommand
            execute: (args: CommandArgument[], ctx: CommandContext) => {
                const settings = moduleRegistry["settings"];
                if (!settings || !ctx.channel) return;

                actionQueue.enqueue(settings.infoCommand, ctx.channel.id, true);
                return { content: "Information sync requested." };
            }
        },
        {
            name: "ban",
            description: "Add a user to the local ban list",
            type: 1, // Subcommand
            options: [
                {
                    name: "user",
                    description: "The user to ban",
                    type: 6, // User
                    required: true
                }
            ],
            execute: (args: CommandArgument[], ctx: CommandContext) => {
                const userId = args[0].value;
                const settings = moduleRegistry["settings"];
                if (!settings || !ctx.channel) return;

                // Pass into the smart logic module instead of blindly queueing
                VoteBanningModule.enforceBanPolicy(userId, ctx.channel.id, false);

                return { content: `Triggered ban sequence for <@${userId}>` };
            }
        },
        {
            name: "whitelist",
            description: "Add user to whitelist",
            type: 1, // Subcommand
            options: [
                {
                    name: "user",
                    description: "The user to whitelist",
                    type: 6, // User
                    required: true
                }
            ],
            execute: (args: CommandArgument[], ctx: CommandContext) => {
                const userId = args[0].value;

                const whitelist = WhitelistingModule.getWhitelist();
                if (!whitelist.includes(userId)) {
                    whitelist.push(userId);
                    WhitelistingModule.setWhitelist(whitelist);
                }

                return { content: `Whitelisted <@${userId}> locally.` };
            }
        },
        {
            name: "permit",
            description: "Permit user into managed channel",
            type: 1,
            options: [{ name: "user", description: "The user to permit", type: 6, required: true }],
            execute: (args: CommandArgument[], ctx: CommandContext) => {
                const userId = args[0].value;
                if (!ctx.channel) return;
                WhitelistingModule.permitUser(userId, ctx.channel.id);
                return { content: `Permitted <@${userId}>` };
            }
        },
        {
            name: "naming",
            description: "Manage channel name rotation",
            type: 1,
            options: [
                {
                    name: "add",
                    description: "Add a name to your rotation list",
                    type: 1,
                    options: [{ name: "name", description: "The name to add", type: 3, required: true }],
                    execute: (args: CommandArgument[]) => {
                        const name = args[0].value as string;
                        const meId = Users.getCurrentUser()?.id || ""; // fallback
                        if (NamingModule.addName(meId, name)) {
                            return { content: `Added "${name}" to rotation list.` };
                        }
                        return { content: `"${name}" is already in the list.` };
                    }
                },
                {
                    name: "remove",
                    description: "Remove a name from your rotation list",
                    type: 1,
                    options: [{ name: "name", description: "The name to remove", type: 3, required: true }],
                    execute: (args: CommandArgument[]) => {
                        const name = args[0].value as string;
                        const meId = Users.getCurrentUser()?.id || "";
                        if (NamingModule.removeName(meId, name)) {
                            return { content: `Removed "${name}" from rotation list.` };
                        }
                        return { content: `"${name}" not found in list.` };
                    }
                },
                {
                    name: "list",
                    description: "List your rotation names",
                    type: 1,
                    execute: () => {
                        const meId = Users.getCurrentUser()?.id || "";
                        const config = stateManager.getMemberConfig(meId);
                        if (config.nameRotationList.length === 0) return { content: "Your rotation list is empty." };
                        return { content: `**Rotation List:**\n${config.nameRotationList.map((n, i) => `${i + 1}. ${n}`).join("\n")}` };
                    }
                },
                {
                    name: "start",
                    description: "Manually start name rotation for current channel",
                    type: 1,
                    execute: (args: any, ctx: CommandContext) => {
                        if (!ctx.channel) return { content: "Join a channel first." };
                        NamingModule.startRotation(ctx.channel.id);
                        return { content: "Started name rotation." };
                    }
                },
                {
                    name: "stop",
                    description: "Manually stop name rotation",
                    type: 1,
                    execute: () => {
                        NamingModule.stopRotation();
                        return { content: "Stopped name rotation." };
                    }
                }
            ]
        }
    ],
    execute: (args: CommandArgument[], ctx: CommandContext) => {
        // Fallback or help text
        return { content: "Use subcommands like `/socialize stats` or `/socialize ban`." };
    }
};
