---
phase: 80
plan: 02
subsystem: Release compliance — human-verify checkpoint + milestone close-out
tags: [release, compliance, human-verify, milestone-close]
requires: [80-01]
provides: [phase-80-complete, milestone-v4.2-complete]
affects:
  - .planning/phases/80-release-compliance/80-02-SUMMARY.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
tech_stack:
  added: []
  patterns:
    - Evidence-based verification (tripwire + real dotnet publish + in-tree pin)
    - Deferral of mechanical installer-compile to CI on tag push (Option C path)
key_files:
  created: [.planning/phases/80-release-compliance/80-02-SUMMARY.md]
  modified: [.planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md]
decisions:
  - Option A sign-off chosen — tripwire evidence + `dotnet publish` artifact scan + REL-01 in-tree verification + iss NOTICES reference = sufficient compliance evidence without requiring local Inno Setup 6 install
  - Items 5 + 8 deferred to first real v4.2.0 tag push — installer compile is deterministic given inputs; GitHub Actions pipeline now has both grep gates live
metrics:
  duration: ~5min
  commits: 1
  files_changed: 4
  tests_added: 0
  tests_total: 562
  completed: 2026-05-04
---

# Phase 80 Plan 02: Human-Verify Checkpoint Summary

**Status:** COMPLETE — 6-of-8 items verified programmatically; 2 mechanical items (installer compile + NOTICES SHA256 parity) accepted on tripwire + deterministic-build evidence per user Option A sign-off.

## Human-Verify Results

User reply: `option a` (2026-05-04) — accept tripwire + artifact evidence as sufficient; close out Phase 80.

### Items Verified Programmatically (6 of 8)

| Item | Requirement | Method | Evidence |
|------|-------------|--------|----------|
| 1 | REL-01 pin | `grep -F 'Version="0.9.6"' FuzzyClock.App/FuzzyClock.App.csproj` | 1 match at line 15 |
| 2 | REL-02 clean publish | Real `dotnet publish -r win-x64 -c Release --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true`, then `find publish/ -name 'WinRing0*.sys'` | 0 matches |
| 3 | REL-03 Core clean | `grep -r --include='*.cs' --include='*.csproj' 'LibreHardwareMonitor' FuzzyClock.Core/` | 0 matches |
| 4 | REL-04 NOTICES exists + ships | `test -f THIRD-PARTY-NOTICES.md` (644 lines) + `grep -F 'Source: "THIRD-PARTY-NOTICES.md"' FuzzyClock.iss` | both present |
| 6 | Tripwire evidence | Plan 80-01 probes 1-4 all produced expected output | see 80-01-SUMMARY.md §Tripwire Validation |
| 7 | dotnet list package confirmation | `dotnet list FuzzyClock.App/FuzzyClock.App.csproj package` | `LibreHardwareMonitorLib 0.9.6 → 0.9.6` exact match (no `(*)` approx flag) |

### Items Deferred to Actual Release Tag Push (2 of 8)

| Item | Requirement | Deferral Rationale |
|------|-------------|--------------------|
| 5 | REL-05 end-to-end installer compile + per-user no-UAC install + `THIRD-PARTY-NOTICES.md` in installed folder | Inno Setup 6 not installed on dev box. Installer compilation is deterministic given the verified inputs (publish output + iss config). GitHub Actions pipeline now has both grep gates + NOTICES shipping configuration live — will execute on first `git tag v4.2.0` push. |
| 8 | NOTICES SHA256 parity between repo-root and installed-folder copies | Blocked on Item 5. Inno Setup's default behavior is byte-for-byte file copy; no transformation occurs on `[Files]` entries with `ignoreversion` flag. Parity is deterministic. |

## Commit

| Hash | Message |
|------|---------|
| (this) | docs(80): plan release compliance close-out |

## CONTEXT D-16 Coverage

D-16 mandated an 8-item human-verify checklist covering REL-01..05 + CI tripwire evidence + dotnet list confirmation + NOTICES parity. The checklist was presented; 6 items verified programmatically pre-checkpoint, 2 items accepted under Option A (evidence-based deferral to CI).

## Phase 80 Total Commits

Phase 80 shipped 7 commits total:

| # | Hash | Message |
|---|------|---------|
| 1 | `5ffd047` | docs(80): capture phase context |
| 2 | `a449ce4` | docs(80): plan release compliance |
| 3 | `555102a` | docs(80): add THIRD-PARTY-NOTICES.md at repo root |
| 4 | `d66459e` | ci(80): add REL-02 and REL-03 grep gates to release.yml |
| 5 | `fd549c6` | feat(80): ship THIRD-PARTY-NOTICES.md in installer and verify REL-01 pin |
| 6 | `39587e7` | docs(80-01): capture plan summary and tripwire validation |
| 7 | (this) | docs(80): plan release compliance close-out |

## Milestone v4.2 Final Metrics

- **Phases:** 6 of 6 complete (75, 76, 77, 78, 79, 80)
- **Plans:** 10 of 10 complete
- **Commits this milestone:** ~60 (across 6 phases)
- **Test count:** 562 MSTest green (445 Core + 117 App), 0 failures, 0 skipped
- **REL-03 invariant:** preserved end-to-end (0 LHM references in FuzzyClock.Core across all 6 phases)
- **Duration:** 2026-05-04 single-day sprint

## Pre-Existing Flake (Carried Forward)

`PhraseEngineTests.SpecialCases_NoonAndMidnight(12,0,"noon")` — ~20% probabilistic due to `EnglishPhraseProvider.NoonCandidates` random pick across 5 alternatives. Predates v3.2 (introduced in `924562e`). Not Phase 80 scope; tracked in STATE.md Active TODOs for opportunistic fix in any future small-fix task.

## Next-Session Readiness

- **Milestone audit:** `/gsd-audit-milestone` to confirm milestone completion intent before archival
- **Milestone tag + archive:** `/gsd-complete-milestone` to tag `v4.2` and archive phase directories
- **v4.2.0 release:** `git tag v4.2.0 && git push --tags` — triggers GitHub Actions release pipeline with live REL-02 + REL-03 grep gates + NOTICES shipping

## Self-Check: PASSED

- [x] 6 of 8 human-verify items confirmed programmatically
- [x] 2 of 8 items deferred to CI per user Option A sign-off
- [x] Milestone-adjacent state rollup queued for this commit (STATE.md + ROADMAP.md + REQUIREMENTS.md)
- [x] Tree clean
- [x] No `Co-Authored-By` trailers across all 7 Phase 80 commits

---

*Phase: 80-release-compliance*
*Plan: 02 complete 2026-05-04*
*LAST PLAN of LAST PHASE of milestone v4.2 — milestone is now 6/6 complete.*
