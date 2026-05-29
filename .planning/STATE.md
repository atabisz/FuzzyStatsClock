---
gsd_state_version: 1.0
milestone: v4.5
milestone_name: Update Checker
status: completed
stopped_at: Completed 88-03-PLAN.md — UpdateText UI + Settings checkbox + three-tier dispose wired (commit e7ea49c)
last_updated: "2026-05-29T08:01:35.247Z"
last_activity: 2026-05-29 — Plan 88-03 wired UpdateText UI + Settings checkbox + three-tier dispose (UI-01..08, PERS-06..12)
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# Project State: FuzzyStatsClock

**Status:** v4.5 Update Checker COMPLETE — Phase 88 closed; ready for /gsd:audit-milestone + /gsd:complete-milestone (tag v4.5)
**Last updated:** 2026-05-29

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-29)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v4.5 Update Checker — COMPLETE (Phase 88 closed; ready for milestone audit + tag v4.5)

## Current Position

Phase: 88 of 88 (GitHub Releases Update Checker) — COMPLETE
Plan: 4 of 4 complete (DOCS-01 shipped; human-verify approved with D + G deferred to v4.5.0 tag push)
Status: Milestone complete — ready for /gsd:audit-milestone
Last activity: 2026-05-29 — Plan 88-04 closed v4.5 milestone (DOCS-01 README mention + static-grep verification)

Progress: [██████████] 100%

## Current Milestone

**v4.5 Update Checker** — COMPLETE (Phase 88 closed 2026-05-29; ready for tag push)

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

Plan 88-04 decisions (2026-05-29):

- **Approve without running the live human-verify checklist** — User opted to ship Phase 88 on static-grep evidence. Categories A/B/C/E/F/H approved on code-shape verification (Phase 33 dual-path = exactly 2 occurrences in MainWindow.xaml.cs; narrow 6-exception catch list verbatim with zero `catch (Exception)` in UpdateCheckService.cs; three-tier dispose registered 1+2 sites; <InformationalVersion>4.5.0 synced; RepoUrl const exact; 621 tests green).
- **Categories D + G deferred to v4.5.0 tag push** — Category D (mid-session toggle OFF cancels in-flight CTS) requires RELEASE build to defeat `#if DEBUG return null;` short-circuit. Category G (SmartScreen / Defender first outbound HTTPS) requires fresh published exe on stock-Defender Windows. Both behaviors are observable only after `git tag v4.5.0 && git push --tags` triggers the release pipeline.

Plan 88-03 decisions (2026-05-29):

- **Service constructed unconditionally; kickoff conditionally (PERS-12)** — `_updateService = new UpdateCheckService();` runs in ContentRendered regardless of `_settings.UpdateChecksEnabled`, so dispose tiers 2/3 never reference null. Only the `KickoffUpdateCheck()` call is gated. Matches the locked CONTEXT decision: "service constructed and registered for dispose, but no kickoff `BeginInvoke` is scheduled" when toggle is OFF at launch.
- **Outer `catch (Exception)` at kickoff IS deliberate (UI-08 vs UPD-07)** — UPD-07 forbids `catch (Exception)` in the SERVICE; UI-08 explicitly REQUIRES it at the fire-and-forget kickoff lambda boundary. Different code, different rule. RESEARCH Pitfall 9 calls this out: defense-in-depth so an unexpected bug doesn't surface as `TaskScheduler.UnobservedTaskException`.
- **`$"v{newer} available"` synthesis chosen over verbatim tag passthrough** — RESEARCH §Open Questions Q5 noted both shapes were acceptable. Picked synthesis: changing the 88-02 service surface from `Task<Version?>` to `Task<(Version, string)?>` mid-phase would have been Rule 4 architectural creep. Cost: a user-typed `V4.6.0` renders as `v4.6.0`. Acceptable per CONTEXT's Claude's Discretion allowance.
- **Re-clamp block lifted byte-for-byte from `SetStatsVisible:1247-1258`** — `ShowUpdateNotice` calls `UpdateLayout()` then runs the same `if (_hasUserPosition) { ScreenDpi.FromDipPoint → SettingsService.Clamp → Left/Top assign }` shape. UI-05 specifically called for re-using the proven re-clamp helper.
- **Mid-session cancel handler clears Text alongside Visibility** — `UpdateText.Visibility = Collapsed; UpdateText.Text = "";` makes the post-cancel state idempotent against the race where a `ShowUpdateNotice` continuation is already queued on the Dispatcher when the user toggles OFF.

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

**Next action:** Run `/gsd:audit-milestone` followed by `/gsd:complete-milestone` to tag v4.5 and archive Phase 88.

**When returning:**

1. Read this STATE.md and `.planning/ROADMAP.md` for current position
2. Phase 88 (single-phase v4.5 milestone) is COMPLETE — all 4 plans + all 34 v1 requirements done
3. Two follow-ups deferred to v4.5.0 tag push:
   - Category D — mid-session toggle OFF cancels in-flight CTS (live-observable only in RELEASE build)
   - Category G — SmartScreen / Defender behavior on first outbound HTTPS to api.github.com (requires fresh published exe on stock Defender)
4. The release pipeline (release.yml triggered by `git tag v4.5.0 && git push --tags`) naturally produces the published artifact for both deferrals.

**Recent milestones:**

- v4.4 Smooth Ghost Fade Under Load — shipped 2026-05-21 (587 tests, 18/18 requirements)
- v4.3 Configurable Ghost Override — shipped 2026-05-07 (574 tests, 22/22 requirements)
- v4.2 Temps & Menu — shipped 2026-05-04 (562 tests, MPL-2.0 compliance)

**Last session:** 2026-05-29T08:01:35.247Z
**Stopped at:** v4.5 Update Checker milestone complete — Plan 88-04 closed (DOCS-01 shipped; human-verify approved with D + G deferred to v4.5.0 tag push)
**Resume file:** None
**Blockers:** None

---
*State updated: 2026-05-29 — Phase 88 complete (34/34 v1 requirements done); 469 Core + 152 App = 621 tests pass; ready for /gsd:audit-milestone*
