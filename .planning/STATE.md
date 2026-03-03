# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03 — v2.6 archived)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v2.7 Auto-Contrast — Phase 33 (not yet planned)

## Current Position

Phase: 33 of 33 (Auto-Contrast)
Plan: 0 of ? in current phase
Status: v2.6 SHIPPED — Phase 33 is first phase of v2.7; no plans created yet
Last activity: 2026-03-03 — v2.6 milestone archived (phases 31–32 complete)

Progress: [██████████] 100% (v2.6 phases — 2/2 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 36 (v1.0 through v2.6 Phase 32)
- v2.6 duration: Phase 31 ~3 min (1 plan), Phase 32 ~15 min (3 plans)

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Key patterns relevant to v2.7:
- AppSettings uses init-property record (never positional) — new field (AutoContrastEnabled) follows the same pattern
- SettingsService atomic write via temp + File.Move — no change needed
- Tray menu items follow the Ghost Mode / Auto-Launch tray toggle pattern (checkable ToolStripMenuItem, sync state on menu Opening event)
- Screen color sampling: BitBlt from desktop DC into small bitmap under widget footprint is the expected Win32 approach; WCAG relative luminance formula must linearize sRGB before computing ratio
- [Phase 31]: AutoLaunchEnabled defaults false; AutoLaunchService static registry helper isolates UI from Win32; ApplySettings restores registry on startup
- [Phase 32]: Monitor keys = lowercased friendly names via QueryDisplayConfig; GDI fallback when unavailable; duplicate names get -2/-3 suffixes by Screen.AllScreens order
- [Phase 32]: MonitorPositions Dictionary<string, MonitorPosition> + LastActiveMonitor=""; Clamp(MonitorPosition,...) uses screen.WorkingArea
- [Phase 32]: _settings field cached in ApplySettings for SaveSettings with-expression; cross-monitor drag clears source entry before writing destination

### Pending Todos

None.

### Blockers/Concerns

- Phase 33 (auto-contrast): Screen color sampling under a transparent WPF window requires capturing the desktop bitmap behind the widget. BitBlt from desktop DC into a 1×1 or small sample region is the likely approach. WCAG relative luminance formula must be applied correctly (linearize sRGB values before computing ratio). No UI needed — tray toggle only.

## Session Continuity

Last session: 2026-03-03
Stopped at: v2.6 milestone archived
Resume file: None
Next action: `/gsd:new-milestone` or `/gsd:discuss-phase 33` to start v2.7 planning
