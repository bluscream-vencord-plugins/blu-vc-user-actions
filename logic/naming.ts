import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
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

        logger.info(`Starting name rotation for channel ${channelId}`);
        // The original code uses this.settings.namingIntervalMs.
        // The instruction's code edit suggests using rotationIntervalMin, but it's unclear where that comes from.
        // Assuming the intent is to add a check before using settings, and potentially change the interval calculation.
        // If rotationIntervalMin is intended, it should be part of PluginSettings.
        // For now, I'll add the check and use the existing namingIntervalMs.
        // If the intent was to use rotationIntervalMin, the settings type would need to be updated.
        const intervalMs = this.settings.channelNameRotationInterval * 1000; // Using existing setting
        if (!intervalMs) { // Added check for intervalMs
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
            logger.info("Name rotation stopped.");
        }
    },

    rotateNextName(channelId: string, userId: string) {
        if (!this.settings) return; // Added undefined check for settings
        const config = stateManager.getMemberConfig(userId);
        if (config.nameRotationList.length === 0) return;

        const nextName = config.nameRotationList[config.nameRotationIndex];
        config.nameRotationIndex = (config.nameRotationIndex + 1) % config.nameRotationList.length;

        stateManager.updateMemberConfig(userId, { nameRotationIndex: config.nameRotationIndex });

        const renameCmd = this.settings.renameCommand.replace("{name}", nextName);
        actionQueue.enqueue(renameCmd, channelId, false);
    }
};
