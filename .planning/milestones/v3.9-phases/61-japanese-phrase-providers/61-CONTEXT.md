# Phase 61: Japanese Phrase Providers - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Create three new IPhraseProvider implementations in FuzzyClock.Core: JapaneseTersePhraseProvider, JapanesePoeticPhraseProvider, and JapaneseRudePhraseProvider. Register all four Japanese variants (ja-classic, ja-terse, ja-poetic, ja-rude) in PhraseEngine. Add unit tests covering all 12 five-minute buckets, noon, and midnight for each new provider.

This phase is FuzzyClock.Core only — no MainWindow changes, no SettingsWindow changes, no routing logic (that belongs in Phase 62).

</domain>

<decisions>
## Implementation Decisions

### Provider Structure
- **D-01:** All three new providers follow the exact same code structure as JapanesePhraseProvider (Classic): `HourWords[]` string array (indices 1–12), `Buckets[]` array of `(int UpperBound, string Template)` tuples, `{h}` / `{h1}` placeholder substitution, noon/midnight special cases by total-minutes check.
- **D-02:** Same 12-bucket boundary set as Classic (upper bounds: 2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 59).
- **D-03:** `GetStructuredPhrase()` returns `("", GetPhrase(dt))` for all three providers — same as Classic. No qualifier/emphasis split needed for Japanese styles.
- **D-04:** `GetSegmentKey()` returns `GetPhrase(dt)` — same as Classic.

### Phrase Vocabulary by Style
- **D-05: Terse** — Short, clipped colloquial Japanese. Minimal particles. Favor compact forms:
  - On-the-hour: bare hour word (三時)
  - Near-hour: 三時すぎ / もうすぐ四時
  - Half-hour: 三時半
  - Quarter forms: 三時十五分 / 三時四十五分
  - Noon/midnight: 正午 / 真夜中 (already minimal — keep as-is from Classic)

- **D-06: Poetic** — Atmospheric, imagery-based phrasing. Draw on Japanese aesthetic vocabulary (時, 刻, 光, 夜, 朝, etc.) while still conveying approximate time. Mark class as provisional (native-speaker review recommended).
  - Noon: 昼の頂 ("the peak of day")
  - Midnight: 夜の果て ("the edge of night")
  - Buckets should evoke the time of day with vivid imagery

- **D-07: Rude** — Blunt, impatient phrasing. Use casual/masculine particles (かよ、じゃん、だろ、いい加減). Time stated directly with impatient framing. Mark class as provisional (native-speaker review recommended).
  - Noon: もう昼だ ("It's noon already")
  - Midnight: 真夜中じゃないか ("Isn't it the middle of the night")
  - Buckets: もう三時かよ / 早く四時になれ / やっと三時半 style

### PhraseEngine Registry
- **D-08:** Add `["ja-classic"]` as an alias for `JapanesePhraseProvider` alongside the existing `["ja"]` key. Do NOT remove or rename the `"ja"` key — that is Phase 62's responsibility.
- **D-09:** Add `["ja-terse"]`, `["ja-poetic"]`, `["ja-rude"]` entries pointing to the new provider instances. All three are new keys with no prior keys to supersede.

### Claude's Discretion
- Exact Japanese phrase wording within the style register for all 12 buckets (vocabulary is LOW confidence; provisional marking covers this)
- Whether Poetic provider uses full-phrase imagery or just embellishes hour-reference templates
- File naming: `JapaneseTersePhraseProvider.cs`, `JapanesePoeticPhraseProvider.cs`, `JapaneseRudePhraseProvider.cs`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Provider pattern (reference implementations)
- `FuzzyClock.Core/JapanesePhraseProvider.cs` — Classic reference; exact code structure to replicate for all three new providers
- `FuzzyClock.Core/TersePhraseProvider.cs` — English Terse style register (maps to ja-terse intent)
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — English Poetic style register (maps to ja-poetic intent)
- `FuzzyClock.Core/RudePhraseProvider.cs` — English Rude style register (maps to ja-rude intent)
- `FuzzyClock.Core/IPhraseProvider.cs` — Interface contract: GetPhrase, GetStructuredPhrase, GetSegmentKey

### Registry
- `FuzzyClock.Core/PhraseEngine.cs` — Add ja-classic + ja-terse/poetic/rude entries here; keep "ja" key intact

### Test pattern
- `FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs` — Reference test structure (4 tests per provider class: noon, midnight, all-buckets DataRow, GetStructuredPhrase)
- `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — [DoNotParallelize] class; add SetLocale round-trip tests for ja-* keys here

### Requirements
- `.planning/REQUIREMENTS.md` §Japanese Phrase Styles — JA-01, JA-02, JA-03, JA-06

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `JapanesePhraseProvider`: Direct structural template — copy, rename class, adjust vocabulary per style register. HourWords array is identical for all styles (Kanji hour words don't change by register).
- `PhraseEngine._providers` dictionary: Just add 4 new key-value pairs (ja-classic, ja-terse, ja-poetic, ja-rude).
- `IPhraseProvider` interface: All three new providers implement all three methods the same way as Classic.

### Established Patterns
- Bucket walk: `foreach (var (upperBound, template) in Buckets)` — iterate in order, return first match where `minute <= upperBound`. Final bucket upper bound is 59 to catch all remaining minutes.
- Noon/midnight guard: Check `dt.Hour * 60 + dt.Minute` before entering bucket walk.
- Hour12 calculation: `int hour12 = dt.Hour % 12; if (hour12 == 0) hour12 = 12;`
- nextHour12: `(hour12 % 12) + 1`
- Tests: Direct provider instantiation (not through PhraseEngine) to avoid static state races. `[DoNotParallelize]` class required for any coordinator tests that call `PhraseEngine.SetLocale`.

### Integration Points
- `PhraseEngine._providers` dictionary init block: add 4 entries
- `FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs`: append three new `[TestClass]` blocks following the Japanese section (or add to a new JapaneseStyleProviderTests.cs file — either is acceptable)

</code_context>

<specifics>
## Specific Ideas

- The existing `JapanesePhraseProvider` is already in PhraseEngine as `["ja"]`. Phase 61 adds `["ja-classic"]` as a second key for the same instance, enabling Phase 62's routing to work with consistent ja-* key naming across all styles.
- The STATE.md explicitly notes: "Japanese Poetic and Rude phrase vocabulary is LOW confidence; native-speaker review recommended before shipping (non-blocking)." Both classes should carry a `/// Provisional — native-speaker review recommended` XML doc comment, matching the existing comment on JapanesePhraseProvider.

</specifics>

<deferred>
## Deferred Ideas

- Time-of-day period labels (朝/昼/夕/夜) in Japanese providers — out of scope per REQUIREMENTS.md
- French/Spanish/German/Polish style variants — deferred to future milestone
- Routing logic (ResolveLocaleKey, SettingsWindow Japanese selector) — Phase 62
- Removing/renaming the existing "ja" PhraseEngine key — Phase 62 (after routing is stabilized)

</deferred>

---

*Phase: 61-japanese-phrase-providers*
*Context gathered: 2026-03-24*
