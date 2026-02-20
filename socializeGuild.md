# Socialize Guild - Plugin Functional & Architectural Specification

## 1. Core Architecture & Philosophy
The plugin is designed as a highly modular, event-driven voice channel administration tool. It operates by monitoring a specific category within a target guild and automatically managing voice channel states, user permissions, and channel properties based on predefined settings and a local persistence store.

Defaults:
- Guild ID: 505974446914535426
- Category ID: 763914042628112455
- Channel Creation Channel ID: 763914043252801566
- Channel Moderation Bot ID: 913852862990262282

The architecture is built on a **Module Registry** system. Distinct functional areas (e.g., Blacklisting, Naming, Whitelisting) are self-contained modules that register lifecycle hooks:
- **Initialization/Teardown:** Triggers on plugin start/stop.
- **Discord Event Hooks:** Listening to Voice State Updates, Message Creations.
- **Custom Application Events:** Reacting to user joins/leaves in managed channels, or when channel ownership changes.
- **UI Integrations:** Injecting items into User, Channel, Guild, and Toolbox context menus.
- **Commands:** Registering slash sub-commands under a unified main command.

## 2. State & Data Management
The system relies on robust local state management to remember channel configurations even across restarts.

### 2.1 Persistence Entities
- **Channel Ownership State:** Maps a Voice Channel ID to its creator and/or its claimant. Includes the user ID and the timestamp of creation/claim.
  - The **creator** is established when the bot creates the channel for the user.
  - If the creator leaves, another user in the channel can use the claim command (`settings.store.claimCommand`) to become the **claimant**.
  - The creator can always use the claim command to take back the channel, which removes the claimant status.
  - If the claimant leaves, any other user can claim the channel to become the new claimant.
  - When the channel becomes empty, all ownership (creator and claimant) is cleared.
- **Member Configuration State:** Used to cache a Member's Channel Settings object per member. Maps an Owner's User ID to their specific channel configurations. This configuration acts as a "preset" that follows the user and applies to any channel they own. This configuration remains cached even when the user currently has no active channel ownership.
  - *Properties:* Custom channel name, maximum user limit, current status (e.g., locked), a list of dynamically banned users (maximum of 5 users), and a list of permitted users.

### 2.2 Dynamic State Inference (Bot Response Parsing)
Because actual channel properties are controlled by an external bot, the plugin stays in sync by reading the target bot's messages (embeds). It parses messages for:
- **Ownership:** "Channel Created" or "Channel Claimed" keywords.
- **Permissions:** Dynamically updates local permitted/banned lists when the bot confirms a user was banned or unbanned.
- **Settings:** Tracks channel limit changes and lock/unlock statuses based on bot confirmation messages.

### 2.3 Action Queue System
To avoid rate limits and overlapping commands, all outward actions (sending commands to the bot) are routed through a centralized, asynchronous Action Queue.
- Actions have a configurable delay (defaulting to 1-5 seconds) between executions.
- Priority actions (like claiming a channel or requesting sync info) bypass the queue and jump to the front.

## 3. Core Modules & Functionality

### 3.1 Channel Claiming & Ownership Management
- **Creation Mechanism:** When a user joins the Channel Creation Channel (763914043252801566) and is moved to a newly created channel by the bot, the bot sends a confirmation message (like `_SOURCE\src\userplugins\socializeGuild\.references\examples\channel-created-response.json`). This assigns them as the creator.
- **Monitoring:** Analyzes voice state updates. When a user connects to a managed category, it identifies if they are the owner.
- **Syncing:** Periodically (or on command) fetches message history to read bot embeds and definitively determine who created or claimed the channel.
- **Actions:** Evaluates when an owner leaves. If configured, it can automatically attempt to claim the channel for the local user.
- **Navigation:** Can automatically route the client UI to focus on the newly owned voice channel.
- **UI:** Context menus allow manual claiming, locking, unlocking, resetting, and setting size limits (from 1 to 10+, or unlimited).

### 3.2 Blacklisting & Ban Enforcement
A comprehensive system to keep unwanted users out of owned channels.
- **Local Ban List vs Settings Bans:** Merges a local "global" blacklist with the channel-specific bans saved to the user's profile.
- **Ban Rotation Engine:** The bot enforces a strict maximum ban limit (5 users by default, configurable). To ban someone else when at the limit, an existing user must be unbanned first. The system identifies the oldest banned user, automatically queues an unban, and then bans the new user to make room.
- **Cooldowns:** Tracks recently kicked users to prevent endless kick-loops. If a user rejoins too quickly, they are forcefully added to the Ban Rotation instead of just being repeatedly kicked.
- **Bulk Actions:** Context menus allow the owner to mass-ban or mass-unban every other user currently in the voice channel.

### 3.3 Whitelisting
Allows configuring a list of immune users.
- Immune users bypass automated kicks and bans.
- Triggers a specific local logging message when an automated action is suppressed due to whitelisting.

### 3.4 Channel Naming & Rotation
Allows dynamic, periodic renaming of the owned voice channel to maintain visibility or freshness.
- **Configuration:** Accepts a multi-line list of names and a time interval (minimum 11 minutes to respect platform rate limits).
- **Execution:** When the local user acquires ownership, an internal interval timer starts. It sequentially advances through the name list, dispatching rename commands.
- **Cleanup:** If ownership is lost or the plugin stops, the intervals are destroyed and the rotation index is cleared.
- **Sanitization:** Commands exist to automatically sanitize the name list, stripping out duplicates or names exceeding the 15-character limit.

### 3.5 Role Enforcement
An automated gatekeeping mechanism based on guild roles.
- Checks the roles of any user joining an owned channel.
- If the user lacks a strictly defined required role, they are instantly kicked.
- Sends a configurable external command and an ephemeral warning message summarizing the missing role.

### 3.6 Vote Banning (Democratic Moderation)
Allows occupants of a voice channel to collectively ban a user, bypassing strict ownership requirements.
- **Trigger:** Listens for specific regex patterns in chat messages.
- **Threshold Mechanism:** Calculates a required number of votes based on a configurable percentage of the channel's current occupant count.
- **Voting Window:** Votes are tracked in a temporary cache that expires after a defined number of minutes.
- **Execution:** If the threshold is met within the window, the target is aggressively added to the ban queue. Owners using this command instantly bypass the vote threshold.

### 3.7 Permits
Explicit overrides to allow specific users into a locked or restricted channel.
- Features bulk allocation, allowing the owner to seamlessly permit or unpermit arrays of users via memory commands.

### 3.8 Command Cleanup
A minor utility module that intercepts intercepted actions.
- If enabled, any command string executed by the queue system on behalf of the user is immediately deleted from the chat to reduce visual clutter.

## 4. UI, Menus, and Commands Layout

### 4.1 Sub-Command Structure
The plugin exposes a unified root slash command containing multiple sub-commands:
- **Stats & Resets:** View memory statistics, reset states, reset settings to defaults.
- **Information Sync:** Force manual sync of channel info/ownership, view embedded statistics about the current channel's owner and permission lists.
- **Ban Management:** Add/remove users from local bans, clear bans, list merged ban statuses, kick all currently banned users.
- **Whitelist Management:** Add, remove, and list whitelisted users.
- **Naming Commands:** Start rotation, jump to next name manually, stop rotation, validate name list properties.
- **Vote Banning:** Initiate a vote ban via slash command explicitly.
- **Permitting:** Slash commands to permit or unpermit specific users.

### 4.2 Context Menus
The plugin intelligently injects into multiple right-click targets only when conditions (like being in the correct guild/channel) are met:
- **User Target:** Options to Ban/Unban, Kick, and Whitelist/Unwhitelist the specific user.
- **Channel Target:** Options to Claim, Lock, Unlock, Reset, Set User Limits, Rename, and perform bulk Ban/Unban operations on the channel's current occupants.
- **Guild Target:** Batch operations (e.g., scraping the whole category for all channel owners at once) and general status toggles.
- **Toolbox Integration:** Adds quick-access buttons (e.g., "Create Channel" by joining the "Channel Creation Channel ID", Ownership status, distinct functions like wether queue is processed or kicking user not in a specific role) directly into the voice channel UI panel.

## 5. Templating Engine
All automated text outputs (bans, kicks, renames, ownership notifications) utilize a robust internal string formatter.
Available interpolations include:
- Current timestamp variations (generic and customizable time formats).
- Local user data (ID and Name).
- Current contextual data (Guild ID/Name, Channel ID/Name).
- Target user data (Target ID/Name).
- Action specifics (Reasons, Old User IDs during Ban Rotation, required Role IDs).

## 6. External Bot API Requirements

Because this plugin orchestrates a separate moderation bot, it relies on specific inbound text patterns and outbound command structures. The exact strings can be modified in settings, but the concepts and placeholders are required for the system to function.

### 6.1 Outbound Commands (Local to External Bot)
The plugin must send commands to the chat so the external bot executes actions. These should be customizable by user in case they change in the future. The following abstract commands are required. Each command will typically substitute a placeholder for the target target user, target channel name, or target limit:

- **Claim Command:** Claims ownership of the current channel. (!v claim)
- **Info Command:** Requests the external bot to print the current channel's settings and member lists. (!v info)
- **Set Size Command:** Sets the maximum occupant limit (requires a number placeholder). (!v size <number>)
- **Lock / Unlock Commands:** Toggles the channel's general access status. (!v lock / !v unlock)
- **Reset Command:** Reverts the channel name and settings to default. (!v reset)
- **Kick / Ban / Unban Commands:** Moderation actions targeting a specific user (requires a user mention or ID placeholder). (!v kick / !v ban / !v unban <user>)
- **Permit / Unpermit Commands:** Overrides granting or revoking access for a specific user. (!v permit / !v unpermit <user>)
- **Rename Channel Command:** Changes the channel's name (requires a text placeholder). (!v name <name>)

### 6.2 Inbound Responses (External Bot to Local Plugin)
The plugin actively scans incoming messages (specifically embeds) sent by the configured external bot to stay synchronized.

#### Event Triggers
The external bot's embed (Title, Author Name, or Description) must contain specific keywords to trigger state updates:
- **Channel Created / Claimed:** Must indicate creation or claiming, and include a mention or avatar URL of the owning user.
- **Channel Banned / Unbanned:** Must indicate a ban or unban action, and include a mention of the targeted user.
- **Channel Permitted / Unpermitted:** Must indicate a permit or unpermit action, and include a mention of the targeted user.
- **Size Changed:** Must indicate a size change and include the new limit number.
- **Locked / Unlocked:** Must indicate the new lock state of the channel.

#### Channel Info Parsing
When the plugin requests channel info (via the Info Command), the external bot must respond with an embed formatted in a highly specific way so the plugin can parse the active settings:
- **Channel Identifier:** Must explicitly list the Channel ID (e.g., `<#[Channel ID]>` or `**Channel ID:** [Channel ID]`).
- **Basic Properties:** Must list properties using key-value pairs (e.g., `**Name:** [Channel Name]`, `**Limit:** [Number]`, `**Status:** [Locked/Unlocked]`).
- **User Lists:** Must have explicit headers for `**Permitted**` and `**Banned**`. Underneath these headers, each user must be listed on a new line starting with a blockquote and containing a user mention (e.g., `> <@[User ID]>`).
- read _SOURCE\src\userplugins\socializeGuild\.references\examples for more examples.

#### Addendum by user
I would prefer if the plugin was as object-oriented as feasable to make it easier to extend, modify and read.
I would also prefer if more things are customizable by the user.
