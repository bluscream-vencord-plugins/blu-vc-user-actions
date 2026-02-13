import { pluginName } from "../settings";

export function log(...args: any[]) {
    console.log(`[${pluginName}]`, ...args);
}
