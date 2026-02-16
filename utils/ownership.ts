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

    if (owner.reason === "Channel Created" || owner.reason === "Created") {
        // This is the creator
        if (!ownership.first || ownership.first.userId !== owner.userId) {
            ownership.first = owner;
            changed = true;
        }
    } else if (owner.reason === "Channel Claimed" || owner.reason === "Claimed") {
        // This is a claimant
        if (ownership.first && ownership.first.userId === owner.userId) {
            // Creator claimed it back! Clear claimant (last)
            if (ownership.last) {
                ownership.last = undefined;
                changed = true;
            }
        } else if (!ownership.last || ownership.last.userId !== owner.userId) {
            ownership.last = owner;
            changed = true;
        }
    } else {
        // Unknown reason - treat as 'last' claimant if it's a new owner
        if (!ownership.last || ownership.last.userId !== owner.userId) {
            // If the person who is now owner is the creator, clear 'last'
            if (ownership.first && ownership.first.userId === owner.userId) {
                if (ownership.last) {
                    ownership.last = undefined;
                    changed = true;
                }
            } else {
                ownership.last = owner;
                changed = true;
            }
        }
    }

    if (changed) {
        saveState();
    }

    return changed;
}
