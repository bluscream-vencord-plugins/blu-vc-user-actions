import { settings } from "../../settings";
import { state, ActionType } from "../../state";
import { log } from "../../utils/logging";
import { formatKickCommand, formatBanCommand } from "../blacklist/formatting";
import { formatKickNotInRoleMessage, formatKickNotInRoleExternalMessage } from "./formatting";
import { queueAction } from "../queue";
import { GuildMemberStore } from "@webpack/common";

export function checkKickNotInRole(userId: string, channelId: string, guildId: string): boolean {
    if (!settings.store.kickNotInRoleEnabled || !settings.store.kickNotInRole) return false;

    const member = GuildMemberStore.getMember(guildId, userId);
    if (member && !member.roles.includes(settings.store.kickNotInRole)) {
        const hasBeenKicked = state.roleKickedUsers.has(userId);

        if (hasBeenKicked) {
            log(`User ${userId} rejoined without role ${settings.store.kickNotInRole}, upgrading to BAN`);
            const banMsg = formatBanCommand(channelId, userId);
            queueAction({
                type: ActionType.BAN,
                userId: userId,
                channelId: channelId,
                guildId: guildId,
                external: banMsg
            });
        } else {
            log(`User ${userId} missing role ${settings.store.kickNotInRole}, adding to kick queue`);
            state.roleKickedUsers.add(userId);

            const ephemeral = settings.store.kickNotInRoleMessage ? formatKickNotInRoleMessage(channelId, userId) : undefined;

            let external = formatKickCommand(channelId, userId);
            if (settings.store.kickNotInRoleMessageExternalEnabled && settings.store.kickNotInRoleMessageExternal) {
                const shameMsg = formatKickNotInRoleExternalMessage(channelId, userId);
                queueAction({
                    type: ActionType.INFO,
                    userId: userId,
                    channelId: channelId,
                    guildId: guildId,
                    external: shameMsg
                });
            }

            queueAction({
                type: ActionType.KICK,
                userId: userId,
                channelId: channelId,
                guildId: guildId,
                ephemeral: ephemeral,
                external: external
            });
        }
        return true;
    }
    return false;
}
