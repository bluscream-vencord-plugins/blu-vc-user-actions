import type { Message } from "@vencord/discord-types";

export interface MessageCreatePayload {
    channelId: string;
    guildId: string;
    message: Message;
    optimistic?: boolean;
}
