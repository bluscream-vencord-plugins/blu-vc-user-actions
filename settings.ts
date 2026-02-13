import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { state } from "./state";

export const pluginName = "SocializeGuild";

export const settings = definePluginSettings({
    autoKickList: {
        type: OptionType.STRING,
        description: "List of user IDs to act on (auto-kick, ban-rotate) [newline separated]",
        default: "",
        multiline: true,
    },
    userWhitelist: {
        type: OptionType.STRING,
        description: "List of user IDs ignored by automated actions [newline separated]",
        default: "",
        multiline: true,
    },
    autoKickEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable auto kicking of banned users",
        default: false
    },
    banRotateEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable rotating banlist",
        default: false
    },
    rotateChannelNames: {
        type: OptionType.STRING,
        description: "Will rotate through these channel names every rotateChannelNamesTime seconds",
        default: "",
        multiline: true,
        onChange: () => state.onRotationSettingsChange(),
    },
    rotateChannelNamesEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable channel name rotation",
        default: false,
        onChange: () => state.onRotationSettingsChange(),
    },
    rotateChannelNamesTime: {
        type: OptionType.SLIDER,
        description: "Time before the next channel name is set in minutes",
        default: 15,
        min: 10,
        markers: [10, 15, 30, 60, 120, 300],
        onChange: () => state.onRotationSettingsChange(),
    },
    ownershipChangeNotificationAny: {
        type: OptionType.BOOLEAN,
        description: "Show notification for any channel ownership change",
        default: false,
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
    autoNavigateToOwnedChannel: {
        type: OptionType.BOOLEAN,
        description: "Automatically navigate to the channel you own",
        default: true,
    },
    fetchOwnersOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Fetch all owners in the category on startup",
        default: false,
    },
    ownershipChangeMessage: {
        type: OptionType.STRING,
        description: "Message to show when ownership is detected",
        default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})",
    },
    whitelistSkipMessage: {
        type: OptionType.STRING,
        description: "Ephemeral message to show when an action is skipped for a whitelisted user.",
        default: "🛡️ Skipped {action} action for whitelisted user <@{user_id}>",
    },
    banRotationMessage: {
        type: OptionType.STRING,
        description: "Ephemeral message to show when a ban rotates.",
        default: "♾️ Banned user <@{user_id_old}> has been replaced with <@{user_id}>",
    },
    kickCommand: {
        type: OptionType.STRING,
        description: "Message to send when a user in the auto kick list joins",
        default: "!v kick {user_id}",
    },
    banCommand: {
        type: OptionType.STRING,
        description: "Message to send when a user not in ban rotation joins",
        default: "!v ban {user_id}",
    },
    unbanCommand: {
        type: OptionType.STRING,
        description: "Message to send when a user not in ban rotation joins",
        default: "!v unban {user_id}",
    },
    setChannelNameCommand: {
        type: OptionType.STRING,
        description: "Message to send to set a channel name",
        default: "!v name {channel_name_new}",
        group: ""
    },
    claimCommand: {
        type: OptionType.STRING,
        description: "Message to send to claim a channel",
        default: "!v claim",
    },
    infoCommand: {
        type: OptionType.STRING,
        description: "Message to send to get channel info",
        default: "!v info",
    },
    queueTime: {
        type: OptionType.SLIDER,
        description: "Minimum time between actions in ms",
        default: 2500,
        min: 0,
        max: 10000,
        markers: [0, 250, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000],
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
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automated actions",
        default: true,
    },
    messageReference: {
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
            settings.store.messageReference = settings.def.messageReference.default;
        }
    },
});
