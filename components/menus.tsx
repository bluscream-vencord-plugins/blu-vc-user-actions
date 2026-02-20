import { UserStore as Users, ChannelStore as Channels, React, Menu } from "@webpack/common";
import type { GlobalContextMenuPatchCallback } from "@api/ContextMenu";

// Vencord types
import { User, Channel, Guild } from "@vencord/discord-types";
import { moduleRegistry } from "../logic/moduleRegistry";
import { actionQueue } from "../utils/actionQueue";
import { VoteBanningModule } from "../logic/voteBanning";
import { WhitelistingModule } from "../logic/whitelisting";
import { OwnershipModule } from "../logic/ownership";
import { formatCommand } from "../utils/formatting";
import { logger } from "../utils/logger";

export function addToSubmenu(children: any[], menuId: string, menuLabel: string, newItems: any[], log?: (...args: any[]) => void) {
    let targetMenu: any = null;
    let targetList: any[] = [];
    let targetIndex: number = -1;

    const findMenu = (list: any[]) => {
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item) continue;

            const label = item.props?.label?.toString().toLowerCase().trim();
            const targetLabel = menuLabel.toLowerCase().trim();

            if (item.props?.id === menuId || label === targetLabel) {
                if (!targetMenu) {
                    targetMenu = item;
                    targetList = list;
                    targetIndex = i;
                    if (log) log(`Found target menu: ${item.props?.label} (${item.props?.id}) at index ${i}`);
                } else {
                    if (log) log(`Removing duplicate menu: ${item.props?.label} (${item.props?.id}) at index ${i}`);
                    const dupeChildren = React.Children.toArray(item.props.children);
                    const currentChildren = React.Children.toArray(targetMenu.props.children);
                    targetList[targetIndex] = React.cloneElement(targetMenu, targetMenu.props, ...currentChildren, ...dupeChildren);
                    list.splice(i, 1);
                    i--;
                }
                continue;
            }

            if (item.props?.children) {
                findMenu(React.Children.toArray(item.props.children));
            }
        }
    };

    findMenu(children);

    if (targetMenu) {
        if (log) log(`Merging into existing menu: ${targetMenu.props?.label}`);
        const oldChildren = React.Children.toArray(targetMenu.props.children);
        targetList[targetIndex] = React.cloneElement(targetMenu, { id: menuId, label: menuLabel }, ...oldChildren, ...newItems);
        return;
    }

    if (log) log(`Creating new menu ${menuId}`);
    const newMenu = (
        <Menu.MenuItem id={menuId} label={menuLabel} key={menuId}>
            {newItems}
        </Menu.MenuItem>
    );

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

export function registerSharedContextMenu(pluginName: string, handlers: Record<string, (children: any[], props: any) => void>, log?: (...args: any[]) => void) {
    const { addGlobalContextMenuPatch, removeGlobalContextMenuPatch } = require("@api/ContextMenu");

    const patch: GlobalContextMenuPatchCallback = (navId, children, ...args) => {
        const handler = handlers[navId];
        if (handler) {
            try {
                handler(children, args[0]);
            } catch (e) {
                if (log) log(`Error in context menu handler for ${navId}:`, e);
            }
        }
    };
    addGlobalContextMenuPatch(patch);
    return () => removeGlobalContextMenuPatch(patch);
}

function buildUserContextMenuItems(user: User, channel?: Channel) {
    const settings = moduleRegistry["settings"];
    if (!settings) return null;

    return [
        <Menu.MenuItem
            id="socialize-ban-user"
            label="Ban from Channel"
            action={() => {
                if (channel) VoteBanningModule.enforceBanPolicy(user.id, channel.id, false);
            }}
        />,
        <Menu.MenuItem
            id="socialize-kick-user"
            label="Kick from Channel"
            action={() => {
                const cmd = formatCommand(settings.kickCommand, channel?.id || "", { userId: user.id });
                if (channel) actionQueue.enqueue(cmd, channel.id, true);
            }}
        />,
        <Menu.MenuItem
            id="socialize-whitelist-user"
            label={WhitelistingModule.isWhitelisted(user.id) ? "Unwhitelist User" : "Whitelist User"}
            action={() => {
                const isWhite = WhitelistingModule.isWhitelisted(user.id);
                const list = WhitelistingModule.getWhitelist();
                if (isWhite) {
                    WhitelistingModule.setWhitelist(list.filter(id => id !== user.id));
                } else {
                    list.push(user.id);
                    WhitelistingModule.setWhitelist(list);
                }
            }}
        />
    ];
}

function buildChannelContextMenuItems(channel: Channel) {
    const settings = moduleRegistry["settings"];
    if (!settings) return null;

    return [
        <Menu.MenuItem
            id="socialize-claim-channel"
            label="Claim Channel"
            action={() => {
                actionQueue.enqueue(settings.claimCommand, channel.id, true);
            }}
        />,
        <Menu.MenuItem
            id="socialize-lock-channel"
            label="Lock Channel"
            action={() => {
                actionQueue.enqueue(settings.lockCommand, channel.id, true);
            }}
        />,
        <Menu.MenuItem
            id="socialize-unlock-channel"
            label="Unlock Channel"
            action={() => {
                actionQueue.enqueue(settings.unlockCommand, channel.id, true);
            }}
        />,
        <Menu.MenuItem
            id="socialize-reset-channel"
            label="Reset Channel"
            action={() => {
                actionQueue.enqueue(settings.resetCommand, channel.id, false);
            }}
        />
    ];
}

function buildGuildContextMenuItems(guild: Guild) {
    return [
        <Menu.MenuItem
            id="socialize-guild-fetch-owners"
            label="Fetch All Owners"
            action={() => {
                OwnershipModule.fetchAllOwners?.();
            }}
        />,
        <Menu.MenuItem
            id="socialize-guild-status"
            label="Socialize Status"
            action={() => {
                logger.debug(`Viewing status for guild: ${guild.name}`);
            }}
        />
    ];
}

export function setupContextMenus() {
    return registerSharedContextMenu("socializeGuild", {
        "user-context": (children, props) => {
            const user = props?.user;
            const channel = props?.channel || Channels.getChannel(props?.channelId);
            if (!user) return;
            const items = buildUserContextMenuItems(user, channel);
            if (items) addToSubmenu(children, "socialize-user-menu", "SocializeGuild", items, undefined);
        },
        "channel-context": (children, props) => {
            const channel = props?.channel;
            if (!channel) return;
            const items = buildChannelContextMenuItems(channel);
            if (items) addToSubmenu(children, "socialize-channel-menu", "SocializeGuild", items, undefined);
        },
        "guild-context": (children, props) => {
            const guild = props?.guild;
            if (!guild) return;
            const items = buildGuildContextMenuItems(guild);
            if (items) addToSubmenu(children, "socialize-guild-menu", "SocializeGuild", items, undefined);
        }
    }, (msg) => logger.debug(msg));
}
