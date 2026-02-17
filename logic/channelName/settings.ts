import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { state } from "../../state";

export const channelNameSettings = {
    rotateChannelNames: {
        type: OptionType.STRING as const,
        description: "List of channel names to rotate through (one per line)",
        default: "General\nGaming\nMusic\nChilling",
        multiline: true,
        restartNeeded: false,
        onChange: state.onRotationSettingsChange
    },
    rotateChannelNamesTime: {
        type: OptionType.NUMBER as const,
        description: "Interval in minutes for channel name rotation",
        default: 30,
        restartNeeded: false,
        onChange: state.onRotationSettingsChange
    },
    rotateChannelNamesEnabled: {
        type: OptionType.BOOLEAN as const,
        description: "Enable channel name rotation",
        default: false,
        restartNeeded: false,
        onChange: state.onRotationSettingsChange
    },
    setChannelNameCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to set channel name",
        default: "!v name {channel_name_new}",
        restartNeeded: false,
    },
};
