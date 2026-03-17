---
phase: 48-settings-window-visual-redesign
plan: 01
subsystem: ui
tags: [wpf, xaml, dark-mode, thememode, settings-window, fluent]

# Dependency graph
requires:
  - phase: 41-47-settings-window
    provides: SettingsWindow.xaml with 3-tab layout (Appearance/Stats/Behavior)
provides:
  - Dark-mode SettingsWindow via ThemeMode="Dark" — standard controls restyled automatically
  - Hardcoded light colors replaced with dark equivalents in SegmentButtonStyle, rail borders, theme swatches, and description text
  - App.xaml and MainWindow.xaml byte-for-byte unchanged (no style leakage)
affects: [49-single-instance, 50-edge-snap, 51-installer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ThemeMode=Dark on Window element only (not App.xaml) prevents style leakage to MainWindow"
    - "Segment button rail border: #FF3A3A3A dark background"
    - "Theme swatch card: #FF2D2D2D background, #FFD0D0D0 label text"
    - "Muted description text on dark bg: #FF999999 (was #FF666666)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/SettingsWindow.xaml

key-decisions:
  - "ThemeMode=Dark applied to SettingsWindow Window element only — App.xaml stays empty (<Application.Resources />) to prevent MainWindow overlay from picking up dark theme"
  - "13 hardcoded light hex values replaced: SegmentButtonStyle (3), rail borders (2), theme swatches (10 — 5 bg + 5 label), description TextBlocks (2)"
  - "Pre-existing flaky test HourWrap_QualifierAndEmphasis (static PhraseEngine state + parallel execution race) — confirmed out-of-scope, passes when run sequentially; deferred to future test infrastructure fix"

patterns-established:
  - "ThemeMode=Dark: window-local attribute, does not propagate to App.xaml or other windows"
  - "When UseWindowsForms=true and WPF ThemeMode coexist, color aliases must be verified"

requirements-completed: [SETR-01, SETR-02, SETR-03, SETR-04]

# Metrics
duration: 15min
completed: 2026-03-18
---

# Phase 48 Plan 01: Settings Window Visual Redesign Summary

**ThemeMode="Dark" applied to SettingsWindow with 13 light-color replacements — all standard WPF controls (CheckBox, RadioButton, ComboBox, Button, Slider) now render in Fluent dark theme with no style leakage to MainWindow**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-18
- **Completed:** 2026-03-18
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments
- Added `ThemeMode="Dark"` to `SettingsWindow` Window element — all standard WPF controls automatically restyled via Fluent dark theme
- Replaced 13 hardcoded light hex color values: SegmentButtonStyle (selected/hover states), Font Size and Clock Style rail borders, theme swatch card backgrounds and labels, Behavior tab description text
- Verified App.xaml and MainWindow.xaml are unchanged (zero style leakage to transparent overlay)
- Human visual sign-off confirmed: dark background, light text, consistent styling across all three tabs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ThemeMode and replace hardcoded light colors in SettingsWindow.xaml** - `37ad175` (feat)
2. **Task 2: Visual verification of dark-mode Settings window** - checkpoint approved by user (no file changes)

## Files Created/Modified
- `FuzzyClock.App/SettingsWindow.xaml` - ThemeMode="Dark" on Window element; 13 hardcoded light colors replaced with dark equivalents

## Decisions Made
- ThemeMode="Dark" on SettingsWindow only — App.xaml stays empty to prevent MainWindow overlay from being affected. Confirmed post-research that ThemeMode is window-local.
- No spacing/margin changes needed — SETR-03 satisfied by existing adequate margins (confirmed visually).

## Deviations from Plan

None — plan executed exactly as written. The 13 color replacements and ThemeMode attribute were applied as specified in the plan interfaces table.

## Issues Encountered

**Pre-existing flaky test:** `HourWrap_QualifierAndEmphasis (11,50,"nearly","twelve")` fails intermittently when the full test suite runs in parallel (MSTest parallel workers=20). The failure is a race condition in static PhraseEngine state — confirmed pre-existing by checking the git diff (only `SettingsWindow.xaml` changed between commits). The test passes reliably when run sequentially (`Workers=1`) and passes in isolation. This is out of scope for Phase 48.

Deferred to deferred-items: fix `[DoNotParallelize]` scope or add per-test isolation to prevent static PhraseEngine state corruption under parallel test execution.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Dark-mode Settings window complete and visually approved
- App.xaml and MainWindow.xaml confirmed unchanged
- Ready for Phase 49: ResetToDefaults() phrase style/locale fix (FIX-01)

## Self-Check: PASSED

- FOUND: `.planning/phases/48-settings-window-visual-redesign/48-01-SUMMARY.md`
- FOUND: `FuzzyClock.App/SettingsWindow.xaml`
- FOUND: commit `37ad175` (feat(48-01): apply dark-mode styling to SettingsWindow)

---
*Phase: 48-settings-window-visual-redesign*
*Completed: 2026-03-18*
