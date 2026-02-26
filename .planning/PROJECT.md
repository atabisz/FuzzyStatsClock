# Fuzzy Clock

## What This Is

A minimal C# WPF desktop widget that displays the current time as a fuzzy, natural-English phrase — "just a little after 11", "almost noon", "quarter past 3" — or as a minimal analog dial with hour and minute hands (no face, no numbers). It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box. The phrase/dial refreshes checked every 10 seconds. Below the phrase or dial, an optional stats panel shows live CPU, GPU, memory, and paging file usage as horizontal bars with percentage text, with a user-selectable update rate (1s/3s/10s). Hovering the mouse over the widget accelerates the stats update rate to 0.5s for a quick peek; moving the mouse away restores the configured rate. Users can drag the widget anywhere on any monitor, choose a comfortable font size, toggle overall stats visibility or each row (CPU/GPU/MEM/PAG) independently, switch between phrase and dial mode, and all preferences are saved across restarts.

## Core Value

The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## Current State

**v1.9 shipped: 2026-02-26**

All v1.9 requirements delivered. Font Size submenu context-awareness human-verified.

- Context-aware menus: Font Size submenu hidden in dial mode; Dial Face submenu hidden in phrase mode — right-click menu shows only relevant controls for the active display mode
- ~4,870 LOC C# / XAML
- Drag pause: stat updates freeze during DragMove(), resume immediately on release
- Dial mode: right-click "Dial Mode" toggles between phrase text and minimal analog dial (hour + minute hands, no face); persists
- Hover fast-refresh: mouse over widget → stats update at 0.5s cadence; restores configured rate on leave; no-op when stats hidden
- Stats panel: CPU / GPU / MEM / PAG horizontal bars + % text below the time phrase or dial
- Per-row visibility: Show CPU / Show GPU / Show MEM / Show PAG toggles, auto-collapse when all hidden, persisted
- PAG row: paging file % usage via PDH "Paging File"/"% Usage"/"_Total"; "N/A" when pagefile unavailable
- Update interval: 1s / 3s / 10s via right-click Stats submenu, persisted
- Stats visibility: show/hide toggle via right-click Stats submenu, persisted
- Position persistence: drag to any position, saved immediately, restored on next launch
- Font size: Small (16pt) / Medium (24pt) / Large (32pt) via right-click menu, persisted
- Settings file: `%LOCALAPPDATA%\FuzzyClock\settings.json` (atomic write, exception-safe load)
- ~1,380 LOC C# / XAML

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
- ✓ PAG row appears in stats panel below MEM row, showing % paging file usage as horizontal bar + percentage text (STAT-11) — v1.4
- ✓ User can toggle PAG row visibility via right-click Stats submenu; checkmark reflects actual PAG row state each time menu opens (STAT-12) — v1.4
- ✓ Hiding all four stat rows (CPU/GPU/MEM/PAG) auto-collapses the stats panel (STAT-13) — v1.4
- ✓ PAG row visibility persists to settings.json and restores on launch (STAT-14) — v1.4
- ✓ When paging file is disabled or unavailable, PAG row shows "N/A" with no exception thrown (STAT-15) — v1.4
- ✓ When the mouse enters the widget and the stats panel is visible, the stats refresh rate switches to 0.5s (HVRF-01) — v1.5
- ✓ When the mouse leaves the widget, the stats refresh rate returns to the user's configured interval (1s/3s/10s) (HVRF-02) — v1.5
- ✓ When the stats panel is hidden, mouse hover has no effect on the stats timer (HVRF-03) — v1.5
- ✓ User can switch between phrase mode and dial mode via the right-click context menu (DIAL-01) — v1.6
- ✓ In dial mode, the widget displays hour and minute hands on a transparent background (no face, no circle, no numbers — hands only) (DIAL-02) — v1.6
- ✓ Hands update every minute to accurately reflect the current hour and minute position (DIAL-03) — v1.6
- ✓ The stats panel remains visible below the dial when stats are enabled (DIAL-04) — v1.6
- ✓ The selected clock mode (phrase/dial) persists to settings.json and restores on launch (DIAL-05) — v1.6

### Validated (v1.7)

- ✓ BACK-01: When the stats panel is visible and the mouse is over the widget, a semi-transparent backdrop (~35% black alpha) appears behind the widget — v1.7
- ✓ BACK-02: When the mouse leaves the widget, the backdrop returns to fully transparent — v1.7
- ✓ BACK-03: When the stats panel is hidden, the widget background is always fully transparent regardless of hover state — v1.7 (superseded in v1.8 by BACK-04)
- ✓ DRAG-01: While dragging the widget, stats updates pause; they resume immediately when the drag completes — v1.7

### Validated (v1.8)

- ✓ BACK-04: Widget background becomes semi-transparent (~35% black) on hover regardless of stats panel visibility; always clears on mouse leave — v1.8
- ✓ DIAL-06: In dial mode, user can toggle hour tick marks (12 short lines at hour positions) via right-click submenu; persisted — v1.8
- ✓ DIAL-07: In dial mode, user can toggle minute marks (60 small dots at minute positions) via right-click submenu; persisted — v1.8
- ✓ DIAL-08: In dial mode, user can toggle hour number labels (1–12) at hour positions via right-click submenu; persisted — v1.8
- ✓ DIAL-09: Dial face decoration menu options are hidden when in phrase mode; visible only when dial mode is active — v1.8

### Validated (v1.9)

- ✓ MENU-01: Font Size submenu is hidden from the context menu when dial mode is active; reappears when switching to phrase mode — v1.9

### Active

<!-- Next milestone requirements go here -->

(None — planning next milestone)

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
| 4-param PerformanceCounter for Paging File | "Paging File" is a multi-instance PDH category; 3-param (string,string,bool) constructor throws InvalidOperationException | ✓ Validated — 4-param PerformanceCounter("Paging File","% Usage","_Total",readOnly:true) works correctly |
| No priming for PAG counter | "% Usage" is a ratio counter (PERF_RAW_FRACTION), returns valid data on first NextValue() — unlike CPU/GPU rate counters | ✓ Validated — first read returns accurate value; no priming call needed |
| Double guard for no-pagefile | PerformanceCounterCategory.Exists() may return true even when pagefile is disabled (category registered but no instances); try/catch is the essential guard | ✓ Validated — -1f sentinel correctly set when counter construction fails |
| Window_MouseEnter guard 2 checks !_statsTimer.IsEnabled | Defensive: do not interfere if timer is already stopped when panel is visible | ✓ Validated — correct behavior on panel-visible-but-timer-stopped edge case |
| Window_MouseLeave omits IsEnabled guard | If panel is visible but timer somehow stopped, restoring interval and restarting is still correct | ✓ Validated — correct recovery behavior |
| Hover handlers wire in ContentRendered (not XAML) | _statsTimer must exist before handlers can fire; ContentRendered is after construction; zero XAML changes required | ✓ Validated — no null-timer risk; no XAML touch |
| _statsIntervalSeconds read-only in hover handlers | Source of truth for user's configured rate; hover must not overwrite persistence or interval selector state | ✓ Validated — interval selector checkmarks unchanged after hover cycles |
| DialCanvas in same row 0 as PhraseText | Toggling Visibility.Collapsed/Visible on both elements swaps display mode with zero row restructuring | ✓ Validated — clean toggle; no Grid row insertion or height changes needed |
| No zero-guard for DialMode bool in Load() | Bool false has no dangerous zero-equivalent (unlike StatsIntervalSeconds=0 which spikes the timer) | ✓ Validated — bool field safe without guard; consistent with other bool AppSettings fields |
| ApplySettings() sets DialCanvas Visibility directly (not via SetDialMode) | SetDialMode() calls SaveSettings() — unsafe before Show() where settings are being applied, not changed | ✓ Validated — same pre-Show() safety invariant as StatsPanel and stat rows |
| Existing 10s phrase timer drives UpdateDialDisplay() | Hands only change visually on the minute; 10s polling is sufficient — no second timer needed | ✓ Validated — dial updates correctly at sub-minute poll rate; no extra timer complexity |
| ContentBorder named Border element | Allows code-behind to set Background dynamically without XAML binding or triggers | ✓ Validated — clean code-behind pattern; no XAML binding overhead |
| Alpha 0x59 (35%) for hover backdrop | Visible on both light and dark wallpapers without obscuring desktop content | ✓ Validated — noticeable but unobtrusive on any wallpaper |
| Window_MouseLeave clears backdrop before stats guard | Prevents stale backdrop if stats hidden while mouse is hovering | ✓ Validated — unconditional clear in MouseLeave is the correct invariant |
| Backdrop assignment before StatsPanel guard in MouseEnter | Backdrop is a general hover affordance (not stats-specific); decoupled from stats visibility | ✓ Validated — BACK-04: backdrop always shows on hover regardless of stats state |
| Decoration elements created once, Visibility-toggled | Creating/removing 84 elements per toggle is expensive; create-once-toggle pattern avoids re-layout cost | ✓ Validated — instant toggle response; no layout jitter |
| Decoration defaults false | Preserves minimal Phase 13 dial appearance for existing users when upgrading from v1.6/v1.7 | ✓ Validated — no settings migration needed; new fields JSON-default safely |
| MenuDialFace.Visibility controlled from code-behind only | XAML cannot know startup DialMode state; code-behind in ContextMenu_Opened and SetDialMode always correct | ✓ Validated — submenu correctly hidden/shown on first menu open after any mode switch |
| InitDialDecorations() in ContentRendered after UpdateDialDisplay() | Elements must exist before visibility applied; hand positions set first avoids visual flash | ✓ Validated — correct ordering; no null-element errors; no initial flash |
| MenuFontSize.Visibility inverse of DIAL-09 | Font Size is phrase-mode-only; dial mode has no use for font size since DialCanvas size is fixed | ✓ Validated — MENU-01: dialMode ? Collapsed : Visible; synced in ContextMenu_Opened and SetDialMode |

---
*Last updated: 2026-02-26 after v1.9 milestone*
