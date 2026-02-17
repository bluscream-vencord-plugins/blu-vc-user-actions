import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const kickNotInRoleSettings = {
    kickNotInRoleEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Enable kicking users who don't have the required role",
        default: false,
        restartNeeded: false,
    },
    kickNotInRole: {
        type: OptionType.STRING as const,
        description: "Role ID required to stay in the channel",
        default: "",
        restartNeeded: false,
    },
    kickNotInRoleMessage: {
        type: OptionType.STRING as const,
        description: "Ephemeral message to send to user before kicking",
        default: "⚠️ You were kicked from <#{channel_id}> because you are missing the required role.",
        restartNeeded: false,
    },
    kickNotInRoleMessageExternal: {
        type: OptionType.STRING as const,
        description: "External message to send to channel before kicking",
        default: "⚠️ Kicking <@{user_id}> for missing required role.",
        restartNeeded: false,
    },
    kickNotInRoleMessageExternalEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Enable external kick message",
        default: false,
        restartNeeded: false,
    },
};
