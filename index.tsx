//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import {
    ChannelStore,
    UserStore,
    SelectedChannelStore,
    VoiceStateStore,
    ChannelActions
} from "@webpack/common";

import { settings } from "./settings";
import { state, actionQueue, channelOwners, loadState, saveState } from "./state"; // Keeps state management here?
import { log, jumpToFirstMessage, parseBotInfoMessage } from "./utils"; // Utils exports everything
import { BotResponse, BotResponseType } from "./utils/BotResponse";

// Module Registry
import { registerModule, Modules } from "./ModuleRegistry";
import { CoreModule } from "./logic/core";
import { ChannelClaimModule } from "./logic/channelClaim";
import { ChannelNameModule } from "./logic/channelName";
import { KickNotInRoleModule } from "./logic/kickNotInRole";
import { BlacklistModule } from "./logic/blacklist";
import { WhitelistModule } from "./logic/whitelist";
import { VotebanModule } from "./logic/voteban";
import { PermitModule } from "./logic/permit";
import { QueueModule } from "./logic/queue";

// Register all modules immediately
[
    CoreModule,
    ChannelClaimModule,
    ChannelNameModule,
    KickNotInRoleModule,
    BlacklistModule,
    WhitelistModule,
    VotebanModule,
    PermitModule,
    QueueModule
].forEach(registerModule);

import { registerSharedContextMenu } from "./utils/menus"; // Assuming menus stays in utils
import {
    UserContextMenuPatch,
    GuildContextMenuPatch,
    ChannelContextMenuPatch
} from "./menus"; // Menus stays in root
import { getToolboxActions } from "./toolbox";
import { commands } from "./commands";
import { Logger } from "@utils/Logger";

// endregion Imports

// region PluginInfo
import { pluginInfo } from "./info";
export { pluginInfo };
// endregion PluginInfo

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
// endregion Variables


// region Definition
export default definePlugin({
    name: pluginInfo.name,
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,
    commands,
    toolboxActions: getToolboxActions,
    contextMenus: {
        "user-context": UserContextMenuPatch,
        "guild-context": GuildContextMenuPatch,
        "channel-context": ChannelContextMenuPatch,
    },
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }) {
            if (!settings.store.enabled) return;
            Modules.forEach(m => m.onVoiceStateUpdate?.(voiceStates));

            // Legacy onUserJoined/onUserLeft (still useful for simple modules)
            for (const s of voiceStates) {
                if (s.channelId) {
                    const newChannel = ChannelStore.getChannel(s.channelId);
                    if (newChannel?.parent_id === settings.store.categoryId) {
                        Modules.forEach(m => m.onUserJoined?.(s.channelId!, s.userId));
                    }
                }
                if (s.oldChannelId && s.oldChannelId !== s.channelId) {
                    const oldChannel = ChannelStore.getChannel(s.oldChannelId);
                    if (oldChannel?.parent_id === settings.store.categoryId) {
                        Modules.forEach(m => m.onUserLeft?.(s.oldChannelId!, s.userId));
                    }
                }
            }
        },
        MESSAGE_CREATE({ message, channelId, guildId }) {
            if (!settings.store.enabled) return;
            Modules.forEach(m => m.onMessageCreate?.(message, channelId, guildId));
        }
    },
    stopCleanup: null as (() => void) | null,
    async onStart() {
        await loadState();
        log(`Plugin starting... enabled=${settings.store.enabled}`);

        Modules.forEach(m => m.onStart?.());

        this.stopCleanup = registerSharedContextMenu(pluginInfo.id, {
            "user-context": (children, props) => {
                if (props.user) UserContextMenuPatch(children, props);
            },
            "guild-context": (children, props) => {
                if (props.guild) GuildContextMenuPatch(children, props);
            },
            "channel-context": (children, props) => {
                if (props.channel) ChannelContextMenuPatch(children, props);
            }
        }, log);
    },
    onStop() {
        Modules.forEach(m => m.onStop?.());
        this.stopCleanup?.();
    }
});
