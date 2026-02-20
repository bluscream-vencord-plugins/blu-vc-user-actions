export function getNewLineList(settingString?: string): string[] {
    if (!settingString) return [];
    return settingString.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
}

export function getUserIdList(settingString?: string): string[] {
    return getNewLineList(settingString).filter(id => /^\d{17,19}$/.test(id));
}

export function setNewLineList(newList: string[]): string {
    return [...new Set(newList.map(s => s.trim()).filter(s => s.length > 0))].join("\n");
}
