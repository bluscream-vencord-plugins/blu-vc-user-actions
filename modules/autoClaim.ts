import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { PluginModuleEvent } from "../types/events";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";
import { VoiceStateStore, UserStore, ChannelStore } from "@webpack/common";
import { OptionType } from "@utils/types";
import { formatCommand } from "../utils/formatting";

export const autoClaimSettings = {
    // ── Auto Claim ────────────────────────────────────────────────────────
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
    settingsSchema: autoClaimSettings,
    settings: null as unknown as Record<string, any>,

    init(settings: Record<string, any>) {
        this.settings = settings;
        logger.info("AutoClaimModule initializing");

        // When a user leaves an owned channel
        moduleRegistry.on<PluginModuleEvent.USER_LEFT_OWNED_CHANNEL>(PluginModuleEvent.USER_LEFT_OWNED_CHANNEL, (payload) => {
            if (!this.settings?.autoClaimDisbanded) return;

            const { channelId, userId } = payload;
            const ownership = stateManager.getOwnership(channelId);
            if (!ownership) return;

            const isCreator = ownership.creatorId === userId;
            const isClaimant = ownership.claimantId === userId;

            // Only proceed if the person leaving was an owner
            if (!isCreator && !isClaimant) return;

            this.checkAndClaimIfDisbanded(channelId);
        });

        // When we join a managed channel, check if the owner is already missing
        moduleRegistry.on<PluginModuleEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL>(PluginModuleEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL, (payload) => {
            if (!this.settings?.autoClaimDisbanded) return;

            // Delay briefly to allow VoiceStates to settle and Ownership info to be parsed if we just joined
            setTimeout(() => {
                this.checkAndClaimIfDisbanded(payload.channelId);
            }, 1500);
        });
    },

    stop() {
        logger.info("AutoClaimModule stopping");
    },

    checkAndClaimIfDisbanded(channelId: string) {
        const me = UserStore.getCurrentUser();
        if (!me) return;

        const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
        // Ensure we are actually in the channel
        if (!voiceStates || !voiceStates[me.id]) return;

        const ownership = stateManager.getOwnership(channelId);
        if (!ownership) return;

        const creatorId = ownership.creatorId;
        const claimantId = ownership.claimantId;

        const isCreatorPresent = creatorId && voiceStates[creatorId];
        const isClaimantPresent = claimantId && voiceStates[claimantId];

        // If no owner is present in the voice channel, auto claim it
        if (!isCreatorPresent && !isClaimantPresent) {
            logger.info(`Channel ${channelId} is disbanded (All owners left or missing). Auto-claiming...`);

            // Get the claim command from global settings (which usually comes from Ownership module)
            const globalSettings = moduleRegistry.settings as any;
            const claimCmdTemplate = globalSettings.claimCommand || "!v claim";

            // We use formatCommand just in case it takes variables, although it's usually static
            const claimCmd = formatCommand(claimCmdTemplate, channelId, {});

            const channel = ChannelStore.getChannel(channelId);

            actionQueue.enqueue(claimCmd, channelId, true);
        }
    }
};
