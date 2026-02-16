import { channelOwners, ChannelOwnership, OwnerEntry, saveState, ChannelCreator, ChannelClaimant } from "../state";

export function getOwnerForChannel(channelId: string): OwnerEntry | undefined {
    const ownership = channelOwners.get(channelId);
    if (!ownership) return undefined;

    // Claimant takes precedence if it exists, otherwise use creator.
    return ownership.claimant || ownership.creator;
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
        if (!ownership.creator || ownership.creator.userId !== owner.userId) {
            ownership.creator = new ChannelCreator(owner.userId, owner.reason, owner.timestamp);
            changed = true;
        }
    } else if (owner.reason === "Channel Claimed" || owner.reason === "Claimed") {
        // This is a claimant
        if (ownership.creator && ownership.creator.userId === owner.userId) {
            // Creator claimed it back! Clear claimant
            if (ownership.claimant) {
                ownership.claimant = undefined;
                changed = true;
            }
        } else if (!ownership.claimant || ownership.claimant.userId !== owner.userId) {
            ownership.claimant = new ChannelClaimant(owner.userId, owner.reason, owner.timestamp);
            changed = true;
        }
    } else {
        // Unknown reason - treat as claimant if it's a new owner
        if (!ownership.claimant || ownership.claimant.userId !== owner.userId) {
            // If the person who is now owner is the creator, clear claimant
            if (ownership.creator && ownership.creator.userId === owner.userId) {
                if (ownership.claimant) {
                    ownership.claimant = undefined;
                    changed = true;
                }
            } else {
                ownership.claimant = new ChannelClaimant(owner.userId, owner.reason, owner.timestamp);
                changed = true;
            }
        }
    }

    if (changed) {
        saveState();
    }

    return changed;
}
