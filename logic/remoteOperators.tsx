import { SocializeModule, moduleRegistry } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { UserStore as Users, RelationshipStore, React, Menu } from "@webpack/common";
import { OwnershipActions } from "./ownership";
import { BansModule } from "./bans";
import { WhitelistModule } from "./whitelist";
import { BlacklistModule } from "./blacklist";
import { extractId } from "../utils/parsing";

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
            name: "name",
            description: "Rename channel remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const newName = args.join(" ").trim();
                if (newName) {
                    logger.info(`RemoteOperator (${msg.author.username}): Renaming channel to ${newName}`);
                    OwnershipActions.renameChannel(channelId, newName);
                }
            }
        },
        {
            name: "ban",
            description: "Ban user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Banning user ${target}`);
                    BansModule.enforceBanPolicy(target, channelId, false, `Remote operator ban by ${msg.author.username}`);
                }
            }
        },
        {
            name: "kick",
            description: "Kick user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Kicking user ${target}`);
                    OwnershipActions.kickUser(channelId, target);
                }
            }
        },
        {
            name: "lock",
            description: "Lock channel remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteOperator (${msg.author.username}): Locking channel`);
                OwnershipActions.lockChannel(channelId);
            }
        },
        {
            name: "unlock",
            description: "Unlock channel remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteOperator (${msg.author.username}): Unlocking channel`);
                OwnershipActions.unlockChannel(channelId);
            }
        },
        {
            name: "permit",
            description: "Permit user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Permitting user ${target}`);
                    WhitelistModule.permitUser(target, channelId);
                }
            }
        },
        {
            name: "unpermit",
            description: "Unpermit user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unpermitting user ${target}`);
                    WhitelistModule.unpermitUser(target, channelId);
                }
            }
        },
        {
            name: "whitelist",
            description: "Whitelist user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Whitelisting user ${target}`);
                    WhitelistModule.whitelistUser(target, channelId);
                }
            }
        },
        {
            name: "unwhitelist",
            description: "Unwhitelist user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unwhitelisting user ${target}`);
                    WhitelistModule.unwhitelistUser(target, channelId);
                }
            }
        },
        {
            name: "blacklist",
            description: "Blacklist user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Blacklisting user ${target}`);
                    BlacklistModule.blacklistUser(target, channelId);
                }
            }
        },
        {
            name: "unblacklist",
            description: "Unblacklist user remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = extractId(args[0]);
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unblacklisting user ${target}`);
                    BlacklistModule.unblacklistUser(target, channelId);
                }
            }
        }
    ]
};
