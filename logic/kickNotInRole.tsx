import { OptionType } from "@utils/types";
import { UserStore, ChannelStore, GuildMemberStore, Menu } from "@webpack/common";
import { channelOwners, state } from "../state";
import { log, error } from "../utils/logging";
import { formatCommand } from "../utils/formatting";
import { queueAction } from "./queue";
import { PluginModule } from "../types/PluginModule";

// #region Settings
// #endregion

export const KickNotInRoleMenuItems = {
    getResetStateItem: () => {
        const { settings } = require("..");
        return (
            <Menu.MenuCheckboxItem
                id="socialize-guild-toggle-kick-not-in-role"
                label="Role Kick"
                checked={settings.store.kickNotInRoleEnabled}
                action={() => {
                    settings.store.kickNotInRoleEnabled = !settings.store.kickNotInRoleEnabled;
                }}
            />
        );
    }
};

export function formatKickNotInRoleMessage(channelId: string, userId: string, roleId: string): string {
    const { settings } = require("..");
    const msg = settings.store.kickNotInRoleMessage as string;
    return formatCommand(msg, channelId, { userId })
        .replace(/{role_id}/g, roleId);
}

export const KickNotInRoleModule: PluginModule = {
    id: "kick-not-in-role",
    name: "Role Enforcement",
    settings: {
        kickNotInRoleEnabled: {
            type: OptionType.BOOLEAN as const,
            description: "Kick users if they don't have a specific role",
            default: false,
            restartNeeded: false,
        },
        kickNotInRole: {
            type: OptionType.STRING as const,
            description: "The Role ID required to stay in the channel",
            default: "",
            restartNeeded: false,
        },
        kickNotInRoleMessage: {
            type: OptionType.STRING as const,
            description: "Message to show when a user is kicked for missing role",
            default: "⚠️ <@{user_id}> was kicked from VC because they don't have the required role (<@&{role_id}>).",
            restartNeeded: false,
        },
        kickCommand: {
            type: OptionType.STRING as const,
            description: "External message to send when a user is kicked for missing role",
            default: "!v kick {user_id}",
            restartNeeded: false,
        },
    },
    getToolboxMenuItems: () => {
        return [
            KickNotInRoleMenuItems.getResetStateItem(),
        ];
    },
    onVoiceStateUpdate: (voiceStates) => {
        const { settings } = require("..");
        if (!settings.store.kickNotInRoleEnabled || !settings.store.kickNotInRole) return;

        const me = UserStore.getCurrentUser();
        if (!me) return;

        const targetGuildVoiceStates = voiceStates.filter(s => s.guildId === settings.store.guildId);
        for (const s of targetGuildVoiceStates) {
            if (s.userId === me.id || !s.channelId) continue;

            const ownership = channelOwners.get(s.channelId);
            const isOwner = ownership?.creator?.userId === me.id || ownership?.claimant?.userId === me.id;

            if (isOwner) {
                checkKickNotInRole(s.userId, s.channelId, s.guildId);
            }
        }
    },
    onUserJoined: (channel, user) => {
        const { settings } = require("..");
        const me = UserStore.getCurrentUser();
        const ownership = channelOwners.get(channel.id);
        const isOwner = ownership?.creator?.userId === me.id || ownership?.claimant?.userId === me.id;

        if (isOwner && settings.store.kickNotInRoleEnabled && settings.store.kickNotInRole) {
            const resolved = channel.resolve();
            if (resolved?.guild_id) {
                checkKickNotInRole(user.id, channel.id, resolved.guild_id);
            }
        }
    }
};

export function checkKickNotInRole(userId: string, channelId: string, guildId: string) {
    const { settings } = require("..");
    const member = GuildMemberStore.getMember(guildId, userId);
    if (!member) return;

    const requiredRole = settings.store.kickNotInRole;
    if (!requiredRole) return;

    if (!member.roles.includes(requiredRole)) {
        log(`Enforcing role requirement: user ${userId} missing role ${requiredRole} in ${channelId}`);
        const ephemeral = formatKickNotInRoleMessage(channelId, userId, requiredRole);
        const external = formatCommand(settings.store.kickCommand, channelId, { userId });

        queueAction({
            userId,
            channelId,
            guildId,
            ephemeral,
            external
        });
        state.recentlyKickedUsers.set(userId, Date.now());
    }
}
