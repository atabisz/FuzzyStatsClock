---
phase: 88-github-releases-update-checker
plan: 01
subsystem: core
tags: [version-compare, update-checker, system-version, mstest, datarow]

# Dependency graph
requires:
  - phase: 88-research
    provides: "RESEARCH.md §1 (TryParseTag/IsNewer skeleton), §4 (test skeleton), §17 (rejection grid)"
provides:
  - "Pure-static UpdateVersionComparer with TryParseTag (string?->Version) and IsNewer (Version,Version->bool)"
  - "Normalized Version comparison: Build=-1 (absent) treated as Build=0 so '4.5' == '4.5.0' == '4.5.0.0'"
  - "20-row test grid (6 happy + 10 reject + 4 ordering) covering every UPD-01/UPD-02 case enumerated in CONTEXT.md"
affects: [88-02-update-check-service, 88-03-mainwindow-callback]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-static class in FuzzyClock.Core (mirrors UptimeFormatter, DateFormatter, TemperatureFormatter)"
    - "REL-03 invariant: zero PackageReference in FuzzyClock.Core preserved end-to-end"
    - "MSTest [DataRow] grid pattern with `string?` parameter type for the null row"
    - "Explicit Normalize() helper to bypass System.Version's Build=-1 vs Build=0 sort quirk"

key-files:
  created:
    - "FuzzyClock.Core/UpdateVersionComparer.cs (57 lines)"
    - "FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs (64 lines)"
  modified: []

key-decisions:
  - "Lifted RESEARCH.md §1 implementation skeleton verbatim, then added a Normalize() helper to satisfy the plan-stated '4.5 == 4.5.0' invariant after the test exposed System.Version's actual ordering"
  - "Did NOT add `[DoNotParallelize]` — UpdateVersionComparer is pure-static state-free; MSTest parallelization is safe"

patterns-established:
  - "Version-tag parser pattern: trim -> strip single 'v'/'V' -> reject '-' or '+' -> delegate to Version.TryParse"
  - "IsNewer comparison pattern: normalize absent components (Build=-1 -> 0, Revision=-1 -> 0) before applying System.Version.operator>"

requirements-completed:
  - UPD-01
  - UPD-02

# Metrics
duration: 3 min
completed: 2026-05-29
---

# Phase 88 Plan 01: Core UpdateVersionComparer Summary

**Pure-static version-compare helper in FuzzyClock.Core providing GitHub-tag parsing (`v4.5.0`/`4.5`/`4.5.0.0`) and strict-greater ordering with absent-component normalization, covered by a 20-row MSTest grid.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-29T02:56:28Z
- **Completed:** 2026-05-29T02:58:44Z
- **Tasks:** 3 (RED, GREEN, summary)
- **Files created:** 2 (1 Core, 1 Test)
- **Files modified:** 0

## Accomplishments

- `UpdateVersionComparer.TryParseTag(string?, out Version)` accepts `v4.5.0`, `V4.5.0`, `4.5.0`, `4.5`, `4.5.0.0`, `v10.20.30.40` and rejects null/empty/whitespace, bare `v`, `garbage`, `-beta`/`-rc1`/`-alpha.2` prerelease suffixes, `+sha.abc` build metadata, and non-numeric segments like `v4.x.0`.
- `UpdateVersionComparer.IsNewer(Version running, Version latest)` returns `true` iff `latest` is strictly greater than `running` (equal -> false per UPD-02).
- Absent-component normalization: `4.5` equals `4.5.0` equals `4.5.0.0` (no false-positive "newer" alarms when GitHub tags have variable component counts).
- Full FuzzyClock.Core test suite: **469 passed, 0 failed** (449 baseline + 20 new DataRow-expanded results).
- REL-03 invariant preserved: `FuzzyClock.Core.csproj` has zero `<PackageReference>` lines (confirmed via grep, exit-code 1 with count 0).

## Task Commits

1. **Task 1: RED — failing test grid** — `f6db685` (`test`)
2. **Task 2: GREEN — UpdateVersionComparer impl** — `d6ef1d5` (`feat`)
3. **Plan summary metadata** — committed via gsd-tools at end (`docs`)

## Files Created/Modified

- `FuzzyClock.Core/UpdateVersionComparer.cs` — pure-static class with `TryParseTag` + `IsNewer` + private `Normalize` helper; 57 lines; zero dependencies.
- `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs` — `[TestClass]` with 5 `[TestMethod]` declarations: 1 happy-path DataRow method (6 rows), 1 reject DataRow method (10 rows), 3 ordering methods + 1 component-count equality method; 64 lines.

## Decisions Made

**1. Explicit `Normalize()` helper instead of bare `latest > running`.**

The plan's `<implementation>` block lifted from RESEARCH.md §1 specified `IsNewer` as a one-liner: `return latest > running;`. After the RED tests went GREEN for everything else, `IsNewer_TwoComponentVsThreeComponent_TreatedEqual` failed with `Assert.IsFalse failed` on `IsNewer(new Version("4.5"), new Version("4.5.0"))`. System.Version's actual behavior: `Build=-1` (when only 2 components were supplied) sorts BELOW `Build=0` — so `Version("4.5.0") > Version("4.5")` returns `true`, contradicting both the test and the plan's stated invariant in `must_haves.truths` (`"so '4.5' == '4.5.0' == '4.5.0.0'"`). Resolution: added private `Normalize(Version)` that promotes `-1` components to `0`, then compares the normalized pair. This honors the user-stated contract from CONTEXT.md and the must-have truth from the plan frontmatter.

**2. No `[DoNotParallelize]` on the test class.**

Per plan note: the comparer is pure-static and state-free, so MSTest parallelization is safe. Followed precedent from `UptimeFormatterTests` (also free of `[DoNotParallelize]`).

## Patterns

- **Pure-static class** mirrors `UptimeFormatter`, `DateFormatter`, `TemperatureFormatter` — all under `FuzzyClock.Core`, no instances, no I/O, no WPF references. `[NotNull]`-style guarantees encoded via `out` parameter + bool-return contract.
- **Zero PackageReference** preserved in `FuzzyClock.Core.csproj` (REL-03). The whole comparer leans on BCL (`System.Version`).
- **System.Version.TryParse + operator>** chosen over hand-rolled split per RESEARCH.md "Don't Hand-Roll" §1 — except that operator> alone was insufficient (see Decision 1) and required the Normalize wrapper.
- **MSTest DataRow grid** with `string?` parameter type for the null row. The `[DataRow(null)]` attribute requires the parameter to be nullable-annotated for the reject test to compile under `<Nullable>enable</Nullable>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan-stated invariant `4.5 == 4.5.0 == 4.5.0.0` violated by literal lift of RESEARCH.md §1**

- **Found during:** Task 2 (GREEN — `dotnet test` after writing the implementation verbatim from RESEARCH.md §1)
- **Issue:** RESEARCH.md §1 specified `IsNewer` as `=> latest > running;`. This compiled and 19 of 20 test results passed, but `IsNewer_TwoComponentVsThreeComponent_TreatedEqual` failed: `Assert.IsFalse(IsNewer(Version("4.5"), Version("4.5.0")))` returned `true`. System.Version's documented "absent components treated as 0" applies to property access only, not comparison operators — `Build=-1` sorts strictly below `Build=0`, making `4.5.0 > 4.5` evaluate to true.
- **Fix:** Added private `Normalize(Version)` helper that promotes `-1` components to `0`, then `IsNewer` compares the normalized pair: `Normalize(latest) > Normalize(running)`.
- **Files modified:** `FuzzyClock.Core/UpdateVersionComparer.cs` (added 8-line `Normalize` helper, changed `IsNewer` body from one expression to a normalized comparison)
- **Verification:** Re-ran `dotnet test` — all 469 results pass (was 468/1).
- **Committed in:** `d6ef1d5` (Task 2 GREEN commit — fix included in same commit as initial impl since the impl was never green standalone)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug — plan invariant vs. lifted skeleton mismatch).
**Impact on plan:** No scope creep. The fix is a strict prerequisite for the `must_haves.truths` block in the plan frontmatter and the explicit Test 20 case. Eight extra lines of code; zero new dependencies.

## Issues Encountered

None beyond the deviation above. The deviation is genuinely a planner bug (the plan's `<implementation>` skeleton contradicted its own `must_haves.truths`), surfaced exactly as RED-GREEN cadence is supposed to surface such mismatches.

## User Setup Required

None — pure-static helper, no external services, no environment variables.

## Next Phase Readiness

**Hand-off note for Plan 88-02 (UpdateCheckService):**

```csharp
using FuzzyClock.Core;

// Parse a tag returned from the GitHub Releases API:
if (UpdateVersionComparer.TryParseTag(release.TagName, out var latest))
{
    var running = Assembly.GetExecutingAssembly().GetName().Version!;
    if (UpdateVersionComparer.IsNewer(running, latest))
    {
        // surface "v{latest} available" to the UI
    }
}
```

The public surface that 88-02 and 88-03 will consume is fully tested and stable:
- `UpdateVersionComparer.TryParseTag(string?, out Version) -> bool`
- `UpdateVersionComparer.IsNewer(Version running, Version latest) -> bool`

REL-03 invariant intact — 88-02 must continue to keep all networking (`HttpClient`, JSON parsing, etc.) in `FuzzyClock.App`, never `FuzzyClock.Core`.

## Self-Check: PASSED

- `FuzzyClock.Core/UpdateVersionComparer.cs` — FOUND
- `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs` — FOUND
- `.planning/phases/88-github-releases-update-checker/88-01-SUMMARY.md` — FOUND
- Commit `f6db685` (RED) — FOUND
- Commit `d6ef1d5` (GREEN) — FOUND

---
*Phase: 88-github-releases-update-checker*
*Plan: 01 of 4*
*Completed: 2026-05-29*
