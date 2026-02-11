# blu-vc-user-actions

Automatically takes actions against users joining your voice channel.

## Screenshots
| User Context Menu | Settings 1 |
| :---: | :---: |
| ![User Context Menu](https://files.catbox.moe/2rzwbx.png) | ![Settings 1](https://files.catbox.moe/w4b5lm.png) |
| **Settings 2** | **Toolbox** |
| ![Settings 2](https://files.catbox.moe/d4qt5u.png) | ![Toolbox](https://files.catbox.moe/4ershp.png) |

## Features
- Auto kick users from voice channels based on a list.
- Configurable kick messages with template variables.
- Detect and notify voice channel ownership changes.
- Customizable ownership notifications.
- Manually check for channel ownership.
- Dynamic date and user template variables (e.g., `{now:HH:mm}`, `{user_id}`).
- "Create Channel" button in voice channel toolbox for quick navigation.

## Template Variables
Common variables available in messages:
- `{now}`: Current time (system format).
- `{now:FORMAT}`: Custom date/time format (e.g., `{now:YYYY-MM-DD}`).
- `{my_id}`: Your user ID.
- `{my_name}`: Your username.
- `{guild_id}`: Current server ID.
- `{guild_name}`: Current server name.
- `{channel_id}`: Current channel ID.
- `{channel_name}`: Current channel name.
- `{user_id}`: Target/Owner user ID.
- `{user_name}`: Target/Owner username.
- `{reason}`: Reason for ownership (for ownership messages).
