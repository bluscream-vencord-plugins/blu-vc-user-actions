import { Menu, Alerts, TextInput, SelectedChannelStore, ChannelStore } from "@webpack/common";
import { ActionType } from "../../../state";
import { queueAction } from "../../queue";
import { formatsetChannelNameCommand } from "../formatting";
import { type Channel } from "@vencord/discord-types";

export const getRenameChannelItem = (channel: Channel) => (
    <Menu.MenuItem
        id="socialize-guild-rename-channel"
        label="Rename Channel"
        action={() => {
            let newName = channel.name;
            Alerts.show({
                title: "Rename Channel",
                confirmText: "Rename",
                cancelText: "Cancel",
                onConfirm: () => {
                    if (newName && newName !== channel.name) {
                        const cmd = formatsetChannelNameCommand(channel.id, newName);
                        queueAction({
                            type: ActionType.NAME,
                            userId: "",
                            channelId: channel.id,
                            guildId: channel.guild_id,
                            external: cmd
                        });
                    }
                },
                body: (
                    <div style={{ marginTop: "1rem" }}>
                        <TextInput
                            value={newName}
                            onChange={(v: string) => newName = v}
                            placeholder="Enter new channel name..."
                            autoFocus
                        />
                    </div>
                )
            });
        }}
    />
);
