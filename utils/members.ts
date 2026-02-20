import { FluxDispatcher } from "@webpack/common";
import { logger } from "./logger";

/**
 * Requests guild members from Discord.
 * @param guildId The ID of the guild to request members from.
 * @param userIds Array of user IDs to request.
 * @param presences Whether to include presences in the request. Defaults to true.
 */
export function requestGuildMembers(guildId: string, userIds: string[], presences: boolean = true) {
    if (!userIds || userIds.length === 0) return;

    logger.debug(`[requestGuildMembers] Requesting ${userIds.length} members for guild ${guildId}`);

    // OP 8 Request Guild Members allows up to 100 user IDs at a time
    for (let i = 0; i < userIds.length; i += 100) {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBERS_REQUEST",
            guildIds: [guildId],
            userIds: userIds.slice(i, i + 100),
            presences
        });
    }
}
