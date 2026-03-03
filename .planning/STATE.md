# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03 — v2.6 archived)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v2.7 Auto-Contrast — Phase 33 (Plan 01 complete)

## Current Position

Phase: 33 of 33 (Auto-Contrast)
Plan: 1 of ? in current phase
Status: v2.7 in progress — Phase 33 Plan 01 (ContrastService TDD) complete
Last activity: 2026-03-03 — Phase 33 Plan 01 executed (ContrastService + tests)

Progress: [█░░░░░░░░░] ~10% (v2.7 Phase 33 — 1/? plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 37 (v1.0 through v2.7 Phase 33 Plan 01)
- v2.6 duration: Phase 31 ~3 min (1 plan), Phase 32 ~15 min (3 plans)
- Phase 33 Plan 01: ~4 min (2 tasks, TDD)

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
- [Phase 33 Plan 01]: RgbColor readonly record struct is the WPF-free color type for ContrastService; MainWindow converts System.Windows.Media.Color to RgbColor at call site
- [Phase 33 Plan 01]: ContrastService is internal; InternalsVisibleTo via AssemblyAttribute MSBuild item exposes it to Core.Tests; RgbColor and ContrastState are public for App project access
- [Phase 33 Plan 01]: MSTest 4 IsGreaterThanOrEqualTo(lowerBound, value) — lowerBound is first arg, value is second (checks value >= lowerBound)
- [Phase 33 Plan 01]: Hysteresis: enter override at ratio < 4.5, exit only at ratio > 5.5; AdjustAccent steps HSL lightness by 5 units up to ±40 max

### Pending Todos

None.

### Blockers/Concerns

None — ContrastService pure math is complete. Next plan implements screen sampling and MainWindow wiring.

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 33-auto-contrast 33-01-PLAN.md
Resume file: None
Next action: Execute Plan 02 (screen color sampling + MainWindow wiring + tray toggle)
