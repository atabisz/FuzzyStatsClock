---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: Temps & Menu
status: phase-blocked-scope-amendment
last_updated: "2026-05-04T06:47:20.996Z"
last_activity: 2026-05-04 — spike executed; NO-GO; Plan 75-02 blocked
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
---

# Project State: FuzzyStatsClock

**Last updated:** 2026-05-04
**Current milestone:** v4.2 Temps & Menu
**Status:** Phase 75 Plan 01 complete — Plan 75-02 BLOCKED pending ROADMAP/REQUIREMENTS amendment (NO-GO gate)

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Milestone v4.2 — Phase 75 Plan 01 done (spike); awaiting owner sign-off on scope reduction before Plan 75-02 begins.

## Current Position

Phase: 75 (Hardware Discovery Spike + TemperatureService) — in progress
Plan: 75-01 COMPLETE (`cb26529`); 75-02 BLOCKED pending scope amendment
Status: NO-GO gate fired — milestone must amend ROADMAP.md + REQUIREMENTS.md before Plan 75-02 executes
Last activity: 2026-05-04 — `.planning/spikes/75-hardware-discovery.md` written; 75-01-SUMMARY.md written

## Performance Metrics

**Velocity:** 1 plan / 1 day on Phase 75 (spike + documentation)
**Test suite (baseline):** 501 MSTest tests (433 Core + 68 App), 0 failures (from v4.1) — unchanged by Plan 75-01 (docs only)
**Technical debt:** Low (mature codebase with 503 decisions logged)

### Performance History

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 75    | 01   | ~45 min  | 3     | 2     |

## Accumulated Context

### Key Decisions This Milestone

- Phase structure derived from research SUMMARY.md: 6 phases continuing 75–80
- Phase 75 gates the entire milestone via hardware-discovery spike + TempService
- Phase 77 (RMB) decoupled and parallelizable with the temps chain
- Phase 80 (Release) comes last so CI grep gates validate the integrated artifact
- **Phase 75 Plan 01 (2026-05-04): NO-GO on D-02 gate.** GPU readable (NVIDIA A2000 GPU Core=51°C, GPU Hot Spot=61.56°C); NVMe not enumerated (`HardwareType.Storage` absent from LHM tree despite `IsStorageEnabled=true`); CPU and Mobo N/A (PawnIO-gated as predicted).
- **D-05 Threading Path: Path 2 (dedicated background task).** Steady-state Update() mean = 608.2 ms (12× the 50 ms piggyback threshold). Plan 75-02 implements long-lived `Task.Run` + `CancellationToken` per D-07.
- **Methodology variance:** dev box was PawnIO-free at baseline; the planned uninstall/restore cycle was a no-op. Documented in `.planning/spikes/75-hardware-discovery.md` Sections 1+2.
- **Init timeout concern:** Computer.Open() took 4272 ms on the dev box — above the 3000 ms TEMP-SVC-03 timeout. Plan 75-02 will need to raise it (with rationale) or accept frequent silent-failure mode on this hardware class.

### Open Questions

- Whether a true clean Win11 24H2 VM would also fail NVMe enumeration (dev box N/A may or may not generalize — hedged by scope-reduction "best-effort NVMe" language)
- Whether Plan 75-02 raises the init timeout to ~5000 ms or accepts frequent timeout-to-silent-failure on high-latency hardware

### Active TODOs

- [ ] Amend `ROADMAP.md` Phase 75 SC1 from "GPU + NVMe both readable" to "GPU readable; NVMe best-effort with documented N/A fallback"
- [ ] Amend `REQUIREMENTS.md` TEMP-TAB-03 defaults: drop NVMe from default-visible; add PawnIO/admin-elevation disclaimer to Settings help text
- [ ] Amend `REQUIREMENTS.md` TEMP-LINE-04 to require hiding the NVMe segment when `NvmeTempC == -1f` (make implicit contract explicit)
- [ ] Unblock Plan 75-02 once amendments committed
- [ ] Plan 77 (RMB menu) can proceed in parallel — no dependency on Plan 75-02 or on spike outcome

### Known Blockers

1. **Plan 75-02 (TemperatureService) is blocked** pending the three amendments above. The NO-GO gate requires scope reduction before Phase 76 opens; Plan 75-02 should not auto-advance.

## Session Continuity

### What Just Happened

Phase 75 Plan 01 (Hardware Discovery Spike) executed:

- **Task 1** — `.gitignore` entry + throwaway enumerator scaffolding. Committed as `5e654e2`.
- **Task 2** — Human-action checkpoint for PawnIO uninstall + enumerate + restore. User reported dev box was PawnIO-free at baseline; uninstall/restore cycle was a no-op (methodology variance documented in spike report).
- **Task 3** — `.planning/spikes/75-hardware-discovery.md` written (267 lines, 7 mandatory sections). Go/No-Go stamped **NO-GO (2026-05-04)**. D-05 threading path: **Path 2**. Committed as `cb26529`.

Scratch folder deleted post-spike. 75-01-SUMMARY.md written. This STATE.md update is part of the Plan 75-01 wrap-up commit.

### Next Session Should Know

- **Plan 75-02 cannot auto-execute.** The milestone orchestrator should halt Wave 2 and route to amendment flow before Plan 75-02 opens.
- **ROADMAP amendments are blocking.** Three documents need edits (ROADMAP.md, REQUIREMENTS.md once for TEMP-TAB-03, REQUIREMENTS.md once for TEMP-LINE-04) before Plan 75-02 unblocks.
- **Phase 77 (RMB menu) is not blocked.** It can be planned and executed in parallel with the amendment work.
- **Initialisation timeout will need attention in Plan 75-02.** Computer.Open() = 4272 ms on the dev box; 3000 ms TEMP-SVC-03 timeout may need a rationale-documented bump to ~5000 ms, or an explicit accept-the-silent-failure design choice.
- Baseline test count still 501 (433 Core + 68 App) — Plan 75-01 was docs-only; no code changed.

### Context for Continuation

- Milestone goal: System temperature display + tray menu via right-click
- Previous milestone: v4.1 Polish & Phrases (phases 70–74, shipped 2026-04-02)
- Config: mode=yolo, granularity=standard, research=true, commit_docs=true
- Research artifacts under `.planning/research/` — STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY
- Spike artifact: `.planning/spikes/75-hardware-discovery.md` (survives milestone archival; Phase 80 release docs can reference it)

---
*State snapshot: 2026-05-04 — Plan 75-01 complete (NO-GO); Plan 75-02 blocked pending scope amendment*
