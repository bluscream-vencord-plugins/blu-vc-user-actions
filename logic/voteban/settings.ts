import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const votebanSettings = {
    voteBanEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Enable vote ban system",
        default: false,
        restartNeeded: false,
    },
    voteRequiredPercent: {
        type: OptionType.SLIDER as const,
        description: "Percentage of users required to vote ban someone (excludes owner)",
        default: 51,
        min: 1,
        max: 100,
        markers: [1, 25, 50, 75, 100],
        stickToMarkers: false,
        restartNeeded: false,
    },
    voteExpireMinutes: {
        type: OptionType.NUMBER as const,
        description: "Time before a vote expires in minutes",
        default: 15,
        min: 1,
        max: 300,
        restartNeeded: false,
    },
    voteSubmittedMessage: {
        type: OptionType.STRING as const,
        description: "Ephemeral message to show when a vote is submitted",
        default: "⚠️ <@{user_id}> votes to ban <@{target_user_id}> (Expires <t:{expires}:R>)",
        restartNeeded: false,
    },
    voteBanCommand: {
        type: OptionType.STRING as const,
        description: "Regex Pattern to parse for vote ban system",
        default: "^!vote ban (.*)$",
        restartNeeded: false,
    },
};
