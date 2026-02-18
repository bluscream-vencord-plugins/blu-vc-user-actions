import { definePluginSettings } from "@api/Settings";
import { blacklistSettings } from "./logic/blacklist";
import { whitelistSettings } from "./logic/whitelist";
import { permitSettings } from "./logic/permit";
import { kickNotInRoleSettings } from "./logic/kickNotInRole";
import { channelNameSettings } from "./logic/channelName";
import { channelClaimSettings } from "./logic/channelClaim";
import { votebanSettings } from "./logic/voteban";
import { queueSettings } from "./logic/queue";
import { coreSettings } from "./logic/core";

export const settings = definePluginSettings({
    ...blacklistSettings,
    ...whitelistSettings,
    ...permitSettings,
    ...kickNotInRoleSettings,
    ...channelNameSettings,
    ...channelClaimSettings,
    ...votebanSettings,
    ...queueSettings,
    ...coreSettings,
});
