import type { Channel } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildChannelStore, VoiceStateStore } from "@webpack/common";

/**
 * Checks if a channel object represents a voice or stage channel.
 */
export const isVoiceChannel = (channel: Channel | null | undefined): channel is Channel =>
    channel?.type === ChannelType.GUILD_VOICE || channel?.type === ChannelType.GUILD_STAGE_VOICE;

/**
 * Checks if a channel object represents a stage channel.
 */
export const isStageChannel = (channel: Channel | null | undefined): channel is Channel =>
    channel?.type === ChannelType.GUILD_STAGE_VOICE;

/**
 * Checks if a channel object represents a guild text channel.
 */
export const isTextChannel = (channel: Channel | null | undefined): channel is Channel =>
    channel?.type === ChannelType.GUILD_TEXT;

/**
 * Checks if a channel object represents a guild channel (not a DM).
 */
export const isGuildChannel = (channel: any): channel is Channel =>
    channel && typeof channel.isDM === "function" ? !channel.isDM() && !channel.isGroupDM() : false;

/**
 * Finds the text channel associated with a voice channel (matching category and name).
 * @param voiceChannel The voice channel object or ID
 * @returns The associated text channel or null
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
 * Checks if a user is currently a member of a specific voice channel.
 * @param userId The ID of the user
 * @param channelId The ID of the voice channel
 */
export function isUserInVoiceChannel(userId: string, channelId: string): boolean {
    if (!userId || !channelId) return false;
    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
    return !!voiceStates?.[userId];
}
