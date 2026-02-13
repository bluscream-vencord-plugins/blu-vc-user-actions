import { UserStore } from "@webpack/common";
import { settings, pluginName } from "./settings";
import { channelOwners, ChannelOwner } from "./state";

export function log(...args: any[]) {
    console.log(`[${pluginName}]`, ...args);
}

export function getKickList(): string[] {
    return settings.store.autoKickList.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

export function setKickList(list: string[]) {
    settings.store.autoKickList = list.join("\n");
}

export function getOwnerForChannel(channelId: string): ChannelOwner | undefined {
    return channelOwners.get(channelId);
}

export function updateOwner(channelId: string, owner: ChannelOwner) {
    const existing = channelOwners.get(channelId);
    if (!existing || existing.userId !== owner.userId || existing.reason !== owner.reason) {
        channelOwners.set(channelId, owner);
        return true;
    }
    return false;
}

export function formatMessageCommon(text: string): string {
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
