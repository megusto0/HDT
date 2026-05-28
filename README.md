# HDT Battlegrounds Tracker

HDT Battlegrounds Tracker is a local-only analytics system for Hearthstone Battlegrounds. The HDT plugin records your games to SQLite and JSON, a small Node API reads the local database, and the React dashboard shows leveling curves, minion purchase correlations, match history, hero stats, and MMR trends without cloud sync, auth, or telemetry.

## Screenshots

Screenshot placeholders live in `docs/screenshots/`.

## Prerequisites

- Windows 10/11.
- Hearthstone Deck Tracker installed.
- .NET Framework 4.7.2 Developer Pack.
- Node 20+.
- pnpm 9+ (`corepack enable` is enough on modern Node installs).

## Install The Plugin

1. Find your HDT assemblies. Overwolf installs usually place them under `%LocalAppData%\Overwolf\Extensions\...`; classic installs may use `C:\Program Files\HearthstoneDeckTracker`.
2. Build the plugin:

   ```powershell
   cd plugin
   dotnet build -c Release
   ```

3. Copy the Release output to:

   ```text
   %AppData%\HearthstoneDeckTracker\Plugins\HDTBgTracker\
   ```

4. Restart HDT and enable the plugin from the HDT plugin menu. On load it writes `%AppData%\HDTBgTracker\plugin.log`.

## Run The Dashboard

```powershell
corepack pnpm install
corepack pnpm seed
corepack pnpm dev
```

The API starts at `http://localhost:5174`; the web app starts at `http://localhost:5173`.

## Run As A Windows Service

For daily use, install the production dashboard as a local Windows service. The service runs one Node process: Express serves `/api/*` and the built React app from the same port.

Open PowerShell as Administrator:

```powershell
cd C:\Users\hecol\Documents\HDT-plugin\hdt-bg-tracker
corepack pnpm service:install
```

The default service name is `HDTBgTracker`, and the dashboard opens at:

```text
http://localhost:5174
```

The installer pins the service data directory to:

```text
C:\Users\hecol\AppData\Roaming\HDTBgTracker
```

That path is intentional: it is the same directory used by the HDT plugin for `stats.db` and `games\`. If you install for a different Windows user, pass `-DataDir` explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-service.ps1 -DataDir "$env:APPDATA\HDTBgTracker"
```

Useful service commands:

```powershell
Get-Service HDTBgTracker
Start-Service HDTBgTracker
Stop-Service HDTBgTracker
corepack pnpm service:status
corepack pnpm service:verify
corepack pnpm service:uninstall
```

`service:verify` checks the Windows service status, `stats.db` path, `/api/health`, `/api/summary`, recent games, and the dashboard HTML response.

The service wrapper and logs live under `%ProgramData%\HDTBgTracker\`. The installer uses WinSW because plain `node.exe` is not a native Windows Service executable.

## Data Location

The plugin and server use:

```text
%AppData%\HDTBgTracker\
  stats.db
  games\
  plugin.log
```

To wipe local data, close HDT and the dev server, then delete `%AppData%\HDTBgTracker\stats.db` and `%AppData%\HDTBgTracker\games\`.

## Troubleshooting

### Plugin Not Loading

Confirm the plugin DLL and its dependency DLLs are in `%AppData%\HearthstoneDeckTracker\Plugins\HDTBgTracker\`. Then inspect `%AppData%\HDTBgTracker\plugin.log` and HDT's plugin log. If references fail to resolve, update the hint paths in `plugin/HDTBgTracker.csproj` to the installed HDT assembly location.

### No Games Appearing

The plugin records only Battlegrounds matches. Confirm HDT is running, the plugin is enabled, and `%AppData%\HDTBgTracker\stats.db` has a recent `games` row. The dashboard reads from the same file through the local API.

### Shop Events Missing

Shop events are inferred from entity changes during recruit phases. If purchases or upgrades do not appear, keep `plugin.log` from the affected match and compare it with the JSON dump in `%AppData%\HDTBgTracker\games\`.

## License

MIT.
