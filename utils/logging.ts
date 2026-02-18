import { Logger } from "@utils/Logger";
import { pluginInfo } from "../info";

export const logger = new Logger(pluginInfo.name, pluginInfo.color);

export const log = (...args: any[]) => logger.log(...args);
export const info = (...args: any[]) => logger.info(...args);
export const warn = (...args: any[]) => logger.warn(...args);
export const error = (...args: any[]) => logger.error(...args);
