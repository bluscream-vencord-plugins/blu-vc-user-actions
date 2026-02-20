import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import { UserStore as Users } from "@webpack/common";
export const NamingModule: SocializeModule = {
    name: "NamingModule",
    settings: null as unknown as PluginSettings,
    rotationIntervalId: null as unknown as number,

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("NamingModule initializing");
    },

    stop() {
        this.stopRotation();
        logger.info("NamingModule stopping");
    },

    startRotation(channelId: string) {
        if (!this.settings) return;
        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const config = stateManager.getMemberConfig(currentUserId);
        if (config.nameRotationList.length === 0) {
            logger.warn("Rotation started but list is empty!");
            return;
        }

        if (this.rotationIntervalId) {
            this.stopRotation();
        }

        sendDebugMessage(channelId, `Starting name rotation for channel <#${channelId}>`);

        const intervalMs = this.settings.channelNameRotationInterval * 1000;
        if (!intervalMs) {
            logger.error("Naming interval is not defined in settings.");
            return;
        }

        this.rotationIntervalId = setInterval(() => {
            this.rotateNextName(channelId, currentUserId);
        }, intervalMs);
    },

    stopRotation() {
        if (this.rotationIntervalId) {
            clearInterval(this.rotationIntervalId);
            this.rotationIntervalId = null;
            sendDebugMessage("", "Name rotation stopped."); // No channelId context easily available here unless stored

        }
    },

    rotateNextName(channelId: string, userId: string) {
        if (!this.settings) return; // Added undefined check for settings
        const config = stateManager.getMemberConfig(userId);
        if (config.nameRotationList.length === 0) return;

        const nextName = config.nameRotationList[config.nameRotationIndex];
        config.nameRotationIndex = (config.nameRotationIndex + 1) % config.nameRotationList.length;

        stateManager.updateMemberConfig(userId, { nameRotationIndex: config.nameRotationIndex });

        sendDebugMessage(channelId, `Rotating name to: **${nextName}**`);
        const renameCmd = formatCommand(this.settings.setChannelNameCommand, channelId, { newChannelName: nextName });
        actionQueue.enqueue(renameCmd, channelId, false);
    },

    addName(userId: string, name: string) {
        const config = stateManager.getMemberConfig(userId);
        if (!config.nameRotationList.includes(name)) {
            config.nameRotationList.push(name);
            stateManager.updateMemberConfig(userId, { nameRotationList: config.nameRotationList });
            return true;
        }
        return false;
    },

    removeName(userId: string, name: string) {
        const config = stateManager.getMemberConfig(userId);
        const filtered = config.nameRotationList.filter(n => n !== name);
        if (filtered.length !== config.nameRotationList.length) {
            stateManager.updateMemberConfig(userId, { nameRotationList: filtered });
            return true;
        }
        return false;
    }
};
