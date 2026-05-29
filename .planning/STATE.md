---
gsd_state_version: 1.0
milestone: v4.5
milestone_name: Update Checker
status: in-progress
stopped_at: Plan 88-02 complete — ready to execute Plan 88-03 (UI wiring)
last_updated: "2026-05-29T03:13:00.000Z"
last_activity: 2026-05-29 — Plan 88-02 shipped UpdateCheckService + AppSettings.UpdateChecksEnabled + csproj sync
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 4
  completed_plans: 2
  percent: 50
---

# Project State: FuzzyStatsClock

**Status:** Plan 88-02 complete — ready to execute Plan 88-03
**Last updated:** 2026-05-29

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-29)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v4.5 Update Checker — Phase 88 in progress (2/4 plans done)

## Current Position

Phase: 88 of 88 (GitHub Releases Update Checker)
Plan: 2 of 4 complete (next: 88-03)
Status: In progress
Last activity: 2026-05-29 — Plan 88-02 shipped UpdateCheckService (UPD-03..10, PERS-01..05, DEV-01..03)

Progress: [█████░░░░░] 50%

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

Plan 88-02 decisions (2026-05-29):

- **UpdateCheckService placed at FuzzyClock.App/ flat root, NOT under Services/** — preserves existing convention (TemperatureService, ContrastSamplerService, AutoLaunchService, SettingsService all sit at App project root). RESEARCH.md §Project Structure marked this Claude's Discretion.
- **Test ctor uses `disposeHandler: false` + `_ownsClient = true`** — fake handler not disposed by HttpClient; per-instance HttpClient wrapper IS disposed by the service. Lets test code share a single FakeHttpMessageHandler across multiple service instances if needed.
- **Six narrow catches in fixed verbatim order** — TaskCanceledException listed BEFORE its base OperationCanceledException because C# exception-handler-walk takes the first matching handler; reordering would dead-code the more-derived catch.
- **Production-source files normalized to LF before staging** — repo's git index stores LF for `.cs`/`.csproj` files (verified via `git ls-files --eol`). Edit tool emits LF, but on-disk files are CRLF (autocrlf inert), causing massive diff inflation when staged. Used `dos2unix` to align working-tree with index storage. CSproj BOM preserved via Python recipe to keep edit strictly the version literal.
- **AppSettings.UpdateChecksEnabled = true explicit init default** — mandatory upgrade-safety pattern (mirrors UptimeVisible, GhostModeEnabled, UseCtrl). v4.4 users upgrading deserialize old settings.json (no UpdateChecksEnabled key) → JSON decoder applies init default of true → opt-IN by default per the locked decision.

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

**Next action:** Run `/gsd:execute-phase 88` to execute Plan 88-03 (UI wiring + dispose tiers).

**When returning:**

1. Read this STATE.md and `.planning/ROADMAP.md` for current position
2. Plan 88-03 is the next plan to execute (UI wiring: UpdateText TextBlock, ContentRendered kickoff, Phase 33 dual-path foreground, three-tier dispose, Settings checkbox, ResetToDefaults)
3. UpdateCheckService is stable and tested — consume via `_updateService = new UpdateCheckService();` then `await _updateService.CheckAsync()` returning `Task<Version?>`. Public surface: `RepoUrl` const, two ctors, `CheckAsync`, `CancelInFlight`, `Dispose` (idempotent)
4. AppSettings.UpdateChecksEnabled is queryable at launch (default = true)
5. UpdateVersionComparer.TryParseTag / IsNewer remain stable from 88-01 — consume via `using FuzzyClock.Core;`

**Recent milestones:**

- v4.4 Smooth Ghost Fade Under Load — shipped 2026-05-21 (587 tests, 18/18 requirements)
- v4.3 Configurable Ghost Override — shipped 2026-05-07 (574 tests, 22/22 requirements)
- v4.2 Temps & Menu — shipped 2026-05-04 (562 tests, MPL-2.0 compliance)

**Last session:** 2026-05-29
**Stopped at:** Completed 88-02-PLAN.md — UpdateCheckService + AppSettings.UpdateChecksEnabled + csproj sync shipped
**Resume file:** None
**Blockers:** None

---
*State updated: 2026-05-29 — Plan 88-02 complete (UPD-03..10, PERS-01..05, DEV-01..03 done); 469 Core + 152 App = 621 tests pass; ready to execute 88-03*
