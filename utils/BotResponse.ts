import { Message } from "@vencord/discord-types";
import { MessageStore } from "@webpack/common";
import { findStoreLazy } from "@webpack";
const ReferencedMessageStore = findStoreLazy("ReferencedMessageStore");

export enum BotResponseType {
    CREATED = "Channel Created",
    CLAIMED = "Channel Claimed",
    INFO = "Channel Settings",
    UNKNOWN = "Unknown"
}

export class BotResponse {
    public type: BotResponseType = BotResponseType.UNKNOWN;
    public initiatorId?: string;
    public channelId: string;
    public timestamp: number;
    public embed: any;

    constructor(private msg: Message, private botId: string) {
        this.channelId = msg.channel_id;
        this.timestamp = msg.timestamp ? new Date(msg.timestamp as any).getTime() : Date.now();
        this.embed = msg.embeds?.[0];

        if (msg.author.id === botId && this.embed) {
            this.parseType();
            this.initiatorId = this.findInitiatorId();
        }
    }

    private parseType() {
        const authorName = this.embed.author?.name;
        if (authorName === "Channel Created") this.type = BotResponseType.CREATED;
        else if (authorName === "Channel Claimed") this.type = BotResponseType.CLAIMED;
        else if (authorName === "Channel Settings") this.type = BotResponseType.INFO;
    }

    private findInitiatorId(): string | undefined {
        // 1. Mentions (Created)
        if (this.type === BotResponseType.CREATED) {
            const mentionedUser = this.msg.mentions?.[0];
            if (mentionedUser) return typeof mentionedUser === "string" ? mentionedUser : (mentionedUser as any).id;
            const contentMatch = this.msg.content?.match(/<@!?(\d+)>/);
            if (contentMatch) return contentMatch[1];
        }

        // 2. Icon URL (Claimed/Info)
        const iconURL = this.embed.author?.iconURL || this.embed.author?.icon_url;
        if (iconURL) {
            const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
            if (userIdFromUrl) return userIdFromUrl;
        }

        // 3. Message Reference / Reply (ValidReply best practice)
        if ((this.msg as any).referenced_message) {
            return (this.msg as any).referenced_message.author?.id;
        }

        const ref = (this.msg as any).message_reference || (this.msg as any).messageReference;
        if (ref && ref.message_id) {
            const refData = (ReferencedMessageStore as any)?.getMessageByReference?.(ref);
            if (refData?.message) return refData.message.author?.id;

            const cachedRef = MessageStore.getMessage(ref.channel_id || this.msg.channel_id, ref.message_id);
            if (cachedRef) return cachedRef.author?.id;
        }

        return undefined;
    }

    public isBot() {
        return this.msg.author.id === this.botId;
    }

    public getRawDescription(): string {
        return (this.embed as any)?.rawDescription || (this.embed as any)?.description || "";
    }
}
