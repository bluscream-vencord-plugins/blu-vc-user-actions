import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const defaultSettings = definePluginSettings({
    guildId: { type: OptionType.STRING, description: "Guild ID", default: "505974446914535426", restartNeeded: false },
    categoryId: { type: OptionType.STRING, description: "Category ID", default: "763914042628112455", restartNeeded: false },
    creationChannelId: { type: OptionType.STRING, description: "Creation Channel ID", default: "763914043252801566", restartNeeded: false },
    botId: { type: OptionType.STRING, description: "Bot ID", default: "913852862990262282", restartNeeded: false },

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

    maxBans: { type: OptionType.SLIDER, description: "Max Bans", default: 5, markers: [1, 2, 3, 4, 5, 10, 20], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.maxBans = Math.round(v); } },
    actionDelayMs: { type: OptionType.SLIDER, description: "Action Delay (ms)", default: 2000, markers: [500, 1000, 2000, 5000], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.actionDelayMs = Math.round(v); } },
    namingIntervalMs: { type: OptionType.SLIDER, description: "Naming Interval (ms)", default: 11 * 60 * 1000, markers: [60000, 300000, 660000, 1800000], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.namingIntervalMs = Math.round(v); } },
    voteBanPercentage: { type: OptionType.SLIDER, description: "Vote Ban Percentage", default: 50, markers: [10, 25, 50, 75, 100], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanPercentage = Math.round(v); } },
    voteBanWindowMs: { type: OptionType.SLIDER, description: "Vote Ban Window (ms)", default: 5 * 60 * 1000, markers: [60000, 300000, 600000], restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanWindowMs = Math.round(v); } },
    commandCleanup: { type: OptionType.BOOLEAN, description: "Command Cleanup", default: true, restartNeeded: false }
});

export type PluginSettings = typeof defaultSettings.store;
