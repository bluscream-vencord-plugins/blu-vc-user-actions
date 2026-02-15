import { Logger } from "@utils/Logger";
import { pluginName } from "../settings";

export const logger = new Logger(pluginName, "#7289da");

export function log(...args: any[]) {
    logger.log(...args);
}
