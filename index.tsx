//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import { sendMessage } from "@utils/discord";
import {
    ChannelStore,
    UserStore,
    SelectedChannelStore,
    VoiceStateStore,
    GuildMemberStore,
    ChannelActions
} from "@webpack/common";
import { settings } from "./settings";
import { ActionType, state, actionQueue, channelOwners, loadState, saveState } from "./state";
import { log, getKickList, formatBanCommand, formatUnbanCommand, formatBanRotationMessage, jumpToFirstMessage, formatKickCommand, formatCustomMessage } from "./utils";
import {
    processQueue,
    queueAction,
    checkChannelOwner,
    fetchAllOwners,
    claimChannel,
    stopRotation,
    handleOwnerUpdate,
    handleInfoUpdate,
    handleBotResponse,
    getMemberInfoForChannel,
} from "./logic";
import { handleVoteBan } from "./utils/voteban";
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

                    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(s.oldChannelId);
                    const occupantCount = voiceStates ? Object.keys(voiceStates).length : 0;

                    if (occupantCount === 0) {
                        log(`Channel ${s.oldChannelId} is now empty. Clearing ownership.`);
                        channelOwners.delete(s.oldChannelId);
                        saveState();
                        continue;
                    }

                    // Check if the person who left was either the creator or the claimant
                    const isCreator = ownership.creator?.userId === s.userId;
                    const isClaimant = ownership.claimant?.userId === s.userId;

                    if (isCreator || isClaimant) {
                        log(`Owner (${isCreator ? "Creator" : "Claimant"}) ${s.userId} left channel ${s.oldChannelId}`);

                        const isMyChannel = state.myLastVoiceChannelId === s.oldChannelId;
                        if (settings.store.autoClaimDisbanded && isMyChannel) {
                        // If it was the claimant who left, but the creator is still there, do we claim?
                        // User requirement: "when creator joins back the claimant will still have owner perms until the creator claims the channel again"
                        // So if claimant leaves, we should probably try to claim if we want it.

                            // Check if there is still an owner present
                            const creatorId = ownership.creator?.userId;
                            const claimantId = ownership.claimant?.userId;

                            const isCreatorPresent = creatorId && voiceStates && voiceStates[creatorId];
                            const isClaimantPresent = claimantId && voiceStates && voiceStates[claimantId];

                            if (!isCreatorPresent && !isClaimantPresent) {
                                log(`Channel ${s.oldChannelId} is disbanded (All owners left), auto-claiming...`);
                                claimChannel(s.oldChannelId, s.userId);
                            }
                        }
                    }
                }
            }

            const myChannelId = state.myLastVoiceChannelId;
            if (!myChannelId) return;

            // Cache ownership once for the handler
            const ownership = channelOwners.get(myChannelId);
            const isOwner = ownership && (ownership.creator?.userId === me.id || ownership.claimant?.userId === me.id);

            // Kick Not In Role Logic
            if (settings.store.kickNotInRoleEnabled && settings.store.kickNotInRole && isOwner) {
                for (const s of targetGuildVoiceStates) {
                    if (s.userId === me.id || s.channelId !== myChannelId) continue;

                    const member = GuildMemberStore.getMember(s.guildId, s.userId);
                    if (member && !member.roles.includes(settings.store.kickNotInRole)) {
                        const hasBeenKicked = state.roleKickedUsers.has(s.userId);

                        if (hasBeenKicked) {
                            log(`User ${s.userId} rejoined without role ${settings.store.kickNotInRole}, upgrading to BAN`);
                            const banMsg = formatBanCommand(myChannelId, s.userId);
                            queueAction({
                                type: ActionType.BAN,
                                userId: s.userId,
                                channelId: myChannelId,
                                guildId: s.guildId,
                                external: banMsg
                            });
                        } else {
                            log(`User ${s.userId} missing role ${settings.store.kickNotInRole}, adding to kick queue`);
                            state.roleKickedUsers.add(s.userId);

                            const ephemeral = settings.store.kickNotInRoleMessage ? formatCustomMessage(settings.store.kickNotInRoleMessage, myChannelId, s.userId) : undefined;

                            let external = formatKickCommand(myChannelId, s.userId);
                            if (settings.store.kickNotInRoleMessageExternalEnabled && settings.store.kickNotInRoleMessageExternal) {
                                // If custom external message is enabled, append it or replace?
                                // Previously logic.ts did: external.push(content).
                                // So we send custom external message AND the kick command.
                                // Wait, the user said "a single ActionItem can have both a ephemeral and a external message at the same time but never more than one of each".
                                // So I can only have ONE external message.
                                // If I want to send a custom warning AND the kick command, I should prioritize the kick command?
                                // Or maybe the kick command IS the external message?
                                // "kickNotInRoleMessageExternal" -> likely a public shame message.
                                // If I can only send one literal message to Discord, I should send the one that performs the action (the kick command).
                                // Unless the kick command is just a message too? Yes.
                                // If I want to send TWO messages (shame + kick), I need TWO ActionItems.
                                // The user said "Sequential Processing now intelligently splits...".
                                // And then said "a single ActionItem... never more than one of each".
                                // This implies I should queue TWO items if I really need to send two external messages.
                                // But `queueAction` used to handle arrays.
                                // If I queue two items, they will be processed sequentially.
                                // So: Item 1: Custom Shame Message. Item 2: Kick Command.

                                const shameMsg = formatCustomMessage(settings.store.kickNotInRoleMessageExternal, myChannelId, s.userId);
                                queueAction({
                                    type: ActionType.INFO, // Use INFO so it doesn't trigger kick logic again? Or just standard?
                                    // If I use INFO, it's just a message.
                                    userId: s.userId,
                                    channelId: myChannelId,
                                    guildId: s.guildId,
                                    external: shameMsg
                                });
                            }

                            queueAction({
                                type: ActionType.KICK,
                                userId: s.userId,
                                channelId: myChannelId,
                                guildId: s.guildId,
                                ephemeral: ephemeral, // Ephemeral goes on the main Kick action? Sure, why not.
                                external: external
                            });
                        }
                    }
                }
            }

            // Ban rotation logic (Auto-ban kicklist users)
            if (settings.store.banRotateEnabled && isOwner) {
                const kickList = getKickList();
                for (const s of targetGuildVoiceStates) {
                    if (s.userId === me.id) continue;
                    if (s.oldChannelId !== myChannelId && s.channelId === myChannelId && kickList.includes(s.userId)) {
                        const hasBeenKicked = state.roleKickedUsers.has(s.userId);
                        if (hasBeenKicked) {
                            log(`User ${s.userId} rejoined while on kicklist, upgrading to BAN`);
                            const banMsg = formatBanCommand(myChannelId, s.userId);
                            queueAction({
                                type: ActionType.BAN,
                                userId: s.userId,
                                channelId: myChannelId,
                                guildId: s.guildId,
                                external: banMsg
                            });
                        } else {
                            log(`User ${s.userId} joined while on kicklist, queueing initial KICK`);
                            state.roleKickedUsers.add(s.userId);
                            const kickMsg = formatKickCommand(myChannelId, s.userId);
                            queueAction({
                                type: ActionType.KICK,
                                userId: s.userId,
                                channelId: myChannelId,
                                guildId: s.guildId,
                                external: kickMsg
                            });
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
            if (response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED)) {
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
            } else {
                handleBotResponse(response);
            }

            // Handle Voteban
            if (settings.store.voteBanEnabled) {
                handleVoteBan(message, channelId);
            }
        }
    },
    stopCleanup: null as (() => void) | null,
    async onStart() {
        await loadState();
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
