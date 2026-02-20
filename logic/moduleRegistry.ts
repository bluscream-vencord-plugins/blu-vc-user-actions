import { PluginSettings } from "../types/settings";
import { SocializeEvent, EventPayloads } from "../types/events";

export interface SocializeModule {
    name: string;
    init(settings: PluginSettings): void;
    stop(): void;

    // Optional Event Hooks
    onVoiceStateUpdate?(oldState: any, newState: any): void;
    onMessageCreate?(message: any): void;
    onCustomEvent?<K extends SocializeEvent>(event: K, payload: EventPayloads[K]): void;

    [key: string]: any;
}

export class ModuleRegistry {
    private modules: SocializeModule[] = [];
    private settings!: PluginSettings;
    private eventListeners: Map<SocializeEvent, Array<(payload: any) => void>> = new Map();

    public init(settings: PluginSettings) {
        this.settings = settings;
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

    // Custom Event Bus
    public on<K extends SocializeEvent>(event: K, listener: (payload: EventPayloads[K]) => void) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(listener);
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

    // Discord Event Dispatchers
    public dispatchVoiceStateUpdate(oldState: any, newState: any) {
        for (const mod of this.modules) {
            if (mod.onVoiceStateUpdate) {
                mod.onVoiceStateUpdate(oldState, newState);
            }
        }
    }

    public dispatchMessageCreate(message: any) {
        for (const mod of this.modules) {
            if (mod.onMessageCreate) {
                mod.onMessageCreate(message);
            }
        }
    }
}

export const moduleRegistry = new ModuleRegistry();
