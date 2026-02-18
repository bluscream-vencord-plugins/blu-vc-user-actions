import { MemberChannelInfo } from "../state";
import { log, error } from "./logging";
import { BotResponse, BotResponseType } from "../types/BotResponse";

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

export function parseBotInfoMessage(response: BotResponse): { info: MemberChannelInfo, channelId: string } | null {
    if (!response.embed) return null;
    const rawDescription = response.getRawDescription();

    const info: MemberChannelInfo = {
        permitted: [],
        banned: [],
        timestamp: response.timestamp,
        updated: Date.now(),
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
        if (nameMatch) info.name = nameMatch[1].trim();

        const limitMatch = rawDescription.match(Patterns.LIMIT);
        if (limitMatch) info.limit = parseInt(limitMatch[1]);

        const statusMatch = rawDescription.match(Patterns.STATUS);
        if (statusMatch) info.status = statusMatch[1].trim();

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
                    if (currentSection === "permitted") info.permitted.push(idMatch[1]);
                    else info.banned.push(idMatch[1]);
                }
            }
        }

        return { info, channelId: targetChannelId };
    } catch (e) {
        error("[Parsing] Error extracting info from embed:", e);
        return null;
    }
}
