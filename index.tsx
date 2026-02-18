//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import {
    ChannelStore,
    UserStore,
    GuildStore,
    SelectedChannelStore,
    VoiceStateStore,
    Menu,
} from "@webpack/common";
import { type User, type Channel, type Guild } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";

import { log, isVoiceChannel } from "./utils";
import { registerSharedContextMenu } from "./utils/menus";
import { loadState, channelOwners } from "./state";
import { PluginVoiceChannel } from "./types/PluginVoiceChannel";
import { PluginModule } from "./types/PluginModule";

// Module Registry
export const Modules: PluginModule[] = [];

export function registerModule(module: PluginModule) {
    Modules.push(module);
}

// Module Imports
import { CoreModule } from "./logic/core";
import { ChannelClaimModule } from "./logic/channelClaim";
import { ChannelNameModule } from "./logic/channelName";
import { KickNotInRoleModule } from "./logic/kickNotInRole";
import { BlacklistModule } from "./logic/blacklist";
import { WhitelistModule } from "./logic/whitelist";
import { VotebanModule } from "./logic/voteban";
import { PermitModule } from "./logic/permit";

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
].forEach(registerModule);

import { pluginInfo } from "./info";
// endregion Imports

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
// endregion Variables

// region Settings
export const settings = definePluginSettings(
    Object.assign({}, ...Modules.map(m => m.settings ?? {}))
);
// endregion Settings

// region Commands
const subCommands = Modules.flatMap(m => m.commands || []);

export const commands = [
    {
        name: "channel",
        description: "Socialize Guild Moderation Commands",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: subCommands,
        execute: async (args: any, ctx: any) => {
            const subCommandName = args[0].name;
            const subCommand = subCommands.find(c => c.name === subCommandName);

            if (subCommand?.execute) {
                return subCommand.execute(args[0].options, ctx);
            }

            const { sendBotMessage } = require("@api/Commands");
            sendBotMessage(ctx.channel.id, { content: `❌ Unknown sub-command: ${subCommandName}` });
        }
    }
];
// endregion Commands



// region Context Menus
function getChannelContextMenuItems(channel: Channel) {
    if (channel.type !== ChannelType.GUILD_VOICE) return null;
    if (channel.guild_id !== settings.store.guildId) return null;

    const pvc = channelOwners.get(channel.id) ?? new PluginVoiceChannel(channel.id, channel);
    const items = Modules.flatMap(m => m.getChannelMenuItems?.(pvc) || []);
    return items.length > 0 ? items : null;
}

function getUserContextMenuItems(user: User, channelId?: string, guildId?: string) {
    const items = Modules.flatMap(m => m.getUserMenuItems?.(user, channelId, guildId) || []);
    return items.length > 0 ? items : null;
}

function getGuildContextMenuItems(guild: Guild) {
    const items = Modules.flatMap(m => m.getGuildMenuItems?.(guild) || []);
    return items.length > 0 ? items : null;
}

export const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    const chatChannelId = SelectedChannelStore.getChannelId();
    const chatChannel = ChannelStore.getChannel(chatChannelId);
    if (chatChannel?.guild_id !== settings.store.guildId) return;
    if (!user) return;

    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    const submenuItems = getUserContextMenuItems(user, myChannelId || undefined, chatChannel?.guild_id);

    if (!submenuItems || submenuItems.length === 0) return;

    const submenu = (
        <Menu.MenuItem
            id="socialize-guild-user-actions"
            label={pluginInfo.name}
        >
            {submenuItems}
        </Menu.MenuItem>
    );

    children.splice(-1, 0, submenu);
};

export const GuildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }) => {
    if (guild?.id !== settings.store.guildId) return;
    const items = getGuildContextMenuItems(guild);

    if (!items || items.length === 0) return;

    children.push(
        <Menu.MenuItem id="socialize-guild-guild-submenu" label={pluginInfo.name}>
            {items}
        </Menu.MenuItem>
    );
};

export const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (channel?.guild_id !== settings.store.guildId) return;
    if (!isVoiceChannel(channel)) return;

    const items = getChannelContextMenuItems(channel);
    if (!items || items.length === 0) return;

    children.push(
        <Menu.MenuItem id="socialize-guild-channel-submenu" label={pluginInfo.name}>
            {items}
        </Menu.MenuItem>
    );
};
// endregion Context Menus

// region Definition
export default definePlugin({
    name: pluginInfo.name,
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,
    commands,
    toolboxActions: (channelId?: string) => {
        const pvc = channelId
            ? (channelOwners.get(channelId) ?? new PluginVoiceChannel(channelId))
            : undefined;
        return Modules.flatMap(m => m.getToolboxMenuItems?.(pvc) || []);
    },
    contextMenus: {
        "user-context": UserContextMenuPatch,
        "guild-context": GuildContextMenuPatch,
        "channel-context": ChannelContextMenuPatch,
    },
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }) {
            if (!settings.store.enabled) return;
            const { guildId, categoryId } = settings.store;

            // Filter to only states relevant to our managed guild+category
            const relevantStates = voiceStates.filter(s => {
                const channelInCategory = s.channelId
                    ? ChannelStore.getChannel(s.channelId)?.parent_id === categoryId
                    : false;
                const oldChannelInCategory = s.oldChannelId
                    ? ChannelStore.getChannel(s.oldChannelId)?.parent_id === categoryId
                    : false;
                return (s.guildId === guildId || s.guild_id === guildId) &&
                    (channelInCategory || oldChannelInCategory);
            });

            if (relevantStates.length > 0) {
                Modules.forEach(m => m.onVoiceStateUpdate?.(relevantStates));
            }

            for (const s of relevantStates) {
                const user = UserStore.getUser(s.userId);
                if (!user) continue;

            // onUserJoined: user arrived in a channel in our category
            // covers: connect (no oldChannelId), move-in from outside category, move within category
                if (s.channelId) {
                    const newChannel = ChannelStore.getChannel(s.channelId);
                    if (newChannel?.parent_id === categoryId) {
                        const pvc = channelOwners.get(s.channelId) ?? new PluginVoiceChannel(s.channelId, newChannel);
                        Modules.forEach(m => m.onUserJoined?.(pvc, user));
                    }
                }

                // onUserLeft: user left a channel in our category
                // covers: disconnect (no channelId), move-out to outside category, move within category
                if (s.oldChannelId && s.oldChannelId !== s.channelId) {
                    const oldChannel = ChannelStore.getChannel(s.oldChannelId);
                    if (oldChannel?.parent_id === categoryId) {
                        const pvc = channelOwners.get(s.oldChannelId) ?? new PluginVoiceChannel(s.oldChannelId, oldChannel);
                        Modules.forEach(m => m.onUserLeft?.(pvc, user));
                    }
                }
            }
        },
        MESSAGE_CREATE({ message, channelId, guildId }) {
            if (!settings.store.enabled) return;
            if (guildId !== settings.store.guildId) return;

            const channel = ChannelStore.getChannel(channelId);
            if (!channel) return;

            // Only fire for text channels in our managed category
            // (the linked text channel of a voice channel in the category)
            if (channel.parent_id !== settings.store.categoryId) return;
            if (!channel.isGuildVoice?.() && channel.type !== 0 /* GUILD_TEXT */) return;

            // Find the voice channel this text channel is linked to (same name, same parent)
            const { GuildChannelStore } = require("@webpack/common");
            const guildChannels = GuildChannelStore.getChannels(guildId);
            const vocal: { channel: Channel; }[] = guildChannels?.VOCAL ?? [];
            const linkedVoice = vocal
                .map(c => c.channel)
                .find(c => c.parent_id === channel.parent_id && c.name === channel.name);

            const voiceChannelId = linkedVoice?.id ?? channelId;
            const pvc = channelOwners.get(voiceChannelId)
                ?? new PluginVoiceChannel(voiceChannelId, linkedVoice);

            const guild = GuildStore.getGuild(guildId) ?? null;
            Modules.forEach(m => m.onMessageCreate?.(message, pvc, guild));
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
// endregion Definition
