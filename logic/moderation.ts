import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent } from "../types/events";
import { stateManager } from "../utils/stateManager";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { UserStore as Users } from "@webpack/common";
export const ModerationModule: SocializeModule = {
    name: "ModerationModule",

    init(settings: PluginSettings) {
        logger.info("ModerationModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            const { channelId, userId } = payload;
            const ownership = stateManager.getOwnership(channelId);
            if (!ownership) return;

            const currentUserId = Users.getCurrentUser()?.id;
            if (!currentUserId || (ownership.creatorId !== currentUserId && ownership.claimantId !== currentUserId)) return;

            const config = stateManager.getMemberConfig(currentUserId);

            // Check whitelist
            if (config.whitelistedUsers.includes(userId)) {
                logger.info(`User ${userId} joined but is whitelisted.`);
                return;
            }

            // Check blacklist
            if (config.bannedUsers.includes(userId)) {
                logger.info(`Banned user ${userId} joined, kicking...`);

                // Construct kick command
                const settings = moduleRegistry["settings"]; // Hacky access for now since it's private in moduleRegistry
                if (settings && settings.kickCommand) {
                    const cmd = settings.kickCommand.replace("{user}", `<@${userId}>`);
                    actionQueue.enqueue(cmd, channelId, true); // priority kick
                }
            }
        });
    },

    stop() {
        logger.info("ModerationModule stopping");
    },

    // API for UI / Commands to call
    banUser(userId: string, channelId: string) {
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const config = stateManager.getMemberConfig(currentUserId);
        const settings = moduleRegistry["settings"];

        if (!settings || config.whitelistedUsers.includes(userId)) return;

        // Ban Rotation Logic
        if (config.bannedUsers.length >= settings.maxBans) {
            const oldestBannedUser = config.bannedUsers.shift();
            if (oldestBannedUser) {
                logger.info(`Ban list full. Unbanning ${oldestBannedUser} to make room...`);
                const unbanCmd = settings.unbanCommand.replace("{user}", `<@${oldestBannedUser}>`);
                actionQueue.enqueue(unbanCmd, channelId, true);
            }
        }

        config.bannedUsers.push(userId);
        stateManager.updateMemberConfig(currentUserId, { bannedUsers: config.bannedUsers });

        const banCmd = settings.banCommand.replace("{user}", `<@${userId}>`);
        actionQueue.enqueue(banCmd, channelId, true);
    }
};
