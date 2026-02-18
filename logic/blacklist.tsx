import { OptionType } from "@utils/types";
import { Menu, UserStore, SelectedChannelStore, VoiceStateStore, showToast } from "@webpack/common";
import { type Channel, type User } from "@vencord/discord-types";
import { ActionType, channelOwners } from "../state"; import { log } from "../utils/logging";
import { formatCommand, formatMessageCommon, formatKickCommand, formatBanCommand, formatUnbanCommand } from "../utils/formatting";
import { queueAction } from "./queue";
import { checkChannelOwner, getMemberInfoForChannel } from "./channelClaim";
import { PluginModule } from "../types/PluginModule";

// #region Settings
export const blacklistSettings = {
    banLimit: {
        type: OptionType.NUMBER as const,
        description: "Max number of users allowed in local ban list",
        default: 10,
        restartNeeded: false,
    },
    banRotateEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Automatically cycle bans when limit reached",
        default: false,
        restartNeeded: false,
    },
    banRotationMessage: {
        type: OptionType.STRING as const,
        description: "Message to send when a ban is rotated",
        default: "♻️ Ban rotated: <@{user_id}> was unbanned to make room for <@{user_id_new}>",
        restartNeeded: false,
    },
    kickCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to kick a user",
        default: "!v kick {user_id}",
        restartNeeded: false,
    },
    banCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to ban a user",
        default: "!v ban {user_id}",
        restartNeeded: false,
    },
    unbanCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to unban a user",
        default: "!v unban {user_id}",
        restartNeeded: false,
    },
    localUserBlacklist: {
        type: OptionType.STRING as const,
        description: "List of user IDs to automatically kick (one per line)",
        default: "",
        multiline: true,
        restartNeeded: false,
    },
};
// #endregion

// #region Utils / Formatting
export function getKickList(): string[] {
    const { settings } = require("../settings");
    return settings.store.localUserBlacklist.split(/\r?\n/).map(s => s.trim()).filter(id => /^\d{17,19}$/.test(id));
}

export function setKickList(newList: string[]) {
    const { settings } = require("../settings");
    settings.store.localUserBlacklist = newList.join("\n");
}

// #endregion

export function formatBanRotationMessage(channelId: string, oldUserId: string, newUserId: string): string {
    const { settings } = require("../settings");
    const oldUser = UserStore.getUser(oldUserId);
    const newUser = UserStore.getUser(newUserId);
    const msg = settings.store.banRotationMessage
        .replace(/{user_id}/g, oldUserId)
        .replace(/{user_name}/g, oldUser?.username || oldUserId)
        .replace(/{user_id_new}/g, newUserId)
        .replace(/{user_name_new}/g, newUser?.username || newUserId);
    return formatMessageCommon(msg);
}
// #endregion

// #region Menus
export const BlacklistMenuItems = {
    getBanAllItem: (channel: Channel) => (
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
    ),

    getUnbanAllItem: (channel: Channel) => (
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
    ),

    getKickBannedUsersItem: (channel: Channel) => (
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
    ),

    getBlacklistUserItem: (user: User, channelId?: string, guildId?: string) => {
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
                        const { settings } = require("../settings");
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
    },

    getKickUserItem: (user: User, channelId?: string) => {
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
                        const { settings } = require("../settings");
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
    }
};

export const BlacklistModule: PluginModule = {
    id: "blacklist",
    name: "Blacklisting",
    settings: blacklistSettings,
    getChannelMenuItems: (channel) => ([
        BlacklistMenuItems.getBanAllItem(channel),
        BlacklistMenuItems.getUnbanAllItem(channel),
        BlacklistMenuItems.getKickBannedUsersItem(channel)
    ].filter(Boolean) as any),
    getUserMenuItems: (user, channelId, guildId) => ([
        BlacklistMenuItems.getBlacklistUserItem(user, channelId, guildId),
        BlacklistMenuItems.getKickUserItem(user, channelId)
    ].filter(Boolean) as any),
    getToolboxMenuItems: (channelId) => {
        const { ChannelStore } = require("@webpack/common");
        const channel = channelId ? ChannelStore.getChannel(channelId) : null;
        if (!channel) return null;
        return ([
            BlacklistMenuItems.getBanAllItem(channel),
            BlacklistMenuItems.getUnbanAllItem(channel),
            BlacklistMenuItems.getKickBannedUsersItem(channel)
        ].filter(Boolean) as any);
    },
    onVoiceStateUpdate: (voiceStates) => {
        const { settings } = require("../settings");
        if (!settings.store.banRotateEnabled) return;

        const { UserStore, ChannelStore } = require("@webpack/common");
        const me = UserStore.getCurrentUser();
        if (!me) return;

        const targetGuildVoiceStates = voiceStates.filter(s => s.guildId === settings.store.guildId);
        if (targetGuildVoiceStates.length === 0) return;

        for (const s of targetGuildVoiceStates) {
            if (s.userId === me.id) continue;
            if (!s.channelId) continue;

            const ownership = channelOwners.get(s.channelId);
            const isOwner = ownership && (ownership.creator?.userId === me.id || ownership.claimant?.userId === me.id);

            if (isOwner) {
                checkBlacklistEnforcement(s.userId, s.channelId, s.guildId, s.oldChannelId);
            }
        }
    },
    onUserJoined: (channelId, userId) => {
        const { settings } = require("../settings");
        const { channelOwners } = require("../state");
        const { UserStore, ChannelStore } = require("@webpack/common");

        const me = UserStore.getCurrentUser();
        const ownership = channelOwners.get(channelId);
        const isOwner = ownership && (ownership.creator?.userId === me.id || ownership.claimant?.userId === me.id);

        if (!isOwner) return;

        const channel = ChannelStore.getChannel(channelId);
        if (channel) {
            checkBlacklistEnforcement(userId, channelId, channel.guild_id);
        }
    }
};
// #endregion

// #region Logic
export function checkBlacklistEnforcement(userId: string, channelId: string, guildId: string, oldChannelId?: string) {
    const kickList = getKickList();
    if (!kickList.includes(userId)) return;

    if (oldChannelId === channelId) return;

    const cmd = formatKickCommand(channelId, userId);
    log(`Enforcing blacklist: kicking ${userId} from ${channelId}`);
    queueAction({
        type: ActionType.KICK,
        userId: userId,
        channelId: channelId,
        guildId: guildId,
        external: cmd
    });
}

export function bulkBanAndKick(userIds: string[], channelId: string, guildId: string): number {
    const kickList = getKickList();
    let count = 0;
    for (const userId of userIds) {
        if (!kickList.includes(userId)) {
            kickList.push(userId);
            count++;
        }
        const cmd = formatKickCommand(channelId, userId);
        queueAction({
            type: ActionType.KICK,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: cmd
        });
    }
    setKickList(kickList);
    return count;
}

export function bulkUnban(userIds: string[], channelId: string, guildId: string): number {
    const kickList = getKickList();
    let count = 0;
    const newList = kickList.filter(id => !userIds.includes(id));
    count = kickList.length - newList.length;
    setKickList(newList);

    for (const userId of userIds) {
        const cmd = formatUnbanCommand(channelId, userId);
        queueAction({
            type: ActionType.UNBAN,
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: cmd
        });
    }
    return count;
}
// #endregion
