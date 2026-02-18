import { OptionType } from "@utils/types";
import { UserStore, ChannelStore, GuildMemberStore } from "@webpack/common";
import { ActionType, channelOwners } from "../state";
import { log, error } from "../utils/logging";
import { formatCommand } from "../utils/formatting";
import { queueAction } from "./queue";
import { PluginModule } from "../types/PluginModule";

// #region Settings
// #endregion

export function formatkickNotInRoleEphemeral(channelId: string, userId: string): string {
    const { settings } = require("../settings");
    return formatCommand(settings.store.kickNotInRoleEphemeral, channelId, { userId });
}

export function formatkickNotInRoleExternal(channelId: string, userId: string): string {
    const { settings } = require("../settings");
    return formatCommand(settings.store.kickNotInRoleExternal, channelId, { userId });
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
        kickNotInRoleEphemeral: {
            type: OptionType.STRING as const,
            description: "Ephemeral message to show when a user is kicked for missing role",
            default: "⚠️ <@{user_id}> was kicked from VC because they don't have the required role.",
            restartNeeded: false,
        },
        kickNotInRoleExternal: {
            type: OptionType.STRING as const,
            description: "External message to send when a user is kicked for missing role",
            default: "!v kick {user_id}",
            restartNeeded: false,
        },
    },
    onVoiceStateUpdate: (voiceStates) => {
        const { settings } = require("../settings");
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
    onUserJoined: (channelId, userId) => {
        const { settings } = require("../settings");
        const me = UserStore.getCurrentUser();
        const ownership = channelOwners.get(channelId);
        const isOwner = ownership?.creator?.userId === me.id || ownership?.claimant?.userId === me.id;

        if (isOwner && settings.store.kickNotInRoleEnabled && settings.store.kickNotInRole) {
            const channel = ChannelStore.getChannel(channelId);
            if (channel) checkKickNotInRole(userId, channelId, channel.guild_id);
        }
    }
};

export function checkKickNotInRole(userId: string, channelId: string, guildId: string) {
    const { settings } = require("../settings");
    const member = GuildMemberStore.getMember(guildId, userId);
    if (!member) return;

    const requiredRole = settings.store.kickNotInRole;
    if (!requiredRole) return;

    if (!member.roles.includes(requiredRole)) {
        log(`Enforcing role requirement: user ${userId} missing role ${requiredRole} in ${channelId}`);
        const ephemeral = formatkickNotInRoleEphemeral(channelId, userId);
        const external = formatkickNotInRoleExternal(channelId, userId);

        queueAction({
            type: ActionType.KICK,
            userId,
            channelId,
            guildId,
            ephemeral,
            external
        });
    }
}
