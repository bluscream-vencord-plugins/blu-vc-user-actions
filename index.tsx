import definePlugin from "@utils/types";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";
import {
    ChannelStore,
    UserStore,
    SelectedChannelStore,
    VoiceStateStore,
    Menu,
    showToast,
    ChannelActions,
    ChannelRouter,
    GuildStore,
} from "@webpack/common";

import { pluginName, settings } from "./settings";
import { state, actionQueue, processedUsers } from "./state";
import { log, getKickList, getOwnerForChannel, updateOwner } from "./utils";
import {
    processQueue,
    checkChannelOwner,
    fetchAllOwners,
    notifyOwnership,
    getMessageOwner,
    claimChannel,
    startRotation,
    stopRotation,
    handleOwnershipChange,
} from "./logic";
import {
    UserContextMenuPatch,
    GuildContextMenuPatch,
    ChannelContextMenuPatch,
} from "./menus";

export default definePlugin({
    name: pluginName,
    authors: [
        { name: "Bluscream", id: 1205616252488519723n },
        { name: "Antigravity", id: 0n }
    ],
    description: "Automatically takes actions against users joining your voice channel.",
    settings,
    contextMenus: {
        "user-context": UserContextMenuPatch,
        "guild-context": GuildContextMenuPatch,
        "channel-context": ChannelContextMenuPatch
    },
    toolboxActions: () => {
        const channelId = SelectedChannelStore.getVoiceChannelId();
        const channel = channelId ? ChannelStore.getChannel(channelId) : null;
        if (channel?.guild_id !== settings.store.guildId) return [];

        const { enabled } = settings.use(["enabled"]);
        const channelOwnerInfo = channelId ? getOwnerForChannel(channelId) : undefined;
        const owner = channelOwnerInfo?.userId ? UserStore.getUser(channelOwnerInfo.userId) : null;
        const ownerName = owner?.globalName || owner?.username || channelOwnerInfo?.userId;
        let status = "Not Owned";
        if (channelOwnerInfo?.userId) {
            status = `Owned by ${ownerName} (${channelOwnerInfo.reason})`;
        }

        return [
            <Menu.MenuCheckboxItem
                id="blu-vc-user-actions-status"
                label={`${status}`}
                checked={enabled}
                action={() => {
                    settings.store.enabled = !enabled;
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-check-ownership"
                label="Check Ownership"
                action={async () => {
                    const cid = SelectedChannelStore.getVoiceChannelId();
                    if (cid) {
                        const owner = await checkChannelOwner(cid, settings.store.botId);
                        if (owner.userId) {
                            notifyOwnership(cid);
                            handleOwnershipChange(cid, owner.userId);
                        }
                    }
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-create-channel"
                label="Create Channel"
                action={() => {
                    const createChannelId = settings.store.createChannelId;
                    if (createChannelId) {
                        ChannelActions.selectVoiceChannel(createChannelId);
                        ChannelRouter.transitionToChannel(createChannelId);
                    } else {
                        showToast("No Create Channel ID configured in settings.");
                    }
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-kick-banned"
                label="Kick Banned Users"
                action={() => {
                    const cid = SelectedChannelStore.getVoiceChannelId();
                    if (!cid) return;
                    const chan = ChannelStore.getChannel(cid);
                    if (!chan) return;
                    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(cid);
                    const kickList = getKickList();
                    let count = 0;
                    for (const uid in voiceStates) {
                        if (kickList.includes(uid)) {
                            actionQueue.push({
                                userId: uid,
                                channelId: cid,
                                guildId: chan.guild_id
                            });
                            count++;
                        }
                    }
                    if (count > 0) {
                        showToast(`Adding ${count} banned user(s) to kick queue...`);
                        processQueue();
                    } else {
                        showToast("No banned users found in current channel.");
                    }
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-settings"
                label="Edit Settings"
                action={() => openPluginModal(plugins[pluginName])}
            />
        ];
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
                        if (owner.userId) notifyOwnership(initialCid);
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
                            checkChannelOwner(newChannelId, settings.store.botId).then(owner => {
                                if (owner.userId) {
                                    notifyOwnership(newChannelId);
                                    handleOwnershipChange(newChannelId, owner.userId);
                                }
                            });
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
        },
        MESSAGE_CREATE({ message }) {
            if (!settings.store.enabled || !state.myLastVoiceChannelId) return;
            if (message.guildId !== settings.store.guildId) return;
            if (message.channelId !== state.myLastVoiceChannelId) return;

            const owner = getMessageOwner(message, settings.store.botId);
            if (owner) {
                if (updateOwner(message.channelId, owner)) {
                    notifyOwnership(message.channelId);
                    handleOwnershipChange(message.channelId, owner.userId);
                }
            }
        }
    },
    onStart() {
        if (settings.store.fetchOwnersOnStartup) {
            fetchAllOwners();
        }
    }
});
