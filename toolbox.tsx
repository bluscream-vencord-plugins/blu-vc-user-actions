import { Modules } from "./ModuleRegistry";

export const getToolboxActions = (channelId?: string) => {
    return Modules.flatMap(m => m.getToolboxMenuItems?.(channelId) || []);
};
