import { ActionType, actionQueue, channelOwners } from "./state";
import { getKickList, jumpToFirstMessage } from "./utils";
import { checkChannelOwner, handleOwnerUpdate, processQueue, requestChannelInfo, fetchAllOwners } from "./logic";
import { settings } from "./settings";
import { pluginInfo } from "./info";
import { ChannelStore, SelectedChannelStore, VoiceStateStore, showToast, ChannelActions, Menu, UserStore, React } from "@webpack/common";
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
                        actionQueue.push({
                            type: ActionType.KICK,
                            userId: uid,
                            channelId: cid,
                            guildId: chan.guild_id
                        });
                        count++;
                    }
                }
                if (count > 0) {
                    showToast(`Adding ${count} banned user(s) to kick queue...`);
                    processQueue();
                } else {
                    showToast("No banned users found in current channel.");
                }
            }}
        />,
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
