# Fuzzy Clock

## What This Is

A minimal C# WPF desktop widget that displays the current time as a fuzzy, natural-English phrase — "just a little after 11", "almost noon", "quarter past 3". It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box. The phrase refreshes when the 5-minute clock bucket changes, checked every 10 seconds. Below the phrase, an optional stats panel shows live CPU, GPU, memory, and paging file usage as horizontal bars with percentage text, with a user-selectable update rate (1s/3s/10s). Users can drag the widget anywhere on any monitor, choose a comfortable font size, toggle overall stats visibility or each row (CPU/GPU/MEM/PAG) independently, and all preferences are saved across restarts.

## Core Value

The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## Current State

**v1.3 shipped: 2026-02-26**

All v1.3 requirements delivered. Per-row visibility toggles human-verified (all 5 behavioral checks passed).

- Stats panel: CPU / GPU / MEM horizontal bars + % text below the time phrase
- Per-row visibility: Show CPU / Show GPU / Show MEM toggles in Stats submenu, auto-collapse when all hidden, persisted
- Update interval: 1s / 3s / 10s via right-click Stats submenu, persisted
- Stats visibility: show/hide toggle via right-click Stats submenu, persisted
- Position persistence: drag to any position, saved immediately, restored on next launch
- Font size: Small (16pt) / Medium (24pt) / Large (32pt) via right-click menu, persisted
- Settings file: `%LOCALAPPDATA%\FuzzyClock\settings.json` (atomic write, exception-safe load)
- 1,056 LOC C# / XAML

## Requirements

### Validated

- ✓ Displays current time as a fuzzy/poetic English phrase (e.g. "just a little after 11", "almost noon", "12 o'clock", "quarter past 3") — v1.0
- ✓ Phrase updates on every 5-minute boundary — v1.0
- ✓ Window is frameless and transparent — text floats directly on the desktop — v1.0
- ✓ Window is always-on-top — v1.0
- ✓ Written in C# (WPF) — v1.0
- ✓ User can drag widget to any position on the desktop (WIN-04) — v1.1
- ✓ Widget position restored on startup, clamped if off-screen (WIN-05) — v1.1
- ✓ User can change font size (16/24/32pt) via right-click menu; current size shown as checked (DISP-05) — v1.1
- ✓ Font size selection persists across restarts (DISP-06) — v1.1
- ✓ Stats panel shows CPU, GPU, and memory usage below the time phrase (STAT-01) — v1.2
- ✓ Each stat displays as a horizontal bar + percentage text (STAT-02) — v1.2
- ✓ Update interval (1s / 3s / 10s) is user-selectable via right-click Stats submenu (STAT-03) — v1.2
- ✓ Stats panel visibility is user-toggleable via right-click Stats submenu (STAT-04) — v1.2
- ✓ Stats visibility and update interval persist to settings.json and restore on launch (STAT-05) — v1.2
- ✓ User can toggle CPU row visibility via right-click Stats submenu; checkmark reflects current state (STAT-06) — v1.3
- ✓ User can toggle GPU row visibility via right-click Stats submenu; checkmark reflects current state (STAT-07) — v1.3
- ✓ User can toggle MEM row visibility via right-click Stats submenu; checkmark reflects current state (STAT-08) — v1.3
- ✓ Hiding all three stat rows auto-collapses the stats panel (one-way trigger) (STAT-09) — v1.3
- ✓ Individual stat row visibility (CPU/GPU/MEM) persists to settings.json and restores on launch (STAT-10) — v1.3

### Active (v1.4)

- [ ] STAT-11: PAG row appears in stats panel below MEM row, showing % paging file usage as horizontal bar + percentage text
- [ ] STAT-12: User can toggle PAG row visibility via right-click Stats submenu; checkmark reflects actual PAG row state each time menu opens
- [ ] STAT-13: Hiding all four stat rows (CPU/GPU/MEM/PAG) auto-collapses the stats panel
- [ ] STAT-14: PAG row visibility persists to settings.json and restores on launch
- [ ] STAT-15: When paging file is disabled or unavailable, PAG row shows "N/A" with no exception thrown

### Deferred (v2+)

- STRT-01: Auto-launch on Windows login (registry key)
- WIN-06: Widget position persists per monitor (multi-monitor identity via screen handle)
- WIN-07: Widget snaps to screen edges when dragged near them

### Out of Scope

- System tray icon / settings UI — keep it simple
- 24-hour format — natural English implies 12-hour
- Click-through / no interaction — incompatible with drag (kills DragMove() event delivery)
- Arbitrary font size input — 3-step ladder is sufficient
- Font family selector — single clean font (Segoe UI Light) is part of the design
- Reset all stats to visible via Show Stats — individual toggles are independent; simpler model

## Context

- Target: Windows desktop, personal use
- UI framework: WPF (best support for transparent/compositing windows on Windows)
- Phrasing style: fuzzy and poetic rather than strictly "quarter past / quarter to"
- 5-minute buckets: 12 distinct slots per hour, each maps to a phrase
- Settings: `%LOCALAPPDATA%\FuzzyClock\settings.json` — per-user non-roaming, always writable

## Constraints

- **Tech stack**: C# / WPF — Windows only
- **Simplicity**: Single window, no settings screens, no installer complexity

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WPF over WinForms | Better transparency/compositing for frameless overlay | ✓ Validated — AllowsTransparency + WindowStyle=None delivers pixel-perfect transparent float |
| 5-minute update cadence | Phrase vocabulary aligns to 5-min buckets; avoids constant changes | ✓ Validated — 10s poll, change-only update; phrase snaps cleanly at boundaries |
| Fuzzy phrasing over exact | More interesting and readable than "11:07" | ✓ Validated — natural English feels right; noon/midnight special cases add polish |
| dotnet 10 .slnx format | SDK generates XML solution format (.slnx) instead of .sln | ✓ Validated — all build/test/run commands work identically |
| Hidden ToolWindow owner | ShowInTaskbar=False alone does not suppress Alt+Tab entry | ✓ Validated — hidden owner with WindowStyle=ToolWindow fully suppresses taskbar and Alt+Tab |
| Manual offset TextBlock shadow | GPU rendering path disabled for layered HWNDs in .NET 10; DropShadowEffect silently fails | ✓ Validated — offset dark TextBlock (X=2 Y=2) renders reliably; visually effective |
| UpdateLayout() before PositionTopRight() | SizeToContent ActualWidth is stale until layout pass runs after text change | ✓ Validated — calling UpdateLayout() first ensures correct right-anchor position |
| SetInitialPhrase before Show() | First rendered frame must show live phrase, not placeholder | ✓ Validated — no flash; phrase visible from the very first frame |
| Border backdrop #26000000 | 15% black alpha: readable on light wallpapers without obscuring desktop | ✓ Validated — semi-transparent dark backdrop works on both light and dark wallpapers |
| Left=-1 sentinel for no-saved-position | Avoids separate bool HasSavedPosition field; flows naturally through ApplySettings() | ✓ Validated — clean pattern, zero ambiguity |
| System.Text.Json (in-box .NET 10) | No NuGet cost; handles plain positional records natively | ✓ Validated — serialize/deserialize AppSettings record with zero attributes |
| VirtualScreen* over PrimaryScreenWidth | Covers all monitors including negative-offset left-of-primary monitors | ✓ Validated — correct clamping on multi-monitor setups |
| Atomic Save via temp + File.Move(overwrite:true) | Prevents corrupt settings.json on mid-write crash | ✓ Validated — atomic on same NTFS volume |
| ApplySettings() before Show() | Setting Left/Top in constructor can be silently reset by XAML parser; before Show() is safe | ✓ Validated — reliable position assignment |
| SessionEnding backup save handler | Window.Closing not raised on Windows log-off/shutdown | ✓ Validated — belt-and-suspenders save path |
| ContentRendered for startup clamp | ActualWidth/ActualHeight are 0 until first layout pass with SizeToContent=WidthAndHeight | ✓ Validated — only safe deferral point |
| _hasUserPosition snap guard | Prevents 5-min phrase-boundary phrase changes from snapping widget to top-right | ✓ Validated — set via LocationChanged; fires reliably after DragMove() |
| Re-clamp after every phrase change | SizeToContent=WidthAndHeight resizes window on phrase update; near-edge positions shift off-screen | ✓ Validated — clamp in UpdatePhraseIfChanged() else branch fixes edge case |
| ContextMenu_Opened for IsChecked sync | WPF toggles IsChecked on click when IsCheckable=True; sync in Opened avoids double-toggle | ✓ Validated — single sync point; click handlers never touch IsChecked |
| ApplyFontSize() separate from ApplySettings() | ApplyFontSize() calls UpdateLayout()+SaveSettings() which are unsafe before Show() | ✓ Validated — startup safety invariant preserved |
| AppSettings → init-property record | Positional record breaks JSON partial-deserialization on old settings.json; init-property enables safe forward/backward compat | ✓ Validated — v1.1 settings.json loads correctly with new fields defaulting |
| StatsIntervalSeconds <= 0 guard in Load() | Zero-interval DispatcherTimer throws; corrupted settings.json could write 0 | ✓ Validated — clamped to default (3) on load |
| PDH PerformanceCounter for stats | Native Windows, available in-box; PDH vs WMI: 10–50x faster for identical data | ✓ Validated — CPU/MEM reliable; GPU `engtype_3D` filter works on development machine |
| _gpuAvailable fallback | GPU Engine PDH category absent on VMs/RDP; fallback to -1 sentinel → "N/A" display | ✓ Validated — clean fallback; no exceptions in VM environments |
| StatsBarTrackWidth geometry constant | `CpuBarTrack.ActualWidth` returns 0 while StatsPanel is Collapsed; `180-35-36=109` constant is always correct | ✓ Validated — fixed zero-width bar bug; bars immediately visible on first show |
| Two independent DispatcherTimers | Phrase timer (10s, fixed) and stats timer (1s/3s/10s, configurable) must never share an interval | ✓ Validated — independent timers; interval changes don't affect phrase updates |
| SetStatsVisible() separate from ApplySettings() | SetStatsVisible() calls UpdateLayout()+Clamp() — unsafe before Show() where ActualHeight=0 | ✓ Validated — ApplySettings() sets Visibility directly; ContentRendered owns timer start |
| Stop+set+Start for interval change | Updating DispatcherTimer.Interval on running timer only takes effect after current interval expires | ✓ Validated — immediate effect on interval change |
| Click handlers read row Visibility (not IsChecked) | WPF IsCheckable auto-toggles IsChecked before handler fires; Visibility is always correct state | ✓ Validated — same pattern as MenuShowStats_Click; reliable toggle direction |
| Visibility.Collapsed (not Hidden) for hidden rows | Hidden preserves layout space in StackPanel, leaving visible vertical gap; Collapsed collapses entirely | ✓ Validated — no layout gap on hidden rows |
| Auto-collapse is one-directional | Hiding last row collapses panel; showing a row does NOT auto-show panel — user controls panel via Show Stats | ✓ Validated — simpler model; no "Reset all stats" needed |
| SetStatRowVisible() separate from ApplySettings() | SetStatRowVisible() calls UpdateLayout()+Clamp() — unsafe before Show() where ActualHeight=0 | ✓ Validated — ApplySettings() sets row Visibility directly; startup safety invariant preserved |

---
*Last updated: 2026-02-26 after v1.4 milestone start*
