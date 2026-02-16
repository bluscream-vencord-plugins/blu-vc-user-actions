//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";

import { sendMessage } from "@utils/discord";
import type { Message } from "@vencord/discord-types";
import {
    ChannelStore,
    UserStore,
    SelectedChannelStore,
    VoiceStateStore,
    GuildMemberStore,
    MessageActions,
    ChannelActions
} from "@webpack/common";
import { settings } from "./settings";
import { ActionType, state, actionQueue, processedUsers, memberInfos, channelOwners } from "./state";
import { log, getKickList, getOwnerForChannel, formatBanCommand, formatUnbanCommand, formatBanRotationMessage, navigateTo, jumpToFirstMessage } from "./utils";
import {
    processQueue,
    checkChannelOwner,
    fetchAllOwners,
    claimChannel,
    stopRotation,
    handleOwnerUpdate,
    handleInfoUpdate,
    handleVoteBan,
    requestChannelInfo,
    getMemberInfoForChannel,
} from "./logic";
import { parseBotInfoMessage, BotResponse, BotResponseType } from "./utils";
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
import { pluginInfo } from "./info";
export { pluginInfo };
// endregion PluginInfo

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
// endregion Variables

import { MessageCreatePayload } from "./types";
import SectionedGridList from "@plugins/decor/ui/components/SectionedGridList";

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
                            const channel = ChannelStore.getChannel(newChannelId);
                            if (channel?.guild_id === settings.store.guildId && channel.parent_id === settings.store.categoryId) {
                                if (!getMemberInfoForChannel(newChannelId)) {
                                    log(`Joined unrecognized channel ${newChannelId}, requesting info.`);
                                    requestChannelInfo(newChannelId);
                                }
                                log(`Opening text chat of voice channel ${newChannelId}`);
                                ChannelActions.selectChannel(newChannelId);
                                setTimeout(() => {
                                    log(`Scrolling to start of ${newChannelId}`);
                                    jumpToFirstMessage(newChannelId, channel.guild_id);
                                    // if (MessageActions?.fetchMessages) {
                                    //     MessageActions.fetchMessages({
                                    //         channelId: newChannelId,
                                    //         limit: 50,
                                    //     });
                                    // }
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
            }

            // Handle owner departures for auto-claim
            for (const s of targetGuildVoiceStates) {
                // If someone left a channel (or moved)
                if (s.oldChannelId && s.oldChannelId !== s.channelId) {
                    const oldChannel = ChannelStore.getChannel(s.oldChannelId);
                    if (oldChannel?.parent_id !== settings.store.categoryId) continue;

                    const ownership = channelOwners.get(s.oldChannelId);
                    if (!ownership) continue;

                    // Check if the person who left was either the creator or the claimant
                    const isCreator = ownership.first?.userId === s.userId;
                    const isClaimant = ownership.last?.userId === s.userId;

                    if (isCreator || isClaimant) {
                        log(`Owner (${isCreator ? "Creator" : "Claimant"}) ${s.userId} left channel ${s.oldChannelId}`);

                        const isMyChannel = state.myLastVoiceChannelId === s.oldChannelId;
                        if (settings.store.autoClaimDisbanded && isMyChannel) {
                        // If it was the claimant who left, but the creator is still there, do we claim?
                        // User requirement: "when creator joins back the claimant will still have owner perms until the creator claims the channel again"
                        // So if claimant leaves, we should probably try to claim if we want it.

                            // Check if there is still an owner present
                            const voiceStates = VoiceStateStore.getVoiceStatesForChannel(s.oldChannelId);
                            const currentOwner = getOwnerForChannel(s.oldChannelId);

                            if (currentOwner && !voiceStates[currentOwner.userId]) {
                                log(`Channel ${s.oldChannelId} is disbanded (Owner ${currentOwner.userId} left), auto-claiming...`);
                                claimChannel(s.oldChannelId, currentOwner.userId);
                            }
                        }
                    }
                }
            }

            const myChannelId = state.myLastVoiceChannelId;
            if (!myChannelId) return;

            // Cache ownership once for the handler
            let ownerInfo = getOwnerForChannel(myChannelId);
            if (!ownerInfo || ownerInfo.userId === "") {
                ownerInfo = await checkChannelOwner(myChannelId, settings.store.botId);
            }
            const isOwner = ownerInfo?.userId === me.id;

            // Auto-kick logic
            if (settings.store.autoKickEnabled && isOwner) {
                const kickList = getKickList();
                for (const s of targetGuildVoiceStates) {
                    if (s.userId === me.id) continue;

                    if (s.oldChannelId !== myChannelId && s.channelId === myChannelId) {
                        if (kickList.includes(s.userId)) {
                            const now = Date.now();
                            const lastAction = processedUsers.get(s.userId) || 0;
                            if (now - lastAction < settings.store.queueTime) continue;

                            log(`Adding ${s.userId} to auto-kick queue`);
                            actionQueue.push({
                                type: ActionType.KICK,
                                userId: s.userId,
                                channelId: myChannelId,
                                guildId: s.guildId
                            });
                            processQueue();
                        }
                    }
                }
            }

            // Kick Not In Role Logic
            if (settings.store.kickNotInRole && isOwner) {
                for (const s of targetGuildVoiceStates) {
                    if (s.userId === me.id || s.channelId !== myChannelId) continue;

                    const member = GuildMemberStore.getMember(s.guildId, s.userId);
                    if (member && !member.roles.includes(settings.store.kickNotInRole)) {
                        log(`User ${s.userId} missing role ${settings.store.kickNotInRole}, adding to kick queue`);
                        actionQueue.push({
                            type: ActionType.KICK,
                            userId: s.userId,
                            channelId: myChannelId,
                            guildId: s.guildId,
                            ephemeralMessage: settings.store.kickNotInRoleMessage
                        });
                        processQueue();
                    }
                }
            }

            // Ban rotation logic
            if (settings.store.banRotateEnabled && isOwner) {
                const kickList = getKickList();
                const info = getMemberInfoForChannel(myChannelId);

                for (const s of targetGuildVoiceStates) {
                    if (s.userId === me.id) continue;

                    if (s.oldChannelId !== myChannelId && s.channelId === myChannelId) {
                        if (kickList.includes(s.userId)) {
                            // Check if user is already banned
                            if (!info?.banned.includes(s.userId)) {
                                // Get first banned user to unban if limit reached
                                const userToUnban = (info && info.banned.length >= settings.store.banLimit) ? info.banned[0] : null;

                                if (userToUnban) {
                                    const unbanCmd = formatUnbanCommand(myChannelId, userToUnban);
                                    log(`Ban rotation: Unbanning ${userToUnban}`);
                                    sendMessage(myChannelId, { content: unbanCmd });

                                    if (info) {
                                        info.banned = info.banned.filter(id => id !== userToUnban);
                                    }

                                    if (settings.store.banRotationMessage) {
                                        const msg = formatBanRotationMessage(myChannelId, userToUnban, s.userId);
                                        const { sendBotMessage } = require("@api/Commands");
                                        sendBotMessage(myChannelId, { content: msg });
                                    }
                                }

                                const banCmd = formatBanCommand(myChannelId, s.userId);
                                log(`Ban rotation: Banning ${s.userId}`);
                                sendMessage(myChannelId, { content: banCmd });

                                if (info && !info.banned.includes(s.userId)) {
                                    info.banned.push(s.userId);
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

            // Handle Bot Responses (Ownership & Info)
            const response = new BotResponse(message, settings.store.botId);
            if (response.initiatorId) {
                handleOwnerUpdate(channelId, {
                    userId: response.initiatorId,
                    reason: response.type,
                    timestamp: response.timestamp
                });
            }

            if (response.type === BotResponseType.INFO) {
                const result = parseBotInfoMessage(response);
                if (result) {
                    log(`Successfully parsed channel info for ${result.channelId}`);
                    handleInfoUpdate(result.channelId, result.info);
                }
            }

            // Handle Voteban
            if (settings.store.voteBanEnabled) {
                handleVoteBan(message, channelId);
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
// endregion Internal
// endregion Definition
