import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { ChannelStore, UserStore, SelectedChannelStore } from "@webpack/common";
import { sendMessage } from "@utils/discord";
import { settings } from "./settings";
import { state, channelOwners, actionQueue, processedUsers, memberInfos, resetState, MemberChannelInfo } from "./state";
import { getOwnerForChannel, getKickList, getRotateNames, toDiscordTime } from "./utils";
import { rotateChannelName, startRotation, checkChannelOwner, stopRotation, claimChannel, bulkUnban, requestChannelInfo, getMemberInfoForChannel } from "./logic";
import type { Embed } from "@vencord/discord-types";

const SUBCOMMANDS = {
    INFO: "info",
    STATS: "stats",
    CHECK: "check",
    NAMES: "names",
    RESET: "reset",
    BANS: "bans"
};

const BANS_SUBCOMMANDS = {
    LIST: "list",
    SHARE: "share"
};

const NAMES_SUBCOMMANDS = {
    START: "start",
    ROTATE: "rotate",
    CLEAR: "clear",
    CHECK: "check",
    ADD: "add",
    REMOVE: "remove",
    SHARE: "share"
};

const STATS_SUBCOMMANDS = {
    VIEW: "view",
    SHARE: "share"
};

const INFO_SUBCOMMANDS = {
    VIEW: "view",
    SHARE: "share"
};

const RESET_SUBCOMMANDS = {
    STATE: "state",
    SETTINGS: "settings"
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
                    const isShare = subaction === INFO_SUBCOMMANDS.SHARE;
                    let targetUserId = argument;
                    if (targetUserId) {
                        targetUserId = targetUserId.match(/<@!?(\d+)>/)?.[1] || targetUserId;
                    } else {
                        const me = UserStore.getCurrentUser();
                        targetUserId = me?.id;
                    }

                    let targetChannelId = channelId;
                    let info = targetUserId ? memberInfos.get(targetUserId) : undefined;

                    if (info && targetUserId) {
                        // Find any channel associated with this owner to show in the embed
                        for (const [cid, ownership] of channelOwners.entries()) {
                            if (ownership.last?.userId === targetUserId || ownership.first?.userId === targetUserId) {
                                targetChannelId = cid;
                                break;
                            }
                        }
                    } else if (!info) {
                        // Fallback to current channel
                        info = getMemberInfoForChannel(channelId);
                    }

                    const ownership = channelOwners.get(targetChannelId);

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
                            value: `Name: ${info.name || "N/A"}\nLimit: ${info.limit || "N/A"}\nOwnerID: ${info.ownerId ? `<@${info.ownerId}>` : "N/A"}`,
                            inline: false
                        });
                        if (info.permitted.length > 0) embed.fields.push({ name: `Permitted (${info.permitted.length})`, value: info.permitted.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                        if (info.banned.length > 0) embed.fields.push({ name: `Banned (${info.banned.length})`, value: info.banned.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                    }

                    if (isShare) {
                        let content = `### 📊 Channel Information for <#${targetChannelId}>\n`;
                        content += `- **Channel ID:** \`${targetChannelId}\`\n`;
                        if (ownership) {
                            content += `- **Creator:** <@${ownership.first?.userId || "None"}>\n`;
                            content += `- **Claimant:** <@${ownership.last?.userId || "None"}>\n`;
                        }
                        if (info) {
                            content += `**🔧 Settings:**\n`;
                            content += `- Name: \`${info.name || "N/A"}\`\n`;
                            content += `- Limit: \`${info.limit || "N/A"}\`\n`;
                            content += `- Owner ID: <@${info.ownerId || "None"}>\n`;
                            if (info.permitted.length > 0) content += `- Permitted: ${info.permitted.length} users\n`;
                            if (info.banned.length > 0) content += `- Banned: ${info.banned.length} users\n`;
                        }
                        sendMessage(ctx.channel.id, { content });
                    } else {
                        sendBotMessage(ctx.channel.id, { embeds: [embed] });
                    }
                    break;
                }

                case SUBCOMMANDS.STATS: {
                    const queueSize = actionQueue.length;
                    const processedCount = processedUsers.size;
                    const content = `**Plugin Stats**\nCached Owners: ${channelOwners.size}\nCached Infos: ${memberInfos.size}\nQueue: ${queueSize}\nProcessed: ${processedCount}`;
                    if (subaction === STATS_SUBCOMMANDS.SHARE) {
                        sendMessage(ctx.channel.id, { content });
                    } else {
                        sendBotMessage(ctx.channel.id, { content });
                    }
                    break;
                }

                case SUBCOMMANDS.CHECK: {
                    sendBotMessage(ctx.channel.id, { content: "🔄 Checking ownership and channel info..." });
                    await checkChannelOwner(channelId, settings.store.botId);
                    requestChannelInfo(channelId);
                    break;
                }

                case SUBCOMMANDS.NAMES: {
                    if (!subaction) {
                        sendBotMessage(ctx.channel.id, { content: "❌ Missing subaction for names (start, rotate, clear, check, add, remove, share)" });
                        return;
                    }
                    if (subaction === NAMES_SUBCOMMANDS.START) {
                        startRotation(channelId);
                        sendBotMessage(ctx.channel.id, { content: "✅ Started rotation." });
                    } else if (subaction === NAMES_SUBCOMMANDS.ROTATE) {
                        rotateChannelName(channelId);
                        sendBotMessage(ctx.channel.id, { content: "✅ Rotated name." });
                    } else if (subaction === NAMES_SUBCOMMANDS.CLEAR) {
                        stopRotation(channelId);
                        state.rotationIndex.delete(channelId);
                        sendBotMessage(ctx.channel.id, { content: "✅ Stopped rotation and cleared index." });
                    }
                    else if (subaction === NAMES_SUBCOMMANDS.CHECK) {
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
                    } else if (subaction === NAMES_SUBCOMMANDS.ADD) {
                        if (!argument) { sendBotMessage(ctx.channel.id, { content: "❌ Missing name to add." }); return; }
                        const names = getRotateNames();
                        if (names.includes(argument)) { sendBotMessage(ctx.channel.id, { content: "❌ Name already exists." }); return; }
                        if (argument.length > 15) { sendBotMessage(ctx.channel.id, { content: "❌ Name too long (max 15)." }); return; }
                        settings.store.rotateChannelNames += `\n${argument}`;
                        sendBotMessage(ctx.channel.id, { content: `✅ Added ${argument}.` });
                    } else if (subaction === NAMES_SUBCOMMANDS.REMOVE) {
                        if (!argument) { sendBotMessage(ctx.channel.id, { content: "❌ Missing name to remove." }); return; }
                        const names = getRotateNames();
                        const newList = names.filter(n => n !== argument);
                        settings.store.rotateChannelNames = newList.join("\n");
                        sendBotMessage(ctx.channel.id, { content: `✅ Removed ${argument}.` });
                    } else if (subaction === NAMES_SUBCOMMANDS.SHARE) {
                        const names = getRotateNames();
                        sendMessage(ctx.channel.id, {
                            content: `\`\`\`\n${names.join("\n")}\n\`\`\``
                        });
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

                case SUBCOMMANDS.BANS: {
                    if (subaction === BANS_SUBCOMMANDS.LIST) {
                        const me = UserStore.getCurrentUser();
                        let targetUserId = argument;
                        if (targetUserId) {
                            targetUserId = targetUserId.match(/<@!?(\d+)>/)?.[1] || targetUserId;
                        }

                        let info: MemberChannelInfo | undefined;
                        let contextName = "";

                        if (targetUserId) {
                            info = memberInfos.get(targetUserId);
                            const user = UserStore.getUser(targetUserId);
                            contextName = user?.globalName || user?.username || targetUserId;
                        } else {
                            const owner = getOwnerForChannel(channelId);
                            if (owner) {
                                targetUserId = owner.userId;
                                info = memberInfos.get(targetUserId);
                                const user = UserStore.getUser(targetUserId);
                                contextName = user?.globalName || user?.username || targetUserId;
                            } else if (me) {
                                targetUserId = me.id;
                                info = memberInfos.get(targetUserId);
                                contextName = "Your Settings";
                            }
                        }

                        const autoKickList = getKickList();
                        const bannedIds = info?.banned || [];

                        // Create a merged list of unique IDs
                        const allIds = Array.from(new Set([...bannedIds, ...autoKickList]));

                        // ID that would be replaced next
                        const nextToReplace = (bannedIds.length >= settings.store.banLimit) ? bannedIds[0] : null;

                        const lines = allIds.map(id => {
                            const user = UserStore.getUser(id);
                            const name = user ? `<@${id}>` : `Unknown (\`${id}\`)`;

                            const isAuto = autoKickList.includes(id);
                            const isChannel = bannedIds.includes(id);

                            let marker = "";
                            if (isAuto && isChannel) marker = " ⭐";
                            else if (isAuto) marker = " ⚙️";
                            else marker = " 📍";

                            if (id === nextToReplace) marker += " ♻️";

                            let source = "";
                            if (isAuto && isChannel) source = "(Both)";
                            else if (isAuto) source = "(Sync)";
                            else source = "(MemberInfo)";

                            return `- ${name} ${source}${marker}`;
                        });

                        const embed: any = {
                            type: "rich",
                            title: `🚫 Ban Configuration: ${contextName}`,
                            description: lines.length > 0 ? lines.join("\n") : "No users are currently banned in this configuration.",
                            color: 0xED4245,
                            fields: [
                                {
                                    name: "📊 Stats",
                                    value: `MemberInfo Bans: ${bannedIds.length}/${settings.store.banLimit}\nGlobal Sync: ${autoKickList.length}`,
                                    inline: false
                                }
                            ],
                            footer: {
                                text: `⭐=Both | ⚙️=Sync Only | 📍=MemberOnly | ♻️=Next to replace`
                            }
                        };

                        sendBotMessage(ctx.channel.id, { embeds: [embed] });
                    } else if (subaction === BANS_SUBCOMMANDS.SHARE) {
                        const list = getKickList();
                        sendMessage(ctx.channel.id, {
                            content: `\`\`\`\n${list.join("\n")}\n\`\`\``
                        });
                    } else {
                        sendBotMessage(ctx.channel.id, { content: "❌ Unknown bans subcommand (list, share)." });
                    }
                    break;
                }

                default:
                    sendBotMessage(ctx.channel.id, { content: `❌ Unknown action: ${action}` });
            }
        }
    }
];
