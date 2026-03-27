---
phase: 55-phrase-personalities
plan: 01
subsystem: phrase-providers
tags: [csharp, IPhraseProvider, bucket-table, personality, rude2, pirate, dwarf, jive, valleygirl, yoda, shakespeare]

# Dependency graph
requires:
  - phase: 41
    provides: IPhraseProvider interface and PhraseEngine bucket-table pattern

provides:
  - RudePhraseProvider rewritten with internet-slang vocabulary (Rude 2.0)
  - PiratePhraseProvider — en-pirate locale key, nautical/arr vocabulary
  - DwarfPhraseProvider — en-dwarf locale key, gruff terse vocabulary
  - JivePhraseProvider — en-jive locale key, 1940s Harlem jazz slang
  - ValleyGirlPhraseProvider — en-valleygirl locale key, Valley Girl slang
  - YodaPhraseProvider — en-yoda locale key, inverted Yoda syntax
  - ShakespearePhraseProvider — en-shakespeare locale key, Early Modern English with OrdinalHourWords and {ho} token

affects:
  - 55-02 (wiring: PhraseEngine._providers + MainWindow switches + SettingsWindow XAML)
  - 55-03 (tests: new provider test classes + updated Rude tests)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IPhraseProvider bucket table: 12 (UpperBound, Template) entries, noon/midnight specials, {h}/{h1} token substitution, GetStructuredPhrase returns ('', GetPhrase(dt))"
    - "ShakespearePhraseProvider OrdinalHourWords: private static array for {ho} token resolved before {h} and {h1}"

key-files:
  created:
    - FuzzyClock.Core/PiratePhraseProvider.cs
    - FuzzyClock.Core/DwarfPhraseProvider.cs
    - FuzzyClock.Core/JivePhraseProvider.cs
    - FuzzyClock.Core/ValleyGirlPhraseProvider.cs
    - FuzzyClock.Core/YodaPhraseProvider.cs
    - FuzzyClock.Core/ShakespearePhraseProvider.cs
  modified:
    - FuzzyClock.Core/RudePhraseProvider.cs
    - FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs

key-decisions:
  - "RudePhraseProvider rewritten in-place (same class, same en-rude locale key) — only bucket strings and specials replaced with Rude 2.0 internet-slang vocabulary"
  - "All six new providers use the identical bucket-table skeleton from RudePhraseProvider — no structural variation except ShakespearePhraseProvider's OrdinalHourWords array"
  - "Rude tests updated atomically with provider rewrite — replaced 'move it'/'get on with it' assertion with internet-slang checks; added noon/midnight equality assertions"

patterns-established:
  - "All new personality providers: flat in FuzzyClock.Core/ root, no Providers/ subdirectory"
  - "ShakespearePhraseProvider: {ho} token resolved first, then {h}, then {h1} — order matters to prevent partial substring replacement"

requirements-completed: [PHRASE-01, PHRASE-02, PHRASE-03, PHRASE-04, PHRASE-05, PHRASE-06, PHRASE-07]

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 55 Plan 01: Phrase Personalities — Provider Classes Summary

**Seven IPhraseProvider classes created/rewritten: Rude 2.0 with internet slang (WTF/bruh/dafaq/smh) and six new personalities (Pirate, Dwarf, Jive, Valley Girl, Yoda, Shakespearean) using exact research vocabulary tables**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T08:25:07Z
- **Completed:** 2026-03-11T08:27:53Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Rewrote RudePhraseProvider bucket table and specials with Rude 2.0 internet-slang vocabulary (WTF, bruh, dafaq, smh, ngl, lmao, rn, literally, tf); old British passive-aggressive strings gone
- Created six new IPhraseProvider implementations (Pirate, Dwarf, Jive, ValleyGirl, Yoda, Shakespeare), each with 12-bucket table, noon/midnight specials, and standard GetStructuredPhrase contract
- ShakespearePhraseProvider includes private OrdinalHourWords array and resolves {ho} token (first–twelfth) before {h} and {h1} substitutions
- Updated RudePhraseProviderTests atomically: replaced "move it"/"get on with it" assertion with internet-slang check; added Noon and Midnight equality assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite RudePhraseProvider with Rude 2.0 vocabulary** - `8c3a515` (feat)
2. **Task 2: Create six new personality provider classes** - `b70c805` (feat)

## Files Created/Modified

- `FuzzyClock.Core/RudePhraseProvider.cs` - Rewrote Buckets array and noon/midnight specials; updated XML doc comment
- `FuzzyClock.Core/PiratePhraseProvider.cs` - New: en-pirate, nautical slang, arr/yarr vocabulary
- `FuzzyClock.Core/DwarfPhraseProvider.cs` - New: en-dwarf, gruff terse vocabulary, aye/bah/by the stone
- `FuzzyClock.Core/JivePhraseProvider.cs` - New: en-jive, 1940s Harlem jazz slang, daddy-o/dig it/solid
- `FuzzyClock.Core/ValleyGirlPhraseProvider.cs` - New: en-valleygirl, Valley Girl slang, like/omg/fer sure
- `FuzzyClock.Core/YodaPhraseProvider.cs` - New: en-yoda, inverted Yoda syntax, hmm/yes/mmm
- `FuzzyClock.Core/ShakespearePhraseProvider.cs` - New: en-shakespeare, Early Modern English, OrdinalHourWords array + {ho} token
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` - Updated RudePhraseProviderTests to match Rude 2.0 vocabulary; added Noon/Midnight assertions

## Decisions Made

- Rude rewrite is in-place (same class name, same locale key "en-rude") — only the bucket strings and specials change; the class skeleton, HourWords array, and GetPhrase/GetStructuredPhrase logic are preserved
- Rude test update committed atomically with provider rewrite to prevent test count from dropping below the 248 floor
- ShakespearePhraseProvider resolves {ho} before {h} to avoid partial matches (e.g., template containing {ho} would be mangled if {h} were replaced first)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

MSBuild MSB3492 transient cache file lock on first build attempt ("Could not read existing file FuzzyClock.Core.AssemblyInfoInputs.cache"). Resolved by running a second build without `--no-restore` flag which regenerated the cache. Not a code error — tooling artifact.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All seven provider class files exist in `FuzzyClock.Core/` and compile cleanly (0 errors)
- Plan 02 (wiring) can now register providers in `PhraseEngine._providers`, add MainWindow locale switch cases, and add SettingsWindow ComboBoxItems
- Plan 03 (tests) can now add new provider test classes following the established pattern from `PhraseStyleProviderTests.cs`

---
*Phase: 55-phrase-personalities*
*Completed: 2026-03-11*
