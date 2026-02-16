import { Logger } from "@utils/Logger";
import { pluginInfo } from "../info";

export const logger = new Logger(pluginInfo.name, pluginInfo.color);

export function log(...args: any[]) {
    logger.log(...args);
}
