import { channelOwners, ChannelOwnership, OwnerEntry, saveState } from "../state";

export function getOwnerForChannel(channelId: string): OwnerEntry | undefined {
    const ownership = channelOwners.get(channelId);
    if (!ownership) return undefined;

    // "First" is the creator. "Last" is the current claimant.
    // If there is a claimant (last), they are the owner.
    // Unless we want complex logic where creator overrides?
    // User request: "when creator joins back the claimant will still have owner perms until the creator claims the channel again"
    // So "last" takes precedence.

    return ownership.last || ownership.first;
}

export function updateOwner(channelId: string, owner: OwnerEntry): boolean {
    let ownership = channelOwners.get(channelId);
    if (!ownership) {
        ownership = {};
        channelOwners.set(channelId, ownership);
    }

    let changed = false;

    if (owner.reason === "Created") {
        // This is the creator
        if (!ownership.first || ownership.first.userId !== owner.userId) {
            ownership.first = owner;
            changed = true;
        }
    } else if (owner.reason === "Claimed") {
        // This is a claimant
        if (!ownership.last || ownership.last.userId !== owner.userId) {
            ownership.last = owner;
            changed = true;
        }
    } else {
        // Unknown reason - treat as simple update or fallback?
        // Maybe treat as "last" if we don't know better, or ignore?
        // Let's assume generic "Owner" updates might be "Claimed" implicitly or just current state.
        // For now, let's treat generic updates as "last" to be safe if they lack specific reason,
        // BUT strict strict reason checking is better.
        if (!ownership.last || ownership.last.userId !== owner.userId) {
            ownership.last = owner;
            changed = true;
        }
    }

    if (changed) {
        saveState();
    }

    return changed;
}
