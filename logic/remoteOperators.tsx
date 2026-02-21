import { ApplicationCommandOptionType } from "@api/Commands";
import { SocializeModule } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { RelationshipStore, React, Menu } from "@webpack/common";
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
            name: "name",
            description: "Rename channel remotely",
            options: [
                { name: "name", description: "The new name for the channel", type: ApplicationCommandOptionType.STRING, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const newName = args.name;
                if (newName) {
                    logger.info(`RemoteOperator (${msg.author.username}): Renaming channel to ${newName}`);
                    OwnershipActions.renameChannel(channelId, newName);
                    return true;
                }
                return false;
            }
        },
        {
            name: "ban",
            description: "Ban user remotely",
            options: [
                { name: "target", description: "The user to ban", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Banning user ${target}`);
                    BansModule.enforceBanPolicy(target, channelId, false, `Remote operator ban by ${msg.author.username}`);
                    return true;
                }
                return false;
            }
        },
        {
            name: "kick",
            description: "Kick user remotely",
            options: [
                { name: "target", description: "The user to kick", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Kicking user ${target}`);
                    OwnershipActions.kickUser(channelId, target);
                    return true;
                }
                return false;
            }
        },
        {
            name: "lock",
            description: "Lock channel remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteOperator (${msg.author.username}): Locking channel`);
                OwnershipActions.lockChannel(channelId);
                return true;
            }
        },
        {
            name: "unlock",
            description: "Unlock channel remotely",
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteOperator (${msg.author.username}): Unlocking channel`);
                OwnershipActions.unlockChannel(channelId);
                return true;
            }
        },
        {
            name: "permit",
            description: "Permit user remotely",
            options: [
                { name: "target", description: "The user to permit", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Permitting user ${target}`);
                    WhitelistModule.permitUser(target, channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unpermit",
            description: "Unpermit user remotely",
            options: [
                { name: "target", description: "The user to unpermit", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unpermitting user ${target}`);
                    WhitelistModule.unpermitUser(target, channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "whitelist",
            description: "Whitelist user remotely",
            options: [
                { name: "target", description: "The user to whitelist", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Whitelisting user ${target}`);
                    WhitelistModule.whitelistUser(target, channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unwhitelist",
            description: "Unwhitelist user remotely",
            options: [
                { name: "target", description: "The user to unwhitelist", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unwhitelisting user ${target}`);
                    WhitelistModule.unwhitelistUser(target, channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "blacklist",
            description: "Blacklist user remotely",
            options: [
                { name: "target", description: "The user to blacklist", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Blacklisting user ${target}`);
                    BlacklistModule.blacklistUser(target, channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unblacklist",
            description: "Unblacklist user remotely",
            options: [
                { name: "target", description: "The user to unblacklist", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => s.remoteOperatorsEnabled && (RemoteOperatorsModule.isOperator(msg.author.id)),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteOperator (${msg.author.username}): Unblacklisting user ${target}`);
                    BlacklistModule.unblacklistUser(target, channelId);
                    return true;
                }
                return false;
            }
        }
    ]
};
