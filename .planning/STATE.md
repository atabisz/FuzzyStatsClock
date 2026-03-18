---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Phrase Wrap + Installer
status: in_progress
stopped_at: Completed 50-02-PLAN.md
last_updated: "2026-03-18T02:12:37Z"
last_activity: 2026-03-18 — 50-02 complete; release.yml updated with version injection, ISCC, checksums, draft release
progress:
  [█████████░] 89%
  completed_phases: 0/3
  total_plans: 9
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Milestone v3.5 — Phrase Wrap + Installer

## Current Position

Phase 50 complete (both plans done). FuzzyClock.iss + release.yml shipped.
Last completed milestone: v3.4 (phases 48–49, shipped 2026-03-18).

```
Progress: [██░░░░░░░░] ~20%
Phase 50: Installer + CI           [ Complete — 50-01 and 50-02 done ]
Phase 51: README Docs Pass         [ Not started ]
Phase 52: Phrase Wrapping          [ Not started ]
```

Next action: execute phase 51 (README docs pass)

## Accumulated Context

### Decisions (carried from v3.3/v3.4 + 50-02)

- CI release.yml: compile installer (ISCC) BEFORE renaming EXE — ISCC reads `publish/FuzzyClock.exe` (plain name); rename produces `FuzzyClock-X.Y.Z.exe` after ISCC completes
- CI release.yml: AssemblyVersion passed as X.Y.Z.0 (4-part) to satisfy .NET assembly version requirement
- CI release.yml: three artifacts (bare EXE, installer EXE, checksums.txt) uploaded as draft GitHub Release on v* tag push

### Decisions (carried from v3.3/v3.4)

- Installer: Inno Setup (not Velopack) — no app code changes, no custom Main(), no new NuGet packages
- Installer: per-user install to `%LOCALAPPDATA%\Programs\FuzzyClock\`, no UAC
- Installer version: from git tag, stripped + padded to X.Y.Z (e.g. v3.5 → 3.5.0); EXE stamped via /p:Version at publish time
- Installer upgrade: prompt user if app is running; relaunch checkbox on finish page; optional "remove settings" on uninstall
- Artifacts: `FuzzyClock-X.Y.Z.exe`, `FuzzyClockSetup-X.Y.Z.exe`, `checksums.txt`; CI creates draft GitHub Release on tag push
- AppId GUID `B8F2E3A1-7C4D-4E5F-9A6B-1D2E3F4A5B6C` hardcoded in FuzzyClock.iss — never change; upgrade detection depends on stable GUID
- Settings dir `{localappdata}\FuzzyClock` absent from [Dirs] in .iss — settings.json survives uninstall by default; optional Pascal checkbox for removal
- Phrase wrap trigger: PhraseText.ActualWidth > StatsPanel.ActualWidth * 1.1 (phrase mode only)
- Phrase wrap split styles: "Nearest Midpoint" (word break closest to string midpoint, default) and "Natural Pause" (split after first grammatical/tonal beat)
- Phrase wrap setting exposed in Settings window (Appearance or Behavior tab)
- AppSettings: PhraseWrapEnabled (bool, default true), PhraseWrapStyle ("midpoint"/"natural", default "midpoint")
- Shadow text (ShadowText) must wrap identically to PhraseText — both are layered in the same Grid cell

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended (not blocking).

### Blockers/Concerns

None.
