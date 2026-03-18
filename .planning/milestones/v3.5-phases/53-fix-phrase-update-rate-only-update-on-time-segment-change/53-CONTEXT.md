# Phase 53: Fix Phrase Update Rate — Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the phrase update frequency for random-candidate providers (Rude, and Poetic after this phase). The phrase must only change when the clock advances to a new time segment/bucket — not on every 10-second timer tick. Additionally, expand PoeticPhraseProvider to use minute-bucket granularity with 3–4 random candidates per bucket (same structural pattern as RudePhraseProvider), replacing the current hour-range single-phrase implementation.

</domain>

<decisions>
## Implementation Decisions

### Segment change detection
- The fix must be **general** — not patched only into RudePhraseProvider. Both Rude and the new Poetic implementation must benefit automatically.
- The guard in `UpdatePhraseIfChanged` must detect "same bucket as last render" without calling `GetPhrase()` and comparing the random output string (which is always different for random-candidate providers).
- Implementation approach is Claude's discretion (e.g. `GetSegmentKey(DateTime)` on `IPhraseProvider`, or segment key tracked externally). Whatever approach is chosen must require zero changes to Classic/Terse providers.

### Manual refresh behaviour
- **Explicit user actions still trigger a fresh random pick immediately**, even if the time bucket has not changed. Affected triggers: style change (`SetPhraseStyle`), language switch (`SetLanguage`), reset to defaults (`ResetToDefaults`), and phrase wrap toggle/style change.
- These paths already clear `_currentRawPhrase = ""`. They must also clear the segment-key cache so the next `UpdatePhraseIfChanged` call re-rolls the phrase.

### PoeticPhraseProvider restructure
- **Switch from hour-range to minute-bucket granularity** — same bucket boundaries as RudePhraseProvider (upperBound per minute).
- **3–4 random candidates per bucket** — Claude composes the phrases.
- **Tone**: lyrical with time hints (acknowledges approximate time poetically) AND melancholy/contemplative (moodier, more introspective). Mix both flavours across the candidate set for each bucket — not all candidates in a bucket need the same tone.
- Keep the two exact specials: `h==0 && m==0` → "the witching hour"; `h==12 && m==0` → "high noon".

### Scope of provider changes
- `RudePhraseProvider`: no phrase content changes — only gains the general segment-key mechanism.
- `PoeticPhraseProvider`: full rewrite from hour-range to minute-bucket with multi-candidate random selection.
- `ClassicPhraseProvider`, `TersePhraseProvider`: no changes (deterministic; existing `_currentRawPhrase` guard still works perfectly).

### Test coverage
- Unit tests for the segment-key mechanism: same bucket → same key; adjacent buckets → different key.
- At minimum, a smoke test that calling `GetPhrase()` twice in the same minute returns values from the same bucket (even if strings differ).

### Claude's Discretion
- Exact implementation of the segment-key mechanism (interface method vs external lookup vs PhraseEngine facade method)
- Specific phrase text for all Poetic candidates (user will review before shipping)
- Whether to add a `[DoNotParallelize]` attribute to new segment-key tests (follows existing pattern for static PhraseEngine state)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core phrase logic
- `FuzzyClock.Core/RudePhraseProvider.cs` — Reference implementation: bucket structure, `Random.Shared.Next()` pattern, `{h}`/`{h1}` substitution, exact bucket boundary values (upperBound per minute)
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — Current Poetic implementation to be replaced; defines exact specials (witching hour, high noon)
- `FuzzyClock.Core/IPhraseProvider.cs` — Interface contract; any new method must be added here
- `FuzzyClock.Core/PhraseEngine.cs` — Static facade; see how `GetPhrase()` delegates to providers; understand `_providers` dict and `CurrentLocale`

### MainWindow integration
- `FuzzyClock.App/MainWindow.xaml.cs` — `UpdatePhraseIfChanged()` (lines ~586–660); all explicit-invalidation paths that set `_currentRawPhrase = ""`; `SetPhraseStyle`, `SetLanguage`, `ResetToDefaults`

### Tests
- `FuzzyClock.Core.Tests/` — Existing test patterns; `[DoNotParallelize]` usage for static PhraseEngine state; `[DataRow]` style for bucket boundary cases

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RudePhraseProvider.cs`: The exact bucket-array pattern (`(int UpperBound, string[] Candidates)[]`) is the template for the new Poetic implementation. Copy structure, change content and bucket boundaries if needed.
- `Random.Shared.Next(candidates.Length)`: already the pattern — no new Random instance needed.

### Established Patterns
- `_currentRawPhrase = ""` then `UpdatePhraseIfChanged()`: all explicit invalidation paths use this two-step. The segment-key cache must also be cleared at these same call sites.
- `[DoNotParallelize]` on test class: required for any test that touches static `PhraseEngine` state (see existing coordinator tests).

### Integration Points
- `UpdatePhraseIfChanged()` in MainWindow.xaml.cs is the single entry point for all timer-driven phrase updates. The segment-key guard belongs here (or in a PhraseEngine helper called from here).
- `IPhraseProvider` is the extension point for the general fix — adding `GetSegmentKey(DateTime)` (or equivalent) here means both Rude and Poetic get the fix without MainWindow knowing provider internals.

</code_context>

<specifics>
## Specific Ideas

- The bug is: `RudePhraseProvider.GetPhrase()` calls `Random.Shared.Next()` on every invocation. `UpdatePhraseIfChanged` runs every 10 seconds, generates a new random phrase, compares to `_currentRawPhrase` — it's almost always different → phrase re-renders every 10 seconds instead of every ~5 minutes.
- The fix must not make the display feel "stuck" — explicit user actions should still feel responsive (fresh phrase immediately).
- Poetic tone examples to guide writing: lyrical-with-hints → "the quarter hour stretches", "just past the half"; melancholy → "an hour the world ignores", "the slow drift past midnight". Mix both across candidates per bucket.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 53-fix-phrase-update-rate-only-update-on-time-segment-change*
*Context gathered: 2026-03-18*
