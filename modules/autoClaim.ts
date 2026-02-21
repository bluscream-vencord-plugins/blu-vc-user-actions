import { PluginModule, moduleRegistry } from "../utils/moduleRegistry";
import { PluginModuleEvent } from "../types/events";
import { logger } from "../utils/logger";
import { actionQueue } from "../utils/queue";
import { stateManager } from "../utils/state";
import { VoiceStateStore, UserStore, ChannelStore, MessageActions } from "@webpack/common";
import { OptionType } from "@utils/types";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import { sendExternalMessage } from "../utils/messaging";
import { commandCleanupSettings } from "./commandCleanup";

/**
 * Settings definitions for the AutoClaimModule.
 */
export const autoClaimSettings = {
    // ── Auto Claim ────────────────────────────────────────────────────────
    /** When enabled, the plugin will attempt to claim a voice channel automatically if the current owner leaves. */
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
    description: "Automatically claims voice channels when their owners leave or are missing.",
    optionalDependencies: ["CommandCleanupModule"],
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
            }, 1000);
        });
    },

    stop() {
        logger.info("AutoClaimModule stopping");
    },

    /**
     * Internal logic to verify if a channel is currently "disbanded" (has no owners present)
     * and enqueue a claim command if the local user is present.
     * @param channelId The target voice channel ID
     */
    checkAndClaimIfDisbanded(channelId: string) {
        const s = moduleRegistry.settings as any;
        if (!s?.commandCleanup) return;

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

        logger.debug(`[AutoClaim] checkAndClaimIfDisbanded(${channelId}): creatorPresent=${!!isCreatorPresent}, claimantPresent=${!!isClaimantPresent}`);

        // If no owner is present in the voice channel, auto claim it
        if (!isCreatorPresent && !isClaimantPresent) {
            const msg = `Channel ${channelId} is disbanded (All owners left or missing). Auto-claiming...`;
            logger.info(msg);
            sendDebugMessage(msg, channelId);

            // Get the claim command from global settings (which usually comes from Ownership module)
            const globalSettings = moduleRegistry.settings as any;
            const claimCmdTemplate = globalSettings.claimCommand || "!v claim";

            // We use formatCommand just in case it takes variables, although it's usually static
            const claimCmd = formatCommand(claimCmdTemplate, channelId, {});

            const channel = ChannelStore.getChannel(channelId);
            logger.info(`[AutoClaim] Enqueuing claim command: ${claimCmd}`);
            try {
                actionQueue.enqueue(claimCmd, channelId, true);
            } catch (e) {
                logger.error(`[AutoClaim] Failed to enqueue claim command: ${e}`);

            }
            const cleanupDelay = s.commandCleanupDelay || 1;
            const sentMsg = sendExternalMessage(channelId, claimCmd); // TODO: FIX AND REMOVE TO USE QUEUE
            setTimeout(() => {
                MessageActions.deleteMessage(channelId, sentMsg.id);
            }, cleanupDelay);
        }
    }
};
