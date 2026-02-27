# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27 after v2.1 milestone started)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v2.1 Uptime

## Current Position

Phase: 22 — Infrastructure and Toggle
Plan: 22-01 COMPLETE — Phase 22 complete (1/1 plans done)
Status: Phase 22 complete; ready for Phase 23
Last activity: 2026-02-27 — Phase 22 Plan 22-01 executed (UptimeRow infrastructure + toggle)

Progress: [█████░░░░░] 50% (v2.1: 1/2 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 21 (v1.0 through v1.9)
- Average duration: 2.8 min
- Total execution time: 56 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Phrase Engine | 2 | 4 min | 2 min |
| 2. Window Shell | 3 | 3 min | 1 min |
| 3. Integration | 2 | 7 min | 3.5 min |
| 4. Settings + Drag | 2 | 12 min | 6 min |
| 5. Font Size | 1 | 2 min | 2 min |
| 6. AppSettings Migration | 1 | 2 min | 2 min |
| 7. Stats Data Layer | 1 | 3 min | 3 min |
| 8. XAML Layout and Stats Display | 2 | 8 min | 4 min |
| 9. Controls Persistence and Edge Cases | 1 | 15 min | 15 min |
| 11. PAG Stat Row | 2 | 3 min | 1.5 min |
| 12. Hover Fast-Refresh | 1 | 2 min | 2 min |
| 13. Dial Mode | 2 | 8 min | 4 min |
| 14. Hover Backdrop + Drag Pause | 1 | 5 min | 5 min |
| 15. Unconditional Hover Backdrop | 1 | 5 min | 5 min |
| 16. Dial Face Decorations | 2 | 4 min | 2 min |
| 17. Context-Aware Font Size Menu | 2 | 2 min | 1 min |
| 18. AppSettings Schema Extension | 1 | 1 min | 1 min |
| 19. Window Opacity | 2 | 2 min | 1 min |
| 20. Accent Color Presets | 2 | 2 min | 1 min |
| 21. Custom Color Picker | 2 | 1 min | 0.5 min |
| 22. Infrastructure and Toggle | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 21-01 (1 min), 21-02 (0 min), 22-01 (2 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. All v2.0 decisions added.

### v2.1 Architectural Constraints (from research)

- UptimeRow is a sibling of StatsPanel in the XAML Grid (Row 2), not a child — ensures independent visibility control
- ApplySettings() sets UptimeRow.Visibility directly (never via SetUptimeRowVisible()) — pre-Show() safety invariant
- UptimeVisible init default = true — bool JSON-deserializes as false when absent from old settings.json; must be explicit
- Rolling averages use Queue<float> trimmed to window size on each tick; window = ceil(windowSeconds / _statsIntervalSeconds)
- Skip buffer push during hover fast-refresh ticks (_isHoverFastRefresh flag or equivalent) — prevents window size corruption
- Guard buffer push with _statsService.IsReady — prevents cold-start zeros (StatsService takes ~6s to initialize)
- StatsService.IsReady property needed: exposes _initialized as public bool; one-line addition to StatsService.cs
- Use Environment.TickCount64 (Int64, milliseconds) — never Environment.TickCount (Int32, wraps at 24.9 days)
- UpdateUptimeDisplay() called at end of _statsTimer.Tick, after _statsService.Refresh() — no second Refresh call needed

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-27
Stopped at: Completed 22-01-PLAN.md (UptimeRow infrastructure + toggle — build 0 errors)
Resume file: None
Next action: `/gsd:execute-phase 23`
