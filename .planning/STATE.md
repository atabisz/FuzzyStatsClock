# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03 — v2.6 Polish roadmap created)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v2.6 Polish — Phase 32: Per-Monitor Position

## Current Position

Phase: 32 of 33 (Per-Monitor Position)
Plan: 1 of 3 in current phase
Status: Phase 32 in progress — Plan 01 complete (MonitorService + AppSettings schema)
Last activity: 2026-03-03 — Phase 32 Plan 01 complete (32-01-PLAN.md)

Progress: [███░░░░░░░] 33% (v2.6 phases — 1/3 phases complete; Phase 32 in progress)

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
- [Phase 32-01]: Monitor keys = lowercased friendly names via QueryDisplayConfig; GDI fallback (e.g. "display1") when unavailable; duplicate names get -2/-3 suffixes by Screen.AllScreens order
- [Phase 32-01]: MonitorPositions Dictionary<string, MonitorPosition> replaces flat Left/Top in AppSettings; LastActiveMonitor="" is "no saved monitor" sentinel

### Pending Todos

None.

### Blockers/Concerns

- Phase 32 (per-monitor position): Plan 01 complete. MonitorService and AppSettings schema done. SettingsService and MainWindow have expected compile errors to be fixed in Plans 02 and 03.
- Phase 33 (auto-contrast): Screen color sampling under a transparent WPF window requires capturing the desktop bitmap behind the widget. BitBlt from desktop DC into a 1x1 or small sample region is the likely approach. WCAG relative luminance formula must be applied correctly (linearize sRGB values before computing ratio).

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 32-per-monitor-position-memory 32-01-PLAN.md
Resume file: None
Next action: Execute 32-02-PLAN.md
