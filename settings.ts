import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { state } from "./state";

export const pluginName = "SocializeGuild";

export const settings = definePluginSettings({
    rotateChannelNamesEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable channel name rotation",
        default: false,
        onChange: () => state.onRotationSettingsChange(),
    },
    rotateChannelNamesTime: {
        type: OptionType.SLIDER,
        description: "Time before the next channel name is set in seconds",
        default: 15,
        min: 10,
        markers: [10, 15, 30, 60, 120, 300, 600],
        onChange: () => state.onRotationSettingsChange(),
    },
    rotateChannelNames: {
        type: OptionType.STRING,
        description: "Will rotate through these channel names every rotateChannelNamesTime seconds",
        default: "",
        multiline: true,
        onChange: () => state.onRotationSettingsChange(),
    },
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
    setChannelNameMessage: {
        type: OptionType.STRING,
        description: "Message to send to set a channel name (uses setChannelNameMessageReference)",
        default: "!v name {channel_name_new}",
    },
    setChannelNameMessageReference: {
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
{reason} = Reason for ownership (Created/Claimed)
{channel_name_new} = New Channel Name`,
        readonly: true,
        multiline: true,
        onChange(_) {
            settings.store.setChannelNameMessageReference = settings.def.setChannelNameMessageReference.default;
        }
    },
    claimMessage: {
        type: OptionType.STRING,
        description: "Message to send to claim a channel (uses ownershipChangeMessageReference)",
        default: "!v claim",
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
    queueTime: {
        type: OptionType.SLIDER,
        description: "Minimum time between actions in ms",
        default: 2500,
        min: 0,
        max: 10000,
        markers: [0, 250, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000],
    },
    autoClaimDisbanded: {
        type: OptionType.BOOLEAN,
        description: "Automatically claim the channel you're in when its owner leaves",
        default: false,
    },
    autoClaimDisbandedAny: {
        type: OptionType.BOOLEAN,
        description: "Automatically claim any channel when their owner left",
        default: false,
    },
    fetchOwnersOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Fetch all owners in the category on startup",
        default: false,
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automated actions",
        default: true,
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
    categoryId: {
        type: OptionType.STRING,
        description: "The Category ID to monitor for channel owners",
        default: "763914042628112455",
    },
    guildId: {
        type: OptionType.STRING,
        description: "The Guild ID for this plugin",
        default: "505974446914535426",
    },
});
