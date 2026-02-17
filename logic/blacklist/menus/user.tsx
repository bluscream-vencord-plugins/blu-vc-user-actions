import { Menu, UserStore, SelectedChannelStore, VoiceStateStore, showToast } from "@webpack/common";
import { ActionType, channelOwners } from "../../../state";
import { queueAction } from "../../queue";
import { getKickList, setKickList } from "../utils";
import { type User } from "@vencord/discord-types";
import { checkChannelOwner, getMemberInfoForChannel } from "../../channelClaim";
import { log } from "../../../utils/logging";
import { settings } from "../../../settings";

export const getBlacklistUserItem = (user: User, channelId?: string, guildId?: string) => {
    const kickList = getKickList();
    const isBanned = kickList.includes(user.id);
    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    const isTargetInMyChannel = myChannelId && VoiceStateStore.getVoiceStatesForChannel(myChannelId)?.[user.id];

    return (
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
                    if (info?.banned.includes(user.id)) {
                        log(`Unban from VC: Queuing UNBAN for ${user.id} in ${myChannelId}`);
                        queueAction({
                            type: ActionType.UNBAN,
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: guildId || ""
                        });
                    }
                } else {
                    if (isTargetInMyChannel) {
                        const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                        log(`Ban from VC: Queuing KICK for ${user.id} in ${myChannelId}`);
                        queueAction({
                            type: ActionType.KICK,
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: voiceState?.guildId || guildId
                        });
                    }
                }
            }}
            color={isBanned ? "success" : "danger"}
        />
    );
};

export const getKickUserItem = (user: User, channelId?: string) => {
    const me = UserStore.getCurrentUser();
    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    const isTargetInMyChannel = myChannelId && VoiceStateStore.getVoiceStatesForChannel(myChannelId)?.[user.id];

    if (!isTargetInMyChannel) return null;

    return (
        <Menu.MenuItem
            id="socialize-guild-kick-vc"
            label="Kick from VC"
            color="brand"
            action={async () => {
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
};
