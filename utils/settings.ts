export function getNewLineList(setting: string): string[] {
    const { settings } = require("..");
    return (settings.store[setting]).split(/\r?\n/).map(s => s.trim());
}
export function getUserIdList(setting: string): string[] {
    return getNewLineList(setting).filter(id => /^\d{17,19}$/.test(id));
}

export function setNewLineList(setting: string, newList: string[]) {
    const { settings } = require("..");
    settings.store[setting] = [...new Set(newList.map(s => s.trim()).filter(s => s.length > 0))].join("\n");
}
