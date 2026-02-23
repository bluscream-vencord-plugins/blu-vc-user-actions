import { UserStore as Users, GuildMemberStore } from "@webpack/common";
import { OptionType } from "@utils/types";
import { PluginModule } from "../types/module";
import { moduleRegistry } from "../core/moduleRegistry";
import { logger } from "../utils/logger";
import { actionQueue } from "../core/actionQueue";
import { stateManager } from "../utils/state";
import { CoreEvent } from "../types/events";
import { getNewLineList } from "../utils/settings";
import { sendDebugMessage } from "../utils/debug";
import { isUserInVoiceChannel } from "../utils/channels";
import { formatCommand } from "../utils/formatting";

/**
 * Modes for evaluating user role requirements.
 */
export enum RequiredRoleMode {
    /** User must have ALL of the specified roles. */
    ALL = "All",
    /** User must have AT LEAST ONE of the specified roles. */
    ANY = "Any",
    /** User must NOT have any of the specified roles. */
    NONE = "None"
}

/**
 * Settings definitions for the RoleEnforcementModule.
 */
export const roleEnforcementSettings = {
    /** Whether to automatically kick or ban users who do not meet the role requirements. */
    banNotInRoles: { type: OptionType.BOOLEAN, description: "Auto-kick/ban users missing required roles", default: true, restartNeeded: false },
    /** A newline-separated list of role IDs used for enforcement. */
    requiredRoleIds: { type: OptionType.STRING, description: "Required role IDs — users missing these are auto-kicked (one per line)", default: "", multiline: true, restartNeeded: false },
    /** Determines how the role IDs are matched (All, Any, or None). */
    requiredRoleMode: {
        type: OptionType.SELECT,
        description: "How to match roles?",
        options: [
            { label: "Must have ALL of the roles", value: RequiredRoleMode.ALL },
            { label: "Must have at least one of the roles", value: RequiredRoleMode.ANY, default: true },
            { label: "Must NOT have any of the roles", value: RequiredRoleMode.NONE }
        ]
    },
};

export type RoleEnforcementSettingsType = typeof roleEnforcementSettings;

export const RoleEnforcementModule: PluginModule = {
    name: "RoleEnforcementModule",
    description: "Enforces role-based access control for owned voice channels.",
    optionalDependencies: ["BansModule"],
    settingsSchema: roleEnforcementSettings,
    settings: null,

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("RoleEnforcementModule initializing");

        moduleRegistry.on(CoreEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            if (payload.isAllowed || payload.isHandled) return;

            const { channelId, userId, guildId } = payload;
            const ownership = stateManager.getOwnership(channelId);
            if (!ownership) return;

            const currentUserId = Users.getCurrentUser()?.id;
            if (!currentUserId || (ownership.creatorId !== currentUserId && ownership.claimantId !== currentUserId)) return;

            const s = this.settings as any;
            if (s.banNotInRoles) return;
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
                    const hasAnyRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                    shouldKick = !hasAnyRole;
                }

                if (shouldKick) {
                    sendDebugMessage(`<@${userId}> matched role enforcement conditions (${s.requiredRoleMode}). Kicking.`, channelId);
                    const kickCmd = formatCommand(s.kickCommand, channelId, { userId });
                    actionQueue.enqueue(kickCmd, channelId, true, () => isUserInVoiceChannel(userId, channelId));
                    payload.isHandled = true;
                    payload.reason = "Role Enforcement Violation";
                }
            }
        });
    },

    stop() {
        logger.info("RoleEnforcementModule stopping");
    }
};
