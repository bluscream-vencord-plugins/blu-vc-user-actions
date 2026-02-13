import { NavigationRouter } from "@webpack/common";

export function navigateToChannel(channelId: string, guildId?: string) {
    NavigationRouter.transitionTo(`/channels/${guildId ?? "@me"}/${channelId}`);
}
