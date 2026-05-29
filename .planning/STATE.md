---
gsd_state_version: 1.0
milestone: v4.5
milestone_name: Update Checker
status: planning
stopped_at: Roadmap created — Phase 88 ready to plan
last_updated: "2026-05-29T03:00:16.945Z"
last_activity: 2026-05-29 — ROADMAP.md created; 34/34 requirements mapped to Phase 88
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
  percent: 25
---

# Project State: FuzzyStatsClock

**Status:** Plan 88-01 complete — ready to execute Plan 88-02
**Last updated:** 2026-05-29

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-29)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v4.5 Update Checker — Phase 88 in progress (1/4 plans done)

## Current Position

Phase: 88 of 88 (GitHub Releases Update Checker)
Plan: 1 of 4 complete (next: 88-02)
Status: In progress
Last activity: 2026-05-29 — Plan 88-01 shipped UpdateVersionComparer (UPD-01, UPD-02)

Progress: [██░░░░░░░░] 25%

## Current Milestone

**v4.5 Update Checker** — In progress (ready to plan Phase 88)

**Single-phase milestone** (research-confirmed by all 4 researchers — STACK / FEATURES / ARCHITECTURE / PITFALLS converged on single-phase recommendation). Build order forced by C# project references (Core → App → tests → UI); 4 internal plans provide the natural seams.

**Requirements coverage:** 34/34 v1 requirements mapped to Phase 88 ✓
- UPD (10) — version comparer + service + dispose + #if DEBUG + hard-coded URL
- UI (8) — UpdateText TextBlock + Phase 33 dual-path + re-clamp + dispatcher marshalling
- PERS (12) — AppSettings field + Settings checkbox + reset + mid-session toggle behavior
- DEV (3) — csproj version sync + canonical version source + DEBUG skip test
- DOCS (1) — README mention

## Recent Milestone

**v4.4 Smooth Ghost Fade Under Load** — Shipped 2026-05-21

- 3 phases (85–87), 8 plans
- 587 MSTest passing (449 Core + 138 App)
- 18/18 requirements validated
- Tag: v4.4

## Accumulated Context

### Decisions

Plan 88-01 decisions (2026-05-29):

- **Explicit `Normalize()` helper for `IsNewer`** — RESEARCH.md §1's lifted skeleton (`return latest > running;`) failed Test 20: System.Version's operator> treats `Build=-1` (absent) as strictly less than `Build=0`, so `Version("4.5.0") > Version("4.5")` is true, contradicting the plan's `must_haves.truths` invariant `'4.5' == '4.5.0' == '4.5.0.0'`. Resolution: private `Normalize(Version)` that promotes `-1` components to `0` before comparison. 8 extra lines, zero new dependencies.

Recent roadmap-level decisions (2026-05-29):

- **Single-phase milestone** — All 4 research files (STACK, FEATURES, ARCHITECTURE, PITFALLS) converged on single phase with HIGH confidence. Build order is forced by C# project references; whole feature is smaller than any single v4.4 phase. Plan-level seams provide natural boundaries.
- **4 plans inside Phase 88** — Plan-01 (Core helper) → Plan-02 (Service + Settings + csproj) → Plan-03 (UI wiring + dispose) → Plan-04 (human-verify + README). Plans 1-3 enforced by project-reference order; Plan-04 separated so live-network smoke test can run on a tagged production build.
- **`= true` init default on `UpdateChecksEnabled`** — Mandatory; bool fields absent from old settings.json deserialize as false, would silently opt-out v4.4 users. Mirrors UptimeVisible / GhostModeEnabled / UseCtrl precedent.
- **`#if DEBUG return null;` at top of `CheckAsync`** — Prevents dev-box screenshots showing nonsensical "v4.4.0 available" against the live GitHub API.

Full decision log lives in PROJECT.md.

### Pending Todos

- v4.4 PERF-01 carry-forward: occasional brief freeze during fade under sustained 25–50% CPU load — confirmed OUT of v4.5 scope (v4.5 doesn't touch the fade-render path); deferred to v4.6+ as PERF-FOLLOW-01 in REQUIREMENTS.md v2 section.
- Pre-existing `PhraseEngineTests.SpecialCases_NoonAndMidnight(12,0,"noon")` flake — per project memory, fixed in v4.5.0 (commit `62ccf6e`); confirm during plan-phase that no follow-up is needed.

### Blockers/Concerns

None

## Session Continuity

**Next action:** Run `/gsd:execute-phase 88` to execute Plan 88-02 (UpdateCheckService).

**When returning:**

1. Read this STATE.md and `.planning/ROADMAP.md` for current position
2. Plan 88-02 is the next plan to execute (App-layer service + Settings + csproj version sync)
3. UpdateVersionComparer.TryParseTag / IsNewer are stable and tested — consume via `using FuzzyClock.Core;`

**Recent milestones:**

- v4.4 Smooth Ghost Fade Under Load — shipped 2026-05-21 (587 tests, 18/18 requirements)
- v4.3 Configurable Ghost Override — shipped 2026-05-07 (574 tests, 22/22 requirements)
- v4.2 Temps & Menu — shipped 2026-05-04 (562 tests, MPL-2.0 compliance)

**Last session:** 2026-05-29
**Stopped at:** Completed 88-01-PLAN.md — UpdateVersionComparer shipped
**Resume file:** None
**Blockers:** None

---
*State updated: 2026-05-29 — Plan 88-01 complete (UPD-01, UPD-02 done); 469/469 Core tests pass; ready to execute 88-02*
