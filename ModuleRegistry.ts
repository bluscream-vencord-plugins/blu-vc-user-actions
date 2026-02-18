import { PluginModule } from "./types/PluginModule";

export const Modules: PluginModule[] = [];

export function registerModule(module: PluginModule) {
    Modules.push(module);
}
