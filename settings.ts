import { definePluginSettings } from "@api/Settings";
import { BlacklistModule } from "./logic/blacklist";
import { WhitelistModule } from "./logic/whitelist";
import { PermitModule } from "./logic/permit";
import { KickNotInRoleModule } from "./logic/kickNotInRole";
import { ChannelNameModule } from "./logic/channelName";
import { ChannelClaimModule } from "./logic/channelClaim";
import { VotebanModule } from "./logic/voteban";
import { QueueModule } from "./logic/queue";
import { CoreModule } from "./logic/core";

export const settings = definePluginSettings({
    ...BlacklistModule.settings,
    ...WhitelistModule.settings,
    ...PermitModule.settings,
    ...KickNotInRoleModule.settings,
    ...ChannelNameModule.settings,
    ...ChannelClaimModule.settings,
    ...VotebanModule.settings,
    ...QueueModule.settings,
    ...CoreModule.settings,
});
