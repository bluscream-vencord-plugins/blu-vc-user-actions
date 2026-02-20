import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent, BotResponseType } from "../types/events";
import { ChannelOwnership, MemberChannelInfo } from "../types/state";
import { stateManager } from "../utils/stateManager";
import { logger } from "../utils/logger";
import { Message, VoiceState, Channel, User, Guild } from "@vencord/discord-types";
import { BotResponse } from "../utils/BotResponse";
import { parseBotInfoMessage } from "../utils/parsing";
import { actionQueue } from "../utils/actionQueue";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import {
    GuildChannelStore, ChannelStore, GuildStore,
    SelectedChannelStore, UserStore as Users,
    VoiceStateStore, ChannelActions,
    Menu, React, showToast
} from "@webpack/common";
import { ChannelNameRotationModule } from "./channelNameRotation";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getSettings() {
    return moduleRegistry.settings;
}

function getMyVoiceChannelId(): string | null {
    return SelectedChannelStore.getVoiceChannelId() ?? null;
}

function getOwnership(channelId: string): ChannelOwnership | null {
    return stateManager.getOwnership(channelId);
}

function amIOwner(channelId: string): boolean {
    const me = Users.getCurrentUser()?.id;
    if (!me) return false;
    const o = getOwnership(channelId);
    return o?.creatorId === me || o?.claimantId === me;
}

function getUserDisplayName(userId: string): string {
    const u = Users.getUser(userId);
    return u?.globalName || u?.username || userId;
}

// ─────────────────────────────────────────────────────────────
// Channel Menu Items
// ─────────────────────────────────────────────────────────────

function makeChannelItems(channel: Channel): React.ReactElement[] {
    const settings = getSettings();
    if (!settings) return [];

    const enqueue = (cmd: string, priority = false) =>
        actionQueue.enqueue(formatCommand(cmd, channel.id), channel.id, priority);

    return [
        <Menu.MenuItem
            id="socialize-claim-channel"
            label="Claim Channel"
            key="socialize-claim-channel"
            action={() => enqueue(settings.claimCommand, true)}
        />,
        <Menu.MenuItem
            id="socialize-lock-channel"
            label="Lock Channel"
            key="socialize-lock-channel"
            action={() => enqueue(settings.lockCommand, true)}
        />,
        <Menu.MenuItem
            id="socialize-unlock-channel"
            label="Unlock Channel"
            key="socialize-unlock-channel"
            action={() => enqueue(settings.unlockCommand, true)}
        />,
        <Menu.MenuItem
            id="socialize-reset-channel"
            label="Reset Channel"
            key="socialize-reset-channel"
            action={() => enqueue(settings.resetCommand)}
        />,
        <Menu.MenuItem
            id="socialize-info-channel"
            label="Channel Info"
            key="socialize-info-channel"
            action={() => OwnershipModule.requestChannelInfo(channel.id)}
        />,
        <Menu.MenuItem
            id="socialize-set-size-submenu"
            label="Set Channel Size"
            key="socialize-set-size-submenu"
        >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(size => (
                <Menu.MenuItem
                    key={`size-${size}`}
                    id={`socialize-set-size-${size}`}
                    label={size === 0 ? "Unlimited" : `${size} Users`}
                    action={() => {
                        const sizeCmd = formatCommand(settings.setSizeCommand || "!v size {size}", channel.id)
                            .replace("{size}", String(size))
                            .replace("{channel_limit}", String(size));
                        actionQueue.enqueue(sizeCmd, channel.id, false);
                    }}
                />
            ))}
        </Menu.MenuItem>,
        <Menu.MenuSeparator key="socialize-channel-sep" />,
        <Menu.MenuItem
            id="socialize-ban-all-vc"
            label="Ban All in VC"
            key="socialize-ban-all-vc"
            color="danger"
            action={() => {
                const me = Users.getCurrentUser();
                const states = VoiceStateStore.getVoiceStatesForChannel(channel.id);
                const ids = Object.keys(states).filter(id => id !== me?.id);
                if (!ids.length) { showToast("No other users in VC."); return; }
                for (const uid of ids) {
                    actionQueue.enqueue(formatCommand(settings.kickCommand, channel.id, { userId: uid }), channel.id);
                }
                showToast(`Queued kicks for ${ids.length} users.`);
            }}
        />,
        <Menu.MenuItem
            id="socialize-kick-banned"
            label="Kick Banned Users"
            key="socialize-kick-banned"
            action={() => {
                const states = VoiceStateStore.getVoiceStatesForChannel(channel.id);
                const config = stateManager.getMemberConfig(Users.getCurrentUser()?.id || "");
                let n = 0;
                for (const uid in states) {
                    if (config.bannedUsers.includes(uid)) {
                        actionQueue.enqueue(formatCommand(settings.kickCommand, channel.id, { userId: uid }), channel.id);
                        n++;
                    }
                }
                showToast(n > 0 ? `Kicked ${n} banned user(s).` : "No banned users in VC.");
            }}
        />,
    ];
}

// ─────────────────────────────────────────────────────────────
// User Menu Items
// ─────────────────────────────────────────────────────────────

function makeUserItems(user: User, channel?: Channel): React.ReactElement[] {
    const settings = getSettings();
    if (!settings) return [];

    const myChannelId = getMyVoiceChannelId();
    const targetChannelId = channel?.id || myChannelId || "";
    const guildId = channel?.guild_id || settings.guildId;

    const isInMyChannel = myChannelId
        ? !!VoiceStateStore.getVoiceStatesForChannel(myChannelId)?.[user.id]
        : false;

    const meId = Users.getCurrentUser()?.id || "";
    const ownership = myChannelId ? getOwnership(myChannelId) : null;
    const amOwner = ownership?.creatorId === meId || ownership?.claimantId === meId;

    // Whitelist toggle
    const config = stateManager.getMemberConfig(meId);
    const isWhitelisted = config.whitelistedUsers.includes(user.id);

    // Ban check: check the current owner's ban list
    const ownerConfig = myChannelId
        ? stateManager.getMemberConfig(ownership?.claimantId || ownership?.creatorId || "")
        : null;
    const isBanned = ownerConfig?.bannedUsers.includes(user.id) ?? false;

    const items: React.ReactElement[] = [];

    // Show ownership info if applicable
    if (myChannelId) {
        const o = getOwnership(myChannelId);
        if (o?.creatorId === user.id || o?.claimantId === user.id) {
            items.push(
                <Menu.MenuItem
                    id="socialize-user-is-owner"
                    key="socialize-user-is-owner"
                    label={o.claimantId === user.id
                        ? `👑 Claimant of <#${myChannelId}>`
                        : `✨ Creator of <#${myChannelId}>`}
                    disabled
                    action={() => { }}
                />
            );
        }
    }

    // Kick (only if in my channel and I'm owner)
    if (isInMyChannel && amOwner) {
        items.push(
            <Menu.MenuItem
                id="socialize-kick-user"
                key="socialize-kick-user"
                label="Kick from VC"
                color="brand"
                action={() => {
                    actionQueue.enqueue(
                        formatCommand(settings.kickCommand, myChannelId!, { userId: user.id }),
                        myChannelId!
                    );
                }}
            />
        );
    }

    // Ban/Unban (only if I'm owner)
    if (amOwner && myChannelId) {
        items.push(
            <Menu.MenuItem
                id="socialize-ban-user"
                key="socialize-ban-user"
                label={isBanned ? "Unban from VC" : "Ban from VC"}
                color={isBanned ? "success" : "danger"}
                action={() => {
                    const cmd = isBanned
                        ? formatCommand(settings.unbanCommand, myChannelId!, { userId: user.id })
                        : formatCommand(settings.banCommand, myChannelId!, { userId: user.id });
                    actionQueue.enqueue(cmd, myChannelId!);
                    showToast(isBanned
                        ? `Queued unban for ${getUserDisplayName(user.id)}`
                        : `Queued ban for ${getUserDisplayName(user.id)}`
                    );
                }}
            />
        );
    }

    // Permit/Unpermit (only if I'm owner)
    if (amOwner && myChannelId) {
        const ownerCfg = stateManager.getMemberConfig(meId);
        const isPermitted = ownerCfg.permittedUsers.includes(user.id);
        items.push(
            <Menu.MenuItem
                id="socialize-permit-user"
                key="socialize-permit-user"
                label={isPermitted ? "Unpermit User" : "Permit User"}
                color={isPermitted ? "default" : "success"}
                action={() => {
                    const cmd = isPermitted
                        ? formatCommand(settings.unpermitCommand || "!v unpermit {user_id}", myChannelId!, { userId: user.id })
                        : formatCommand(settings.permitCommand || "!v permit {user_id}", myChannelId!, { userId: user.id });
                    actionQueue.enqueue(cmd, myChannelId!);
                }}
            />
        );
    }

    // Whitelist toggle (always visible)
    items.push(
        <Menu.MenuItem
            id="socialize-whitelist-user"
            key="socialize-whitelist-user"
            label={isWhitelisted ? "Remove from Whitelist" : "Add to Whitelist"}
            action={() => {
                const cfg = stateManager.getMemberConfig(meId);
                if (isWhitelisted) {
                    stateManager.updateMemberConfig(meId, {
                        whitelistedUsers: cfg.whitelistedUsers.filter(id => id !== user.id)
                    });
                    showToast(`Removed ${getUserDisplayName(user.id)} from whitelist.`);
                } else {
                    stateManager.updateMemberConfig(meId, {
                        whitelistedUsers: [...cfg.whitelistedUsers, user.id]
                    });
                    showToast(`Added ${getUserDisplayName(user.id)} to whitelist.`);
                }
            }}
        />
    );

    return items.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// Guild Menu Items
// ─────────────────────────────────────────────────────────────

function makeGuildItems(guild: Guild): React.ReactElement[] {
    const voiceChannelId = getMyVoiceChannelId() || undefined;
    const ownership = voiceChannelId ? getOwnership(voiceChannelId) : null;

    const creatorStatus = ownership?.creatorId
        ? `Creator: ${getUserDisplayName(ownership.creatorId)}`
        : "Creator: None";
    const claimantStatus = ownership?.claimantId
        ? `Claimant: ${getUserDisplayName(ownership.claimantId)}`
        : "Claimant: None";

    return [
        // Creator/Claimant status display
        <Menu.MenuCheckboxItem
            key="socialize-guild-creator"
            id="socialize-guild-creator-status"
            label={creatorStatus}
            checked={!!ownership?.creatorId}
            action={() => { }}
        />,
        <Menu.MenuCheckboxItem
            key="socialize-guild-claimant"
            id="socialize-guild-claimant-status"
            label={claimantStatus}
            checked={!!ownership?.claimantId}
            action={() => { }}
        />,
        <Menu.MenuSeparator key="socialize-guild-sep" />,
        <Menu.MenuItem
            id="socialize-guild-fetch-owners"
            label="Fetch All Owners"
            key="socialize-guild-fetch-owners"
            action={() => OwnershipModule.fetchAllOwners()}
        />,
        voiceChannelId && <Menu.MenuItem
            id="socialize-guild-channel-info"
            label="Get Channel Info"
            key="socialize-guild-channel-info"
            action={() => OwnershipModule.requestChannelInfo(voiceChannelId!)}
        />,
        <Menu.MenuItem
            id="socialize-guild-create-channel"
            label="Create Channel"
            key="socialize-guild-create-channel"
            action={() => {
                const settings = getSettings();
                if (settings?.creationChannelId) {
                    ChannelActions?.selectVoiceChannel(settings.creationChannelId);
                } else {
                    showToast("No creation channel ID configured.");
                }
            }}
        />,
        <Menu.MenuSeparator key="socialize-guild-sep2" />,
        <Menu.MenuItem
            id="socialize-guild-reset-state"
            label="Reset Plugin State"
            key="socialize-guild-reset-state"
            color="danger"
            action={() => {
                stateManager["store"].activeChannelOwnerships = {};
                stateManager["store"].memberConfigs = {};
                showToast("Plugin state has been reset.");
            }}
        />,
        <Menu.MenuItem
            id="socialize-edit-settings"
            label="Edit Settings"
            key="socialize-edit-settings"
            action={() => {
                try { openPluginModal(plugins["SocializeGuild"]); } catch (e) { logger.error("Could not open settings modal:", e); }
            }}
        />,
    ].filter(Boolean) as React.ReactElement[];
}

// ─────────────────────────────────────────────────────────────
// Toolbox Menu Items
// ─────────────────────────────────────────────────────────────

function makeToolboxItems(channel?: Channel): React.ReactElement[] {
    const voiceChannelId = channel?.id || getMyVoiceChannelId() || undefined;
    const ownership = voiceChannelId ? getOwnership(voiceChannelId) : null;

    const creatorStatus = ownership?.creatorId
        ? `Creator: ${getUserDisplayName(ownership.creatorId)}`
        : "Creator: None";
    const claimantStatus = ownership?.claimantId
        ? `Claimant: ${getUserDisplayName(ownership.claimantId)}`
        : "Claimant: None";

    const items: (React.ReactElement | null)[] = [
        // Status indicators
        <Menu.MenuCheckboxItem
            key="socialize-toolbox-creator"
            id="socialize-toolbox-creator-status"
            label={creatorStatus}
            checked={!!ownership?.creatorId}
            action={() => { }}
        />,
        <Menu.MenuCheckboxItem
            key="socialize-toolbox-claimant"
            id="socialize-toolbox-claimant-status"
            label={claimantStatus}
            checked={!!ownership?.claimantId}
            action={() => { }}
        />,
        <Menu.MenuSeparator key="socialize-toolbox-sep" />,
    ];

    // Channel-specific items when we have a channel
    if (voiceChannelId && channel) {
        items.push(
            <Menu.MenuItem
                id="socialize-toolbox-info"
                label="Get Channel Info"
                key="socialize-toolbox-info"
                action={() => OwnershipModule.requestChannelInfo(voiceChannelId)}
            />,
            <Menu.MenuItem
                id="socialize-toolbox-claim"
                label="Claim Channel"
                key="socialize-toolbox-claim"
                action={() => {
                    const s = getSettings();
                    if (s) actionQueue.enqueue(formatCommand(s.claimCommand, voiceChannelId), voiceChannelId, true);
                }}
            />,
            <Menu.MenuItem
                id="socialize-toolbox-lock"
                label="Lock Channel"
                key="socialize-toolbox-lock"
                action={() => {
                    const s = getSettings();
                    if (s) actionQueue.enqueue(formatCommand(s.lockCommand, voiceChannelId), voiceChannelId, true);
                }}
            />,
            <Menu.MenuItem
                id="socialize-toolbox-unlock"
                label="Unlock Channel"
                key="socialize-toolbox-unlock"
                action={() => {
                    const s = getSettings();
                    if (s) actionQueue.enqueue(formatCommand(s.unlockCommand, voiceChannelId), voiceChannelId, true);
                }}
            />
        );
    }

    items.push(
        <Menu.MenuItem
            id="socialize-toolbox-create"
            label="Create Channel"
            key="socialize-toolbox-create"
            action={() => {
                const settings = getSettings();
                if (settings?.creationChannelId) {
                    ChannelActions?.selectVoiceChannel(settings.creationChannelId);
                } else {
                    showToast("No creation channel ID configured.");
                }
            }}
        />,
        <Menu.MenuItem
            id="socialize-toolbox-fetch-owners"
            label="Fetch All Owners"
            key="socialize-toolbox-fetch-owners"
            action={() => OwnershipModule.fetchAllOwners()}
        />,
        <Menu.MenuItem
            id="socialize-toolbox-edit-settings"
            label="Edit Settings"
            key="socialize-toolbox-edit-settings"
            action={() => {
                try { openPluginModal(plugins["SocializeGuild"]); } catch (e) { logger.error("Could not open settings modal:", e); }
            }}
        />
    );

    return items.filter(Boolean) as React.ReactElement[];
}

// ─────────────────────────────────────────────────────────────
// Module Export
// ─────────────────────────────────────────────────────────────

export const OwnershipModule: SocializeModule = {
    name: "OwnershipModule",

    // ── Menu Item Hooks ──────────────────────────────────────

    getToolboxMenuItems(channel?: Channel) {
        return makeToolboxItems(channel);
    },

    getChannelMenuItems(channel: Channel) {
        const settings = getSettings();
        if (!settings) return null;
        // Only show for voice channels in our managed category
        if (channel.parent_id !== settings.categoryId && channel.id !== settings.creationChannelId) return null;
        return makeChannelItems(channel);
    },

    getUserMenuItems(user: User, channel?: Channel) {
        return makeUserItems(user, channel);
    },

    getGuildMenuItems(guild: Guild) {
        const settings = getSettings();
        if (!settings || guild.id !== settings.guildId) return null;
        return makeGuildItems(guild);
    },

    // ── Lifecycle ────────────────────────────────────────────

    init(settings: PluginSettings) {
        logger.info("OwnershipModule initializing");

        const currentUserId = Users.getCurrentUser()?.id;
        if (!currentUserId) return;

        const channelId = SelectedChannelStore.getVoiceChannelId();
        if (channelId) {
            const channel = ChannelStore.getChannel(channelId);
            if (channel?.parent_id === settings.categoryId || channelId === settings.creationChannelId) {
                this.handleUserJoinedChannel(currentUserId, channelId, currentUserId);
            }
        }
    },

    stop() {
        logger.info("OwnershipModule stopping");
    },

    // ── Logic Helpers ────────────────────────────────────────

    async fetchAllOwners() {
        const settings = getSettings();
        if (!settings) return;

        const channels = GuildChannelStore.getChannels(settings.guildId);
        if (!channels?.SELECTABLE) return;

        const targetChannels = channels.SELECTABLE.filter(({ channel }) => channel.parent_id === settings.categoryId);
        logger.info(`Batch fetching owners for ${targetChannels.length} channels...`);

        for (const { channel } of targetChannels) {
            this.requestChannelInfo(channel.id);
            await new Promise(r => setTimeout(r, 500));
        }
        logger.info("Batch fetch complete.");
    },

    requestChannelInfo(channelId: string) {
        const settings = getSettings();
        if (!settings) return;
        const msg = formatCommand(settings.infoCommand, channelId);
        actionQueue.enqueue(msg, channelId, false);
    },

    // ── Discord Event Handlers ───────────────────────────────

    onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        const settings = getSettings();
        if (!settings) return;

        const currentUserId = Users.getCurrentUser()?.id;

        if (oldState.channelId !== newState.channelId) {
            if (newState.channelId) {
                const newChannel = ChannelStore.getChannel(newState.channelId);
                if (newChannel?.parent_id === settings.categoryId || newState.channelId === settings.creationChannelId) {
                    this.handleUserJoinedChannel(newState.userId, newState.channelId, currentUserId);
                }
            }
            if (oldState.channelId) {
                const oldChannel = ChannelStore.getChannel(oldState.channelId);
                if (oldChannel?.parent_id === settings.categoryId || oldState.channelId === settings.creationChannelId) {
                    this.handleUserLeftChannel(oldState.userId, oldState.channelId, currentUserId);
                }
            }
        }
    },

    onMessageCreate(message: Message) {
        const settings = getSettings();
        if (!settings) return;

        if (message.author.id !== settings.botId) return;

        const response = new BotResponse(message, settings.botId);
        if (response.type === BotResponseType.UNKNOWN) {
            logger.debug(`Unknown bot response type. Author: ${message.author.username}, Content: ${message.content?.substring(0, 50)}`);
            return;
        }

        sendDebugMessage(message.channel_id, `Bot Response: **${response.type}** from <@${response.initiatorId || "Unknown"}>`);

        moduleRegistry.dispatch(SocializeEvent.BOT_EMBED_RECEIVED, {
            messageId: message.id,
            channelId: message.channel_id,
            type: response.type,
            initiatorId: response.initiatorId,
            embed: response.embed
        });

        // Ownership handling
        if (response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED)) {
            const isCreator = response.type === BotResponseType.CREATED;
            const channelId = response.channelId;
            const userId = response.initiatorId;

            const oldOwnership = stateManager.getOwnership(channelId);
            const newOwnership: Partial<ChannelOwnership> = {
                channelId,
                ...(isCreator
                    ? { creatorId: userId, createdAt: response.timestamp }
                    : { claimantId: userId, claimedAt: response.timestamp })
            };

            stateManager.setOwnership(channelId, newOwnership);
            this.handleOwnershipUpdate(channelId, userId, isCreator ? "creator" : "claimant", oldOwnership, stateManager.getOwnership(channelId));
        }

        // Info sync
        if (response.type === BotResponseType.INFO) {
            const result = parseBotInfoMessage(response);
            if (result?.info.userId) {
                stateManager.updateMemberConfig(result.info.userId, result.info);
                sendDebugMessage(message.channel_id, `Synchronized info for user ${result.info.userId}`);
            }
        }

        // Dynamic state updates for ban/permit/lock actions
        if (response.initiatorId) {
            const userId = response.initiatorId;
            const description = response.getRawDescription().toLowerCase();
            const targetMatch = description.match(/<@!?(\d+)>/);
            const targetUserId = targetMatch?.[1];

            const cfg = stateManager.getMemberConfig(userId);

            switch (response.type) {
                case BotResponseType.BANNED:
                    if (targetUserId && !cfg.bannedUsers.includes(targetUserId)) {
                        stateManager.updateMemberConfig(userId, { bannedUsers: [...cfg.bannedUsers, targetUserId] });
                    }
                    break;
                case BotResponseType.UNBANNED:
                    if (targetUserId) {
                        stateManager.updateMemberConfig(userId, { bannedUsers: cfg.bannedUsers.filter(id => id !== targetUserId) });
                    }
                    break;
                case BotResponseType.PERMITTED:
                    if (targetUserId && !cfg.permittedUsers.includes(targetUserId)) {
                        stateManager.updateMemberConfig(userId, { permittedUsers: [...cfg.permittedUsers, targetUserId] });
                    }
                    break;
                case BotResponseType.UNPERMITTED:
                    if (targetUserId) {
                        stateManager.updateMemberConfig(userId, { permittedUsers: cfg.permittedUsers.filter(id => id !== targetUserId) });
                    }
                    break;
                case BotResponseType.SIZE_SET: {
                    const sizeMatch = description.match(/(\d+)/);
                    if (sizeMatch) stateManager.updateMemberConfig(userId, { userLimit: parseInt(sizeMatch[1]) });
                    break;
                }
                case BotResponseType.LOCKED:
                    stateManager.updateMemberConfig(userId, { isLocked: true });
                    break;
                case BotResponseType.UNLOCKED:
                    stateManager.updateMemberConfig(userId, { isLocked: false });
                    break;
            }
        }
    },

    // ── Internal Helpers ─────────────────────────────────────

    handleOwnershipUpdate(channelId: string, ownerId: string, type: "creator" | "claimant", oldOwnership: ChannelOwnership | null, newOwnership: ChannelOwnership | null) {
        const meId = Users.getCurrentUser()?.id;

        this.notifyOwnership(channelId, ownerId, type);
        sendDebugMessage(channelId, `Ownership: **${ownerId === meId ? "You" : `<@${ownerId}>`}** recognized as **${type}**`);

        moduleRegistry.dispatch(SocializeEvent.CHANNEL_OWNERSHIP_CHANGED, { channelId, oldOwnership, newOwnership });

        if (ownerId === meId) {
            ChannelNameRotationModule.startRotation(channelId);
            this.requestChannelInfo(channelId);
        } else {
            ChannelNameRotationModule.stopRotation(channelId);
        }
    },

    notifyOwnership(channelId: string, ownerId: string, type: string) {
        const settings = getSettings();
        if (!settings) return;

        const channel = ChannelStore.getChannel(channelId);
        const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
        const ownerName = getUserDisplayName(ownerId);

        const formatted = settings.ownershipChangeMessage
            .replace(/{reason}/g, type === "creator" ? "Created" : "Claimed")
            .replace(/{channel_id}/g, channelId)
            .replace(/{channel_name}/g, channel?.name || "Unknown")
            .replace(/{guild_id}/g, channel?.guild_id || "")
            .replace(/{guild_name}/g, guild?.name || "Unknown")
            .replace(/{user_id}/g, ownerId)
            .replace(/{user_name}/g, ownerName);

        actionQueue.enqueue(formatted, channelId, true);
    },

    handleUserJoinedChannel(userId: string, channelId: string, currentUserId?: string) {
        const settings = getSettings();
        if (!settings) return;

        if (userId === currentUserId) {
            sendDebugMessage(channelId, `You joined managed channel <#${channelId}>`);
            moduleRegistry.dispatch(SocializeEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL, { channelId });

            const ownership = stateManager.getOwnership(channelId);
            if (ownership) {
                if (ownership.creatorId === userId || ownership.claimantId === userId) {
                    ChannelNameRotationModule.startRotation(channelId);
                }
            } else if (channelId !== settings.creationChannelId) {
                sendDebugMessage(channelId, `Unknown channel <#${channelId}> joined. Requesting info.`);
                this.requestChannelInfo(channelId);
            }
        }

        const ownership = stateManager.getOwnership(channelId);
        if (ownership) {
            const guildId = ChannelStore.getChannel(channelId)?.guild_id || settings.guildId;
            sendDebugMessage(channelId, `<@${userId}> joined owned channel`);
            moduleRegistry.dispatch(SocializeEvent.USER_JOINED_OWNED_CHANNEL, { channelId, userId, guildId });
        }
    },

    handleUserLeftChannel(userId: string, channelId: string, currentUserId?: string) {
        if (userId === currentUserId) {
            moduleRegistry.dispatch(SocializeEvent.LOCAL_USER_LEFT_MANAGED_CHANNEL, { channelId });
            ChannelNameRotationModule.stopRotation(channelId);
        }

        const ownership = stateManager.getOwnership(channelId);
        if (ownership) {
            moduleRegistry.dispatch(SocializeEvent.USER_LEFT_OWNED_CHANNEL, { channelId, userId });
            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                sendDebugMessage(channelId, `Owner <@${userId}> left channel`);
                if (userId === currentUserId) {
                    ChannelNameRotationModule.stopRotation(channelId);
                }
            }
        }
    },
};
