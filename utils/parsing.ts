import { UserStore, VoiceStateStore, GuildMemberStore } from "@webpack/common";
import { User } from "@vencord/discord-types";

export type MemberLike = { userId?: string, id?: string, user?: { id: string } };

export function extractId(member: MemberLike | string): string {
    if (typeof member === "string") return member;
    return member.userId || member.user?.id || member.id || "";
}

/**
 * Searches the voice channel for users matching the query (ID, mention, or partial name).
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
