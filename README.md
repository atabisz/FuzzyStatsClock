# Fuzzy Clock

A minimal WPF desktop widget that displays the current time as a fuzzy English phrase — *"just a little after 11"*, *"almost noon"*, *"quarter past 3"* — or as a minimal analog dial with hour and minute hands. It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box.

## Features

- **Phrase mode** — time expressed as natural English, updating on 5-minute boundaries
- **Dial mode** — hour and minute hands on a transparent background (no face, no numbers); optional hour ticks, minute marks, and hour labels
- **Stats panel** — live CPU / GPU / MEM / PAG usage as horizontal bars below the phrase or dial; per-row visibility toggles; 1s / 3s / 10s update interval
- **Uptime row** — system uptime (`up 5h 3m`), rolling 1m/5m/15m CPU load averages, and active process count (`142p`) in a single compact line
- **Ghost mode** — hovering the mouse over the widget automatically hides it (fully transparent and click-through) so it never blocks the desktop; moving the mouse away restores it; toggleable via tray
- **Auto-contrast** — samples the screen color under the widget every 500ms and automatically switches text to black or white (WCAG-based) when the accent color loses contrast against the background; toggleable via tray
- **Accent colors** — choose from five presets (White, Amber, Ice Blue, Green, Hello Kitty Pink) or pick any custom color; applies to all text, hands, bars, and decorations
- **Window opacity** — 25% / 50% / 75% / 100% via tray submenu, or adjust in 10% steps with the scroll wheel
- **Hover fast-refresh** — stats accelerate to 0.5s while the mouse is over the widget (hold Ctrl+Alt to hover without triggering ghost mode)
- **Auto-launch** — optionally start the widget at Windows login; toggled via the system tray
- **Per-monitor position memory** — position is remembered per-monitor; switching monitors restores the last-used position on each display
- **Drag anywhere** — left-click drag repositions freely; position saved immediately
- **Font size** — Small (16pt) / Medium (24pt) / Large (32pt) via tray menu (phrase mode only)
- **Context-aware menus** — Font Size submenu hidden in dial mode; Dial Face submenu hidden in phrase mode
- **Persistence** — all preferences saved to `%LOCALAPPDATA%\FuzzyClock\settings.json`

## Requirements

- Windows 10 or 11
- [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0) (or SDK for building from source)

## Build

```bash
dotnet build FuzzyClock.slnx
```

## Run

```bash
dotnet run --project FuzzyClock.App
```

Or build and launch the executable directly:

```bash
dotnet build FuzzyClock.slnx -c Release
./FuzzyClock.App/bin/Release/net10.0-windows/FuzzyClock.exe
```

## Test

```bash
dotnet test FuzzyClock.slnx
```

88 unit tests: phrase engine (all 5-minute buckets, noon/midnight, edge cases), dial geometry, uptime formatter, settings validation and migration, and app integration tests.

## Usage

### Right-click context menu

Right-click the system tray icon to access all settings:

| Item | Description |
|------|-------------|
| **Ghost Mode** | Enable/disable hover-to-hide |
| **Auto-Launch at Login** | Enable/disable start at Windows login |
| **Auto-Contrast** | Enable/disable automatic text contrast adjustment |
| **Dial Mode** | Toggle between phrase clock and analog dial display |
| **Font Size** | Small (16pt) / Medium (24pt) / Large (32pt) — phrase mode only |
| **Dial Face** | Toggle hour ticks, minute marks, hour numbers — dial mode only |
| **Stats** | Show/hide the stats panel; toggle individual rows (CPU/GPU/MEM/PAG/Uptime); set update interval |
| **Theme** | Pick a color preset (White / Amber / Ice Blue / Green / Hello Kitty Pink) or open the custom color picker |
| **Opacity** | Set window opacity (25% / 50% / 75% / 100%) |
| **Reset to Defaults** | Restore factory settings |
| **About** | Show version information |
| **Quit** | Exit the application |

### Mouse interactions

| Action | Effect |
|--------|--------|
| **Left-click drag** | Move the widget |
| **Scroll wheel** | Adjust opacity in 10% steps |
| **Hover** | Ghost mode: widget fades out and becomes click-through |
| **Ctrl+Alt + hover** | Suppress ghost mode; activates hover backdrop and fast stats refresh instead |

### System tray

The tray icon is the primary UI surface. All settings are accessible from the tray right-click menu (see above). The tray icon is always visible in the system notification area.

Toggle items available at the top of the tray menu:

- **Ghost Mode** — enable/disable hover-to-hide (checkmark = active)
- **Auto-Launch at Login** — enable/disable start at Windows login (checkmark = active)
- **Auto-Contrast** — enable/disable automatic text contrast adjustment (checkmark = active)

## Project Structure

```
FuzzyClock.slnx
├── FuzzyClock.Core/          # Pure logic (PhraseEngine, DialGeometry, UptimeFormatter, ContrastService)
├── FuzzyClock.Core.Tests/    # MSTest unit tests for Core logic
├── FuzzyClock.App/           # WPF overlay window
│   ├── MainWindow.xaml(.cs)  # Main UI and event handlers
│   ├── StatsService.cs       # PDH performance counters (CPU/GPU/MEM/PAG)
│   ├── ContrastSamplerService.cs  # BitBlt screen color sampling
│   ├── GhostModeController.cs     # Win32 click-through and restore timer
│   ├── TrayMenuBuilder.cs         # System tray icon and menu construction
│   ├── ContrastRefreshController.cs # 500ms auto-contrast timer
│   ├── AutoLaunchService.cs       # Registry auto-launch management
│   ├── MonitorService.cs          # Per-monitor identity and position tracking
│   └── SettingsService.cs         # JSON settings I/O and migration
└── FuzzyClock.App.Tests/     # MSTest integration tests for App layer
```

`FuzzyClock.Core` has no external dependencies. `FuzzyClock.App` references `System.Diagnostics.PerformanceCounter` (NuGet) for PDH stats counters.

## Settings File

Preferences are stored at `%LOCALAPPDATA%\FuzzyClock\settings.json` and written atomically (temp file + rename). Safe to delete to reset all preferences to defaults.

## Planning Docs

| File | Description |
|------|-------------|
| [.planning/PROJECT.md](.planning/PROJECT.md) | Full feature list, key decisions, and architecture notes |
| [.planning/ROADMAP.md](.planning/ROADMAP.md) | Phase-by-phase build roadmap |
| [.planning/MILESTONES.md](.planning/MILESTONES.md) | Shipped milestone history and accomplishments |
| [.planning/STATE.md](.planning/STATE.md) | Current project state and next action |
