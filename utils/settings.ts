import { logger } from "./logger";
import { pluginInfo } from "../info";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";

/**
 * Parses a newline-separated string into an array of trimmed, non-empty lines.
 * @param settingString The raw string from plugin settings
 * @returns Array of individual lines
 */
export function getNewLineList(settingString?: string): string[] {
    if (!settingString) return [];
    return settingString.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Filters a newline-separated string to extract only valid Discord snowflakes (17-19 digits).
 * @param settingString The raw string from plugin settings
 * @returns Array of 17-19 digit user IDs
 */
export function getUserIdList(settingString?: string): string[] {
    return getNewLineList(settingString).filter(id => /^\d{17,19}$/.test(id));
}

/**
 * Formats an array of strings into a single newline-separated string, removing duplicates.
 * @param newList The array of strings to join
 * @returns A single string with one item per line
 */
export function setNewLineList(newList: string[]): string {
    return [...new Set(newList.map(s => s.trim()).filter(s => s.length > 0))].join("\n");
}

/**
 * Programmatically opens the plugin settings modal.
 */
export function openSettings() {
    try {
        openPluginModal(plugins[pluginInfo.name]);
    } catch (e) {
        logger.error("Could not open settings modal:", e);
    }
}
