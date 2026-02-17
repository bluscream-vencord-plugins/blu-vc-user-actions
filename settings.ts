import { definePluginSettings } from "@api/Settings";
import { blacklistSettings } from "./logic/blacklist/settings";
import { whitelistSettings } from "./logic/whitelist/settings";
import { permitSettings } from "./logic/permit/settings";
import { kickNotInRoleSettings } from "./logic/kickNotInRole/settings";
import { channelNameSettings } from "./logic/channelName/settings";
import { channelClaimSettings } from "./logic/channelClaim/settings";
import { votebanSettings } from "./logic/voteban/settings";
import { queueSettings } from "./logic/queue/settings";
import { coreSettings } from "./logic/core/settings";

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
