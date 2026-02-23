import { PluginModule } from "../types/module";
import { moduleRegistry } from "../core/moduleRegistry";
import { CoreEvent } from "../types/events";
import { logger } from "../utils/logger";
import { actionQueue } from "../core/actionQueue";
import { stateManager } from "../utils/state";
import { VoiceStateStore, UserStore } from "@webpack/common";
import { OptionType } from "@utils/types";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";

/**
 * Settings definitions for the AutoClaimModule.
 */
export const autoClaimSettings = {
    autoClaimDisbanded: {
        type: OptionType.BOOLEAN,
        description: "Automatically claim the channel you're in when its owner leaves",
        default: false,
        restartNeeded: false,
    }
};

export type AutoClaimSettingsType = typeof autoClaimSettings;

export const AutoClaimModule: PluginModule = {
    name: "AutoClaimModule",
    description: "Automatically claims voice channels when their owners leave.",
    optionalDependencies: ["CommandCleanupModule"],
    settingsSchema: autoClaimSettings,
    settings: null,

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("AutoClaimModule initializing");

        moduleRegistry.on(CoreEvent.USER_LEFT_OWNED_CHANNEL, (payload) => {
            if (!this.settings?.autoClaimDisbanded) return;

            const { channelId, userId } = payload;
            const ownership = stateManager.getOwnership(channelId);
            if (!ownership) return;

            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                this.checkAndClaimIfDisbanded(channelId);
            }
        });

        moduleRegistry.on(CoreEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL, (payload) => {
            if (!this.settings?.autoClaimDisbanded) return;
            setTimeout(() => {
                this.checkAndClaimIfDisbanded(payload.channelId);
            }, 1000);
        });
    },

    stop() {
        logger.info("AutoClaimModule stopping");
    },

    checkAndClaimIfDisbanded(channelId: string) {
        const me = UserStore.getCurrentUser();
        if (!me) return;

        const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
        if (!voiceStates || !voiceStates[me.id]) return;

        const ownership = stateManager.getOwnership(channelId);
        if (!ownership) return;

        const isCreatorPresent = ownership.creatorId && voiceStates[ownership.creatorId];
        const isClaimantPresent = ownership.claimantId && voiceStates[ownership.claimantId];

        if (!isCreatorPresent && !isClaimantPresent) {
            sendDebugMessage(`Channel ${channelId} is disbanded. Auto-claiming...`, channelId);
            const globalSettings = moduleRegistry.settings as any;
            const claimCmdTemplate = globalSettings.claimCommand || "!v claim";
            const claimCmd = formatCommand(claimCmdTemplate, channelId, {});
            actionQueue.enqueue(claimCmd, channelId, true);
        }
    }
};
