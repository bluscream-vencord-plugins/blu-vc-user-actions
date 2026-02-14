# blu-vc-user-actions

Automatically takes actions against users joining your voice channel.

## Screenshots
|  **Settings 1** | **Settings 2**
| :---: | :---: |
|  ![Settings 1](https://files.catbox.moe/w4b5lm.png) | ![Settings 2](https://files.catbox.moe/d4qt5u.png) |
| **User Context Menu** | **Toolbox** |
| ![User Context Menu](https://files.catbox.moe/2rzwbx.png) | ![Toolbox](https://files.catbox.moe/4ershp.png) |

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

## Installation

```bat
@echo off
REM Install dependencies
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS
call npm install -g pnpm
REM Clone Equicord
git clone https://github.com/Equicord/Equicord Equicord
REM Setup User Plugin
mkdir Equicord\src\userplugins
git clone https://github.com/bluscream-vencord-plugins/blu-vc-user-actions Equicord\src\userplugins\blu-vc-user-actions
REM Build and Inject
cd Equicord
call pnpm install --frozen-lockfile
call pnpm build
call pnpm buildWeb
call pnpm inject -install-openasar -branch stable
```

```bat
@echo off
REM Install dependencies
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS
call npm install -g pnpm
REM Clone Vencord
git clone https://github.com/Vencord/Vencord Vencord
REM Setup User Plugin
mkdir Vencord\src\userplugins
git clone https://github.com/bluscream-vencord-plugins/blu-vc-user-actions Vencord\src\userplugins\blu-vc-user-actions
REM Build and Inject
cd Vencord
call pnpm install --frozen-lockfile
call pnpm build
call pnpm buildWeb
call pnpm inject -install-openasar -branch stable
```

```bat
@echo off
REM Install dependencies
winget install -e --id OpenJS.NodeJS
call npm install -g pnpm
REM Download and Extract Equicord
powershell -Command "Invoke-WebRequest https://github.com/Equicord/Equicord/archive/refs/heads/main.zip -OutFile Equicord.zip"
powershell -Command "Expand-Archive -Path Equicord.zip -DestinationPath ."
ren Equicord-main Equicord
del Equicord.zip
REM Setup User Plugin
mkdir Equicord\src\userplugins
cd Equicord\src\userplugins
powershell -Command "Invoke-WebRequest https://github.com/bluscream-vencord-plugins/blu-vc-user-actions/archive/refs/heads/main.zip -OutFile Plugin.zip"
powershell -Command "Expand-Archive -Path Plugin.zip -DestinationPath ."
ren blu-vc-user-actions-main blu-vc-user-actions
del Plugin.zip
cd ..\..\..
REM Build and Inject
cd Equicord
call pnpm install --frozen-lockfile
call pnpm build
call pnpm buildWeb
call pnpm inject -install-openasar -branch stable
```
