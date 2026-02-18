import { PluginModule } from "../types/PluginModule";
import { saveState, loadState } from "../state";
import { log } from "../utils/logging";

export const StorageModule: PluginModule = {
    id: "storage",
    name: "State Storage",
    onStart: () => {
        // State loading is still triggered in index.tsx's onStart for now to ensure it's loaded before others
        // But we could move it here if we ensure module order.
    },
    onStop: () => {
        saveState();
        log("[Storage] Final state save on plugin stop.");
    }
};
