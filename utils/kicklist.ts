import { settings } from "../settings";

export function getKickList(): string[] {
    return settings.store.autoKickList.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

export function setKickList(list: string[]) {
    settings.store.autoKickList = list.join("\n");
}
