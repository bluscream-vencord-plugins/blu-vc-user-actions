import { MemberChannelInfo } from "../state";
import { log } from "./logging";
import type { Message } from "@vencord/discord-types";

function getTimestamp(msg: any): number {
    const ts = msg.timestamp;
    if (!ts) return Date.now();
    if (typeof ts === 'string') return new Date(ts).getTime();
    // Assume Moment object if not string
    if (typeof ts.valueOf === 'function') return ts.valueOf();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    return Date.now();
}

export function parseBotInfoMessage(msg: Message): MemberChannelInfo | null {
    const embed = msg.embeds?.[0];
    const rawDescription = (embed as any)?.rawDescription || (embed as any)?.description;

    if (!rawDescription) {
        log("parseBotInfoMessage: No description found in embed");
        return null;
    }

    const timestamp = getTimestamp(msg);
    const info: MemberChannelInfo = {
        permitted: [],
        banned: [],
        timestamp,
        updated: Date.now()
    };

    try {
        // Parse Owner ID from Icon URL
        // "iconURL": "https://cdn.discordapp.com/avatars/{userid}/27bf3831f6ea82a2c717029d01dee3c8.png"
        const iconURL = embed?.author?.iconURL; // Check both camelCase and snake_case depending on library version
        if (iconURL) {
            const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
            if (userIdFromUrl) {
                info.ownerId = userIdFromUrl;
            }
        }

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
        // These are typically after the headers and listed with > <@id>
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
            } else if (line.length > 0 && !line.startsWith(">") && currentSection) {
                // If we hit a non-empty line that doesn't start with > and we were in a section,
                // we might have finished that section, but usually there's a double newline.
                // For now, let's just keep going unless it's another header.
            }
        }


        return info;
    } catch (e) {
        log("Error parsing channel info embed:", e);
        return null;
    }
}
