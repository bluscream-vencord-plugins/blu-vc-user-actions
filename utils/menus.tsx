import { UserStore as Users, ChannelStore as Channels, React, Menu, SelectedChannelStore } from "@webpack/common";

import { moduleRegistry } from "../core/moduleRegistry";
import { logger } from "./logger";
import { pluginInfo } from "../info";

/**
 * Injects a new menu item into a specific submenu or group within a native Discord context menu.
 * @param children The current array of children in the native menu
 * @param menuId Unique ID for the new menu item
 * @param menuLabel Human-readable label for the menu item
 * @param newItems Array of menu elements to be added
 */
export function addToSubmenu(children: any[], menuId: string, menuLabel: string, newItems: any[]) {
    const newMenu = (
        <Menu.MenuItem id={menuId} label={menuLabel} key={menuId}>
            {newItems}
        </Menu.MenuItem>
    );

    // Filter out null/undefined items
    const validItems = newItems.filter(Boolean);
    if (!validItems.length) return;

    const lastGroup = [...children].reverse().find(c => c?.type?.displayName === "MenuGroup" || (c?.props && c.props.children));
    if (lastGroup) {
        const index = children.indexOf(lastGroup);
        const groupChildren = React.Children.toArray(lastGroup.props.children);
        groupChildren.splice(-1, 0, newMenu);
        children[index] = React.cloneElement(lastGroup, lastGroup.props, ...groupChildren);
    } else {
        children.splice(-1, 0, newMenu);
    }
}

/**
 * Object containing hooks for various Discord context menus to inject custom plugin items.
 */
export const contextMenuHandlers = {
    "user-context": (children: any[], props: any) => {
        if (!props) return;
        const user = props.user;
        if (!user) return;

        const channelId = props.channelId || props.channel?.id || SelectedChannelStore.getChannelId();
        const channel = props.channel || (channelId ? Channels.getChannel(channelId) : null);

        const items = moduleRegistry.collectUserItems(user, channel);
        if (items.length > 0) {
            addToSubmenu(children, "socialize-user-menu", pluginInfo.name, items);
        }
    },
    "channel-context": (children: any[], props: any) => {
        const channel = props?.channel;
        if (!channel) return;

        const items = moduleRegistry.collectChannelItems(channel);
        if (items.length > 0) {
            addToSubmenu(children, "socialize-channel-menu", pluginInfo.name, items);
        }
    },
    "guild-context": (children: any[], props: any) => {
        const guild = props?.guild;
        if (!guild) return;

        const items = moduleRegistry.collectGuildItems(guild);
        if (items.length > 0) {
            addToSubmenu(children, "socialize-guild-menu", pluginInfo.name, items);
        }
    }
};
