import { PluginSettings } from "../types/settings";
import { SocializeEvent, EventPayloads } from "../types/events";
import { Message, VoiceState, Channel, User, Guild } from "@vencord/discord-types";
import { ApplicationCommandOptionType } from "@api/Commands";
import { React, UserStore as Users, RestAPI } from "@webpack/common";
import { sendDebugMessage } from "../utils/debug";

const COMMAND_TIMEOUT = 10000;

export interface ExternalCommandOption {
    name: string;
    description: string;
    type: ApplicationCommandOptionType;
    required?: boolean;
}

export interface ExternalCommand {
    name: string;
    description: string;
    options?: ExternalCommandOption[];
    checkPermission?: (message: Message, settings: PluginSettings) => boolean;
    execute: (args: Record<string, any>, message: Message, channelId: string) => Promise<boolean> | boolean;
}

export interface SocializeModule {
    name: string;
    settings?: PluginSettings;
    init(settings: PluginSettings): void;
    stop(): void;

    // Optional Event Hooks
    onVoiceStateUpdate?(oldState: VoiceState, newState: VoiceState): void;
    onMessageCreate?(message: Message): void;
    onCustomEvent?<K extends SocializeEvent>(event: K, payload: EventPayloads[K]): void;

    [key: string]: any;

    // Menu Item Hooks
    getToolboxMenuItems?(channel?: Channel): React.ReactElement[] | null;
    getChannelMenuItems?(channel: Channel): React.ReactElement[] | null;
    getUserMenuItems?(user: User, channel?: Channel): React.ReactElement[] | null;
    getGuildMenuItems?(guild: Guild): React.ReactElement[] | null;

    // External Text Commands
    externalCommands?: ExternalCommand[];
}

export class ModuleRegistry {
    private modules: SocializeModule[] = [];
    private _settings!: PluginSettings;
    private eventListeners: Map<SocializeEvent, Array<(payload: unknown) => void>> = new Map();

    public init(settings: PluginSettings) {
        this._settings = settings;
        for (const mod of this.modules) {
            mod.init(settings);
        }
    }

    public register(module: SocializeModule) {
        this.modules.push(module);
    }

    public stop() {
        for (const mod of this.modules) {
            mod.stop();
        }
        this.eventListeners.clear();
        this.modules = [];
    }

    public get settings(): PluginSettings {
        return this._settings;
    }

    // Custom Event Bus
    public on<K extends SocializeEvent>(event: K, listener: (payload: EventPayloads[K]) => void) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(listener as (payload: unknown) => void);
    }

    public dispatch<K extends SocializeEvent>(event: K, payload: EventPayloads[K]) {
        if (this.eventListeners.has(event)) {
            for (const listener of this.eventListeners.get(event)!) {
                try {
                    listener(payload);
                } catch (e) {
                    console.error(`Error in event listener for ${event}:`, e);
                }
            }
        }

        // Also dispatch to modules directly if they have the hook
        for (const mod of this.modules) {
            if (mod.onCustomEvent) {
                mod.onCustomEvent(event, payload);
            }
        }
    }

    // Menu Item Collection
    public collectToolboxItems(channel?: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getToolboxMenuItems?.(channel) || []).filter(Boolean);
    }

    public collectChannelItems(channel: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getChannelMenuItems?.(channel) || []).filter(Boolean);
    }

    public collectUserItems(user: User, channel?: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getUserMenuItems?.(user, channel) || []).filter(Boolean);
    }

    public collectGuildItems(guild: Guild): React.ReactElement[] {
        return this.modules.flatMap(m => m.getGuildMenuItems?.(guild) || []).filter(Boolean);
    }

    // Discord Event Dispatchers
    public dispatchVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        // logger.debug(`Dispatching voice state update for user ${newState?.userId || oldState?.userId}`);
        for (const mod of this.modules) {
            if (mod.onVoiceStateUpdate) {
                try {
                    mod.onVoiceStateUpdate(oldState, newState);
                } catch (e) {
                    console.error(`Error in module ${mod.name} onVoiceStateUpdate:`, e);
                }
            }
        }
    }

    public checkExternalPermissions(message: Message): boolean {
        for (const mod of this.modules) {
            if (mod.externalCommands) {
                for (const cmd of mod.externalCommands) {
                    if (cmd.checkPermission && cmd.checkPermission(message, this._settings)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public async dispatchMessageCreate(message: Message) {
        // Run standard message create handlers
        for (const mod of this.modules) {
            if (mod.onMessageCreate) {
                try {
                    mod.onMessageCreate(message);
                } catch (e) {
                    console.error(`Error in module ${mod.name} onMessageCreate:`, e);
                }
            }
        }

        // Process External Commands
        const meId = Users.getCurrentUser()?.id;
        if (!meId || !this._settings) return;

        const contentRaw = message.content ?? "";
        const contentTrim = contentRaw.trim();
        const contentLower = contentTrim.toLowerCase();
        const prefix = this._settings.externalCommandPrefix || "@";
        const meMention = `<@${meId}>`;
        const meMentionNick = `<@!${meId}>`;

        let effectiveContent = "";
        let triggered = false;

        if (contentLower.startsWith(prefix.toLowerCase())) {
            triggered = true;
            effectiveContent = contentTrim.slice(prefix.length).trim();
        } else if (contentLower.startsWith(meMention)) {
            triggered = true;
            effectiveContent = contentTrim.slice(meMention.length).trim();
        } else if (contentLower.startsWith(meMentionNick)) {
            triggered = true;
            effectiveContent = contentTrim.slice(meMentionNick.length).trim();
        }

        if (!triggered) return;

        // Collect all external commands
        const allCmds: { mod: SocializeModule, cmd: ExternalCommand }[] = [];
        for (const mod of this.modules) {
            if (mod.externalCommands) {
                for (const cmd of mod.externalCommands) {
                    allCmds.push({ mod, cmd });
                }
            }
        }

        // Sort by name length descending to match longest command first (subcommands)
        allCmds.sort((a, b) => b.cmd.name.length - a.cmd.name.length);

        const effectiveContentLower = effectiveContent.toLowerCase();

        for (const { mod, cmd } of allCmds) {
            const cmdNameLower = cmd.name.toLowerCase();
            // Check if content starts with command name followed by space or end of string
            if (effectiveContentLower === cmdNameLower || effectiveContentLower.startsWith(cmdNameLower + " ")) {
                if (cmd.checkPermission && !cmd.checkPermission(message, this._settings)) {
                    sendDebugMessage(`🛑 Rejected command \`${cmd.name}\` from <@${message.author.id}> (Missing Permissions)`, message.channel_id);
                    return; // Stop processing once matched
                }

                const remainder = effectiveContent.slice(cmd.name.length).trim();
                const parsedArgs: Record<string, any> = {};

                if (cmd.options && cmd.options.length > 0) {
                    // Simple space-based splitting for now, respecting multi-word strings if they are at the end
                    const rawArgs = remainder ? remainder.split(/\s+/) : [];

                    for (let i = 0; i < cmd.options.length; i++) {
                        const opt = cmd.options[i];
                        let val: string | undefined = rawArgs[i];

                        // If it's the last option and it's a STRING, take the entire remainder
                        if (i === cmd.options.length - 1 && opt.type === ApplicationCommandOptionType.STRING) {
                            val = rawArgs.slice(i).join(" ");
                        }

                        if (!val) {
                            if (opt.required) {
                                sendDebugMessage(`⚠️ Missing required argument \`${opt.name}\` for command \`${cmd.name}\``, message.channel_id);
                                return;
                            }
                            continue;
                        }

                        // Parse based on type
                        switch (opt.type) {
                            case ApplicationCommandOptionType.USER:
                            case ApplicationCommandOptionType.MENTIONABLE: {
                                const id = val.replace(/[<@!>]/g, "");
                                parsedArgs[opt.name] = id;
                                break;
                            }
                            case ApplicationCommandOptionType.INTEGER:
                            case ApplicationCommandOptionType.NUMBER: {
                                parsedArgs[opt.name] = Number(val);
                                break;
                            }
                            case ApplicationCommandOptionType.BOOLEAN: {
                                parsedArgs[opt.name] = val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "yes";
                                break;
                            }
                            default: {
                                parsedArgs[opt.name] = val;
                                break;
                            }
                        }
                    }
                }

                sendDebugMessage(`✅ Forwarding command \`${cmd.name}\` from <@${message.author.id}> to \`${mod.name}\``, message.channel_id);
                try {
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("TIMEOUT")), COMMAND_TIMEOUT)
                    );

                    const success = await Promise.race([
                        cmd.execute(parsedArgs, message, message.channel_id),
                        timeoutPromise
                    ]) as boolean;

                    const emoji = success ? "%E2%9C%85" : "%E2%9D%8C"; // ✅ : ❌
                    RestAPI.put({ url: `/channels/${message.channel_id}/messages/${message.id}/reactions/${emoji}/@me` }).catch(e => {
                        sendDebugMessage(`⚠️ Failed to add reaction: ${e.message}`, message.channel_id);
                    });
                } catch (err: any) {
                    const isTimeout = err.message === "TIMEOUT";
                    const emoji = isTimeout ? "%E2%8C%9B" : "%E2%9D%8C"; // ⏳ : ❌
                    const debugMsg = isTimeout ? `⏳ Command \`${cmd.name}\` timed out after ${COMMAND_TIMEOUT / 1000}s` : `❌ Error executing command \`${cmd.name}\`: ${err.message}`;

                    sendDebugMessage(debugMsg, message.channel_id);
                    RestAPI.put({ url: `/channels/${message.channel_id}/messages/${message.id}/reactions/${emoji}/@me` }).catch(() => { });
                }
                return; // Stop after first match
            }
        }
    }
}

export const moduleRegistry = new ModuleRegistry();
