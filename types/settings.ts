/**
 * Loose type for plugin settings to avoid circular dependencies.
 */
export type LoosePluginSettings = Record<string, any>;

/**
 * Type representing the core plugin settings structure.
 * This should ideally be a more specific type if possible,
 * but for now we use a loose record to break circularity.
 */
export type PluginSettings = Record<string, any>;
