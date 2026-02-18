import { OptionType } from "@utils/types";
import { Menu, showToast } from "@webpack/common";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";
import { pluginInfo } from "../info";
import { PluginModule } from "../types/PluginModule";
import { log, error } from "../utils/logging";
import { ApplicationCommandOptionType } from "@api/Commands";
import { channelOwners, memberInfos } from "../state";

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
        queueTime: {
            type: OptionType.SLIDER as const,
            description: "Time in ms to wait between actions",
            default: 1000,
            min: 500,
            max: 5000,
            markers: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000],
            stickToMarkers: false,
            restartNeeded: false,
        },
    },
    commands: [
        {
            name: "stats", description: "Show plugin statistics", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const embed = {
                    type: "rich",
                    title: "📈 Socialize Guild Stats",
                    color: 0x5865F2,
                    fields: [
                        { name: "👑 Owned Channels", value: channelOwners.size.toString(), inline: true },
                        { name: "👤 Member Infos", value: memberInfos.size.toString(), inline: true },
                        { name: "Modules", value: require("../ModuleRegistry").Modules.length.toString(), inline: true }
                    ]
                };
                sendBotMessage(ctx.channel.id, { embeds: [embed] });
            }
        },
        {
            name: "reset-state", description: "Reset plugin state", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const { resetState } = require("../state");
                resetState();
                sendBotMessage(ctx.channel.id, { content: "✅ Plugin state has been reset." });
            }
        },
        {
            name: "reset-settings", description: "Reset plugin settings", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const { settings } = require("../settings");
                for (const key in settings.def) {
                    const opt = (settings.def as any)[key];
                    if (key === "enabled" || opt.readonly) continue;
                    (settings.store as any)[key] = opt.default;
                }
                sendBotMessage(ctx.channel.id, { content: "✅ Settings have been reset to defaults." });
            }
        },
    ],
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
