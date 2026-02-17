import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const queueSettings = {
    queueTime: {
        type: OptionType.SLIDER as const,
        description: "Time in ms to wait between actions",
        default: 1000,
        min: 500,
        max: 5000,
        markers: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000],
        stickToMarkers: false,
        restartNeeded: false,
    },
};
