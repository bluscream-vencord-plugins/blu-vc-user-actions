import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const pluginName = "SocializeGuild";

export const settings = definePluginSettings({
    autoKickList: {
        type: OptionType.STRING,
        description: "List of user IDs to auto kick (newline separated)",
        default: "",
        multiline: true,
    },
    autoKickMessage: {
        type: OptionType.STRING,
        description: "Message to send when a user in the auto kick list joins",
        default: "!v kick {user_id}",
    },
    autoKickMessageReference: {
        type: OptionType.STRING,
        description: "Template Reference - Variables: ",
        default: `{now} = Datetime of message being sent
{now:DD.MM.YY HH:mm:ss} = Datetime with custom format
{my_id} = Your own User ID
{my_name} = Your own User Name
{guild_id} = Current Guild ID
{guild_name} = Current Guild Name
{channel_id} = Current Channel ID
{channel_name} = Current Channel Name
{user_id} = Target User ID
{user_name} = Target User Name`,
        readonly: true,
        multiline: true,
        onChange(_) {
            settings.store.autoKickMessageReference = settings.def.autoKickMessageReference.default;
        }
    },
    ownershipChangeMessage: {
        type: OptionType.STRING,
        description: "Message to show when ownership is detected",
        default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})",
    },
    ownershipChangeMessageReference: {
        type: OptionType.STRING,
        description: "Template Reference - Variables: ",
        default: `{now} = Datetime of message being sent
{now:DD.MM.YY HH:mm:ss} = Datetime with custom format
{my_id} = Your own User ID
{my_name} = Your own User Name
{guild_id} = Current Guild ID
{guild_name} = Current Guild Name
{channel_id} = Current Channel ID
{channel_name} = Current Channel Name
{user_id} = Owner User ID
{user_name} = Owner User Name
{reason} = Reason for ownership (Created/Claimed)`,
        readonly: true,
        multiline: true,
        onChange(_) {
            settings.store.ownershipChangeMessageReference = settings.def.ownershipChangeMessageReference.default;
        }
    },
    createChannelId: {
        type: OptionType.STRING,
        description: "The Channel ID to join when clicking 'Create Channel'",
        default: "763914043252801566",
    },
    botId: {
        type: OptionType.STRING,
        description: "The Bot ID that sends the welcome message",
        default: "913852862990262282",
    },
    guildId: {
        type: OptionType.STRING,
        description: "The Guild ID for this plugin",
        default: "505974446914535426",
    },
    queueTime: {
        type: OptionType.SLIDER,
        description: "Minimum time between actions in ms",
        default: 2500,
        min: 0,
        max: 10000,
        markers: [0, 250, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000],
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automated actions",
        default: true,
    },
    categoryId: {
        type: OptionType.STRING,
        description: "The Category ID to monitor for channel owners",
        default: "763914042628112455",
    },
    fetchOwnersOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Fetch all owners in the category on startup",
        default: false,
    },
});
