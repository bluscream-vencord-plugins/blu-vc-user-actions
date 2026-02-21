import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { UserStore as Users, RelationshipStore } from "@webpack/common";
import { OwnershipActions } from "./ownership";
import { BansModule } from "./bans";

export const RemoteOperatorsModule: SocializeModule = {
    name: "RemoteOperatorsModule",
    settings: undefined as unknown as PluginSettings,

    init(settings: PluginSettings) {
        this.settings = settings;
    },

    stop() {
        // Nothing specific to stop
    },
    isOperator(userId: string): boolean {
        if (!this.settings) return false;
        if (this.settings.friendsCountAsOperator && RelationshipStore.isFriend(userId)) {
            return true;
        } else if (this.settings.remoteOperatorList) {
            const operatorList = this.settings.remoteOperatorList.split("\n").map(s => s.trim()).filter(Boolean);
            if (operatorList.includes(userId)) {
                return true;
            }
        }
        return false;
    },

    onMessageCreate(message: any): void {
        const meId = Users.getCurrentUser()?.id;
        if (!meId || !this.settings || message.author.id === meId) return;

        if (!this.isOperator(message.author.id)) return;

        const content = (message.content ?? "").trim().toLowerCase();

        // Helper to test regex and extract groups
        const checkCommand = (regexString: string) => {
            if (!regexString) return null;
            try {
                // Determine channelId; usually message is sent in the channel we want to manage
                // but if we are enforcing a managed category, it might only work there.
                // Assuming operator messages are sent in the managed channel itself.
                const channelId = message.channel_id;
                const pattern = regexString.replace("{me}", meId);
                const regex = new RegExp(pattern, "i");
                return { match: content.match(regex), channelId };
            } catch (e) {
                logger.error(`Invalid regex for Remote Operator command: ${regexString}`, e);
                return null;
            }
        };

        // 1. Rename
        const renameRes = checkCommand(this.settings.remoteOpRenameRegex);
        if (renameRes?.match?.groups?.name) {
            logger.info(`RemoteOperator (${message.author.username}): Renaming channel to ${renameRes.match.groups.name}`);
            OwnershipActions.renameChannel(renameRes.channelId, renameRes.match.groups.name.trim());
            return;
        }

        // 2. Ban
        const banRes = checkCommand(this.settings.remoteOpBanRegex);
        if (banRes?.match?.groups?.target) {
            const targetId = banRes.match.groups.target;
            logger.info(`RemoteOperator (${message.author.username}): Banning user ${targetId}`);
            BansModule.enforceBanPolicy(targetId, banRes.channelId, true, `Remote operator ban by ${message.author.username}`);
            return;
        }

        // 3. Kick
        const kickRes = checkCommand(this.settings.remoteOpKickRegex);
        if (kickRes?.match?.groups?.target) {
            const targetId = kickRes.match.groups.target;
            logger.info(`RemoteOperator (${message.author.username}): Kicking user ${targetId}`);
            OwnershipActions.kickUser(kickRes.channelId, targetId);
            return;
        }

        // 4. Lock
        const lockRes = checkCommand(this.settings.remoteOpLockRegex);
        if (lockRes?.match) {
            logger.info(`RemoteOperator (${message.author.username}): Locking channel`);
            OwnershipActions.lockChannel(lockRes.channelId);
            return;
        }

        // 5. Unlock
        const unlockRes = checkCommand(this.settings.remoteOpUnlockRegex);
        if (unlockRes?.match) {
            logger.info(`RemoteOperator (${message.author.username}): Unlocking channel`);
            OwnershipActions.unlockChannel(unlockRes.channelId);
            return;
        }
    }
};
