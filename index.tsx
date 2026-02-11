// Authors: Bluscream
// Created at 2026-02-11 09:10:00
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";
import { sendBotMessage } from "@api/Commands";
import { sendMessage } from "@utils/discord";
import {
    ChannelStore,
    GuildStore,
    UserStore,
    MessageActions,
    MessageStore,
    SelectedChannelStore,
    VoiceStateStore,
    Menu,
    RestAPI,
    Constants,
    showToast,
    ChannelActions,
    ChannelRouter,
} from "@webpack/common";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import type { User } from "@vencord/discord-types";

const pluginName = "VoiceChatUserActions";

function log(...args: any[]) {
    console.log(`[${pluginName}]`, ...args);
}

const settings = definePluginSettings({
    autoKickList: {
        type: OptionType.STRING,
        description: "List of user IDs to auto kick (newline separated)",
        default: "",
        multiline: true,
    },
    autoKickMessage: {
        type: OptionType.STRING,
        description: "Message to send when a user in the auto kick list joins",
        default: "!v kick {user_id}",
    },
    autoKickMessageReference: {
        type: OptionType.STRING,
        description: "Template Reference - Variables: ",
        default: `{now} = Datetime of message being sent
{now:DD.MM.YY HH:mm:ss} = Datetime with custom format
{my_id} = Your own User ID
{my_name} = Your own User Name
{guild_id} = Current Guild ID
{guild_name} = Current Guild Name
{channel_id} = Current Channel ID
{channel_name} = Current Channel Name
{user_id} = Target User ID
{user_name} = Target User Name`,
        readonly: true,
        multiline: true,
        onChange(_) {
            settings.store.autoKickMessageReference = settings.def.autoKickMessageReference.default;
        }
    },
    ownershipChangeMessage: {
        type: OptionType.STRING,
        description: "Message to show when ownership is detected",
        default: "✨ <@{user_id}> is now the owner of <#{channel_id}> (Reason: {reason})",
    },
    ownershipChangeMessageReference: {
        type: OptionType.STRING,
        description: "Template Reference - Variables: ",
        default: `{now} = Datetime of message being sent
{now:DD.MM.YY HH:mm:ss} = Datetime with custom format
{my_id} = Your own User ID
{my_name} = Your own User Name
{guild_id} = Current Guild ID
{guild_name} = Current Guild Name
{channel_id} = Current Channel ID
{channel_name} = Current Channel Name
{user_id} = Owner User ID
{user_name} = Owner User Name
{reason} = Reason for ownership (Created/Claimed)`,
        readonly: true,
        multiline: true,
        onChange(_) {
            settings.store.ownershipChangeMessageReference = settings.def.ownershipChangeMessageReference.default;
        }
    },
    createChannelId: {
        type: OptionType.STRING,
        description: "The Channel ID to join when clicking 'Create Channel'",
        default: "763914043252801566",
    },
    botId: {
        type: OptionType.STRING,
        description: "The Bot ID that sends the welcome message",
        default: "913852862990262282",
    },
    queueTime: {
        type: OptionType.SLIDER,
        description: "Minimum time between actions in ms",
        default: 2500,
        min: 0,
        max: 10000,
        markers: [0, 250, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000],
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automated actions",
        default: true,
    },
});

function getKickList(): string[] {
    return settings.store.autoKickList.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

function setKickList(list: string[]) {
    settings.store.autoKickList = list.join("\n");
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    if (!user) return;
    const kickList = getKickList();
    const isKicked = kickList.includes(user.id);

    children.push(
        <Menu.MenuItem
            id="vc-blu-vc-user-action"
            label={isKicked ? "Remove from Auto Kick" : "Auto Kick from VC"}
            action={async () => {
                const newList = isKicked
                    ? kickList.filter(id => id !== user.id)
                    : [...kickList, user.id];
                setKickList(newList);

                if (!isKicked) {
                    const myChannelId = SelectedChannelStore.getVoiceChannelId();
                    if (myChannelId) {
                        const voiceState = VoiceStateStore.getVoiceStateForChannel(myChannelId, user.id);
                        if (voiceState) {
                            const me = UserStore.getCurrentUser();
                            if (channelOwner.userId === "") {
                                channelOwner = await checkChannelOwner(myChannelId, settings.store.botId);
                            }
                            log(`Context menu kick: Channel ${myChannelId} Owner ${channelOwner.userId} Me ${me?.id}`);
                            if (channelOwner.userId === me?.id) {
                                actionQueue.push({
                                    userId: user.id,
                                    channelId: myChannelId,
                                    guildId: voiceState.guildId
                                });
                                processQueue();
                            } else {
                                showToast(`Not owner of channel (Owner: ${channelOwner.userId || "None"})`);
                            }
                        }
                    }
                }
            }}
            color={isKicked ? undefined : "danger"}
        />
    );
};

// Queue handling
const actionQueue: Array<{ userId: string; channelId: string; guildId?: string }> = [];
const processedUsers = new Map<string, number>();
let isProcessing = false;

function formatMessageCommon(text: string): string {
    const me = UserStore.getCurrentUser();
    const now = new Date();

    return text
        .replace(/{now(?::([^}]+))?}/g, (match, format) => {
            if (!format) return now.toLocaleString();
            const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
            return format
                .replace(/YYYY/g, String(now.getFullYear()))
                .replace(/YY/g, String(now.getFullYear()).slice(-2))
                .replace(/MMM/g, now.toLocaleString("default", { month: "short" }))
                .replace(/MM/g, pad(now.getMonth() + 1))
                .replace(/DD/g, pad(now.getDate()))
                .replace(/HH/g, pad(now.getHours()))
                .replace(/mm/g, pad(now.getMinutes()))
                .replace(/ss/g, pad(now.getSeconds()))
                .replace(/ms/g, pad(now.getMilliseconds(), 3));
        })
        .replace(/{my_id}|{me_id}/g, me?.id || "")
        .replace(/{my_name}|{me_name}/g, me?.globalName || me?.username || "");
}

async function processQueue() {
    if (isProcessing || actionQueue.length === 0) return;
    isProcessing = true;

    while (actionQueue.length > 0) {
        const item = actionQueue.shift();
        if (!item) continue;

        const { userId, channelId, guildId } = item;
        const now = Date.now();
        const lastAction = processedUsers.get(userId) || 0;

        // "if someone joins 3 times between queueTime, it will only write the autoKickMessage once"
        // This means we deduplicate by userId if the last action was too recent.
        if (now - lastAction < settings.store.queueTime) {
            continue;
        }

        log(`Processing kick for ${userId} in ${channelId}`);
        const user = UserStore.getUser(userId);

        const channel = ChannelStore.getChannel(channelId);
        const guild = guildId ? GuildStore.getGuild(guildId) : null;

        let formattedMessage = settings.store.autoKickMessage
            .replace(/{user_id}/g, userId)
            .replace(/{channel_id}/g, channelId)
            .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
            .replace(/{guild_id}/g, guildId || "")
            .replace(/{guild_name}/g, guild?.name || "Unknown Guild");

        formattedMessage = formatMessageCommon(formattedMessage);

        if (user) {
            formattedMessage = formattedMessage
                .replace(/{user_name}/g, user.username);
        } else {
            log(`User ${userId} not in cache, skipping name-based replacements`);
            formattedMessage = formattedMessage
                .replace(/{user_name}/g, userId);
        }

        try {
            log(`Sending kick message: ${formattedMessage}`);
            sendMessage(channelId, {
                content: formattedMessage,
            });
            processedUsers.set(userId, now);
        } catch (e) {
            console.error(`[${pluginName}] Failed to send message:`, e);
        }

        if (settings.store.queueTime > 0) {
            await new Promise(r => setTimeout(r, settings.store.queueTime));
        }
    }

    isProcessing = false;
}

interface ChannelOwner {
    userId: string;
    reason: string;
}

let myLastVoiceChannelId: string | null | undefined = undefined;
let channelOwner: ChannelOwner = { userId: "", reason: "" };

function notifyOwnership(channelId: string) {
    if (!channelOwner.userId) return;
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
    const owner = UserStore.getUser(channelOwner.userId);
    const ownerName = owner?.globalName || owner?.username || channelOwner.userId;
    const formatted = settings.store.ownershipChangeMessage
        .replace(/{reason}/g, channelOwner.reason)
        .replace(/{channel_id}/g, channelId)
        .replace(/{channel_name}/g, channel?.name || "Unknown Channel")
        .replace(/{guild_id}/g, channel?.guild_id || "")
        .replace(/{guild_name}/g, guild?.name || "Unknown Guild")
        .replace(/{user_id}/g, channelOwner.userId)
        .replace(/{user_name}/g, ownerName);

    sendBotMessage(channelId, {
        content: formatMessageCommon(formatted),
    });
}

function getMessageOwner(msg: any, botId: string): ChannelOwner | null {
    if (msg.author.id !== botId) return null;

    const embed = msg.embeds?.[0];
    if (!embed) return null;

    const authorName = embed.author?.name;
    if (authorName === "Channel Created") {
        const userId = msg.mentions?.[0]?.id || msg.mentions?.[0] || msg.content?.match(/<@!?(\d+)>/)?.[1];
        if (userId) return { userId, reason: "Created" };
    } else if (authorName === "Channel Claimed") {
        const iconURL = embed.author?.iconURL;
        if (iconURL) {
            const userIdFromUrl = iconURL.split("/avatars/")[1]?.split("/")[0];
            if (userIdFromUrl) return { userId: userIdFromUrl, reason: "Claimed" };
        }
    }
    return null;
}

async function checkChannelOwner(channelId: string, botId: string): Promise<ChannelOwner> {
    const fallback: ChannelOwner = { userId: "", reason: "Unknown" };
    const cached = MessageStore.getMessages(channelId);
    if (cached) {
        const msgsArray = cached.toArray ? cached.toArray() : cached;
        for (let i = msgsArray.length - 1; i >= 0; i--) {
            const owner = getMessageOwner(msgsArray[i], botId);
            if (owner) return owner;
        }
    }

    try {
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(channelId),
            query: { limit: 50 }
        });
        if (res.body && Array.isArray(res.body)) {
            for (let i = 0; i < res.body.length; i++) {
                const owner = getMessageOwner(res.body[i], botId);
                if (owner) return owner;
            }
        }
    } catch (e) {
        console.error("[blu-vc-user-actions] Failed to fetch messages for ownership check:", e);
    }

    return fallback;
}

export default definePlugin({
    name: pluginName,
    authors: [
        { name: "Bluscream", id: 1205616252488519723n },
        { name: "Antigravity", id: 0n }
    ],
    description: "Automatically takes actions against users joining your voice channel.",
    settings,
    contextMenus: {
        "user-context": UserContextMenuPatch
    },
    toolboxActions: () => {
        const { enabled } = settings.use(["enabled"]);
        const owner = UserStore.getUser(channelOwner.userId);
        const ownerName = owner?.globalName || owner?.username || channelOwner.userId;
        let status = "Not Owned";
        if (channelOwner.userId) {
            status = `Owned by ${ownerName} (${channelOwner.reason})`;
        }

        return [
            <Menu.MenuCheckboxItem
                id="blu-vc-user-actions-status"
                label={`${status}`}
                checked={enabled}
                action={() => {
                    settings.store.enabled = !enabled;
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-check-ownership"
                label="Check Ownership"
                action={async () => {
                    const cid = SelectedChannelStore.getVoiceChannelId();
                    if (cid) {
                        const owner = await checkChannelOwner(cid, settings.store.botId);
                        channelOwner = owner;
                        if (owner.userId) notifyOwnership(cid);
                    }
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-create-channel"
                label="Create Channel"
                action={() => {
                    const channelId = settings.store.createChannelId;
                    if (channelId) {
                        ChannelActions.selectVoiceChannel(channelId);
                        ChannelRouter.transitionToChannel(channelId);
                    } else {
                        showToast("No Create Channel ID configured in settings.");
                    }
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-kick-banned"
                label="Kick Banned Users"
                action={() => {
                    const channelId = SelectedChannelStore.getVoiceChannelId();
                    if (!channelId) return;
                    const channel = ChannelStore.getChannel(channelId);
                    if (!channel) return;
                    const states = VoiceStateStore.getVoiceStatesForChannel(channelId);
                    const kickList = getKickList();
                    let count = 0;
                    for (const userId in states) {
                        if (kickList.includes(userId)) {
                            actionQueue.push({
                                userId,
                                channelId,
                                guildId: channel.guild_id
                            });
                            count++;
                        }
                    }
                    if (count > 0) {
                        showToast(`Adding ${count} banned user(s) to kick queue...`);
                        processQueue();
                    } else {
                        showToast("No banned users found in current channel.");
                    }
                }}
            />,
            <Menu.MenuItem
                id="blu-vc-user-actions-settings"
                label="Edit Settings"
                action={() => openPluginModal(plugins["VoiceChatUserActions"])}
            />
        ];
    },
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }) {
            if (!settings.store.enabled) return;
            const me = UserStore.getCurrentUser();
            if (!me) return;

            // Initialize on first run
            if (myLastVoiceChannelId === undefined) {
                const initialCid = SelectedChannelStore.getVoiceChannelId() ?? null;
                myLastVoiceChannelId = initialCid;
                if (initialCid) {
                    checkChannelOwner(initialCid, settings.store.botId).then(owner => {
                        channelOwner = owner;
                        if (channelOwner.userId) notifyOwnership(initialCid);
                    });
                }
            }

            for (const state of voiceStates) {
                if (state.userId === me.id) {
                    const newChannelId = state.channelId ?? null;
                    if (newChannelId !== myLastVoiceChannelId) {
                        actionQueue.length = 0;
                        myLastVoiceChannelId = newChannelId;
                        channelOwner = { userId: "", reason: "Unknown" };

                        if (newChannelId) {
                            checkChannelOwner(newChannelId, settings.store.botId).then(owner => {
                                channelOwner = owner;
                                if (channelOwner.userId) notifyOwnership(newChannelId);
                            });
                        }
                    }
                }
            }

            const myChannelId = myLastVoiceChannelId;
            if (!myChannelId) return;

            // If we are still checking ownership, we might want to wait or skip.
            // But since checkChannelOwnership is called when we join, it should usually be ready.
            for (const state of voiceStates) {
                if (state.userId === me.id) continue;

                // User joined or moved to my channel
                if (state.oldChannelId !== myChannelId && state.channelId === myChannelId) {
                    const kickList = getKickList();
                    if (kickList.includes(state.userId)) {
                        const now = Date.now();
                        const lastAction = processedUsers.get(state.userId) || 0;
                        if (now - lastAction < settings.store.queueTime) continue;

                        log(`Checking ownership for ${myChannelId}. Current: ${channelOwner.userId} (Reason: ${channelOwner.reason})`);
                        if (channelOwner.userId === "") {
                            channelOwner = await checkChannelOwner(myChannelId, settings.store.botId);
                        }

                        if (channelOwner.userId === me.id) {
                            log(`Adding ${state.userId} to action queue`);
                            actionQueue.push({
                                userId: state.userId,
                                channelId: myChannelId,
                                guildId: state.guildId
                            });
                            processQueue();
                        } else {
                            log(`Not owner of ${myChannelId} (Owner: ${channelOwner.userId}), skipping kick for ${state.userId}`);
                        }
                    }
                }
            }
        },
        MESSAGE_CREATE({ message }) {
            if (!settings.store.enabled || !myLastVoiceChannelId) return;
            if (message.channelId !== myLastVoiceChannelId) return;

            const me = UserStore.getCurrentUser();
            if (!me) return;

            const owner = getMessageOwner(message, settings.store.botId);
            if (owner) {
                // If we didn't know we owned it, or the reason changed
                if (channelOwner.userId !== owner.userId || channelOwner.reason !== owner.reason) {
                    channelOwner = owner;
                    notifyOwnership(myLastVoiceChannelId);
                }
            }
        }
    }
});
