import type { Channel } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildChannelStore, VoiceStateStore } from "@webpack/common";

export const isVoiceChannel = (channel: Channel | null | undefined): channel is Channel =>
    channel?.type === ChannelType.GUILD_VOICE || channel?.type === ChannelType.GUILD_STAGE_VOICE;

export const isStageChannel = (channel: Channel | null | undefined): channel is Channel =>
    channel?.type === ChannelType.GUILD_STAGE_VOICE;

export const isTextChannel = (channel: Channel | null | undefined): channel is Channel =>
    channel?.type === ChannelType.GUILD_TEXT;

export const isGuildChannel = (channel: any): channel is Channel =>
    channel && typeof channel.isDM === "function" ? !channel.isDM() && !channel.isGroupDM() : false;

/**
 * Finds the text channel associated with a voice channel.
 * Looks for a text channel in the same category with the same name (case-sensitive).
 * Returns the text channel, or null if none is found.
 */
export function findAssociatedTextChannel(voiceChannel: Channel | string | null | undefined): Channel | null {
    const ch = typeof voiceChannel === "string"
        ? ChannelStore.getChannel(voiceChannel)
        : voiceChannel;
    if (!ch?.guild_id || !ch.parent_id) return null;

    const guildChannels = GuildChannelStore.getChannels(ch.guild_id);
    const selectable: { channel: Channel; }[] = guildChannels?.SELECTABLE ?? [];

    return selectable
        .map(c => c.channel)
        .find(c =>
            isTextChannel(c) &&
            c.parent_id === ch.parent_id &&
            c.name === ch.name
        ) ?? null;
}

/**
 * Checks if a specific user is currently in a given voice channel.
 */
export function isUserInVoiceChannel(userId: string, channelId: string): boolean {
    if (!userId || !channelId) return false;
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
    return !!voiceStates?.[userId];
}
