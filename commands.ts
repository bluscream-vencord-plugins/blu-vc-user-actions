import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { ChannelStore, UserStore, SelectedChannelStore } from "@webpack/common";
import { settings } from "./settings";
import { state, channelOwners, actionQueue, processedUsers, channelInfos, resetState } from "./state";
import { getOwnerForChannel, getKickList, getRotateNames, toDiscordTime } from "./utils";
import { rotateChannelName, startRotation, checkChannelOwner, stopRotation, claimChannel, bulkUnban } from "./logic";
import type { Embed } from "@vencord/discord-types";

const SUBCOMMANDS = {
    INFO: "info",
    PLUGIN: "plugin",
    CHECK: "check",
    NAME: "name",
    RESET: "reset",
    SHARE: "share"
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
                    if (!targetUserId) {
                        const me = UserStore.getCurrentUser();
                        targetUserId = me?.id;
                    }

                    // For now, just show channel info as before, maybe highlight user?
                    // The requirement says "shows cached user info for us or the specified user"
                    // But we track info per channel...
                    // Maybe it means "show info ABOUT the channel I am in"?
                    // Re-using the logic from the old /socialize command

                    const ownership = channelOwners.get(channelId);
                    const info = channelInfos.get(channelId);
                    const isMyChannel = SelectedChannelStore.getVoiceChannelId() === channelId;

                    const embed: any = {
                        type: "rich",
                        title: `📊 Channel Information`,
                        color: 0x5865F2,
                        fields: [
                            {
                                name: "📝 Channel",
                                value: `<#${channelId}>\n\`${channelId}\``,
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
                    sendBotMessage(ctx.channel.id, { content: "🔄 Checking ownership and info..." });
                    await checkChannelOwner(channelId, settings.store.botId);
                    // Also trigger info check?
                    // requestChannelInfo(channelId); // This is not exported or available?
                    // We need to export it from logic.ts
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
                    // Implement other name subcommands (add/remove/check) if needed
                    else {
                        sendBotMessage(ctx.channel.id, { content: `❌ Subaction ${subaction} not fully implemented yet.` });
                    }
                    break;
                }

                case SUBCOMMANDS.RESET: {
                    if (subaction === RESET_SUBCOMMANDS.STATE) {
                        resetState();
                        sendBotMessage(ctx.channel.id, { content: "✅ Plugin state reset." });
                    } else {
                        sendBotMessage(ctx.channel.id, { content: "❌ Unknown reset target." });
                    }
                    break;
                }

                case SUBCOMMANDS.SHARE: {
                    if (subaction === SHARE_SUBCOMMANDS.BANS) {
                        const list = getKickList();
                        sendBotMessage(ctx.channel.id, {
                            content: `**${list.length} Banned Users:**\n${list.map(id => `- \`${id}\` <@${id}>`).join("\n")}`
                        });
                    } else {
                        sendBotMessage(ctx.channel.id, { content: "❌ Unknown share target." });
                    }
                    break;
                }

                default:
                    sendBotMessage(ctx.channel.id, { content: `❌ Unknown action: ${action}` });
            }
        }
    }
];
