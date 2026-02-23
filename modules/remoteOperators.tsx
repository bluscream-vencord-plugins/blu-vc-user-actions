import { ApplicationCommandOptionType } from "@api/Commands";
import { PluginModule } from "../types/module";
import { logger } from "../utils/logger";
import { RelationshipStore, React, Menu } from "@webpack/common";
import { OwnershipActions, isUserOwner } from "./ownership";
import { BansModule } from "./bans";
import { WhitelistModule } from "./whitelist";
import { BlacklistModule } from "./blacklist";
import { getNewLineList } from "../utils/settings";
import { OptionType } from "@utils/types";

/**
 * Settings definitions for the RemoteOperatorsModule.
 */
export const remoteOperatorsSettings = {
    remoteOperatorsEnabled: { type: OptionType.BOOLEAN, description: "Enable Remote Operator Commands", default: true, restartNeeded: false },
    externalCommandPrefix: { type: OptionType.STRING, description: "Global prefix for remote/external commands", default: "@", restartNeeded: false },
    remoteOperatorList: { type: OptionType.STRING, description: "Remote Operators", default: "", multiline: true, restartNeeded: false },
    friendsCountAsOperator: { type: OptionType.BOOLEAN, description: "Allow Discord friends to act as Remote Operators", default: false, restartNeeded: false },
};

export type RemoteOperatorsSettingsType = typeof remoteOperatorsSettings;

const checkPermission = (msg: any, s: any) =>
    isUserOwner(msg.author.id, msg.channel_id) || (s.remoteOperatorsEnabled && RemoteOperatorsModule.isOperator(msg.author.id));

export const RemoteOperatorsModule: PluginModule = {
    name: "RemoteOperatorsModule",
    description: "Allows authorized users to control the voice channel remotely.",
    requiredDependencies: ["OwnershipModule", "BansModule", "WhitelistModule", "BlacklistModule"],
    settingsSchema: remoteOperatorsSettings,
    settings: null,

    init(settings: Record<string, any>) {
        this.settings = settings;
    },

    stop() {
        // Nothing specific to stop
    },

    isOperator(userId: string): boolean {
        if (!this.settings) return false;
        if (this.settings.friendsCountAsOperator && RelationshipStore.isFriend(userId)) return true;
        if (this.settings.remoteOperatorList) {
            const operatorList = getNewLineList(this.settings.remoteOperatorList);
            if (operatorList.includes(userId)) return true;
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
            name: "info",
            description: "Request channel info remotely",
            execute: (_args, _msg, channelId) => {
                OwnershipActions.syncInfo(channelId);
                return true;
            }
        },
        {
            name: "claim",
            description: "Claim the current channel",
            execute: (_args, _msg, channelId) => {
                OwnershipActions.claimChannel(channelId);
                return true;
            }
        },
        {
            name: "lock",
            description: "Lock channel remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (_args, _msg, channelId) => {
                OwnershipActions.lockChannel(channelId);
                return true;
            }
        },
        {
            name: "unlock",
            description: "Unlock channel remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (_args, _msg, channelId) => {
                OwnershipActions.unlockChannel(channelId);
                return true;
            }
        },
        {
            name: "reset",
            description: "Reset channel remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (_args, _msg, channelId) => {
                OwnershipActions.resetChannel(channelId);
                return true;
            }
        },
        {
            name: "name",
            description: "Rename channel remotely",
            options: [{ name: "target", description: "New name", type: ApplicationCommandOptionType.STRING, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    OwnershipActions.renameChannel(channelId, args.target);
                    return true;
                }
                return false;
            }
        },
        {
            name: "size",
            description: "Set channel size remotely",
            options: [{ name: "target", description: "Limit", type: ApplicationCommandOptionType.INTEGER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target !== undefined) {
                    OwnershipActions.setChannelSize(channelId, args.target);
                    return true;
                }
                return false;
            }
        },
        {
            name: "kick banned",
            description: "Kick all banned users remotely",
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (_args, _msg, channelId) => {
                OwnershipActions.kickBannedUsers(channelId);
                return true;
            }
        },
        {
            name: "kick",
            description: "Kick user remotely",
            options: [{ name: "target", description: "User to kick", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    OwnershipActions.kickUsers(channelId, [args.target]);
                    return true;
                }
                return false;
            }
        },
        {
            name: "ban",
            description: "Ban user remotely",
            options: [{ name: "target", description: "User to ban", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, msg, channelId) => {
                if (args.target) {
                    BansModule.enforceBanPolicy(args.target, channelId, true, `Remote action by ${msg.author.username}`);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unban",
            description: "Unban user remotely",
            options: [{ name: "target", description: "User to unban", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    BansModule.unbanUsers([args.target], channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "permit",
            description: "Permit user remotely",
            options: [{ name: "target", description: "User to permit", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    WhitelistModule.permitUsers([args.target], channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unpermit",
            description: "Unpermit user remotely",
            options: [{ name: "target", description: "User to unpermit", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    WhitelistModule.unpermitUsers([args.target], channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "whitelist",
            description: "Whitelist user remotely",
            options: [{ name: "target", description: "User to whitelist", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    WhitelistModule.whitelistUsers([args.target], channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unwhitelist",
            description: "Unwhitelist user remotely",
            options: [{ name: "target", description: "User to unwhitelist", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    WhitelistModule.unwhitelistUsers([args.target], channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "blacklist",
            description: "Blacklist user remotely",
            options: [{ name: "target", description: "User to blacklist", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    BlacklistModule.blacklistUsers([args.target], channelId);
                    return true;
                }
                return false;
            }
        },
        {
            name: "unblacklist",
            description: "Unblacklist user remotely",
            options: [{ name: "target", description: "User to unblacklist", type: ApplicationCommandOptionType.USER, required: true }],
            checkPermission: (msg, s) => checkPermission(msg, s),
            execute: (args, _msg, channelId) => {
                if (args.target) {
                    BlacklistModule.unblacklistUsers([args.target], channelId);
                    return true;
                }
                return false;
            }
        }
    ]
};
