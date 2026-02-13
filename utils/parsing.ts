import { ChannelInfo } from "../state";
import { log } from "./logging";

export function parseBotInfoEmbed(rawDescription: string): ChannelInfo | null {
    if (!rawDescription) return null;

    const info: ChannelInfo = {
        permitted: [],
        banned: [],
        lastUpdated: Date.now()
    };

    try {
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

        log("Successfully parsed channel info:", info);
        return info;
    } catch (e) {
        log("Error parsing channel info embed:", e);
        return null;
    }
}
