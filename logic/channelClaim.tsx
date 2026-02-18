import { OptionType } from "@utils/types";
import { sendMessage } from "@utils/discord";
import {
    Menu, showToast, UserStore, ChannelStore, SelectedChannelStore, ChannelActions, GuildStore, GuildChannelStore, MessageStore, RestAPI, Constants, VoiceStateStore
} from "@webpack/common";
import { type Channel, type Message } from "@vencord/discord-types";
import { channelOwners, memberInfos, setMemberInfo, OwnerEntry, saveState, MemberChannelInfo, PluginVoiceChannel, PluginGuildMember, state } from "../state"; import { log, warn, error } from "../utils/logging";
import { formatCommand, formatMessageCommon, formatLimitCommand } from "../utils/formatting";
import { queueAction } from "./queue";
import { BotResponse, BotResponseType } from "../types/BotResponse";
import { startRotation, stopRotation } from "./channelName";
import { jumpToFirstMessage } from "../utils/navigation";
import { PluginModule } from "../types/PluginModule";
import { ApplicationCommandOptionType, findOption } from "@api/Commands";
// #region Settings
// #endregion
// #endregion

// #region Menus
export const ChannelMenuItems = {
    getClaimChannelItem: (channel: Channel) => (
        <Menu.MenuItem
            id="socialize-guild-claim-channel"
            label="Claim Channel"
            action={async () => {
                const me = UserStore.getCurrentUser();
                if (me) {
                    const { settings } = require("..");
                    const cmd = formatCommand(settings.store.claimCommand, channel.id);
                    queueAction({
                        action: "CLAIM",
                        userId: me.id,
                        channelId: channel.id,
                        guildId: channel.guild_id,
                        external: cmd
                    });
                } else {
                    showToast("Could not identify current user.");
                }
            }}
        />
    ),

    getLockChannelItem: (channel: Channel) => (
        <Menu.MenuItem
            id="socialize-guild-lock-channel"
            label="Lock Channel"
            action={() => {
                const { settings } = require("..");
                const cmd = formatCommand(settings.store.lockCommand, channel.id);
                queueAction({
                    userId: "",
                    channelId: channel.id,
                    guildId: channel.guild_id,
                    external: cmd
                });
            }}
        />
    ),

    getUnlockChannelItem: (channel: Channel) => (
        <Menu.MenuItem
            id="socialize-guild-unlock-channel"
            label="Unlock Channel"
            action={() => {
                const { settings } = require("..");
                const cmd = formatCommand(settings.store.unlockCommand, channel.id);
                queueAction({
                    userId: "",
                    channelId: channel.id,
                    guildId: channel.guild_id,
                    external: cmd
                });
            }}
        />
    ),

    getResetChannelItem: (channel: Channel) => (
        <Menu.MenuItem
            id="socialize-guild-reset-channel"
            label="Reset Channel"
            action={() => {
                const { settings } = require("..");
                const cmd = formatCommand(settings.store.resetCommand, channel.id);
                queueAction({
                    userId: "",
                    channelId: channel.id,
                    guildId: channel.guild_id,
                    external: cmd
                });
            }}
        />
    ),

    getInfoCommandItem: (channel: Channel) => (
        <Menu.MenuItem
            id="socialize-guild-info-command"
            label="Send Info Command"
            action={() => {
                const { settings } = require("..");
                const cmd = formatCommand(settings.store.infoCommand, channel.id);
                queueAction({
                    action: "INFO",
                    userId: "",
                    channelId: channel.id,
                    guildId: channel.guild_id,
                    external: cmd
                });
            }}
        />
    ),

    getSetSizeSubmenu: (channel: Channel) => (
        <Menu.MenuItem
            id="socialize-guild-set-size-submenu"
            label="Set Channel Size"
        >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(size => (
                <Menu.MenuItem
                    key={size}
                    id={`socialize-guild-set-size-${size}`}
                    label={size === 0 ? "Unlimited" : `${size} Users`}
                    action={() => {
                        const cmd = formatLimitCommand(channel.id, size);
                        queueAction({
                            userId: "",
                            channelId: channel.id,
                            guildId: channel.guild_id,
                            external: cmd
                        });
                    }}
                />
            ))}
        </Menu.MenuItem>
    )
};

export const GlobalMenuItems = {
    getCheckOwnershipItem: (channelId?: string) => {
        const { settings } = require("..");
        return (
            <Menu.MenuItem
                id="blu-vc-user-actions-check-ownership"
                label="Check Ownership"
                disabled={!channelId}
                action={async () => {
                    if (channelId) {
                        const ownerId = await checkChannelOwner(channelId, settings.store.botId);
                        if (ownerId) {
                            // checkChannelOwner handles updateOwner internally now
                        }
                    }
                }}
            />
        );
    },

    getFetchAllOwnersItem: () => (
        <Menu.MenuItem
            id="blu-vc-user-actions-fetch-all-owners"
            label="Fetch All Owners"
            action={() => fetchAllOwners()}
        />
    ),

    getChannelInfoItem: (channelId?: string) => (
        <Menu.MenuItem
            id="blu-vc-user-actions-get-info"
            label="Get Channel Info"
            disabled={!channelId}
            action={() => {
                if (channelId) requestChannelInfo(channelId);
            }}
        />
    ),

    getOwnerStatusItems: (channelId?: string) => {
        const { settings } = require("..");
        const { enabled } = settings.use(["enabled"]);
        let creatorStatus = "Creator: None";
        let claimantStatus = "Claimant: None";

        if (channelId) {
            const ownership = channelOwners.get(channelId);

            if (ownership?.creator) {
                const creatorUser = UserStore.getUser(ownership.creator.userId);
                const creatorName = creatorUser?.globalName || creatorUser?.username || ownership.creator.userId;
                creatorStatus = `Creator: ${creatorName}`;
            }

            if (ownership?.claimant) {
                const claimantUser = UserStore.getUser(ownership.claimant.userId);
                const claimantName = claimantUser?.globalName || claimantUser?.username || ownership.claimant.userId;
                claimantStatus = `Claimant: ${claimantName}`;
            }
        }

        return [
            <Menu.MenuCheckboxItem
                key="creator"
                id="blu-vc-user-actions-creator"
                label={creatorStatus}
                checked={enabled}
                action={() => {
                    const { settings } = require("..");
                    settings.store.enabled = !enabled;
                }}
            />,
            <Menu.MenuCheckboxItem
                key="claimant"
                id="blu-vc-user-actions-claimant"
                label={claimantStatus}
                checked={enabled}
                action={() => {
                    const { settings } = require("..");
                    settings.store.enabled = !enabled;
                }}
            />
        ];
    },

    getCreateChannelActionItem: () => {
        const { settings } = require("..");
        return (
            <Menu.MenuItem
                id="blu-vc-user-actions-create-channel"
                label="Create Channel"
                action={() => {
                    const createChannelId = settings.store.createChannelId;
                    if (createChannelId) {
                        ChannelActions.selectVoiceChannel(createChannelId);
                        const channel = ChannelStore.getChannel(createChannelId);
                        jumpToFirstMessage(createChannelId, channel?.guild_id);
                    } else {
                        showToast("No Create Channel ID configured in settings.");
                    }
                }}
            />
        );
    }
};

// #endregion

// #region Logic
export function updateOwner(channelId: string, userId: string, timestamp: number, type: 'creator' | 'claimant'): boolean {
    let ownership = channelOwners.get(channelId);
    if (!ownership) {
        ownership = new PluginVoiceChannel(channelId);
        channelOwners.set(channelId, ownership);
    }

    const oldCreator = ownership.creator;
    const oldClaimant = ownership.claimant;

    let changed = false;

    if (type === 'creator') {
        if (!oldCreator || oldCreator.userId !== userId) {
            ownership.creator = { userId, timestamp };
            changed = true;
        }
    } else if (type === 'claimant') {
        if (!oldClaimant || oldClaimant.userId !== userId) {
            ownership.claimant = { userId, timestamp };
            changed = true;
        }
    }

    if (changed) {
        saveState();

        if (type === 'creator') {
            const { Modules } = require("..");
            const channel = ChannelStore.getChannel(channelId);
            if (channel) Modules.forEach(m => m.onChannelCreatorChanged?.(channel, oldCreator, ownership!.creator));
        } else {
            const { Modules } = require("..");
            const channel = ChannelStore.getChannel(channelId);
            if (channel) Modules.forEach(m => m.onChannelClaimantChanged?.(channel, oldClaimant, ownership!.claimant));
        }
    }

    return changed;
}

export function notifyOwnership(channelId: string) {
    const { settings } = require("..");
    const { sendBotMessage } = require("@api/Commands");
    if (!settings.store.enabled) return;

    const ownership = channelOwners.get(channelId);
    if (!ownership) return;

    const channel = ChannelStore.getChannel(channelId);
    if (channel?.parent_id !== settings.store.categoryId) return;

    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;

    const ownerInfo = ownership.claimant || ownership.creator;
    if (!ownerInfo) return;

    const reason = ownership.claimant ? "Claimed" : "Created";
    const owner = UserStore.getUser(ownerInfo.userId);
    const ownerName = owner?.globalName || owner?.username || ownerInfo.userId;
    const formatted = settings.store.ownershipChangeMessage
        .replace(/{reason}/g, reason)
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
        .replace(/{guild_id}/g, channel?.guild_id || "")
        .replace(/{guild_name}/g, guild?.name || "Unknown Guild")
        .replace(/{user_id}/g, ownerInfo.userId)
        .replace(/{user_name}/g, ownerName);

    sendBotMessage(channelId, {
        content: formatMessageCommon(formatted),
    });
}

export async function checkChannelOwner(channelId: string, botId: string): Promise<(OwnerEntry & { type: 'creator' | 'claimant' }) | undefined> {
    const cached = MessageStore.getMessages(channelId);

    const msgsArray: Message[] = cached ? (cached.toArray ? cached.toArray() : cached) : [];

    for (const msg of msgsArray) {
        const response = new BotResponse(msg, botId);
        if (response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED)) {
            updateOwner(channelId, response.initiatorId, response.timestamp, response.type === BotResponseType.CREATED ? 'creator' : 'claimant');
        }
    }

    const currentOwnership = channelOwners.get(channelId);
    if (!currentOwnership?.creator) {
        const BATCH_LIMIT = 100;
        const MAX_BATCHES = 5;
        let collectedBatches: Message[][] = [];
        let beforeId: string | undefined;

        for (let batch = 0; batch < MAX_BATCHES; batch++) {
            try {
                const query: Record<string, string | number> = { limit: BATCH_LIMIT };
                if (beforeId) query.before = beforeId;

                const res = await RestAPI.get({
                    url: Constants.Endpoints.MESSAGES(channelId),
                    query
                });

                if (!res.body || !Array.isArray(res.body) || res.body.length === 0) break;

                const messages = res.body as Message[];
                collectedBatches.push(messages);

                let foundCreation = false;
                for (const msg of messages) {
                    const response = new BotResponse(msg, botId);
                    if (response.type === BotResponseType.CREATED) {
                        foundCreation = true;
                        break;
                    }
                }

                if (foundCreation) break;

                beforeId = messages[messages.length - 1].id;
            } catch (e) {
                error(`[OwnershipCheck] Error fetching batch ${batch + 1}:`, e);
                break;
            }
        }

        for (let b = collectedBatches.length - 1; b >= 0; b--) {
            const batch = collectedBatches[b];
            for (let i = batch.length - 1; i >= 0; i--) {
                const msg = batch[i];
                const response = new BotResponse(msg, botId);
                if (response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED)) {
                    updateOwner(channelId, response.initiatorId, response.timestamp, response.type === BotResponseType.CREATED ? 'creator' : 'claimant');
                }
            }
        }
    }

    const ownership = channelOwners.get(channelId);
    if (!ownership) return undefined;
    const isClaimant = ownership.claimant !== undefined;
    const entry = ownership.claimant || ownership.creator;
    if (!entry) return undefined;

    return { ...entry, type: isClaimant ? 'claimant' : 'creator' };
}

export async function fetchAllOwners() {
    const { settings } = require("..");
    const guildId = settings.store.guildId;
    const categoryId = settings.store.categoryId;
    const channels = GuildChannelStore.getChannels(guildId);
    if (!channels || !channels.SELECTABLE) return;

    log(`Batch fetching owners for category ${categoryId}...`);
    const targetChannels = channels.SELECTABLE.filter(({ channel }) => channel.parent_id === categoryId);

    for (const { channel } of targetChannels) {
        await checkChannelOwner(channel.id, settings.store.botId);
        await new Promise(r => setTimeout(r, 200));
    }
    log(`Finished batch fetching owners.`);
}

export function claimChannel(channelId: string, formerOwnerId?: string) {
    const { settings } = require("..");
    const formatted = formatCommand(settings.store.claimCommand, channelId, { userId: formerOwnerId });
    log(`Automatically claiming channel ${channelId}: ${formatted}`);
    sendMessage(channelId, { content: formatted });
}

export function requestChannelInfo(channelId: string) {
    const { settings } = require("..");
    if (!state.requestedInfo) state.requestedInfo = new Map();

    const now = Date.now();
    const lastRequest = state.requestedInfo.get(channelId) || 0;
    if (now - lastRequest < 5000) {
        log(`Skipping channel info request for ${channelId} (cooldown)`);
        return;
    }
    state.requestedInfo.set(channelId, now);

    log(`Queuing channel info request for ${channelId}`);
    const msg = formatCommand(settings.store.infoCommand, channelId);
    queueAction({
        action: "INFO",
        userId: UserStore.getCurrentUser()?.id || "",
        channelId: channelId,
        guildId: ChannelStore.getChannel(channelId)?.guild_id || settings.store.guildId,
        external: msg
    });
}

export function getMemberInfoForChannel(channelId: string): MemberChannelInfo | undefined {
    const ownership = channelOwners.get(channelId);
    if (!ownership) return undefined;

    if (ownership.claimant) {
        const info = memberInfos.get(ownership.claimant.userId)?.channelInfo;
        if (info) return info;
    }
    if (ownership.creator) {
        return memberInfos.get(ownership.creator.userId)?.channelInfo;
    }
    return undefined;
}

export function handleInfoUpdate(channelId: string, info: MemberChannelInfo) {
    const { settings } = require("..");
    const ownership = channelOwners.get(channelId);
    const targetOwnerId = ownership?.creator?.userId || ownership?.claimant?.userId;

    if (targetOwnerId) {
        setMemberInfo(targetOwnerId, info);
        log(`Updated member info for ${targetOwnerId} (via channel ${channelId})`);
    } else {
        log(`Could not update info for ${channelId}: Owner unknown.`);
    }

    if (settings.store.showChannelInfoChangeMessage) {
        const { sendBotMessage } = require("@api/Commands");
        const lines: string[] = [];
        if (info.name) lines.push(`**Name:** ${info.name}`);
        if (info.limit) lines.push(`**Limit:** ${info.limit}`);
        if (info.status) lines.push(`**Status:** ${info.status}`);
        if (info.permitted.length > 0) lines.push(`**Permitted:** ${info.permitted.length} users`);
        if (info.banned.length > 0) lines.push(`**Banned:** ${info.banned.length} users`);

        sendBotMessage(channelId, { content: lines.join("\n") });
    }
}

export function handleBotResponse(response: BotResponse) {
    const initiatorId = response.initiatorId;
    if (!initiatorId) return;

    const member = memberInfos.get(initiatorId);
    if (!member?.channelInfo) return;
    const info = member.channelInfo;

    const description = response.getRawDescription();
    const targetMatch = description.match(/<@!?(\d+)>/);
    const targetUserId = targetMatch ? targetMatch[1] : undefined;

    let changed = false;

    switch (response.type) {
        case BotResponseType.BANNED:
            if (targetUserId && !info.banned.includes(targetUserId)) {
                info.banned.push(targetUserId);
                changed = true;
                log(`Dynamically added ${targetUserId} to banned list for ${initiatorId}`);
            }
            break;
        case BotResponseType.UNBANNED:
            if (targetUserId) {
                const initialLen = info.banned.length;
                info.banned = info.banned.filter(id => id !== targetUserId);
                if (info.banned.length !== initialLen) {
                    changed = true;
                    log(`Dynamically removed ${targetUserId} from banned list for ${initiatorId}`);
                }
            }
            break;
        case BotResponseType.PERMITTED:
            if (targetUserId && !info.permitted.includes(targetUserId)) {
                info.permitted.push(targetUserId);
                changed = true;
                log(`Dynamically added ${targetUserId} to permitted list for ${initiatorId}`);
            }
            break;
        case BotResponseType.UNPERMITTED:
            if (targetUserId) {
                const initialLen = info.permitted.length;
                info.permitted = info.permitted.filter(id => id !== targetUserId);
                if (info.permitted.length !== initialLen) {
                    changed = true;
                    log(`Dynamically removed ${targetUserId} from permitted list for ${initiatorId}`);
                }
            }
            break;
        case BotResponseType.SIZE_SET:
            const sizeMatch = description.match(/(\d+)/);
            if (sizeMatch) {
                const newLimit = parseInt(sizeMatch[1]);
                if (info.limit !== newLimit) {
                    info.limit = newLimit;
                    changed = true;
                    log(`Dynamically updated limit to ${info.limit} for ${initiatorId}`);
                }
            }
            break;
        case BotResponseType.LOCKED:
            if (!info.status || !info.status.includes("locked")) {
                info.status = info.status ? info.status + ", locked" : "locked";
                changed = true;
                log(`Dynamically updated status to locked for ${initiatorId}`);
            }
            break;
        case BotResponseType.UNLOCKED:
            if (info.status && info.status.includes("locked")) {
                info.status = info.status.replace(/,? ?locked/, "").trim();
                if (info.status === "") info.status = undefined;
                changed = true;
                log(`Dynamically updated status to unlocked for ${initiatorId}`);
            }
            break;
    }

    if (changed) {
        setMemberInfo(initiatorId, info);
    }
}

export function handleOwnershipChange(channelId: string, ownerId: string) {
    const { settings } = require("..");
    const me = UserStore.getCurrentUser();
    const currentVoiceChannelId = SelectedChannelStore.getVoiceChannelId();

    if (currentVoiceChannelId && channelId !== currentVoiceChannelId && !state.rotationIntervals.has(channelId)) {
        return;
    }

    log(`Ownership change for ${channelId}: owner is ${ownerId}, me is ${me?.id}`);
    if (ownerId === me?.id) {
        log(`We are the owner! Starting rotation and requesting channel info`);
        startRotation(channelId);
        requestChannelInfo(channelId);

        if (settings.store.autoNavigateToOwnedChannel && channelId === currentVoiceChannelId) {
            const channel = ChannelStore.getChannel(channelId);
            jumpToFirstMessage(channelId, channel?.guild_id);
        }
    } else {
        if (state.rotationIntervals.has(channelId)) {
            log(`We are no longer the owner of ${channelId}, stopping rotation.`);
        }
        stopRotation(channelId);
    }
}

export function handleOwnerUpdate(channelId: string, userId: string, timestamp: number, type: 'creator' | 'claimant') {
    if (updateOwner(channelId, userId, timestamp, type)) {
        notifyOwnership(channelId);
        handleOwnershipChange(channelId, userId);
    }
}
export const ChannelClaimModule: PluginModule = {
    id: "channel-claim",
    name: "Channel Management",
    settings: {
        ownershipChangeNotificationAny: {
            type: OptionType.BOOLEAN as const,
            description: "Show notification for any channel ownership change",
            default: false,
            restartNeeded: false,
        },
        autoClaimDisbanded: {
            type: OptionType.BOOLEAN as const,
            description: "Automatically claim the channel you're in when its owner leaves",
            default: false,
            restartNeeded: false,
        },
        autoNavigateToOwnedChannel: {
            type: OptionType.BOOLEAN as const,
            description: "Automatically navigate to the channel you own",
            default: true,
            restartNeeded: false,
        },
        fetchOwnersOnStartup: {
            type: OptionType.BOOLEAN as const,
            description: "Fetch all owners in the category on startup",
            default: false,
            restartNeeded: false,
        },
        showChannelInfoChangeMessage: {
            type: OptionType.BOOLEAN as const,
            description: "Causes a message to be sent to the channel when the channel info changes",
            default: false,
            restartNeeded: false,
        },
        ownershipChangeMessage: {
            type: OptionType.STRING as const,
            description: "Message to show when ownership is detected",
            default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})",
            restartNeeded: false,
        },
        claimCommand: {
            type: OptionType.STRING as const,
            description: "Message to send to claim a channel",
            default: "!v claim",
            restartNeeded: false,
        },
        infoCommand: {
            type: OptionType.STRING as const,
            description: "Message to send to get channel info",
            default: "!v info",
            restartNeeded: false,
        },
        setChannelUserLimitCommand: {
            type: OptionType.STRING as const,
            description: "Message to send to set a channel limit",
            default: "!v size {channel_limit}",
            restartNeeded: false,
        },
        lockCommand: {
            type: OptionType.STRING as const,
            description: "Message to send to lock a channel",
            default: "!v lock",
            restartNeeded: false,
        },
        unlockCommand: {
            type: OptionType.STRING as const,
            description: "Message to send to unlock a channel",
            default: "!v unlock",
            restartNeeded: false,
        },
        resetCommand: {
            type: OptionType.STRING as const,
            description: "Message to send to reset channel settings",
            default: "!v reset",
            restartNeeded: false,
        },
    },
    commands: [
        {
            name: "info",
            description: "View channel/user info",
            type: ApplicationCommandOptionType.SUB_COMMAND,
            options: [
                { name: "user", description: "Target user (optional)", type: ApplicationCommandOptionType.USER, required: false },
                { name: "share", description: "Share results in chat", type: ApplicationCommandOptionType.BOOLEAN, required: false }
            ],
            execute: async (args: any, ctx: any) => {
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const { sendBotMessage } = require("@api/Commands");

                const isShare = findOption(args, "share", false) as boolean;
                let targetUserId = findOption(args, "user", "") as string;

                if (!targetUserId) {
                    const me = UserStore.getCurrentUser();
                    targetUserId = me?.id;
                }

                let targetChannelId = channelId;
                let info: MemberChannelInfo | undefined = targetUserId ? memberInfos.get(targetUserId)?.channelInfo : undefined;

                if (info && targetUserId) {
                    for (const [cid, ownership] of channelOwners.entries()) {
                        if (ownership.claimant?.userId === targetUserId || ownership.creator?.userId === targetUserId) {
                            targetChannelId = cid;
                            break;
                        }
                    }
                } else if (!info) {
                    info = getMemberInfoForChannel(channelId);
                }

                const ownership = channelOwners.get(targetChannelId);

                const embed: any = {
                    type: "rich",
                    title: `📊 Channel Information`,
                    color: 0x5865F2,
                    fields: [
                        {
                            name: "📝 Channel",
                            value: `<#${targetChannelId}>\n\`${targetChannelId}\``,
                            inline: true
                        },
                        {
                            name: "👑 Owner",
                            value: ownership
                                ? `Creator: ${ownership.creator?.userId ? `<@${ownership.creator.userId}>` : "None"}\nClaimant: ${ownership.claimant?.userId ? `<@${ownership.claimant.userId}>` : "None"}`
                                : "Unknown",
                            inline: true
                        }
                    ]
                };

                if (info) {
                    embed.fields.push({
                        name: "🔧 Channel Settings",
                        value: `Name: ${info.name || "N/A"}\nLimit: ${info.limit || "N/A"}\nOwnerID: ${ownership?.creator?.userId ? `<@${ownership.creator.userId}>` : "N/A"}`,
                        inline: false
                    });
                    if (info.permitted.length > 0) embed.fields.push({ name: `Permitted (${info.permitted.length})`, value: info.permitted.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                    if (info.banned.length > 0) embed.fields.push({ name: `Banned (${info.banned.length})`, value: info.banned.map(id => `<@${id}>`).join(", ").slice(0, 1000), inline: false });
                }

                if (isShare) {
                    const guild = GuildStore.getGuild(ctx.channel.guild_id);
                    let content = `### 📊 Channel Information for <#${targetChannelId}>\n`;
                    content += `- **Channel ID:** \`${targetChannelId}\`\n`;
                    if (ownership) {
                        content += `- **Creator:** ${ownership.creator?.userId ? `<@${ownership.creator.userId}>` : "None"}\n`;
                        content += `- **Claimant:** ${ownership.claimant?.userId ? `<@${ownership.claimant.userId}>` : "None"}\n`;
                    }
                    if (info) {
                        content += `**🔧 Settings:**\n`;
                        content += `- Name: \`${info.name || "N/A"}\`\n`;
                        content += `- Limit: \`${info.limit || "N/A"}\`\n`;
                        content += `- Owner ID: ${ownership?.creator?.userId ? `<@${ownership.creator.userId}>` : "N/A"}\n`;
                        if (info.permitted.length > 0) content += `- Permitted: ${info.permitted.length} users\n`;
                        if (info.banned.length > 0) content += `- Banned: ${info.banned.length} users\n`;
                    }
                    sendMessage(ctx.channel.id, { content });
                } else {
                    sendBotMessage(ctx.channel.id, { embeds: [embed] });
                }
            }
        },
        {
            name: "check",
            description: "Sync ownership and info",
            type: ApplicationCommandOptionType.SUB_COMMAND,
            execute: async (args: any, ctx: any) => {
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const { sendBotMessage } = require("@api/Commands");
                const { settings } = require("..");

                sendBotMessage(ctx.channel.id, { content: "🔄 Checking ownership and channel info..." });
                await checkChannelOwner(channelId, settings.store.botId);
                requestChannelInfo(channelId);
                sendBotMessage(ctx.channel.id, { content: "✅ Ownership check and sync complete." });
            }
        }
    ],
    getChannelMenuItems: (channel) => {
        const ch = channel.resolve();
        return ([
            ch && ChannelMenuItems.getClaimChannelItem(ch),
            ch && ChannelMenuItems.getLockChannelItem(ch),
            ch && ChannelMenuItems.getUnlockChannelItem(ch),
            ch && ChannelMenuItems.getResetChannelItem(ch),
            ch && ChannelMenuItems.getInfoCommandItem(ch),
            ch && ChannelMenuItems.getSetSizeSubmenu(ch)
        ].filter(Boolean) as any);
    },
    getGuildMenuItems: (guild) => ([
        GlobalMenuItems.getFetchAllOwnersItem(),
        GlobalMenuItems.getChannelInfoItem(SelectedChannelStore.getVoiceChannelId() || undefined),
        ...GlobalMenuItems.getOwnerStatusItems(SelectedChannelStore.getVoiceChannelId() || undefined)
    ].filter(Boolean) as any),
    getToolboxMenuItems: (channel) => ([
        ...GlobalMenuItems.getOwnerStatusItems(channel?.id),
        GlobalMenuItems.getChannelInfoItem(channel?.id),
        GlobalMenuItems.getCreateChannelActionItem()
    ].filter(Boolean) as any),
    onMessageCreate: (message, channel, guild) => {
        const { settings } = require("..");
        if (guild?.id !== settings.store.guildId) return;

        const response = new BotResponse(message, settings.store.botId);
        if (response.initiatorId && (response.type === BotResponseType.CREATED || response.type === BotResponseType.CLAIMED)) {
            handleOwnerUpdate(channel.id, response.initiatorId, response.timestamp, response.type === BotResponseType.CREATED ? 'creator' : 'claimant');
        }

        if (response.type === BotResponseType.INFO) {
            const { parseBotInfoMessage } = require("../utils");
            const result = parseBotInfoMessage(response);
            if (result) {
                log(`Successfully parsed channel info for ${result.channelId}`);
                handleInfoUpdate(result.channelId, result.info);
            }
        } else {
            handleBotResponse(response);
        }
    },
    onStart: () => {
        const { settings } = require("..");
        if (settings.store.enabled && settings.store.fetchOwnersOnStartup) {
            fetchAllOwners();
        }
    },
    onVoiceStateUpdate: (voiceStates) => {
        const { settings } = require("..");
        const me = UserStore.getCurrentUser();
        if (!me) return;

        const targetGuildVoiceStates = voiceStates.filter(s => s.guildId === settings.store.guildId);
        if (targetGuildVoiceStates.length === 0) return;

        if (state.myLastVoiceChannelId === undefined) {
            const initialCid = SelectedChannelStore.getVoiceChannelId() ?? null;
            state.myLastVoiceChannelId = initialCid;
            if (initialCid) {
                checkChannelOwner(initialCid, settings.store.botId).then(owner => {
                    if (owner) handleOwnerUpdate(initialCid, owner.userId, owner.timestamp, owner.type);
                });
            }
        }

        for (const s of targetGuildVoiceStates) {
            if (s.userId === me.id) {
                const newChannelId = s.channelId ?? null;
                if (newChannelId !== state.myLastVoiceChannelId) {
                    state.myLastVoiceChannelId = newChannelId;

                    if (newChannelId) {
                        const channel = ChannelStore.getChannel(newChannelId);
                        if (channel?.guild_id === settings.store.guildId && channel.parent_id === settings.store.categoryId) {
                            log(`Opening text chat of voice channel ${newChannelId}`);
                            ChannelActions.selectChannel(newChannelId);

                            const { jumpToFirstMessage } = require("../utils");
                            setTimeout(() => {
                                log(`Scrolling to start of ${newChannelId}`);
                                jumpToFirstMessage(newChannelId, channel.guild_id);

                                checkChannelOwner(newChannelId, settings.store.botId).then(owner => {
                                    if (owner) {
                                        handleOwnerUpdate(newChannelId, owner.userId, owner.timestamp, owner.type);

                                        if (settings.store.autoClaimDisbanded && owner.userId !== me.id) {
                                            const voiceStates = VoiceStateStore.getVoiceStatesForChannel(newChannelId);
                                            if (!voiceStates[owner.userId]) {
                                                log(`Owner ${owner.userId} not in channel, claiming disbanded channel.`);
                                                claimChannel(newChannelId, owner.userId);
                                            }
                                        }
                                    }
                                });
                            }, 1000);
                        }
                    }
                }
            }
        }
    },
    onUserLeft: (channel, user) => {
        const { settings } = require("..");
        const { channelOwners, state, saveState } = require("../state");
        const { VoiceStateStore } = require("@webpack/common");
        const { sendMessage } = require("@utils/discord");
        const channelId = channel.id;
        const userId = user.id;

        const ownership = channelOwners.get(channelId);
        if (!ownership) return;

        const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId);
        const occupantCount = voiceStates ? Object.keys(voiceStates).length : 0;

        if (occupantCount === 0) {
            log(`Channel ${channelId} is now empty. Clearing ownership.`);
            channelOwners.delete(channelId);
            saveState();
            return;
        }

        const isCreator = ownership.creator?.userId === userId;
        const isClaimant = ownership.claimant?.userId === userId;

        if (isCreator || isClaimant) {
            log(`Owner (${isCreator ? "Creator" : "Claimant"}) ${userId} left channel ${channelId}`);

            const isMyChannel = state.myLastVoiceChannelId === channelId;
            if (settings.store.autoClaimDisbanded && isMyChannel) {
                const creatorId = ownership.creator?.userId;
                const claimantId = ownership.claimant?.userId;

                const isCreatorPresent = creatorId && voiceStates && voiceStates[creatorId];
                const isClaimantPresent = claimantId && voiceStates && voiceStates[claimantId];

                if (!isCreatorPresent && !isClaimantPresent) {
                    log(`Channel ${channelId} is disbanded (All owners left), auto-claiming...`);
                    sendMessage(channelId, { content: settings.store.claimCommand });
                }
            }
        }
    }
};
// #endregion
