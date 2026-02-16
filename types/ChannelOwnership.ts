import { OwnerEntry } from "./OwnerEntry";

export class ChannelOwner implements OwnerEntry {
    constructor(
        public userId: string,
        public reason: string,
        public timestamp: number
    ) { }
}

export class ChannelCreator extends ChannelOwner { }
export class ChannelClaimant extends ChannelOwner { }

export interface ChannelOwnership {
    creator?: ChannelCreator;
    claimant?: ChannelClaimant;
}
