export interface OwnerEntry {
    userId: string;
    timestamp: number;
}

export class ChannelOwner implements OwnerEntry {
    constructor(
        public userId: string,
        public timestamp: number
    ) { }
}

export class ChannelCreator extends ChannelOwner { }
export class ChannelClaimant extends ChannelOwner { }

export interface ChannelOwnership {
    creator?: ChannelCreator;
    claimant?: ChannelClaimant;
}
