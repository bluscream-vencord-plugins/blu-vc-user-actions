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
import { getKickList, setKickList, getOwnerForChannel, log } from "./utils";
import { checkChannelOwner, processQueue } from "./logic";
import { actionQueue } from "./state";

export const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    const channelId = SelectedChannelStore.getChannelId();
    const channel = ChannelStore.getChannel(channelId);
    if (channel?.guild_id !== settings.store.guildId) return;
    if (!user) return;
    const kickList = getKickList();
    const isBanned = kickList.includes(user.id);

    const submenu = (
        <Menu.MenuItem
            id="socialize-guild-user-actions"
            label={pluginName}
        >
            <Menu.MenuItem
                id="vc-blu-vc-user-action"
                label={isBanned ? "Unban from VC" : "Ban from VC"}
                action={async () => {
                    const newList = isBanned
                        ? kickList.filter(id => id !== user.id)
                        : [...kickList, user.id];
                    setKickList(newList);

                    if (!isBanned) {
                        const myChannelId = SelectedChannelStore.getVoiceChannelId();
                        if (myChannelId) {
                            const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                            if (voiceState) {
                                const me = UserStore.getCurrentUser();
                                let ownerInfo = getOwnerForChannel(myChannelId);
                                if (!ownerInfo || ownerInfo.userId === "") {
                                    ownerInfo = await checkChannelOwner(myChannelId, settings.store.botId);
                                }
                                log(`Context menu kick: Channel ${myChannelId} Owner ${ownerInfo.userId} Me ${me?.id}`);
                                if (ownerInfo.userId === me?.id) {
                                    actionQueue.push({
                                        userId: user.id,
                                        channelId: myChannelId,
                                        guildId: voiceState.guildId
                                    });
                                    processQueue();
                                } else {
                                    showToast(`Not owner of channel (Owner: ${ownerInfo.userId || "None"})`);
                                }
                            }
                        }
                    }
                }}
                color={isBanned ? "success" : "danger"}
            />
        </Menu.MenuItem>
    );

    children.splice(-1, 0, submenu);
};

export const GuildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }) => {
    if (guild?.id !== settings.store.guildId) return;
    children.push(
        <Menu.MenuItem id="socialize-guild-guild-submenu" label={pluginName}>
            {/* Future items here */}
        </Menu.MenuItem>
    );
};

export const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (channel?.guild_id !== settings.store.guildId) return;
    children.push(
        <Menu.MenuItem id="socialize-guild-channel-submenu" label={pluginName}>
            {/* Future items here */}
        </Menu.MenuItem>
    );
};
