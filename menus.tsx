import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import {
    ChannelStore,
    SelectedChannelStore,
    UserStore,
    VoiceStateStore,
    Menu,
    showToast,
    Alerts,
    TextInput,
    React,
} from "@webpack/common";
import { type User } from "@vencord/discord-types";
import { settings } from "./settings";
import { pluginInfo } from "./info";
import {
    getKickList,
    setKickList,
    log,
    isVoiceChannel,
    getWhitelist,
    setWhitelist
} from "./utils";
import { checkChannelOwner, processQueue, bulkBanAndKick, bulkUnban, getMemberInfoForChannel, handleOwnerUpdate, bulkPermit, bulkUnpermit, queueAction } from "./logic";
import { ActionType, channelOwners } from "./state";

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

                const me = UserStore.getCurrentUser();
                if (!me || !myChannelId) return;

                let ownership = channelOwners.get(myChannelId);
                const isCached = ownership && (ownership.creator || ownership.claimant);

                if (!isCached) {
                    await checkChannelOwner(myChannelId, settings.store.botId);
                    ownership = channelOwners.get(myChannelId);
                }

                const isCreator = ownership?.creator?.userId === me.id;
                const isClaimant = ownership?.claimant?.userId === me.id;

                if (!isCreator && !isClaimant) return;

                const info = getMemberInfoForChannel(myChannelId);

                if (isBanned) {
                    // We are unbanning.
                    // If they are in the bot's ban list, we must send an unban command.
                    if (info?.banned.includes(user.id)) {
                        log(`Unban from VC: Queuing UNBAN for ${user.id} in ${myChannelId}`);
                        queueAction({
                            type: ActionType.UNBAN,
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: chatChannel?.guild_id
                        });
                    }
                } else {
                    // We are banning.
                    // If they are in the channel, we should kick them.
                    if (isTargetInMyChannel) {
                        const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                        log(`Ban from VC: Queuing KICK for ${user.id} in ${myChannelId}`);
                        queueAction({
                            type: ActionType.KICK,
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: voiceState?.guildId || chatChannel?.guild_id
                        });
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
                    let ownership = channelOwners.get(myChannelId);
                    const isCached = ownership && (ownership.creator || ownership.claimant);

                    if (!isCached) {
                        await checkChannelOwner(myChannelId, settings.store.botId);
                        ownership = channelOwners.get(myChannelId);
                    }

                    const isCreator = ownership?.creator?.userId === me.id;
                    const isClaimant = ownership?.claimant?.userId === me.id;

                    if (isCreator || isClaimant) {
                        const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                        queueAction({
                            type: ActionType.KICK,
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: voiceState?.guildId
                        });
                    } else {
                        const ownerText = `Creator: ${ownership?.creator?.userId || "None"}, Claimant: ${ownership?.claimant?.userId || "None"}`;
                        showToast(`Not owner of channel (${ownerText})`);
                    }
                }}
            />
        );
    }


    submenuItems.push(
        <Menu.MenuItem
            id="vc-blu-vc-user-whitelist"
            label={getWhitelist().includes(user.id) ? "Unwhitelist" : "Whitelist"}
            action={() => {
                const isWhitelisted = getWhitelist().includes(user.id);
                if (isWhitelisted) {
                    bulkUnpermit([user.id], myChannelId || "", chatChannel?.guild_id || "");
                } else {
                    bulkPermit([user.id], myChannelId || "", chatChannel?.guild_id || "");
                }
                showToast(isWhitelisted ? `Removed ${user.username} from whitelist.` : `Added ${user.username} to whitelist.`, { type: "success" } as any);
            }}
        />
    );

    const submenu = (
        <Menu.MenuItem
            id="socialize-guild-user-actions"
            label={pluginInfo.name}
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
        <Menu.MenuItem id="socialize-guild-guild-submenu" label={pluginInfo.name}>
            {getSharedMenuItems()}
            <Menu.MenuGroup>
                <Menu.MenuItem
                    id="socialize-guild-reset-state"
                    label="Reset Plugin State"
                    action={() => {
                        const { resetState } = require("./state");
                        resetState();
                        showToast("Plugin state has been reset.", { type: "success" } as any);
                    }}
                    color="danger"
                />
                <Menu.MenuItem
                    id="socialize-guild-reset-settings"
                    label="Reset Settings"
                    action={() => {
                        for (const key in settings.def) {
                            if (key === "enabled" || (settings.def as any)[key].readonly) continue;
                            try {
                                (settings.store as any)[key] = (settings.def as any)[key].default;
                            } catch (e) { }
                        }
                        showToast("Settings have been reset to defaults.", { type: "success" } as any);
                    }}
                    color="danger"
                />
                {/* Settings reset typically handled by Vencord settings UI, but we can offer a manual cleared if needed.
                     However, 'Reset Settings' usually means 'Restore Defaults'. Vencord settings API might have this?
                     Or we just iterate and reset?
                     For now, let's just do State. Settings can be reset in the settings menu.
                  */}
            </Menu.MenuGroup>
        </Menu.MenuItem>
    );
};

export const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (channel?.guild_id !== settings.store.guildId) return;

    // Only show for voice channels
    if (!isVoiceChannel(channel)) return;

    children.push(
        <Menu.MenuItem id="socialize-guild-channel-submenu" label={pluginInfo.name}>
            <Menu.MenuItem
                id="socialize-guild-claim-channel"
                label="Claim Channel"
                action={async () => {
                    const me = UserStore.getCurrentUser();
                    if (me) {
                        queueAction({
                            type: ActionType.CLAIM,
                            userId: me.id,
                            channelId: channel.id,
                            guildId: channel.guild_id
                        });
                    } else {
                        showToast("Could not identify current user.");
                    }
                }}
            />
            <Menu.MenuItem
                id="socialize-guild-rename-channel"
                label="Rename Channel"
                action={() => {
                    let newName = channel.name;
                    Alerts.show({
                        title: "Rename Channel",
                        confirmText: "Rename",
                        cancelText: "Cancel",
                        onConfirm: () => {
                            if (newName && newName !== channel.name) {
                                queueAction({
                                    type: ActionType.NAME,
                                    userId: "",
                                    channelId: channel.id,
                                    guildId: channel.guild_id,
                                    channelName: newName
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
            />
            <Menu.MenuItem
                id="socialize-guild-lock-channel"
                label="Lock Channel"
                action={() => {
                    queueAction({
                        type: ActionType.LOCK,
                        userId: "",
                        channelId: channel.id,
                        guildId: channel.guild_id
                    });
                }}
            />
            <Menu.MenuItem
                id="socialize-guild-unlock-channel"
                label="Unlock Channel"
                action={() => {
                    queueAction({
                        type: ActionType.UNLOCK,
                        userId: "",
                        channelId: channel.id,
                        guildId: channel.guild_id
                    });
                }}
            />
            <Menu.MenuItem
                id="socialize-guild-reset-channel"
                label="Reset Channel"
                action={() => {
                    queueAction({
                        type: ActionType.RESET,
                        userId: "",
                        channelId: channel.id,
                        guildId: channel.guild_id
                    });
                }}
            />
            <Menu.MenuItem
                id="socialize-guild-info-command"
                label="Send Info Command"
                action={() => {
                    queueAction({
                        type: ActionType.INFO,
                        userId: "",
                        channelId: channel.id,
                        guildId: channel.guild_id
                    });
                }}
            />
            <Menu.MenuItem
                id="socialize-guild-set-size-submenu"
                label="Set Channel Size"
            >
                {[0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 50, 99].map(size => (
                    <Menu.MenuItem
                        id={`socialize-guild-set-size-${size}`}
                        label={size === 0 ? "Unlimited" : `${size} Users`}
                        action={() => {
                            queueAction({
                                type: ActionType.LIMIT,
                                userId: "",
                                channelId: channel.id,
                                guildId: channel.guild_id,
                                channelLimit: size
                            });
                        }}
                    />
                ))}
            </Menu.MenuItem>
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
                        const count = bulkUnban(userIds, channel.id, channel.guild_id);
                        showToast(`Removed ${count} users from local ban list and queued unbans.`);
                    } else {
                        showToast("No other users found in voice channel.");
                    }
                }}
            />
        </Menu.MenuItem>
    );
};
