import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { UserStore as Users, RelationshipStore, React, Menu } from "@webpack/common";
import { OwnershipActions } from "./ownership";
import { BansModule } from "./bans";
import { WhitelistModule } from "./whitelist";
import { BlacklistModule } from "./blacklist";

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
    getToolboxMenuItems(): React.ReactElement[] {
        if (!this.settings) return [];
        return [
            <Menu.MenuCheckboxItem
                id="remote-operators-toggle"
                label="Enable Remote Operators"
                checked={this.settings.remoteOperatorsEnabled}
                action={() => {
                    if (this.settings) {
                        this.settings.remoteOperatorsEnabled = !this.settings.remoteOperatorsEnabled;
                    }
                }}
            />
        ];
    },

    externalCommands: [
        {
            name: "Remote Rename",
            description: "Rename channel remotely",
            getRegexString: s => s.remoteOpRenameRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.name) {
                    logger.info(`RemoteOperator (${msg.author.username}): Renaming channel to ${match.groups.name}`);
                    OwnershipActions.renameChannel(channelId, match.groups.name.trim());
                }
            }
        },
        {
            name: "Remote Ban",
            description: "Ban user remotely",
            getRegexString: s => s.remoteOpBanRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Banning user ${match.groups.target}`);
                    BansModule.enforceBanPolicy(match.groups.target, channelId, false, `Remote operator ban by ${msg.author.username}`);
                }
            }
        },
        {
            name: "Remote Kick",
            description: "Kick user remotely",
            getRegexString: s => s.remoteOpKickRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Kicking user ${match.groups.target}`);
                    OwnershipActions.kickUser(channelId, match.groups.target);
                }
            }
        },
        {
            name: "Remote Lock",
            description: "Lock channel remotely",
            getRegexString: s => s.remoteOpLockRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                logger.info(`RemoteOperator (${msg.author.username}): Locking channel`);
                OwnershipActions.lockChannel(channelId);
            }
        },
        {
            name: "Remote Unlock",
            description: "Unlock channel remotely",
            getRegexString: s => s.remoteOpUnlockRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                logger.info(`RemoteOperator (${msg.author.username}): Unlocking channel`);
                OwnershipActions.unlockChannel(channelId);
            }
        },
        {
            name: "Remote Permit",
            description: "Permit user remotely",
            getRegexString: s => s.remoteOpPermitRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Permitting user ${match.groups.target}`);
                    WhitelistModule.permitUser(match.groups.target, channelId);
                }
            }
        },
        {
            name: "Remote Unpermit",
            description: "Unpermit user remotely",
            getRegexString: s => s.remoteOpUnpermitRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unpermitting user ${match.groups.target}`);
                    WhitelistModule.unpermitUser(match.groups.target, channelId);
                }
            }
        },
        {
            name: "Remote Whitelist",
            description: "Whitelist user remotely",
            getRegexString: s => s.remoteOpWhitelistRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Whitelisting user ${match.groups.target}`);
                    WhitelistModule.whitelistUser(match.groups.target, channelId);
                }
            }
        },
        {
            name: "Remote Unwhitelist",
            description: "Unwhitelist user remotely",
            getRegexString: s => s.remoteOpUnwhitelistRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unwhitelisting user ${match.groups.target}`);
                    WhitelistModule.unwhitelistUser(match.groups.target, channelId);
                }
            }
        },
        {
            name: "Remote Blacklist",
            description: "Blacklist user remotely",
            getRegexString: s => s.remoteOpBlacklistRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Blacklisting user ${match.groups.target}`);
                    BlacklistModule.blacklistUser(match.groups.target, channelId);
                }
            }
        },
        {
            name: "Remote Unblacklist",
            description: "Unblacklist user remotely",
            getRegexString: s => s.remoteOpUnblacklistRegex,
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator ? RemoteOperatorsModule.isOperator(msg.author.id) : false),
            execute: (match, msg, channelId) => {
                if (match?.groups?.target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unblacklisting user ${match.groups.target}`);
                    BlacklistModule.unblacklistUser(match.groups.target, channelId);
                }
            }
        }
    ]
};
