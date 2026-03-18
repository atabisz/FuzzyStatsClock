---
phase: 52-phrase-wrapping
plan: 02
subsystem: ui
tags: [wpf, phrase-wrap, inlines, settings-window, app-settings]

# Dependency graph
requires:
  - phase: 52-01
    provides: PhraseWrapService.ComputeSplit (midpoint + natural split logic)

provides:
  - PhraseWrapEnabled and PhraseWrapStyle persisted in AppSettings and settings.json
  - ApplyPhraseWrap() integrating PhraseWrapService into MainWindow timer loop
  - SettingsWindow Appearance tab Phrase Wrap controls (CheckBox + radio buttons)
  - PhraseWrapEnabledChanged and PhraseWrapStyleChanged events wired to MainWindow setters

affects: [53-installer-ci, future-phrase-display-phases]

# Tech tracking
tech-stack:
  added: [System.Windows.Documents (Inlines API for TextBlock)]
  patterns: [Inlines-based TextBlock text assignment instead of .Text property for wrap support]

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Inlines.Clear() + Add(new Run(text)) used for single-line path so wrap and non-wrap paths are consistent"
  - "_currentRawPhrase field replaces PhraseText.Text as the UpdatePhraseIfChanged guard cache; PhraseText.Text is no longer reliable once Inlines are used"
  - "ApplyPhraseWrap calls UpdateLayout() after SetPhraseTextSingleLine to measure PhraseText.ActualWidth before deciding whether to split"
  - "allowNatural passed as PhraseEngine.CurrentLocale.StartsWith(en-) so natural pause split is English-only without PhraseWrapService knowing about locales"
  - "WrapStylePanel.IsEnabled toggled to disabled when ChkPhraseWrap is unchecked, preventing style choice while wrap is off"

patterns-established:
  - "TextBlock phrase cache invalidation: always clear _currentRawPhrase, never PhraseText.Text directly"
  - "SettingsWindow event wiring: PhraseWrapEnabledChanged/PhraseWrapStyleChanged follow same bool/string Action<T> pattern as existing events"

requirements-completed: [WRAP-01, WRAP-02, WRAP-03]

# Metrics
duration: 18min
completed: 2026-03-18
---

# Phase 52 Plan 02: Phrase Wrap Integration Summary

**Phrase wrapping wired into MainWindow: long phrases auto-split via PhraseWrapService Inlines, with Appearance tab controls, AppSettings persistence, and ResetToDefaults support**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-18T03:00:00Z
- **Completed:** 2026-03-18T03:18:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AppSettings and SettingsSnapshot have PhraseWrapEnabled (bool, default true) and PhraseWrapStyle (string, default "midpoint") with full round-trip persistence
- SettingsWindow Appearance tab now shows a Phrase Wrap row with a CheckBox and Nearest Midpoint/Natural Pause radio buttons; WrapStylePanel.IsEnabled tracks checkbox state
- MainWindow integrates PhraseWrapService.ComputeSplit: measures PhraseText.ActualWidth vs StatsPanel.ActualWidth * 1.1 threshold, injects LineBreak inline when exceeded
- All 247 tests pass (222 Core + 25 App)

## Task Commits

1. **Task 1: Add AppSettings + SettingsSnapshot properties and SettingsWindow UI** - `0f61a42` (feat)
2. **Task 2: Wire PhraseWrapService into MainWindow with Inlines-based rendering** - `0c3f23d` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `FuzzyClock.App/AppSettings.cs` - Added PhraseWrapEnabled (bool default true) and PhraseWrapStyle (string default "midpoint")
- `FuzzyClock.App/SettingsSnapshot.cs` - Same two properties for SettingsWindow population at open time
- `FuzzyClock.App/SettingsWindow.xaml` - Fifth row in Appearance Grid: Phrase Wrap CheckBox + WrapStylePanel with radio buttons
- `FuzzyClock.App/SettingsWindow.xaml.cs` - PhraseWrapEnabledChanged/PhraseWrapStyleChanged events, ChkPhraseWrap_Changed/RbWrapMidpoint_Checked/RbWrapNatural_Checked handlers, PopulateControls additions
- `FuzzyClock.App/MainWindow.xaml.cs` - _phraseWrapEnabled/_phraseWrapStyle/_currentRawPhrase fields; ApplyPhraseWrap(); SetPhraseTextSingleLine(); SetPhraseWrapEnabled/Style setters; ApplySettings/SaveSettings/GetCurrentSettingsSnapshot/OpenSettings/ResetToDefaults all updated

## Decisions Made
- Used `_currentRawPhrase` field as the guard cache in `UpdatePhraseIfChanged` because `PhraseText.Text` becomes unreliable once Inlines are used (WPF clears `.Text` when Inlines are non-empty)
- `ApplyPhraseWrap` measures after `UpdateLayout()` to get a valid `ActualWidth` before deciding to split
- `allowNatural` derived from `PhraseEngine.CurrentLocale.StartsWith("en-")` at the call site, keeping PhraseWrapService locale-agnostic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phrase wrapping feature is fully functional end-to-end (Plan 01 service + Plan 02 integration)
- Phase 52 complete; milestone v3.5 (Phrase Wrap + Installer) phrase wrap component is done
- No blockers for remaining milestone work (installer/CI phases already complete)

---
*Phase: 52-phrase-wrapping*
*Completed: 2026-03-18*
