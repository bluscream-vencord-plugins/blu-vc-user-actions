import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const permitSettings = {
    permitCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to permit a user",
        default: "!v permit {user_id}",
        restartNeeded: false,
    },
    unpermitCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to unpermit a user",
        default: "!v unpermit {user_id}",
        restartNeeded: false,
    },
    permitLimit: {
        type: OptionType.NUMBER as const,
        description: "Max number of permits allowed before rotation",
        default: 10,
        restartNeeded: false,
    },
    permitRotateEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Enable permit rotation",
        default: false,
        restartNeeded: false,
    },
};
