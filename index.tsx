import definePlugin from "@utils/types";
import { pluginInfo } from "./info";
import { defaultSettings } from "./types/settings";
import { PluginSettings } from "./types/settings";
import { moduleRegistry } from "./logic/moduleRegistry";
import { stateManager } from "./utils/stateManager";
import { logger } from "./utils/logger";
import { socializeCommands } from "./commands";
import { actionQueue } from "./utils/actionQueue";
import { ChannelStore, GuildChannelStore } from "@webpack/common";

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
        logger.info("Starting SocializeGuild Plugin...");

        stateManager.init(this.settings.store || {});
        actionQueue.setDelay((this.settings.store.queueInterval || 2) * 1000);

        // Use Vencord's sendMessage wrapper which properly fills in all required
        // Discord message fields (invalidEmojis, tts, validNonShortcutEmojis).
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
        VOICE_STATE_UPDATE(event: any) {
            try {
                moduleRegistry.dispatchVoiceStateUpdate(event.oldState, event.newState);
            } catch (e) {
                logger.error("Error in VOICE_STATE_UPDATE:", e);
            }
        },

        MESSAGE_CREATE({ message, channelId, guildId }: { message: any; channelId: string; guildId: string; }) {
            try {
                const s = moduleRegistry.settings;
                if (!s) return;

                // Fast-path guild filter — ignore messages from other guilds
                if (guildId && guildId !== s.guildId) return;

                // Resolve the channel and check if it belongs to our managed category
                const channel = ChannelStore.getChannel(channelId);
                if (!channel) return;

                // Only handle messages from channels in our managed category.
                // Voice channels in Discord get a linked text channel with the same parent_id.
                if (channel.parent_id !== s.categoryId) return;

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
