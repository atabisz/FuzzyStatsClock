---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Proximity Ghost Mode
status: Defining requirements
stopped_at: Requirements phase
last_updated: "2026-03-27"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v4.0 Proximity Ghost Mode — widget fades as cursor approaches

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-27 — Milestone v4.0 started

## Accumulated Context

- Ghost mode currently uses a 75ms DispatcherTimer polling `GetCursorPos`+`GetWindowRect` for restore detection — the proximity fade can reuse this same timer
- `_ghostModeEnabled` tray toggle must gate proximity fade (fade only when ghost is on)
- `GetAsyncKeyState(VK_LCONTROL) & GetAsyncKeyState(VK_LMENU)` Ctrl+Alt check must also apply to proximity zone entry
- Widget configured opacity is stored in `_opacity` / `AppSettings.Opacity` — proximity fade must not overwrite this; need separate "display opacity" vs "configured opacity" concept
- WS_EX_TRANSPARENT should only be applied when opacity reaches 0 (full ghost), not during the fade
- 395 MSTest tests passing (357 Core + 38 App) at milestone start
