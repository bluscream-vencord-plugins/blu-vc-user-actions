import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const channelClaimSettings = {
    ownershipChangeNotificationAny: {
        type: OptionType.BOOLEAN as const,
        description: "Show notification for any channel ownership change",
        default: false,
        restartNeeded: false,
    },
    autoClaimDisbanded: {
        type: OptionType.BOOLEAN as const,
        description: "Automatically claim the channel you're in when its owner leaves",
        default: false,
        restartNeeded: false,
    },
    autoNavigateToOwnedChannel: {
        type: OptionType.BOOLEAN as const,
        description: "Automatically navigate to the channel you own",
        default: true,
        restartNeeded: false,
    },
    fetchOwnersOnStartup: {
        type: OptionType.BOOLEAN as const,
        description: "Fetch all owners in the category on startup",
        default: false,
        restartNeeded: false,
    },
    showChannelInfoChangeMessage: {
        type: OptionType.BOOLEAN as const,
        description: "Causes a message to be sent to the channel when the channel info changes",
        default: false,
        restartNeeded: false,
    },
    ownershipChangeMessage: {
        type: OptionType.STRING as const,
        description: "Message to show when ownership is detected",
        default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})",
        restartNeeded: false,
    },
    claimCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to claim a channel",
        default: "!v claim",
        restartNeeded: false,
    },
    infoCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to get channel info",
        default: "!v info",
        restartNeeded: false,
    },
    setChannelUserLimitCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to set a channel limit",
        default: "!v size {channel_limit}",
        restartNeeded: false,
    },
    lockCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to lock a channel",
        default: "!v lock",
        restartNeeded: false,
    },
    unlockCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to unlock a channel",
        default: "!v unlock",
        restartNeeded: false,
    },
    resetCommand: {
        type: OptionType.STRING as const,
        description: "Message to send to reset channel settings",
        default: "!v reset",
        restartNeeded: false,
    },
};
