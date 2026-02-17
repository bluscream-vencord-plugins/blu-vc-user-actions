import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import {
    ChannelStore,
    SelectedChannelStore,
    VoiceStateStore,
    Menu,
} from "@webpack/common";
import { type User } from "@vencord/discord-types";
import { settings } from "./settings";
import { pluginInfo } from "./info";
import { isVoiceChannel } from "./utils";
import { getSharedMenuItems } from "./sharedMenu";

// Modular Menu Imports
import {
    getClaimChannelItem,
    getLockChannelItem,
    getUnlockChannelItem,
    getResetChannelItem,
    getInfoCommandItem,
    getSetSizeSubmenu
} from "./logic/channelClaim/menus/channel";
import { getRenameChannelItem } from "./logic/channelName/menus/channel";
import {
    getBanAllItem,
    getUnbanAllItem,
    getKickBannedUsersItem
} from "./logic/blacklist/menus/channel";
import {
    getBlacklistUserItem,
    getKickUserItem
} from "./logic/blacklist/menus/user";
import { getWhitelistUserItem } from "./logic/whitelist/menus/user";
import {
    getResetStateItem,
    getResetSettingsItem
} from "./logic/core/menus/guild";

export const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    const chatChannelId = SelectedChannelStore.getChannelId();
    const chatChannel = ChannelStore.getChannel(chatChannelId);
    if (chatChannel?.guild_id !== settings.store.guildId) return;
    if (!user) return;

    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    const isTargetInMyChannel = myChannelId && VoiceStateStore.getVoiceStatesForChannel(myChannelId)?.[user.id];

    const submenuItems = [
        getBlacklistUserItem(user, myChannelId || undefined, chatChannel?.guild_id)
    ];

    if (isTargetInMyChannel) {
        const kickItem = getKickUserItem(user, myChannelId || undefined);
        if (kickItem) submenuItems.push(kickItem);
    }

    submenuItems.push(
        getWhitelistUserItem(user, myChannelId || undefined, chatChannel?.guild_id)
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

export const GuildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }) => {
    if (guild?.id !== settings.store.guildId) return;
    const sharedItems = getSharedMenuItems(); // Assuming sharedMenu returns array

    // We can't easily merge arrays inside JSX children unless we map or use fragment, but MenuItem accepts children as array.
    // getSharedMenuItems returns JSX.Element[].

    children.push(
        <Menu.MenuItem id="socialize-guild-guild-submenu" label={pluginInfo.name}>
            {sharedItems}
            <Menu.MenuGroup>
                {getResetStateItem()}
                {getResetSettingsItem()}
            </Menu.MenuGroup>
        </Menu.MenuItem>
    );
};

export const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (channel?.guild_id !== settings.store.guildId) return;
    if (!isVoiceChannel(channel)) return;

    children.push(
        <Menu.MenuItem id="socialize-guild-channel-submenu" label={pluginInfo.name}>
            {getClaimChannelItem(channel)}
            {getRenameChannelItem(channel)}
            {getLockChannelItem(channel)}
            {getUnlockChannelItem(channel)}
            {getResetChannelItem(channel)}
            {getInfoCommandItem(channel)}
            {getSetSizeSubmenu(channel)}
            {getBanAllItem(channel)}
            {getUnbanAllItem(channel)}
            {getKickBannedUsersItem(channel)}
        </Menu.MenuItem>
    );
};
