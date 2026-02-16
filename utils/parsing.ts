import { MemberChannelInfo } from "../state";
import { log } from "./logging";
import { BotResponse } from "./BotResponse";

export function parseBotInfoMessage(response: BotResponse): { info: MemberChannelInfo, channelId: string } | null {
    if (!response.embed) return null;
    const rawDescription = response.getRawDescription();

    const info: MemberChannelInfo = {
        permitted: [],
        banned: [],
        timestamp: response.timestamp,
        updated: Date.now(),
        ownerId: response.initiatorId
    };

    let targetChannelId = response.channelId;

    try {
        // Parse Channel ID from Description or Title
        const channelMatch = rawDescription.match(/<#(\d+)>/) ||
            rawDescription.match(/\*\*Channel ID:\*\* `(\d+)`/) ||
            ((response.embed as any).title || "").match(/<#(\d+)>/);
        if (channelMatch) targetChannelId = channelMatch[1];

        // Parse Name
        const nameMatch = rawDescription.match(/\*\*Name:\*\* (.*)/);
        if (nameMatch) info.name = nameMatch[1].trim();

        // Parse Limit
        const limitMatch = rawDescription.match(/\*\*Limit:\*\* (\d+)/);
        if (limitMatch) info.limit = parseInt(limitMatch[1]);

        // Parse Status
        const statusMatch = rawDescription.match(/\*\*Status:\*\* (.*)/);
        if (statusMatch) info.status = statusMatch[1].trim();

        // Parse Permitted and Banned users
        const lines = rawDescription.split("\n");
        let currentSection: "permitted" | "banned" | null = null;

        for (let line of lines) {
            line = line.trim();
            if (line.includes("**Permitted**")) {
                currentSection = "permitted";
                continue;
            } else if (line.includes("**Banned**")) {
                currentSection = "banned";
                continue;
            }

            if (currentSection && line.startsWith("> <@")) {
                const idMatch = line.match(/<@!?(\d+)>/);
                if (idMatch) {
                    if (currentSection === "permitted") {
                        info.permitted.push(idMatch[1]);
                    } else {
                        info.banned.push(idMatch[1]);
                    }
                }
            }
        }

        return { info, channelId: targetChannelId };
    } catch (e) {
        log("Error parsing channel info embed:", e);
        return null;
    }
}
