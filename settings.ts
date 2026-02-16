import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable Plugin",
        default: true,
        restartNeeded: false,
    },
    guildId: {
        type: OptionType.STRING,
        description: "Guild ID",
        default: "1336453916298641520",
        restartNeeded: false,
    },
    categoryId: {
        type: OptionType.STRING,
        description: "Category ID",
        default: "1339023477124300941",
        restartNeeded: false,
    },
    botId: {
        type: OptionType.STRING,
        description: "Bot ID",
        default: "1339023588974067742",
        restartNeeded: false,
    },
    infoCommand: {
        type: OptionType.STRING,
        description: "Command to fetch channel info",
        default: "!v info",
        restartNeeded: false,
    },
    claimCommand: {
        type: OptionType.STRING,
        description: "Command to claim channel",
        default: "!v claim {channel_id}",
        restartNeeded: false,
    },
    setChannelNameCommand: {
        type: OptionType.STRING,
        description: "Command to set channel name",
        default: "!v name {channel_id} {name}",
        restartNeeded: false,
    },
    kickCommand: {
        type: OptionType.STRING,
        description: "Command to kick user",
        default: "!v kick {user_id}",
        restartNeeded: false,
    },
    banCommand: {
        type: OptionType.STRING,
        description: "Command to ban user",
        default: "!v ban {user_id}",
        restartNeeded: false,
    },
    unbanCommand: {
        type: OptionType.STRING,
        description: "Command to unban user",
        default: "!v unban {user_id}",
        restartNeeded: false,
    },
    autoKickEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable Auto-Kick from local ban list",
        default: true,
        restartNeeded: false,
    },
    queueTime: {
        type: OptionType.NUMBER,
        description: "Queue Time (ms) between actions",
        default: 1000,
        restartNeeded: false,
    },
    kickNotInRole: {
        type: OptionType.STRING,
        description: "Role ID required to stay in the channel (Auto-Kick if missing)",
        default: "",
        restartNeeded: false,
    },
    ownershipChangeMessage: {
        type: OptionType.STRING,
        description: "Message to send when ownership changes",
        default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})",
        restartNeeded: false,
    },
    ownershipChangeNotificationAny: {
        type: OptionType.BOOLEAN,
        description: "Show toast notification for ANY ownership change",
        default: false,
        restartNeeded: false,
    },
    showChannelInfoChangeMessage: {
        type: OptionType.BOOLEAN,
        description: "Show ephemeral message when channel info updates",
        default: true,
        restartNeeded: false,
    },
    banRotateEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable Ban Rotation (Unban oldest when banning new if slot needed)",
        default: false,
        restartNeeded: false,
    },
    banRotationMessage: {
        type: OptionType.STRING,
        description: "Message to send when ban rotation occurs",
        default: "🔄 Unbanned <@{unbanned_id}> to make room for <@{banned_id}>",
        restartNeeded: false,
    },
    rotateChannelNamesEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable Channel Name Rotation",
        default: false,
        restartNeeded: false,
    },
    rotateChannelNamesTime: {
        type: OptionType.NUMBER,
        description: "Time in minutes between name rotations (Min 11)",
        default: 15,
        restartNeeded: false,
    },
    rotateChannelNames: {
        type: OptionType.STRING,
        description: "Comma-separated list of names to rotate",
        default: "General, Lounge, Music, Gaming", // Default example
        restartNeeded: false,
    },
    fetchOwnersOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Fetch all channel owners on startup (Category only)",
        default: true,
        restartNeeded: false,
    },
    autoClaimDisbanded: {
        type: OptionType.BOOLEAN,
        description: "Auto-claim disbanded channels (Owner left & empty) if I am the owner",
        default: true, // "Fix: if owner leaves and i claim manually or via plugin, make sure it knows i claimed" -> Helps keep state in sync
        restartNeeded: false,
    },
    autoClaimDisbandedAny: {
        type: OptionType.BOOLEAN,
        description: "Auto-claim ANY disbanded channel (Owner left & empty)",
        default: false,
        restartNeeded: false,
    },
    autoNavigateToOwnedChannel: {
        type: OptionType.BOOLEAN,
        description: "Auto-navigate to channel when I become owner",
        default: true,
        restartNeeded: false,
    },
});
