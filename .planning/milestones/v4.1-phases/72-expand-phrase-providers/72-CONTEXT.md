# Phase 72: Expand Phrase Providers - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add phrase variety to Classic and Terse English providers so consecutive same-bucket ticks can show different text. Both currently return a single phrase per time bucket; this phase expands each to 5 candidates per bucket with randomized selection, matching the established pattern in Poetic/Rude providers.

</domain>

<decisions>
## Implementation Decisions

### Provider Scope
- **D-01:** Expand Classic (EnglishPhraseProvider) and Terse (TersePhraseProvider) only
- **D-02:** Poetic (4 candidates) and Rude (4-5 candidates) are already sufficient — no changes
- **D-03:** Non-English providers (French/Spanish/German/Japanese/Polish) deferred to future milestone per REQUIREMENTS
- **D-04:** Novelty providers (Jive/Pirate/Yoda/Dwarf/ValleyGirl/Shakespeare) are Phase 73

### Candidate Count
- **D-05:** 5 phrase candidates per bucket for both Classic and Terse (12 regular buckets)
- **D-06:** 5 candidates each for noon and midnight special cases (not single strings)
- **D-07:** Total: 14 time slots x 5 candidates = 70 phrases per provider, 140 new phrases total

### Classic Style Identity
- **D-08:** Classic variants must be close synonyms — same neutral, everyday English tone
- **D-09:** Examples of acceptable variety: "ten after three" / "ten past three" / "ten minutes past three"
- **D-10:** No poetic, slangy, or personality-inflected phrasing in Classic

### Terse Style Identity
- **D-11:** Terse variants must stay strictly British compact idiom
- **D-12:** Keep "half four" / "just gone three" / "quarter to" British forms
- **D-13:** No American terse forms (e.g., "ten til four" is excluded)

### Claude's Discretion
- Exact phrase content within the style constraints above
- Whether to refactor bucket data structure (single template → candidates array) or use a different approach
- GetSegmentKey() implementation for Classic/Terse (must be stable, not depend on random selection — follow Poetic/Rude pattern)
- GetStructuredPhrase() adaptation for multi-candidate providers
- Test structure and assertion approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phrase provider patterns (multi-candidate)
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — Established multi-candidate pattern: `(int UpperBound, string[] Candidates)[]` bucket array, `Random.Shared.Next()`, stable `GetSegmentKey()` using bucket index
- `FuzzyClock.Core/RudePhraseProvider.cs` — Same multi-candidate pattern with 4-5 candidates per bucket

### Phrase provider patterns (single-candidate, to be expanded)
- `FuzzyClock.Core/EnglishPhraseProvider.cs` — Current Classic provider: single `(int UpperBound, string Template)[]` bucket array, `GetSegmentKey()` returns `GetPhrase()` directly
- `FuzzyClock.Core/TersePhraseProvider.cs` — Current Terse provider: same single-template pattern

### Interface contract
- `FuzzyClock.Core/IPhraseProvider.cs` — `GetPhrase()`, `GetStructuredPhrase()`, `GetSegmentKey()` interface

### Phrase engine
- `FuzzyClock.Core/PhraseEngine.cs` — Static facade with provider registry; no changes expected

### Existing tests
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — Test patterns for providers with multi-candidate buckets

### Requirements
- `.planning/REQUIREMENTS.md` — PHRASE-01 (5+ candidates), PHRASE-02 (randomized), PHRASE-03 (unit tests)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PoeticPhraseProvider` / `RudePhraseProvider`: Exact multi-candidate bucket pattern to replicate — `(int UpperBound, string[] Candidates)[]` with `Random.Shared.Next()`
- `PhraseStyleProviderTests`: Existing test patterns for verifying multi-candidate providers

### Established Patterns
- Bucket table: ordered `(upperBound, ...)` tuples, walk in order, first match where `minute <= upperBound`
- Template placeholders: `{h}` (current hour), `{h1}` (next hour), resolved via `HourWords[]` array
- Special cases: noon (totalMinutes == 720) and midnight (totalMinutes == 0) checked first
- `GetSegmentKey()`: Must return stable key per bucket — use bucket index prefix (e.g., `"en-classic:0"`) not the phrase itself

### Integration Points
- No PhraseEngine changes needed — providers are already registered
- No MainWindow changes — `GetSegmentKey()` already gates phrase refresh
- Tests: new test classes in `FuzzyClock.Core.Tests`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the style constraints above.

</specifics>

<deferred>
## Deferred Ideas

- Non-English phrase expansion (French/Spanish/German/Japanese/Polish) — future milestone, requires native speaker review
- Bumping Poetic/Rude from 4-5 to 5+ candidates — already sufficient variety

</deferred>

---

*Phase: 72-expand-phrase-providers*
*Context gathered: 2026-04-01*
