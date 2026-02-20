import { UserStore as Users, ChannelStore as Channels, React, Menu, SelectedChannelStore } from "@webpack/common";

// Vencord types
import { User, Channel, Guild } from "@vencord/discord-types";
import { moduleRegistry } from "../logic/moduleRegistry";
import { actionQueue } from "../utils/actionQueue";
import { VoteBanningModule } from "../logic/voteBanning";
import { WhitelistingModule } from "../logic/whitelisting";
import { OwnershipModule } from "../logic/ownership";
import { formatCommand } from "../utils/formatting";
import { logger } from "../utils/logger";

export function addToSubmenu(children: any[], menuId: string, menuLabel: string, newItems: any[]) {
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

export const contextMenuHandlers = {
    "user-context": (children: any[], props: any) => {
        const user = props?.user;
        const channel = props?.channel || Channels.getChannel(props?.channelId) || Channels.getChannel(SelectedChannelStore.getChannelId());
        if (!user) return;
        const items = buildUserContextMenuItems(user, channel);
        if (items) addToSubmenu(children, "socialize-user-menu", "SocializeGuild", items);
    },
    "channel-context": (children: any[], props: any) => {
        const channel = props?.channel;
        if (!channel) return;
        const items = buildChannelContextMenuItems(channel);
        if (items) addToSubmenu(children, "socialize-channel-menu", "SocializeGuild", items);
    },
    "guild-context": (children: any[], props: any) => {
        const guild = props?.guild;
        if (!guild) return;
        const items = buildGuildContextMenuItems(guild);
        if (items) addToSubmenu(children, "socialize-guild-menu", "SocializeGuild", items);
    }
};
