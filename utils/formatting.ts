import { UserStore as Users } from "@webpack/common";

/**
 * Format string replacing {user_id}, {channel_id}, {user} etc.
 */
export function formatCommand(template: string, channelId: string, options?: { userId?: string, size?: string, reason?: string, name?: string }): string {
    let result = template;

    // Replace current user
    const currentUserId = Users.getCurrentUser()?.id || "";
    result = result.replace(/{me}/g, `<@${currentUserId}>`);

    // Replace channel
    result = result.replace(/{channel}/g, `<#${channelId}>`);
    result = result.replace(/{channel_id}/g, channelId);

    if (options) {
        if (options.userId) {
            result = result.replace(/{user}/g, `<@${options.userId}>`);
            result = result.replace(/{user_id}/g, options.userId);

            const targetUser = Users.getUser(options.userId);
            if (targetUser) {
                result = result.replace(/{user_name}/g, targetUser.username);
            }
        }

        if (options.size) {
            result = result.replace(/{size}/g, options.size);
        }

        if (options.reason) {
            result = result.replace(/{reason}/g, options.reason);
        }

        if (options.name) {
            result = result.replace(/{name}/g, options.name);
        }
    }

    return result;
}

/**
 * Common formatter for basic messages like Skip Whitelist
 */
export function formatMessageCommon(msg: string): string {
    // Add additional base formatting here if strictly needed
    return msg;
}
