# Fuzzy Clock

## What This Is

A minimal C# WPF desktop widget that displays the current time as a fuzzy, natural-English phrase — "just a little after 11", "almost noon", "quarter past 3". It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box. The phrase refreshes when the 5-minute clock bucket changes, checked every 10 seconds. Users can drag the widget anywhere on any monitor, choose a comfortable font size, and both preferences are saved across restarts.

## Core Value

The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## Current Milestone: v1.2 System Stats

**Goal:** The widget shows live CPU, GPU, and memory usage below the time phrase, with user-selectable update rate and toggle visibility, all persisted across restarts.

**Target features:**
- Stats panel (CPU / GPU / MEM horizontal bars + % text) below the time phrase
- Update interval selector (1s / 3s / 10s) in right-click Stats submenu
- Show/Hide stats toggle in right-click Stats submenu
- Settings persisted to existing settings.json

## Current State

**v1.1 shipped: 2026-02-25**

All v1.1 requirements delivered. Widget running, human-verified.

- Position persistence: drag to any position, saved immediately, restored on next launch with full-window clamping to visible area
- Font size: Small (16pt) / Medium (24pt) / Large (32pt) via right-click menu, persisted to same JSON file as position
- Settings file: `%LOCALAPPDATA%\FuzzyClock\settings.json` (atomic write, exception-safe load)
- 582 LOC C# / 67 LOC XAML

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

### Active (v1.2)

- [ ] Stats panel shows CPU, GPU, and memory usage below the time phrase (STAT-01)
- [ ] Each stat displays as a horizontal bar + percentage text (STAT-02)
- [ ] Update interval (1s / 3s / 10s) is user-selectable via right-click submenu (STAT-03)
- [ ] Stats panel visibility (show/hide) is user-toggleable via right-click submenu (STAT-04)
- [ ] Stats visibility and update interval are persisted to settings.json and restored on launch (STAT-05)

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

---
*Last updated: 2026-02-25 after v1.2 milestone started*
