import { Channel } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { findAssociatedTextChannel, isTextChannel } from "../utils/channels";

/** Minimum ownership data stored per creator/claimant. */
export interface OwnerEntry {
    userId: string;
    timestamp: number;
}

/**
 * Represents a managed voice channel with optional Discord Channel object
 * and ownership tracking. Replaces the old ChannelOwnership interface and
 * the empty ChannelCreator/ChannelClaimant subclasses.
 *
 * Carries utility methods for common operations so callers don't need to
 * import stores directly.
 */
export class PluginVoiceChannel {
    /** The channel ID — always present, even if the Discord object isn't cached. */
    id: string;
    /** The Discord Channel object, if available in the cache. */
    channel?: Channel;
    /** The user who originally created this channel. */
    creator?: OwnerEntry;
    /** The user who last claimed this channel (after the creator left). */
    claimant?: OwnerEntry;

    constructor(id: string, channel?: Channel) {
        this.id = id;
        this.channel = channel;
    }

    // ─── Ownership helpers ────────────────────────────────────────────────────

    /** Returns the effective owner: claimant if present, otherwise creator. */
    get effectiveOwner(): OwnerEntry | undefined {
        return this.claimant ?? this.creator;
    }

    /** Returns true if the given userId is the creator or claimant of this channel. */
    isOwner(userId: string): boolean {
        return this.creator?.userId === userId || this.claimant?.userId === userId;
    }

    /** Returns true if the given userId is specifically the creator. */
    isCreator(userId: string): boolean {
        return this.creator?.userId === userId;
    }

    /** Returns true if the given userId is specifically the claimant. */
    isClaimant(userId: string): boolean {
        return this.claimant?.userId === userId;
    }

    // ─── Channel resolution helpers ───────────────────────────────────────────

    /**
     * Resolves and returns the live Discord Channel object from the cache.
     * Falls back to the stored `channel` property if already set.
     */
    resolve(): Channel | undefined {
        if (this.channel) return this.channel;
        const { ChannelStore } = require("@webpack/common");
        return ChannelStore.getChannel(this.id) ?? undefined;
    }

    /**
     * Finds the text channel in the same category that shares this voice
     * channel's name. This is the conventional Discord pattern for
     * voice-linked text channels.
     *
     * Returns null if no matching text channel is found.
     */
    getLinkedTextChannel(): Channel | null {
        return findAssociatedTextChannel(this.resolve() ?? this.id);
    }

    /**
     * Returns all text channels in the same category as this voice channel.
     */
    getSiblingTextChannels(): Channel[] {
        const ch = this.resolve();
        if (!ch?.guild_id || !ch.parent_id) return [];

        const { GuildChannelStore } = require("@webpack/common");
        const guildChannels = GuildChannelStore.getChannels(ch.guild_id);
        const selectable: { channel: Channel; }[] = guildChannels?.SELECTABLE ?? [];

        return selectable
            .map(c => c.channel)
            .filter(c => isTextChannel(c) && c.parent_id === ch.parent_id);
    }

    /**
     * Returns all voice channels in the same category as this channel.
     * Useful for listing sibling channels in the same managed category.
     */
    getSiblingVoiceChannels(): Channel[] {
        const ch = this.resolve();
        if (!ch?.guild_id || !ch.parent_id) return [];

        const { GuildChannelStore } = require("@webpack/common");
        const guildChannels = GuildChannelStore.getChannels(ch.guild_id);
        const vocal: { channel: Channel; }[] = guildChannels?.VOCAL ?? [];

        return vocal
            .map(c => c.channel)
            .filter(c => c.parent_id === ch.parent_id && c.id !== this.id);
    }

    /**
     * Returns the category (parent) channel for this voice channel, if any.
     */
    getCategory(): Channel | undefined {
        const ch = this.resolve();
        if (!ch?.parent_id) return undefined;
        const { ChannelStore } = require("@webpack/common");
        return ChannelStore.getChannel(ch.parent_id) ?? undefined;
    }

    /**
     * Returns the current number of users in this voice channel.
     */
    getOccupantCount(): number {
        const { VoiceStateStore } = require("@webpack/common");
        const states = VoiceStateStore.getVoiceStatesForChannel(this.id);
        return states ? Object.keys(states).length : 0;
    }

    /**
     * Returns true if the voice channel is currently empty.
     */
    isEmpty(): boolean {
        return this.getOccupantCount() === 0;
    }

    // ─── Serialization ────────────────────────────────────────────────────────

    /**
     * Returns a plain serializable object (for DataStore persistence).
     * The `channel` Discord object is intentionally excluded.
     */
    toJSON(): { id: string; creator?: OwnerEntry; claimant?: OwnerEntry; } {
        return {
            id: this.id,
            ...(this.creator && { creator: this.creator }),
            ...(this.claimant && { claimant: this.claimant }),
        };
    }

    /**
     * Reconstructs a PluginVoiceChannel from a plain persisted object.
     */
    static fromJSON(data: { id: string; creator?: OwnerEntry; claimant?: OwnerEntry; }): PluginVoiceChannel {
        const pvc = new PluginVoiceChannel(data.id);
        pvc.creator = data.creator;
        pvc.claimant = data.claimant;
        return pvc;
    }
}
