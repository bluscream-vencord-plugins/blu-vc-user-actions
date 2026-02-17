import { ActionType } from "./ActionType";

export interface ActionItem {
    type: ActionType;
    userId: string;
    channelId: string;
    guildId?: string;
    ephemeralMessage?: string;
    externalMessage?: string;
    rotationTriggered?: boolean;
    channelName?: string;
    channelLimit?: number | string;
}
