import { Menu, showToast } from "@webpack/common";
import { type User } from "@vencord/discord-types";
import { getWhitelist, setWhitelist } from "../utils";
import { bulkPermit, bulkUnpermit } from "../../permit";

export const getWhitelistUserItem = (user: User, channelId?: string, guildId?: string) => (
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
);
