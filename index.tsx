import definePlugin from "@utils/types";
import { pluginInfo } from "./info";
import { defaultSettings } from "./types/settings";
import { PluginSettings } from "./types/settings";
import { moduleRegistry } from "./logic/moduleRegistry";
import { stateManager } from "./utils/stateManager";
import { logger } from "./utils/logger";
import { socializeCommands } from "./commands";
import { actionQueue } from "./utils/actionQueue";

// Modules
import { OwnershipModule } from "./logic/ownership";
import { WhitelistModule } from "./logic/whitelist";
import { BlacklistModule } from "./logic/blacklist";
import { ChannelNameRotationModule } from "./logic/channelNameRotation";
import { RoleEnforcementModule } from "./logic/roleEnforcement";
import { BansModule } from "./logic/bans";
import { VoteBanningModule } from "./logic/voteBanning";
import { CommandCleanupModule } from "./logic/commandCleanup";
import { contextMenuHandlers } from "./components/menus";

export default definePlugin({
    ...pluginInfo,
    settings: defaultSettings,

    start() {
        const { FluxDispatcher } = require("@webpack/common");
        logger.info("Starting SocializeGuild Plugin...");

        stateManager.init(this.settings.store || {});
        actionQueue.setDelay((this.settings.store.queueInterval || 2) * 1000);

        // Use Vencord's sendMessage wrapper from @utils/discord which properly fills
        // in all required Discord message fields (invalidEmojis, tts, validNonShortcutEmojis)
        // Raw MessageActions.sendMessage crashes with 'nonce' TypeError without them.
        const { sendMessage } = require("@utils/discord");
        actionQueue.setCommandSender(async (command, channelId) => {
            return sendMessage(channelId, { content: command });
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

        // Initialize them with current settings
        moduleRegistry.init(this.settings.store as unknown as PluginSettings);

        logger.info(`Initialized with Bot ID: ${this.settings.store.botId}`);

        // Hook into Discord events via Flux
        this.voiceListener = (event: any) => {
            try {
                moduleRegistry.dispatchVoiceStateUpdate(event.oldState, event.newState);
            } catch (e) {
                logger.error("Error in VOICE_STATE_UPDATE listener:", e);
            }
        };
        this.messageListener = (event: any) => {
            try {
                if (event.message) {
                    moduleRegistry.dispatchMessageCreate(event.message);
                }
            } catch (e) {
                logger.error("Error in MESSAGE_CREATE listener:", e);
            }
        };

        FluxDispatcher.subscribe("VOICE_STATE_UPDATE", this.voiceListener);
        FluxDispatcher.subscribe("MESSAGE_CREATE", this.messageListener);

        logger.info(`SocializeGuild started successfully. ${moduleRegistry["modules"].length} modules registered.`);
    },

    stop() {
        const { FluxDispatcher } = require("@webpack/common");
        logger.info("Stopping SocializeGuild Plugin...");

        if (this.voiceListener) FluxDispatcher.unsubscribe("VOICE_STATE_UPDATE", this.voiceListener);
        if (this.messageListener) FluxDispatcher.unsubscribe("MESSAGE_CREATE", this.messageListener);

        moduleRegistry.stop();
        actionQueue.clear();
    },

    contextMenus: contextMenuHandlers,

    toolboxActions() {
        const { SelectedChannelStore, ChannelStore, Menu } = require("@webpack/common");
        const channelId = SelectedChannelStore.getChannelId();
        if (!channelId) {
            logger.debug("toolboxActions: No channelId selected.");
            return null;
        }
        const channel = ChannelStore.getChannel(channelId);
        if (!channel) {
            logger.debug(`toolboxActions: Channel ${channelId} not found in store.`);
            return null;
        }

        const items = moduleRegistry.collectToolboxItems(channel);
        logger.debug(`toolboxActions: Collected ${items.length} items for channel ${channel.name} (${channelId})`);

        if (!items.length) return null;

        return (
            <Menu.MenuGroup label="SocializeGuild">
                {items}
            </Menu.MenuGroup>
        );
    },

    commands: socializeCommands,

    patches: [
        // Example: Inject into context menus
    ]
});
