import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const defaultSettings = definePluginSettings({
    guildId: { type: OptionType.STRING, description: "Guild ID", default: "505974446914535426", restartNeeded: false },
    categoryId: { type: OptionType.STRING, description: "Category ID", default: "763914042628112455", restartNeeded: false },
    creationChannelId: { type: OptionType.STRING, description: "Creation Channel ID", default: "763914043252801566", restartNeeded: false },
    botId: { type: OptionType.STRING, description: "Bot ID", default: "913852862990262282", restartNeeded: false },
    enableDebug: { type: OptionType.BOOLEAN, description: "Display Debug Messages (Ephemeral)", default: false, restartNeeded: false },

    claimCommand: { type: OptionType.STRING, description: "Claim Command Template", default: "!v claim", restartNeeded: false },
    infoCommand: { type: OptionType.STRING, description: "Info Command Template", default: "!v info", restartNeeded: false },
    setSizeCommand: { type: OptionType.STRING, description: "Set Size Command Template", default: "!v setsize {size}", restartNeeded: false },
    lockCommand: { type: OptionType.STRING, description: "Lock Command Template", default: "!v lock", restartNeeded: false },
    unlockCommand: { type: OptionType.STRING, description: "Unlock Command Template", default: "!v unlock", restartNeeded: false },
    resetCommand: { type: OptionType.STRING, description: "Reset Command Template", default: "!v reset", restartNeeded: false },
    kickCommand: { type: OptionType.STRING, description: "Kick Command Template", default: "!v kick {user}", restartNeeded: false },
    banCommand: { type: OptionType.STRING, description: "Ban Command Template", default: "!v ban {user}", restartNeeded: false },
    unbanCommand: { type: OptionType.STRING, description: "Unban Command Template", default: "!v unban {user}", restartNeeded: false },
    permitCommand: { type: OptionType.STRING, description: "Permit Command Template", default: "!v permit {user}", restartNeeded: false },
    unpermitCommand: { type: OptionType.STRING, description: "Unpermit Command Template", default: "!v unpermit {user}", restartNeeded: false },
    renameCommand: { type: OptionType.STRING, description: "Rename Command Template", default: "!v rename {name}", restartNeeded: false },

    voteBanCommandString: { type: OptionType.STRING, description: "VoteBan Command Template (e.g., !vote ban {user})", default: "!vote ban {user}", restartNeeded: false },

    channelNameRotationInterval: { type: OptionType.SLIDER, description: "Channel Name Rotation Interval (seconds)", default: 11 * 60, markers: [60, 300, 600, 1800], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.channelNameRotationInterval = Math.round(v); } },
    queueInterval: { type: OptionType.SLIDER, description: "Action Queue Interval (seconds)", default: 2, markers: [1, 2, 5, 10], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.queueInterval = Math.round(v); } },
    queueEnabled: { type: OptionType.BOOLEAN, description: "Enable Action Queue", default: true, restartNeeded: false },

    voteBanPercentage: { type: OptionType.SLIDER, description: "Vote Ban Percentage", default: 50, markers: [10, 25, 50, 75, 100], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanPercentage = Math.round(v); } },
    voteBanWindowMs: { type: OptionType.SLIDER, description: "Vote Ban Window (ms)", default: 5 * 60 * 1000, markers: [60000, 300000, 600000], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanWindowMs = Math.round(v); } },
    commandCleanup: { type: OptionType.BOOLEAN, description: "Command Cleanup", default: true, restartNeeded: false },

    // Feature: Channel Claiming
    ownershipChangeMessage: { type: OptionType.STRING, description: "Ownership Change Message", default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})", restartNeeded: false },

    // Feature: Blacklisting & Banning
    banLimit: { type: OptionType.SLIDER, description: "Ban Pool Limit", default: 10, markers: [5, 10, 20], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.banLimit = Math.round(v); } },
    banRotateEnabled: { type: OptionType.BOOLEAN, description: "Enable Ban Rotation", default: true, restartNeeded: false },
    banRotationMessage: { type: OptionType.STRING, description: "Ban Rotation Message", default: "♻️ Ban rotated: <@{user_id}> was unbanned to make room for <@{user_id_new}>", restartNeeded: false },
    banRotateCooldown: { type: OptionType.NUMBER, description: "Ban Rotation Cooldown (s) (0=infinite)", default: 0, restartNeeded: false },
    localUserBlacklist: { type: OptionType.STRING, description: "Local User Blacklist (one ID per line)", default: "", multiline: true, restartNeeded: false },
    banInLocalBlacklist: { type: OptionType.BOOLEAN, description: "Ban Users in Local Blacklist", default: true, restartNeeded: false },
    banBlockedUsers: { type: OptionType.BOOLEAN, description: "Ban Blocked Users", default: true, restartNeeded: false },
    banNotInRoles: { type: OptionType.BOOLEAN, description: "Ban Users without Required Roles", default: true, restartNeeded: false },

    // Feature: Whitelisting
    whitelistSkipMessage: { type: OptionType.STRING, description: "Whitelist Skip Message", default: "⚪ Whitelist: Skipping {action} for <@{user_id}> ({user_name})", restartNeeded: false },
    localUserWhitelist: { type: OptionType.STRING, description: "Local User Whitelist (one ID per line)", default: "", multiline: true, restartNeeded: false },

    // Feature: Roles
    enforceRequiredRoles: { type: OptionType.BOOLEAN, description: "Enforce Required Roles", default: false, restartNeeded: false },
    requiredRoleIds: { type: OptionType.STRING, description: "Required Role IDs (one ID per line)", default: "", multiline: true, restartNeeded: false }
});

export type PluginSettings = typeof defaultSettings.store;
