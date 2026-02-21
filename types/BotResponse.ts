import { Message } from "@vencord/discord-types";
import { MessageStore } from "@webpack/common";
import { findStoreLazy } from "@webpack";

const ReferencedMessageStore = findStoreLazy("ReferencedMessageStore") as any;

/**
 * Categorizes the type of response received from the moderation bot.
 */
export enum BotResponseType {
    /** Bot confirmed channel creation */
    CREATED = "Channel Created",
    /** Bot confirmed channel claim */
    CLAIMED = "Channel Claimed",
    /** Bot sent channel settings information */
    INFO = "Channel Settings",
    /** Bot confirmed a user was banned */
    BANNED = "Banned",
    /** Bot confirmed a user was unbanned */
    UNBANNED = "Unbanned",
    /** Bot confirmed a user was permitted */
    PERMITTED = "Permitted",
    /** Bot confirmed a user was unpermitted */
    UNPERMITTED = "Unpermitted",
    /** Bot confirmed channel size was updated */
    SIZE_SET = "Size Set",
    /** Bot confirmed channel was locked */
    LOCKED = "Locked",
    /** Bot confirmed channel was unlocked */
    UNLOCKED = "Unlocked",
    /** Fallback for unrecognized bot responses */
    UNKNOWN = "Unknown"
}

/**
 * Deep-extracted author metadata from a Discord embed.
 */
interface EmbedAuthor {
    name?: string;
    icon_url?: string;
    iconURL?: string;
}

/**
 * Shallow representation of a Discord embed used for parsing.
 */
interface Embed {
    title?: string;
    description?: string;
    rawDescription?: string;
    author?: EmbedAuthor;
}

/**
 * Wrapper class representing a message authored by the target bot, enriched with parsed metadata.
 */
export class BotResponse {
    /** The categorized type of the bot's response */
    public type: BotResponseType = BotResponseType.UNKNOWN;
    /** The ID of the user who initiated the action */
    public initiatorId?: string;
    /** The ID of the user targeted by the action (e.g., banned user) */
    public targetId?: string;
    /** The ID of the channel where the response was sent */
    public channelId: string;
    /** Parsed timestamp of the message */
    public timestamp: number;
    /** The primary rich embed from the message, if any */
    public embed: Embed | undefined;

    constructor(private msg: Message, private botId: string) {
        this.channelId = msg.channel_id;
        this.timestamp = msg.timestamp ? new Date(msg.timestamp as any).getTime() : Date.now();
        this.embed = msg.embeds?.[0] as Embed | undefined;

        if (msg.author.id === botId) {
            this.parseType();
            this.initiatorId = this.findInitiatorId();
            this.targetId = this.findTargetId();
        }
    }

    private parseType() {
        const authorName = this.embed?.author?.name?.toLowerCase() || "";
        const title = this.embed?.title?.toLowerCase() || "";
        const description = this.getRawDescription().toLowerCase();
        const content = this.msg.content?.toLowerCase() || "";

        const check = (str: string) => {
            const s = str.toLowerCase();
            return authorName.includes(s) || title.includes(s) || description.includes(s) || content.includes(s);
        };

        if (title.includes("error") || authorName.includes("error")) {
            this.type = BotResponseType.UNKNOWN;
            return;
        }

        // Specific exclusions
        if (authorName.includes("voice help")) {
            this.type = BotResponseType.UNKNOWN;
            return;
        }

        if (check("Channel Created")) this.type = BotResponseType.CREATED;
        else if (check("Channel Claimed")) this.type = BotResponseType.CLAIMED;
        // Be more specific with Settings to avoid matching "View your channel settings" in Help text
        else if (authorName.includes("channel settings") || title.includes("channel settings") || check("Channel Info Updated")) this.type = BotResponseType.INFO;
        else if (title.includes("unbanned successfully") || authorName.includes("unbanned successfully") || description.includes("__unbanned__")) this.type = BotResponseType.UNBANNED;
        else if (title.includes("banned successfully") || authorName.includes("banned successfully") || description.includes("__banned__")) this.type = BotResponseType.BANNED;
        else if (title.includes("unpermitted successfully") || authorName.includes("unpermitted successfully") || description.includes("__unpermitted")) this.type = BotResponseType.UNPERMITTED;
        else if (title.includes("permitted successfully") || authorName.includes("permitted successfully") || description.includes("__permitted")) this.type = BotResponseType.PERMITTED;
        else if (description.includes("__channel size__") || check("size set")) this.type = BotResponseType.SIZE_SET;
        else if (check("unlocked") || description.includes("__unlocked__")) this.type = BotResponseType.UNLOCKED;
        else if (check("locked") || description.includes("__locked__")) this.type = BotResponseType.LOCKED;

        // logger.debug(`BotResponse: Parsed type ${this.type} from embed (Author: ${authorName}, Title: ${title})`);
    }

    private findInitiatorId(): string | undefined {
        // 1. Mentions (Created)
        if (this.type === BotResponseType.CREATED) {
            const mentionedUser = this.msg.mentions?.[0];
            // logger.debug(`BotResponse: findInitiatorId(CREATED) - Mentions: ${JSON.stringify(this.msg.mentions)}`);
            if (mentionedUser) return typeof mentionedUser === "string" ? mentionedUser : (mentionedUser as any).id;

            const contentMatch = this.msg.content?.match(/<@!?(\d+)>/);
            if (contentMatch) return contentMatch[1];

            const descMatch = this.getRawDescription().match(/<@!?(\d+)>/);
            if (descMatch) return descMatch[1];
        }

        // 2. Embed Fields (Author, Icon URL)
        const author = this.embed?.author;
        if (author) {
            // Check icon URL for user ID
            const iconURL = author.icon_url || author.iconURL;
            if (iconURL) {
                const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
                if (userIdFromUrl) return userIdFromUrl;
            }

            // Check author name for mentions if type is CREATED
            if (this.type === BotResponseType.CREATED && author.name) {
                const authorMatch = author.name.match(/<@!?(\d+)>/);
                if (authorMatch) return authorMatch[1];
            }
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

    private findTargetId(): string | undefined {
        if (
            this.type === BotResponseType.INFO ||
            this.type === BotResponseType.CREATED ||
            this.type === BotResponseType.SIZE_SET ||
            this.type === BotResponseType.LOCKED ||
            this.type === BotResponseType.UNLOCKED ||
            this.type === BotResponseType.CLAIMED
        ) {
            return undefined;
        }

        const rawDesc = this.getRawDescription();
        const content = this.msg.content || "";

        // Many action responses (Ban/Permit) mention the target in the description
        const descMatch = rawDesc.match(/<@!?(\d+)>/);
        if (descMatch) return descMatch[1];

        const contentMatch = content.match(/<@!?(\d+)>/);
        if (contentMatch) return contentMatch[1];

        // Also check if any raw mentions array is populated
        const mentions = this.msg.mentions;
        if (mentions && mentions.length > 0) {
            const mentionedUser = mentions[mentions.length - 1]; // Assume the last mention might be the target if initiator is first
            if (mentionedUser) return typeof mentionedUser === "string" ? mentionedUser : (mentionedUser as any).id;
        }

        // Fallback: If it's a raw username with an @ like "@meow"
        const usernameMatchDesc = rawDesc.match(/@([a-zA-Z0-9_\.]+)/);
        if (usernameMatchDesc) return `@${usernameMatchDesc[1]}`;

        const usernameMatchContent = content.match(/@([a-zA-Z0-9_\.]+)/);
        if (usernameMatchContent) return `@${usernameMatchContent[1]}`;

        return undefined;
    }

    /**
     * Checks if the underlying message was indeed sent by the configured bot.
     */
    public isBot() {
        return this.msg.author.id === this.botId;
    }

    /**
     * Extracts the raw description text from the embed, handling different field names.
     */
    public getRawDescription(): string {
        return this.embed?.rawDescription || this.embed?.description || "";
    }
}
