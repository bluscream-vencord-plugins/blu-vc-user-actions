import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const whitelistSettings = {
    whitelistSkipMessage: {
        type: OptionType.STRING as const,
        description: "Message to show when action is skipped due to whitelist",
        default: "🛡️ Skipping {action} for <@{user_id}> (Whitelisted)",
        restartNeeded: false,
    },
    localUserWhitelist: {
        type: OptionType.STRING as const,
        description: "List of whitelisted User IDs (one per line)", // Using multiline string for list?
        default: "",
        multiline: true,
        restartNeeded: false,
    }
};
