import { ActionType, channelOwners } from "./state";
import { jumpToFirstMessage } from "./utils";
import {
    checkChannelOwner,
    handleOwnerUpdate,
    requestChannelInfo,
    fetchAllOwners
} from "./logic/channelClaim";
import { queueAction } from "./logic/queue";
import { getKickList } from "./logic/blacklist/utils";
import {
    formatLockCommand,
    formatUnlockCommand,
    formatResetCommand,
    formatclaimCommand,
    formatLimitCommand
} from "./logic/channelClaim/formatting";
import { formatsetChannelNameCommand } from "./logic/channelName/formatting";
import { formatKickCommand } from "./logic/blacklist/formatting";

import { settings } from "./settings";
import { pluginInfo } from "./info";
import { ChannelStore, SelectedChannelStore, VoiceStateStore, showToast, ChannelActions, Menu, UserStore, React, Alerts, TextInput } from "@webpack/common";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";

export const getSharedMenuItems = () => {
    const { enabled } = settings.use(["enabled"]);
    const channelId = SelectedChannelStore.getVoiceChannelId();

    let creatorStatus = "Creator: None";
    let claimantStatus = "Claimant: None";

    if (channelId) {
        const ownership = channelOwners.get(channelId);

        if (ownership?.creator) {
            const creatorUser = UserStore.getUser(ownership.creator.userId);
            const creatorName = creatorUser?.globalName || creatorUser?.username || ownership.creator.userId;
            creatorStatus = `Creator: ${creatorName}`;
        }

        if (ownership?.claimant) {
            const claimantUser = UserStore.getUser(ownership.claimant.userId);
            const claimantName = claimantUser?.globalName || claimantUser?.username || ownership.claimant.userId;
            claimantStatus = `Claimant: ${claimantName}`;
        }
    }

    return [
        <Menu.MenuCheckboxItem
            id="blu-vc-user-actions-creator"
            label={creatorStatus}
            checked={enabled}
            action={() => {
                settings.store.enabled = !enabled;
            }}
        />,
        <Menu.MenuCheckboxItem
            id="blu-vc-user-actions-claimant"
            label={claimantStatus}
            checked={enabled}
            action={() => {
                settings.store.enabled = !enabled;
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-check-ownership"
            label="Check Ownership"
            disabled={!channelId}
            action={async () => {
                const cid = SelectedChannelStore.getVoiceChannelId();
                if (cid) {
                    const owner = await checkChannelOwner(cid, settings.store.botId);
                    if (owner.userId) {
                        handleOwnerUpdate(cid, owner);
                    }
                }
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-lock"
            label="Lock Channel"
            disabled={!channelId}
            action={async () => {
                const cid = SelectedChannelStore.getVoiceChannelId();
                if (cid) {
                    const cmd = formatLockCommand(cid);
                    queueAction({
                        type: ActionType.LOCK,
                        userId: "",
                        channelId: cid,
                        guildId: ChannelStore.getChannel(cid)?.guild_id,
                        external: cmd
                    });
                }
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-unlock"
            label="Unlock Channel"
            disabled={!channelId}
            action={async () => {
                const cid = SelectedChannelStore.getVoiceChannelId();
                if (cid) {
                    const cmd = formatUnlockCommand(cid);
                    queueAction({
                        type: ActionType.UNLOCK,
                        userId: "",
                        channelId: cid,
                        guildId: ChannelStore.getChannel(cid)?.guild_id,
                        external: cmd
                    });
                }
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-reset"
            label="Reset Channel"
            disabled={!channelId}
            action={async () => {
                const cid = SelectedChannelStore.getVoiceChannelId();
                if (cid) {
                    const cmd = formatResetCommand(cid);
                    queueAction({
                        type: ActionType.RESET,
                        userId: "",
                        channelId: cid,
                        guildId: ChannelStore.getChannel(cid)?.guild_id,
                        external: cmd
                    });
                }
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-claim"
            label="Claim Channel"
            disabled={!channelId}
            action={async () => {
                const cid = SelectedChannelStore.getVoiceChannelId();
                const me = UserStore.getCurrentUser();
                if (cid && me) {
                    const cmd = formatclaimCommand(cid);
                    queueAction({
                        type: ActionType.CLAIM,
                        userId: me.id,
                        channelId: cid,
                        guildId: ChannelStore.getChannel(cid)?.guild_id,
                        external: cmd
                    });
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
                    const channel = ChannelStore.getChannel(createChannelId);
                    jumpToFirstMessage(createChannelId, channel?.guild_id);
                } else {
                    showToast("No Create Channel ID configured in settings.");
                }
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-fetch-all-owners"
            label="Fetch All Owners"
            action={() => fetchAllOwners()}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-kick-banned"
            label="Kick Banned Users"
            disabled={!channelId}
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
                        const cmd = formatKickCommand(cid, uid);
                        queueAction({
                            type: ActionType.KICK,
                            userId: uid,
                            channelId: cid,
                            guildId: chan.guild_id,
                            external: cmd
                        });
                        count++;
                    }
                }
                if (count > 0) {
                    showToast(`Adding ${count} banned user(s) to kick queue...`);
                } else {
                    showToast("No banned users found in current channel.");
                }
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-rename"
            label="Rename Channel"
            disabled={!channelId}
            action={() => {
                const cid = SelectedChannelStore.getVoiceChannelId();
                if (!cid) return;
                const chan = ChannelStore.getChannel(cid);
                if (!chan) return;
                let newName = chan.name;
                Alerts.show({
                    title: "Rename Channel",
                    confirmText: "Rename",
                    cancelText: "Cancel",
                    onConfirm: () => {
                        if (newName && newName !== chan.name) {
                            const cmd = formatsetChannelNameCommand(cid, newName);
                            queueAction({
                                type: ActionType.NAME,
                                userId: "",
                                channelId: cid,
                                guildId: chan.guild_id,
                                external: cmd
                            });
                        }
                    },
                    body: (
                        <div style={{ marginTop: "1rem" }}>
                            <TextInput
                                value={newName}
                                onChange={(v: string) => newName = v}
                                placeholder="Enter new channel name..."
                                autoFocus
                            />
                        </div>
                    )
                });
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-set-size-submenu"
            label="Set Channel Size"
            disabled={!channelId}
        >
            {[0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 50, 99].map(size => (
                <Menu.MenuItem
                    id={`blu-vc-user-actions-set-size-${size}`}
                    label={size === 0 ? "Unlimited" : `${size} Users`}
                    action={() => {
                        const cid = SelectedChannelStore.getVoiceChannelId();
                        if (!cid) return;
                        const cmd = formatLimitCommand(cid, size);
                        queueAction({
                            type: ActionType.LIMIT,
                            userId: "",
                            channelId: cid,
                            guildId: ChannelStore.getChannel(cid)?.guild_id,
                            external: cmd
                        });
                    }}
                />
            ))}
        </Menu.MenuItem>,
        <Menu.MenuItem
            id="blu-vc-user-actions-get-info"
            label="Get Channel Info"
            disabled={!channelId}
            action={() => {
                const cid = SelectedChannelStore.getVoiceChannelId();
                if (cid) requestChannelInfo(cid);
            }}
        />,
        <Menu.MenuItem
            id="blu-vc-user-actions-settings"
            label="Edit Settings"
            action={() => openPluginModal(plugins[pluginInfo.name])}
        />
    ];
};
