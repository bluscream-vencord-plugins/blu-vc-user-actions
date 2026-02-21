import definePlugin from "@utils/types";
import { pluginInfo } from "./info";
import { defaultSettings, LoosePluginSettings } from "./settings";
import { moduleRegistry } from "./utils/moduleRegistry";
import { stateManager } from "./utils/state";
import { logger } from "./utils/logger";
import { socializeCommands } from "./commands";
import { actionQueue } from "./utils/actionQueue";
import { ChannelStore, GuildChannelStore } from "@webpack/common";
import { sendExternalMessage } from "./utils/messaging";

// Modules
import { OwnershipModule, OwnershipActions } from "./modules/ownership";
import { WhitelistModule } from "./modules/whitelist";
import { BlacklistModule } from "./modules/blacklist";
import { ChannelNameRotationModule } from "./modules/channelNameRotation";
import { RoleEnforcementModule } from "./modules/roleEnforcement";
import { BansModule } from "./modules/bans";
import { VoteBanningModule } from "./modules/voteBanning";
import { CommandCleanupModule } from "./modules/commandCleanup";
import { RemoteOperatorsModule } from "./modules/remoteOperators";
import { AutoClaimModule } from "./modules/autoClaim";
import { contextMenuHandlers } from "./utils/menus";

export default definePlugin({
    ...pluginInfo,
    settings: defaultSettings,

    start() {
        logger.info("Starting SocializeGuild Plugin...");

        stateManager.init(this.settings.store || {});
        actionQueue.setDelay((this.settings.store.queueInterval || 2) * 1000);

        // Use Vencord's sendMessage wrapper which properly fills in all required
        // Discord message fields (invalidEmojis, tts, validNonShortcutEmojis).
        // Raw MessageActions.sendMessage crashes with 'nonce' TypeError without them.
        actionQueue.setCommandSender(async (command, channelId) => {
            return sendExternalMessage(channelId, command);
        });

        // Register core logic modules
        moduleRegistry.register(OwnershipModule);
        moduleRegistry.register(WhitelistModule);
        moduleRegistry.register(BlacklistModule);
        moduleRegistry.register(ChannelNameRotationModule);
        moduleRegistry.register(BansModule);
        moduleRegistry.register(RoleEnforcementModule);
        moduleRegistry.register(VoteBanningModule);
        moduleRegistry.register(CommandCleanupModule);
        moduleRegistry.register(RemoteOperatorsModule);
        moduleRegistry.register(AutoClaimModule);

        // Initialize them with current settings
        moduleRegistry.init(this.settings.store as unknown as LoosePluginSettings);

        if (this.settings.store.autoCreateOnStartup) {
            logger.info("autoCreateOnStartup is enabled. Waiting 10 seconds before finding/creating channel...");
            setTimeout(() => {
                try {
                    OwnershipActions.findOrCreateChannel();
                } catch (e) {
                    logger.error("Failed to autoCreateOnStartup:", e);
                }
            }, 10000);
        }

        logger.info(`SocializeGuild started. ${moduleRegistry["modules"].length} modules. Bot ID: ${this.settings.store.botId}`);
    },

    stop() {
        logger.info("Stopping SocializeGuild Plugin...");
        moduleRegistry.stop();
        actionQueue.clear();
    },

    // Use Vencord's native flux: handler instead of FluxDispatcher.subscribe.
    // The flux handler receives the fully-hydrated event object with proper
    // channelId / guildId fields that manual subscribers don't get reliably.
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[] }) {
            for (const state of voiceStates) {
                try {
                    // Normalize voice state update to provide both old and new state fragments
                    const oldState = { ...state, channelId: state.oldChannelId };
                    const newState = { ...state };
                    moduleRegistry.dispatchVoiceStateUpdate(oldState, newState);
                } catch (e) {
                    logger.error("Error in VOICE_STATE_UPDATES handler:", e);
                }
            }
        },

        MESSAGE_CREATE({ message, channelId, guildId }: { message: any; channelId: string; guildId: string; }) {
            try {
                const s = moduleRegistry.settings;
                if (!s) return;

                // Fast-path guild filter — ignore messages from other guilds
                if (guildId && guildId !== s.guildId) return;

                // Resolve the channel
                const channel = ChannelStore.getChannel(channelId);
                if (!channel) return;

                const isCommand = (message.content ?? "").trim().startsWith("!v");
                const isInManagedCategory = channel.parent_id === s.categoryId;
                const isOp = RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(message.author?.id) : false;

                // We must allow !v commands to pass through even if the category filter blocks them,
                // otherwise the CommandCleanupModule won't see them.
                // We also allow messages from remote operators to pass through early.
                if (!isCommand && !isInManagedCategory && !isOp) return;

                logger.debug(`MESSAGE_CREATE from ${message.author?.username} (${message.author?.id}) in #${channel.name} (${channelId})`);

                moduleRegistry.dispatchMessageCreate(message);
            } catch (e) {
                logger.error("Error in MESSAGE_CREATE:", e);
            }
        }
    },

    contextMenus: contextMenuHandlers,

    toolboxActions() {
        const { SelectedChannelStore, ChannelStore: CS } = require("@webpack/common");

        // Prefer voice channel context, fall back to text channel
        const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
        const textChannelId = SelectedChannelStore.getChannelId();
        const channelId = voiceChannelId || textChannelId;

        const channel = channelId ? CS.getChannel(channelId) : undefined;

        // collectToolboxItems handles undefined channel gracefully — always returns status/toggle items
        const items = moduleRegistry.collectToolboxItems(channel);
        logger.debug(`toolboxActions: ${items.length} items (voice=${voiceChannelId ?? "none"}, text=${textChannelId ?? "none"})`);

        if (!items.length) return null;

        // Return flat array — equicordToolbox wraps in its own MenuGroup
        return items;
    },

    commands: socializeCommands,

    patches: []
});
