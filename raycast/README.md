# Summon in Raycast

Add this `raycast` directory in **Raycast Settings → Script Commands → Script Folders**. Search for **Summon** and press Return. This uses Raycast's [Script Commands](https://manual.raycast.com/script-commands).

The command starts Electron Forge against the current local checkout, with hot reload. It does not download releases or pull Git changes. If Summon is already running from this checkout with the same settings directory, the command activates it. Quit Summon normally before a full restart; an active conversation is never forcibly restarted by the launcher.

Settings always live in `~/Library/Application Support/Summon`. The launcher explicitly sets `WITSY_HOME` to that directory and keeps `DEBUG=1` so development API keys continue to use the same encrypted store as `npm start`. It never copies defaults or imports a backup on startup. Chats, Agents, Connections, Workflows, and settings keep their existing files. Unsent drafts are still subject to the app's own persistence behavior.

The first cold launch registers `~/Library/LaunchAgents/com.icework.summon.dev.plist`. This is an on-demand job, with no login launch or automatic restart. It lets Summon keep running after Raycast's script exits. Startup output is written to `~/Library/Logs/Summon/launcher.log` (owner access only). Node.js and the repository's installed dependencies are required.

To remove the launcher, quit Summon, remove this Script Folder in Raycast, then run:

```sh
launchctl bootout "gui/$(id -u)/com.icework.summon.dev"
rm "$HOME/Library/LaunchAgents/com.icework.summon.dev.plist"
```

Removing the launcher does not remove Summon's settings.
