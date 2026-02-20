import { UserStore as Users, ChannelStore as Channels } from "@webpack/common";

// Vencord types
import { User, Channel, Guild } from "@vencord/discord-types";
import { moduleRegistry } from "../logic/moduleRegistry";
import { actionQueue } from "../utils/actionQueue";
import { VoteBanningModule } from "../logic/voteBanning";
import { WhitelistingModule } from "../logic/whitelisting";
import { formatCommand } from "../utils/formatting";

// Mocking some Vencord ContextMenu builder for UI abstraction
// In reality, you'd use Vencord's components and patchers
export function buildUserContextMenu(user: User, channel?: Channel) {
    const settings = moduleRegistry["settings"];
    if (!settings) return null;

    return [
        {
            label: "Ban from Channel",
            id: "socialize-ban-user",
            action: () => {
                if (channel) VoteBanningModule.enforceBanPolicy(user.id, channel.id, false);
            }
        },
        {
            label: "Kick from Channel",
            id: "socialize-kick-user",
            action: () => {
                const cmd = formatCommand(settings.kickCommand, channel?.id || "", { userId: user.id });
                if (channel) actionQueue.enqueue(cmd, channel.id, true);
            }
        },
        {
            label: WhitelistingModule.isWhitelisted(user.id) ? "Unwhitelist User" : "Whitelist User",
            id: "socialize-whitelist-user",
            action: () => {
                const isWhite = WhitelistingModule.isWhitelisted(user.id);
                const list = WhitelistingModule.getWhitelist();
                if (isWhite) {
                    WhitelistingModule.setWhitelist(list.filter(id => id !== user.id));
                } else {
                    list.push(user.id);
                    WhitelistingModule.setWhitelist(list);
                }
            }
        }
    ];
}

export function buildChannelContextMenu(channel: Channel) {
    const settings = moduleRegistry["settings"];
    if (!settings) return null;

    return [
        {
            label: "Claim Channel",
            id: "socialize-claim-channel",
            action: () => {
                actionQueue.enqueue(settings.claimCommand, channel.id, true);
            }
        },
        {
            label: "Lock Channel",
            id: "socialize-lock-channel",
            action: () => {
                actionQueue.enqueue(settings.lockCommand, channel.id, true);
            }
        },
        {
            label: "Unlock Channel",
            id: "socialize-unlock-channel",
            action: () => {
                actionQueue.enqueue(settings.unlockCommand, channel.id, true);
            }
        },
        {
            label: "Reset Channel",
            id: "socialize-reset-channel",
            action: () => {
                actionQueue.enqueue(settings.resetCommand, channel.id, false);
            }
        }
    ];
}

// Example Guild Menu additions
export function buildGuildContextMenu(guild: Guild) {
    return [
        {
            label: "Socialize Status",
            id: "socialize-guild-status",
            action: () => {
                console.log("Guild menu generic action.");
            }
        }
    ];
}
