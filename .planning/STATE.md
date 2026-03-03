# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03 — v2.6 Polish roadmap created)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v2.6 Polish — Phase 32: Per-Monitor Position

## Current Position

Phase: 32 of 33 (Per-Monitor Position)
Plan: 0 of ? in current phase
Status: Phase 31 complete — ready to plan Phase 32
Last activity: 2026-03-03 — Phase 31 (Auto-Launch at Login) complete (31-01-PLAN.md)

Progress: [███░░░░░░░] 33% (v2.6 phases — 1/3 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 32 (v1.0 through v2.6 Phase 31)
- v2.5 duration: 9 min (3 plans: 5min + 3min + 1min)
- Phase 31 duration: 3 min (1 plan)

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Key patterns relevant to v2.6:
- AppSettings uses init-property record (never positional) — new fields (AutoLaunch, MonitorPositions, AutoContrast) follow the same pattern
- SettingsService atomic write via temp + File.Move — no change needed
- Tray menu items follow the Ghost Mode tray toggle pattern (checkable ToolStripMenuItem, sync state on menu open)
- Per-monitor key: use monitor device name or bounds hash as dictionary key in AppSettings
- [Phase 31-auto-launch-at-login]: AutoLaunchEnabled defaults false; AutoLaunchService static registry helper isolates UI from Win32; ApplySettings restores registry on startup

### Pending Todos

None.

### Blockers/Concerns

- Phase 32 (per-monitor position): AppSettings currently stores a single Left/Top. Per-monitor storage requires a dictionary keyed by monitor identity. Dictionary serialization with System.Text.Json requires string keys — monitor device name (e.g. `\\.\DISPLAY1`) is a natural fit.
- Phase 33 (auto-contrast): Screen color sampling under a transparent WPF window requires capturing the desktop bitmap behind the widget. BitBlt from desktop DC into a 1x1 or small sample region is the likely approach. WCAG relative luminance formula must be applied correctly (linearize sRGB values before computing ratio).

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 31-auto-launch-at-login 31-01-PLAN.md
Resume file: None
Next action: /gsd:plan-phase 32
