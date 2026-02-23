# modular-vencord-plugin-template

A boilerplate for building modular Vencord/Equicord plugins.

## Architecture

This template uses a **Module-based** architecture overseen by a central `ModuleRegistry`.

### Core Components

- **`index.tsx`**: Entry point that stitches modules together.
- **`ModuleRegistry`**: Manages the lifecycle of modules and dispatches events.
- **`ActionQueue`**: A sequential queue for external actions (e.g., bot commands) to prevent rate-limiting.

### Creating a Module

Modules are discrete pieces of logic. See `modules/exampleModule/` for a full example.

```typescript
export const MyModule: PluginModule = {
    name: "MyModule",
    init(settings) {
        // Startup logic
    },
    onMessageCreate(message) {
        // Event handling
    }
};
```

### Utilities

- `logger`: Prefixed logging.
- `messaging`: External and ephemeral message helpers.
- `debug`: Ephemeral developer feedback.
- `parsing`/`formatting`: common string and ID helpers.

## How to use

1. Clone this directory into `src/userplugins/`.
2. Rename `pluginTemplate` to your plugin name.
3. Update `package.json` and `info.ts`.
4. Start adding modules in `modules/`.
