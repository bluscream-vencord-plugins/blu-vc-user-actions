import { PluginSettings } from "../types/settings";
import { SocializeEvent, EventPayloads } from "../types/events";
import { Message, VoiceState, Channel, User, Guild } from "@vencord/discord-types";
import { React } from "@webpack/common";

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

    public dispatchMessageCreate(message: Message) {
        // logger.debug(`Dispatching message create from ${message.author.username} in ${message.channel_id}`);
        for (const mod of this.modules) {
            if (mod.onMessageCreate) {
                try {
                    mod.onMessageCreate(message);
                } catch (e) {
                    console.error(`Error in module ${mod.name} onMessageCreate:`, e);
                }
            }
        }
    }
}

export const moduleRegistry = new ModuleRegistry();
