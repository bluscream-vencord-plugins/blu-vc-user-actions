import { settings } from "../../settings";

export function getKickList(): string[] {
    return settings.store.localUserBlacklist.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
}

export function setKickList(list: string[]) {
    list = list.filter(id => id.length > 0);
    list = [...new Set(list)];
    settings.store.localUserBlacklist = list.join("\n");
}

export function addToBlackList(userIds: string[]) {
    const kickList = getKickList();
    const newKickList = [...kickList];
    for (const userId of userIds) {
        if (!newKickList.includes(userId)) {
            newKickList.push(userId);
        }
    }
    setKickList(newKickList);
}

export function removeFromBlackList(userIds: string[]) {
    const kickList = getKickList();
    const newKickList = [...kickList];
    for (const userId of userIds) {
        if (newKickList.includes(userId)) {
            newKickList.splice(newKickList.indexOf(userId), 1);
        }
    }
    setKickList(newKickList);
}

export function isUserBlacklisted(userId: string): boolean {
    const kickList = getKickList();
    return kickList.includes(userId);
}
