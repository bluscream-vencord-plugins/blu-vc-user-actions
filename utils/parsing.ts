import { UserStore, VoiceStateStore, GuildMemberStore } from "@webpack/common";
import { User } from "@vencord/discord-types";
import { MemberChannelInfo } from "../types/state";
import { BotResponse } from "../types/BotResponse";

/**
 * Represents a type that can be treated as a member, providing various ways to access a user ID.
 */
export type MemberLike = { userId?: string, id?: string, user?: { id: string } };

/**
 * Normalizes a member object or string into a plain user ID string.
 * @param member The member object or string ID
 * @returns The extracted user ID
 */
export function extractId(member: MemberLike | string): string {
    if (typeof member === "string") return member;
    return member.userId || member.user?.id || member.id || "";
}

/**
 * Searches for a user in a specific voice channel by mention, ID, or partial name match.
 * @param input The search query string
 * @param channelId The ID of the voice channel to search in
 * @returns The ID of the matching user, or undefined if no unique match found
 */
export function parseVoiceUserFromInput(input: string, channelId: string): string | undefined {
    if (!input || !channelId) return undefined;

    // 1. Direct Mention Regex: <@123> or <@!123>
    const mentionMatch = input.match(/<@!?(\d+)>/);
    if (mentionMatch) {
        return mentionMatch[1];
    }

    // 2. Direct User ID
    const isId = /^\d{17,20}$/.test(input.trim());
    if (isId) {
        return input.trim();
    }

    // 3. Partial Name Matching within the specific Voice Channel
    const searchString = input.trim().toLowerCase();

    // Get all users currently in this voice channel
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
    if (!voiceStates) return undefined;

    for (const userId in voiceStates) {
        const user = UserStore.getUser(userId) as User | undefined;
        if (!user) continue;

        const vs = voiceStates[userId];
        const guildId = vs?.guildId;
        if (!guildId) continue;

        const member = GuildMemberStore.getMember(guildId, userId);

        // Check against Username, Global Name, or Guild Nickname
        const username = user.username?.toLowerCase() || "";
        const globalName = user.globalName?.toLowerCase() || "";
        const nickname = member?.nick?.toLowerCase() || "";

        if (
            username.includes(searchString) ||
            globalName.includes(searchString) ||
            nickname.includes(searchString)
        ) {
            return userId; // Return the first match we find
        }
    }

    return undefined; // No matches found
}

const Patterns = {
    CHANNEL_ID: [
        /<#(\d+)>/,
        /\*\*Channel ID:\*\* `(\d+)`/,
    ],
    NAME: /\*\*Name:\*\* (.*)/,
    LIMIT: /\*\*Limit:\*\* (\d+)/,
    STATUS: /\*\*Status:\*\* (.*)/,
    PERMITTED_HEADER: /\*\*Permitted\*\*/,
    BANNED_HEADER: /\*\*Banned\*\*/,
    USER_MENTION: /<@!?(\d+)>/
};

/**
 * Parses a rich embed message from the moderation bot to extract channel ownership and status information.
 * @param response The bot response object containing the embed
 * @returns The parsed channel info and target channel ID, or null if parsing failed
 */
export function parseBotInfoMessage(response: BotResponse): { info: MemberChannelInfo, channelId: string } | null {
    if (!response.embed) return null;
    const rawDescription = response.getRawDescription();

    const info: MemberChannelInfo = {
        userId: response.initiatorId || "",
        isLocked: false,
        customName: null,
        userLimit: null,
        bannedUsers: [],
        permittedUsers: [],
    };

    let targetChannelId = response.channelId;

    try {
        // Parse Channel ID
        for (const pattern of Patterns.CHANNEL_ID) {
            const match = rawDescription.match(pattern) || (response.embed.title || "").match(pattern);
            if (match) {
                targetChannelId = match[1];
                break;
            }
        }

        // Parse fields
        const nameMatch = rawDescription.match(Patterns.NAME);
        if (nameMatch) info.customName = nameMatch[1].trim();

        const limitMatch = rawDescription.match(Patterns.LIMIT);
        if (limitMatch) info.userLimit = parseInt(limitMatch[1]);

        const statusMatch = rawDescription.match(Patterns.STATUS);
        if (statusMatch) info.isLocked = statusMatch[1].toLowerCase().includes("locked");

        // Parse lists (Permitted / Banned)
        const lines = rawDescription.split("\n");
        let currentSection: "permitted" | "banned" | null = null;

        for (let line of lines) {
            line = line.trim();
            if (Patterns.PERMITTED_HEADER.test(line)) {
                currentSection = "permitted";
                continue;
            } else if (Patterns.BANNED_HEADER.test(line)) {
                currentSection = "banned";
                continue;
            }

            if (currentSection && line.startsWith(">")) {
                const idMatch = line.match(Patterns.USER_MENTION);
                if (idMatch) {
                    if (currentSection === "permitted") info.permittedUsers.push(idMatch[1]);
                    else info.bannedUsers.push(idMatch[1]);
                }
            }
        }

        return { info, channelId: targetChannelId };
    } catch (e) {
        return null;
    }
}
