import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent } from "../types/events";
import { logger } from "../utils/logger";
import { formatCommand } from "../utils/formatting";
import { actionQueue } from "../utils/actionQueue";
import { MemberLike, extractId } from "../utils/parsing";
import { getUserIdList, setNewLineList } from "../utils/settingsHelpers";
import { sendDebugMessage } from "../utils/debug";

export const WhitelistModule: SocializeModule = {
    name: "WhitelistModule",
    settings: undefined as PluginSettings | undefined,

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("WhitelistModule initializing");

        moduleRegistry.on(SocializeEvent.USER_JOINED_OWNED_CHANNEL, (payload) => {
            if (this.isWhitelisted(payload.userId)) {
                payload.isAllowed = true;
                payload.reason = "Whitelisted";
            }
        });
    },

    stop() {
        logger.info("WhitelistModule stopping");
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
            sendDebugMessage(channelId, `Permitting user <@${userId}>`);
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
            sendDebugMessage(channelId, `Unpermitting user <@${userId}>`);
            actionQueue.enqueue(cmd, channelId);
        }
    },

    unpermitUser(member: MemberLike | string, channelId: string) {
        this.unpermitUsers([member], channelId);
    }
};
