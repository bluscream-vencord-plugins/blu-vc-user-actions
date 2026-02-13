import { settings } from "../settings";

export function getKickList(): string[] {
    return settings.store.autoKickList.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

export function setKickList(list: string[]) {
    settings.store.autoKickList = list.join("\n");
}

export function getWhitelist(): string[] {
    return settings.store.userWhitelist.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

export function isWhitelisted(userId: string): boolean {
    return getWhitelist().includes(userId);
}
