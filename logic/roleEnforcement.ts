import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings, RequiredRoleMode } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { UserStore as Users, GuildMemberStore, VoiceStateStore } from "@webpack/common";
import { SocializeEvent } from "../types/events";
import { getNewLineList } from "../utils/settingsHelpers";
import { sendDebugMessage } from "../utils/debug";
import { isUserInVoiceChannel } from "../utils/channels";

export const RoleEnforcementModule: SocializeModule = {
    name: "RoleEnforcementModule",

    init(settings: PluginSettings) {
        logger.info("RoleEnforcementModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            if (payload.isAllowed || payload.isHandled) return;

            const { channelId, userId, guildId } = payload;
            const ownership = stateManager.getOwnership(channelId);
            if (!ownership) return;

            const currentUserId = Users.getCurrentUser()?.id;
            if (!currentUserId || (ownership.creatorId !== currentUserId && ownership.claimantId !== currentUserId)) return;

            // If we are banning for missing roles, BansModule should handle it.
            if (settings.banNotInRoles) return;

            // Check required roles from settings
            if (!settings.requiredRoleIds || settings.requiredRoleIds.trim() === "") return;

            const requiredRoleList = getNewLineList(settings.requiredRoleIds);

            const member = GuildMemberStore.getMember(guildId, userId);

            if (member && requiredRoleList.length > 0) {
                let shouldKick = false;

                if (settings.requiredRoleMode === RequiredRoleMode.ALL) {
                    const hasAllRoles = requiredRoleList.every(r => member.roles.includes(r));
                    shouldKick = !hasAllRoles;
                } else if (settings.requiredRoleMode === RequiredRoleMode.NONE) {
                    const hasAnyRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                    shouldKick = hasAnyRole;
                } else {
                    // Default / ANY
                    const hasAnyRole = member.roles.some((r: string) => requiredRoleList.includes(r));
                    shouldKick = !hasAnyRole;
                }

                if (shouldKick) {
                    sendDebugMessage(`<@${userId}> matched role enforcement conditions (${settings.requiredRoleMode}). Kicking.`, channelId);

                    const kickCmd = settings.kickCommand.replace("{user}", `<@${userId}>`);

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
                    sendDebugMessage(`<@${userId}> did not match role enforcement conditions (${settings.requiredRoleMode}). Not kicking.`, channelId);
                }
            }
        });
    },

    stop() {
        logger.info("RoleEnforcementModule stopping");
    }
};
