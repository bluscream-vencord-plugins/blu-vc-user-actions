import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { getUserIdList, setNewLineList } from "../utils/settingsHelpers";
import { User, Channel } from "@vencord/discord-types";
import { Menu, React } from "@webpack/common";
import { actionQueue } from "../utils/actionQueue";

export const BlacklistModule: SocializeModule = {
    name: "BlacklistModule",
    settings: undefined as PluginSettings | undefined,

    // Menu Item Hooks
    getUserMenuItems(user: User, channel?: Channel) {
        const settings = moduleRegistry.settings;
        if (!settings || !channel) return null;

        return [
            <Menu.MenuItem
                id="socialize-ban-user"
                label="Socialize Ban"
                key="socialize-ban-user"
                action={() => {
                    actionQueue.enqueue(settings.banCommand.replace("{user}", user.id), channel.id, true);
                }}
            />,
            <Menu.MenuItem
                id="socialize-kick-user"
                label="Socialize Kick"
                key="socialize-kick-user"
                action={() => {
                    actionQueue.enqueue(settings.kickCommand.replace("{user}", user.id), channel.id, true);
                }}
            />
        ];
    },

    init(settings: PluginSettings) {
        this.settings = settings;
        logger.info("BlacklistModule initializing");
    },

    stop() {
        logger.info("BlacklistModule stopping");
    },

    getBlacklist(): string[] {
        return getUserIdList(this.settings?.localUserBlacklist);
    },

    setBlacklist(newList: string[]) {
        if (!this.settings) return;
        this.settings.localUserBlacklist = setNewLineList(newList);
    },

    isBlacklisted(userId: string): boolean {
        return this.getBlacklist().includes(userId);
    }
};
