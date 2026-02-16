import { NavigationRouter } from "@webpack/common";

export function navigateTo(guildId: string = "@me", channelId: string = "", messageId: string = "") {
    let path = "/channels";
    if (guildId) path += `/${guildId}`;
    if (channelId) path += `/${channelId}`;
    if (messageId) path += `/${messageId}`;
    NavigationRouter.transitionTo(path);
}
