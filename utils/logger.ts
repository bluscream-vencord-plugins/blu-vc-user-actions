import { Logger } from "@utils/Logger";
import { pluginInfo } from "../info";

/**
 * Prefixed logger instance for the plugin.
 */
export const logger = new Logger(pluginInfo.name);
