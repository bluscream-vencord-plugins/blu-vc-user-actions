import { Constants, NavigationRouter, RestAPI, Toasts } from "@webpack/common";

export function navigateTo(guildId: string | null = "@me", channelId: string = "", messageId: string = "") {
    const finalGuildId = guildId ?? "@me";
    let path = `/channels/${finalGuildId}`;
    if (channelId) path += `/${channelId}`;
    if (messageId) path += `/${messageId}`;
    NavigationRouter.transitionTo(path);
}
export const jumpToFirstMessage = (channelId: string, guildId?: string | null) => navigateTo(guildId, channelId, "0");

export async function jumpToLastMessage(channelId: string, guildId?: string | null) {
    const res = await RestAPI.get({
        url: Constants.Endpoints.MESSAGES(channelId),
        query: { limit: 1 }
    });
    const messageId = res.body?.[0]?.id;
    if (!messageId) return;
    navigateTo(guildId, channelId, messageId);
}

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
