import { OptionType } from "@utils/types";
import { Menu, showToast, UserStore } from "@webpack/common";
import { type User } from "@vencord/discord-types";
import { formatMessageCommon } from "../utils/formatting";
import { bulkPermit, bulkUnpermit } from "./permit";
import { PluginModule } from "../types/PluginModule";

export function getWhitelist(): string[] {
    const { settings } = require("../settings");
    return (settings.store.localUserWhitelist as string).split(/\r?\n/).map(s => s.trim()).filter(id => /^\d{17,19}$/.test(id));
}

export function setWhitelist(newList: string[]) {
    const { settings } = require("../settings");
    settings.store.localUserWhitelist = newList.join("\n");
}

export function formatWhitelistSkipMessage(channelId: string, userId: string, action: string): string {
    const { settings } = require("../settings");
    const user = UserStore.getUser(userId);
    const msg = settings.store.whitelistSkipMessage
        .replace(/{user_id}/g, userId)
        .replace(/{user_name}/g, user?.username || userId)
        .replace(/{action}/g, action);
    return formatMessageCommon(msg);
}

// #region Menus
export const WhitelistMenuItems = {
    getWhitelistUserItem: (user: User, channelId?: string, guildId?: string) => {
        const whitelist = getWhitelist();
        const isWhitelisted = whitelist.includes(user.id);

        return (
            <Menu.MenuItem
                id="vc-blu-vc-user-whitelist"
                label={isWhitelisted ? "Unwhitelist" : "Whitelist"}
                action={() => {
                    if (isWhitelisted) {
                        bulkUnpermit([user.id], channelId || "", guildId || "");
                        setWhitelist(whitelist.filter(id => id !== user.id));
                    } else {
                        bulkPermit([user.id], channelId || "", guildId || "");
                        setWhitelist([...whitelist, user.id]);
                    }
                    showToast(isWhitelisted ? `Removed ${user.username} from whitelist.` : `Added ${user.username} to whitelist.`);
                }}
            />
        );
    }
};

export const WhitelistModule: PluginModule = {
    id: "whitelist",
    name: "Whitelisting",
    settings: {
        whitelistSkipMessage: {
            type: OptionType.STRING as const,
            description: "Message to send when skipping an action for a whitelisted user",
            default: "⚪ Whitelist: Skipping {action} for <@{user_id}> ({user_name})",
            restartNeeded: false,
        },
        localUserWhitelist: {
            type: OptionType.STRING as const,
            description: "List of user IDs to exclude from automated actions (one per line)",
            default: "",
            multiline: true,
            restartNeeded: false,
        },
    },
    getUserMenuItems: (user, channelId, guildId) => [
        WhitelistMenuItems.getWhitelistUserItem(user, channelId, guildId)
    ]
};

export function isWhitelisted(userId: string): boolean {
    return getWhitelist().includes(userId);
}
