//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import {
    ChannelStore,
    UserStore,
    SelectedChannelStore,
    VoiceStateStore,
    ChannelActions
} from "@webpack/common";

import { settings } from "./settings";
import { state, actionQueue, channelOwners, loadState, saveState } from "./state"; // Keeps state management here?
import { log, jumpToFirstMessage, parseBotInfoMessage } from "./utils"; // Utils exports everything
import { BotResponse, BotResponseType } from "./utils/BotResponse";

// New Logic Modules
import { queueAction, processQueue } from "./logic/queue";
import { checkBlacklistEnforcement } from "./logic/blacklist";
import { checkKickNotInRole } from "./logic/kickNotInRole";
import { stopRotation } from "./logic/channelName";
import { handleVoteBan } from "./logic/voteban";
import {
    checkChannelOwner,
    fetchAllOwners,
    claimChannel,
    handleOwnerUpdate,
    handleInfoUpdate,
    handleBotResponse,
    handleOwnershipChange
} from "./logic/channelClaim";
import { registerSharedContextMenu } from "./utils/menus"; // Assuming menus stays in utils
import {
    UserContextMenuPatch,
    GuildContextMenuPatch,
    ChannelContextMenuPatch,
} from "./menus"; // Menus stays in root
import { getToolboxActions } from "./toolbox";
import { commands } from "./commands";
import { Logger } from "@utils/Logger";
import { MessageCreatePayload } from "./types";

// endregion Imports

// region PluginInfo
import { pluginInfo } from "./info";
export { pluginInfo };
// endregion PluginInfo

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
// endregion Variables


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

            // Logic loops
            if (isOwner) {
                // Kick Not In Role Logic
                if (settings.store.kickNotInRoleEnabled && settings.store.kickNotInRole) {
                    for (const s of targetGuildVoiceStates) {
                        if (s.userId === me.id || s.channelId !== myChannelId) continue;
                        checkKickNotInRole(s.userId, myChannelId, s.guildId);
                    }
                }

                // Ban rotation enforcement (kicklist)
                if (settings.store.banRotateEnabled) {
                    for (const s of targetGuildVoiceStates) {
                        if (s.userId === me.id) continue;
                        // checkBlacklistEnforcement handles the check if user is in channel/oldChannel logic
                        checkBlacklistEnforcement(s.userId, myChannelId, s.guildId, s.oldChannelId);
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
