import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { UserStore as Users } from "@webpack/common";
export const NamingModule: SocializeModule = {
    name: "NamingModule",
    settings: null as any,
    rotationIntervalId: null as any,

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("NamingModule initializing");
    },

    stop() {
        this.stopRotation();
        logger.info("NamingModule stopping");
    },

    startRotation(channelId: string) {
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

        logger.info(`Starting name rotation for channel ${channelId}`);
        this.rotationIntervalId = setInterval(() => {
            this.rotateNextName(channelId, currentUserId);
        }, this.settings.namingIntervalMs);
    },

    stopRotation() {
        if (this.rotationIntervalId) {
            clearInterval(this.rotationIntervalId);
            this.rotationIntervalId = null;
            logger.info("Name rotation stopped.");
        }
    },

    rotateNextName(channelId: string, userId: string) {
        const config = stateManager.getMemberConfig(userId);
        if (config.nameRotationList.length === 0) return;

        const nextName = config.nameRotationList[config.nameRotationIndex];
        config.nameRotationIndex = (config.nameRotationIndex + 1) % config.nameRotationList.length;

        stateManager.updateMemberConfig(userId, { nameRotationIndex: config.nameRotationIndex });

        const renameCmd = this.settings.renameCommand.replace("{name}", nextName);
        actionQueue.enqueue(renameCmd, channelId, false);
    }
};
