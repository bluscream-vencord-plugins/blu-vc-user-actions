import { Logger } from "@utils/Logger";
import { pluginInfo } from "../info";

/**
 * The singleton logger instance for the SocializeGuild plugin.
 */
export const logger = new Logger(pluginInfo.name, pluginInfo.color);
