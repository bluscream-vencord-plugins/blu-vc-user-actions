import { channelOwners, ChannelOwnership, OwnerEntry, saveState, ChannelCreator, ChannelClaimant } from "../state";


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
        if (ownership.claimant?.userId !== owner.userId) {
            ownership.claimant = new ChannelClaimant(owner.userId, owner.reason, owner.timestamp);
            changed = true;
        }
    }


    if (changed) {
        saveState();
    }

    return changed;
}
