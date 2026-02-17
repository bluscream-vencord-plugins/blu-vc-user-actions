import { Menu, showToast } from "@webpack/common";
import { settings } from "../../../settings";
import { openPluginModal } from "@components/settings/tabs";
import { plugins } from "@api/PluginManager";
import { pluginInfo } from "../../../info";

export const getResetStateItem = () => (
    <Menu.MenuItem
        id="socialize-guild-reset-state"
        label="Reset Plugin State"
        action={() => {
            const { resetState } = require("../../../state");
            resetState();
            showToast("Plugin state has been reset.", { type: "success" } as any);
        }}
        color="danger"
    />
);

export const getResetSettingsItem = () => (
    <Menu.MenuItem
        id="socialize-guild-reset-settings"
        label="Reset Settings"
        action={() => {
            for (const key in settings.def) {
                if (key === "enabled" || (settings.def as any)[key].readonly) continue;
                try {
                    (settings.store as any)[key] = (settings.def as any)[key].default;
                } catch (e) { }
            }
            showToast("Settings have been reset to defaults.", { type: "success" } as any);
        }}
        color="danger"
    />
);

export const getEditSettingsItem = () => (
    <Menu.MenuItem
        id="blu-vc-user-actions-settings"
        label="Edit Settings"
        action={() => openPluginModal(plugins[pluginInfo.name])}
    />
);
