import definePlugin from "@utils/types";
import { pluginInfo } from "./info";
import { moduleRegistry } from "./core/moduleRegistry";
import { actionQueue } from "./core/actionQueue";
import { logger } from "./utils/logger";
import { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { socializeCommands } from "./commands";

// --- Module Settings Imports ---
import { OwnershipModule, ownershipSettings } from "./modules/ownership";
import { WhitelistModule, whitelistSettings } from "./modules/whitelist";
import { BlacklistModule, blacklistSettings } from "./modules/blacklist";
import { BansModule, banSettings } from "./modules/bans";
import { RoleEnforcementModule, roleEnforcementSettings } from "./modules/roleEnforcement";
import { VoteBanningModule, voteBanningSettings } from "./modules/voteBanning";
import { ChannelNameRotationModule, channelNameRotationSettings } from "./modules/channelNameRotation";
import { CommandCleanupModule, commandCleanupSettings } from "./modules/commandCleanup";
import { RemoteOperatorsModule, remoteOperatorsSettings } from "./modules/remoteOperators";
import { AutoClaimModule, autoClaimSettings } from "./modules/autoClaim";

export const defaultSettings = definePluginSettings({
    // ── Global Plugin Settings ────────────────────────────────────────────
    botId: { type: OptionType.STRING, description: "The ID of the moderation bot", default: "983811802901323796", restartNeeded: false },
    guildId: { type: OptionType.STRING, description: "The ID of the guild where the plugin is active", default: "1165682841443831868", restartNeeded: false },
    categoryId: { type: OptionType.STRING, description: "The ID of the voice channel category", default: "1166304899580252180", restartNeeded: false },
    creationChannelId: { type: OptionType.STRING, description: "The ID of the channel used to create new ones", default: "763914043252801566", restartNeeded: false },
    queueEnabled: { type: OptionType.BOOLEAN, description: "Enable the action queue", default: true, restartNeeded: false },
    queueInterval: { type: OptionType.SLIDER, description: "Delay between sending commands in queue (seconds)", default: 1.5, markers: [0.5, 1, 1.5, 2, 5], stickToMarkers: false, restartNeeded: false },
    enableDebug: { type: OptionType.BOOLEAN, description: "Enable debug logging", default: false, restartNeeded: false },

    // ── Module Specific Settings ──────────────────────────────────────────
    ...ownershipSettings,
    ...whitelistSettings,
    ...blacklistSettings,
    ...banSettings,
    ...roleEnforcementSettings,
    ...voteBanningSettings,
    ...channelNameRotationSettings,
    ...commandCleanupSettings,
    ...remoteOperatorsSettings,
    ...autoClaimSettings
});


// Register all logic modules
moduleRegistry.register(OwnershipModule);
moduleRegistry.register(WhitelistModule);
moduleRegistry.register(BlacklistModule);
moduleRegistry.register(BansModule);
moduleRegistry.register(RoleEnforcementModule);
moduleRegistry.register(VoteBanningModule);
moduleRegistry.register(ChannelNameRotationModule);
moduleRegistry.register(CommandCleanupModule);
moduleRegistry.register(RemoteOperatorsModule);
moduleRegistry.register(AutoClaimModule);

export default definePlugin({
    ...pluginInfo,
    settings: defaultSettings,
    commands: socializeCommands,

    start() {
        logger.info(`${pluginInfo.name} starting...`);

        // Setup the action queue with a real command sender
        const { MessageActions } = require("@webpack/common");
        actionQueue.setCommandSender(async (content, channelId) => {
            return MessageActions.sendMessage(channelId, { content });
        });

        // Initialize all modules with current settings
        moduleRegistry.init(this.settings.store as any);

        logger.info(`${pluginInfo.name} started.`);
    },

    stop() {
        logger.info(`${pluginInfo.name} stopping...`);
        moduleRegistry.stop();
        actionQueue.clear();
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[] }) {
            for (const state of voiceStates) {
                // We normalize simple state for use in our registry
                moduleRegistry.dispatchVoiceStateUpdate({ ...state, channelId: state.oldChannelId }, state);
            }
        },

        MESSAGE_CREATE({ message }: { message: any }) {
            moduleRegistry.dispatchMessageCreate(message);
        }
    },

    contextMenus: {
        UserProfileContextMenu(node, { user }) {
            return moduleRegistry.collectUserItems(user);
        },
        ChannelListContextMenu(node, { channel }) {
            return moduleRegistry.collectChannelItems(channel);
        },
        GuildContextMenu(node, { guild }) {
            return moduleRegistry.collectGuildItems(guild);
        }
    },

    toolboxActions() {
        const { SelectedChannelStore, ChannelStore: CS } = require("@webpack/common");
        const channelId = SelectedChannelStore.getVoiceChannelId() || SelectedChannelStore.getChannelId();
        const channel = channelId ? CS.getChannel(channelId) : undefined;

        const items = moduleRegistry.collectToolboxItems(channel);
        return items.length ? items : null;
    }
});
