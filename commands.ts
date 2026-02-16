import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { ChannelStore, UserStore, SelectedChannelStore } from "@webpack/common";
import { settings } from "./settings";
import { state, channelOwners, actionQueue, processedUsers } from "./state";
import { getOwnerForChannel, getKickList, getRotateNames, toDiscordTime } from "./utils";
import { rotateChannelName, startRotation } from "./logic";
import type { Embed } from "@vencord/discord-types";

export const commands = [
    {
        name: "socialize",
        description: "Display detailed information about the current voice channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "channel",
                description: "Channel ID (defaults to current voice channel)",
                type: ApplicationCommandOptionType.STRING,
                required: false
            }
        ],
        execute: (args, ctx) => {
            const channelId = args[0]?.value || SelectedChannelStore.getVoiceChannelId();

            if (!channelId) {
                const { sendBotMessage } = require("@api/Commands");
                sendBotMessage(ctx.channel.id, {
                    content: "❌ You are not in a voice channel and no channel ID was provided."
                });
                return;
            }

            const channel = ChannelStore.getChannel(channelId);
            if (!channel) {
                const { sendBotMessage } = require("@api/Commands");
                sendBotMessage(ctx.channel.id, {
                    content: `❌ Channel not found: ${channelId}`
                });
                return;
            }

            // Get owner info
            const ownerInfo = getOwnerForChannel(channelId);
            const ownerUser = ownerInfo?.userId ? UserStore.getUser(ownerInfo.userId) : null;
            const ownerName = ownerUser?.globalName || ownerUser?.username || ownerInfo?.userId || "Unknown";
            const ownerTimestamp = ownerInfo?.timestamp ? toDiscordTime(ownerInfo.timestamp, true) : "Unknown";

            // Get channel info
            const info = state.channelInfo;
            const me = UserStore.getCurrentUser();
            const isMyChannel = SelectedChannelStore.getVoiceChannelId() === channelId;

            // Build embed
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
                        value: ownerInfo?.userId
                            ? `<@${ownerInfo.userId}>\n**Reason:** ${ownerInfo.reason}\n**Since:** ${ownerTimestamp}\n**Cached:** ${toDiscordTime(ownerInfo.updated, true)}`
                            : "Unknown",
                        inline: true
                    },
                    {
                        name: "ℹ️ Status",
                        value: isMyChannel ? "✅ You are here" : "❌ Not in this channel",
                        inline: true
                    }
                ],
                footer: {
                    text: `${settings.store.guildId === channel.guild_id ? "Monitored Guild" : "Different Guild"}`
                },
                timestamp: new Date().toISOString()
            };

            // Add channel info if available
            if (info && isMyChannel) {
                embed.fields.push({
                    name: "🔧 Channel Settings",
                    value: [
                        info.name ? `**Name:** ${info.name}` : null,
                        info.limit ? `**Limit:** ${info.limit}` : null,
                        info.status ? `**Status:** ${info.status}` : null,
                        `**Since:** ${toDiscordTime(info.timestamp, true)}`,
                        `**Cached:** ${toDiscordTime(info.updated, true)}`
                    ].filter(Boolean).join("\n") || "No data",
                    inline: false
                });

                const max_items = 20

                if (info.permitted && info.permitted.length > 0) {
                    embed.fields.push({
                        name: `✅ Permitted Users (${info.permitted.length})`,
                        value: info.permitted.slice(0, max_items).map(id => `<@${id}>`).join(", ") +
                            (info.permitted.length > max_items ? `\n*...and ${info.permitted.length - max_items} more*` : ""),
                        inline: false
                    });
                }

                if (info.banned && info.banned.length > 0) {
                    embed.fields.push({
                        name: `🚫 Banned Users (${info.banned.length})`,
                        value: info.banned.slice(0, max_items).map(id => `<@${id}>`).join(",") +
                            (info.banned.length > max_items ? `\n*...and ${info.banned.length - max_items} more*` : ""),
                        inline: false
                    });
                }

                const localBanList = getKickList();
                if (localBanList && localBanList.length > 0) {
                    embed.fields.push({
                        name: `🚫 Local Ban List (${localBanList.length})`,
                        value: localBanList.slice(0, max_items).map(id => `<@${id}>`).join(",") +
                            (localBanList.length > max_items ? `\n*...and ${localBanList.length - max_items} more*` : ""),
                        inline: false
                    });
                }
            }

            // Global Info
            if (isMyChannel && settings.store.rotateChannelNamesEnabled) {
                const names = getRotateNames();
                const interval = settings.store.rotateChannelNamesTime;
                const nextIndex = state.rotationIndex.get(channelId) ?? 0;
                const lastTime = state.lastRotationTime.get(channelId);
                let nextTimeStr = "Not active";

                if (lastTime) {
                    const nextTime = lastTime + (interval * 60 * 1000);
                    nextTimeStr = toDiscordTime(nextTime, true);
                }

                if (names.length > 0) {
                    const nextName = names[nextIndex];
                    embed.fields.push({
                        name: `🔄 Rotation Info`,
                        value: `**Interval:** ${interval}m\n**Next Name:** ${nextName}\n**Next Rotation:** ${nextTimeStr}\n**Names (${names.length}):**\n${names.map((n, i) => i === nextIndex ? `> **${n}**` : `  ${n}`).join("\n")}`,
                        inline: false
                    });
                }
            }

            const queueSize = actionQueue.length;
            const processedCount = processedUsers.size;

            embed.fields.push({
                name: "💾 Plugin Stats",
                value: `**Cached Owners:** ${channelOwners.size}\n**Queue Size:** ${queueSize}\n**Processed Users:** ${processedCount}\n**Enabled:** ${settings.store.enabled ? "✅" : "❌"}`,
                inline: true
            });

            const { sendBotMessage } = require("@api/Commands");
            sendBotMessage(ctx.channel.id, {
                embeds: [embed]
            });
        }
    },
    {
        name: "rotate",
        description: "Force the next channel name rotation and ensure rotation is enabled",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (args, ctx) => {
            const channelId = SelectedChannelStore.getVoiceChannelId();
            if (!channelId) {
                const { sendBotMessage } = require("@api/Commands");
                sendBotMessage(ctx.channel.id, { content: "❌ You are not in a voice channel." });
                return;
            }

            // Manually trigger the next rotation
            rotateChannelName(channelId);

            const { sendBotMessage } = require("@api/Commands");
            sendBotMessage(ctx.channel.id, { content: "🔄 Rotation triggered (next name selected)." });
        }
    }
];
