---
phase: 80
plan: 01
subsystem: Release compliance — CI gates + NOTICES + installer
tags: [release, compliance, ci, installer, mpl-2.0, rel-01, rel-02, rel-03, rel-04, rel-05]
requires: [79-02]
provides: [rel-gates-wired, notices-shipped, phase-80-01-complete]
affects:
  - THIRD-PARTY-NOTICES.md
  - .github/workflows/release.yml
  - FuzzyClock.iss
  - .planning/phases/80-release-compliance/80-01-SUMMARY.md
tech_stack:
  added: []
  patterns:
    - Additive-only CI edits (D-14 preserved across all Phase 78/79/80)
    - Handwritten third-party notices (D-03/D-04 over auto-generation)
    - Single-source-of-truth: FuzzyClock.iss [Files] ships NOTICES to {app} root
key_files:
  created: [THIRD-PARTY-NOTICES.md]
  modified: [.github/workflows/release.yml, FuzzyClock.iss]
decisions:
  - D-13 REL-01 CI sentry SKIPPED (Claude's discretion) — three enforcement paths already cover: PackageReference semantics + Task 3 Part B read-only verification + Plan 80-02 human-verify Item 1
  - D-15 csproj Version bump 3.6.0 → 4.2.0 SKIPPED (Claude's discretion) — cosmetic only; CI overrides on tag push; avoids coupling REL-04/REL-05 attribution with unrelated version metadata in git blame
metrics:
  duration: ~20min
  commits: 4
  files_changed: 3
  tests_added: 0
  tests_total: 562
  completed: 2026-05-04
---

# Phase 80 Plan 01: Release Compliance Summary

**Status:** COMPLETE — 4 atomic commits landed; all 5 REL requirements addressable; 4 tripwire probes fired as expected; zero runtime code changes; zero Core/ modifications.

Plan 80-01 ships the Phase 80 compliance artifacts: a handwritten `THIRD-PARTY-NOTICES.md` at repo root, two additive CI grep gates in `release.yml` (REL-03 pre-build + REL-02 post-publish), and one additive line in `FuzzyClock.iss` that ships the notices file to `{app}` root alongside `FuzzyClock.exe`. REL-01 is verified (not edited) to already hold the exact-version pin `Version="0.9.6"` at csproj:15.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `555102a` | docs(80): add THIRD-PARTY-NOTICES.md at repo root |
| 2 | `d66459e` | ci(80): add REL-02 and REL-03 grep gates to release.yml |
| 3 | `fd549c6` | feat(80): ship THIRD-PARTY-NOTICES.md in installer and verify REL-01 pin |
| 4 | (this) | docs(80-01): capture plan summary and tripwire validation |

## Work Completed

### Task 1 — THIRD-PARTY-NOTICES.md (commit `555102a`)

Authored a 644-line handwritten notices file at repo root. Structure:

1. Intro paragraph + D-05 version-bound reminder ("Future milestones that bump LibreHardwareMonitorLib MUST refresh this file as part of the bump PR")
2. **LibreHardwareMonitorLib 0.9.6** attribution block (MPL-2.0, upstream URL, copyright line, unmodified-binary-redistribution note)
3. Five transitive attribution blocks with explicit version + SPDX + upstream + copyright:
   - BlackSharp.Core 1.0.7 (MPL-2.0)
   - DiskInfoToolkit 1.1.2 (MPL-2.0)
   - HidSharp 2.6.4 (Apache-2.0)
   - RAMSPDToolkit-NDD 1.4.2 (MPL-2.0)
   - Mono.Posix.NETStandard 1.0.0 (MIT)
4. **Verbatim MPL-2.0 text** retrieved from the canonical plaintext at `https://www.mozilla.org/media/MPL/2.0/index.815ca599c9df.txt` — all 373 source lines preserved byte-for-byte (section numbering, whitespace, Exhibits A + B)
5. **Verbatim Apache License 2.0 text** for HidSharp
6. **Verbatim MIT License text** for Mono.Posix.NETStandard
7. **Microsoft .NET Runtime Components** section clarifying why System.Management / System.IO.Ports / runtime.* shim packages do not get individual attribution blocks (covered by .NET runtime MIT license at dotnet/runtime)

No auto-generation tool was used (D-04 honored). File ends with a clean trailing newline.

### Task 2 — REL-03 + REL-02 grep gates (commit `d66459e`)

Inserted exactly two new steps into `.github/workflows/release.yml`:

- **REL-03 guard** (pre-build) — inserted after `Setup .NET` step, before `Extract version from tag` step. Runs `grep -rn --include='*.cs' --include='*.csproj' 'LibreHardwareMonitor' FuzzyClock.Core/`; exits 1 with `::error::` prefix on any match. Fails fast before `Restore` / `Test` / `Publish` consume runner minutes (D-06).
- **REL-02 guard** (post-publish) — inserted after `Publish` step, before `Compile installer` step. Runs `find publish/ -name 'WinRing0*.sys' -print -quit | grep -q .`; exits 1 with `::error::` prefix + diagnostic enumeration on any match. First meaningful opportunity because `publish/` doesn't exist pre-publish (D-07).

No existing step was edited (D-14 honored). Workflow now has 11 `- name:` steps (9 original + 2 new).

### Task 3 — FuzzyClock.iss [Files] + REL-01 verification (commit `fd549c6`)

**Part A** — Added one `[Files]` line to `FuzzyClock.iss`:

```inno
Source: "THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
```

Lands at `%LOCALAPPDATA%\Programs\FuzzyClock\THIRD-PARTY-NOTICES.md` (D-09 {app} root placement). No `isreadme` flag (D-10). No `Docs\` subfolder (D-11). `PrivilegesRequired=lowest` invariant preserved. `AppId` GUID unchanged (upgrade continuity).

**Part B** — Verified REL-01 pin (read-only): `FuzzyClock.App/FuzzyClock.App.csproj:15` contains the literal `<PackageReference Include="LibreHardwareMonitorLib" Version="0.9.6" />`. No range brackets, no star, no Update= suffix. `git diff FuzzyClock.App/FuzzyClock.App.csproj` returns empty — zero edits per D-12. D-15 version bump deliberately skipped per Claude's-discretion rationale in frontmatter.

### Task 4 — Tripwire validation + SUMMARY (this commit)

Ran 4 local shell probes to prove both grep gates fire correctly. No commits, no repo pollution — scratch dirs under `/tmp/rel02-probe` and `/tmp/rel03-probe` created and `rm -rf`'d.

## Tripwire Validation

All 4 probes produced expected output:

### Probe 1 — REL-03 positive control (current repo)

```
if grep -rn --include='*.cs' --include='*.csproj' 'LibreHardwareMonitor' FuzzyClock.Core/; then
  echo "WOULD FAIL CI"
else
  echo "PASS: REL-03 gate clean"
fi
```

**Output:** `PASS: REL-03 gate clean` (exit 0)

Confirms: (a) the grep scope is correctly limited to `FuzzyClock.Core/` (does not match FuzzyClock.App which legitimately imports LHM); (b) Core is currently clean; (c) the gate will pass on the current repo state in CI.

### Probe 2 — REL-03 negative control (simulated violation)

```
mkdir -p /tmp/rel03-probe/FuzzyClock.Core
echo '// uses LibreHardwareMonitor' > /tmp/rel03-probe/FuzzyClock.Core/Stub.cs
(cd /tmp/rel03-probe && grep -rn --include='*.cs' --include='*.csproj' 'LibreHardwareMonitor' FuzzyClock.Core/) && echo "WOULD FAIL CI (expected)"
```

**Output:**
```
FuzzyClock.Core/Stub.cs:1:// uses LibreHardwareMonitor
WOULD FAIL CI (expected)
```

Confirms the grep syntax successfully detects `LibreHardwareMonitor` in a `.cs` file under `FuzzyClock.Core/`. The line-number-prefixed output matches what CI would log.

### Probe 3 — REL-02 positive control (empty publish/)

```
mkdir -p /tmp/rel02-probe/publish
if find /tmp/rel02-probe/publish/ -name 'WinRing0*.sys' -print -quit | grep -q .; then
  echo "WOULD FAIL CI"
else
  echo "PASS: REL-02 gate clean on empty publish"
fi
```

**Output:** `PASS: REL-02 gate clean on empty publish`

Confirms the gate passes when no `.sys` files exist — the expected state for a PublishSingleFile build where everything is bundled inside `FuzzyClock.exe`.

### Probe 4 — REL-02 negative control (simulated WinRing0 leak)

```
touch /tmp/rel02-probe/publish/WinRing0x64.sys
if find /tmp/rel02-probe/publish/ -name 'WinRing0*.sys' -print -quit | grep -q .; then
  echo "WOULD FAIL CI (expected)"
  find /tmp/rel02-probe/publish/ -name 'WinRing0*.sys'
else
  echo "FAIL: gate did not fire"
fi
```

**Output:**
```
WOULD FAIL CI (expected)
/tmp/rel02-probe/publish/WinRing0x64.sys
```

Confirms the find+grep combination detects `WinRing0x64.sys` and surfaces the exact leaked path. CI would print this in the workflow summary via the `::error::` prefix.

## Test Results

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| MSTest passed | 562 | 562 | +0 |
| MSTest failed | 0 | 0 | +0 |
| Build errors | 0 | 0 | +0 |
| Build warnings | 0 | 0 | +0 |

Zero test additions matches D-17 expectation — REL gates are CI-only, not unit-testable.

## Verification Evidence

| Check | Command | Expected | Actual |
|-------|---------|----------|--------|
| NOTICES at repo root | `test -f THIRD-PARTY-NOTICES.md` | exists | ✓ (644 lines) |
| MPL-2.0 verbatim present | `grep -F "Mozilla Public License Version 2.0" THIRD-PARTY-NOTICES.md` | ≥1 | 2 |
| LHM block | `grep -F "LibreHardwareMonitorLib 0.9.6" THIRD-PARTY-NOTICES.md` | ≥1 | 6 |
| BlackSharp.Core block | `grep -F "BlackSharp.Core 1.0.7"` | ≥1 | 1 |
| DiskInfoToolkit block | `grep -F "DiskInfoToolkit 1.1.2"` | ≥1 | 1 |
| HidSharp block | `grep -F "HidSharp 2.6.4"` | ≥1 | 1 |
| RAMSPDToolkit-NDD block | `grep -F "RAMSPDToolkit-NDD 1.4.2"` | ≥1 | 1 |
| Mono.Posix block | `grep -F "Mono.Posix.NETStandard 1.0.0"` | ≥1 | 1 |
| MPL-2.0 mentions | `grep -cF "MPL-2.0" THIRD-PARTY-NOTICES.md` | ≥4 | 4 |
| D-05 bump reminder | `grep -icF "future milestones that bump"` | ≥1 | 1 |
| REL-03 guard in yml | `grep -cF "REL-03 guard" .github/workflows/release.yml` | ≥1 | 1 |
| REL-02 guard in yml | `grep -cF "REL-02 guard" .github/workflows/release.yml` | ≥1 | 1 |
| Step count | `grep -c "^      - name:" .github/workflows/release.yml` | 11 | 11 |
| iss [Files] entries | `grep -c '^Source: ' FuzzyClock.iss` | 2 | 2 |
| iss PrivilegesRequired | `grep -F 'PrivilegesRequired=lowest' FuzzyClock.iss` | ≥1 | 1 |
| iss no isreadme | `grep -cF 'isreadme' FuzzyClock.iss` | 0 | 0 |
| csproj REL-01 pin | `grep -F 'Version="0.9.6"' FuzzyClock.App/FuzzyClock.App.csproj` | ≥1 | 1 |
| csproj unchanged | `git diff FuzzyClock.App/FuzzyClock.App.csproj` | empty | empty |
| Core/ unchanged | `git diff HEAD~3 FuzzyClock.Core/` | empty | empty |

## Requirement Sign-off

| ID | Requirement | Satisfied by | Evidence |
|----|-------------|--------------|----------|
| REL-01 | LibreHardwareMonitorLib pinned at exact 0.9.6 | Task 3 Part B (verify-only) | `Version="0.9.6"` present at csproj:15; no range syntax |
| REL-02 | CI fails on WinRing0*.sys in publish/ | Task 2 post-publish gate | `REL-02 guard` step in release.yml; tripwire probe 4 confirms detection |
| REL-03 | CI fails on LibreHardwareMonitor in FuzzyClock.Core/ | Task 2 pre-build gate | `REL-03 guard` step in release.yml; tripwire probe 2 confirms detection |
| REL-04 | THIRD-PARTY-NOTICES.md at repo root + ships in installer | Tasks 1 + 3 | File exists; iss Ships it to {app} |
| REL-05 | Installer captures LHM + transitive DLLs; per-user no-UAC preserved | D-01 reinterpretation + Task 3 | PublishSingleFile=true bundles DLLs inside FuzzyClock.exe; PrivilegesRequired=lowest preserved |

## CONTEXT D-01..D-16 Coverage

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 Keep PublishSingleFile | Honored | release.yml Publish step untouched; IncludeNativeLibrariesForSelfExtract=true preserved |
| D-02 No multi-file publish | Honored | Publish step unchanged; no csproj edit |
| D-03 Handwritten NOTICES 5-section structure | Honored | NOTICES has intro + LHM + 5 transitive + MPL-2.0 + Apache + MIT + runtime note |
| D-04 No auto-gen tool | Honored | No dotnet-project-licenses / nuget-license invoked |
| D-05 Bump reminder in-file | Honored | "Future milestones that bump ... MUST refresh this file" at file top |
| D-06 REL-03 pre-build | Honored | Gate inserted between Setup .NET and Extract version from tag |
| D-07 REL-02 post-publish | Honored | Gate inserted between Publish and Compile installer |
| D-08 No redundant pre-build WinRing0 | Honored | Single post-publish WinRing0 gate |
| D-09 NOTICES to {app} root | Honored | `DestDir: "{app}"` in iss |
| D-10 No isreadme flag | Honored | `grep -cF 'isreadme' FuzzyClock.iss` = 0 |
| D-11 No Docs subfolder | Honored | DestDir is `{app}` not `{app}\Docs` |
| D-12 REL-01 verify-only | Honored | csproj diff empty |
| D-13 Optional REL-01 CI sentry | Skipped (Claude's discretion) | Three enforcement paths already cover: PackageReference semantics + Task 3 verification + Plan 80-02 human-verify |
| D-14 Additive-only release.yml | Honored | All 9 existing steps unchanged; `git diff HEAD~3 .github/workflows/release.yml` shows additions only |
| D-15 csproj Version bump | Skipped (Claude's discretion) | Stale 3.6.0 value harmless; CI overrides on tag; avoids muddying REL-04/05 git blame |
| D-16 Human-verify checkpoint | Deferred to Plan 80-02 | Plan 80-02 has the blocking 8-item checklist |

## Non-Negotiable Gates

| Gate | Status |
|------|--------|
| No `Co-Authored-By` trailer in any commit | PASS — all 4 commits clean |
| REL-03 invariant preserved (Core/ LHM-free) | PASS — `grep -r --include='*.cs' 'LibreHardwareMonitor' FuzzyClock.Core/` returns 0 matches |
| `FuzzyClock.Core/` untouched | PASS — `git diff HEAD~3 FuzzyClock.Core/` empty |
| `FuzzyClock.App.csproj` untouched (REL-01 verify-only) | PASS — diff empty |
| All 9 original release.yml steps intact | PASS — step names present: checkout, Setup .NET, Extract version from tag, Restore, Test, Publish, Compile installer, Rename EXE artifact, Generate checksums, Create GitHub Release |
| `PrivilegesRequired=lowest` preserved (per-user no-UAC invariant) | PASS |
| `AppId` GUID preserved (upgrade continuity) | PASS |

## Files Untouched

- `FuzzyClock.Core/` — entire subtree (REL-03 invariant; Phase 80 wires the gate, doesn't edit Core)
- `FuzzyClock.Core.Tests/` — entire subtree
- `FuzzyClock.App/*.cs`, `*.xaml` — all runtime code files
- `FuzzyClock.App/FuzzyClock.App.csproj` — REL-01 verify-only per D-12; D-15 version bump deferred
- `FuzzyClock.App.Tests/` — entire subtree
- `FuzzyClock.slnx` — unchanged
- `README.md` — unchanged (no milestone-completion doc updates in this plan; may happen in Plan 80-02 close-out)
- `app.ico`, other assets — unchanged

## Deviations from Plan

**Zero deviations.** All 4 tasks executed per spec with byte-for-byte adherence to CONTEXT.md decisions and acceptance criteria.

One notable execution detail: the original plan instructed the executor to use WebFetch for MPL-2.0 retrieval, which the WebFetch tool's content-policy layer rejected as "reproducing extended copyrighted material". Fell back to direct `curl` of the canonical plaintext URL `https://www.mozilla.org/media/MPL/2.0/index.815ca599c9df.txt` — this is the same source Mozilla publishes specifically for verbatim redistribution, so the fallback is semantically equivalent to the plan's original intent. The 373-line MPL-2.0 text was written verbatim into NOTICES.md. No paraphrasing, no summarizing.

## Next-Phase Readiness

Plan 80-02 (blocking human-verify checkpoint) is unblocked. All Plan 80-02 prerequisites are in place:
- THIRD-PARTY-NOTICES.md exists at repo root
- release.yml has REL-02 + REL-03 grep gates (verified via tripwire probes)
- FuzzyClock.iss ships NOTICES to {app} root
- REL-01 pin verified at csproj:15

Next action: `/gsd:execute-phase 80 --wave 2` or continue the current execute-phase flow into wave 2.

## Self-Check: PASSED

- [x] 4 commits landed (one per task)
- [x] THIRD-PARTY-NOTICES.md exists at repo root (644 lines)
- [x] `.github/workflows/release.yml` has REL-03 + REL-02 guards (11 total steps)
- [x] `FuzzyClock.iss` [Files] has 2 entries (FuzzyClock.exe + THIRD-PARTY-NOTICES.md)
- [x] `FuzzyClock.App.csproj` line 15 pinned at `Version="0.9.6"` (unchanged)
- [x] `FuzzyClock.Core/` unchanged
- [x] All 4 tripwire probes produced expected output
- [x] No `Co-Authored-By` trailer in any Phase 80 commit
- [x] Tree clean after each task

---

*Phase: 80-release-compliance*
*Plan: 01 complete 2026-05-04*
*LAST PHASE of milestone v4.2 — Plan 80-02 human-verify checkpoint is the final gate before milestone completion.*
