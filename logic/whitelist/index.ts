import { isWhitelisted } from "./utils";
import { formatWhitelistSkipMessage } from "./formatting";
import { log } from "../../utils/logging";
import { ActionType } from "../../state";

export { isWhitelisted } from "./utils";

export function checkWhitelist(userId: string, channelId: string, type: ActionType): boolean {
    const { sendBotMessage } = require("@api/Commands");
    if ((type === ActionType.KICK || type === ActionType.BAN) && isWhitelisted(userId)) {
        log(`Skipping ${type} for whitelisted user ${userId}`);
        const skipMsg = formatWhitelistSkipMessage(channelId, userId, type);
        sendBotMessage(channelId, { content: skipMsg });
        return true;
    }
    return false;
}
