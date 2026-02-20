export class Logger {
    private prefix = "[SocializeGuild]";

    public info(...args: any[]) {
        console.log(`%c${this.prefix}`, "color: #7289da; font-weight: bold;", ...args);
    }

    public warn(...args: any[]) {
        console.warn(`%c${this.prefix}`, "color: #faa61a; font-weight: bold;", ...args);
    }

    public error(...args: any[]) {
        console.error(`%c${this.prefix}`, "color: #f04747; font-weight: bold;", ...args);
    }

    public debug(...args: any[]) {
        console.debug(`%c${this.prefix}`, "color: #747f8d; font-weight: bold;", ...args);
    }
}

export const logger = new Logger();
