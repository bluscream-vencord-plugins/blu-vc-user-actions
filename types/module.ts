import { Channel, User, Guild, Message } from "@vencord/discord-types";
import { CoreEvent, EventPayloads } from "./events";
import { React } from "@webpack/common";

/**
 * Represents a discrete piece of plugin logic with its own settings and lifecycle.
 */
export interface PluginModule {
    /** Unique identifier for the module */
    name: string;
    /** Human-readable description of what the module does */
    description?: string;
    /** Dependencies required to be initialized before this module */
    requiredDependencies?: string[];
    /** Dependencies that should be initialized first if they exist */
    optionalDependencies?: string[];
    /** The Vencord settings schema for this specific module */
    settingsSchema?: Record<string, any>;
    /** Current instance of parent settings merged with module settings */
    settings: Record<string, any> | null;

    /** Called once during plugin startup */
    init(settings: Record<string, any>): void;
    /** Called when the plugin is stopped */
    stop(): void;

    /** Hook for standard MESSAGE_CREATE events */
    onMessageCreate?(message: Message): void;
    /** Hook for standard VOICE_STATE_UPDATE events */
    onVoiceStateUpdate?(oldState: any, newState: any): void;
    /** Hook for custom internal plugin events */
    onCustomEvent?(event: string, payload: any): void;

    /** Provide items for User context menus */
    getUserMenuItems?(user: User, channel?: Channel): React.ReactElement[] | null;
    /** Provide items for Channel context menus */
    getChannelMenuItems?(channel: Channel): React.ReactElement[] | null;
    /** Provide items for Guild context menus */
    getGuildMenuItems?(guild: Guild): React.ReactElement[] | null;
    /** Provide items for the voice channel toolbox */
    getToolboxMenuItems?(channel?: Channel): React.ReactElement[] | null;

    /** Allow for module-specific properties and methods */
    [key: string]: any;
}
