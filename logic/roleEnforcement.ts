import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { UserStore as Users, GuildMemberStore } from "@webpack/common";
import { SocializeEvent } from "../types/events";
import { getNewLineList } from "../utils/settingsHelpers";
import { sendDebugMessage } from "../utils/debug";

export const RoleEnforcementModule: SocializeModule = {
    name: "RoleEnforcementModule",

    init(settings: PluginSettings) {
        logger.info("RoleEnforcementModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            const { channelId, userId } = payload;
            const ownership = stateManager.getOwnership(channelId);
            if (!ownership) return;

            const currentUserId = Users.getCurrentUser()?.id;
            if (!currentUserId || (ownership.creatorId !== currentUserId && ownership.claimantId !== currentUserId)) return;

            // Check required roles from settings if enforced
            if (!settings.enforceRequiredRoles || !settings.requiredRoleIds || settings.requiredRoleIds.trim() === "") return;

            const requiredRoleList = getNewLineList(settings.requiredRoleIds);
            const guildId = settings.guildId;

            const member = GuildMemberStore.getMember(guildId, userId);

            if (member && requiredRoleList.length > 0 && !member.roles.some((r: string) => requiredRoleList.includes(r))) {
                sendDebugMessage(channelId, `<@${userId}> is missing required roles.`);

                const kickCmd = settings.kickCommand.replace("{user}", `<@${userId}>`);

                // Check if they are whitelisted before kicking
                const config = stateManager.getMemberConfig(currentUserId);
                if (!config.whitelistedUsers.includes(userId)) {
                    actionQueue.enqueue(kickCmd, channelId, true);
                }
            }
        });
    },

    stop() {
        logger.info("RoleEnforcementModule stopping");
    }
};
