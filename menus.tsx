import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { registerSharedContextMenu } from "./utils/menus";
import {
    ChannelStore,
    SelectedChannelStore,
    UserStore,
    VoiceStateStore,
    Menu,
    showToast,
} from "@webpack/common";
import { type User } from "@vencord/discord-types";
import { pluginName, settings } from "./settings";
import {
    getKickList,
    setKickList,
    getOwnerForChannel,
    log,
    formatBanCommand,
    formatUnbanCommand,
    isVoiceChannel
} from "./utils";
import { checkChannelOwner, processQueue, bulkBanAndKick, bulkUnban, claimAllDisbandedChannels } from "./logic";
import { actionQueue, ActionType } from "./state";
import { sendMessage } from "@utils/discord";

export const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    const chatChannelId = SelectedChannelStore.getChannelId();
    const chatChannel = ChannelStore.getChannel(chatChannelId);
    if (chatChannel?.guild_id !== settings.store.guildId) return;
    if (!user) return;

    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    const isTargetInMyChannel = myChannelId && VoiceStateStore.getVoiceStatesForChannel(myChannelId)?.[user.id];

    const kickList = getKickList();
    const isBanned = kickList.includes(user.id);

    const submenuItems = [
        <Menu.MenuItem
            id="vc-blu-vc-user-action"
            label={isBanned ? "Unban from VC" : "Ban from VC"}
            action={async () => {
                const newList = isBanned
                    ? kickList.filter(id => id !== user.id)
                    : [...kickList, user.id];
                setKickList(newList);

                if (!isBanned && isTargetInMyChannel) {
                    const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                    const me = UserStore.getCurrentUser();
                    let ownerInfo = getOwnerForChannel(myChannelId);
                    if (!ownerInfo || ownerInfo.userId === "") {
                        ownerInfo = await checkChannelOwner(myChannelId, settings.store.botId);
                    }
                    if (ownerInfo.userId === me?.id) {
                        actionQueue.push({
                            type: ActionType.KICK,
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: voiceState?.guildId
                        });
                        processQueue();
                    } else {
                        showToast(`Not owner of channel (Owner: ${ownerInfo.userId || "None"})`);
                    }
                }
            }}
            color={isBanned ? "success" : "danger"}
        />
    ];

    if (isTargetInMyChannel) {
        submenuItems.push(
            <Menu.MenuItem
                id="socialize-guild-kick-vc"
                label="Kick from VC"
                color="brand"
                action={async () => {
                    const me = UserStore.getCurrentUser();
                    let ownerInfo = getOwnerForChannel(myChannelId);
                    if (!ownerInfo || ownerInfo.userId === "") {
                        ownerInfo = await checkChannelOwner(myChannelId, settings.store.botId);
                    }
                    if (ownerInfo.userId === me?.id) {
                        const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                        actionQueue.push({
                            type: ActionType.KICK,
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: voiceState?.guildId
                        });
                        processQueue();
                    } else {
                        showToast(`Not owner of channel (Owner: ${ownerInfo.userId || "None"})`);
                    }
                }}
            />
        );
    }

    const submenu = (
        <Menu.MenuItem
            id="socialize-guild-user-actions"
            label={pluginName}
        >
            {submenuItems}
        </Menu.MenuItem>
    );

    children.splice(-1, 0, submenu);
};

import { getSharedMenuItems } from "./sharedMenu";

export const GuildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }) => {
    if (guild?.id !== settings.store.guildId) return;
    children.push(
        <Menu.MenuItem id="socialize-guild-guild-submenu" label={pluginName}>
            {getSharedMenuItems()}
        </Menu.MenuItem>
    );
};

export const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (channel?.guild_id !== settings.store.guildId) return;

    // Only show for voice channels
    if (!isVoiceChannel(channel)) return;

    children.push(
        <Menu.MenuItem id="socialize-guild-channel-submenu" label={pluginName}>
            <Menu.MenuItem
                id="socialize-guild-claim-channel"
                label="Claim Channel"
                action={async () => {
                    const me = UserStore.getCurrentUser();
                    if (me) {
                        actionQueue.push({
                            type: ActionType.CLAIM,
                            userId: me.id,
                            channelId: channel.id,
                            guildId: channel.guild_id
                        });
                        processQueue();
                    } else {
                        showToast("Could not identify current user.");
                    }
                }}
            />
            <Menu.MenuItem
                id="socialize-guild-ban-all-vc"
                label="Ban All Users in VC"
                color="danger"
                action={async () => {
                    const me = UserStore.getCurrentUser();
                    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channel.id);
                    const userIds: string[] = [];

                    for (const userId in voiceStates) {
                        if (userId === me?.id) continue;
                        userIds.push(userId);
                    }

                    if (userIds.length > 0) {
                        showToast(`Adding ${userIds.length} users to local ban list and queuing kicks...`);
                        const count = bulkBanAndKick(userIds, channel.id, channel.guild_id);
                        showToast(`Queued kicks for ${count} users.`);
                    } else {
                        showToast("No other users found in voice channel.");
                    }
                }}
            />
            <Menu.MenuItem
                id="socialize-guild-unban-all-vc"
                label="Unban All Users in VC"
                color="success"
                action={async () => {
                    const me = UserStore.getCurrentUser();
                    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channel.id);
                    const userIds: string[] = [];

                    for (const userId in voiceStates) {
                        if (userId === me?.id) continue;
                        userIds.push(userId);
                    }

                    if (userIds.length > 0) {
                        const count = bulkUnban(userIds);
                        showToast(`Removed ${count} users from local ban list.`);
                    } else {
                        showToast("No other users found in voice channel.");
                    }
                }}
            />
        </Menu.MenuItem>
    );
};
