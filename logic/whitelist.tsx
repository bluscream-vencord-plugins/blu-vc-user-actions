import { OptionType } from "@utils/types";
import { Menu, showToast } from "@webpack/common";
import { type User } from "@vencord/discord-types";
import { formatCommand } from "../utils/formatting";
import { bulkPermit, bulkUnpermit } from "./permit";
import { PluginModule } from "../types/PluginModule";

// #region Settings
export const whitelistSettings = {
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
};
// #endregion

// #region Utils / Formatting
export function getWhitelist(): string[] {
    const { settings } = require("../settings");
    return settings.store.localUserWhitelist.split(/\r?\n/).map(s => s.trim()).filter(id => /^\d{17,19}$/.test(id));
}

export function setWhitelist(newList: string[]) {
    const { settings } = require("../settings");
    settings.store.localUserWhitelist = newList.join("\n");
}

export function formatWhitelistSkipMessage(channelId: string, userId: string, action: string): string {
    const { settings } = require("../settings");
    const user = require("@webpack/common").UserStore.getUser(userId);
    const msg = settings.store.whitelistSkipMessage
        .replace(/{user_id}/g, userId)
        .replace(/{user_name}/g, user?.username || userId)
        .replace(/{action}/g, action);
    return require("../utils/formatting").formatMessageCommon(msg, channelId);
}
// #endregion

// #region Menus
export const WhitelistMenuItems = {
    getWhitelistUserItem: (user: User, channelId?: string, guildId?: string) => (
        <Menu.MenuItem
            id="vc-blu-vc-user-whitelist"
            label={getWhitelist().includes(user.id) ? "Unwhitelist" : "Whitelist"}
            action={() => {
                const isWhitelisted = getWhitelist().includes(user.id);
                if (isWhitelisted) {
                    bulkUnpermit([user.id], channelId || "", guildId || "");
                } else {
                    bulkPermit([user.id], channelId || "", guildId || "");
                }
                const newList = isWhitelisted
                    ? getWhitelist().filter(id => id !== user.id)
                    : [...getWhitelist(), user.id];
                setWhitelist(newList);

                showToast(isWhitelisted ? `Removed ${user.username} from whitelist.` : `Added ${user.username} to whitelist.`, { type: "success" } as any);
            }}
        />
    )
};

export const WhitelistModule: PluginModule = {
    id: "whitelist",
    name: "Whitelisting",
    settings: whitelistSettings,
    getUserMenuItems: (user, channelId, guildId) => [
        WhitelistMenuItems.getWhitelistUserItem(user, channelId, guildId)
    ]
};
// #endregion

// #region Logic
export function isWhitelisted(userId: string): boolean {
    return getWhitelist().includes(userId);
}
// #endregion
