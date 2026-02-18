import { OptionType } from "@utils/types";
import { sendMessage } from "@utils/discord";
import { Menu, Alerts, TextInput, ChannelStore, SelectedChannelStore, UserStore } from "@webpack/common";
import { type Channel } from "@vencord/discord-types";
import { state, channelOwners, ActionType } from "../state"; import { log } from "../utils/logging";
import { formatCommand, formatsetChannelNameCommand } from "../utils/formatting";
import { queueAction } from "./queue";
import { PluginModule } from "../types/PluginModule";
import { ApplicationCommandOptionType, findOption } from "@api/Commands";

// #region Settings
// #endregion
// #endregion

// #region Utils / Formatting
// #endregion

export function getRotateNames(): string[] {
    const { settings } = require("..");
    return settings.store.rotateChannelNames.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
}
// #endregion

// #region Menus
export const ChannelNameMenuItems = {
    getRenameChannelItem: (channel: Channel) => (
        <Menu.MenuItem
            id="socialize-guild-rename-channel"
            label="Rename Channel"
            action={() => {
                let newName = channel.name;
                Alerts.show({
                    title: "Rename Channel",
                    confirmText: "Rename",
                    cancelText: "Cancel",
                    onConfirm: () => {
                        if (newName && newName !== channel.name) {
                            const cmd = formatsetChannelNameCommand(channel.id, newName);
                            queueAction({
                                type: ActionType.NAME,
                                userId: "",
                                channelId: channel.id,
                                guildId: channel.guild_id,
                                external: cmd
                            });
                        }
                    },
                    body: (
                        <div style={{ marginTop: "1rem" }}>
                            <TextInput
                                value={newName}
                                onChange={(v: string) => newName = v}
                                placeholder="Enter new channel name..."
                                autoFocus
                            />
                        </div>
                    )
                });
            }}
        />
    )
};

export const ChannelNameModule: PluginModule = {
    id: "channel-name",
    name: "Channel Naming",
    settings: {
        rotateChannelNames: {
            type: OptionType.STRING as const,
            description: "List of channel names to rotate through (one per line)",
            default: "General\nGaming\nMusic\nChilling",
            multiline: true,
            restartNeeded: false,
            onChange: state.onRotationSettingsChange
        },
        rotateChannelNamesTime: {
            type: OptionType.SLIDER as const,
            description: "Interval in minutes for channel name rotation",
            default: 15,
            min: 11,
            max: 120,
            markers: [11, 15, 30, 60, 120],
            stickToMarkers: false,
            restartNeeded: false,
            onChange: state.onRotationSettingsChange
        },
        rotateChannelNamesEnabled: {
            type: OptionType.BOOLEAN as const,
            description: "Enable channel name rotation",
            default: false,
            restartNeeded: false,
            onChange: state.onRotationSettingsChange
        },
        setChannelNameCommand: {
            type: OptionType.STRING as const,
            description: "Message to send to set channel name",
            default: "!v name {channel_name_new}",
            restartNeeded: false,
        },
    },
    commands: [
        {
            name: "name-start", description: "Start name rotation", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const { sendBotMessage } = require("@api/Commands");
                startRotation(channelId);
                sendBotMessage(ctx.channel.id, { content: "✅ Started rotation." });
            }
        },
        {
            name: "name-rotate", description: "Immediately rotate name", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const { sendBotMessage } = require("@api/Commands");
                rotateChannelName(channelId);
                sendBotMessage(ctx.channel.id, { content: "✅ Rotated name." });
            }
        },
        {
            name: "name-clear", description: "Stop rotation and clear state", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const channelId = SelectedChannelStore.getVoiceChannelId() || ctx.channel.id;
                const { sendBotMessage } = require("@api/Commands");
                stopRotation(channelId);
                state.rotationIndex.delete(channelId);
                sendBotMessage(ctx.channel.id, { content: "✅ Stopped rotation and cleared index." });
            }
        },
        {
            name: "name-check", description: "Check names for duplicates/invalid length", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const { settings } = require("..");
                const names = getRotateNames();
                const invalid = names.filter(n => n.length === 0 || n.length > 15 || n.trim() === "");
                const duplicates = names.filter((n, i) => names.indexOf(n) !== i);

                if (invalid.length > 0 || duplicates.length > 0) {
                    let msg = "⚠️ Name check results:\n";
                    if (invalid.length > 0) msg += `- Invalid: ${invalid.join(", ")}\n`;
                    if (duplicates.length > 0) msg += `- Duplicates: ${duplicates.join(", ")}\n`;

                    const valid = names.filter(n => !invalid.includes(n) && !duplicates.includes(n));
                    settings.store.rotateChannelNames = valid.join("\n");
                    sendBotMessage(ctx.channel.id, { content: msg + "Removed invalid/duplicate items." });
                } else {
                    sendBotMessage(ctx.channel.id, { content: "✅ All names are valid and unique." });
                }
            }
        },
        {
            name: "name-add", description: "Add a name to the list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "name", description: "Name to add", type: ApplicationCommandOptionType.STRING, required: true }], execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const { settings } = require("..");
                const newName = findOption(args, "name", "") as string;
                const names = getRotateNames();
                if (names.includes(newName)) { sendBotMessage(ctx.channel.id, { content: "❌ Name already exists." }); return; }
                if (newName.length > 15) { sendBotMessage(ctx.channel.id, { content: "❌ Name too long (max 15)." }); return; }
                settings.store.rotateChannelNames += `\n${newName}`;
                sendBotMessage(ctx.channel.id, { content: `✅ Added ${newName}.` });
            }
        },
        {
            name: "name-remove", description: "Remove a name from the list", type: ApplicationCommandOptionType.SUB_COMMAND, options: [{ name: "name", description: "Name to remove", type: ApplicationCommandOptionType.STRING, required: true }], execute: (args: any, ctx: any) => {
                const { sendBotMessage } = require("@api/Commands");
                const { settings } = require("..");
                const toRemove = findOption(args, "name", "") as string;
                const names = getRotateNames();
                const newList = names.filter(n => n !== toRemove);
                settings.store.rotateChannelNames = newList.join("\n");
                sendBotMessage(ctx.channel.id, { content: `✅ Removed ${toRemove}.` });
            }
        },
        {
            name: "name-share", description: "Share the name list in chat", type: ApplicationCommandOptionType.SUB_COMMAND, execute: (args: any, ctx: any) => {
                const names = getRotateNames();
                sendMessage(ctx.channel.id, { content: `\`\`\`\n${names.join("\n")}\n\`\`\`` });
            }
        },
    ],
    getChannelMenuItems: (channel) => ([
        ChannelNameMenuItems.getRenameChannelItem(channel)
    ].filter(Boolean) as any),
    getToolboxMenuItems: (channelId) => {
        const { ChannelStore } = require("@webpack/common");
        const channel = channelId ? ChannelStore.getChannel(channelId) : null;
        if (!channel) return null;
        return ([
            ChannelNameMenuItems.getRenameChannelItem(channel)
        ].filter(Boolean) as any);
    },
    onStart: () => {
        const { settings } = require("..");
        if (settings.store.enabled && settings.store.rotateChannelNamesEnabled) {
            const myChannelId = SelectedChannelStore.getVoiceChannelId();
            if (myChannelId) {
                const ownership = channelOwners.get(myChannelId);
                const me = UserStore.getCurrentUser();
                if (ownership && (ownership.creator?.userId === me?.id || ownership.claimant?.userId === me?.id)) {
                    startRotation(myChannelId);
                }
            }
        }
    },
    onStop: () => {
        const activeChannels = Array.from(state.rotationIntervals.keys());
        for (const channelId of activeChannels) {
            stopRotation(channelId);
        }
    },
    onVoiceStateUpdate: (voiceStates) => {
        const { settings } = require("..");
        if (!settings.store.rotateChannelNamesEnabled) return;

        const me = UserStore.getCurrentUser();
        if (!me) return;

        const targetGuildVoiceStates = voiceStates.filter(s => s.guildId === settings.store.guildId);
        for (const s of targetGuildVoiceStates) {
            if (s.userId === me.id) {
                const newChannelId = s.channelId ?? null;
                const oldChannelId = s.oldChannelId ?? null;

                if (newChannelId !== oldChannelId) {
                    if (oldChannelId) stopRotation(oldChannelId);

                    if (newChannelId) {
                        const ownership = channelOwners.get(newChannelId);
                        if (ownership && (ownership.creator?.userId === me.id || ownership.claimant?.userId === me.id)) {
                            startRotation(newChannelId);
                        }
                    }
                }
            }
        }
    },
    onChannelCreatorChanged: (channel, oldCreator, newCreator) => {
        const me = UserStore.getCurrentUser();
        if (newCreator?.userId === me?.id) startRotation(channel.id);
        else if (oldCreator?.userId === me?.id) stopRotation(channel.id);
    },
    onChannelClaimantChanged: (channel, oldClaimant, newClaimant) => {
        const me = UserStore.getCurrentUser();
        if (newClaimant?.userId === me?.id) startRotation(channel.id);
        else if (oldClaimant?.userId === me?.id) stopRotation(channel.id);
    }
};
// #endregion

// #region Logic
export function rotateChannelName(channelId: string) {
    const names = getRotateNames();
    if (names.length === 0) {
        log(`No names to rotate for channel ${channelId}, stopping rotation.`);
        stopRotation(channelId);
        return;
    }

    let index = state.rotationIndex.get(channelId) ?? 0;
    if (index >= names.length) index = 0;

    const nextName = names[index];
    const formatted = formatsetChannelNameCommand(channelId, nextName);

    log(`Rotating channel ${channelId} to name: ${nextName} (Index: ${index})`);
    sendMessage(channelId, { content: formatted });

    state.rotationIndex.set(channelId, (index + 1) % names.length);
    state.lastRotationTime.set(channelId, Date.now());
}

export function startRotation(channelId: string) {
    const { settings } = require("..");
    if (!settings.store.enabled) return;
    if (state.rotationIntervals.has(channelId)) return;

    if (!settings.store.rotateChannelNamesEnabled) {
        log(`Channel name rotation is disabled in settings, skipping ${channelId}.`);
        return;
    }

    const intervalMinutes = settings.store.rotateChannelNamesTime;
    if (intervalMinutes < 11) {
        log(`Rotation interval for ${channelId} is less than 11 minutes, skipping to prevent rate limits.`);
        return;
    }

    const names = getRotateNames();
    if (names.length === 0) {
        log(`No names configured for rotation, skipping ${channelId}.`);
        return;
    }

    log(`Starting channel name rotation for ${channelId} every ${intervalMinutes} minutes.`);

    const channel = ChannelStore.getChannel(channelId);
    let startIndex = 0;
    if (channel) {
        const currentName = channel.name;
        const idx = names.indexOf(currentName);
        if (idx !== -1) {
            startIndex = (idx + 1) % names.length;
            log(`Current name '${currentName}' found at index ${idx}. Next rotation will use index ${startIndex}.`);
        } else {
            log(`Current name '${currentName}' not found in rotation list. Starting from index 0.`);
        }
    }
    state.rotationIndex.set(channelId, startIndex);

    const intervalId = setInterval(() => {
        rotateChannelName(channelId);
    }, intervalMinutes * 60 * 1000);

    state.rotationIntervals.set(channelId, intervalId);
    state.lastRotationTime.set(channelId, Date.now());
}

export function stopRotation(channelId: string) {
    const intervalId = state.rotationIntervals.get(channelId);
    if (intervalId) {
        log(`Stopping channel name rotation for ${channelId}.`);
        clearInterval(intervalId);
        state.rotationIntervals.delete(channelId);
        state.rotationIndex.delete(channelId);
        state.lastRotationTime.delete(channelId);
    }
}

export function restartAllRotations() {
    const { settings } = require("..");
    log("Settings changed, updating rotations...");

    const activeChannels = Array.from(state.rotationIntervals.keys());
    for (const channelId of activeChannels) {
        stopRotation(channelId);
    }

    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    if (settings.store.enabled && settings.store.rotateChannelNamesEnabled && myChannelId) {
        const ownership = channelOwners.get(myChannelId);
        const me = UserStore.getCurrentUser();
        if (ownership && (ownership.creator?.userId === me?.id || ownership.claimant?.userId === me?.id)) {
            log(`Restarting rotation for current channel ${myChannelId}`);
            startRotation(myChannelId);
        }
    }
}
// #endregion
