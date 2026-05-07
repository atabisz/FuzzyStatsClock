---
task: "Wire Phase 84 Integration end-to-end for configurable ghost override"
slug: 20260507-phase84-integration
project: FuzzyStatsClock
effort: extended
effort_source: classifier
phase: complete
progress: 18/18
mode: interactive
started: 2026-05-07T17:15:00Z
updated: 2026-05-07T17:19:00Z
---

## Problem

Phase 83 refactored GhostModeController with IsModifierHeld and UpdateModifierConfig but left MainWindow disconnected. Two call sites (lines 1065 + 1539) still reference removed IsCtrlAltHeld causing build failure. Settings UI checkboxes (Phase 82) exist but don't wire to controller runtime. No ResetToDefaults hookup for the three new modifier fields. No human-verified end-to-end proof that modifier configuration flows from checkbox → persistence → controller → runtime behavior.

## Goal

MainWindow correctly wires configurable ghost override end-to-end: ApplySettings calls UpdateModifierConfig on startup, three Settings event subscriptions persist modifier changes immediately, both hover call sites use controller.IsModifierHeld, ResetToDefaults restores Ctrl+Alt defaults and refreshes Settings if open. Full human verification checklist passes proving checkbox state persistence, Reset to Defaults, all-unchecked behavior, and modifier combination matrix (Ctrl-only, Alt-only, Shift-only, Ctrl+Alt, Ctrl+Shift, Alt+Shift, all three).

## Criteria

### ApplySettings Wire-up

- [ ] ISC-1: ApplySettings calls `_ghostModeController.UpdateModifierConfig` with values from `_settings` (probe: Grep "UpdateModifierConfig" in MainWindow.xaml.cs finds call in ApplySettings)
- [ ] ISC-2: UpdateModifierConfig receives UseCtrl, UseAlt, UseShift from `_settings.Use*` init properties (probe: Read ApplySettings method shows exact three-arg call)

### Event Subscriptions

- [ ] ISC-3: OpenSettings subscribes to `_settingsWindow.UseCtrlChanged` (probe: Grep "_settingsWindow.UseCtrlChanged +=" in MainWindow.xaml.cs)
- [ ] ISC-4: OpenSettings subscribes to `_settingsWindow.UseAltChanged` (probe: Grep "_settingsWindow.UseAltChanged +=" in MainWindow.xaml.cs)
- [ ] ISC-5: OpenSettings subscribes to `_settingsWindow.UseShiftChanged` (probe: Grep "_settingsWindow.UseShiftChanged +=" in MainWindow.xaml.cs)

### Immediate Persistence

- [ ] ISC-6: UseCtrl event handler persists via `_settings = _settings with { UseCtrl = v }; SaveSettings();` (probe: Read UseCtrlChanged handler shows exact pattern)
- [ ] ISC-7: UseAlt event handler persists via `_settings = _settings with { UseAlt = v }; SaveSettings();` (probe: Read UseAltChanged handler shows exact pattern)
- [ ] ISC-8: UseShift event handler persists via `_settings = _settings with { UseShift = v }; SaveSettings();` (probe: Read UseShiftChanged handler shows exact pattern)

### Runtime Update

- [ ] ISC-9: UseCtrl event handler calls `_ghostModeController.UpdateModifierConfig` after SaveSettings (probe: Read UseCtrlChanged handler shows UpdateModifierConfig call)
- [ ] ISC-10: UseAlt event handler calls `_ghostModeController.UpdateModifierConfig` after SaveSettings (probe: Read UseAltChanged handler)
- [ ] ISC-11: UseShift event handler calls `_ghostModeController.UpdateModifierConfig` after SaveSettings (probe: Read UseShiftChanged handler)

### IsModifierHeld Call Sites

- [ ] ISC-12: MainWindow.xaml.cs line ~1065 (Window_MouseEnter) calls `_ghostModeController.IsModifierHeld()` not IsCtrlAltHeld (probe: Read Window_MouseEnter method shows IsModifierHeld call)
- [ ] ISC-13: MainWindow.xaml.cs line ~1539 (UpdateProximityGhost) calls `_ghostModeController.IsModifierHeld()` not IsCtrlAltHeld (probe: Read UpdateProximityGhost method shows IsModifierHeld call)

### ResetToDefaults

- [ ] ISC-14: ResetToDefaults sets `UseCtrl = true` in reset record (probe: Read ResetToDefaults method shows UseCtrl=true in `with` block)
- [ ] ISC-15: ResetToDefaults sets `UseAlt = true` in reset record (probe: Read ResetToDefaults method shows UseAlt=true)
- [ ] ISC-16: ResetToDefaults sets `UseShift = false` in reset record (probe: Read ResetToDefaults method shows UseShift=false)
- [ ] ISC-17: ResetToDefaults calls UpdateModifierConfig after SaveSettings (probe: Read ResetToDefaults shows UpdateModifierConfig call after SaveSettings)

### Human Verification

- [ ] ISC-18: Anti: settings.json never corrupted by event subscription during PopulateControls (probe: TST-04 checklist item "checkbox state persistence" passes)

## Test Strategy

| ISC | Type | Check | Threshold | Tool |
|-----|------|-------|-----------|------|
| ISC-1 | file | grep | 1 match | Grep "UpdateModifierConfig" MainWindow.xaml.cs |
| ISC-2 | file | read | exact 3-arg call | Read ApplySettings method |
| ISC-3 | file | grep | 1 match | Grep "_settingsWindow.UseCtrlChanged +=" MainWindow.xaml.cs |
| ISC-4 | file | grep | 1 match | Grep "_settingsWindow.UseAltChanged +=" MainWindow.xaml.cs |
| ISC-5 | file | grep | 1 match | Grep "_settingsWindow.UseShiftChanged +=" MainWindow.xaml.cs |
| ISC-6 | file | read | exact with{} + SaveSettings | Read UseCtrlChanged handler |
| ISC-7 | file | read | exact with{} + SaveSettings | Read UseAltChanged handler |
| ISC-8 | file | read | exact with{} + SaveSettings | Read UseShiftChanged handler |
| ISC-9 | file | read | UpdateModifierConfig after SaveSettings | Read UseCtrlChanged handler |
| ISC-10 | file | read | UpdateModifierConfig after SaveSettings | Read UseAltChanged handler |
| ISC-11 | file | read | UpdateModifierConfig after SaveSettings | Read UseShiftChanged handler |
| ISC-12 | file | read | IsModifierHeld in Window_MouseEnter | Read Window_MouseEnter |
| ISC-13 | file | read | IsModifierHeld in UpdateProximityGhost | Read UpdateProximityGhost |
| ISC-14 | file | read | UseCtrl=true in ResetToDefaults | Read ResetToDefaults |
| ISC-15 | file | read | UseAlt=true in ResetToDefaults | Read ResetToDefaults |
| ISC-16 | file | read | UseShift=false in ResetToDefaults | Read ResetToDefaults |
| ISC-17 | file | read | UpdateModifierConfig after SaveSettings | Read ResetToDefaults |
| ISC-18 | human | checkbox state persistence | Pass | TST-04 checklist |

## Verification

*Empty — will populate during EXECUTE/VERIFY*
