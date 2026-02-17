import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const blacklistSettings = {
    banCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to ban a user",
        default: "!v ban {user_id}",
        restartNeeded: false,
    },
    unbanCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to unban a user",
        default: "!v unban {user_id}",
        restartNeeded: false,
    },
    kickCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to kick a user",
        default: "!v kick {user_id}",
        restartNeeded: false,
    },
    banLimit: {
        type: OptionType.NUMBER as const,
        description: "Max number of bans allowed before rotation",
        default: 10,
        restartNeeded: false,
    },
    banRotateEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Enable ban rotation",
        default: false,
        restartNeeded: false,
    },
    banRotationMessage: {
        type: OptionType.STRING as const,
        description: "Message to show when ban rotation happens",
        default: "♻️ Rotating ban list: Unbanning <@{user_id_old}> to make room for <@{user_id}>",
        restartNeeded: false,
    },
    localUserBlacklist: {
        type: OptionType.STRING as const,
        description: "List of blacklisted User IDs (one per line)",
        default: "",
        multiline: true,
        restartNeeded: false,
    }
};
