import { Constants, NavigationRouter, RestAPI, Toasts } from "@webpack/common";

/**
 * Navigates the Discord client to a specific guild, channel, or message.
 * @param guildId The target guild ID, or "@me" for DMs
 * @param channelId The target channel ID
 * @param messageId Optional message ID to scroll to
 */
export function navigateTo(guildId: string | null = "@me", channelId: string = "", messageId: string = "") {
    const finalGuildId = guildId ?? "@me";
    let path = `/channels/${finalGuildId}`;
    if (channelId) path += `/${channelId}`;
    if (messageId) path += `/${messageId}`;
    NavigationRouter.transitionTo(path);
}
/**
 * Jumps to the very first message ever sent in a channel.
 * @param channelId The target channel ID
 * @param guildId The target guild ID
 */
export const jumpToFirstMessage = (channelId: string, guildId?: string | null) => navigateTo(guildId, channelId, "0");

/**
 * Jumps to the most recent message in a channel by querying the Discord API.
 * @param channelId The target channel ID
 * @param guildId The target guild ID
 */
export async function jumpToLastMessage(channelId: string, guildId?: string | null) {
    const res = await RestAPI.get({
        url: Constants.Endpoints.MESSAGES(channelId),
        query: { limit: 1 }
    });
    const messageId = res.body?.[0]?.id;
    if (!messageId) return;
    navigateTo(guildId, channelId, messageId);
}

/**
 * Searches for a specific user's messages in a channel and jumps to either the first or last one.
 * @param channelId The target channel ID
 * @param guildId The target guild ID
 * @param userId The ID of the author to search for
 * @param first If true, jumps to the oldest message; otherwise the newest
 */
export async function jumpToUserMessage(channelId: string, guildId: string, userId: string, first: boolean) {
    try {
        const res = await RestAPI.get({
            url: Constants.Endpoints.SEARCH_GUILD(guildId),
            query: {
                author_id: userId,
                channel_id: channelId,
                sort_by: "timestamp",
                sort_order: first ? "asc" : "desc"
            }
        });
        const messageId = res.body?.messages?.[0]?.[0]?.id;
        if (!messageId) {
            Toasts.show({
                type: Toasts.Type.FAILURE,
                message: "No messages found from this user in this channel.",
                id: Toasts.genId()
            });
            return;
        }
        const url = `/channels/${guildId}/${channelId}/${messageId}`;
        NavigationRouter.transitionTo(url);
    } catch (e) {
        Toasts.show({
            type: Toasts.Type.FAILURE,
            message: "Failed to search for messages.",
            id: Toasts.genId()
        });
    }
}
