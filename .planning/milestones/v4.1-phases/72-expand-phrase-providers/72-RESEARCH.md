# Phase 72: Expand Phrase Providers - Research

**Researched:** 2026-04-01
**Domain:** C# phrase provider patterns, multi-candidate randomization, MSTest unit testing
**Confidence:** HIGH

## Summary

Phase 72 expands EnglishPhraseProvider (Classic) and TersePhraseProvider from single-phrase-per-bucket to multi-candidate arrays with randomized selection. The established pattern exists in PoeticPhraseProvider, RudePhraseProvider, and all 6 novelty providers. The refactoring is mechanical: change bucket structure from `(int UpperBound, string Template)[]` to `(int UpperBound, string[] Candidates)[]`, add `Random.Shared.Next()` selection, and adapt `GetSegmentKey()` to return stable bucket-index keys instead of phrase text.

**Primary recommendation:** Follow PoeticPhraseProvider implementation exactly—it has the cleanest multi-candidate pattern with proper GetStructuredPhrase() handling for both {h} and {h1} templates. Terse can use the simpler RudePhraseProvider pattern since it returns empty qualifier.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Expand Classic (EnglishPhraseProvider) and Terse (TersePhraseProvider) only
- **D-02:** Poetic (4 candidates) and Rude (4-5 candidates) are already sufficient — no changes
- **D-03:** Non-English providers (French/Spanish/German/Japanese/Polish) deferred to future milestone per REQUIREMENTS
- **D-04:** Novelty providers (Jive/Pirate/Yoda/Dwarf/ValleyGirl/Shakespeare) are Phase 73
- **D-05:** 5 phrase candidates per bucket for both Classic and Terse (12 regular buckets)
- **D-06:** 5 candidates each for noon and midnight special cases (not single strings)
- **D-07:** Total: 14 time slots x 5 candidates = 70 phrases per provider, 140 new phrases total
- **D-08:** Classic variants must be close synonyms — same neutral, everyday English tone
- **D-09:** Examples of acceptable variety: "ten after three" / "ten past three" / "ten minutes past three"
- **D-10:** No poetic, slangy, or personality-inflected phrasing in Classic
- **D-11:** Terse variants must stay strictly British compact idiom
- **D-12:** Keep "half four" / "just gone three" / "quarter to" British forms
- **D-13:** No American terse forms (e.g., "ten til four" is excluded)

### Claude's Discretion
- Exact phrase content within the style constraints above
- Whether to refactor bucket data structure (single template → candidates array) or use a different approach
- GetSegmentKey() implementation for Classic/Terse (must be stable, not depend on random selection — follow Poetic/Rude pattern)
- GetStructuredPhrase() adaptation for multi-candidate providers
- Test structure and assertion approach

### Deferred Ideas (OUT OF SCOPE)
- Non-English phrase expansion (French/Spanish/German/Japanese/Polish) — future milestone, requires native speaker review
- Bumping Poetic/Rude from 4-5 to 5+ candidates — already sufficient variety
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHRASE-01 | Each of the 10 English phrase providers has at least 5 phrase candidates per bucket (12 buckets + noon + midnight) | Existing pattern in Poetic/Rude/Jive/Pirate/Yoda/Dwarf/ValleyGirl/Shakespeare supports 4-5 candidates; expanding Classic/Terse to 5 is mechanical |
| PHRASE-02 | Phrase selection within a bucket is randomized so consecutive same-bucket ticks can show different text | `Random.Shared.Next(candidates.Length)` established in 8 existing providers; thread-safe, zero-allocation after .NET 6 |
| PHRASE-03 | Unit tests verify all providers have complete bucket coverage with minimum 5 candidates each | PhraseStyleProviderTests.cs has test patterns for multi-candidate providers; new test classes needed for expanded Classic/Terse |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Random.Shared | .NET 6+ | Thread-safe global random instance | Zero-allocation singleton, cryptographically secure seed, standard for non-crypto randomization |
| MSTest | 4.0.1 | Unit testing framework | Already used in FuzzyClock.Core.Tests; 357 existing tests |

### Supporting
None required—all functionality is built-in .NET primitives.

**Installation:**
```bash
# No new packages required—everything uses existing .NET 10 primitives
```

## Architecture Patterns

### Recommended Project Structure
```
FuzzyClock.Core/
├── EnglishPhraseProvider.cs        # Expand to multi-candidate
├── TersePhraseProvider.cs          # Expand to multi-candidate
├── PoeticPhraseProvider.cs         # Reference implementation (DO NOT MODIFY)
└── RudePhraseProvider.cs           # Reference implementation (DO NOT MODIFY)

FuzzyClock.Core.Tests/
├── PhraseStyleProviderTests.cs     # Add ClassicExpanded/TerseExpanded test classes
└── MSTestSettings.cs               # Existing parallelization config
```

### Pattern 1: Multi-Candidate Bucket Structure
**What:** Replace single template string with string array per bucket
**When to use:** All phrase providers that need variety within time buckets

**Before (single-candidate):**
```csharp
// Source: EnglishPhraseProvider.cs lines 13-27
private static readonly (int UpperBound, string Template)[] Buckets =
[
    ( 2, "{h} o'clock"),
    ( 7, "just after {h}"),
    (12, "ten past {h}"),
    // ...
];
```

**After (multi-candidate):**
```csharp
// Source: PoeticPhraseProvider.cs lines 20-28
private static readonly (int UpperBound, string[] Candidates)[] Buckets =
[
    ( 2, [
        "the hour turns to {h}",
        "a new hour begins with {h}",
        "the clock whispers {h}",
        "the moment settles into {h}",
    ]),
    ( 7, [
        "barely past {h}",
        "just into {h}",
        "a breath beyond {h}",
        "the first minutes drift past {h}",
    ]),
    // ...
];
```

### Pattern 2: Random Selection in GetPhrase
**What:** Pick random candidate at selection time, not at bucket definition time
**When to use:** Every GetPhrase() call that walks multi-candidate buckets

```csharp
// Source: JivePhraseProvider.cs lines 107-116
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
```

**Critical:** Selection MUST happen inside the loop, not outside—each call gets a new random selection.

### Pattern 3: Stable GetSegmentKey (Bucket-Index Based)
**What:** Return stable key per bucket that doesn't depend on random selection
**When to use:** Multi-candidate providers where phrase changes but time bucket doesn't

**Wrong (phrase-dependent—causes flicker):**
```csharp
// Source: EnglishPhraseProvider.cs line 103 (CURRENT, MUST CHANGE)
public string GetSegmentKey(DateTime dt) => GetPhrase(dt);
```

**Right (bucket-index based—stable):**
```csharp
// Source: PoeticPhraseProvider.cs lines 162-169
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

### Pattern 4: GetStructuredPhrase with Multi-Candidate
**What:** Handle template-end detection for both {h} and {h1} in randomly selected candidate
**When to use:** Providers that need split-layout support (Classic yes, Terse no)

```csharp
// Source: PoeticPhraseProvider.cs lines 122-160 (lines 133-149 excerpt)
foreach (var (upperBound, candidates) in Buckets)
{
    if (minute <= upperBound)
    {
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

        // Fallback: should never hit if all templates end with a placeholder
        string resolved = template
            .Replace("{h}",  HourWords[hour12])
            .Replace("{h1}", HourWords[nextHour12]);
        return ("", resolved);
    }
}
```

**Note:** Terse uses simple fallback `("", GetPhrase(dt))` since all variants are single-line terse forms.

### Pattern 5: Test Coverage for Multi-Candidate Providers
**What:** Verify all buckets have coverage, randomization works, segment keys are stable
**When to use:** Every provider test class

```csharp
// Source: PhraseStyleProviderTests.cs lines 247-261 (JivePhraseProvider example)
[TestMethod]
public void Jive_GetSegmentKey_SameBucket_ReturnsSameKey()
{
    string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
    string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
    Assert.AreEqual(key1, key2);
}

[TestMethod]
public void Jive_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys()
{
    string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
    string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 3, 0));
    Assert.AreNotEqual(key1, key2);
}
```

### Anti-Patterns to Avoid
- **Selecting random candidate once and caching:** Random selection must happen every GetPhrase() call
- **Using GetPhrase() result as GetSegmentKey():** Causes segment key to change on phrase randomization, triggering unwanted UI updates
- **Mutating bucket arrays at runtime:** Buckets are static readonly—selection randomness comes from Random.Shared, not array mutation
- **Mixing single-template and multi-candidate in same bucket array:** Choose one pattern per provider for consistency

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Thread-safe randomization | Custom Random singleton with locks | `Random.Shared` (.NET 6+) | Built-in thread-safe singleton, zero-allocation, cryptographically seeded |
| Phrase variety tracking | Custom LRU cache to avoid recent phrases | Simple `Random.Shared.Next()` | Statistical distribution naturally avoids long streaks; complexity not worth the gain |
| Weighted randomization | Custom probability weights per candidate | Uniform `Next(candidates.Length)` | All phrases in a bucket have equal quality—no need for weights |

**Key insight:** Phrase randomization is a solved problem in .NET 6+. Random.Shared gives thread-safe, zero-allocation, statistically sound randomness without any custom infrastructure.

## Common Pitfalls

### Pitfall 1: GetSegmentKey Returns Random Phrase
**What goes wrong:** If GetSegmentKey() calls GetPhrase() on a multi-candidate provider, the segment key changes every random selection within the same bucket, causing MainWindow to clear cached phrase text and re-render unnecessarily.

**Why it happens:** EnglishPhraseProvider currently has `GetSegmentKey(dt) => GetPhrase(dt)` (line 103), which works for single-candidate buckets but breaks with multi-candidate arrays.

**How to avoid:** Use bucket-index based keys like `"en-classic:0"` for the first bucket, `"en-classic:1"` for the second, etc. Special-case noon/midnight with named keys like `"en-classic:noon"`.

**Warning signs:** Phrase text flickers or changes rapidly even when time bucket hasn't advanced.

### Pitfall 2: Random Selection Outside Loop
**What goes wrong:** If you select a random candidate once before the bucket walk loop, you'll use the wrong candidate for the matched bucket.

**Example (wrong):**
```csharp
int randomIndex = Random.Shared.Next(12); // DON'T DO THIS
foreach (var (upperBound, candidates) in Buckets)
{
    if (minute <= upperBound)
        return candidates[randomIndex].Replace("{h}", HourWords[hour12]);
}
```

**How to avoid:** Select random candidate INSIDE the loop, after finding the matching bucket:
```csharp
foreach (var (upperBound, candidates) in Buckets)
{
    if (minute <= upperBound)
    {
        string template = candidates[Random.Shared.Next(candidates.Length)]; // ✓ Correct
        return template.Replace("{h}", HourWords[hour12]);
    }
}
```

### Pitfall 3: Inconsistent Candidate Counts
**What goes wrong:** If some buckets have 5 candidates and others have 3, users will see uneven variety across different times of day.

**Why it happens:** Manual phrase authoring without systematic verification.

**How to avoid:** Enforce minimum candidate count in tests:
```csharp
[TestMethod]
public void Classic_AllBuckets_HaveMinimumCandidates()
{
    // Reflection or manual check: every bucket has >= 5 candidates
}
```

**Warning signs:** Some time ranges show good variety, others repeat quickly.

### Pitfall 4: Breaking Style Identity
**What goes wrong:** Classic variants drift into informal or poetic territory ("the clock strikes three" instead of "three o'clock"), Terse variants use American forms ("ten til four" instead of "ten to four").

**Why it happens:** Phrase authoring without clear style constraints.

**How to avoid:**
- **Classic:** Stick to neutral, everyday English—"X past/after Y", "quarter past", "half past", "nearly X". Avoid poetic imagery, slang, personality.
- **Terse:** Use strict British idioms—"half four" (not "half past three"), "quarter to", "just gone", no American contractions like "til".

**Warning signs:** User feedback that a style "doesn't sound like itself anymore."

### Pitfall 5: Special Case Noon/Midnight Remain Single Strings
**What goes wrong:** D-06 specifies 5 candidates for noon and midnight, but it's easy to forget and leave them as single return statements like `return "noon";`.

**Why it happens:** Special cases are checked before the bucket walk loop, easy to overlook during refactoring.

**How to avoid:**
- Replace `if (totalMinutes == 720) return "noon";` with a candidates array:
  ```csharp
  if (totalMinutes == 720)
  {
      string[] noonCandidates = ["noon", "twelve noon", "midday", "high noon", "twelve o'clock"];
      return noonCandidates[Random.Shared.Next(noonCandidates.Length)];
  }
  ```
- Or refactor to use a helper method that handles special cases and regular buckets uniformly.

**Warning signs:** All tests pass but noon/midnight still show the same phrase every time.

## Code Examples

Verified patterns from official sources:

### Multi-Candidate Bucket Definition
```csharp
// Source: RudePhraseProvider.cs lines 18-26
private static readonly (int UpperBound, string[] Candidates)[] Buckets =
[
    ( 2, [
        "it's {h}. still you.",
        "congratulations. it's {h}.",
        "{h} o'clock. as if that changes anything.",
        "it is {h}. you're welcome.",
        "{h} on the dot. not that it helps.",
    ]),
    // ... more buckets
];
```

### GetPhrase with Random Selection
```csharp
// Source: RudePhraseProvider.cs lines 95-119 (excerpt 107-116)
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
```

### Stable GetSegmentKey (Bucket-Index Based)
```csharp
// Source: RudePhraseProvider.cs lines 125-134
public string GetSegmentKey(DateTime dt)
{
    int totalMinutes = dt.Hour * 60 + dt.Minute;
    if (totalMinutes == 720) return "en-rude:noon";
    if (totalMinutes == 0)   return "en-rude:midnight";
    int minute = dt.Minute;
    for (int i = 0; i < Buckets.Length; i++)
        if (minute <= Buckets[i].UpperBound) return $"en-rude:{i}";
    throw new InvalidOperationException($"No bucket matched minute={minute}");
}
```

### GetStructuredPhrase for Multi-Candidate (Complex Case)
```csharp
// Source: PoeticPhraseProvider.cs lines 122-160 (full implementation)
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

            // Fallback: should never hit if all templates end with a placeholder
            string resolved = template
                .Replace("{h}",  HourWords[hour12])
                .Replace("{h1}", HourWords[nextHour12]);
            return ("", resolved);
        }
    }

    throw new InvalidOperationException($"No bucket matched minute={minute}");
}
```

### Test Pattern: Segment Key Stability
```csharp
// Source: PhraseStyleProviderTests.cs lines 247-261 (JivePhraseProvider tests)
[TestMethod]
public void Jive_GetSegmentKey_SameBucket_ReturnsSameKey()
{
    string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 0, 0));
    string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
    Assert.AreEqual(key1, key2);
}

[TestMethod]
public void Jive_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys()
{
    string key1 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 2, 0));
    string key2 = _provider.GetSegmentKey(new DateTime(2024, 1, 1, 4, 3, 0));
    Assert.AreNotEqual(key1, key2);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom Random wrapper with locking | `Random.Shared` | .NET 6 (Nov 2021) | Zero-allocation, thread-safe, simpler code |
| Separate Poetic/Rude multi-candidate pattern, Classic/Terse single-candidate | Uniform multi-candidate across all providers | Phase 72 (v4.1) | Consistent variety, no special-case logic per provider |
| GetSegmentKey returns phrase text | GetSegmentKey returns bucket-index key | v3.5 (Mar 2026) | Stable keys enable proper phrase caching in MainWindow |

**Deprecated/outdated:**
- `new Random()` per-thread instances: Replaced by Random.Shared in .NET 6+ (thread-safe, global, zero-allocation)
- Phrase-text based segment keys: Causes flicker with multi-candidate; bucket-index keys are now standard

## Open Questions

None. All patterns are established in the codebase and well-tested across 8 existing multi-candidate providers.

## Sources

### Primary (HIGH confidence)
- EnglishPhraseProvider.cs — Current single-candidate implementation to be expanded
- TersePhraseProvider.cs — Current single-candidate implementation to be expanded
- PoeticPhraseProvider.cs — Reference multi-candidate implementation (lines 20-94, 122-170)
- RudePhraseProvider.cs — Reference multi-candidate implementation (lines 18-93, 125-134)
- JivePhraseProvider.cs — Reference multi-candidate implementation with stable GetSegmentKey (lines 18-134)
- IPhraseProvider.cs — Interface contract (lines 4-14)
- PhraseStyleProviderTests.cs — Test patterns for multi-candidate providers (lines 247-261, 317-322)
- FuzzyClock.Core.Tests.csproj — MSTest 4.0.1 configuration

### Secondary (MEDIUM confidence)
None required—all research based on existing codebase patterns.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Random.Shared and MSTest are already in use, no new dependencies
- Architecture: HIGH - 8 existing multi-candidate providers demonstrate the pattern
- Pitfalls: HIGH - Direct observation of EnglishPhraseProvider.GetSegmentKey() returning phrase text (line 103) shows the exact issue to fix
- Phrase authoring: MEDIUM - Style constraints are user-defined (D-08 to D-13); quality depends on manual review

**Research date:** 2026-04-01
**Valid until:** 2026-04-30 (30 days—stable patterns, no fast-moving dependencies)
