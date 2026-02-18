import { OptionType } from "@utils/types";
import { Menu, showToast } from "@webpack/common";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";
import { pluginInfo } from "../info";
import { PluginModule } from "../types/PluginModule";
import { log, error } from "../utils/logging";

// #region Settings
// #endregion

export const CoreMenuItems = {
    getResetStateItem: () => (
        <Menu.MenuItem
            id="socialize-guild-reset-state"
            label="Reset Plugin State"
            action={() => {
                const { resetState } = require("../state");
                resetState();
                showToast("Plugin state has been reset.");
            }}
            color="danger"
        />
    ),

    getResetSettingsItem: () => (
        <Menu.MenuItem
            id="socialize-guild-reset-settings"
            label="Reset Settings"
            action={() => {
                const { settings } = require("../settings");
                for (const key in settings.def) {
                    const opt = (settings.def as any)[key];
                    if (key === "enabled" || opt.readonly) continue;
                    try {
                        (settings.store as any)[key] = opt.default;
                    } catch (e) {
                        error(`Failed to reset setting ${key}:`, e);
                    }
                }
                showToast("Settings have been reset to defaults.");
            }}
            color="danger"
        />
    ),

    getEditSettingsItem: () => (
        <Menu.MenuItem
            id="blu-vc-user-actions-settings"
            label="Edit Settings"
            action={() => openPluginModal(plugins[pluginInfo.name])}
        />
    )
};

export const CoreModule: PluginModule = {
    id: "core",
    name: "General",
    settings: {
        guildId: {
            type: OptionType.STRING as const,
            description: "The Guild ID for this plugin",
            default: "505974446914535426",
            restartNeeded: false,
        },
        categoryId: {
            type: OptionType.STRING as const,
            description: "The Category ID to monitor for channel owners",
            default: "763914042628112455",
            restartNeeded: false,
        },
        createChannelId: {
            type: OptionType.STRING as const,
            description: "The Channel ID to join when clicking 'Create Channel'",
            default: "763914043252801566",
            restartNeeded: false,
        },
        botId: {
            type: OptionType.STRING as const,
            description: "The Bot ID that sends the welcome message",
            default: "913852862990262282",
            restartNeeded: false,
        },
        enabled: {
            type: OptionType.BOOLEAN as const,
            description: "Enable automated actions",
            default: true,
            restartNeeded: false,
        },
        messageReference: {
            type: OptionType.STRING as const,
            description: "Template Reference - Variables: ",
            default: `{now} = Datetime of message being sent
{now:DD.MM.YY HH:mm:ss} = Datetime with custom format
{my_id} = Your own User ID
{my_name} = Your own User Name
{guild_id} = Current Guild ID
{guild_name} = Current Guild Name
{channel_id} = Current Channel ID
{channel_name} = Current Channel Name
{user_id} = User ID [ownershipChangeMessage, kickCommand, banCommand, unbanCommand, claimCommand, setChannelNameCommand, banRotationMessage, whitelistSkipMessage]
{user_name} = User Name [ownershipChangeMessage, kickCommand, banCommand, unbanCommand, claimCommand, setChannelNameCommand, banRotationMessage, whitelistSkipMessage]
{user_id_old} = Old User ID [banRotationMessage]
{user_name_old} = Old User Name [banRotationMessage]
{action} = Action Type [whitelistSkipMessage]
{reason} = Reason for ownership (Unknown/Created/Claimed) [ownershipChangeMessage, setChannelNameCommand]
{channel_name_new} = New channel name [setChannelNameCommand]`,
            readonly: true,
            multiline: true,
            onChange(_) {
                const { settings } = require("../settings");
                settings.store.messageReference = settings.def.messageReference.default;
            },
            restartNeeded: false,
        },
    },
    getGuildMenuItems: () => [
        CoreMenuItems.getEditSettingsItem(),
        CoreMenuItems.getResetStateItem(),
        CoreMenuItems.getResetSettingsItem()
    ],
    getToolboxMenuItems: () => [
        CoreMenuItems.getEditSettingsItem()
    ]
};

// #endregion
