import { Message } from "@vencord/discord-types";
import { MessageStore } from "@webpack/common";
import { findStoreLazy } from "@webpack";

const ReferencedMessageStore = findStoreLazy("ReferencedMessageStore") as any;

export enum BotResponseType {
    CREATED = "Channel Created",
    CLAIMED = "Channel Claimed",
    INFO = "Channel Settings",
    BANNED = "Banned",
    UNBANNED = "Unbanned",
    PERMITTED = "Permitted",
    UNPERMITTED = "Unpermitted",
    SIZE_SET = "Size Set",
    LOCKED = "Locked",
    UNLOCKED = "Unlocked",
    UNKNOWN = "Unknown"
}

interface EmbedAuthor {
    name?: string;
    icon_url?: string;
    iconURL?: string;
}

interface Embed {
    title?: string;
    description?: string;
    rawDescription?: string;
    author?: EmbedAuthor;
}

export class BotResponse {
    public type: BotResponseType = BotResponseType.UNKNOWN;
    public initiatorId?: string;
    public channelId: string;
    public timestamp: number;
    public embed: Embed | undefined;

    constructor(private msg: Message, private botId: string) {
        this.channelId = msg.channel_id;
        this.timestamp = msg.timestamp ? new Date(msg.timestamp as any).getTime() : Date.now();
        this.embed = msg.embeds?.[0] as Embed | undefined;

        if (msg.author.id === botId && this.embed) {
            this.parseType();
            this.initiatorId = this.findInitiatorId();
        }
    }

    private parseType() {
        if (!this.embed) return;

        const authorName = this.embed.author?.name?.toLowerCase() || "";
        const title = this.embed.title?.toLowerCase() || "";
        const description = this.getRawDescription().toLowerCase();

        const check = (str: string) => {
            const s = str.toLowerCase();
            return authorName.includes(s) || title.includes(s) || description.includes(s);
        };

        if (check("Channel Created")) this.type = BotResponseType.CREATED;
        else if (check("Channel Claimed")) this.type = BotResponseType.CLAIMED;
        else if (check("Channel Settings") || check("Channel Info Updated")) this.type = BotResponseType.INFO;
        else if (description.includes("__banned__")) this.type = BotResponseType.BANNED;
        else if (description.includes("__unbanned__")) this.type = BotResponseType.UNBANNED;
        else if (description.includes("__permitted")) this.type = BotResponseType.PERMITTED;
        else if (description.includes("__unpermitted")) this.type = BotResponseType.UNPERMITTED;
        else if (description.includes("__channel size__")) this.type = BotResponseType.SIZE_SET;
        else if (description.includes("__locked__")) this.type = BotResponseType.LOCKED;
        else if (description.includes("__unlocked__")) this.type = BotResponseType.UNLOCKED;
    }

    private findInitiatorId(): string | undefined {
        // 1. Mentions (Created)
        if (this.type === BotResponseType.CREATED) {
            const mentionedUser = this.msg.mentions?.[0];
            if (mentionedUser) return typeof mentionedUser === "string" ? mentionedUser : (mentionedUser as any).id;

            const contentMatch = this.msg.content?.match(/<@!?(\d+)>/);
            if (contentMatch) return contentMatch[1];

            const descMatch = this.getRawDescription().match(/<@!?(\d+)>/);
            if (descMatch) return descMatch[1];
        }

        // 2. Icon URL (Claimed/Info)
        const iconURL = this.embed?.author?.icon_url || this.embed?.author?.iconURL;
        if (iconURL) {
            const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
            if (userIdFromUrl) return userIdFromUrl;
        }

        // 3. Message Reference / Reply
        const refMessage = (this.msg as any).referenced_message;
        if (refMessage) {
            return refMessage.author?.id;
        }

        const ref = (this.msg as any).message_reference || (this.msg as any).messageReference;
        if (ref && ref.message_id) {
            try {
                const refData = ReferencedMessageStore?.getMessageByReference?.(ref);
                if (refData?.message) return refData.message.author?.id;
            } catch (e) { /* ignore */ }

            const cachedRef = MessageStore.getMessage(ref.channel_id || this.msg.channel_id, ref.message_id);
            if (cachedRef) return cachedRef.author?.id;
        }

        return undefined;
    }

    public isBot() {
        return this.msg.author.id === this.botId;
    }

    public getRawDescription(): string {
        return this.embed?.rawDescription || this.embed?.description || "";
    }
}
