import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { SocializeEvent, BotResponseType } from "../types/events";
import { ChannelOwnership, MemberChannelInfo } from "../types/state";
import { stateManager } from "../utils/stateManager";
import { logger } from "../utils/logger";
import { Message, VoiceState, Channel, User, Guild, ChannelWithComparator, ThreadJoined } from "@vencord/discord-types";
import { BotResponse } from "../utils/BotResponse";
import { parseBotInfoMessage } from "../utils/parsing";
import { actionQueue } from "../utils/actionQueue";
import { formatCommand } from "../utils/formatting";
import { sendDebugMessage } from "../utils/debug";
import { isUserInVoiceChannel } from "../utils/channels";
import {
    GuildChannelStore, ChannelStore, GuildStore,
    SelectedChannelStore, UserStore as Users,
    VoiceStateStore, ChannelActions,
    ChannelRouter,
    Menu, React, showToast
} from "@webpack/common";
import { openPluginModal } from "@components/settings/tabs";
import { WhitelistModule } from "./whitelist";
import { BansModule } from "./bans";
import { BlacklistModule } from "./blacklist";
import { ChannelNameRotationModule } from "./channelNameRotation";
import { plugins } from "@api/PluginManager";
import { sendBotMessage, ApplicationCommandOptionType } from "@api/Commands";
import { getNewLineList } from "../utils/settingsHelpers";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getSettings() {
    return moduleRegistry.settings;
}

export const OwnershipActions = {
    syncInfo(channelId: string) {
        OwnershipModule.requestChannelInfo(channelId);
    },
    claimChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.claimCommand, channelId), channelId, true);
    },
    lockChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.lockCommand, channelId), channelId, true);
    },
    unlockChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.unlockCommand, channelId), channelId, true);
    },
    resetChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.resetCommand, channelId), channelId);
    },
    setChannelSize(channelId: string, size: number) {
        const s = getSettings();
        if (!s) return;
        const sizeCmd = formatCommand(s.setSizeCommand || "!v size {size}", channelId)
            .replace(/{size}/g, String(size))
            .replace(/{channel_limit}/g, String(size));
        actionQueue.enqueue(sizeCmd, channelId, false);
    },
    renameChannel(channelId: string, newName: string) {
        const s = getSettings();
        if (!s) return;
        actionQueue.enqueue(
            formatCommand(s.setChannelNameCommand || "!v name {name}", channelId, { name: newName }),
            channelId,
            true
        );
    },
    kickUser(channelId: string, userId: string) {
        const s = getSettings();
        if (!s) return;
        actionQueue.enqueue(
            formatCommand(s.kickCommand, channelId, { userId }),
            channelId,
            false,
            () => isUserInVoiceChannel(userId, channelId)
        );
    },
    kickBannedUsers(channelId: string): number {
        const meId = Users.getCurrentUser()?.id || "";
        const states = VoiceStateStore.getVoiceStatesForChannel(channelId);
        if (!stateManager.hasMemberConfig(meId)) {
            return -1;
        }
        const config = stateManager.getMemberConfig(meId);
        let n = 0;
        for (const uid in states) {
            if (config.bannedUsers.includes(uid)) {
                this.kickUser(channelId, uid);
                n++;
            }
        }
        return n;
    },
    createChannel() {
        const settings = getSettings();
        if (settings?.creationChannelId) {
            ChannelActions?.selectVoiceChannel(settings.creationChannelId);
        } else {
            showToast("No creation channel ID configured.");
        }
    },
    findOrCreateChannel(create = true) {
        const settings = getSettings();
        if (!settings) return;

        const meId = Users.getCurrentUser()?.id;
        if (!meId) {
            this.createChannel();
            return;
        }

        let targetChannelId: string | undefined;

        // 1. Check if the last channel we are cached creator in still exists
        const ownerships = stateManager["store"].activeChannelOwnerships;
        const myOwnedChannels = Object.keys(ownerships).filter(
            id => ownerships[id].creatorId === meId || ownerships[id].claimantId === meId
        ).sort((a, b) => {
            const timeA = Math.max(ownerships[a].createdAt || 0, ownerships[a].claimedAt || 0);
            const timeB = Math.max(ownerships[b].createdAt || 0, ownerships[b].claimedAt || 0);
            return timeB - timeA; // Descending, newest first
        });

        for (const id of myOwnedChannels) {
            const channel = ChannelStore.getChannel(id);
            if (channel && channel.parent_id === settings.categoryId) {
                targetChannelId = id;
                logger.info(`findOrCreateChannel: Found existing owned channel ${id}`);
                break;
            }
        }

        const guildChannels = GuildChannelStore.getChannels(settings.guildId);
        let matchedChannel: ChannelWithComparator | ThreadJoined | undefined;

        // 2. Search for any channel that matches the channel name in our cached memberchannelinfo object
        if (!targetChannelId && stateManager.hasMemberConfig(meId)) {
            const config = stateManager.getMemberConfig(meId);
            if (config.customName && guildChannels?.SELECTABLE) {
                matchedChannel = guildChannels.SELECTABLE.find(({ channel }) =>
                    channel.parent_id === settings.categoryId &&
                    channel.name === config.customName
                );
                if (matchedChannel) {
                    targetChannelId = matchedChannel.channel.id;
                    logger.info(`findOrCreateChannel: Found channel matching custom name ${targetChannelId}`);
                }
            }
        }

        // 3. Search for any channels with names in our channel name rotation
        if (!targetChannelId && guildChannels?.SELECTABLE && settings.channelNameRotationNames) {
            const nameList = getNewLineList(settings.channelNameRotationNames);
            if (nameList.length > 0) {
                matchedChannel = guildChannels.SELECTABLE.find(({ channel }) =>
                    channel.parent_id === settings.categoryId &&
                    nameList.includes(channel.name)
                );
                if (matchedChannel) {
                    targetChannelId = matchedChannel.channel.id;
                    logger.info(`findOrCreateChannel: Found channel matching rotation name ${targetChannelId}`);
                }
            }
        }
        const channelName = matchedChannel ? matchedChannel.channel.name : targetChannelId;

        if (targetChannelId) {
            showToast(`Joining channel ${channelName}`);
            ChannelActions?.selectVoiceChannel(targetChannelId);
            // Wait 2 seconds before focusing the text chat
            setTimeout(() => {
                ChannelRouter?.transitionToChannel(targetChannelId);
            }, 2000);
        } else if (create) {
            logger.info("findOrCreateChannel: No existing channel found, creating a new one.");
            showToast("No channel found, creating one");
            this.createChannel();
        } else {
            logger.info("findOrCreateChannel: No existing channel found, not creating a new one.");
            showToast("No existing channel found");
        }
    },
    resetState() {
        stateManager["store"].activeChannelOwnerships = {};
        stateManager["store"].memberConfigs = {};
        showToast("Plugin state has been reset.");
    },
    openSettings() {
        try { openPluginModal(plugins["SocializeGuild"]); } catch (e) { logger.error("Could not open settings modal:", e); }
    }
};

function getMyVoiceChannelId(): string | null {
    return SelectedChannelStore.getVoiceChannelId() ?? null;
}

function getOwnership(channelId: string): ChannelOwnership | null {
    return stateManager.getOwnership(channelId);
}

function amIOwner(channelId: string): boolean {
    return isUserOwner(Users.getCurrentUser()?.id || "", channelId);
}

function isUserOwner(userId: string, channelId: string): boolean {
    const o = getOwnership(channelId);
    return o?.creatorId === userId || o?.claimantId === userId;
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

    const meId = Users.getCurrentUser()?.id || "";
    const ownership = stateManager.getOwnership(channel.id);
    const amOwner = ownership?.creatorId === meId || ownership?.claimantId === meId;

    const enqueue = (cmd: string, priority = false) =>
        actionQueue.enqueue(formatCommand(cmd, channel.id), channel.id, priority);

    const items: React.ReactElement[] = [
        <Menu.MenuItem
            id="socialize-claim-channel"
            label="Claim Channel"
            key="socialize-claim-channel"
            action={() => OwnershipActions.claimChannel(channel.id)}
        />,
        <Menu.MenuItem
            id="socialize-lock-channel"
            label="Lock Channel"
            key="socialize-lock-channel"
            action={() => OwnershipActions.lockChannel(channel.id)}
        />,
        <Menu.MenuItem
            id="socialize-unlock-channel"
            label="Unlock Channel"
            key="socialize-unlock-channel"
            action={() => OwnershipActions.unlockChannel(channel.id)}
        />,
        <Menu.MenuItem
            id="socialize-reset-channel"
            label="Reset Channel"
            key="socialize-reset-channel"
            action={() => OwnershipActions.resetChannel(channel.id)}
        />,
        <Menu.MenuItem
            id="socialize-info-channel"
            label="Channel Info"
            key="socialize-info-channel"
            action={() => OwnershipActions.syncInfo(channel.id)}
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
                    action={() => OwnershipActions.setChannelSize(channel.id, size)}
                />
            ))}
        </Menu.MenuItem>,
    ];

    if (amOwner) {
        items.push(<Menu.MenuSeparator key="socialize-owner-items-sep" />);

        items.push(
            <Menu.MenuItem
                id="socialize-guild-rename-channel"
                key="socialize-guild-rename-channel"
                label="Rename Channel"
                color="brand"
                action={() => {
                    let newNameValue = channel.name;
                    const { TextInput, Alerts, React: R } = require("@webpack/common");

                    const RenameBody = ({ initialValue, onUpdate }: { initialValue: string, onUpdate: (v: string) => void }) => {
                        const [val, setVal] = R.useState(initialValue);
                        return (
                            <div style={{ marginTop: "1rem" }}>
                                <TextInput
                                    value={val}
                                    onChange={(v: string) => { setVal(v); onUpdate(v); }}
                                    placeholder="Enter new channel name..."
                                    autoFocus
                                />
                            </div>
                        );
                    };

                    Alerts.show({
                        title: "Rename Channel",
                        confirmText: "Rename",
                        cancelText: "Cancel",
                        onConfirm: () => {
                            if (newNameValue && newNameValue !== channel.name) {
                                OwnershipActions.renameChannel(channel.id, newNameValue);
                            }
                        },
                        body: <RenameBody initialValue={channel.name} onUpdate={(v) => newNameValue = v} />
                    });
                }}
            />
        );

        items.push(
            <Menu.MenuItem
                id="socialize-kick-banned"
                label="Kick Banned Users"
                key="socialize-kick-banned"
                color="danger"
                action={() => {
                    const n = OwnershipActions.kickBannedUsers(channel.id);
                    if (n === -1) {
                        showToast("No banned users in VC (no personal ban list found).");
                    } else {
                        showToast(n > 0 ? `Kicked ${n} banned user(s).` : "No banned users in VC.");
                    }
                }}
            />
        );
    }

    return items;
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
    const isWhitelisted = WhitelistModule.isWhitelisted(user.id);

    // Ban check: check the current owner's ban list
    const ownerId = (ownership?.claimantId || ownership?.creatorId || "");
    const ownerConfig = (myChannelId && ownerId && stateManager.hasMemberConfig(ownerId))
        ? stateManager.getMemberConfig(ownerId)
        : null;
    const isBlacklisted = BlacklistModule.isBlacklisted(user.id);
    const isBanned = (ownerConfig?.bannedUsers.includes(user.id) ?? false) || isBlacklisted;

    const showToast = (msg: string) => {
        const { Toasts } = require("@webpack/common");
        Toasts.show({ message: msg, type: Toasts.Type.SUCCESS });
    };

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
                        ? `👑 Is Claimant`
                        : `✨ Is Creator`}
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
                action={() => OwnershipActions.kickUser(myChannelId!, user.id)}
            />
        );
    }

    // Permit/Unpermit (only if I'm owner)
    if (amOwner && myChannelId) {
        const hasOwnerCfg = stateManager.hasMemberConfig(meId);
        const ownerCfg = hasOwnerCfg ? stateManager.getMemberConfig(meId) : null;
        const isPermitted = ownerCfg?.permittedUsers.includes(user.id) || isWhitelisted;
        items.push(
            <Menu.MenuItem
                id="socialize-permit-user"
                key="socialize-permit-user"
                label={isPermitted ? "Unpermit" : "Permit"}
                color={isPermitted ? "default" : "success"}
                action={() => {
                    if (isPermitted) {
                        WhitelistModule.unpermitUser(user.id, myChannelId!);
                        showToast(`Queued unpermit for ${getUserDisplayName(user.id)}`);
                    } else {
                        WhitelistModule.permitUser(user.id, myChannelId!);
                        showToast(`Queued permit for ${getUserDisplayName(user.id)}`);
                    }
                }}
            />
        );
    }

    // Whitelist / Blacklist (Global settings, accessible if owner or admin-like)
    items.push(
        <Menu.MenuItem
            id="socialize-whitelist-user"
            key="socialize-whitelist-user"
            label={isWhitelisted ? "Remove from Whitelist" : "Add to Whitelist"}
            color={isWhitelisted ? "brand" : "brand"}
            action={() => {
                if (isWhitelisted) {
                    WhitelistModule.unwhitelistUser(user.id, myChannelId || undefined);
                } else {
                    WhitelistModule.whitelistUser(user.id, myChannelId || undefined);
                }
            }}
        />
    );

    items.push(
        <Menu.MenuItem
            id="socialize-blacklist-user"
            key="socialize-blacklist-user"
            label={isBlacklisted ? "Remove from Blacklist" : "Add to Blacklist"}
            color={isBlacklisted ? "danger" : "danger"}
            action={() => {
                if (isBlacklisted) {
                    BlacklistModule.unblacklistUser(user.id, myChannelId || undefined);
                } else {
                    BlacklistModule.blacklistUser(user.id, myChannelId || undefined);
                }
            }}
        />
    );

    // Ban/Unban (only if I'm owner)
    if (amOwner && myChannelId) {
        items.push(
            <Menu.MenuItem
                id="socialize-ban-user"
                key="socialize-ban-user"
                label={isBanned ? "Unban from VC" : "Ban from VC"}
                color={isBanned ? "success" : "danger"}
                action={() => {
                    if (isBanned) {
                        BansModule.unbanUser(user.id, myChannelId!);
                        showToast(`Queued unban for ${getUserDisplayName(user.id)}`);
                    } else {
                        BansModule.banUser(user.id, myChannelId!);
                        showToast(`Queued ban for ${getUserDisplayName(user.id)}`);
                    }
                }}
            />
        );
    }

    return items.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// Guild Menu Items
// ─────────────────────────────────────────────────────────────

function makeStatusItems(voiceChannelId?: string, prefix = "guild"): React.ReactElement[] {
    const ownership = voiceChannelId ? getOwnership(voiceChannelId) : null;
    const s = getSettings();

    const creatorLabel = ownership?.creatorId
        ? `✨ Creator: ${getUserDisplayName(ownership.creatorId)}`
        : "✨ Creator: None";
    const claimantLabel = ownership?.claimantId
        ? `👑 Claimant: ${getUserDisplayName(ownership.claimantId)}`
        : "👑 Claimant: None";

    return [
        // Read-only status labels (disabled plain MenuItems)
        <Menu.MenuItem
            key={`${prefix}-creator-status`}
            id={`socialize-${prefix}-creator-status`}
            label={creatorLabel}
            disabled
            action={() => { }}
        />,
        <Menu.MenuItem
            key={`${prefix}-claimant-status`}
            id={`socialize-${prefix}-claimant-status`}
            label={claimantLabel}
            disabled
            action={() => { }}
        />,
        <Menu.MenuSeparator key={`${prefix}-status-sep`} />,
        // Real feature toggles
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-queue`}
            id={`socialize-${prefix}-toggle-queue`}
            label="Queue Actions"
            checked={!!s?.queueEnabled}
            action={() => { if (s) s.queueEnabled = !s.queueEnabled; }}
        />,
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-ban-rotate`}
            id={`socialize-${prefix}-toggle-ban-rotate`}
            label="Ban Rotation"
            checked={!!s?.banRotateEnabled}
            action={() => { if (s) s.banRotateEnabled = !s.banRotateEnabled; }}
        />,
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-permit-rotate`}
            id={`socialize-${prefix}-toggle-permit-rotate`}
            label="Permit Rotation"
            checked={!!(s as any)?.permitRotateEnabled}
            action={() => { if (s) (s as any).permitRotateEnabled = !(s as any).permitRotateEnabled; }}
        />,
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-ban-blacklist`}
            id={`socialize-${prefix}-toggle-ban-blacklist`}
            label="Ban Blacklisted"
            checked={!!s?.banInLocalBlacklist}
            action={() => { if (s) s.banInLocalBlacklist = !s.banInLocalBlacklist; }}
        />,
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-ban-blocked`}
            id={`socialize-${prefix}-toggle-ban-blocked`}
            label="Ban Blocked Users"
            checked={!!s?.banBlockedUsers}
            action={() => { if (s) s.banBlockedUsers = !s.banBlockedUsers; }}
        />,
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-ban-roles`}
            id={`socialize-${prefix}-toggle-ban-roles`}
            label="Ban Not-in-Role"
            checked={!!s?.banNotInRoles}
            action={() => { if (s) s.banNotInRoles = !s.banNotInRoles; }}
        />,
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-cleanup`}
            id={`socialize-${prefix}-toggle-cleanup`}
            label="Command Cleanup"
            checked={!!s?.commandCleanup}
            action={() => { if (s) s.commandCleanup = !s.commandCleanup; }}
        />,
        <Menu.MenuCheckboxItem
            key={`${prefix}-toggle-debug`}
            id={`socialize-${prefix}-toggle-debug`}
            label="Debug Mode"
            checked={!!s?.enableDebug}
            action={() => { if (s) s.enableDebug = !s.enableDebug; }}
        />,
    ];
}

function makeGuildItems(guild: Guild): React.ReactElement[] {
    const voiceChannelId = getMyVoiceChannelId() || undefined;

    return [
        ...makeStatusItems(voiceChannelId, "guild"),
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
            action={() => OwnershipActions.syncInfo(voiceChannelId!)}
        />,
        <Menu.MenuItem
            id="socialize-guild-create-channel"
            label="Create Channel"
            key="socialize-guild-create-channel"
            action={() => OwnershipActions.createChannel()}
        />,
        <Menu.MenuSeparator key="socialize-guild-sep2" />,
        <Menu.MenuItem
            id="socialize-guild-reset-state"
            label="Reset Plugin State"
            key="socialize-guild-reset-state"
            color="danger"
            action={() => OwnershipActions.resetState()}
        />,
        <Menu.MenuItem
            id="socialize-open-settings"
            label="Open Settings"
            key="socialize-open-settings"
            action={() => OwnershipActions.openSettings()}
        />,
    ].filter(Boolean) as React.ReactElement[];
}

// ─────────────────────────────────────────────────────────────
// Toolbox Menu Items
// ─────────────────────────────────────────────────────────────

function makeToolboxItems(channel?: Channel): React.ReactElement[] {
    const voiceChannelId = channel?.id || getMyVoiceChannelId() || undefined;

    const items: (React.ReactElement | null)[] = [
        ...makeStatusItems(voiceChannelId, "toolbox"),
    ];

    // Channel-specific items when we have a channel
    if (voiceChannelId && channel) {
        items.push(
            <Menu.MenuItem
                id="socialize-toolbox-info"
                label="Get Channel Info"
                key="socialize-toolbox-info"
                action={() => OwnershipActions.syncInfo(voiceChannelId)}
            />,
            <Menu.MenuItem
                id="socialize-toolbox-claim"
                label="Claim Channel"
                key="socialize-toolbox-claim"
                action={() => OwnershipActions.claimChannel(voiceChannelId)}
            />,
            <Menu.MenuItem
                id="socialize-toolbox-lock"
                label="Lock Channel"
                key="socialize-toolbox-lock"
                action={() => OwnershipActions.lockChannel(voiceChannelId)}
            />,
            <Menu.MenuItem
                id="socialize-toolbox-unlock"
                label="Unlock Channel"
                key="socialize-toolbox-unlock"
                action={() => OwnershipActions.unlockChannel(voiceChannelId)}
            />
        );
    }

    items.push(
        <Menu.MenuItem
            id="socialize-toolbox-create"
            label="Create Channel"
            key="socialize-toolbox-create"
            action={() => OwnershipActions.createChannel()}
        />,
        <Menu.MenuItem
            id="socialize-toolbox-fetch-owners"
            label="Fetch All Owners"
            key="socialize-toolbox-fetch-owners"
            action={() => OwnershipModule.fetchAllOwners()}
        />,
        <Menu.MenuSeparator key="socialize-toolbox-settings-sep" />,
        <Menu.MenuItem
            id="socialize-toolbox-open-settings"
            label="Open Settings"
            key="socialize-toolbox-open-settings"
            action={() => OwnershipActions.openSettings()}
        />
    );

    return items.filter(Boolean) as React.ReactElement[];
}

// ─────────────────────────────────────────────────────────────
// Module Export
// ─────────────────────────────────────────────────────────────

export const OwnershipModule: SocializeModule = {
    name: "OwnershipModule",
    requiredDependencies: ["WhitelistModule", "BansModule", "BlacklistModule", "ChannelNameRotationModule"],

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
        logger.debug(`onVoiceStateUpdate: user ${newState.userId} (oldId: ${oldState.channelId}, newId: ${newState.channelId})`);

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

        moduleRegistry.dispatch(SocializeEvent.BOT_EMBED_RECEIVED, {
            messageId: message.id,
            channelId: message.channel_id,
            type: response.type,
            initiatorId: response.initiatorId,
            targetUserId: response.targetId,
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
                sendDebugMessage(`Synchronized info for <@${result.info.userId}>`, message.channel_id);
            }
        }

        // Dynamic state updates for ban/permit/lock actions
        let userId = response.initiatorId;
        const channelId = response.channelId || message.channel_id;

        if (!userId) { // Fallback: If we can't find an initiator, assume it's the owner of the channel
            const ownership = stateManager.getOwnership(channelId);
            userId = ownership?.claimantId || ownership?.creatorId || undefined;
        }

        const configExisted = userId ? stateManager.hasMemberConfig(userId) : false;

        if (userId) {
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

        let banSuffix = "";
        if (userId && (response.type === BotResponseType.BANNED || response.type === BotResponseType.UNBANNED)) {
            const updatedCfg = stateManager.getMemberConfig(userId);
            let count = updatedCfg.bannedUsers.length;
            if (!configExisted) {
                count = (response.type === BotResponseType.BANNED) ? 1 : 4;
            }
            banSuffix = ` (Bans: ${count})`;
        }

        const targetStr = response.targetId ? ` target <@${response.targetId}>` : "";
        sendDebugMessage(`Bot Response: **${response.type}**${targetStr} from <@${userId || "Unknown"}>${banSuffix}`, message.channel_id);
    },

    // ── External Commands ────────────────────────────────────

    externalCommands: [
        {
            name: "claim",
            description: "Claim the current channel",
            execute: (args, msg, channelId) => {
                OwnershipActions.claimChannel(channelId);
                return true;
            }
        },
        {
            name: "lock",
            description: "Lock the current channel",
            checkPermission: (msg) => isUserOwner(msg.author.id, msg.channel_id),
            execute: (args, msg, channelId) => {
                OwnershipActions.lockChannel(channelId);
                return true;
            }
        },
        {
            name: "unlock",
            description: "Unlock the current channel",
            checkPermission: (msg) => isUserOwner(msg.author.id, msg.channel_id),
            execute: (args, msg, channelId) => {
                OwnershipActions.unlockChannel(channelId);
                return true;
            }
        },
        {
            name: "reset",
            description: "Reset the current channel",
            checkPermission: (msg) => isUserOwner(msg.author.id, msg.channel_id),
            execute: (args, msg, channelId) => {
                OwnershipActions.resetChannel(channelId);
                return true;
            }
        },
        {
            name: "name",
            description: "Rename the current channel",
            options: [
                { name: "name", description: "The new name for the channel", type: ApplicationCommandOptionType.STRING, required: true }
            ],
            checkPermission: (msg) => isUserOwner(msg.author.id, msg.channel_id),
            execute: (args, msg, channelId) => {
                if (args.name) {
                    OwnershipActions.renameChannel(channelId, args.name);
                    return true;
                }
                return false;
            }
        },
        {
            name: "size",
            description: "Set the size limit for the current channel",
            options: [
                { name: "size", description: "The user limit (0 for unlimited)", type: ApplicationCommandOptionType.INTEGER, required: true }
            ],
            checkPermission: (msg) => isUserOwner(msg.author.id, msg.channel_id),
            execute: (args, msg, channelId) => {
                if (args.size !== undefined) {
                    OwnershipActions.setChannelSize(channelId, args.size);
                    return true;
                }
                return false;
            }
        },
        {
            name: "kick banned",
            description: "Kick all banned users from the VC",
            checkPermission: (msg) => isUserOwner(msg.author.id, msg.channel_id),
            execute: (args, msg, channelId) => {
                const n = OwnershipActions.kickBannedUsers(channelId);
                return n >= 0;
            }
        },
        {
            name: "kick",
            description: "Kick a specific user from the VC",
            options: [
                { name: "userId", description: "The user to kick", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg) => isUserOwner(msg.author.id, msg.channel_id),
            execute: (args, msg, channelId) => {
                if (args.userId) {
                    OwnershipActions.kickUser(channelId, args.userId);
                    return true;
                }
                return false;
            }
        }
    ],

    // ── Internal Helpers ─────────────────────────────────────

    handleOwnershipUpdate(channelId: string, ownerId: string, type: "creator" | "claimant", oldOwnership: ChannelOwnership | null, newOwnership: ChannelOwnership | null) {
        const meId = Users.getCurrentUser()?.id;

        this.notifyOwnership(channelId, ownerId, type);
        sendDebugMessage(`Ownership: **${ownerId === meId ? "You" : `<@${ownerId}>`}** recognized as **${type}**`, channelId);

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

        sendBotMessage(channelId, { content: formatted });
    },

    handleUserJoinedChannel(userId: string, channelId: string, currentUserId?: string) {
        const settings = getSettings();
        if (!settings) return;

        const ownership = stateManager.getOwnership(channelId);
        logger.debug(`handleUserJoinedChannel: user ${userId}, channel ${channelId}, hasOwnership: ${!!ownership}`);

        if (userId === currentUserId) {
            sendDebugMessage(`You joined managed channel <#${channelId}>`, channelId);
            moduleRegistry.dispatch(SocializeEvent.LOCAL_USER_JOINED_MANAGED_CHANNEL, { channelId });

            if (ownership) {
                if (ownership.creatorId === userId || ownership.claimantId === userId) {
                    ChannelNameRotationModule.startRotation(channelId);
                }
            } else if (channelId !== settings.creationChannelId) {
                sendDebugMessage(`Unknown channel <#${channelId}> joined. Requesting info.`, channelId);
                this.requestChannelInfo(channelId);
            }
        }

        if (ownership) {
            // Only handle joins for others if we are actually in the channel to manage it
            if (userId !== currentUserId && channelId !== getMyVoiceChannelId()) {
                return;
            }
            const guildId = ChannelStore.getChannel(channelId)?.guild_id || settings.guildId;
            sendDebugMessage(`<@${userId}> joined owned channel`, channelId);
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
            // Only handle leaves for others if we are actually in the channel
            if (userId !== currentUserId && channelId !== getMyVoiceChannelId()) {
                return;
            }
            moduleRegistry.dispatch(SocializeEvent.USER_LEFT_OWNED_CHANNEL, { channelId, userId });
            if (ownership.creatorId === userId || ownership.claimantId === userId) {
                sendDebugMessage(`Owner <@${userId}> left channel`, channelId);
                if (userId === currentUserId) {
                    ChannelNameRotationModule.stopRotation(channelId);
                }
            }
        }
    },
};
