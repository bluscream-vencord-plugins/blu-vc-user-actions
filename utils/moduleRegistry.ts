// import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { PluginModuleEvent, EventPayloads } from "../types/events";
import { Message, VoiceState, Channel, User, Guild } from "@vencord/discord-types";
import { ApplicationCommandOptionType } from "@api/Commands";
import { UserStore as Users, ChannelStore, SelectedChannelStore } from "@webpack/common";
import { sendDebugMessage } from "../utils/debug";
import { findAssociatedTextChannel } from "../utils/channels";
import { extractId } from "../utils/parsing"; // Keeping this as it was in the original and instruction 1 mentioned it
import { stateManager } from "../utils/state";
import { sendEphemeralMessage } from "../utils/messaging";

const COMMAND_TIMEOUT = 10000;

/**
 * Represents an option for an external text command.
 */
export interface ExternalCommandOption {
    /** The name of the option */
    name: string;
    /** A descriptive string explaining what the option does */
    description: string;
    /** The type of the option (e.g., STRING, USER, INTEGER) */
    type: ApplicationCommandOptionType;
    /** Whether the option is required for the command to execute */
    required?: boolean;
}

/**
 * Represents an external text command that can be triggered via chat.
 */
export interface ExternalCommand {
    /** The unique name of the command */
    name: string;
    /** A descriptive string explaining the command's purpose */
    description: string;
    /** Optional list of aliases for the command */
    aliases?: string[];
    /** Optional list of arguments/options for the command */
    options?: ExternalCommandOption[];
    /**
     * Optional permission check before execution.
     * @param message The Discord message object that triggered the command
     * @param settings The current plugin settings
     * @returns True if the user has permission to run the command
     */
    checkPermission?: (message: Message, settings: Record<string, any>) => boolean;
    /**
     * Executes the command logic.
     * @param args The parsed arguments for the command
     * @param message The Discord message object that triggered the command
     * @param channelId The ID of the channel where the command should be processed
     * @returns A boolean or a promise resolving to a boolean indicating success
     */
    execute: (args: Record<string, any>, message: Message, channelId: string) => Promise<boolean> | boolean;
}

/**
 * Represents a modular component of the SocializeGuild plugin.
 */
export interface PluginModule {
    /** The unique identifier name of the module */
    name: string;
    /** A brief description of the module's purpose */
    description?: string;
    /** Modules that MUST be initialized before this one */
    requiredDependencies?: string[];
    /** Modules that should be initialized before this one if they exist */
    optionalDependencies?: string[];
    /** The Vencord settings schema definitions for this module */
    settingsSchema?: Record<string, any>;
    /** Current instance-specific settings for this module */
    settings?: Record<string, any>;
    /**
     * Initializes the module with the provided settings.
     * @param settings The aggregated plugin settings
     */
    init(settings: Record<string, any>): void;
    /**
     * Callback invoked when the plugin is stopping to perform any necessary cleanup.
     */
    stop(): void;

    /**
     * Optional hook for processing voice state updates.
     * @param oldState The previous voice state
     * @param newState The updated voice state
     */
    onVoiceStateUpdate?(oldState: VoiceState, newState: VoiceState): void;
    /**
     * Optional hook for processing newly created messages.
     * @param message The Discord message created
     */
    onMessageCreate?(message: Message): void;
    /**
     * Optional hook for processing custom events from other modules.
     * @param event The event type identifier
     * @param payload The data associated with the event
     */
    onCustomEvent?<K extends PluginModuleEvent>(event: K, payload: EventPayloads[K]): void;

    [key: string]: any;

    /**
     * Optional hook to provide custom items for the voice channel toolbox menu.
     * @param channel The channel currently being interacted with
     */
    getToolboxMenuItems?(channel?: Channel): React.ReactElement[] | null;
    /**
     * Optional hook to provide custom items for the channel context menu.
     * @param channel The channel targeted by the context menu
     */
    getChannelMenuItems?(channel: Channel): React.ReactElement[] | null;
    /**
     * Optional hook to provide custom items for the user context menu.
     * @param user The user targeted by the context menu
     * @param channel The optional channel context
     */
    getUserMenuItems?(user: User, channel?: Channel): React.ReactElement[] | null;
    /**
     * Optional hook to provide custom items for the guild context menu.
     * @param guild The guild targeted by the context menu
     */
    getGuildMenuItems?(guild: Guild): React.ReactElement[] | null;

    /**
     * Optional list of external text commands supported by this module.
     */
    externalCommands?: ExternalCommand[];
}

/**
 * Global registry responsible for managing plugin modules, their lifecycles, and event dispatching.
 */
export class ModuleRegistry {
    private modules: PluginModule[] = [];
    private _settings!: Record<string, any>;
    private eventListeners: Map<PluginModuleEvent, Array<(payload: unknown) => void>> = new Map();

    /**
     * Initializes all registered modules with the provided settings, following the dependency graph.
     * @param settings The aggregated plugin settings
     */
    public init(settings: Record<string, any>) {
        this._settings = settings;

        // Resolve load order based on dependencies
        const sorted = this.resolveLoadOrder(this.modules);
        this.modules = sorted; // Re-order internal storage to match init order

        for (const mod of this.modules) {
            try {
                mod.init(settings);
            } catch (e) {
                console.error(`Failed to initialize module ${mod.name}:`, e);
            }
        }
    }

    private resolveLoadOrder(modules: PluginModule[]): PluginModule[] {
        const sorted: PluginModule[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const moduleMap = new Map(modules.map(m => [m.name, m]));

        const visit = (mod: PluginModule) => {
            if (visited.has(mod.name)) return;
            if (visiting.has(mod.name)) {
                console.error(`Circular dependency detected in PluginModule: ${mod.name}`);
                visited.add(mod.name); // Break cycle
                return;
            }

            visiting.add(mod.name);

            // Required Deps
            for (const depName of mod.requiredDependencies || []) {
                const dep = moduleMap.get(depName);
                if (dep) {
                    visit(dep);
                } else {
                    console.error(`Missing required dependency for ${mod.name}: ${depName}`);
                }
            }

            // Optional Deps
            for (const depName of mod.optionalDependencies || []) {
                const dep = moduleMap.get(depName);
                if (dep) {
                    visit(dep);
                }
            }

            visiting.delete(mod.name);
            visited.add(mod.name);
            sorted.push(mod);
        };

        for (const mod of modules) {
            visit(mod);
        }

        return sorted;
    }

    /**
     * Registers a new module with the registry.
     * @param module The module instance to register
     */
    public register(module: PluginModule) {
        if (this.modules.some(m => m.name === module.name)) {
            console.warn(`Module ${module.name} is already registered.`);
            return;
        }
        this.modules.push(module);
    }

    /**
     * Stops all modules and clears the registry state.
     */
    public stop() {
        for (const mod of this.modules) {
            mod.stop();
        }
        this.eventListeners.clear();
        this.modules = [];
    }

    /**
     * Returns the currently stored aggregated plugin settings.
     */
    public get settings(): Record<string, any> {
        return this._settings;
    }

    // Custom Event Bus
    /**
     * Subscribes to a custom internal event.
     * @param event The event identifier
     * @param listener Callback function when the event is dispatched
     */
    public on<K extends keyof EventPayloads>(event: K, listener: (payload: EventPayloads[K]) => void) {
        const eventKey = event as unknown as PluginModuleEvent;
        if (!this.eventListeners.has(eventKey)) {
            this.eventListeners.set(eventKey, []);
        }
        this.eventListeners.get(eventKey)!.push(listener as (payload: unknown) => void);
    }

    /**
     * Dispatches a custom event to all subscribers and direct module hooks.
     * @param event The event identifier
     * @param payload The metadata associated with the event
     */
    public dispatch<K extends keyof EventPayloads>(event: K, payload: EventPayloads[K]) {
        const eventKey = event as unknown as PluginModuleEvent;
        if (this.eventListeners.has(eventKey)) {
            for (const listener of this.eventListeners.get(eventKey)!) {
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
                mod.onCustomEvent(eventKey, payload);
            }
        }
    }

    // Menu Item Collection
    /**
     * Collects toolbox menu items from all registered modules.
     * @param channel The current active channel context
     */
    public collectToolboxItems(channel?: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getToolboxMenuItems?.(channel) || []).filter(Boolean);
    }

    /**
     * Collects channel context menu items from all registered modules.
     * @param channel The target channel
     */
    public collectChannelItems(channel: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getChannelMenuItems?.(channel) || []).filter(Boolean);
    }

    /**
     * Collects user context menu items from all registered modules.
     * @param user The target user
     * @param channel The optional channel context
     */
    public collectUserItems(user: User, channel?: Channel): React.ReactElement[] {
        return this.modules.flatMap(m => m.getUserMenuItems?.(user, channel) || []).filter(Boolean);
    }

    /**
     * Collects guild context menu items from all registered modules.
     * @param guild The target guild
     */
    public collectGuildItems(guild: Guild): React.ReactElement[] {
        return this.modules.flatMap(m => m.getGuildMenuItems?.(guild) || []).filter(Boolean);
    }

    // Discord Event Dispatchers
    /**
     * Dispatches a Discord VOICE_STATE_UPDATE event to all modules.
     * @param oldState The previous voice state
     * @param newState The updated voice state
     */
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

    /**
     * Checks if the author of a message has permission to execute external commands.
     * @param message The Discord message object
     * @returns True if at least one module grants permission
     */
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

    /**
     * Dispatches a Discord MESSAGE_CREATE event and processes potential external text commands.
     * @param message The Discord message created
     */
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
        const prefix = this._settings.externalCommandPrefix;
        const meMention = `<@${meId}>`;
        const meMentionNick = `<@!${meId}>`;
        const isDM = !ChannelStore.getChannel(message.channel_id)?.guild_id;

        let effectiveContent = "";
        let triggered = false;

        if (!isDM && prefix && prefix.trim() !== "" && contentLower.startsWith(prefix.toLowerCase())) {
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

        // Sort by name length descending to match longest command first (subcommands)
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
                    continue; // Check other implementations of this command if permission fails
                }

                const remainder = effectiveContent.slice(matchedTrigger.length).trim();
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
                    const isTimeout = err.message === "TIMEOUT";
                    const debugMsg = isTimeout ? `⏳ Command \`${cmd.name}\` timed out after ${COMMAND_TIMEOUT / 1000}s` : `❌ Error executing command \`${cmd.name}\`: ${err.message}`;

                    sendDebugMessage(debugMsg, message.channel_id);
                }
                return; // Stop after first match that passes permission
            }
        }

        if (matchedName) {
            sendDebugMessage(`🛑 Rejected command from <@${message.author.id}> (Missing Permissions)`, message.channel_id);
        }
    }
}

/**
 * The singleton instance of the ModuleRegistry.
 */
export const moduleRegistry = new ModuleRegistry();
