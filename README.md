# Fuzzy Clock

A minimal WPF desktop widget that displays the current time as a fuzzy English phrase — *"just a little after 11"*, *"almost noon"*, *"quarter past 3"* — or as a minimal analog dial with hour and minute hands. It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box.

## Features

- **Phrase mode** — time expressed as natural English, updating on 5-minute boundaries
- **Dial mode** — hour and minute hands on a transparent background (no face, no numbers); optional hour ticks, minute marks, and hour labels
- **LCD clock** — retro 7-segment display rendered with WPF polygon geometry (no fonts or bitmaps); ghost (inactive) segments always visible at a dimmed color; 17 color themes (10 dark phosphor/neon, 5 muted pastel, 2 inverted light-background); 12hr (space-padded) or 24hr (zero-padded); optional seconds display; three size variants (Small / Medium / Large)
- **Stats panel** — live CPU / GPU / MEM / PAG usage as horizontal bars below the phrase or dial; per-row visibility toggles; 1s / 3s / 10s update interval
- **Battery row** — shows battery charge percentage and `⚡` when AC-connected (e.g. `⚡ 87%`); displays `N/A` on desktops or VMs with no battery; toggleable per-row like other stat rows
- **Uptime row** — system uptime (`up 5h 3m`), rolling 1m/5m/15m CPU load averages, and active process count (`142p`) in a single compact line
- **Date display** — shows the current date below the clock phrase or dial in a muted accent color; toggleable via tray (Show Date); four format options selectable from the tray Date Format submenu:
  - Short: `Sat, Mar 7`
  - Long: `Saturday, March 7`
  - Numeric: `3/7/2026`
  - ISO: `2026-03-07`
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

## LCD Clock

*Screenshot placeholder — v3.3*

A retro 7-segment LCD clock type, rendered entirely with WPF polygon geometry (no fonts or bitmaps).

### Themes

| Theme    | Lit color | Ghost color | Background |
|----------|-----------|-------------|------------|
| Green    | `#00FF41` | `#003310`   | `#001A00`  |
| Amber    | `#FFAA00` | `#3D2800`   | `#1A0A00`  |
| Blue     | `#00CFFF` | `#002A35`   | `#00001A`  |
| Teal     | `#00B4B4` | `#002525`   | `#001010`  |
| Red      | `#FF2200` | `#380800`   | `#1A0000`  |
| Vfd      | `#14F0A0` | `#023A28`   | `#001A10`  |
| Nixie    | `#FF6000` | `#3D1800`   | `#1A0800`  |
| Magenta  | `#FF00CC` | `#3D0030`   | `#1A0015`  |
| Purple   | `#CC00FF` | `#300040`   | `#15001A`  |
| Cyan     | `#00FFFF` | `#003838`   | `#001A1A`  |
| Lime     | `#CCFF00` | `#2E3800`   | `#141A00`  |
| Cream    | `#FFEEDD` | `#3D3020`   | `#1A1208`  |
| Ice      | `#B0D8FF` | `#1A2D3D`   | `#0A1520`  |
| Mint     | `#66FFCC` | `#003D28`   | `#001A12`  |
| Lavender | `#CC99FF` | `#280040`   | `#120018`  |
| LcdGrey  | `#2A3020` | `#8A9080`   | `#C8D0C0`  |
| Paper    | `#1A1A18` | `#9090A0`   | `#F0F0E8`  |

Ghost (inactive) segments are always visible at a dimmed color — a hallmark of real LCD hardware.

### Size, format, and seconds

| Setting | Options |
|---------|---------|
| Size | Small (32px) / Medium (48px) / Large (64px) |
| Hour format | 12hr (space-padded, no AM/PM) or 24hr (zero-padded) |
| Show seconds | Appends `:SS` to the display |

### Backlog

> **Nixie-style clock** — a warm-glow Nixie tube variant is planned for a future milestone.

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

248 unit tests: phrase engine (all 5-minute buckets, noon/midnight, edge cases), dial geometry, uptime formatter, date formatter (all 4 formats), seven-segment encoder, LCD time format helper, settings validation and migration, and app integration tests.

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
| **Show Date** | Show or hide the date line below the clock phrase or dial; persisted |
| **Date Format** | Short (Sat, Mar 7) / Long (Saturday, March 7) / Numeric (3/7/2026) / ISO (2026-03-07) |
| **Stats** | Show/hide the stats panel; toggle individual rows (CPU/GPU/MEM/PAG/BATT/Uptime); set update interval |
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
├── FuzzyClock.Core/          # Pure logic (PhraseEngine, DialGeometry, UptimeFormatter, DateFormatter, ContrastService)
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
