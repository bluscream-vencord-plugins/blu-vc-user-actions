import { OptionType } from "@utils/types";
import { Menu, UserStore, SelectedChannelStore, VoiceStateStore, showToast, ChannelStore } from "@webpack/common";
import { sendMessage } from "@utils/discord";
import { type Channel, type User } from "@vencord/discord-types";
import { channelOwners } from "../state";
import { log, warn, error } from "../utils/logging";
import { formatMessageCommon, formatCommand } from "../utils/formatting";
import { getUserIdList, setNewLineList } from "../utils/settings";
import { queueAction } from "./queue";
import { checkChannelOwner, getMemberInfoForChannel } from "./channelClaim";
import { PluginModule } from "../types/PluginModule";
import { ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { state } from "../state";

export function getKickList(): string[] {
    return getUserIdList("localUserBlacklist");
}

export function setKickList(newList: string[]) {
    setNewLineList("localUserBlacklist", newList);
}

export function formatBanRotationMessage(channelId: string, oldUserId: string, newUserId: string): string {
    const { settings } = require("..");
    const oldUser = UserStore.getUser(oldUserId);
    const newUser = UserStore.getUser(newUserId);
    const msg = settings.store.banRotationMessage
        .replace(/{user_id}/g, oldUserId)
        .replace(/{user_name}/g, oldUser?.username || oldUserId)
        .replace(/{user_id_new}/g, newUserId)
        .replace(/{user_name_new}/g, newUser?.username || newUserId);
    return formatMessageCommon(msg);
}

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
                const userIds = Object.keys(voiceStates).filter(uid => uid !== me?.id);

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
                const userIds = Object.keys(voiceStates).filter(uid => uid !== me?.id);

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
                        const { settings } = require("..");
                        const cmd = formatCommand(settings.store.kickCommand, channel.id, { userId: uid });
                        queueAction({
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
        const isTargetInMyChannel = myChannelId && !!VoiceStateStore.getVoiceStatesForChannel(myChannelId)?.[user.id];

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
                    if (!ownership?.creator && !ownership?.claimant) {
                        const { settings } = require("..");
                        await checkChannelOwner(myChannelId, settings.store.botId);
                        ownership = channelOwners.get(myChannelId);
                    }

                    const isOwner = ownership?.creator?.userId === me.id || ownership?.claimant?.userId === me.id;
                    if (!isOwner) return;

                    const info = getMemberInfoForChannel(myChannelId);

                    if (isBanned) {
                        if (info?.banned.includes(user.id)) {
                            log(`Unban from VC: Queuing UNBAN for ${user.id} in ${myChannelId}`);
                            const { settings } = require("..");
                            queueAction({
                                userId: user.id,
                                channelId: myChannelId,
                                guildId: guildId || "",
                                external: formatCommand(settings.store.unbanCommand, myChannelId, { userId: user.id })
                            });
                        }
                    } else if (isTargetInMyChannel) {
                        const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                        const { settings } = require("..");
                        log(`Ban from VC: Queuing KICK for ${user.id} in ${myChannelId}`);
                        queueAction({
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: voiceState?.guildId || guildId,
                            external: formatCommand(settings.store.kickCommand, myChannelId, { userId: user.id })
                        });
                    }
                }}
                color={isBanned ? "success" : "danger"}
            />
        );
    },

    getKickUserItem: (user: User, channelId?: string) => {
        const me = UserStore.getCurrentUser();
        const myChannelId = SelectedChannelStore.getVoiceChannelId();
        const isTargetInMyChannel = myChannelId && !!VoiceStateStore.getVoiceStatesForChannel(myChannelId)?.[user.id];

        if (!isTargetInMyChannel) return null;

        return (
            <Menu.MenuItem
                id="socialize-guild-kick-vc"
                label="Kick from VC"
                color="brand"
                action={async () => {
                    let ownership = channelOwners.get(myChannelId);
                    if (!ownership?.creator && !ownership?.claimant) {
                        const { settings } = require("..");
                        await checkChannelOwner(myChannelId, settings.store.botId);
                        ownership = channelOwners.get(myChannelId);
                    }

                    const isOwner = ownership?.creator?.userId === me.id || ownership?.claimant?.userId === me.id;

                    if (isOwner) {
                        const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                        const { settings } = require("..");
                        queueAction({
                            userId: user.id,
                            channelId: myChannelId,
                            guildId: voiceState?.guildId,
                            external: formatCommand(settings.store.kickCommand, myChannelId, { userId: user.id })
                        });
                    } else {
                        warn(`Not owner of channel ${myChannelId}`);
                        showToast(`Not owner of channel.`);
                    }
                }}
            />
        );
    }
};

export const BlacklistModule: PluginModule = {
    id: "blacklist",
    name: "Blacklisting",
    settings: {
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
    },
    commands: [
        {
            name: "bans-add", description: "Add a user to local ban list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "user", description: "User to ban", type: ApplicationCommandOptionType.USER, required: true }], execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const userId = findOption(args, "user", "") as string;
                const kickList = getKickList();
                if (kickList.includes(userId)) { sendBotMessage(ctx.channel.id, { content: "❌ User already banned." }); return; }
                kickList.push(userId);
                setKickList(kickList);
                sendBotMessage(ctx.channel.id, { content: `✅ Added <@${userId}> to ban list.` });
            }
        },
        {
            name: "bans-remove", description: "Remove a user from local ban list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "user", description: "User to unban", type: ApplicationCommandOptionType.USER, required: true }], execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const userId = findOption(args, "user", "") as string;
                const kickList = getKickList();
                const newList = kickList.filter(id => id !== userId);
                setKickList(newList);
                sendBotMessage(ctx.channel.id, { content: `✅ Removed <@${userId}> from ban list.` });
            }
        },
        {
            name: "bans-kick", description: "Kick all local-banned users from VC", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
                const kickList = getKickList();
                let count = 0;
                for (const uid in voiceStates) {
                    if (kickList.includes(uid)) {
                        const { settings } = require("..");
                        const cmd = formatCommand(settings.store.kickCommand, channelId, { userId: uid });
                        queueAction({ userId: uid, channelId, guildId: ctx.channel.guild_id, external: cmd });
                        count++;
                    }
                }
                sendBotMessage(ctx.channel.id, { content: `✅ Queued kicks for ${count} users.` });
            }
        },
        {
            name: "bans-clear", description: "Clear local ban list", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                setKickList([]);
                sendBotMessage(ctx.channel.id, { content: "✅ Local ban list cleared." });
            }
        },
        {
            name: "bans-list", description: "Show merged ban list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "user", description: "Specific user to check", type: ApplicationCommandOptionType.USER, required: false }], execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const { settings } = require("..");
                const { memberInfos, state, channelOwners } = require("../state");
                const me = UserStore.getCurrentUser();
                let targetUserId = findOption(args, "user", "") as string;

                let info: any;
                let contextName = "";
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;

                if (targetUserId) {
                    info = memberInfos.get(targetUserId);
                    const user = UserStore.getUser(targetUserId);
                    contextName = user?.globalName || user?.username || targetUserId;
                } else {
                    const ownership = channelOwners.get(channelId);
                    const ownerId = ownership?.claimant?.userId || ownership?.creator?.userId;
                    if (ownerId) {
                        targetUserId = ownerId;
                        info = memberInfos.get(targetUserId);
                        const user = UserStore.getUser(targetUserId);
                        contextName = user?.globalName || user?.username || targetUserId;
                    } else if (me) {
                        targetUserId = me.id;
                        info = memberInfos.get(targetUserId);
                        contextName = "Your Settings";
                    }
                }

                const localUserBlacklist = getKickList();
                const bannedIds = info?.banned || [];
                const allIds = Array.from(new Set([...bannedIds, ...localUserBlacklist]));
                const nextToReplace = (bannedIds.length >= settings.store.banLimit) ? bannedIds[0] : null;

                const lines = allIds.map(id => {
                    const user = UserStore.getUser(id);
                    const name = user ? `<@${id}>` : `Unknown (\`${id}\`)`;
                    const isAuto = localUserBlacklist.includes(id);
                    const isChannel = bannedIds.includes(id);

                    let marker = "";
                    if (isAuto && isChannel) marker = " ⭐";
                    else if (isAuto) marker = " ⚙️";
                    else marker = " 📍";

                    if (id === nextToReplace) marker += " ♻️";

                    let source = "";
                    if (isAuto && isChannel) source = "(Both)";
                    else if (isAuto) source = "(Sync)";
                    else source = "(MemberInfo)";

                    return `- ${name} ${source}${marker}`;
                });

                const embed: any = {
                    type: "rich",
                    title: `🚫 Ban Configuration: ${contextName}`,
                    description: lines.length > 0 ? lines.join("\n") : "No users are currently banned in this configuration.",
                    color: 0xED4245,
                    fields: [
                        {
                            name: "📊 Stats",
                            value: `MemberInfo Bans: ${bannedIds.length}/${settings.store.banLimit}\nLocal Blacklist: ${localUserBlacklist.length}`,
                            inline: false
                        }
                    ],
                    footer: { text: `⭐=Both | ⚙️=Sync Only | 📍=MemberOnly | ♻️=Next to replace` }
                };

                sendBotMessage(ctx.channel.id, { embeds: [embed] });
            }
        },
        {
            name: "bans-share", description: "Share local ban list in chat", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const kickList = getKickList();
                sendMessage(ctx.channel.id, { content: `**Local Ban List:**\n${kickList.map(id => `<@${id}>`).join(", ") || "None"}` });
            }
        },
    ],
    getChannelMenuItems: (channel) => {
        const ch = channel.resolve();
        return ([
            ch && BlacklistMenuItems.getBanAllItem(ch),
            ch && BlacklistMenuItems.getUnbanAllItem(ch),
            ch && BlacklistMenuItems.getKickBannedUsersItem(ch)
        ].filter(Boolean) as React.ReactElement[]);
    },
    getUserMenuItems: (user, channelId, guildId) => ([
        BlacklistMenuItems.getBlacklistUserItem(user, channelId, guildId),
        BlacklistMenuItems.getKickUserItem(user, channelId)
    ].filter(Boolean) as React.ReactElement[]),
    getToolboxMenuItems: (channel) => {
        const ch = channel?.resolve();
        if (!ch) return null;
        return ([
            BlacklistMenuItems.getBanAllItem(ch),
            BlacklistMenuItems.getUnbanAllItem(ch),
            BlacklistMenuItems.getKickBannedUsersItem(ch)
        ].filter(Boolean) as React.ReactElement[]);
    },
    onVoiceStateUpdate: (voiceStates) => {
        const { settings } = require("..");
        if (!settings.store.banRotateEnabled) return;

        const me = UserStore.getCurrentUser();
        if (!me) return;

        const targetGuildVoiceStates = voiceStates.filter(s => s.guildId === settings.store.guildId);
        for (const s of targetGuildVoiceStates) {
            if (s.userId === me.id || !s.channelId) continue;

            const ownership = channelOwners.get(s.channelId);
            const isOwner = ownership?.creator?.userId === me.id || ownership?.claimant?.userId === me.id;

            if (isOwner) {
                checkBlacklistEnforcement(s.userId, s.channelId, s.guildId, s.oldChannelId);
            }
        }
    },
    onUserJoined: (channel, user) => {
        const { settings } = require("..");
        const me = UserStore.getCurrentUser();
        const ownership = channelOwners.get(channel.id);
        const isOwner = ownership?.creator?.userId === me.id || ownership?.claimant?.userId === me.id;

        if (isOwner && settings.store.banRotateEnabled) {
            checkBlacklistEnforcement(user.id, channel.id, channel.resolve()?.guild_id ?? "");
        }
    }
};

export function checkBlacklistEnforcement(userId: string, channelId: string, guildId: string, oldChannelId?: string) {
    if (oldChannelId === channelId) return;

    const kickList = getKickList();
    if (!kickList.includes(userId)) return;

    const { settings } = require("..");
    const now = Date.now();
    const lastKick = state.recentlyKickedUsers.get(userId) || 0;

    if (settings.store.banRotateEnabled && (now - lastKick < 60000)) {
        log(`Ban rotation triggered for ${userId} in ${channelId} (rejoined within 60s)`);
        applyBanRotation(userId, channelId, guildId);
    } else {
        const cmd = formatCommand(settings.store.kickCommand, channelId, { userId });
        log(`Enforcing blacklist: kicking ${userId} from ${channelId}`);
        queueAction({
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: cmd
        });
        state.recentlyKickedUsers.set(userId, now);
    }
}

export function applyBanRotation(userId: string, channelId: string, guildId: string) {
    const { settings } = require("..");
    const info = getMemberInfoForChannel(channelId);
    if (!info) {
        warn(`Cannot rotate ban for ${userId} in ${channelId}: MemberInfo not found.`);
        return;
    }

    if (info.banned.includes(userId)) {
        log(`User ${userId} already banned in channel ${channelId}, skipping rotation.`);
        return;
    }

    if (info.banned.length >= settings.store.banLimit) {
        const oldestBannedId = info.banned[0];
        log(`Ban limit reached (${info.banned.length}). Rotating out oldest ban: ${oldestBannedId}`);

        const unbanCmd = formatCommand(settings.store.unbanCommand, channelId, { userId: oldestBannedId });
        queueAction({
            userId: oldestBannedId,
            channelId: channelId,
            guildId: guildId,
            external: unbanCmd
        });

        const ephemeral = formatBanRotationMessage(channelId, oldestBannedId, userId);
        sendBotMessage(channelId, { content: ephemeral });
    }

    const banCmd = formatCommand(settings.store.banCommand, channelId, { userId });
    log(`Queuing ban for joiner ${userId} in ${channelId}`);
    queueAction({
        userId: userId,
        channelId: channelId,
        guildId: guildId,
        external: banCmd
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
        const { settings } = require("..");
        const cmd = formatCommand(settings.store.kickCommand, channelId, { userId });
        queueAction({
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
    const newList = kickList.filter(id => !userIds.includes(id));
    const count = kickList.length - newList.length;
    setKickList(newList);

    for (const userId of userIds) {
        const { settings } = require("..");
        const cmd = formatCommand(settings.store.unbanCommand, channelId, { userId });
        queueAction({
            userId: userId,
            channelId: channelId,
            guildId: guildId,
            external: cmd
        });
    }
    return count;
}
// #endregion
