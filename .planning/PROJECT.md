# Fuzzy Clock

## What This Is

A minimal C# WPF desktop widget that displays the current time as a fuzzy, natural-English phrase — "just a little after 11", "almost noon", "quarter past 3". It floats on the desktop as a transparent, frameless, always-on-top overlay with no background box. The phrase refreshes when the 5-minute clock bucket changes, checked every 10 seconds.

## Core Value

The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## Current State

**v1.0 shipped: 2026-02-25**

All v1 requirements delivered across 3 phases. Widget running, human-verified.

- Phrase engine: 12 buckets/hour, noon/midnight special cases, 51 passing unit tests
- Window: transparent frameless overlay, always-on-top, no taskbar, right-click close
- Integration: correct phrase from first frame, auto-updates at each 5-min boundary, legible on any wallpaper

## Requirements

### Validated (v1.0)

- [x] Displays current time as a fuzzy/poetic English phrase (e.g. "just a little after 11", "almost noon", "12 o'clock", "quarter past 3")
- [x] Phrase updates on every 5-minute boundary
- [x] Window is frameless and transparent — text floats directly on the desktop
- [x] Window is always-on-top
- [x] Written in C# (WPF)

### Out of Scope

- System tray icon / settings UI — keep it simple
- 24-hour format — natural English implies 12-hour
- Click-through / no interaction — user may need to move the widget

### Deferred (v2+)

- WIN-04: Drag to reposition on the desktop
- WIN-05: Persist window position across restarts (DPI/multi-monitor safe)
- STRT-01: Auto-launch on Windows login (registry key)

## Context

- Target: Windows desktop, personal use
- UI framework: WPF (best support for transparent/compositing windows on Windows)
- Phrasing style: fuzzy and poetic rather than strictly "quarter past / quarter to" — uses natural approximations for in-between minutes
- 5-minute buckets: 12 distinct slots per hour, each maps to a phrase

## Constraints

- **Tech stack**: C# / WPF — Windows only
- **Simplicity**: Single window, no settings screens, no installer complexity

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WPF over WinForms | Better transparency/compositing for frameless overlay | Validated — AllowsTransparency + WindowStyle=None delivers pixel-perfect transparent float |
| 5-minute update cadence | Phrase vocabulary aligns to 5-min buckets; avoids constant changes | Validated — 10s poll, change-only update; phrase snaps cleanly at boundaries |
| Fuzzy phrasing over exact | More interesting and readable than "11:07" | Validated — natural English feels right; noon/midnight special cases add polish |
| dotnet 10 .slnx format | SDK generates XML solution format (.slnx) instead of .sln | Validated — all build/test/run commands work identically |
| Hidden ToolWindow owner | ShowInTaskbar=False alone does not suppress Alt+Tab entry | Validated — hidden owner with WindowStyle=ToolWindow fully suppresses taskbar and Alt+Tab |
| Manual offset TextBlock shadow | GPU rendering path disabled for layered HWNDs in .NET 10; DropShadowEffect silently fails | Validated — offset dark TextBlock (X=2 Y=2) renders reliably; visually effective |
| UpdateLayout() before PositionTopRight() | SizeToContent ActualWidth is stale until layout pass runs after text change | Validated — calling UpdateLayout() first ensures correct right-anchor position |
| SetInitialPhrase before Show() | First rendered frame must show live phrase, not placeholder | Validated — no flash; phrase visible from the very first frame |
| Border backdrop #26000000 | 15% black alpha: readable on light wallpapers without obscuring desktop | Validated — semi-transparent dark backdrop works on both light and dark wallpapers |

---
*Last updated: 2026-02-25 after v1.0 milestone completion*
