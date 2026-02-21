import { PluginModule } from "../utils/moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { getUserIdList, setNewLineList } from "../utils/settings";
import { sendDebugMessage } from "../utils/debug";

import { OptionType } from "@utils/types";

/**
 * Settings definitions for the BlacklistModule.
 */
export const blacklistSettings = {
    // ── Blacklisting (auto-kick) ──────────────────────────
    /** A local list of user IDs who will be automatically kicked if they join your owned channels. */
    localUserBlacklist: { type: OptionType.STRING, description: "Local ban list — user IDs to auto-kick (one per line)", default: "", multiline: true, restartNeeded: false },
    /** The message template used when a blacklisted user is automatically kicked. */
    blacklistSkipMessage: { type: OptionType.STRING, description: "Message sent when auto-kicking a blacklisted user (supports {user_id}, {user_name})", default: "⚫ Blacklist: Removed <@{user_id}> ({user_name})", restartNeeded: false },
};

export type BlacklistSettingsType = typeof blacklistSettings;

export const BlacklistModule: PluginModule = {
    name: "BlacklistModule",
    description: "Maintains a local blacklist of users to be automatically kicked from owned channels.",
    settingsSchema: blacklistSettings,
    settings: undefined as Record<string, any> | undefined,


    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("BlacklistModule initializing");
    },

    stop() {
        logger.info("BlacklistModule stopping");
    },

    /**
     * Retrieves the current list of blacklisted user IDs as an array.
     */
    getBlacklist(): string[] {
        return getUserIdList(this.settings?.localUserBlacklist);
    },

    setBlacklist(newList: string[]) {
        if (!this.settings) return;
        this.settings.localUserBlacklist = setNewLineList(newList);
    },

    /**
     * Checks if a specific user is currently on the local blacklist.
     * @param userId The ID of the user to check
     */
    isBlacklisted(userId: string): boolean {
        return this.getBlacklist().includes(userId);
    },

    /**
     * Adds a new user ID to the local blacklist.
     * @param userId The ID of the user to blacklist
     * @param channelId Optional channel ID for debug feedback
     */
    blacklistUser(userId: string, channelId?: string) {
        if (!this.settings || this.isBlacklisted(userId)) return;
        this.setBlacklist([...this.getBlacklist(), userId]);
        sendDebugMessage(`User <@${userId}> added to local blacklist.`, channelId);
    },
    /**
     * Removes a user ID from the local blacklist.
     * @param userId The ID of the user to remove
     * @param channelId Optional channel ID for debug feedback
     */
    unblacklistUser(userId: string, channelId?: string) {
        if (!this.settings || !this.isBlacklisted(userId)) return;
        this.setBlacklist(this.getBlacklist().filter(id => id !== userId));
        sendDebugMessage(`User <@${userId}> removed from local blacklist.`, channelId);
    }
};
