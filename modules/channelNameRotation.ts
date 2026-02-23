import { PluginModule } from "../types/module";
import { logger } from "../utils/logger";
import { actionQueue } from "../core/actionQueue";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import { getNewLineList } from "../utils/settings";
import { ChannelStore } from "@webpack/common";

import { OptionType } from "@utils/types";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { pluginInfo } from "../info";

/**
 * Settings definitions for the ChannelNameRotationModule.
 */
export const channelNameRotationSettings = {
    /** Whether to enable the periodic channel name rotation. */
    channelNameRotationEnabled: { type: OptionType.BOOLEAN, description: "Enable Channel Name Rotation", default: true, restartNeeded: false },
    /** A newline-separated list of names to rotate through. */
    channelNameRotationNames: { type: OptionType.STRING, description: "Channel name rotation list (one per line)", default: "", multiline: true, restartNeeded: false },
    /** The interval in minutes between name changes. Minimum 11 minutes to respect Discord rate limits. */
    channelNameRotationInterval: { type: OptionType.SLIDER, description: "Channel Name Rotation Interval (minutes)", default: 11, markers: [11, 15, 30, 60], stickToMarkers: false, restartNeeded: false },
};

export type ChannelNameRotationSettingsType = typeof channelNameRotationSettings;

export const ChannelNameRotationModule: PluginModule = {
    name: "ChannelNameRotationModule",
    description: "Periodically renames a voice channel.",
    settingsSchema: channelNameRotationSettings,
    settings: null,
    rotationIntervalId: null,

    init(settings: Record<string, any>) {
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
        if (nameList.length === 0) return;

        if (this.rotationIntervalId) this.stopRotation();

        sendDebugMessage(`Starting name rotation for channel <#${channelId}>`, channelId);

        const intervalMs = (this.settings.channelNameRotationInterval || 11) * 60 * 1000;
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
    }
};

export const channelNameRotationCommands = [
    {
        name: `${pluginInfo.commandName} name start`,
        description: "Manually start name rotation for current channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            ChannelNameRotationModule.startRotation(ctx.channel.id);
            return sendBotMessage(ctx.channel.id, { content: "Started name rotation." });
        }
    },
    {
        name: `${pluginInfo.commandName} name stop`,
        description: "Manually stop name rotation",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            ChannelNameRotationModule.stopRotation();
            return sendBotMessage(ctx.channel.id, { content: "Stopped name rotation." });
        }
    }
];
