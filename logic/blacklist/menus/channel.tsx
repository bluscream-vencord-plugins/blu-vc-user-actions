import { Menu, UserStore, VoiceStateStore, showToast } from "@webpack/common";
import { type Channel } from "@vencord/discord-types";
import { bulkBanAndKick, bulkUnban } from "../index";
import { getKickList } from "../utils";
import { formatKickCommand } from "../formatting";
import { queueAction } from "../../queue";
import { ActionType } from "../../../state";

export const getBanAllItem = (channel: Channel) => (
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
);

export const getUnbanAllItem = (channel: Channel) => (
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
);

export const getKickBannedUsersItem = (channel: Channel) => (
    <Menu.MenuItem
        id="blu-vc-user-actions-kick-banned"
        label="Kick Banned Users"
        action={() => {
            const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channel.id);
            const kickList = getKickList();
            let count = 0;
            for (const uid in voiceStates) {
                if (kickList.includes(uid)) {
                    const cmd = formatKickCommand(channel.id, uid);
                    queueAction({
                        type: ActionType.KICK,
                        userId: uid,
                        channelId: channel.id,
                        guildId: channel.guild_id,
                        external: cmd
                    });
                    count++;
                }
            }
            if (count > 0) {
                showToast(`Adding ${count} banned user(s) to kick queue...`);
            } else {
                showToast("No banned users found in current channel.");
            }
        }}
    />
);
