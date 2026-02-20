import definePlugin from "@utils/types"; import { pluginInfo } from "./info";
import { defaultSettings } from "./types/settings";
import { PluginSettings } from "./types/settings";
import { moduleRegistry } from "./logic/moduleRegistry";
import { stateManager } from "./utils/stateManager";
import { logger } from "./utils/logger";
import { socializeCommand } from "./commands";
import { actionQueue } from "./utils/actionQueue";

// Modules
import { OwnershipModule } from "./logic/ownership";
import { WhitelistingModule } from "./logic/whitelisting";
import { NamingModule } from "./logic/naming";
import { RoleEnforcementModule } from "./logic/roleEnforcement";
import { VoteBanningModule } from "./logic/voteBanning";
import { CommandCleanupModule } from "./logic/commandCleanup";
import { contextMenuHandlers } from "./components/menus";
import SocializeToolbox from "./components/toolbox";

export default definePlugin({
    ...pluginInfo,
    settings: defaultSettings,

    onStart() {
        logger.info("Starting SocializeGuild Plugin...");

        stateManager.init(this.settings.store || {});
        actionQueue.setDelay((this.settings.store.queueInterval || 2) * 1000);

        // Setup command sender utilizing Vencord Message actions
        const { MessageActions } = require("@webpack/common");
        actionQueue.setCommandSender(async (command, channelId) => {
            return MessageActions.sendMessage(channelId, { content: command });
        });

        // Register core logic modules
        moduleRegistry.register(OwnershipModule);
        moduleRegistry.register(WhitelistingModule);
        moduleRegistry.register(NamingModule);
        moduleRegistry.register(RoleEnforcementModule);
        moduleRegistry.register(VoteBanningModule);
        moduleRegistry.register(CommandCleanupModule);

        // Initialize them with current settings
        moduleRegistry.init(this.settings.store as unknown as PluginSettings);

        logger.info("SocializeGuild started successfully.");
    },

    onStop() {
        logger.info("Stopping SocializeGuild Plugin...");
        moduleRegistry.stop();
        actionQueue.clear();
    },

    contextMenus: contextMenuHandlers,

    toolboxActions() {
        const { SelectedChannelStore } = require("@webpack/common");
        const channelId = SelectedChannelStore.getChannelId();
        if (!channelId) return null;
        return <SocializeToolbox channelId={channelId} />;
    },

    commands: [
        socializeCommand
    ],

    patches: [
        // Example: Inject into context menus
    ]
});
