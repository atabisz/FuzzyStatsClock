# Phase 55: Update Poetic Phrase Clock — More Hints — Research

**Researched:** 2026-03-18
**Domain:** C# phrase provider rewrite — PoeticPhraseProvider.cs
**Confidence:** HIGH (pure internal rewrite, no external dependencies, all patterns verified from source)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Embed hour name directly into phrase text — no secondary visual element, no parenthetical aside
- Every bucket phrase (all 12 ~5-min spans) names the hour naturally: "barely past three", "ten quiet minutes into four", "a quarter left before five"
- Phrases read as natural English; the hour is woven in, not bolted on
- "Past" half buckets (0–37 min): name the current hour {h}; 3:05 → "barely past three", 3:30 → "half the hour, still three"
- "To" half buckets (38–59 min): name the approaching hour {h1}; 3:45 → "a quarter left before four", 3:52 → "the hour narrows toward four"
- Midnight/noon special cases: use "the witching hour" / "high noon" character as before (no numeric hour)
- Keep 12 distinct buckets with identical upper-bound breakpoints to the current PoeticPhraseProvider
- 3–4 random candidate templates per bucket — same Random.Shared.Next mechanic
- Every candidate in every bucket must include {h} or {h1} — no hour-anonymous candidates
- Candidate templates use {h}/{h1} placeholders resolved at runtime, like EnglishPhraseProvider
- GetStructuredPhrase: return (qualifier, emphasis) where emphasis = resolved hour word, qualifier = surrounding poetic text
- For phrases ending in the hour: qualifier = everything before hour word (trimmed), emphasis = hour word
- Special cases (noon, midnight): qualifier = "", emphasis = full word — unchanged behavior
- Update PoeticPhraseProvider in place. No new locale key. No menu entries
- GetSegmentKey behavior unchanged: returns "en-poetic:{bucketIndex}" (and special keys for noon/witching)

### Claude's Discretion

- Exact data structure for time-of-day atmosphere: separate candidate arrays per bucket+block, or a single candidate pool with atmosphere baked into phrasing diversity. Either works; pick what's cleanest
- Specific phrase wording for each bucket — context examples are illustrative, not prescriptive
- Whether to add HourWords[] array directly in PoeticPhraseProvider or share it with EnglishPhraseProvider via a static helper

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 55 rewrites the candidate arrays in `PoeticPhraseProvider.cs` so that every phrase names the hour. The structural scaffolding — bucket count, upper bounds, segment keys, Random.Shared selection, the noon/midnight special-case guards — all stays unchanged. What changes is every string in every `Candidates[]` array: each must now contain `{h}` (buckets 0–7, "past" half) or `{h1}` (buckets 8–11, "to" half), and each must resolve to natural, atmospheric English after `{h}`/`{h1}` substitution.

The provider also gains a meaningful `GetStructuredPhrase` implementation. Currently it returns `("", fullPhrase)`. The new version mirrors `EnglishPhraseProvider.GetStructuredPhrase`: for templates ending with `{h}` or `{h1}`, split on the placeholder boundary — qualifier = text before the hour word (trimmed), emphasis = resolved hour word. For mid-phrase hour positions, split immediately before the hour word in the resolved phrase. Special cases (00:00, 12:00) stay at `("", "the witching hour")` and `("", "high noon")`.

Time-of-day atmosphere is implemented as phrase diversity baked directly into the candidate strings — four candidates per bucket that together span morning/afternoon/evening/night coloring, rather than separate sub-arrays per time block. This is the cleanest approach: it keeps the bucket table flat, no indexing logic, and the atmosphere emerges naturally from which candidate Random.Shared selects. (If richer atmosphere is desired later, time-block branching can be layered in.)

**Primary recommendation:** Expand `HourWords[]` locally in `PoeticPhraseProvider` (copy pattern from `RudePhraseProvider`), rewrite all 12 candidate arrays with `{h}`/`{h1}` templates, implement `GetStructuredPhrase` with template-endpoint split logic. Update two test assertions in `PhraseStyleProviderTests.cs`.

---

## Standard Stack

No new libraries. Pure C# 13 / .NET 10 in `FuzzyClock.Core` (no-WPF project).

### Core Pattern Reference

| Source | Role |
|--------|------|
| `RudePhraseProvider.cs` | Canonical model: HourWords[] + multi-candidate buckets + {h}/{h1} substitution |
| `EnglishPhraseProvider.cs` | Canonical model: GetStructuredPhrase split on template endpoint |
| `IPhraseProvider.cs` | Contract: GetPhrase, GetStructuredPhrase, GetSegmentKey |

---

## Architecture Patterns

### Bucket Table Structure (unchanged)

```csharp
private static readonly (int UpperBound, string[] Candidates)[] Buckets =
[
    ( 2, [ "..{h}..", "..{h}..", "..{h}..", "..{h}.." ]),  // bucket 0 — past half
    ...
    (42, [ "..{h1}..", "..{h1}..", "..{h1}..", "..{h1}.." ]),  // bucket 8 — to half
    ...
    (59, [ "..{h1}..", ... ]),  // bucket 11
];
```

Bucket 7 (upper bound 37) is the last "past" bucket — use `{h}`.
Bucket 8 (upper bound 42) is the first "to" bucket — use `{h1}`.

### Bucket Boundary Map (exact, must not change)

| Index | UpperBound | Label | Hour token |
|-------|-----------|-------|------------|
| 0 | 2 | on the hour | {h} |
| 1 | 7 | five past | {h} |
| 2 | 12 | ten past | {h} |
| 3 | 17 | quarter past | {h} |
| 4 | 22 | twenty past | {h} |
| 5 | 27 | nearly half | {h} |
| 6 | 32 | half past | {h} |
| 7 | 37 | just past half | {h} |
| 8 | 42 | twenty to | {h1} |
| 9 | 47 | quarter to | {h1} |
| 10 | 52 | ten to | {h1} |
| 11 | 59 | five to / nearly | {h1} |

### HourWords Array (copy verbatim from RudePhraseProvider)

```csharp
// Source: FuzzyClock.Core/RudePhraseProvider.cs (verified)
private static readonly string[] HourWords =
    ["", "one", "two", "three", "four", "five", "six",
         "seven", "eight", "nine", "ten", "eleven", "twelve"];
```

Index 0 is the empty string (never used — hour12 is always 1–12). Index 12 is "twelve".

### Hour12 Computation (copy verbatim from RudePhraseProvider/EnglishPhraseProvider)

```csharp
int hour12 = dt.Hour % 12;
if (hour12 == 0) hour12 = 12;
int nextHour12 = (hour12 % 12) + 1;
```

This correctly handles midnight (hour 0 → hour12 = 12), noon zone (hour 12 → hour12 = 12), and the wrap from 12 to 1 for nextHour12.

### GetPhrase Implementation Pattern

```csharp
// Source: FuzzyClock.Core/RudePhraseProvider.cs (verified)
public string GetPhrase(DateTime dt)
{
    if (dt.Hour == 0 && dt.Minute == 0) return "the witching hour";
    if (dt.Hour == 12 && dt.Minute == 0) return "high noon";

    int minute = dt.Minute;
    int hour12 = dt.Hour % 12;
    if (hour12 == 0) hour12 = 12;
    int nextHour12 = (hour12 % 12) + 1;

    foreach (var (upperBound, candidates) in Buckets)
    {
        if (minute <= upperBound)
        {
            string template = candidates[Random.Shared.Next(candidates.Length)];
            return template
                .Replace("{h}",  HourWords[hour12])
                .Replace("{h1}", HourWords[nextHour12]);
        }
    }

    throw new InvalidOperationException($"No bucket matched minute={minute}");
}
```

### GetStructuredPhrase Implementation Strategy

The new implementation must split "qualifier | hour word" for every phrase. The only reliable split mechanism is working from the **template** (before substitution), not the resolved string.

```csharp
// Source: EnglishPhraseProvider.cs (verified — same logic applies here)
public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt)
{
    if (dt.Hour == 0 && dt.Minute == 0) return ("", "the witching hour");
    if (dt.Hour == 12 && dt.Minute == 0) return ("", "high noon");

    int minute = dt.Minute;
    int hour12 = dt.Hour % 12;
    if (hour12 == 0) hour12 = 12;
    int nextHour12 = (hour12 % 12) + 1;

    foreach (var (upperBound, candidates) in Buckets)
    {
        if (minute <= upperBound)
        {
            // Pick the same random candidate — but for split purposes, any
            // candidate in the bucket shares the same {h}/{h1} split position.
            // We do NOT need to re-roll: just pick index 0 for split logic
            // since ALL candidates must end with the hour token per the design rule.
            string template = candidates[Random.Shared.Next(candidates.Length)];

            if (template.EndsWith("{h}"))
            {
                string qualifier = template[..^"{h}".Length].TrimEnd();
                return (qualifier, HourWords[hour12]);
            }
            if (template.EndsWith("{h1}"))
            {
                string qualifier = template[..^"{h1}".Length].TrimEnd();
                return (qualifier, HourWords[nextHour12]);
            }

            // Fallback: hour appears mid-phrase — split before the hour word
            // in the resolved string (find last occurrence of the hour word)
            string resolved = template
                .Replace("{h}",  HourWords[hour12])
                .Replace("{h1}", HourWords[nextHour12]);
            string hourWord = minute <= 37 ? HourWords[hour12] : HourWords[nextHour12];
            int idx = resolved.LastIndexOf(hourWord, StringComparison.Ordinal);
            if (idx >= 0)
                return (resolved[..idx].TrimEnd(), resolved[idx..]);

            return ("", resolved);
        }
    }

    throw new InvalidOperationException($"No bucket matched minute={minute}");
}
```

**Critical design rule that simplifies this:** The locked decision says every candidate must include the hour placeholder AND the context examples all show the hour word trailing or being a clear anchor. If every candidate template ends with `{h}` or `{h1}`, the `EndsWith` branches handle 100% of cases and the fallback is never reached. This should be the authoring constraint for all templates.

### GetSegmentKey (no change)

```csharp
// Source: FuzzyClock.Core/PoeticPhraseProvider.cs (verified)
public string GetSegmentKey(DateTime dt)
{
    if (dt.Hour == 0 && dt.Minute == 0) return "en-poetic:witching";
    if (dt.Hour == 12 && dt.Minute == 0) return "en-poetic:noon";
    int minute = dt.Minute;
    for (int i = 0; i < Buckets.Length; i++)
        if (minute <= Buckets[i].UpperBound) return $"en-poetic:{i}";
    throw new InvalidOperationException($"No bucket matched minute={minute}");
}
```

This is correct and needs zero changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Hour word lookup | Custom switch/dictionary | `HourWords[]` static array (index by hour12) |
| Hour12 conversion | Custom helper method | Inline `dt.Hour % 12; if (hour12 == 0) hour12 = 12;` — established pattern |
| Random candidate | Thread-safe random | `Random.Shared.Next(candidates.Length)` — already in use |
| Time-of-day block lookup | Enum + switch | Bake atmosphere into candidate diversity — no runtime branching needed |

---

## Common Pitfalls

### Pitfall 1: Template Does Not End With Hour Placeholder

**What goes wrong:** If a template has the hour word mid-phrase (e.g. `"still {h}, the morning stretches on"`), the `EndsWith` split in `GetStructuredPhrase` falls through to the `LastIndexOf` fallback. This is fragile for phrases where the hour word appears multiple times or overlaps another word.

**How to avoid:** Author all 48 candidate templates so they end with `{h}` or `{h1}`. This is the cleanest authoring constraint. The `CONTEXT.md` examples all follow this pattern: "barely past {h}", "ten quiet minutes into {h}", "a quarter left before {h1}".

**Warning signs:** Any template string that has characters after `}` at the end.

### Pitfall 2: Midnight/Noon Guard Uses Hour-Only Check

**What goes wrong:** Current code checks `dt.Hour == 0 && dt.Minute == 0` — correct. If `totalMinutes` computation were used instead (as in `EnglishPhraseProvider` and `RudePhraseProvider`), it also works. Both patterns are equivalent. Do not add a guard for `dt.Hour == 12` alone — that would eat 12:01–12:02 which should fall into bucket 0.

**How to avoid:** Keep `dt.Hour == 0 && dt.Minute == 0` and `dt.Hour == 12 && dt.Minute == 0` — the current guard pattern is correct.

### Pitfall 3: GetStructuredPhrase Rolls a Different Candidate Than GetPhrase

**What goes wrong:** If `GetStructuredPhrase` calls `Random.Shared.Next` independently, it may pick a different candidate than the `GetPhrase` call that produced the displayed text. The qualifier/emphasis split would then describe a different phrase than what is showing.

**How to avoid:** The segment-key guard in `MainWindow` (phase 53 decision) means `GetPhrase` is only called once per bucket interval. `GetStructuredPhrase` is called separately to produce the split-text layout. Both make their own random pick. Since ALL candidates in a bucket must end with `{h}` or `{h1}`, the qualifier text differs between candidates but the **emphasis** (the hour word) is always the same. The split will always give the right hour word in emphasis regardless of which candidate is selected. This is fine by design.

**If exact qualifier consistency matters:** Cache the last picked template index alongside `_lastSegmentKey` in `MainWindow`. This is out of scope for phase 55.

### Pitfall 4: Hour12 = 0 for Midnight/Noon Zones After Guard

**What goes wrong:** After the special-case guards, the code may still encounter `dt.Hour == 0` (e.g., 0:01) or `dt.Hour == 12` (e.g., 12:01). Both give `hour12 = 0` from `dt.Hour % 12`. The `if (hour12 == 0) hour12 = 12;` correction is mandatory.

**How to avoid:** Always include the `if (hour12 == 0) hour12 = 12;` fixup after the modulo. Verified in all three existing providers — copy exactly.

### Pitfall 5: Phrase Wrap Service NaturalPauseMarkers

**What goes wrong:** `PhraseWrapService` contains `NaturalPauseMarkers` ordered longest-first (phase 52 decision). When new poetic phrases are introduced, some may contain pause patterns not yet in the markers list. Wrap behavior would then fall back to midpoint mode for those phrases.

**How to avoid:** This is acceptable — phrase wrap works in midpoint mode by default. No change to `PhraseWrapService` is needed. Monitor only if user-visible wrap behavior looks wrong for specific new phrases.

---

## Code Examples

### Pattern: Candidate Array With Time-of-Day Baked In (Bucket 0 — On The Hour)

```csharp
// Each candidate names the hour and carries different atmosphere coloring.
// Atmosphere diversity across the 4 candidates covers different times of day
// without requiring any dt.Hour branching at runtime.
( 2, [
    "the hour turns to {h}",              // neutral / transitional
    "{h} begins in the stillness",        // pre-dawn flavor
    "the morning holds {h} a moment",     // morning flavor
    "{h} o'clock, unhurried",             // afternoon/evening flavor
]),
```

### Pattern: "To" Bucket Candidates (Bucket 8 — Twenty To)

```csharp
(42, [
    "twenty minutes left before {h1}",
    "the hour closes in on {h1}",
    "not yet {h1}, but nearing",           // NOTE: does not end with {h1} — avoid this form
    "winding toward {h1}",
]),
```

For `GetStructuredPhrase` simplicity, prefer all candidates ending with `{h1}`:

```csharp
(42, [
    "twenty minutes left before {h1}",
    "the hour quietly closes in on {h1}",
    "the light shifting toward {h1}",
    "the minutes narrow toward {h1}",
]),
```

### Pattern: GetStructuredPhrase Split (Verified From EnglishPhraseProvider)

```csharp
// Template: "barely past {h}"
// At 3:05:
if (template.EndsWith("{h}"))
{
    string qualifier = template[..^"{h}".Length].TrimEnd();
    // qualifier = "barely past"
    return (qualifier, HourWords[hour12]);
    // returns ("barely past", "three")
}

// Template: "the hour narrows toward {h1}"
// At 3:52:
if (template.EndsWith("{h1}"))
{
    string qualifier = template[..^"{h1}".Length].TrimEnd();
    // qualifier = "the hour narrows toward"
    return (qualifier, HourWords[nextHour12]);
    // returns ("the hour narrows toward", "four")
}
```

---

## What Tests Need Updating

### Tests That Will NOT Break

These tests use behavior-invariant assertions that survive phrase content changes:

| Test | Assertion | Safe? |
|------|-----------|-------|
| `Poetic_WitchingHour_ReturnsWitchingHour` | `Assert.AreEqual("the witching hour", ...)` | Safe — special case unchanged |
| `Poetic_Noon_ReturnsHighNoon` | `Assert.AreEqual("high noon", ...)` | Safe — special case unchanged |
| `Poetic_RegularTime_ReturnsNonEmpty` | `Assert.IsFalse(string.IsNullOrEmpty(...))` | Safe — non-empty still true |
| `PoeticSegmentKeyTests.SameBucket_ReturnsSameKey` | Key equality | Safe — GetSegmentKey unchanged |
| `PoeticSegmentKeyTests.AdjacentBuckets_ReturnDifferentKeys` | Key inequality | Safe — GetSegmentKey unchanged |
| `PoeticSegmentKeyTests.WitchingHour_ReturnsSpecialKey` | `"en-poetic:witching"` | Safe |
| `PoeticSegmentKeyTests.Noon_ReturnsSpecialKey` | `"en-poetic:noon"` | Safe |
| `PoeticSegmentKeyTests.DifferentProviders_SameBucket_DifferentKeys` | Key prefix difference | Safe |

### Test That Will Break and Needs Updating

| Test | Current Assertion | Required Change |
|------|------------------|-----------------|
| `Poetic_GetStructuredPhrase_ReturnsEmptyQualifier` | `Assert.AreEqual("", qualifier)` at `(3, 0, 0)` | The new implementation returns a non-empty qualifier for regular times. Change to assert that qualifier is NOT empty and emphasis equals "three" (or the resolved hour word). |

The test at line 92–97 in `PhraseStyleProviderTests.cs`:

```csharp
[TestMethod]
public void Poetic_GetStructuredPhrase_ReturnsEmptyQualifier()
{
    var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
    Assert.AreEqual("", qualifier);       // <-- WILL FAIL after rewrite
    Assert.IsFalse(string.IsNullOrEmpty(emphasis));
}
```

New test shape:

```csharp
[TestMethod]
public void Poetic_GetStructuredPhrase_EmphasisIsHourWord()
{
    var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
    Assert.AreEqual("three", emphasis);           // emphasis is always the hour word
    Assert.IsFalse(string.IsNullOrEmpty(qualifier)); // qualifier is non-empty for regular times
}

[TestMethod]
public void Poetic_GetStructuredPhrase_WitchingHour_EmptyQualifier()
{
    var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 0, 0, 0));
    Assert.AreEqual("", qualifier);
    Assert.AreEqual("the witching hour", emphasis);
}
```

**Additional new tests to add (coverage for new behavior):**

```csharp
[TestMethod]
public void Poetic_ToHalf_EmphasisIsNextHourWord()
{
    // Bucket 8 (42 upper bound) — uses {h1}; 3:40 → emphasis should be "four"
    var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 40, 0));
    Assert.AreEqual("four", emphasis);
    Assert.IsFalse(string.IsNullOrEmpty(qualifier));
}

[TestMethod]
public void Poetic_PastHalf_EmphasisIsCurrentHourWord()
{
    // Bucket 6 (32 upper bound) — uses {h}; 3:30 → emphasis should be "three"
    var (qualifier, emphasis) = _provider.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 30, 0));
    Assert.AreEqual("three", emphasis);
    Assert.IsFalse(string.IsNullOrEmpty(qualifier));
}

[TestMethod]
public void Poetic_AllBuckets_PhraseContainsHourWord()
{
    // Verify the {h}/{h1} constraint: every bucket at 3:xx must mention an hour word
    var provider = new PoeticPhraseProvider();
    int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    foreach (int m in sampleMinutes)
    {
        string phrase = provider.GetPhrase(new DateTime(2024, 1, 1, 3, m, 0));
        bool containsThree = phrase.Contains("three");
        bool containsFour  = phrase.Contains("four");
        Assert.IsTrue(containsThree || containsFour,
            $"Minute {m}: expected 'three' or 'four' in phrase but got: {phrase}");
    }
}
```

---

## State of the Art

| Old Behavior | New Behavior | Impact |
|-------------|-------------|--------|
| PoeticPhraseProvider.GetStructuredPhrase returns ("", fullPhrase) | Returns (qualifier, hourWord) — hour word as emphasis | Split-text layout now highlights the hour in poetic mode |
| All poetic candidates are hour-anonymous | All candidates contain {h} or {h1} | User always knows the hour from a poetic phrase |
| No HourWords array in PoeticPhraseProvider | HourWords[] added locally (or shared) | Hour name resolution mirrors RudePhraseProvider pattern |

---

## Open Questions

1. **Shared HourWords — extract to static helper or duplicate?**
   - What we know: Three providers (`EnglishPhraseProvider`, `TersePhraseProvider`, `RudePhraseProvider`) all have identical `HourWords[]` arrays. A fourth duplication in `PoeticPhraseProvider` is ugly but follows established project pattern.
   - What's unclear: Whether the project has a convention for shared static utilities in `FuzzyClock.Core`.
   - Recommendation: Duplicate for now (consistent with `RudePhraseProvider`). Extraction to `PhraseProviderHelpers` or similar is a small refactor that can happen independently. Do not let it block this phase.

2. **GetStructuredPhrase: random candidate consistency**
   - What we know: `GetPhrase` and `GetStructuredPhrase` each call `Random.Shared.Next` independently, potentially picking different candidates. The hour word in emphasis will always be correct (same {h}/{h1} token for all candidates in a bucket). The qualifier text may differ from the phrase being displayed.
   - What's unclear: Whether the UI has a code path that calls both `GetPhrase` and `GetStructuredPhrase` for the same tick and uses them together.
   - Recommendation: Accept the minor inconsistency — qualifier text is secondary to hour emphasis, and phase 53's segment-key guard means GetPhrase fires only once per bucket interval anyway. No caching needed in phase 55.

---

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — current implementation read directly
- `FuzzyClock.Core/EnglishPhraseProvider.cs` — GetStructuredPhrase split logic verified
- `FuzzyClock.Core/RudePhraseProvider.cs` — HourWords[] + multi-candidate + {h}/{h1} pattern verified
- `FuzzyClock.Core/TersePhraseProvider.cs` — additional pattern reference
- `FuzzyClock.Core/IPhraseProvider.cs` — interface contract verified
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — exact test assertions read, break analysis complete
- `FuzzyClock.Core.Tests/SegmentKeyTests.cs` — segment key tests read, all safe
- `FuzzyClock.Core.Tests/PhraseEngineTests.cs` — no en-poetic assertions, unaffected
- `.planning/phases/55-update-the-poetic-phrase-clock-to-be-poetic-but-provide-more-hints-to-the-actual-time/55-CONTEXT.md` — decisions verified
- `.planning/config.json` — nyquist_validation: false confirmed

## Metadata

**Confidence breakdown:**
- Bucket structure / boundaries: HIGH — read directly from source
- {h}/{h1} substitution pattern: HIGH — verified in EnglishPhraseProvider and RudePhraseProvider
- GetStructuredPhrase split logic: HIGH — copied from EnglishPhraseProvider with verified adaptation
- Test impact analysis: HIGH — each test assertion read and classified
- Phrase wording (Claude's discretion): N/A — content authored at implementation time

**Research date:** 2026-03-18
**Valid until:** Stable indefinitely — pure internal change, no external dependencies
