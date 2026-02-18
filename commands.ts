import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { Modules } from "./ModuleRegistry";

const subCommands = Modules.flatMap(m => m.commands || []);

export const commands = [
    {
        name: "channel",
        description: "Socialize Guild Moderation Commands",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: subCommands,
        execute: async (args: any, ctx: any) => {
            const subCommandName = args[0].name;
            const subCommand = subCommands.find(c => c.name === subCommandName);

            if (subCommand?.execute) {
                return subCommand.execute(args[0].options, ctx);
            }

            const { sendBotMessage } = require("@api/Commands");
            sendBotMessage(ctx.channel.id, { content: `❌ Unknown sub-command: ${subCommandName}` });
        }
    }
];
