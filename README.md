# Fuzzy Clock

A minimal WPF desktop widget that displays the current time as a fuzzy English phrase — *"just a little after 11"*, *"almost noon"*, *"quarter past 3"* — or as a minimal analog dial with hour and minute hands. It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box.

## Features

- **Phrase mode** — time expressed as natural English, updating on 5-minute boundaries
- **Dial mode** — hour and minute hands on a transparent background (no face, no numbers); optional hour ticks, minute marks, and hour labels
- **Stats panel** — live CPU / GPU / MEM / PAG usage as horizontal bars below the phrase or dial; per-row visibility toggles; 1s / 3s / 10s update interval
- **Hover fast-refresh** — stats accelerate to 0.5s while the mouse is over the widget
- **Context-aware menus** — Font Size submenu hidden in dial mode; Dial Face submenu hidden in phrase mode
- **Drag anywhere** — left-click drag repositions freely; position saved immediately
- **Font size** — Small (16pt) / Medium (24pt) / Large (32pt) via right-click menu
- **Persistence** — all preferences saved to `%LOCALAPPDATA%\FuzzyClock\settings.json`

## Requirements

- Windows 10 or 11
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)

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
./FuzzyClock.App/bin/Release/net10.0-windows/FuzzyClock.App.exe
```

## Test

```bash
dotnet test FuzzyClock.Core.Tests
```

51 unit tests covering all phrase-engine buckets including noon, midnight, and 5-minute boundary edge cases.

## Usage

- **Right-click** — opens the context menu (the only UI surface)
- **Left-click drag** — move the widget
- **Close** — right-click → Close (Alt+F4 is disabled by design; no taskbar entry)

## Project Structure

```
FuzzyClock.sln
├── FuzzyClock.Core/          # PhraseEngine — pure logic, no UI dependencies
├── FuzzyClock.Core.Tests/    # MSTest unit tests for PhraseEngine
└── FuzzyClock.App/           # WPF overlay window (MainWindow.xaml + .cs)
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
