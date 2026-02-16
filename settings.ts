import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { state } from "./state";

export const settings = definePluginSettings({
    autoKickList: {
        type: OptionType.STRING,
        description: "List of user IDs to act on (auto-kick, ban-rotate) [newline separated]",
        default: "",
        multiline: true,
        restartNeeded: false,
    },
    userWhitelist: {
        type: OptionType.STRING,
        description: "List of user IDs ignored by automated actions [newline separated]",
        default: "",
        multiline: true,
        restartNeeded: false,
    },
    autoKickEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable auto kicking of banned users",
        default: false,
        restartNeeded: false,
        hidden: true
    },
    kickNotInRole: {
        type: OptionType.STRING,
        description: "Role ID required to stay in the channel (Auto-Kick if missing)",
        default: "",
        restartNeeded: false,
    },
    banRotateEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable rotating banlist",
        default: false,
        restartNeeded: false,
    },
    voteBanEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable vote ban system",
        default: false,
        restartNeeded: false,
    },
    voteRequiredPercent: {
        type: OptionType.SLIDER,
        description: "Percentage of users required to vote ban someone (excludes owner)",
        default: 51,
        min: 1,
        max: 100,
        markers: [1, 25, 50, 75, 100],
        stickToMarkers: false,
        restartNeeded: false,
    },
    voteExpireMinutes: {
        type: OptionType.NUMBER,
        description: "Time before a vote expires in minutes",
        default: 15,
        min: 1,
        max: 300,
        restartNeeded: false,
    },
    rotateChannelNames: {
        type: OptionType.STRING,
        description: "Will rotate through these channel names every rotateChannelNamesTime minutes",
        default: "",
        multiline: true,
        onChange: () => state.onRotationSettingsChange(),
        restartNeeded: false,
    },
    rotateChannelNamesEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable channel name rotation",
        default: false,
        onChange: () => state.onRotationSettingsChange(),
        restartNeeded: false,
    },
    rotateChannelNamesTime: {
        type: OptionType.SLIDER,
        description: "Time before the next channel name is set in minutes",
        default: 11,
        min: 11,
        markers: [11, 15, 30, 60, 120],
        stickToMarkers: false,
        restartNeeded: false,
        onChange: () => state.onRotationSettingsChange(),
    },
    ownershipChangeNotificationAny: {
        type: OptionType.BOOLEAN,
        description: "Show notification for any channel ownership change",
        default: false,
        restartNeeded: false,
    },
    autoClaimDisbanded: {
        type: OptionType.BOOLEAN,
        description: "Automatically claim the channel you're in when its owner leaves",
        default: false,
        restartNeeded: false,
    },
    autoNavigateToOwnedChannel: {
        type: OptionType.BOOLEAN,
        description: "Automatically navigate to the channel you own",
        default: true,
        restartNeeded: false,
    },
    fetchOwnersOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Fetch all owners in the category on startup",
        default: false,
        restartNeeded: false,
    },
    showChannelInfoChangeMessage: {
        type: OptionType.BOOLEAN,
        description: "Causes a message to be sent to the channel when the channel info changes",
        default: false,
        restartNeeded: false,
    },
    ownershipChangeMessage: {
        type: OptionType.STRING,
        description: "Message to show when ownership is detected",
        default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})",
        restartNeeded: false,
    },
    kickNotInRoleMessage: {
        type: OptionType.STRING,
        description: "Ephemeral message to show when a user is kicked for missing the required role",
        default: "🚫 Kicking <@{user_id}> because they are missing the required role",
        restartNeeded: false,
    },
    whitelistSkipMessage: {
        type: OptionType.STRING,
        description: "Ephemeral message to show when an action is skipped for a whitelisted user.",
        default: "🛡️ Skipped {action} action for whitelisted user <@{user_id}>",
        restartNeeded: false,
    },
    banRotationMessage: {
        type: OptionType.STRING,
        description: "Ephemeral message to show when a ban rotates.",
        default: "♾️ Banned user <@{user_id_old}> has been replaced with <@{user_id}>",
        restartNeeded: false,
    },
    voteSubmittedMessage: {
        type: OptionType.STRING,
        description: "Ephemeral message to show when a vote is submitted",
        default: "<@{user_id}> votes to ban <@{target_user_id}> (Expires {discordtime})",
        restartNeeded: false,
    },
    voteBanCommand: {
        type: OptionType.STRING,
        description: "Message to parse for vote ban system",
        default: "!vote ban {target}",
        restartNeeded: false,
    },
    kickCommand: {
        type: OptionType.STRING,
        description: "Message to send when a user in the auto kick list joins",
        default: "!v kick {user_id}",
        restartNeeded: false,
    },
    banCommand: {
        type: OptionType.STRING,
        description: "Message to send when a user not in ban rotation joins",
        default: "!v ban {user_id}",
        restartNeeded: false,
    },
    unbanCommand: {
        type: OptionType.STRING,
        description: "Message to send when a user not in ban rotation joins",
        default: "!v unban {user_id}",
        restartNeeded: false,
    },
    setChannelNameCommand: {
        type: OptionType.STRING,
        description: "Message to send to set a channel name",
        default: "!v name {channel_name_new}",
        restartNeeded: false,
    },
    claimCommand: {
        type: OptionType.STRING,
        description: "Message to send to claim a channel",
        default: "!v claim",
        restartNeeded: false,
    },
    infoCommand: {
        type: OptionType.STRING,
        description: "Message to send to get channel info",
        default: "!v info",
        restartNeeded: false,
    },
    queueTime: {
        type: OptionType.SLIDER,
        description: "Minimum time between actions in ms",
        default: 2500,
        min: 0,
        max: 10000,
        markers: [0, 250, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000],
        stickToMarkers: false,
        restartNeeded: false,
    },
    banLimit: {
        type: OptionType.NUMBER,
        description: "The amount of bans you can have before needing to rotate",
        default: 5,
        restartNeeded: false,
    },
    createChannelId: {
        type: OptionType.STRING,
        description: "The Channel ID to join when clicking 'Create Channel'",
        default: "763914043252801566",
        restartNeeded: false,
    },
    botId: {
        type: OptionType.STRING,
        description: "The Bot ID that sends the welcome message",
        default: "913852862990262282",
        restartNeeded: false,
    },
    categoryId: {
        type: OptionType.STRING,
        description: "The Category ID to monitor for channel owners",
        default: "763914042628112455",
        restartNeeded: false,
    },
    guildId: {
        type: OptionType.STRING,
        description: "The Guild ID for this plugin",
        default: "505974446914535426",
        restartNeeded: false,
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automated actions",
        default: true,
        restartNeeded: false,
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
        },
        restartNeeded: false,
    },
});
