import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { UserStore as Users, GuildMemberStore } from "@webpack/common"; import { SocializeEvent } from "../types/events";

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

            // For now, let's assume we want to enforce a specific hardcoded role ID for testing
            // Real implementation would pull this from user settings stored in MemberChannelInfo
            const requiredRoleId = "SOME_ROLE_ID"; // TODO Make this configurable
            const guildId = settings.guildId;

            const member = GuildMemberStore.getMember(guildId, userId);

            if (member && !member.roles.includes(requiredRoleId)) {
                logger.info(`User ${userId} missing role ${requiredRoleId}, kicking...`);
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
