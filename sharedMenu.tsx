import { ChannelStore, SelectedChannelStore, React } from "@webpack/common";
import {
    getClaimChannelItem,
    getLockChannelItem,
    getUnlockChannelItem,
    getResetChannelItem,
    getSetSizeSubmenu,
    getCheckOwnershipItem,
    getFetchAllOwnersItem,
    getChannelInfoItem,
    getOwnerStatusItems,
    getCreateChannelActionItem
} from "./logic/channelClaim/menus/channel";
import { getRenameChannelItem } from "./logic/channelName/menus/channel";
import {
    getBanAllItem,
    getUnbanAllItem,
    getKickBannedUsersItem
} from "./logic/blacklist/menus/channel";
import { getEditSettingsItem } from "./logic/core/menus/guild";

export const getSharedMenuItems = () => {
    const cid = SelectedChannelStore.getVoiceChannelId();
    const channel = cid ? ChannelStore.getChannel(cid) : undefined;

    const items: any[] = [];

    items.push(...getOwnerStatusItems(cid));
    items.push(getCheckOwnershipItem(cid));

    if (channel) {
        items.push(getLockChannelItem(channel));
        items.push(getUnlockChannelItem(channel));
        items.push(getResetChannelItem(channel));
        items.push(getClaimChannelItem(channel));
    }

    items.push(getCreateChannelActionItem());
    items.push(getFetchAllOwnersItem());

    if (channel) {
        items.push(getKickBannedUsersItem(channel));
        items.push(getRenameChannelItem(channel));
        items.push(getSetSizeSubmenu(channel));
        items.push(getBanAllItem(channel));
        items.push(getUnbanAllItem(channel));
    }

    items.push(getChannelInfoItem(cid));
    items.push(getEditSettingsItem());

    return items;
};
