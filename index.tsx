//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import { sendBotMessage } from "@api/Commands";
import { sendMessage } from "@utils/discord";
import type { Message } from "@vencord/discord-types";
import {
    ChannelStore,
    UserStore,
    SelectedChannelStore,
    VoiceStateStore,
    showToast,
    GuildStore,
} from "@webpack/common";

import { settings } from "./settings";
import { ActionType, state, actionQueue, processedUsers } from "./state";
import { logger as utilLogger, log, getKickList, getOwnerForChannel, formatBanCommand, formatUnbanCommand, formatBanRotationMessage } from "./utils";
import {
    processQueue,
    checkChannelOwner,
    fetchAllOwners,
    claimChannel,
    stopRotation,
    handleOwnerUpdate,
    handleInfoUpdate,
} from "./logic";
import { parseBotInfoMessage } from "./utils";
import {
    UserContextMenuPatch,
    GuildContextMenuPatch,
    ChannelContextMenuPatch,
} from "./menus";
import { registerSharedContextMenu } from "./utils/menus";
import { getToolboxActions } from "./toolbox";
import { commands } from "./commands";
import { Logger } from "@utils/Logger";
// endregion Imports

// region PluginInfo
export const pluginInfo = {
    id: "socializeGuild",
    name: "SocializeGuild",
    description: "Automatically takes actions against users joining your voice channel",
    color: "#7289da",
    authors: [
        { name: "Bluscream", id: 467777925790564352n },
        { name: "Assistant", id: 0n }
    ],
};
// endregion PluginInfo

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
// endregion Variables

// region Types
interface MessageCreatePayload {
    channelId: string;
    guildId: string;
    message: Message;
    optimistic?: boolean;
}
// endregion Types

// region Definition
export default definePlugin({
    name: pluginInfo.name,
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,
    commands,
    toolboxActions: getToolboxActions,
    contextMenus: {
        "user-context": UserContextMenuPatch,
        "guild-context": GuildContextMenuPatch,
        "channel-context": ChannelContextMenuPatch,
    },
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }) {
            if (!settings.store.enabled) return;
            const me = UserStore.getCurrentUser();
            if (!me) return;

            const targetGuildVoiceStates = voiceStates.filter(s => s.guildId === settings.store.guildId);
            if (targetGuildVoiceStates.length === 0) return;

            if (state.myLastVoiceChannelId === undefined) {
                const initialCid = SelectedChannelStore.getVoiceChannelId() ?? null;
                state.myLastVoiceChannelId = initialCid;
                if (initialCid) {
                    checkChannelOwner(initialCid, settings.store.botId).then(owner => {
                        if (owner.userId) handleOwnerUpdate(initialCid, owner);
                    });
                }
            }

            for (const s of targetGuildVoiceStates) {
                if (s.userId === me.id) {
                    const newChannelId = s.channelId ?? null;
                    if (newChannelId !== state.myLastVoiceChannelId) {
                        const oldChannelId = state.myLastVoiceChannelId;
                        if (oldChannelId) stopRotation(oldChannelId);

                        actionQueue.length = 0;
                        state.myLastVoiceChannelId = newChannelId;


                        if (newChannelId) {
                            // Wait 1 second before checking ownership to give the bot time to send welcome message
                            setTimeout(() => {
                                checkChannelOwner(newChannelId, settings.store.botId).then(owner => {
                                    if (owner.userId) {
                                        log(`Detailed ownership check: userId=${owner.userId}`);
                                        handleOwnerUpdate(newChannelId, owner);

                                        if (settings.store.autoClaimDisbanded && owner.userId !== me.id) {
                                            const voiceStates = VoiceStateStore.getVoiceStatesForChannel(newChannelId);
                                            if (!voiceStates[owner.userId]) {
                                                log(`Owner ${owner.userId} not in channel, claiming disbanded channel.`);
                                                claimChannel(newChannelId, owner.userId);
                                            }
                                        }
                                    }
                                });
                            }, 1000);
                        }
                    }
                }
            }

            // Handle owner departures for auto-claim
            for (const s of targetGuildVoiceStates) {
                // If someone left a channel (or moved)
                if (s.oldChannelId && s.oldChannelId !== s.channelId) {
                    const oldChannel = ChannelStore.getChannel(s.oldChannelId);
                    if (oldChannel?.parent_id !== settings.store.categoryId) continue;

                    const ownerInfo = getOwnerForChannel(s.oldChannelId);
                    // If the person who left was the cached owner
                    if (ownerInfo && ownerInfo.userId === s.userId) {
                        log(`Owner ${s.userId} left channel ${s.oldChannelId}`);

                        const isMyChannel = state.myLastVoiceChannelId === s.oldChannelId;
                        const shouldClaim = (settings.store.autoClaimDisbanded && isMyChannel) || settings.store.autoClaimDisbandedAny;

                        if (shouldClaim) {
                            claimChannel(s.oldChannelId, ownerInfo.userId);
                        } else {
                            log(`Auto-claim disabled for ${isMyChannel ? "current" : "other"} channel, skipping.`);
                        }
                    }
                }
            }

            const myChannelId = state.myLastVoiceChannelId;
            if (!myChannelId) return;

            // Auto-kick logic
            if (settings.store.autoKickEnabled) {
                for (const s of targetGuildVoiceStates) {
                    if (s.userId === me.id) continue;

                    if (s.oldChannelId !== myChannelId && s.channelId === myChannelId) {
                        const kickList = getKickList();
                        if (kickList.includes(s.userId)) {
                            const now = Date.now();
                            const lastAction = processedUsers.get(s.userId) || 0;
                            if (now - lastAction < settings.store.queueTime) continue;

                            let ownerInfo = getOwnerForChannel(myChannelId);
                            if (!ownerInfo || ownerInfo.userId === "") {
                                ownerInfo = await checkChannelOwner(myChannelId, settings.store.botId);
                            }

                            if (ownerInfo?.userId === me.id) {
                                log(`Adding ${s.userId} to action queue`);
                                actionQueue.push({
                                    type: ActionType.KICK,
                                    userId: s.userId,
                                    channelId: myChannelId,
                                    guildId: s.guildId
                                });
                                processQueue();
                            } else {
                                log(`Not owner of ${myChannelId} (Owner: ${ownerInfo?.userId}), skipping kick for ${s.userId}`);
                            }
                        }
                    }
                }
            }

            // Ban rotation logic
            if (settings.store.banRotateEnabled) {
                for (const s of targetGuildVoiceStates) {
                    if (s.userId === me.id) continue;

                    if (s.oldChannelId !== myChannelId && s.channelId === myChannelId) {
                        const kickList = getKickList();
                        if (kickList.includes(s.userId)) {
                            // Check if user is already banned
                            if (!state.channelInfo?.banned.includes(s.userId)) {
                                let ownerInfo = getOwnerForChannel(myChannelId);
                                if (!ownerInfo || ownerInfo.userId === "") {
                                    ownerInfo = await checkChannelOwner(myChannelId, settings.store.botId);
                                }

                                if (ownerInfo?.userId === me.id) {
                                    // Get first banned user to unban
                                    const userToUnban = state.channelInfo?.banned[0];

                                    if (userToUnban) {
                                        // Send unban command
                                        const unbanCmd = formatUnbanCommand(myChannelId, userToUnban);
                                        log(`Ban rotation: Unbanning ${userToUnban}`);
                                        sendMessage(myChannelId, { content: unbanCmd });

                                        // Update cache - remove from banned
                                        if (state.channelInfo) {
                                            state.channelInfo.banned = state.channelInfo.banned.filter(id => id !== userToUnban);
                                        }

                                        // Send ephemeral message
                                        if (settings.store.banRotationMessage) {
                                            const msg = formatBanRotationMessage(myChannelId, userToUnban, s.userId);
                                            sendBotMessage(myChannelId, { content: msg });
                                        }
                                    }

                                    // Send ban command for joining user
                                    const banCmd = formatBanCommand(myChannelId, s.userId);
                                    log(`Ban rotation: Banning ${s.userId}`);
                                    sendMessage(myChannelId, { content: banCmd });

                                    // Update cache - add to banned
                                    if (state.channelInfo && !state.channelInfo.banned.includes(s.userId)) {
                                        state.channelInfo.banned.push(s.userId);
                                    }
                                } else {
                                    log(`Not owner of ${myChannelId} (Owner: ${ownerInfo?.userId}), skipping ban rotation for ${s.userId}`);
                                }
                            } else {
                                log(`User ${s.userId} is already banned, skipping ban rotation`);
                            }
                        }
                    }
                }
            }
        },
        MESSAGE_CREATE({ message, channelId, guildId }: MessageCreatePayload) {
            if (!settings.store.enabled) return;
            if (guildId !== settings.store.guildId) return;

            // Handle Ownership from Bot Messages
            const owner = getMessageOwner(message, settings.store.botId);
            if (owner) {
                handleOwnerUpdate(channelId, owner);
                return;
            }

            // Handle Channel Info from Bot Messages
            if (message.author.id === settings.store.botId) {
                const embed = message.embeds?.[0];

                // Check if it's the specific channel info embed
                // We use rawDescription via casting as it's an internal property, but fallback to standard description
                const rawDesc = (embed as any)?.rawDescription || (embed as any)?.description;
                if (embed && embed.author?.name === "Channel Settings" && rawDesc) {
                    const info = parseBotInfoMessage(message);
                    if (info) {
                        log(`Successfully parsed channel info for ${channelId}`);
                        handleInfoUpdate(channelId, info);
                    } else {
                        log(`Failed to parse channel info`);
                    }
                }
            }
        }
    },
    stopCleanup: null as (() => void) | null,
    onStart() {
        log(`Plugin starting... enabled=${settings.store.enabled}, fetchOwnersOnStartup=${settings.store.fetchOwnersOnStartup}`);
        if (settings.store.enabled && settings.store.fetchOwnersOnStartup) {
            fetchAllOwners();
        }
        this.stopCleanup = registerSharedContextMenu(pluginInfo.id, {
            "user-context": (children, props) => {
                if (props.user) UserContextMenuPatch(children, props);
            },
            "guild-context": (children, props) => {
                if (props.guild) GuildContextMenuPatch(children, props);
            },
            "channel-context": (children, props) => {
                if (props.channel) ChannelContextMenuPatch(children, props);
            }
        }, log);
    },
    onStop() {
        this.stopCleanup?.();
    }
});

// region Internal
function getMessageOwner(message: Message, botId: string) {
    if (message.author.id !== botId) return null;
    const content = message.content;
    if (!content) return null;

    // ✨ <@userid> is now the owner of <#channelid> (Reason: Created)
    const match = content.match(/✨ <@!?(\d+)> is now the owner of <#(\d+)> \(Reason: (.*?)\)/);
    if (match) {
        return {
            userId: match[1],
            channelId: match[2],
            reason: match[3]
        };
    }
    return null;
}
// endregion Internal
// endregion Definition
