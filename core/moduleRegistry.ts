import { logger } from "../utils/logger";
import { PluginModule } from "../types/module";
import { CoreEvent, EventPayloads, BotResponseType } from "../types/events";
import { BotResponse } from "../types/BotResponse";
import { Message, Channel, User, Guild } from "@vencord/discord-types";
import { ApplicationCommandOptionType } from "@api/Commands";
import { UserStore as Users, ChannelStore, SelectedChannelStore, React } from "@webpack/common";
import { sendEphemeralMessage } from "../utils/messaging";
import { sendDebugMessage } from "../utils/debug";
import { findAssociatedTextChannel } from "../utils/channels";
import { extractId } from "../utils/parsing";
import { stateManager } from "../utils/state";

const COMMAND_TIMEOUT = 10000;

/**
 * Represents an option for an external text command.
 */
export interface ExternalCommandOption {
    name: string;
    description: string;
    type: ApplicationCommandOptionType;
    required?: boolean;
}

/**
 * Represents an external text command that can be triggered via chat.
 */
export interface ExternalCommand {
    name: string;
    description: string;
    aliases?: string[];
    options?: ExternalCommandOption[];
    checkPermission?: (message: Message, settings: Record<string, any>) => boolean;
    execute: (args: Record<string, any>, message: Message, channelId: string) => Promise<boolean> | boolean;
}

/**
 * Global registry responsible for managing plugin modules, their lifecycles, and event dispatching.
 */
export class ModuleRegistry {
    private modules: PluginModule[] = [];
    private _settings: Record<string, any> = {};
    private eventListeners: Map<string, Array<(payload: any) => void>> = new Map();

    /**
     * Initializes all registered modules with the provided settings.
     */
    public init(settings: Record<string, any>) {
        this._settings = settings;

        // Resolve load order based on dependencies
        const sorted = this.resolveLoadOrder(this.modules);
        this.modules = sorted;

        for (const mod of this.modules) {
            try {
                mod.init(settings);
                this.dispatch(CoreEvent.MODULE_INIT, { moduleName: mod.name });
            } catch (e) {
                logger.error(`Failed to initialize module ${mod.name}:`, e);
            }
        }
    }

    /**
     * Registers a new module with the registry.
     */
    public register(module: PluginModule) {
        if (this.modules.some(m => m.name === module.name)) return;
        this.modules.push(module);
    }

    /**
     * Stops all modules and clears the registry state.
     */
    public stop() {
        for (const mod of this.modules) {
            try { mod.stop(); } catch (e) { }
        }
        this.eventListeners.clear();
        this.modules = [];
    }

    public get settings() {
        return this._settings;
    }

    /**
     * Subscribes to an internal event.
     */
    public on<K extends string>(event: K, listener: (payload: K extends keyof EventPayloads ? EventPayloads[K] : any) => void) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(listener);
    }

    /**
     * Dispatches an event to all subscribers and direct module hooks.
     */
    public dispatch<K extends string>(event: K, payload: K extends keyof EventPayloads ? EventPayloads[K] : any) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const listener of listeners) {
                try { listener(payload); } catch (e) { logger.error(`Error in event listener for ${event}:`, e); }
            }
        }

        for (const mod of this.modules) {
            if (mod.onCustomEvent) {
                try { mod.onCustomEvent(event as any, payload); } catch (e) { logger.error(`Error in module ${mod.name} onCustomEvent:`, e); }
            }
        }
    }

    // --- Discord Event Dispatchers ---

    /**
     * Dispatches a Discord VOICE_STATE_UPDATE event to all modules.
     */
    public dispatchVoiceStateUpdate(oldState: any, newState: any) {
        for (const mod of this.modules) {
            if (mod.onVoiceStateUpdate) {
                try { mod.onVoiceStateUpdate(oldState, newState); } catch (e) { logger.error(`Error in module ${mod.name} onVoiceStateUpdate:`, e); }
            }
        }
    }

    /**
     * Dispatches a Discord MESSAGE_CREATE event and processes potential external text commands.
     */
    public async dispatchMessageCreate(message: Message) {
        // 1. Run standard message create handlers
        for (const mod of this.modules) {
            if (mod.onMessageCreate) {
                try { mod.onMessageCreate(message); } catch (e) { logger.error(`Error in module ${mod.name} onMessageCreate:`, e); }
            }
        }

        // 2. Process Bot Responses (Socialize Bot embeds)
        if (message.author?.id === this._settings.botId) {
            const response = new BotResponse(message, this._settings.botId);
            if (response.type !== BotResponseType.UNKNOWN) {
                this.dispatch(CoreEvent.BOT_EMBED_RECEIVED, {
                    messageId: message.id,
                    channelId: message.channel_id,
                    type: response.type,
                    initiatorId: response.initiatorId,
                    targetUserId: response.targetId,
                    embed: response.embed
                });
            }
        }

        // 3. Process External Commands
        await this.handleExternalCommands(message);
    }

    private async handleExternalCommands(message: Message) {
        const meId = Users.getCurrentUser()?.id;
        if (!meId || !this._settings) return;

        // Security check: Ignore messages from bots or system to prevent loops
        if (message.author?.bot || message.author?.id === "1" || message.author?.id === "0") return;

        const contentRaw = message.content ?? "";
        const contentTrim = contentRaw.trim();
        const contentLower = contentTrim.toLowerCase();
        const prefix = this._settings.externalCommandPrefix;
        const meMention = `<@${meId}>`;
        const meMentionNick = `<@!${meId}>`;
        const isDM = !ChannelStore.getChannel(message.channel_id)?.guild_id;

        let effectiveContent = "";
        let triggered = false;

        if (!isDM && prefix && prefix.trim() !== "" && contentLower.startsWith(prefix.toLowerCase())) {
            triggered = true;
            effectiveContent = contentTrim.slice(prefix.length).trim();
        }

        if (!triggered && (contentLower.startsWith(meMention) || contentLower.startsWith(meMentionNick))) {
            triggered = true;
            const mentionLength = contentLower.startsWith(meMention) ? meMention.length : meMentionNick.length;
            effectiveContent = contentTrim.slice(mentionLength).trim();
        }

        if (!triggered) return;

        // Security check for remote operators
        if (message.author.id !== meId) {
            const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
            if (!voiceChannelId) {
                sendEphemeralMessage(message.channel_id, "❌ Command rejected: I am not in a voice channel.");
                return;
            }
            const ownership = stateManager.getOwnership(voiceChannelId);
            const isOwner = ownership && (ownership.creatorId === meId || ownership.claimantId === meId);
            if (!isOwner) {
                sendEphemeralMessage(message.channel_id, "❌ Command rejected: You can only control my voice channel when I am the owner of it.");
                return;
            }
        }

        let targetChannelId = message.channel_id;
        if (isDM) {
            const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
            if (!voiceChannelId) {
                sendEphemeralMessage(message.channel_id, "❌ Command rejected: You are not in a voice channel.");
                return;
            }
            const vc = ChannelStore.getChannel(voiceChannelId);
            if (!vc || vc.guild_id !== this._settings.guildId || vc.parent_id !== this._settings.categoryId) {
                sendEphemeralMessage(message.channel_id, "❌ Command rejected: You are not in a managed voice channel.");
                return;
            }
            const associatedText = findAssociatedTextChannel(voiceChannelId);
            if (!associatedText) {
                sendEphemeralMessage(message.channel_id, "❌ Command rejected: Could not find associated text channel.");
                return;
            }
            targetChannelId = associatedText.id;
        }

        // Collect all external commands
        const allCmds: { mod: PluginModule, cmd: ExternalCommand }[] = [];
        for (const mod of this.modules) {
            if (mod.externalCommands) {
                for (const cmd of mod.externalCommands) {
                    allCmds.push({ mod, cmd });
                }
            }
        }

        allCmds.sort((a, b) => b.cmd.name.length - a.cmd.name.length);

        const effectiveContentLower = effectiveContent.toLowerCase();
        let matchedName = false;

        for (const { mod, cmd } of allCmds) {
            const namesToTry = [cmd.name, ...(cmd.aliases || [])];
            let matchedTrigger: string | null = null;

            for (const name of namesToTry) {
                const nameLower = name.toLowerCase();
                if (effectiveContentLower === nameLower || effectiveContentLower.startsWith(nameLower + " ")) {
                    matchedTrigger = name;
                    break;
                }
            }

            if (matchedTrigger) {
                matchedName = true;
                if (cmd.checkPermission && !cmd.checkPermission(message, this._settings)) {
                    continue;
                }

                const remainder = effectiveContent.slice(matchedTrigger.length).trim();
                const parsedArgs: Record<string, any> = {};

                if (cmd.options && cmd.options.length > 0) {
                    const rawArgs = remainder ? remainder.split(/\s+/) : [];

                    for (let i = 0; i < cmd.options.length; i++) {
                        const opt = cmd.options[i];
                        let val: string | undefined = rawArgs[i];

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

                        switch (opt.type) {
                            case ApplicationCommandOptionType.USER:
                            case ApplicationCommandOptionType.MENTIONABLE: {
                                parsedArgs[opt.name] = extractId(val);
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

                sendDebugMessage(`✅ Forwarding command \`${cmd.name}\` from <@${message.author.id}> to \`${mod.name}\``, targetChannelId);
                try {
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("TIMEOUT")), COMMAND_TIMEOUT)
                    );

                    await Promise.race([
                        cmd.execute(parsedArgs, message, targetChannelId),
                        timeoutPromise
                    ]);
                } catch (err: any) {
                    logger.error(`Error executing command ${cmd.name}:`, err);
                    const debugMsg = err.message === "TIMEOUT" ? `⏳ Command \`${cmd.name}\` timed out` : `❌ Error: ${err.message}`;
                    sendDebugMessage(debugMsg, message.channel_id);
                }
                return;
            }
        }

        if (matchedName) {
            sendDebugMessage(`🛑 Rejected command from <@${message.author.id}> (Missing Permissions)`, message.channel_id);
        }
    }

    // --- Menu Item Collection ---

    public collectUserItems(user: User, channel?: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getUserMenuItems?.(user, channel) || []).filter(Boolean);
    }

    public collectChannelItems(channel: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getChannelMenuItems?.(channel) || []).filter(Boolean);
    }

    public collectGuildItems(guild: Guild): React.ReactElement[] {
        return this.modules.flatMap(m => m.getGuildMenuItems?.(guild) || []).filter(Boolean);
    }

    public collectToolboxItems(channel?: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getToolboxMenuItems?.(channel) || []).filter(Boolean);
    }

    private resolveLoadOrder(modules: PluginModule[]): PluginModule[] {
        const sorted: PluginModule[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const moduleMap = new Map(modules.map(m => [m.name, m]));

        const visit = (mod: PluginModule) => {
            if (visited.has(mod.name)) return;
            if (visiting.has(mod.name)) {
                logger.error(`Circular dependency: ${mod.name}`);
                return;
            }
            visiting.add(mod.name);

            const deps = [...(mod.requiredDependencies || []), ...(mod.optionalDependencies || [])];
            for (const depName of deps) {
                const dep = moduleMap.get(depName);
                if (dep) visit(dep);
            }

            visiting.delete(mod.name);
            visited.add(mod.name);
            sorted.push(mod);
        };

        for (const mod of modules) visit(mod);
        return sorted;
    }
}

export const moduleRegistry = new ModuleRegistry();
