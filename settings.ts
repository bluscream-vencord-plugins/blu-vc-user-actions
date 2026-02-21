import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { actionQueueSettings } from "./utils/actionQueue";
// --- Module Settings Imports ---
import { banSettings } from "./modules/bans";
import { whitelistSettings } from "./modules/whitelist";
import { blacklistSettings } from "./modules/blacklist";
import { channelNameRotationSettings } from "./modules/channelNameRotation";
import { roleEnforcementSettings } from "./modules/roleEnforcement";
import { voteBanningSettings } from "./modules/voteBanning";
import { commandCleanupSettings } from "./modules/commandCleanup";
import { remoteOperatorsSettings } from "./modules/remoteOperators";
import { ownershipSettings } from "./modules/ownership";
import { autoClaimSettings } from "./modules/autoClaim";

export const coreSettings = {
    // ── Commands ──────────────────────────────────────────────────────────
    claimCommand: { type: OptionType.STRING, description: "Claim Channel Command", default: "!v claim", restartNeeded: false },
    lockCommand: { type: OptionType.STRING, description: "Lock Channel Command", default: "!v lock", restartNeeded: false },
    unlockCommand: { type: OptionType.STRING, description: "Unlock Channel Command", default: "!v unlock", restartNeeded: false },
    resetCommand: { type: OptionType.STRING, description: "Reset Channel Command", default: "!v reset", restartNeeded: false },
    infoCommand: { type: OptionType.STRING, description: "Info Command Template", default: "!v info", restartNeeded: false },
    setSizeCommand: { type: OptionType.STRING, description: "Set Size Command Template (use {size})", default: "!v size {size}", restartNeeded: false },
    setChannelNameCommand: { type: OptionType.STRING, description: "Set Channel Name Command (use {channel_name_new})", default: "!v name {channel_name_new}", restartNeeded: false },
    kickCommand: { type: OptionType.STRING, description: "Kick Command Template (use {user_id})", default: "!v kick {user_id}", restartNeeded: false },
    banCommand: { type: OptionType.STRING, description: "Ban Command Template (use {user_id})", default: "!v ban {user_id}", restartNeeded: false },
    unbanCommand: { type: OptionType.STRING, description: "Unban Command Template (use {user_id})", default: "!v unban {user_id}", restartNeeded: false },
    permitCommand: { type: OptionType.STRING, description: "Permit Command Template (use {user_id})", default: "!v permit {user_id}", restartNeeded: false },
    unpermitCommand: { type: OptionType.STRING, description: "Unpermit Command Template (use {user_id})", default: "!v unpermit {user_id}", restartNeeded: false },

    // ── Ephemeral Author Settings ─────────────────────────────────────────
    ephemeralAuthorName: { type: OptionType.STRING, description: "Author name for bot messages (displayed as the sender). Variables: {username}=username, {displayname}=display name, {userid}=user ID", default: "Socialize Voice [!]", placeholder: "Clyde or {username}", restartNeeded: false, },
    ephemeralAuthorIconUrl: { type: OptionType.STRING, description: "Author icon URL for bot messages (leave empty for default). Variables: {username}=username, {displayname}=display name, {userid}=user ID, {avatar}=avatar URL", default: "https://cdn.discordapp.com/avatars/913852862990262282/6cef25d3cdfad395b26e32260da0b320.webp?size=1024", placeholder: "https://example.com/avatar.png or {avatar}", restartNeeded: false, },

    // ── Core Settings ─────────────────────────────────────────────────────
    guildId: { type: OptionType.STRING, description: "Guild ID", default: "505974446914535426", restartNeeded: false },
    categoryId: { type: OptionType.STRING, description: "Category ID", default: "763914042628112455", restartNeeded: false },
    creationChannelId: { type: OptionType.STRING, description: "Creation Channel ID", default: "763914043252801566", restartNeeded: false },
    botId: { type: OptionType.STRING, description: "Bot ID", default: "913852862990262282", restartNeeded: false },
    autoCreateOnStartup: { type: OptionType.BOOLEAN, description: "Auto-join/create a channel shortly after plugin startup", default: false, restartNeeded: false },
    enableDebug: { type: OptionType.BOOLEAN, description: "Display Debug Messages (Ephemeral)", default: false, restartNeeded: false },
};

// Replace this with actual Object.assign when modules are ready
const combinedSettings = {
    ...coreSettings,
    ...actionQueueSettings,
    ...banSettings,
    ...whitelistSettings,
    ...blacklistSettings,
    ...channelNameRotationSettings,
    ...roleEnforcementSettings,
    ...voteBanningSettings,
    ...commandCleanupSettings,
    ...remoteOperatorsSettings,
    ...ownershipSettings,
    ...autoClaimSettings,
};

export const defaultSettings = definePluginSettings(combinedSettings as any);

// Defines a loose type for settings passed into modules to prevent circular typescript imports
export type LoosePluginSettings = typeof defaultSettings.store & Record<string, any>;

// Define Core Settings type for modules to cast to if they want autocomplete
export type CoreSettings = typeof coreSettings;
