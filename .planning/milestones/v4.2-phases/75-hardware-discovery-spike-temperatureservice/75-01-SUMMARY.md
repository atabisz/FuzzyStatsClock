---
phase: 75-hardware-discovery-spike-temperatureservice
plan: 01
subsystem: infra
tags: [hardware-discovery, librehardwaremonitor, pawnio, spike, temperature, nvme]

# Dependency graph
requires:
  - phase: 74-v4.1-complete
    provides: baseline 501 MSTest suite and stable v4.1 codebase
provides:
  - Dated go/no-go gate for milestone v4.2 (NO-GO)
  - Full LHM 0.9.6 sensor enumeration on HP 8960 i9-12900H / RTX A2000 dev box
  - D-05 threading decision (Path 2 — dedicated background task) for Plan 75-02
  - Documented methodology variance: PawnIO was never installed on the dev box
  - Scope-reduction proposal for ROADMAP/REQUIREMENTS amendment (NVMe best-effort)
affects: [75-02 (TemperatureService), 76 (AppSettings), 78 (Temps Tab), 79 (Temps Line), 80 (Release)]

# Tech tracking
tech-stack:
  added: [LibreHardwareMonitorLib 0.9.6 (scratch-only; NOT yet pinned in the main solution)]
  patterns:
    - "Spike reports live under .planning/spikes/ (new folder) with 7 mandatory sections"
    - "Throwaway enumerators live under scratch/ (gitignored); only captured output becomes a permanent artifact"
    - "Methodology variance documentation pattern: record the expected procedure, record what actually happened, record why the invariant still holds"

key-files:
  created:
    - .planning/spikes/75-hardware-discovery.md
  modified:
    - .gitignore (scratch/ exclusion — committed in Task 1)

key-decisions:
  - "NO-GO on D-02 gate: GPU readable, NVMe not enumerated by LHM on this dev box"
  - "D-05 threading branch: Path 2 (dedicated background task) — 608.2 ms steady-state Update() mean is 12x the piggyback threshold"
  - "Milestone v4.2 scope reduction: NVMe becomes best-effort with -1f sentinel fallback; Phase 76 blocked pending ROADMAP/REQUIREMENTS amendment"
  - "Methodology variance accepted: dev box was PawnIO-free at baseline, so the uninstall/restore cycle was a no-op — the invariant (no PawnIO at measurement time) is satisfied"
  - "Plan 75-02 init timeout may need to rise from 3000 ms to ~5000 ms — Computer.Open() took 4272 ms on this hardware"

patterns-established:
  - "Spike methodology variance: when the precondition (PawnIO absent) is already satisfied, uninstall/restore is a no-op documented in Environment + Methodology sections rather than a failure"
  - "UTF-16LE to UTF-8 reencoding of PowerShell Tee-Object output before pasting into markdown reports"
  - "Go/no-go block message to orchestrator: explicit ROADMAP/REQUIREMENTS amendment list blocks Wave 2 until committed"

requirements-completed: [TEMP-SVC-01]

# Metrics
duration: 45min (checkpoint wait + execution)
completed: 2026-05-04
---

# Phase 75 Plan 01: Hardware Discovery Spike Summary

**LHM 0.9.6 on HP 8960 / RTX A2000: GPU readable, NVMe not enumerated, Update() mean 608 ms — NO-GO on D-02, Path 2 threading chosen, Phase 76 blocked pending scope amendment.**

## Performance

- **Duration:** ~45 min (execution was bounded by the human-action checkpoint; author-time for Task 3 report writing ~8 min)
- **Started:** 2026-05-04 (planning); Task 1 committed at `5e654e2`
- **Completed:** 2026-05-04 (Task 3 committed at `cb26529`)
- **Tasks:** 3 (1 auto, 1 human-action checkpoint, 1 auto)
- **Files modified:** 2 (`.gitignore` in Task 1; `.planning/spikes/75-hardware-discovery.md` in Task 3)

## Accomplishments

- Hardware-discovery spike report written at `.planning/spikes/75-hardware-discovery.md` (267 lines, 7 sections, all mandatory)
- Go/no-go decision stamped: **NO-GO** (2026-05-04) — GPU readable, NVMe N/A
- D-05 threading decision stamped: **Path 2 (dedicated background task)** — measured Update() mean 608.2 ms
- LHM 0.9.6 sensor tree enumerated verbatim for i9-12900H + RTX A2000 + HP 89C0 + Intel UHD
- 22 CPU Temperature sensors confirmed null on a PawnIO-free dev box (validates the research's PawnIO-gating claim for modern Intel MSRs)
- Steady-state Update() timing captured: mean 608.2 ms, min 78 ms, max 671 ms over 20 iterations
- Scratch folder deleted; clean working tree post-spike

## Task Commits

Each task committed atomically:

1. **Task 1: `.gitignore` entry + throwaway enumerator program** — `5e654e2` (chore)
   _(Enumerator sources under `scratch/Enumerator/` were never committed per plan — only the `.gitignore` entry is permanent.)_
2. **Task 2: PawnIO uninstall + enumerate + restore** — no commit (human-action checkpoint; all captured files lived under gitignored `scratch/` and have since been deleted)
3. **Task 3: Write dated spike report with go/no-go + D-05 branch** — `cb26529` (docs)

**Plan metadata:** final metadata commit covers this summary + STATE.md + ROADMAP.md updates.

## Files Created/Modified

- `.planning/spikes/75-hardware-discovery.md` (NEW) — 267-line dated spike report with Environment / Methodology / Full Sensor Tree / Per-Kind Resolution Table / Update() Timing / Go-No-Go Decision / D-05 Threading Decision
- `.gitignore` (modified in Task 1 — committed as `5e654e2`) — added `scratch/` exclusion

## Decisions Made

- **NO-GO gate fires.** D-02 threshold (GPU readable AND NVMe readable) fails because `HardwareType.Storage` does not appear in the LHM hardware tree on the dev box despite `IsStorageEnabled=true`. GPU alone (NVIDIA A2000 "GPU Core"=51°C, "GPU Hot Spot"=61.56°C) is not sufficient.
- **Path 2 threading chosen.** Update() mean of 608.2 ms is 12× the 50 ms piggyback threshold. Piggybacking the 0.5 s hover-fast-refresh stats timer is infeasible (would freeze the Dispatcher for >600 ms per tick). Plan 75-02 implements long-lived `Task.Run` + `CancellationToken` background loop per D-07.
- **Methodology variance accepted.** Dev box was never PawnIO-installed (`sc.exe query pawnio` returned 1060 at measurement start; HKLM Uninstall scan empty). The planned uninstall/reboot/restore cycle was a no-op — the invariant "PawnIO absent at measurement time" is satisfied via baseline rather than via procedure. Documented explicitly in Environment + Methodology sections of the spike report.
- **Init timeout flagged for Plan 75-02.** `Computer.Open()` took 4272 ms on this hardware — above the TEMP-SVC-03 3-second timeout. Plan 75-02 will need to either raise the timeout (with a documented rationale) or accept that initialization frequently times out on this hardware class and leaves the service in `IsReady=false` silent-failure mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking / Methodology variance] PawnIO already absent at Step 1 of Task 2**
- **Found during:** Task 2 (human-action checkpoint, at the pre-uninstall capture step)
- **Issue:** The plan assumed PawnIO was installed at the start of the phase (requiring an uninstall + reboot + enumerate + restore cycle). The dev box was actually a clean PawnIO-free baseline: `sc.exe query pawnio` returned `FAILED 1060` and the HKLM Uninstall registry scan was empty.
- **Fix:** Rather than skipping the spike, treated the dev box's PawnIO-free state as already-satisfying the D-04 precondition. Ran the enumerator directly against that state. Documented the variance explicitly in Section 1 (Environment — "N/A; not installed at spike start") and Section 2 (Methodology — "dev box was found to be a clean PawnIO-free baseline; no uninstall was required"). Did not fabricate uninstall/restore timestamps. The invariant the D-04 substitution cares about — "PawnIO absent at measurement time" — is satisfied either way.
- **Files modified:** `.planning/spikes/75-hardware-discovery.md` (Sections 1 + 2)
- **Verification:** `scratch/pawnio-service-before.txt` captures the SC exit code 1060 at measurement timestamp `2026-05-04T16:37:20`; this file was gitignored per plan and has since been deleted with the rest of `scratch/`.
- **Committed in:** `cb26529` (Task 3 report commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — methodology variance)
**Impact on plan:** No scope creep. The variance is documented in the permanent artifact (the spike report). Future auditors reading the report will see the honest description rather than a fabricated uninstall cycle.

## Issues Encountered

- **UTF-16LE vs UTF-8 encoding on PowerShell `Tee-Object` output.** `scratch/enumerator-output.txt` was produced by `Tee-Object -FilePath` which defaults to UTF-16LE on Windows PowerShell 5.1. The raw file contained interleaved null bytes; a direct paste into markdown would have produced unreadable content. Resolved by writing a tiny reencode script (`scratch/reencode.ps1` — also gitignored, also deleted) that loaded the file as Unicode and rewrote it as UTF-8 without BOM. The spike report's Section 3 raw-tree paste is byte-identical to the original file, just in UTF-8.
- **No [Storage] IHardware in tree despite `IsStorageEnabled=true`.** This is the NO-GO finding, not an execution issue. Documented as the primary Section 4 observation. No exception was thrown during Computer.Open() — the Storage branch is simply empty. Likely causes (Intel VMD, OEM driver, admin-elevation gating) are called out in the report; resolving which would require additional runs (with admin elevation or PawnIO installed) that are explicitly out of scope for this spike.

## User Setup Required

None — the milestone's next step is orchestrator-level, not user-level. Specifically: the orchestrator must halt Wave 2 (Plan 75-02 should NOT auto-advance) and route to milestone-amendment flow. Concrete user/owner actions required before Phase 76 can open:

1. Amend `ROADMAP.md` Phase 75 SC1 from "GPU + NVMe both readable" to "GPU readable; NVMe best-effort with documented N/A fallback."
2. Amend `REQUIREMENTS.md` TEMP-TAB-03 defaults: drop NVMe from default-visible; add help-text disclaimer about PawnIO/admin-elevation requirement.
3. Amend `REQUIREMENTS.md` TEMP-LINE-04 to require hiding the NVMe segment when `NvmeTempC == -1f` (already implied by the -1f contract; makes it explicit).
4. Mark Phase 75 SC1 as "amended and met" and unblock Plan 75-02.

None of these require rerunning Plan 75-01. The spike report stands as-is.

## Next Phase Readiness

- **Plan 75-02 is BLOCKED pending the four amendments above.** The D-05 Path 2 decision feeds directly into Plan 75-02's background-loop implementation (per Research Section 3.4 Path 2). The 3-second init timeout question also feeds into Plan 75-02.
- **Plan 75-02 can begin planning (not execution) in parallel with the amendments** — the threading decision and NO-GO status are both known.
- **Phase 77 (RMB menu) remains unblocked** — it has no dependency on the spike outcome or on TemperatureService. The orchestrator can proceed with Phase 77 while Phase 75-02 waits.
- **Scratch folder deletion confirmed** (`scratch/` no longer exists; working tree clean apart from tracked artifacts).

## Self-Check: PASSED

Verified claims:

- `.planning/spikes/75-hardware-discovery.md` — FOUND (267 lines; all 7 mandatory sections; "## 6. Go/No-Go Decision" and "## 7. D-05 Threading Decision" both present; "Chosen path: **Path 2 (dedicated background task)**" present; "Decision (2026-05-04): NO-GO" present)
- `.gitignore` contains `scratch/` — FOUND (staged and committed in Task 1 `5e654e2`)
- Commit `5e654e2` — FOUND (`git log --grep="75-01"` returns it)
- Commit `cb26529` — FOUND (`git log -5` shows it as HEAD)
- `scratch/` folder — REMOVED (no longer exists in working tree)

---

*Phase: 75-hardware-discovery-spike-temperatureservice*
*Completed: 2026-05-04*
