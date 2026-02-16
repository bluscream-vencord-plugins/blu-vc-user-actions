import { settings } from "../settings";
import { state } from "../state";
import { log } from "./logging";
import { getRotateNames, formatsetChannelNameCommand } from "./formatting";
import { getOwnerForChannel } from "./ownership";
import { sendMessage } from "@utils/discord";
import { ChannelStore, SelectedChannelStore, UserStore } from "@webpack/common";

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

    // Check if current name is in rotation list to determine starting index
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
    log("Settings changed, updating rotations...");

    // Stop everything first
    const activeChannels = Array.from(state.rotationIntervals.keys());
    for (const channelId of activeChannels) {
        stopRotation(channelId);
    }

    // If enabled, try to start rotation in the current channel if we are the owner
    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    if (settings.store.enabled && settings.store.rotateChannelNamesEnabled && myChannelId) {
        const ownerInfo = getOwnerForChannel(myChannelId);
        const me = UserStore.getCurrentUser();
        if (ownerInfo?.userId === me?.id) {
            log(`Restarting rotation for current channel ${myChannelId}`);
            startRotation(myChannelId);
        }
    }
}
