import { ChannelOwner } from "./ChannelOwnership";
import { Channel, User, Guild } from "@vencord/discord-types";
import { React } from "@webpack/common";

export interface PluginModule {
    id: string;
    name: string;
    description?: string;
    settings?: Record<string, object>;

    // Context Menu Items (Grouped)
    getChannelMenuItems?: (channel: Channel) => React.ReactElement | React.ReactElement[] | null;
    getUserMenuItems?: (user: User, channelId?: string, guildId?: string) => React.ReactElement | React.ReactElement[] | null;
    getGuildMenuItems?: (guild: Guild) => React.ReactElement | React.ReactElement[] | null;
    getToolboxMenuItems?: (channelId?: string) => React.ReactElement | React.ReactElement[] | null;

    // Event hooks
    onMessageCreate?: (message: any, channelId: string, guildId?: string) => void;
    onVoiceStateUpdate?: (voiceStates: any[]) => void;
    onStart?: () => void;
    onStop?: () => void;
    onUserJoined?: (channelId: string, userId: string) => void;
    onUserLeft?: (channelId: string, userId: string) => void;
    onChannelCreatorChanged?: (channelId: string, oldCreator: ChannelOwner | undefined, newCreator: ChannelOwner | undefined) => void;
    onChannelClaimantChanged?: (channelId: string, oldClaimant: ChannelOwner | undefined, newCreator: ChannelOwner | undefined) => void;
    onSettingsUpdate?: (settings: any) => void;
}
