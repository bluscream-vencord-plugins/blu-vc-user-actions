import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { formatCommand } from "../utils/formatting";

export const WhitelistingModule: SocializeModule = {
    name: "WhitelistingModule",
    settings: undefined as PluginSettings | undefined,

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("WhitelistingModule initializing");
    },

    stop() {
        logger.info("WhitelistingModule stopping");
    },

    getWhitelist(): string[] {
        if (!this.settings?.localUserWhitelist) return [];
        return this.settings.localUserWhitelist
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(id => /^\d{17,19}$/.test(id));
    },

    setWhitelist(newList: string[]) {
        if (!this.settings) return;
        this.settings.localUserWhitelist = newList.join("\n");
    },

    isWhitelisted(userId: string): boolean {
        return this.getWhitelist().includes(userId);
    },

    bulkPermit(userIds: string[], channelId: string) {
        if (!this.settings) return;
        for (const userId of userIds) {
            const cmd = formatCommand(this.settings.permitCommand, channelId, { userId });
            actionQueue.enqueue(cmd, channelId);
        }
    },

    bulkUnpermit(userIds: string[], channelId: string) {
        if (!this.settings) return;
        for (const userId of userIds) {
            const cmd = formatCommand(this.settings.unpermitCommand, channelId, { userId });
            actionQueue.enqueue(cmd, channelId);
        }
    }
};
