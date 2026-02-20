export class Logger {
    private prefix = "[SocializeGuild]";

    public info(...args: unknown[]) {
        console.log(`[${this.prefix}]`, ...args);
    }

    public warn(...args: unknown[]) {
        console.warn(`[${this.prefix}]`, ...args);
    }

    public error(...args: unknown[]) {
        console.error(`[${this.prefix}]`, ...args);
    }

    public debug(...args: unknown[]) {
        console.debug(`%c${this.prefix}`, "color: #747f8d; font-weight: bold;", ...args);
    }
}

export const logger = new Logger();
