import { ApplicationCommandOptionType } from "@api/Commands";
import { SocializeModule } from "./moduleRegistry";
import { PluginSettings } from "../types/settings";
import { logger } from "../utils/logger";
import { RelationshipStore, React, Menu } from "@webpack/common";
import { OwnershipActions, isUserOwner } from "./ownership";
import { BansModule } from "./bans";
import { WhitelistModule } from "./whitelist";
import { BlacklistModule } from "./blacklist";
import { getNewLineList } from "../utils/settingsHelpers";

const checkPermission = (msg: any, s: PluginSettings) =>
    isUserOwner(msg.author.id, msg.channel_id) || (s.remoteOperatorsEnabled && RemoteOperatorsModule.isOperator(msg.author.id));

export const RemoteOperatorsModule: SocializeModule = {
    name: "RemoteOperatorsModule",
    requiredDependencies: ["OwnershipModule", "BansModule", "WhitelistModule", "BlacklistModule"],
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
            const operatorList = getNewLineList(this.settings.remoteOperatorList);
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
            name: "claim",
            description: "Claim the current channel",
            execute: (args, msg, channelId) => {
                OwnershipActions.claimChannel(channelId);
                return true;
            }
        },
        {
            name: "lock",
            description: "Lock channel remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteAction (${msg.author.username}): Locking channel`);
                OwnershipActions.lockChannel(channelId);
                return true;
            }
        },
        {
            name: "unlock",
            description: "Unlock channel remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteAction (${msg.author.username}): Unlocking channel`);
                OwnershipActions.unlockChannel(channelId);
                return true;
            }
        },
        {
            name: "reset",
            description: "Reset channel remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteAction (${msg.author.username}): Resetting channel`);
                OwnershipActions.resetChannel(channelId);
                return true;
            }
        },
        {
            name: "name",
            description: "Rename channel remotely",
            options: [
                { name: "target", description: "The new name for the channel", type: ApplicationCommandOptionType.STRING, required: true }
            ],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const newName = args.target;
                if (newName) {
                    logger.info(`RemoteAction (${msg.author.username}): Renaming channel to ${newName}`);
                    OwnershipActions.renameChannel(channelId, newName);
                    return true;
                }
                return false;
            }
        },
        {
            name: "size",
            description: "Set channel size remotely",
            options: [
                { name: "target", description: "The user limit (0 for unlimited)", type: ApplicationCommandOptionType.INTEGER, required: true }
            ],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const size = args.target;
                if (size !== undefined) {
                    logger.info(`RemoteAction (${msg.author.username}): Setting size to ${size}`);
                    OwnershipActions.setChannelSize(channelId, size);
                    return true;
                }
                return false;
            }
        },
        {
            name: "kick banned",
            description: "Kick all banned users remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                logger.info(`RemoteAction (${msg.author.username}): Kicking all banned users`);
                const n = OwnershipActions.kickBannedUsers(channelId);
                return n >= 0;
            }
        },
        {
            name: "kick",
            description: "Kick user remotely",
            options: [
                { name: "target", description: "The user to kick", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Kicking user ${target}`);
                    OwnershipActions.kickUser(channelId, target);
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
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Banning user ${target}`);
                    BansModule.enforceBanPolicy(target, channelId, true, `Remote action by ${msg.author.username}`);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unban",
            description: "Unban user remotely",
            options: [
                { name: "target", description: "The user to unban", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Unbanning user ${target}`);
                    BansModule.unbanUser(target, channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "permit",
            description: "Permit user remotely",
            options: [
                { name: "target", description: "The user to permit", type: ApplicationCommandOptionType.USER, required: true }
            ],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Permitting user ${target}`);
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
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Unpermitting user ${target}`);
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
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Whitelisting user ${target}`);
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
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Unwhitelisting user ${target}`);
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
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Blacklisting user ${target}`);
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
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                const target = args.target;
                if (target) {
                    logger.info(`RemoteAction (${msg.author.username}): Unblacklisting user ${target}`);
                    BlacklistModule.unblacklistUser(target, channelId);
                    return true;
                }
                return false;
            }
        }
    ]
};
