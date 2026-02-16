import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { ChannelStore, UserStore, SelectedChannelStore } from "@webpack/common";
import { sendMessage } from "@utils/discord";
import { settings } from "./settings";
import { state, channelOwners, actionQueue, processedUsers, channelInfos, resetState } from "./state";
import { getOwnerForChannel, getKickList, getRotateNames, toDiscordTime } from "./utils";
import { rotateChannelName, startRotation, checkChannelOwner, stopRotation, claimChannel, bulkUnban, requestChannelInfo } from "./logic";
import type { Embed } from "@vencord/discord-types";

const SUBCOMMANDS = {
    INFO: "info",
    PLUGIN: "plugin",
    CHECK: "check",
    NAME: "name",
    RESET: "reset",
    SHARE: "share",
    BANS: "bans"
};

const BANS_SUBCOMMANDS = {
    LIST: "list"
};

const NAME_SUBCOMMANDS = {
    START: "start",
    ROTATE: "rotate",
    CLEAR: "clear",
    CHECK: "check",
    ADD: "add",
    REMOVE: "remove"
};

const RESET_SUBCOMMANDS = {
    STATE: "state",
    SETTINGS: "settings"
};

const SHARE_SUBCOMMANDS = {
    BANS: "bans",
    NAMES: "names",
    STATE: "state"
};

export const commands = [
    {
        name: "channel",
        description: "Manage channel settings, ownership, and rotation",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "action",
                description: "Main action",
                type: ApplicationCommandOptionType.STRING,
                required: true,
                choices: Object.values(SUBCOMMANDS).map(v => ({ name: v, label: v, value: v }))
            },
            {
                name: "subaction",
                description: "Sub-action (for name/reset/share)",
                type: ApplicationCommandOptionType.STRING,
                required: false
            },
            {
                name: "argument",
                description: "Argument (user, name, etc.)",
                type: ApplicationCommandOptionType.STRING,
                required: false
            }
        ],
        execute: async (args, ctx) => {
            const action = args[0]?.value;
            const subaction = args[1]?.value;
            const argument = args[2]?.value;
            const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
            const { sendBotMessage } = require("@api/Commands");

            if (!channelId) {
                sendBotMessage(ctx.channel.id, { content: "❌ You must be in a voice channel or context." });
                return;
            }

            switch (action) {
                case SUBCOMMANDS.INFO: {
                    // /channel info {user or self}
                    let targetUserId = argument;
                    if (targetUserId) {
                        targetUserId = targetUserId.match(/<@!?(\d+)>/)?.[1] || targetUserId;
                    } else {
                        const me = UserStore.getCurrentUser();
                        targetUserId = me?.id;
                    }

                    // Try to find channel by owner ID
                    let targetChannelId = channelId;
                    if (targetUserId) {
                        for (const [cid, info] of channelInfos.entries()) {
                            if (info.ownerId === targetUserId) {
                                targetChannelId = cid;
                                break;
                            }
                        }
                    }

                    const ownership = channelOwners.get(targetChannelId);
                    const info = channelInfos.get(targetChannelId);

                    const embed: any = {
                        type: "rich",
                        title: `📊 Channel Information`,
                        color: 0x5865F2,
                        fields: [
                            {
                                name: "📝 Channel",
                                value: `<#${targetChannelId}>\n\`${targetChannelId}\``,
                                inline: true
                            },
                            {
                                name: "👑 Owner",
                                value: ownership
                                    ? `First: <@${ownership.first?.userId || "None"}>\nLast: <@${ownership.last?.userId || "None"}>`
                                    : "Unknown",
                                inline: true
                            }
                        ]
                    };

                    if (info) {
                        embed.fields.push({
                            name: "🔧 Channel Settings",
                            value: `Name: ${info.name || "N/A"}\nLimit: ${info.limit || "N/A"}\nOwnerID (Parsed): ${info.ownerId ? `<@${info.ownerId}>` : "N/A"}`,
                            inline: false
                        });
                        if (info.permitted.length > 0) embed.fields.push({ name: `Permitted (${info.permitted.length})`, value: info.permitted.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                        if (info.banned.length > 0) embed.fields.push({ name: `Banned (${info.banned.length})`, value: info.banned.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                    }

                    sendBotMessage(ctx.channel.id, { embeds: [embed] });
                    break;
                }

                case SUBCOMMANDS.PLUGIN: {
                    const queueSize = actionQueue.length;
                    const processedCount = processedUsers.size;
                    sendBotMessage(ctx.channel.id, {
                        content: `**Plugin Stats**\nCached Owners: ${channelOwners.size}\nCached Infos: ${channelInfos.size}\nQueue: ${queueSize}\nProcessed: ${processedCount}`
                    });
                    break;
                }

                case SUBCOMMANDS.CHECK: {
                    sendBotMessage(ctx.channel.id, { content: "🔄 Checking ownership and channel info..." });
                    await checkChannelOwner(channelId, settings.store.botId);
                    requestChannelInfo(channelId);
                    break;
                }

                case SUBCOMMANDS.NAME: {
                    if (!subaction) {
                        sendBotMessage(ctx.channel.id, { content: "❌ Missing subaction for name (start, rotate, clear, check, add, remove)" });
                        return;
                    }
                    if (subaction === NAME_SUBCOMMANDS.START) {
                        startRotation(channelId);
                        sendBotMessage(ctx.channel.id, { content: "✅ Started rotation." });
                    } else if (subaction === NAME_SUBCOMMANDS.ROTATE) {
                        rotateChannelName(channelId);
                        sendBotMessage(ctx.channel.id, { content: "✅ Rotated name." });
                    } else if (subaction === NAME_SUBCOMMANDS.CLEAR) {
                        stopRotation(channelId);
                        state.rotationIndex.delete(channelId);
                        sendBotMessage(ctx.channel.id, { content: "✅ Stopped rotation and cleared index." });
                    }
                    else if (subaction === NAME_SUBCOMMANDS.CHECK) {
                        const names = getRotateNames();
                        const invalid = names.filter(n => n.length === 0 || n.length > 15 || n.trim() === "");
                        const duplicates = names.filter((n, i) => names.indexOf(n) !== i);

                        if (invalid.length > 0 || duplicates.length > 0) {
                            let msg = "⚠️ Name check results:\n";
                            if (invalid.length > 0) msg += `- Invalid: ${invalid.join(", ")}\n`;
                            if (duplicates.length > 0) msg += `- Duplicates: ${duplicates.join(", ")}\n`;

                            const valid = names.filter(n => !invalid.includes(n) && !duplicates.includes(n));
                            settings.store.rotateChannelNames = valid.join("\n");
                            sendBotMessage(ctx.channel.id, { content: msg + "Removed invalid/duplicate items." });
                        } else {
                            sendBotMessage(ctx.channel.id, { content: "✅ All names are valid and unique." });
                        }
                    } else if (subaction === NAME_SUBCOMMANDS.ADD) {
                        if (!argument) { sendBotMessage(ctx.channel.id, { content: "❌ Missing name to add." }); return; }
                        const names = getRotateNames();
                        if (names.includes(argument)) { sendBotMessage(ctx.channel.id, { content: "❌ Name already exists." }); return; }
                        if (argument.length > 15) { sendBotMessage(ctx.channel.id, { content: "❌ Name too long (max 15)." }); return; }
                        settings.store.rotateChannelNames += `\n${argument}`;
                        sendBotMessage(ctx.channel.id, { content: `✅ Added ${argument}.` });
                    } else if (subaction === NAME_SUBCOMMANDS.REMOVE) {
                        if (!argument) { sendBotMessage(ctx.channel.id, { content: "❌ Missing name to remove." }); return; }
                        const names = getRotateNames();
                        const newList = names.filter(n => n !== argument);
                        settings.store.rotateChannelNames = newList.join("\n");
                        sendBotMessage(ctx.channel.id, { content: `✅ Removed ${argument}.` });
                    }
                    else {
                        sendBotMessage(ctx.channel.id, { content: `❌ Subaction ${subaction} not fully implemented yet.` });
                    }
                    break;
                }

                case SUBCOMMANDS.RESET: {
                    if (subaction === RESET_SUBCOMMANDS.STATE) {
                        resetState();
                        sendBotMessage(ctx.channel.id, { content: "✅ Plugin state reset." });
                    } else if (subaction === RESET_SUBCOMMANDS.SETTINGS) {
                        // Reset settings
                        for (const key in settings.def) {
                            if (key === "enabled" || (settings.def as any)[key].readonly) continue;
                            try {
                                (settings.store as any)[key] = (settings.def as any)[key].default;
                            } catch (e) { }
                        }
                        sendBotMessage(ctx.channel.id, { content: "✅ Settings reset to defaults (excluding 'enabled')." });
                    } else {
                        sendBotMessage(ctx.channel.id, { content: "❌ Unknown reset target (state, settings)." });
                    }
                    break;
                }

                case SUBCOMMANDS.SHARE: {
                    if (subaction === SHARE_SUBCOMMANDS.NAMES) {
                        const names = getRotateNames();
                        sendMessage(ctx.channel.id, {
                            content: `**${names.length} Channel Names:**\n${names.map(n => `- \`${n}\``).join("\n")}`
                        });
                    } else if (subaction === SHARE_SUBCOMMANDS.BANS) {
                        const list = getKickList();
                        sendMessage(ctx.channel.id, {
                            content: `\`\`\`\n${list.join("\n")}\n\`\`\``
                        });
                    } else if (subaction === SHARE_SUBCOMMANDS.STATE) {
                        const time = new Date().toLocaleString();
                        sendBotMessage(ctx.channel.id, {
                            content: `**Plugin State:**\nTime: ${time}\nGuild: ${settings.store.guildId}\nCategory: ${settings.store.categoryId}\nBot: ${settings.store.botId}\nQueue: ${actionQueue.length}`
                        });
                    } else {
                        sendBotMessage(ctx.channel.id, { content: "❌ Unknown share target." });
                    }
                    break;
                }

                case SUBCOMMANDS.BANS: {
                    if (subaction === BANS_SUBCOMMANDS.LIST) {
                        const list = getKickList();
                        const lines = list.map(id => {
                            const user = UserStore.getUser(id);
                            const name = user?.globalName || user?.username || "Unknown User";
                            return `- ${name} (\`${id}\`)`;
                        });
                        sendBotMessage(ctx.channel.id, {
                            content: `**${list.length} Banned Users (Ephemeral):**\n${lines.join("\n")}`
                        });
                    } else {
                        sendBotMessage(ctx.channel.id, { content: "❌ Unknown bans subcommand (list)." });
                    }
                    break;
                }

                default:
                    sendBotMessage(ctx.channel.id, { content: `❌ Unknown action: ${action}` });
            }
        }
    }
];
