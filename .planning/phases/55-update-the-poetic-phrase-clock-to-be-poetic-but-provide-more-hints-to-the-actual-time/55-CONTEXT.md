# Phase 55: Update Poetic Phrase Clock — More Hints - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the `en-poetic` phrase style so it remains atmospheric and lyrical but now names the current hour in every phrase — giving the user a real time anchor without abandoning poetic character. No new locale keys. No UI changes. Pure phrase content update.

</domain>

<decisions>
## Implementation Decisions

### Hint integration style
- Embed the hour name directly into the phrase text — no secondary visual element, no parenthetical aside.
- Every bucket phrase (all 12 ~5-min spans) names the hour naturally: "barely past **three**", "ten quiet minutes into **four**", "a quarter left before **five**".
- Phrases read as natural English; the hour is woven in, not bolted on.

### Which hour to name
- "Past" half buckets (0–37 min): name the **current hour** (h).
  - `3:05 → "barely past three"`, `3:30 → "half the hour, still three"`
- "To" half buckets (38–59 min): name the **approaching hour** (h1).
  - `3:45 → "a quarter left before four"`, `3:52 → "the hour narrows toward four"`
- Midnight/noon special cases: use "midnight" and "noon" as before (no numeric hour).

### Bucket count and candidates
- Keep 12 distinct buckets (identical upper-bound breakpoints to the current PoeticPhraseProvider).
- 3–4 random candidate templates per bucket (same random-selection mechanic as existing).
- Every candidate in a bucket must include the hour placeholder (`{h}` or `{h1}`) — no candidate may be fully hour-anonymous.
- Candidate templates use `{h}` / `{h1}` placeholders, resolved at runtime like `EnglishPhraseProvider`.

### Time-of-day atmosphere
- Phrases carry different emotional coloring based on a time-of-day block derived from `dt.Hour`:
  - **Pre-dawn** (0–5): stillness, quiet, dark — "barely past three in the stillness"
  - **Morning** (6–11): light, beginning, fresh — "just into nine, the morning still new"
  - **Afternoon** (12–17): warm, languid, unhurried — "three in the bright afternoon, barely begun"
  - **Evening/Night** (18–23): fading, settling, winding — "just past eight, the evening deepens"
- Implementation approach (candidate selection or template filtering) is **Claude's discretion** — see below.

### GetStructuredPhrase
- Return `(qualifier, emphasis)` where **emphasis = the resolved hour word** and **qualifier = the surrounding poetic text**.
- For phrases ending in the hour: qualifier = everything before the hour word (trimmed), emphasis = hour word.
- For phrases where hour appears mid-phrase or after a clause: best-effort split placing the hour as emphasis.
- Special cases (noon, midnight): qualifier = `""`, emphasis = full word (unchanged behavior).
- This mirrors how `EnglishPhraseProvider.GetStructuredPhrase` works — the hour stands out visually in split-text mode.

### Provider update scope
- **Update `PoeticPhraseProvider` in place.** No new locale key. No menu entries.
- Existing users who selected `en-poetic` automatically get the improved phrases.
- `GetSegmentKey` behavior unchanged: stable per-bucket key independent of which candidate was chosen.

### Claude's Discretion
- Exact data structure for time-of-day atmosphere: separate candidate arrays per bucket+block, or a single candidate pool with atmosphere baked into phrasing diversity. Either works; pick what's cleanest.
- Specific phrase wording for each bucket — the above examples are illustrative, not prescriptive.
- Whether to add hour word lookup (`HourWords[]` array) directly in PoeticPhraseProvider or share it with `EnglishPhraseProvider` via a static helper.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phrase provider to update
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — Current implementation. Bucket structure, candidate arrays, `GetPhrase`, `GetSegmentKey`, `GetStructuredPhrase`. This is the file being rewritten.

### Reference implementations
- `FuzzyClock.Core/EnglishPhraseProvider.cs` — Pattern for `{h}`/`{h1}` placeholder resolution, `HourWords[]` array, `GetStructuredPhrase` split logic. The new poetic provider follows the same runtime substitution pattern.
- `FuzzyClock.Core/IPhraseProvider.cs` — Interface contract: `GetPhrase`, `GetStructuredPhrase`, `GetSegmentKey`.

### Test files to update
- `FuzzyClock.Core.Tests/PhraseEngineTests.cs` — May contain en-poetic coverage; tests may need updating as phrase content changes.
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — Direct PoeticPhraseProvider tests; all assertions on specific phrase text will need updating.

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HourWords[]` in `EnglishPhraseProvider` / `TersePhraseProvider`: `["", "one", "two", ..., "twelve"]`. PoeticPhraseProvider will need the same array — either duplicated locally or extracted to a shared static.
- `GetStructuredPhrase` split logic in `EnglishPhraseProvider`: template ends with `{h}` → qualifier = text before `{h}` trimmed, emphasis = resolved hour word. Same pattern applies here.
- `Random.Shared.Next(candidates.Length)`: already used in PoeticPhraseProvider for random candidate selection — keep unchanged.

### Established Patterns
- Bucket table: `(int UpperBound, string[] Candidates)[]` — keep same structure; candidates become templates with `{h}`/`{h1}` placeholders.
- `GetSegmentKey`: returns `$"en-poetic:{bucketIndex}"` for each bucket (plus special cases for noon/midnight). Must NOT depend on which candidate was selected. No change needed.
- Special cases (noon at `dt.Hour==12 && dt.Minute==0`, midnight at `dt.Hour==0 && dt.Minute==0`) checked before bucket walk — keep this guard.

### Integration Points
- `PhraseEngine._providers["en-poetic"]` — points to `PoeticPhraseProvider`. No change needed there.
- `PhraseEngine.GetStructuredPhrase()` and `GetPhrase()` — no signature changes; only PoeticPhraseProvider's internal logic changes.
- Tests in `FuzzyClock.Core.Tests/` — will need updating wherever they assert on specific en-poetic phrase text.

</code_context>

<specifics>
## Specific Ideas

- The on-the-hour bucket (0–2 min) is a natural anchor: "the hour turns to three", "three begins" — make these feel like a moment of transition.
- Half-past bucket (27–32 min): "half the hour, still three" or "three sits at its midpoint" — the hour name emphasizes you're deep in it.
- "Nearly {h1}" bucket (53–59 min): the approaching hour should feel imminent — "the clock exhales toward four", "nearly four now, almost".
- Midnight and noon get special treatment: keep the existing "the witching hour" / "high noon" character; optionally add time-of-day flavored variants.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 55-update-the-poetic-phrase-clock-to-be-poetic-but-provide-more-hints-to-the-actual-time*
*Context gathered: 2026-03-18*
