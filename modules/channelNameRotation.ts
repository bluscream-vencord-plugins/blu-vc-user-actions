import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
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
    // ── Channel Name Rotation ─────────────────────────────────────────────
    /** Whether to enable the periodic channel name rotation. */
    channelNameRotationEnabled: { type: OptionType.BOOLEAN, description: "Enable Channel Name Rotation", default: true, restartNeeded: false },
    /** A newline-separated list of names to rotate through. */
    channelNameRotationNames: { type: OptionType.STRING, description: "Channel name rotation list (one per line)", default: "", multiline: true, restartNeeded: false },
    /** The interval in minutes between name changes. Minimum 11 minutes to respect Discord rate limits. */
    channelNameRotationInterval: { type: OptionType.SLIDER, description: "Channel Name Rotation Interval (minutes)", default: 11, markers: [11, 15, 30, 60], stickToMarkers: false, restartNeeded: false, onChange: (v: number) => { (moduleRegistry.settings as any).channelNameRotationInterval = Math.max(11, Math.round(v)); } },
};

export type ChannelNameRotationSettingsType = typeof channelNameRotationSettings;

export const ChannelNameRotationModule: PluginModule = {
    name: "ChannelNameRotationModule",
    description: "Periodically renames a voice channel using a configured list of names.",
    settingsSchema: channelNameRotationSettings,
    settings: null as unknown as Record<string, any>,
    /** Ref to the active setInterval instance. */
    rotationIntervalId: null as unknown as any,

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("ChannelNameRotationModule initializing");
    },

    stop() {
        this.stopRotation();
        logger.info("ChannelNameRotationModule stopping");
    },

    /**
     * Starts the periodic name rotation for a specific channel.
     * @param channelId The ID of the channel to rotate
     */
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

    /**
     * Stops the active name rotation timer.
     */
    stopRotation() {
        if (this.rotationIntervalId) {
            clearInterval(this.rotationIntervalId);
            this.rotationIntervalId = null;
            sendDebugMessage("Name rotation stopped.");
        }
    },

    /**
     * Executes a single name rotation step for the given channel.
     * @param channelId The target channel ID
     */
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

/**
 * Internal slash-like commands for controlling channel name rotation.
 */
export const channelNameRotationCommands = [
    {
        name: `${pluginInfo.commandName} name start`,
        description: "Manually start name rotation for current channel",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_args: any[], ctx: any) => {
            if (!ctx.channel) {
                return sendBotMessage(ctx.channel.id, { content: "Join a channel first." });
            }
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
