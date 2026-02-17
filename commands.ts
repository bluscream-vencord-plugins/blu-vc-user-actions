import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption } from "@api/Commands";
import { UserStore, SelectedChannelStore } from "@webpack/common";
import { sendMessage } from "@utils/discord";
import { settings } from "./settings";
import { state, channelOwners, actionQueue, processedUsers, memberInfos, resetState, MemberChannelInfo } from "./state";
import { getKickList, getRotateNames } from "./utils";
import { rotateChannelName, startRotation, checkChannelOwner, stopRotation, requestChannelInfo, getMemberInfoForChannel, getFriendsOnGuild } from "./logic";

export const commands = [
    {
        name: "channel",
        description: "Manage channel settings, ownership, and rotation",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "info",
                description: "View channel/user info",
                type: ApplicationCommandOptionType.SUB_COMMAND,
                options: [
                    { name: "user", description: "Target user (optional)", type: ApplicationCommandOptionType.USER, required: false },
                    { name: "share", description: "Share results in chat", type: ApplicationCommandOptionType.BOOLEAN, required: false }
                ]
            },
            {
                name: "stats",
                description: "View plugin stats",
                type: ApplicationCommandOptionType.SUB_COMMAND,
                options: [
                    { name: "share", description: "Share results in chat", type: ApplicationCommandOptionType.BOOLEAN, required: false }
                ]
            },
            {
                name: "check",
                description: "Sync ownership and info",
                type: ApplicationCommandOptionType.SUB_COMMAND
            },
            { name: "name-start", description: "Start name rotation", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "name-rotate", description: "Immediately rotate name", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "name-clear", description: "Stop rotation and clear state", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "name-check", description: "Check names for duplicates/invalid length", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "name-add", description: "Add a name to the list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "name", description: "Name to add", type: ApplicationCommandOptionType.STRING, required: true }] },
            { name: "name-remove", description: "Remove a name from the list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "name", description: "Name to remove", type: ApplicationCommandOptionType.STRING, required: true }] },
            { name: "name-share", description: "Share the name list in chat", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "bans-list", description: "Show merged ban list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "user", description: "Specific user to check", type: ApplicationCommandOptionType.USER, required: false }] },
            { name: "bans-share", description: "Share the sync list in chat", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "reset-state", description: "Reset internal state (channel owners, etc.)", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "reset-settings", description: "Reset all settings to defaults", type: ApplicationCommandOptionType.SUB_COMMAND },
            { name: "friends", description: "List mutual friends and their channels", type: ApplicationCommandOptionType.SUB_COMMAND }
        ],
        execute: async (args, ctx) => {
            const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
            const { sendBotMessage } = require("@api/Commands");

            if (!channelId) {
                sendBotMessage(ctx.channel.id, { content: "❌ You must be in a voice channel or context." });
                return;
            }

            const mainOption = args[0];
            const action = mainOption.name;
            const finalOptions = mainOption.options || [];

            switch (action) {
                case "info": {
                    const isShare = findOption(finalOptions, "share", false) as boolean;
                    let targetUserId = findOption(finalOptions, "user", "") as string;

                    if (!targetUserId) {
                        const me = UserStore.getCurrentUser();
                        targetUserId = me?.id;
                    }

                    let targetChannelId = channelId;
                    let info = targetUserId ? memberInfos.get(targetUserId) : undefined;

                    if (info && targetUserId) {
                        for (const [cid, ownership] of channelOwners.entries()) {
                            if (ownership.claimant?.userId === targetUserId || ownership.creator?.userId === targetUserId) {
                                targetChannelId = cid;
                                break;
                            }
                        }
                    } else if (!info) {
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
                                    ? `Creator: ${ownership.creator?.userId ? `<@${ownership.creator.userId}>` : "None"}\nClaimant: ${ownership.claimant?.userId ? `<@${ownership.claimant.userId}>` : "None"}`
                                    : "Unknown",
                                inline: true
                            }
                        ]
                    };

                    if (info) {
                        embed.fields.push({
                            name: "🔧 Channel Settings",
                            value: `Name: ${info.name || "N/A"}\nLimit: ${info.limit || "N/A"}\nOwnerID: ${info.ownerId ? `<@${info.ownerId}>` : (ownership?.creator?.userId ? `<@${ownership.creator.userId}>` : "N/A")}`,
                            inline: false
                        });
                        if (info.permitted.length > 0) embed.fields.push({ name: `Permitted (${info.permitted.length})`, value: info.permitted.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                        if (info.banned.length > 0) embed.fields.push({ name: `Banned (${info.banned.length})`, value: info.banned.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                    }

                    if (isShare) {
                        let content = `### 📊 Channel Information for <#${targetChannelId}>\n`;
                        content += `- **Channel ID:** \`${targetChannelId}\`\n`;
                        if (ownership) {
                            content += `- **Creator:** ${ownership.creator?.userId ? `<@${ownership.creator.userId}>` : "None"}\n`;
                            content += `- **Claimant:** ${ownership.claimant?.userId ? `<@${ownership.claimant.userId}>` : "None"}\n`;
                        }
                        if (info) {
                            content += `**🔧 Settings:**\n`;
                            content += `- Name: \`${info.name || "N/A"}\`\n`;
                            content += `- Limit: \`${info.limit || "N/A"}\`\n`;
                            content += `- Owner ID: ${info.ownerId ? `<@${info.ownerId}>` : (ownership?.creator?.userId ? `<@${ownership.creator.userId}>` : "N/A")}\n`;
                            if (info.permitted.length > 0) content += `- Permitted: ${info.permitted.length} users\n`;
                            if (info.banned.length > 0) content += `- Banned: ${info.banned.length} users\n`;
                        }
                        sendMessage(ctx.channel.id, { content });
                    } else {
                        sendBotMessage(ctx.channel.id, { embeds: [embed] });
                    }
                    break;
                }

                case "stats": {
                    const queueSize = actionQueue.length;
                    const processedCount = processedUsers.size;
                    const content = `**Plugin Stats**\nCached Owners: ${channelOwners.size}\nCached Infos: ${memberInfos.size}\nQueue: ${queueSize}\nProcessed: ${processedCount}`;
                    if (findOption(finalOptions, "share", false) as boolean) {
                        sendMessage(ctx.channel.id, { content });
                    } else {
                        sendBotMessage(ctx.channel.id, { content });
                    }
                    break;
                }

                case "check": {
                    sendBotMessage(ctx.channel.id, { content: "🔄 Checking ownership and channel info..." });
                    await checkChannelOwner(channelId, settings.store.botId);
                    requestChannelInfo(channelId);
                    sendBotMessage(ctx.channel.id, { content: "✅ Ownership check and sync complete." });
                    break;
                }

                case "name-start":
                    startRotation(channelId);
                    sendBotMessage(ctx.channel.id, { content: "✅ Started rotation." });
                    break;
                case "name-rotate":
                    rotateChannelName(channelId);
                    sendBotMessage(ctx.channel.id, { content: "✅ Rotated name." });
                    break;
                case "name-clear":
                    stopRotation(channelId);
                    state.rotationIndex.delete(channelId);
                    sendBotMessage(ctx.channel.id, { content: "✅ Stopped rotation and cleared index." });
                    break;
                case "name-check": {
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
                    break;
                }
                case "name-add": {
                    const newName = findOption(finalOptions, "name", "") as string;
                    const names = getRotateNames();
                    if (names.includes(newName)) { sendBotMessage(ctx.channel.id, { content: "❌ Name already exists." }); return; }
                    if (newName.length > 15) { sendBotMessage(ctx.channel.id, { content: "❌ Name too long (max 15)." }); return; }
                    settings.store.rotateChannelNames += `\n${newName}`;
                    sendBotMessage(ctx.channel.id, { content: `✅ Added ${newName}.` });
                    break;
                }
                case "name-remove": {
                    const toRemove = findOption(finalOptions, "name", "") as string;
                    const names = getRotateNames();
                    const newList = names.filter(n => n !== toRemove);
                    settings.store.rotateChannelNames = newList.join("\n");
                    sendBotMessage(ctx.channel.id, { content: `✅ Removed ${toRemove}.` });
                    break;
                }
                case "name-share": {
                    const names = getRotateNames();
                    sendMessage(ctx.channel.id, { content: `\`\`\`\n${names.join("\n")}\n\`\`\`` });
                    break;
                }

                case "bans-list": {
                    const me = UserStore.getCurrentUser();
                    let targetUserId = findOption(finalOptions, "user", "") as string;

                    let info: MemberChannelInfo | undefined;
                    let contextName = "";

                    if (targetUserId) {
                        info = memberInfos.get(targetUserId);
                        const user = UserStore.getUser(targetUserId);
                        contextName = user?.globalName || user?.username || targetUserId;
                    } else {
                        const ownership = channelOwners.get(channelId);
                        const ownerId = ownership?.claimant?.userId || ownership?.creator?.userId;
                        if (ownerId) {
                            targetUserId = ownerId;
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
                    const allIds = Array.from(new Set([...bannedIds, ...autoKickList]));
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
                        footer: { text: `⭐=Both | ⚙️=Sync Only | 📍=MemberOnly | ♻️=Next to replace` }
                    };

                    sendBotMessage(ctx.channel.id, { embeds: [embed] });
                    break;
                }
                case "bans-share": {
                    const list = getKickList();
                    sendMessage(ctx.channel.id, { content: `\`\`\`\n${list.join("\n")}\n\`\`\`` });
                    break;
                }

                case "reset-state":
                    resetState();
                    sendBotMessage(ctx.channel.id, { content: "✅ Plugin state reset." });
                    break;
                case "reset-settings":
                    for (const key in settings.def) {
                        if (key === "enabled" || (settings.def as any)[key].readonly) continue;
                        try { (settings.store as any)[key] = (settings.def as any)[key].default; } catch (e) { }
                    }
                    sendBotMessage(ctx.channel.id, { content: "✅ Settings reset to defaults (excluding 'enabled')." });
                    break;
                case "friends": {
                    const friendsList = await getFriendsOnGuild(settings.store.guildId);
                    sendBotMessage(ctx.channel.id, { content: friendsList });
                    break;
                }

                default:
                    sendBotMessage(ctx.channel.id, { content: `❌ Unknown action: ${action}` });
            }
        }
    }
];
