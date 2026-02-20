
import { moduleRegistry } from "./logic/moduleRegistry";
import { actionQueue } from "./utils/actionQueue";
import { stateManager } from "./utils/stateManager";

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
            execute: (args: any, ctx: any) => {
                const settings = moduleRegistry["settings"];
                if (!settings) return;

                return {
                    content: `**SocializeStats**\nAction Delay: ${settings.actionDelayMs}ms\nMax Bans: ${settings.maxBans}\nVoteBan %: ${settings.voteBanPercentage}%`
                };
            }
        },
        {
            name: "sync",
            description: "Force manual sync of channel info and ownership",
            type: 1, // Subcommand
            execute: (args: any, ctx: any) => {
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
            execute: (args: any, ctx: any) => {
                const userId = args[0].value;
                const settings = moduleRegistry["settings"];
                if (!settings || !ctx.channel) return;

                const cmd = settings.banCommand.replace("{user}", `<@${userId}>`);
                actionQueue.enqueue(cmd, ctx.channel.id, true);

                return { content: `Queued ban for <@${userId}>` };
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
            execute: (args: any, ctx: any) => {
                const userId = args[0].value;
                // We'd need current user ID to update stateManager here, mocked for now
                console.log(`Whitelisting ${userId}`);
                return { content: `Whitelisted <@${userId}> locally.` };
            }
        }
    ],
    execute: (args: any[], ctx: any) => {
        // Fallback or help text
        return { content: "Use subcommands like `/socialize stats` or `/socialize ban`." };
    }
};
