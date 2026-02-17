import { RelationshipStore, GuildMemberStore, UserStore, VoiceStateStore, ChannelStore } from "@webpack/common";

export async function getFriendsOnGuild(guildId: string): Promise<string> {
    const me = UserStore.getCurrentUser();
    if (!me) return "❌ Could not identify current user.";

    const friendIds = RelationshipStore.getFriendIDs();

    if (friendIds.length === 0) return "Forever Alone (No friends found).";

    const guildMembers = GuildMemberStore.getMembers(guildId);
    // GuildMemberStore might not have all members cached.
    // But for now we use what we have.

    const friendsInGuild = friendIds.filter(id => GuildMemberStore.isMember(guildId, id));

    if (friendsInGuild.length === 0) return "No friends found in this guild.";

    const lines: string[] = [`**Friends in Guild (${friendsInGuild.length})**`];

    for (const friendId of friendsInGuild) {
        const user = UserStore.getUser(friendId);
        const name = user?.globalName || user?.username || friendId;

        const voiceState = VoiceStateStore.getVoiceState(guildId, friendId);
        let status = "Offline/Online";

        if (voiceState && voiceState.channelId) {
            const channel = ChannelStore.getChannel(voiceState.channelId);
            status = `In Voice: ${channel?.name || voiceState.channelId}`;
        }

        lines.push(`- ${name}: ${status}`);
    }

    return lines.join("\n");
}
