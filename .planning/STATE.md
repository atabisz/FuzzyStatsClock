---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Phrase Wrap + Installer
status: in_progress
stopped_at: Defining requirements
last_updated: "2026-03-18T00:00:00Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Phrase Wrap + Installer
status: in_progress
stopped_at: Defining requirements for v3.5
last_updated: "2026-03-18T00:00:00Z"
last_activity: 2026-03-18 — v3.5 milestone started; defining requirements
progress:
  [          ] 0%
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Milestone v3.5 — Phrase Wrap + Installer

## Current Position

Milestone v3.5 starting — defining requirements.
Last completed milestone: v3.4 (phases 48–49, shipped 2026-03-18).

```
Progress: [          ] 0/TBD phases
```

## Accumulated Context

### Decisions (carried from v3.3/v3.4)

- Installer: Inno Setup (not Velopack) — no app code changes, no custom Main(), no new NuGet packages
- Installer: per-user install to `%LOCALAPPDATA%\Programs\FuzzyClock\`, no UAC
- Installer version: from git tag, stripped + padded to X.Y.Z; EXE stamped via /p:Version at publish time
- Installer upgrade: prompt user if app is running; relaunch checkbox on finish page; optional "remove settings" on uninstall
- Artifacts: `FuzzyClock-X.Y.Z.exe`, `FuzzyClockSetup-X.Y.Z.exe`, `checksums.txt`; release as draft on tag push
- Phrase wrap split style: "nearest midpoint" (default) and "natural pause" as user-selectable setting in Settings window
- Phrase wrap trigger: phrase text measured width > stats panel width + 10%

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended (not blocking).

### Blockers/Concerns

None.
