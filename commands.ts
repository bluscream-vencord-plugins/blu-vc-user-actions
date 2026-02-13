import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { ChannelStore, UserStore, SelectedChannelStore } from "@webpack/common";
import { settings } from "./settings";
import { state, channelOwners } from "./state";
import { getOwnerForChannel, getKickList } from "./utils";
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
                sendBotMessage(ctx.channel.id, {
                    content: "❌ You are not in a voice channel and no channel ID was provided."
                });
                return;
            }

            const channel = ChannelStore.getChannel(channelId);
            if (!channel) {
                sendBotMessage(ctx.channel.id, {
                    content: `❌ Channel not found: ${channelId}`
                });
                return;
            }

            // Get owner info
            const ownerInfo = getOwnerForChannel(channelId);
            const ownerUser = ownerInfo?.userId ? UserStore.getUser(ownerInfo.userId) : null;
            const ownerName = ownerUser?.globalName || ownerUser?.username || ownerInfo?.userId || "Unknown";
            const ownerTimestamp = ownerInfo?.timestamp ? `<t:${Math.floor(ownerInfo.timestamp / 1000)}:R>` : "Unknown";

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
                            ? `<@${ownerInfo.userId}>\n**Reason:** ${ownerInfo.reason}\n**Since:** ${ownerTimestamp}\n**Cached:** <t:${Math.floor(ownerInfo.updated / 1000)}:R>`
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
                        `**Since:** <t:${Math.floor(info.timestamp / 1000)}:R>`,
                        `**Cached:** <t:${Math.floor(info.updated / 1000)}:R>`
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

            sendBotMessage(ctx.channel.id, {
                embeds: [embed]
            });
        }
    }
];
