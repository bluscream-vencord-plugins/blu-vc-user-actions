import { OwnerEntry, PluginVoiceChannel } from "./PluginVoiceChannel";
import { ActionItem } from "./ActionItem";
import { User, Guild, Message } from "@vencord/discord-types";
import { React } from "@webpack/common";

export interface PluginModule {
    id: string;
    name: string;
    description?: string;
    settings?: any;

    // Context Menu Items (Grouped)
    getChannelMenuItems?: (channel: PluginVoiceChannel) => React.ReactElement | React.ReactElement[] | null;
    getUserMenuItems?: (user: User, channelId?: string, guildId?: string) => React.ReactElement | React.ReactElement[] | null;
    getGuildMenuItems?: (guild: Guild) => React.ReactElement | React.ReactElement[] | null;
    getToolboxMenuItems?: (channel?: PluginVoiceChannel) => React.ReactElement | React.ReactElement[] | null;

    // Event hooks
    onMessageCreate?: (message: Message, channel: PluginVoiceChannel, guild: Guild | null) => void;
    onVoiceStateUpdate?: (voiceStates: any[]) => void;
    onStart?: () => void;
    onStop?: () => void;
    onUserJoined?: (channel: PluginVoiceChannel, user: User) => void;
    onUserLeft?: (channel: PluginVoiceChannel, user: User) => void;
    onChannelCreatorChanged?: (channel: PluginVoiceChannel, oldCreator: OwnerEntry | undefined, newCreator: OwnerEntry | undefined) => void;
    onChannelClaimantChanged?: (channel: PluginVoiceChannel, oldClaimant: OwnerEntry | undefined, newCreator: OwnerEntry | undefined) => void;
    onSettingsUpdate?: (settings: any) => void;
    onActionDequeue?: (item: ActionItem) => void;
    commands?: any[];
}
