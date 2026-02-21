import { moduleRegistry } from "./moduleRegistry";
import { actionQueue } from "../utils/actionQueue";
import { formatCommand } from "../utils/formatting";
import { isUserInVoiceChannel } from "../utils/channels";
import { stateManager } from "../utils/stateManager";
import { WhitelistModule } from "./whitelist";
import { BansModule } from "./bans";
import { BlacklistModule } from "./blacklist";
import { ChannelNameRotationModule } from "./channelNameRotation";
import { OwnershipModule } from "./ownership";
import { UserStore as Users } from "@webpack/common";

function getSettings() {
    return moduleRegistry.settings;
}

export const SocializeActions = {
    // Info Sync
    syncInfo(channelId: string) {
        OwnershipModule.requestChannelInfo(channelId);
    },

    // Channel Actions
    claimChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.claimCommand, channelId), channelId, true);
    },
    lockChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.lockCommand, channelId), channelId, true);
    },
    unlockChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.unlockCommand, channelId), channelId, true);
    },
    resetChannel(channelId: string) {
        const s = getSettings();
        if (s) actionQueue.enqueue(formatCommand(s.resetCommand, channelId), channelId);
    },
    setChannelSize(channelId: string, size: number) {
        const s = getSettings();
        if (!s) return;
        const sizeCmd = formatCommand(s.setSizeCommand || "!v size {size}", channelId)
            .replace(/{size}/g, String(size))
            .replace(/{channel_limit}/g, String(size));
        actionQueue.enqueue(sizeCmd, channelId, false);
    },
    renameChannel(channelId: string, newName: string) {
        const s = getSettings();
        if (!s) return;
        actionQueue.enqueue(
            formatCommand(s.setChannelNameCommand || "!v name {name}", channelId, { name: newName }),
            channelId,
            true
        );
    },
    startNameRotation(channelId: string) {
        ChannelNameRotationModule.startRotation(channelId);
    },
    stopNameRotation(channelId?: string) {
        ChannelNameRotationModule.stopRotation(channelId);
    },

    // User Actions
    kickUser(channelId: string, userId: string) {
        const s = getSettings();
        if (!s) return;
        actionQueue.enqueue(
            formatCommand(s.kickCommand, channelId, { userId }),
            channelId,
            false,
            () => isUserInVoiceChannel(userId, channelId)
        );
    },
    banUser(channelId: string, userId: string, manual: boolean = true) {
        const s = getSettings();
        if (!s) return;
        const useKickFirst = !!s.banInLocalBlacklist;
        if (useKickFirst) {
            BlacklistModule.blacklistUser(userId, channelId);
        }
        BansModule.enforceBanPolicy(userId, channelId, useKickFirst, manual ? "Manual Ban" : "Auto Ban");
    },
    unbanUser(channelId: string, userId: string) {
        const s = getSettings();
        const meId = Users.getCurrentUser()?.id;
        if (!s || !meId) return;

        actionQueue.enqueue(formatCommand(s.unbanCommand, channelId, { userId }), channelId);

        if (stateManager.hasMemberConfig(meId)) {
            const ownerCfg = stateManager.getMemberConfig(meId);
            stateManager.updateMemberConfig(meId, { bannedUsers: ownerCfg.bannedUsers.filter(id => id !== userId) });
        }
        BlacklistModule.unblacklistUser(userId, channelId);
    },
    permitUser(channelId: string, userId: string) {
        WhitelistModule.whitelistUser(userId, channelId);
        WhitelistModule.permitUser(userId, channelId);
    },
    unpermitUser(channelId: string, userId: string) {
        WhitelistModule.unpermitUser(userId, channelId);
        WhitelistModule.unwhitelistUser(userId, channelId);
    },
    whitelistUserLocally(userId: string) {
        const whitelist = WhitelistModule.getWhitelist();
        if (!whitelist.includes(userId)) {
            whitelist.push(userId);
            WhitelistModule.setWhitelist(whitelist);
        }
    }
};
