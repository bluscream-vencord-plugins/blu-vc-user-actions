import { OwnerEntry } from "./OwnerEntry";

export interface ChannelOwnership {
    first?: OwnerEntry; // The creator
    last?: OwnerEntry;  // The current/last claimant
}
