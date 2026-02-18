import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import {
    ChannelStore,
    SelectedChannelStore,
    VoiceStateStore,
    Menu,
} from "@webpack/common";
import { type User, type Channel, type Guild } from "@vencord/discord-types";
import { settings } from "./settings";
import { pluginInfo } from "./info";
import { isVoiceChannel } from "./utils";
import { ChannelType } from "@vencord/discord-types/enums";

import { Modules } from "./ModuleRegistry";

export function getChannelContextMenuItems(channel: Channel) {
    if (channel.type !== ChannelType.GUILD_VOICE) return null;
    if (channel.guild_id !== settings.store.guildId) return null;

    const items = Modules.flatMap(m => m.getChannelMenuItems?.(channel) || []);
    return items.length > 0 ? items : null;
}

export function getUserContextMenuItems(user: User, channelId?: string, guildId?: string) {
    const items = Modules.flatMap(m => m.getUserMenuItems?.(user, channelId, guildId) || []);
    return items.length > 0 ? items : null;
}

export function getGuildContextMenuItems(guild: Guild) {
    const items = Modules.flatMap(m => m.getGuildMenuItems?.(guild) || []);
    return items.length > 0 ? items : null;
}

export const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    const chatChannelId = SelectedChannelStore.getChannelId();
    const chatChannel = ChannelStore.getChannel(chatChannelId);
    if (chatChannel?.guild_id !== settings.store.guildId) return;
    if (!user) return;

    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    const submenuItems = getUserContextMenuItems(user, myChannelId || undefined, chatChannel?.guild_id);

    if (!submenuItems || submenuItems.length === 0) return;

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
    const items = getGuildContextMenuItems(guild);

    if (!items || items.length === 0) return;

    children.push(
        <Menu.MenuItem id="socialize-guild-guild-submenu" label={pluginInfo.name}>
            {items}
        </Menu.MenuItem>
    );
};

export const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (channel?.guild_id !== settings.store.guildId) return;
    if (!isVoiceChannel(channel)) return;

    const items = getChannelContextMenuItems(channel);
    if (!items || items.length === 0) return;

    children.push(
        <Menu.MenuItem id="socialize-guild-channel-submenu" label={pluginInfo.name}>
            {items}
        </Menu.MenuItem>
    );
};
