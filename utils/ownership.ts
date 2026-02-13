import { channelOwners, ChannelOwner } from "../state";

export function getOwnerForChannel(channelId: string): ChannelOwner | undefined {
    return channelOwners.get(channelId);
}

export function updateOwner(channelId: string, owner: ChannelOwner) {
    const existing = channelOwners.get(channelId);
    if (!existing || existing.userId !== owner.userId || existing.reason !== owner.reason) {
        channelOwners.set(channelId, owner);
        return true;
    }
    return false;
}
