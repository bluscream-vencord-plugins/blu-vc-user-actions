import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export enum RequiredRoleMode {
    ALL = "All",
    ANY = "Any",
    NONE = "None"
}

export const defaultSettings = definePluginSettings({

    // ── Channel Claiming / Ownership ──────────────────────────────────────
    ownershipChangeMessage: { type: OptionType.STRING, description: "Message sent when ownership changes (supports {reason}, {channel_id}, {channel_name}, {guild_id}, {guild_name}, {user_id}, {user_name})", default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})", restartNeeded: false },

    // ── Channel Name Rotation ─────────────────────────────────────────────
    channelNameRotationEnabled: { type: OptionType.BOOLEAN, description: "Enable Channel Name Rotation", default: true, restartNeeded: false },
    channelNameRotationNames: { type: OptionType.STRING, description: "Channel name rotation list (one per line)", default: "", multiline: true, restartNeeded: false },
    channelNameRotationInterval: { type: OptionType.SLIDER, description: "Channel Name Rotation Interval (minutes)", default: 11, markers: [11, 15, 30, 60], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.channelNameRotationInterval = Math.max(11, Math.round(v)); } },

    // ── Banning ───────────────────────────────────────────────────────────
    banLimit: { type: OptionType.SLIDER, description: "Max users in ban list before rotation", default: 10, markers: [5, 10, 20, 50], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.banLimit = Math.round(v); } },
    banRotateEnabled: { type: OptionType.BOOLEAN, description: "Automatically unpermit oldest ban when limit is reached", default: true, restartNeeded: false },
    banRotateCooldown: { type: OptionType.NUMBER, description: "Minimum seconds before re-kicking a user (0 = infinite)", default: 0, restartNeeded: false },
    banRotationMessage: { type: OptionType.STRING, description: "Message sent on ban rotation (supports {user_id}, {user_id_new})", default: "♻️ Ban rotated: <@{user_id}> was unbanned to make room for <@{user_id_new}>", restartNeeded: false },
    banInLocalBlacklist: { type: OptionType.BOOLEAN, description: "Auto-kick/ban users in the local blacklist", default: true, restartNeeded: false },
    banBlockedUsers: { type: OptionType.BOOLEAN, description: "Auto-kick/ban users you have blocked", default: true, restartNeeded: false },
    localUserBlacklist: { type: OptionType.STRING, description: "Local ban list — user IDs to auto-kick (one per line)", default: "", multiline: true, restartNeeded: false },

    // ── Whitelisting (exclude from auto-actions) ──────────────────────────
    localUserWhitelist: { type: OptionType.STRING, description: "Local whitelist — user IDs to exclude from auto-actions (one per line)", default: "", multiline: true, restartNeeded: false },
    whitelistSkipMessage: { type: OptionType.STRING, description: "Message sent when skipping an action for a whitelisted user (supports {action}, {user_id}, {user_name})", default: "⚪ Whitelist: Skipping {action} for <@{user_id}> ({user_name})", restartNeeded: false },

    // ── Role Enforcement ──────────────────────────────────────────────────
    banNotInRoles: { type: OptionType.BOOLEAN, description: "Auto-kick/ban users missing required roles", default: true, restartNeeded: false },
    requiredRoleIds: { type: OptionType.STRING, description: "Required role IDs — users missing these are auto-kicked (one per line)", default: "", multiline: true, restartNeeded: false },
    requiredRoleMode: {
        type: OptionType.SELECT,
        description: "How to match roles?",
        options: [
            { label: "Must have ALL of the roles (All)", value: RequiredRoleMode.ALL },
            { label: "Must have at least one of the roles (Any)", value: RequiredRoleMode.ANY, default: true },
            { label: "Must NOT have any of the roles (None)", value: RequiredRoleMode.NONE }
        ]
    },

    // ── Vote Banning ──────────────────────────────────────────────────────
    voteBanCommandString: { type: OptionType.STRING, description: "Command users type to vote-ban someone (e.g. !vote ban {user})", default: "!vote ban {user}", restartNeeded: false },
    voteBanRegex: { type: OptionType.STRING, description: "Regex to detect vote-ban commands (named groups: target, reason)", default: "^(?:!vote\\s+ban)\\s+<@!?(?<target>\\d+)>(?:\\s+(?<reason>.*))?", restartNeeded: false },
    voteBanPercentage: { type: OptionType.SLIDER, description: "Percentage of channel occupants required to pass a vote ban", default: 50, markers: [10, 25, 50, 75, 100], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanPercentage = Math.round(v); } },
    voteBanWindowSecs: { type: OptionType.SLIDER, description: "Seconds a vote-ban stays open before expiring", default: 5 * 60, markers: [30, 60, 120, 300, 600, 1800], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.voteBanWindowSecs = Math.round(v); } },

    // ── Permitting ────────────────────────────────────────────────────────
    permitLimit: { type: OptionType.SLIDER, description: "Max users in permit list before rotation", default: 10, markers: [5, 10, 20, 50], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.permitLimit = Math.round(v); } },
    permitRotateEnabled: { type: OptionType.BOOLEAN, description: "Automatically unpermit oldest entry when permit limit is reached", default: false, restartNeeded: false },
    permitRotationMessage: { type: OptionType.STRING, description: "Message sent on permit rotation (supports {user_id}, {user_id_new})", default: "♻️ Permit rotated: <@{user_id}> was unpermitted to make room for <@{user_id_new}>", restartNeeded: false },

    // ── Action Queue ──────────────────────────────────────────────────────
    queueEnabled: { type: OptionType.BOOLEAN, description: "Enable Action Queue", default: true, restartNeeded: false },
    queueInterval: { type: OptionType.SLIDER, description: "Action Queue Interval (seconds)", default: 2, markers: [1, 2, 5, 10], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { defaultSettings.store.queueInterval = Math.round(v); } },
    commandCleanup: { type: OptionType.BOOLEAN, description: "Delete command messages automatically after sending", default: true, restartNeeded: false },

    // ── Commands ──────────────────────────────────────────────────────────
    claimCommand: { type: OptionType.STRING, description: "Claim Channel Command", default: "!v claim", restartNeeded: false },
    lockCommand: { type: OptionType.STRING, description: "Lock Channel Command", default: "!v lock", restartNeeded: false },
    unlockCommand: { type: OptionType.STRING, description: "Unlock Channel Command", default: "!v unlock", restartNeeded: false },
    resetCommand: { type: OptionType.STRING, description: "Reset Channel Command", default: "!v reset", restartNeeded: false },
    infoCommand: { type: OptionType.STRING, description: "Info Command Template", default: "!v info", restartNeeded: false },
    setSizeCommand: { type: OptionType.STRING, description: "Set Size Command Template (use {size})", default: "!v setsize {size}", restartNeeded: false },
    setChannelNameCommand: { type: OptionType.STRING, description: "Set Channel Name Command (use {channel_name_new})", default: "!v name {channel_name_new}", restartNeeded: false },
    kickCommand: { type: OptionType.STRING, description: "Kick Command Template (use {user_id})", default: "!v kick {user_id}", restartNeeded: false },
    banCommand: { type: OptionType.STRING, description: "Ban Command Template (use {user_id})", default: "!v ban {user_id}", restartNeeded: false },
    unbanCommand: { type: OptionType.STRING, description: "Unban Command Template (use {user_id})", default: "!v unban {user_id}", restartNeeded: false },
    permitCommand: { type: OptionType.STRING, description: "Permit Command Template (use {user_id})", default: "!v permit {user_id}", restartNeeded: false },
    unpermitCommand: { type: OptionType.STRING, description: "Unpermit Command Template (use {user_id})", default: "!v unpermit {user_id}", restartNeeded: false },

    // ── Core ──────────────────────────────────────────────────────────────
    guildId: { type: OptionType.STRING, description: "Guild ID", default: "505974446914535426", restartNeeded: false },
    categoryId: { type: OptionType.STRING, description: "Category ID", default: "763914042628112455", restartNeeded: false },
    creationChannelId: { type: OptionType.STRING, description: "Creation Channel ID", default: "763914043252801566", restartNeeded: false },
    botId: { type: OptionType.STRING, description: "Bot ID", default: "913852862990262282", restartNeeded: false },
    enableDebug: { type: OptionType.BOOLEAN, description: "Display Debug Messages (Ephemeral)", default: false, restartNeeded: false },
});

export type PluginSettings = typeof defaultSettings.store;
