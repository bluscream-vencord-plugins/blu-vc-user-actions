import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { getUserIdList, setNewLineList } from "../utils/settingsHelpers";
import { User, Channel } from "@vencord/discord-types";
import { Menu, React } from "@webpack/common";
import { sendDebugMessage } from "../utils/debug";

export const BlacklistModule: SocializeModule = {
    name: "BlacklistModule",
    settings: undefined as PluginSettings | undefined,


    init(settings: PluginSettings) {
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
