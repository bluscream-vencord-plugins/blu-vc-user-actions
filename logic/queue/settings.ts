import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const queueSettings = {
    queueTime: {
        type: OptionType.NUMBER as const,
        description: "Time in ms to wait between actions",
        default: 1000,
        restartNeeded: false,
    },
};
