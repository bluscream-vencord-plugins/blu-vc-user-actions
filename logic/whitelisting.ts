import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { formatCommand } from "../utils/formatting";
import { actionQueue } from "../utils/actionQueue";
import { MemberLike, extractId } from "../utils/parsing";
import { getUserIdList, setNewLineList } from "../utils/settingsHelpers";

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
        return getUserIdList(this.settings?.localUserWhitelist);
    },

    setWhitelist(newList: string[]) {
        if (!this.settings) return;
        this.settings.localUserWhitelist = setNewLineList(newList);
    },

    isWhitelisted(userId: string): boolean {
        return this.getWhitelist().includes(userId);
    },

    permitUsers(members: (MemberLike | string)[], channelId: string) {
        if (!this.settings) return;
        for (const member of members) {
            const userId = extractId(member);
            if (!userId) continue;
            const cmd = formatCommand(this.settings.permitCommand, channelId, { userId });
            actionQueue.enqueue(cmd, channelId);
        }
    },

    permitUser(member: MemberLike | string, channelId: string) {
        this.permitUsers([member], channelId);
    },

    unpermitUsers(members: (MemberLike | string)[], channelId: string) {
        if (!this.settings) return;
        for (const member of members) {
            const userId = extractId(member);
            if (!userId) continue;
            const cmd = formatCommand(this.settings.unpermitCommand, channelId, { userId });
            actionQueue.enqueue(cmd, channelId);
        }
    },

    unpermitUser(member: MemberLike | string, channelId: string) {
        this.unpermitUsers([member], channelId);
    }
};
