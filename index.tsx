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

export default definePlugin({
    ...pluginInfo,
    settings: defaultSettings,

    onStart() {
        logger.info("Starting SocializeGuild Plugin...");

        // Setup store connection to Vencord (using this.store to mock it if available)
        // Normally vencord gives us `this.store` inside the plugin object?
        // We'll mock it via empty object if undefined, though real Vencord persists automatically per plugin via `this.settings`?
        // Wait, Vencord's definePlugin gives `useSettings` and `settings`. Using them.
        stateManager.init(this.settings.store || {});
        actionQueue.setDelay(this.settings.store.actionDelayMs || 2000);

        // Setup command sender utilizing Vencord Message actions (mocked here)
        actionQueue.setCommandSender(async (command, channelId) => {
            // e.g. imported from vencord/api/messages: send(channelId, {content: command})
            logger.debug(`[MOCK SEND] -> ${channelId}: ${command}`);
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

    commands: [
        socializeCommand
    ],

    // We can also patch standard React component functions here for the UI additions
    // e.g., using `vencord/api/patcher`
    patches: [
        // Example: Inject into context menus
    ]
});
