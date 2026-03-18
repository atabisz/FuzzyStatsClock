---
phase: 54-backdrop-enhancement-full-widget-coverage-and-always-visible-option-with-opacity-setting
plan: 01
subsystem: ui
tags: [wpf, backdrop, settings, opacity, border]

# Dependency graph
requires:
  - phase: 52-phrase-wrapping
    provides: PhraseWrapEnabled/PhraseWrapStyle AppSettings + SettingsSnapshot properties (this plan follows the same pattern)
  - phase: 41-settings-window
    provides: SettingsWindow event pattern, SettingsSnapshot, _suppressEvents guard
provides:
  - BackdropBorder covering full widget footprint (phrase + date + stats + uptime)
  - BackdropAlwaysVisible setting (bool, default false) — hover-only preserved by default
  - BackdropOpacityPercent setting (int, default 35) — replaces hardcoded 0x59 alpha
  - Backdrop section in SettingsWindow Appearance tab with checkbox + opacity slider
affects:
  - future phases modifying SettingsWindow Appearance tab (height budget now ~410px of 560px usable)
  - any phase touching ContentBorder.Background hover sites

# Tech tracking
tech-stack:
  added: []
  patterns:
    - BackdropBorder as sibling Border in outer hit-test Grid (Z-order layering via declaration order)
    - AlwaysVisible guard pattern on clear paths: `if (!_backdropAlwaysVisible) BackdropBorder.Background = Transparent`
    - BackdropAlpha() helper converts int percent to clamped byte (25-255)

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs

key-decisions:
  - "BackdropBorder declared as first child of outer hit-test Grid (behind inner Grid via Z-order), not wrapping ContentBorder — preserves ContentBorder in Row 0 of inner Grid"
  - "BackdropBorder has IsHitTestVisible=False to prevent intercepting mouse events from inner Grid children"
  - "ContentBorder hover sites keep their backdrop (double-depth effect on phrase row preserved); BackdropBorder adds single-depth to full widget"
  - "AlwaysVisible guard on clear paths only (ghost cleanup, mouse leave, ghost restored) — hover enter sets both unconditionally (idempotent when AlwaysVisible=true)"
  - "Hardcoded 0x59 alpha replaced by BackdropAlpha() so both ContentBorder and BackdropBorder depths stay proportional when opacity changes"
  - "Default 35% opacity and hover-only (AlwaysVisible=false) produce zero visual regression for existing users"

patterns-established:
  - "BackdropAlpha() pattern: (byte)Math.Clamp((int)(percent / 100.0 * 255), 25, 255) — used for both ContentBorder and BackdropBorder"
  - "ApplyBackdropState() helper: called from ApplySettings, ResetToDefaults, and SetBackdropAlwaysVisible — not from hover enter/leave (those set directly)"
  - "SetBackdropOpacityPercent live-update guard: if (_backdropAlwaysVisible || _isHoverFastRefresh) — either means backdrop is currently visible"

requirements-completed: [BDROP-01, BDROP-02, BDROP-03]

# Metrics
duration: 15min
completed: 2026-03-18
---

# Phase 54 Plan 01: Backdrop Enhancement Summary

**Full-widget BackdropBorder with configurable opacity (10-100%, default 35%) and always-visible option wired to SettingsWindow Appearance tab**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-18T05:53:00Z
- **Completed:** 2026-03-18T06:08:42Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- BackdropBorder covers the full widget (phrase + date + stats + uptime) via Z-order sibling in outer hit-test Grid
- BackdropAlwaysVisible setting keeps backdrop permanently visible without hover; default false preserves existing behavior
- BackdropOpacityPercent slider (10-100, step 5) replaces hardcoded 0x59 alpha for both ContentBorder and BackdropBorder
- Double-depth phrase row effect preserved: ContentBorder + BackdropBorder on phrase area, BackdropBorder only on stats/date
- All 267 tests pass (242 Core + 25 App), 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: BackdropBorder XAML + AppSettings + all MainWindow code-behind logic** - `6808cef` (feat)
2. **Task 2: Backdrop section in SettingsWindow Appearance tab + event handlers** - `0b0f07d` (feat)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml` - Added BackdropBorder as first child of outer hit-test Grid
- `FuzzyClock.App/MainWindow.xaml.cs` - BackdropAlpha(), ApplyBackdropState(), SetBackdropAlwaysVisible(), SetBackdropOpacityPercent(), updated 4 ContentBorder sites, ApplySettings/SaveSettings/GetCurrentSettingsSnapshot/ResetToDefaults
- `FuzzyClock.App/AppSettings.cs` - BackdropAlwaysVisible (bool, default false) and BackdropOpacityPercent (int, default 35)
- `FuzzyClock.App/SettingsSnapshot.cs` - Matching BackdropAlwaysVisible and BackdropOpacityPercent properties
- `FuzzyClock.App/SettingsWindow.xaml` - Backdrop section in Appearance tab: always-visible checkbox + opacity slider
- `FuzzyClock.App/SettingsWindow.xaml.cs` - BackdropAlwaysVisibleChanged/BackdropOpacityPercentChanged events + handlers + PopulateControls entries

## Decisions Made
- BackdropBorder placed as first Grid child (behind inner Grid), not wrapping ContentBorder — ContentBorder remains in Row 0 of inner Grid per anti-pattern guidance
- IsHitTestVisible=False on BackdropBorder prevents phantom hover events
- AlwaysVisible guard on clear paths only — hover enter sets both ContentBorder and BackdropBorder unconditionally (idempotent)
- Hardcoded 0x59 replaced with BackdropAlpha() so proportional depth is maintained when opacity slider is adjusted
- Task 1 and Task 2 form one buildable unit (Task 1 wires SettingsWindow events, Task 2 declares them); committed separately per task protocol

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 1 build alone fails (CS1061) because OpenSettings wires SettingsWindow events declared in Task 2 — expected sequencing issue resolved by completing Task 2 before verifying the combined build.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backdrop enhancement complete; BackdropBorder, AlwaysVisible, and opacity settings fully functional
- All existing tests pass; no regressions
- Phase 54 plan 01 is the only plan in this phase

---
*Phase: 54-backdrop-enhancement-full-widget-coverage-and-always-visible-option-with-opacity-setting*
*Completed: 2026-03-18*
