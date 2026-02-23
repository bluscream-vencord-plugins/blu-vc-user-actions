import { PluginModule } from "../types/module";
import { logger } from "../utils/logger";
import { getUserIdList, setNewLineList } from "../utils/settings";
import { sendDebugMessage } from "../utils/debug";
import { OptionType } from "@utils/types";

/**
 * Settings definitions for the BlacklistModule.
 */
export const blacklistSettings = {
    /** A local list of user IDs who will be automatically kicked if they join your owned channels. */
    localUserBlacklist: { type: OptionType.STRING, description: "Local ban list — user IDs to auto-kick (one per line)", default: "", multiline: true, restartNeeded: false },
    /** The message template used when a blacklisted user is automatically kicked. */
    blacklistSkipMessage: { type: OptionType.STRING, description: "Message sent when auto-kicking a blacklisted user (supports {user_id}, {user_name})", default: "⚫ Blacklist: Removed <@{user_id}> ({user_name})", restartNeeded: false },
};

export type BlacklistSettingsType = typeof blacklistSettings;

export const BlacklistModule: PluginModule = {
    name: "BlacklistModule",
    description: "Maintains a local blacklist of users.",
    settingsSchema: blacklistSettings,
    settings: null,


    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("BlacklistModule initializing");
    },

    stop() {
        logger.info("BlacklistModule stopping");
    },

    getBlacklist(): string[] {
        return getUserIdList(this.settings?.localUserBlacklist);
    },

    setBlacklist(newList: string[]) {
        if (!this.settings) return;
        this.settings.localUserBlacklist = setNewLineList(newList);
    },

    isBlacklisted(userId: string): boolean {
        return this.getBlacklist().includes(userId);
    },

    blacklistUser(userId: string, channelId?: string) {
        if (!this.settings || this.isBlacklisted(userId)) return;
        this.setBlacklist([...this.getBlacklist(), userId]);
        sendDebugMessage(`User <@${userId}> added to local blacklist.`, channelId);
    },

    unblacklistUser(userId: string, channelId?: string) {
        if (!this.settings || !this.isBlacklisted(userId)) return;
        this.setBlacklist(this.getBlacklist().filter(id => id !== userId));
        sendDebugMessage(`User <@${userId}> removed from local blacklist.`, channelId);
    }
};
