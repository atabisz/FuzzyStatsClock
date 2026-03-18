---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Phrase Wrap + Installer
status: in_progress
stopped_at: Roadmap created — ready to plan Phase 50
last_updated: "2026-03-18T00:00:00Z"
last_activity: 2026-03-18 — v3.5 roadmap created; 3 phases defined (50–52)
progress:
  [          ] 0%
  completed_phases: 0/3
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Milestone v3.5 — Phrase Wrap + Installer

## Current Position

Milestone v3.5 roadmap created. No phases started yet.
Last completed milestone: v3.4 (phases 48–49, shipped 2026-03-18).

```
Progress: [          ] 0/3 phases
Phase 50: Installer + CI           [ Not started ]
Phase 51: README Docs Pass         [ Not started ]
Phase 52: Phrase Wrapping          [ Not started ]
```

Next action: `/gsd:plan-phase 50`

## Accumulated Context

### Decisions (carried from v3.3/v3.4)

- Installer: Inno Setup (not Velopack) — no app code changes, no custom Main(), no new NuGet packages
- Installer: per-user install to `%LOCALAPPDATA%\Programs\FuzzyClock\`, no UAC
- Installer version: from git tag, stripped + padded to X.Y.Z (e.g. v3.5 → 3.5.0); EXE stamped via /p:Version at publish time
- Installer upgrade: prompt user if app is running; relaunch checkbox on finish page; optional "remove settings" on uninstall
- Artifacts: `FuzzyClock-X.Y.Z.exe`, `FuzzyClockSetup-X.Y.Z.exe`, `checksums.txt`; CI creates draft GitHub Release on tag push
- Phrase wrap trigger: PhraseText.ActualWidth > StatsPanel.ActualWidth * 1.1 (phrase mode only)
- Phrase wrap split styles: "Nearest Midpoint" (word break closest to string midpoint, default) and "Natural Pause" (split after first grammatical/tonal beat)
- Phrase wrap setting exposed in Settings window (Appearance or Behavior tab)
- AppSettings: PhraseWrapEnabled (bool, default true), PhraseWrapStyle ("midpoint"/"natural", default "midpoint")
- Shadow text (ShadowText) must wrap identically to PhraseText — both are layered in the same Grid cell

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended (not blocking).

### Blockers/Concerns

None.
