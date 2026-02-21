import { PluginModule } from "../utils/moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import { getNewLineList } from "../utils/settingsHelpers";
import { UserStore as Users, ChannelStore } from "@webpack/common";

export const ChannelNameRotationModule: PluginModule = {
    name: "ChannelNameRotationModule",
    settings: null as unknown as PluginSettings,
    rotationIntervalId: null as unknown as number,

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("ChannelNameRotationModule initializing");
    },

    stop() {
        this.stopRotation();
        logger.info("ChannelNameRotationModule stopping");
    },

    startRotation(channelId: string) {
        if (!this.settings || !this.settings.channelNameRotationEnabled) return;

        const nameList = getNewLineList(this.settings.channelNameRotationNames);
        if (nameList.length === 0) {
            logger.warn("Rotation started but list is empty!");
            return;
        }

        if (this.rotationIntervalId) {
            this.stopRotation();
        }

        sendDebugMessage(`Starting name rotation for channel <#${channelId}>`, channelId);

        const intervalMs = this.settings.channelNameRotationInterval * 60 * 1000;
        if (!intervalMs) {
            logger.error("Naming interval is not defined in settings.");
            return;
        }

        this.rotationIntervalId = setInterval(() => {
            this.rotateNextName(channelId);
        }, intervalMs);
    },

    stopRotation() {
        if (this.rotationIntervalId) {
            clearInterval(this.rotationIntervalId);
            this.rotationIntervalId = null;
            sendDebugMessage("Name rotation stopped.");
        }
    },

    rotateNextName(channelId: string) {
        if (!this.settings || !this.settings.channelNameRotationEnabled) return;

        const nameList = getNewLineList(this.settings.channelNameRotationNames);
        if (nameList.length === 0) return;

        // Try to get the current channel name to calculate index dynamically
        const channel = ChannelStore.getChannel(channelId);
        let currentIndex = -1;
        if (channel && channel.name) {
            currentIndex = nameList.indexOf(channel.name);
        }

        const nextIndex = (currentIndex + 1) % nameList.length;
        const nextName = nameList[nextIndex];

        sendDebugMessage(`Rotating name to: **${nextName}**`, channelId);
        const renameCmd = formatCommand(this.settings.setChannelNameCommand, channelId, { newChannelName: nextName });
        actionQueue.enqueue(renameCmd, channelId, false);
    },

    // addName and removeName are deprecated as name rotation is now strictly driven by global settings
    addName(userId: string, name: string) {
        return false;
    },

    removeName(userId: string, name: string) {
        return false;
    }
};
