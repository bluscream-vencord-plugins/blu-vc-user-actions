On the guild 505974446914535426, there is a category 763914042628112455, and inside it there are channels that are created by the bot 913852862990262282 for users.
The bot handles channel moderation by having a MemberChannelInfo object with settings for all channels of that user (like a whitelist and banlist with a maximum of 5 users) for each member.
When a user creates a channel through the bot (Joins channel 763914043252801566 and gets moved to the created channel by the bot), the bot will send a message like .\_SOURCE\src\userplugins\socializeGuild\.references\examples\channel-created-response.json which will make the user the ChannelOwnership.creator.
When the creator leaves, another user in the channel can use the settings.store.claimCommand to become the ChannelOwnership.claimant.
The ChannelOwnership.creator can always claim back the channel which will remove ChannelOwnership.claimant status from the claimant.
When the claimant leaves, any other user can become the new ChannelOwnership.claimant by claiming the channel.
If any creator or claimant is at their max amount of bans (5), to ban someone else they have to unban someone first.
When the channel becomes empty, all ownership is gone, but the cached MemberChannelInfo per user should still be cached for any members that issued it.
