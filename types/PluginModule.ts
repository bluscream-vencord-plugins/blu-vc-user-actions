import { ChannelOwner } from "./ChannelOwnership";
import { Channel, User, Guild, Message } from "@vencord/discord-types";
import { React } from "@webpack/common";

export interface PluginModule {
    id: string;
    name: string;
    description?: string;
    settings?: any;

    // Context Menu Items (Grouped)
    getChannelMenuItems?: (channel: Channel) => React.ReactElement | React.ReactElement[] | null;
    getUserMenuItems?: (user: User, channelId?: string, guildId?: string) => React.ReactElement | React.ReactElement[] | null;
    getGuildMenuItems?: (guild: Guild) => React.ReactElement | React.ReactElement[] | null;
    getToolboxMenuItems?: (channelId?: string) => React.ReactElement | React.ReactElement[] | null;

    // Event hooks
    onMessageCreate?: (message: Message, channel: Channel, guild: Guild | null) => void;
    onVoiceStateUpdate?: (voiceStates: any[]) => void;
    onStart?: () => void;
    onStop?: () => void;
    onUserJoined?: (channel: Channel, user: User) => void;
    onUserLeft?: (channel: Channel, user: User) => void;
    onChannelCreatorChanged?: (channel: Channel, oldCreator: ChannelOwner | undefined, newCreator: ChannelOwner | undefined) => void;
    onChannelClaimantChanged?: (channel: Channel, oldClaimant: ChannelOwner | undefined, newCreator: ChannelOwner | undefined) => void;
    onSettingsUpdate?: (settings: any) => void;
    commands?: any[];
}
