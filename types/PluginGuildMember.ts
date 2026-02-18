import { MemberChannelInfo } from "./MemberChannelInfo";

/**
 * Represents a guild member tracked by the plugin, with associated
 * channel info parsed from bot messages.
 */
export interface PluginGuildMember {
    /** The user ID — always present. */
    id: string;
    /** Channel settings/info parsed from bot messages for this member. */
    channelInfo?: MemberChannelInfo;
}
