import { Menu, showToast, UserStore, ChannelStore, SelectedChannelStore, ChannelActions } from "@webpack/common";
import { ActionType, channelOwners } from "../../../state";
import { queueAction } from "../../queue";
import { formatclaimCommand, formatLockCommand, formatUnlockCommand, formatResetCommand, formatInfoCommand, formatLimitCommand } from "../formatting";
import { checkChannelOwner, handleOwnerUpdate, requestChannelInfo, fetchAllOwners } from "../index";
import { type Channel } from "@vencord/discord-types";
import { settings } from "../../../settings";
import { jumpToFirstMessage } from "../../../utils/navigation";

export const getClaimChannelItem = (channel: Channel) => (
    <Menu.MenuItem
        id="socialize-guild-claim-channel"
        label="Claim Channel"
        action={async () => {
            const me = UserStore.getCurrentUser();
            if (me) {
                const cmd = formatclaimCommand(channel.id);
                queueAction({
                    type: ActionType.CLAIM,
                    userId: me.id,
                    channelId: channel.id,
                    guildId: channel.guild_id,
                    external: cmd
                });
            } else {
                showToast("Could not identify current user.");
            }
        }}
    />
);

export const getLockChannelItem = (channel: Channel) => (
    <Menu.MenuItem
        id="socialize-guild-lock-channel"
        label="Lock Channel"
        action={() => {
            const cmd = formatLockCommand(channel.id);
            queueAction({
                type: ActionType.LOCK,
                userId: "",
                channelId: channel.id,
                guildId: channel.guild_id,
                external: cmd
            });
        }}
    />
);

export const getUnlockChannelItem = (channel: Channel) => (
    <Menu.MenuItem
        id="socialize-guild-unlock-channel"
        label="Unlock Channel"
        action={() => {
            const cmd = formatUnlockCommand(channel.id);
            queueAction({
                type: ActionType.UNLOCK,
                userId: "",
                channelId: channel.id,
                guildId: channel.guild_id,
                external: cmd
            });
        }}
    />
);

export const getResetChannelItem = (channel: Channel) => (
    <Menu.MenuItem
        id="socialize-guild-reset-channel"
        label="Reset Channel"
        action={() => {
            const cmd = formatResetCommand(channel.id);
            queueAction({
                type: ActionType.RESET,
                userId: "",
                channelId: channel.id,
                guildId: channel.guild_id,
                external: cmd
            });
        }}
    />
);

export const getInfoCommandItem = (channel: Channel) => (
    <Menu.MenuItem
        id="socialize-guild-info-command"
        label="Send Info Command"
        action={() => {
            const cmd = formatInfoCommand(channel.id);
            queueAction({
                type: ActionType.INFO,
                userId: "",
                channelId: channel.id,
                guildId: channel.guild_id,
                external: cmd
            });
        }}
    />
);

export const getSetSizeSubmenu = (channel: Channel) => (
    <Menu.MenuItem
        id="socialize-guild-set-size-submenu"
        label="Set Channel Size"
    >
        {[0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 50, 99].map(size => (
            <Menu.MenuItem
                id={`socialize-guild-set-size-${size}`}
                label={size === 0 ? "Unlimited" : `${size} Users`}
                action={() => {
                    const cmd = formatLimitCommand(channel.id, size);
                    queueAction({
                        type: ActionType.LIMIT,
                        userId: "",
                        channelId: channel.id,
                        guildId: channel.guild_id,
                        external: cmd
                    });
                }}
            />
        ))}
    </Menu.MenuItem>
);

export const getCheckOwnershipItem = (channelId?: string) => (
    <Menu.MenuItem
        id="blu-vc-user-actions-check-ownership"
        label="Check Ownership"
        disabled={!channelId}
        action={async () => {
            if (channelId) {
                const owner = await checkChannelOwner(channelId, settings.store.botId);
                if (owner.userId) {
                    handleOwnerUpdate(channelId, owner);
                }
            }
        }}
    />
);

export const getFetchAllOwnersItem = () => (
    <Menu.MenuItem
        id="blu-vc-user-actions-fetch-all-owners"
        label="Fetch All Owners"
        action={() => fetchAllOwners()}
    />
);

export const getChannelInfoItem = (channelId?: string) => (
    <Menu.MenuItem
        id="blu-vc-user-actions-get-info"
        label="Get Channel Info"
        disabled={!channelId}
        action={() => {
            if (channelId) requestChannelInfo(channelId);
        }}
    />
);

export const getOwnerStatusItems = (channelId?: string) => {
    const { enabled } = settings.use(["enabled"]);
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
        />
    ];
};

export const getCreateChannelActionItem = () => (
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
    />
);
