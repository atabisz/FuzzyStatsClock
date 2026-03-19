---
phase: 57-re-introduce-nixie-into-the-new-architecture
plan: 01
subsystem: ui
tags: [csharp, wpf, clocktype, nixie, phrase-provider, settings]

# Dependency graph
requires: []
provides:
  - GetSegmentKey implemented on all 6 novelty phrase providers (Yoda, Jive, Pirate, Shakespeare, Dwarf, ValleyGirl)
  - AppSettings record with ClockType + LcdUse24Hr + LcdShowSeconds + LcdStyle + LcdSize; DialMode removed
  - SettingsSnapshot record with ClockType + LCD fields + ShowHourTicks + ShowMinuteDots + ShowHourNumbers; DialMode removed
  - FuzzyClock.Core compiles with 0 errors
  - MainWindow and SettingsWindow stale DialMode references replaced with ClockType equivalents
affects:
  - 57-02 (SettingsWindow wiring depends on these data model fields)
  - FuzzyClock.App build (reduced from 62 errors to 7; remaining 7 are SettingsWindow event stubs for Plan 02)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All IPhraseProvider implementations include GetSegmentKey(DateTime dt) => GetPhrase(dt)"
    - "ClockType enum replaces DialMode bool as the discriminator for clock view selection"
    - "AppSettings and SettingsSnapshot are init-only records; new fields follow existing whitespace alignment"

key-files:
  created: []
  modified:
    - FuzzyClock.Core/YodaPhraseProvider.cs
    - FuzzyClock.Core/JivePhraseProvider.cs
    - FuzzyClock.Core/PiratePhraseProvider.cs
    - FuzzyClock.Core/ShakespearePhraseProvider.cs
    - FuzzyClock.Core/DwarfPhraseProvider.cs
    - FuzzyClock.Core/ValleyGirlPhraseProvider.cs
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/SettingsWindow.xaml.cs

key-decisions:
  - "DialMode bool removed from both AppSettings and SettingsSnapshot; ClockType enum is the single source of truth for clock view selection"
  - "ApplyPhraseWrap guard changed from _dialMode to _clockType != ClockType.Phrase (semantically equivalent, consistent with existing ClockType usage)"
  - "SettingsWindow.PopulateControls changed from s.DialMode to s.ClockType == ClockType.Dial (semantically equivalent)"

patterns-established:
  - "GetSegmentKey pattern: public string GetSegmentKey(DateTime dt) => GetPhrase(dt)"
  - "ClockType is the authoritative discriminator for all clock-mode branching in MainWindow"

requirements-completed: [NIX-01, NIX-04]

# Metrics
duration: 4min
completed: 2026-03-19
---

# Phase 57 Plan 01: Fix Pre-existing Build Errors and Migrate Data Model Records Summary

**GetSegmentKey added to 6 novelty phrase providers; AppSettings/SettingsSnapshot migrated from DialMode bool to ClockType enum with full LCD and dial-decoration fields**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-19T01:53:34Z
- **Completed:** 2026-03-19T01:57:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- All 6 novelty phrase providers (Yoda, Jive, Pirate, Shakespeare, Dwarf, ValleyGirl) now implement `GetSegmentKey(DateTime dt)`, satisfying the `IPhraseProvider` interface; FuzzyClock.Core builds with 0 errors
- AppSettings record: `DialMode` property removed; `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize` properties added
- SettingsSnapshot record: `DialMode` property removed; `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`, `ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers` properties added
- FuzzyClock.App error count reduced from 62 to 7 (remaining 7 are pre-existing SettingsWindow event stubs for Plan 02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GetSegmentKey to 6 novelty phrase providers** - `a25a0d9` (feat)
2. **Task 2: Migrate AppSettings and SettingsSnapshot to ClockType enum + LCD fields** - `cf63c46` (feat)

## Files Created/Modified

- `FuzzyClock.Core/YodaPhraseProvider.cs` - Added `GetSegmentKey(DateTime dt) => GetPhrase(dt)`
- `FuzzyClock.Core/JivePhraseProvider.cs` - Added `GetSegmentKey(DateTime dt) => GetPhrase(dt)`
- `FuzzyClock.Core/PiratePhraseProvider.cs` - Added `GetSegmentKey(DateTime dt) => GetPhrase(dt)`
- `FuzzyClock.Core/ShakespearePhraseProvider.cs` - Added `GetSegmentKey(DateTime dt) => GetPhrase(dt)`
- `FuzzyClock.Core/DwarfPhraseProvider.cs` - Added `GetSegmentKey(DateTime dt) => GetPhrase(dt)`
- `FuzzyClock.Core/ValleyGirlPhraseProvider.cs` - Added `GetSegmentKey(DateTime dt) => GetPhrase(dt)`
- `FuzzyClock.App/AppSettings.cs` - Removed `DialMode`; added `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`
- `FuzzyClock.App/SettingsSnapshot.cs` - Removed `DialMode`; added `ClockType`, LCD fields, dial-decoration fields
- `FuzzyClock.App/MainWindow.xaml.cs` - Replaced `_dialMode` with `_clockType != ClockType.Phrase` in `ApplyPhraseWrap`
- `FuzzyClock.App/SettingsWindow.xaml.cs` - Replaced `s.DialMode` with `s.ClockType == ClockType.Dial` in `PopulateControls`

## Decisions Made

- **DialMode removed from both records.** The `DialMode` bool was the only mechanism distinguishing Phrase vs Dial clock modes; it is superseded by `ClockType` which covers Phrase, Dial, Lcd, and Nixie. Removing it eliminates ambiguity and aligns with the enum already used throughout MainWindow.
- **Stale MainWindow/SettingsWindow DialMode references fixed inline.** Two references (`_dialMode` in MainWindow line 718, `s.DialMode` in SettingsWindow line 79) were broken by removing `DialMode` from `SettingsSnapshot`. Both were replaced with semantically equivalent `ClockType`-based expressions as part of Task 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale _dialMode reference in MainWindow.ApplyPhraseWrap**
- **Found during:** Task 2 (Migrate AppSettings and SettingsSnapshot)
- **Issue:** Removing `DialMode` from `SettingsSnapshot` caused `MainWindow.xaml.cs(718)` to fail: `_dialMode` field no longer exists
- **Fix:** Replaced `_dialMode` with `_clockType != ClockType.Phrase` — semantically equivalent (phrase wrap skipped whenever not in Phrase clock mode)
- **Files modified:** `FuzzyClock.App/MainWindow.xaml.cs`
- **Verification:** Build error CS0103 resolved
- **Committed in:** cf63c46 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed stale s.DialMode reference in SettingsWindow.PopulateControls**
- **Found during:** Task 2 (Migrate AppSettings and SettingsSnapshot)
- **Issue:** Removing `DialMode` from `SettingsSnapshot` caused `SettingsWindow.xaml.cs(79)` to fail: `s.DialMode` no longer exists
- **Fix:** Replaced `s.DialMode` with `s.ClockType == ClockType.Dial` — semantically equivalent
- **Files modified:** `FuzzyClock.App/SettingsWindow.xaml.cs`
- **Verification:** Build error CS1061 resolved
- **Committed in:** cf63c46 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs — stale field references broken by DialMode removal)
**Impact on plan:** Both fixes were direct consequences of removing `DialMode` from `SettingsSnapshot`. No scope creep.

## Issues Encountered

- Pre-existing FuzzyClock.App build had 62 errors before this plan. After Task 2, 7 errors remain — all are `SettingsWindow` missing `ClockTypeChanged`, `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged` events. These were pre-existing before Task 2 changes and are in scope for Plan 02.

## Next Phase Readiness

- FuzzyClock.Core compiles cleanly; all IPhraseProvider implementations complete
- AppSettings and SettingsSnapshot have all fields MainWindow already references
- Plan 02 (SettingsWindow wiring) can now proceed — it needs to add the 7 missing events to SettingsWindow to reach full compilation

---
*Phase: 57-re-introduce-nixie-into-the-new-architecture*
*Completed: 2026-03-19*
