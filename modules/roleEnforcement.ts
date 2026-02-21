import { UserStore as Users, GuildMemberStore } from "@webpack/common";
import { OptionType } from "@utils/types";

import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { SocializeEvent } from "../types/events";
import { getNewLineList } from "../utils/settingsHelpers";
import { sendDebugMessage } from "../utils/debug";
import { isUserInVoiceChannel } from "../utils/channels";
import { formatCommand } from "../utils/formatting";

export enum RequiredRoleMode {
    ALL = "All",
    ANY = "Any",
    NONE = "None"
}

export const roleEnforcementSettings = {
    // ── Role Enforcement ──────────────────────────────────────────────────
    banNotInRoles: { type: OptionType.BOOLEAN, description: "Auto-kick/ban users missing required roles", default: true, restartNeeded: false },
    requiredRoleIds: { type: OptionType.STRING, description: "Required role IDs — users missing these are auto-kicked (one per line)", default: "", multiline: true, restartNeeded: false },
    requiredRoleMode: {
        type: OptionType.SELECT,
        description: "How to match roles?",
        options: [
            { label: "Must have ALL of the roles (All)", value: RequiredRoleMode.ALL },
            { label: "Must have at least one of the roles (Any)", value: RequiredRoleMode.ANY, default: true },
            { label: "Must NOT have any of the roles (None)", value: RequiredRoleMode.NONE }
        ]
    },
};

export type RoleEnforcementSettingsType = typeof roleEnforcementSettings;

export const RoleEnforcementModule: PluginModule = {
    name: "RoleEnforcementModule",
    optionalDependencies: ["BansModule"],
    settingsSchema: roleEnforcementSettings,
    settings: null as unknown as Record<string, any>,

    init(settings: PluginSettings) {
        logger.info("RoleEnforcementModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            if (payload.isAllowed || payload.isHandled) return;

            const { channelId, userId, guildId } = payload;
            const ownership = stateManager.getOwnership(channelId);
            if (!ownership) return;

            const currentUserId = Users.getCurrentUser()?.id;
            if (!currentUserId || (ownership.creatorId !== currentUserId && ownership.claimantId !== currentUserId)) return;

            const s = settings as any;

            // If we are banning for missing roles, BansModule should handle it.
            if (s.banNotInRoles) return;

            // Check required roles from settings
            if (!s.requiredRoleIds || s.requiredRoleIds.trim() === "") return;

            const requiredRoleList = getNewLineList(s.requiredRoleIds);

            const member = GuildMemberStore.getMember(guildId, userId);

            if (member && requiredRoleList.length > 0) {
                let shouldKick = false;

                if (s.requiredRoleMode === RequiredRoleMode.ALL) {
                    const hasAllRoles = requiredRoleList.every(r => member.roles.includes(r));
                    shouldKick = !hasAllRoles;
                } else if (s.requiredRoleMode === RequiredRoleMode.NONE) {
                    const hasAnyRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                    shouldKick = hasAnyRole;
                } else {
                    // Default / ANY
                    const hasAnyRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                    shouldKick = !hasAnyRole;
                }

                if (shouldKick) {
                    sendDebugMessage(`<@${userId}> matched role enforcement conditions (${s.requiredRoleMode}). Kicking.`, channelId);

                    const kickCmd = formatCommand(s.kickCommand, channelId, { userId });

                    // Action taken
                    actionQueue.enqueue(
                        kickCmd,
                        channelId,
                        true,
                        () => isUserInVoiceChannel(userId, channelId)
                    );
                    payload.isHandled = true;
                    payload.reason = "Role Enforcement Violation";
                } else {
                    sendDebugMessage(`<@${userId}> did not match role enforcement conditions (${s.requiredRoleMode}). Not kicking.`, channelId);
                }
            }
        });
    },

    stop() {
        logger.info("RoleEnforcementModule stopping");
    }
};
