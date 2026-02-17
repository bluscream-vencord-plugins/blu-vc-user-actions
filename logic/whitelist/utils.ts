import { settings } from "../../settings";

export function getWhitelist(): string[] {
    return settings.store.localUserWhitelist.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

export function setWhitelist(list: string[]) {
    settings.store.localUserWhitelist = list.join("\n");
}

export function isWhitelisted(userId: string): boolean {
    return getWhitelist().includes(userId);
}
