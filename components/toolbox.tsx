import { Menu } from "@webpack/common";
import { moduleRegistry } from "../logic/moduleRegistry";
import { actionQueue } from "../utils/actionQueue";

export function SocializeToolbox(props: { channelId: string }) {
    const settings = moduleRegistry["settings"];

    if (!settings) return null;

    const handleClaim = () => actionQueue.enqueue(settings.claimCommand, props.channelId, true);
    const handleInfo = () => actionQueue.enqueue(settings.infoCommand, props.channelId, true);

    return (
        <Menu.MenuGroup label="SocializeGuild">
            <Menu.MenuItem
                id="socialize-toolbox-claim"
                label="Claim Channel"
                action={handleClaim}
            />
            <Menu.MenuItem
                id="socialize-toolbox-info"
                label="Channel Info"
                action={handleInfo}
            />
        </Menu.MenuGroup>
    );
}

export default SocializeToolbox;
