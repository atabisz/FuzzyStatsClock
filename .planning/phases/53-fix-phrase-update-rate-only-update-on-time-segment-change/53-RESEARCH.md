# Phase 53: Fix Phrase Update Rate — Research

**Researched:** 2026-03-18
**Domain:** C# WPF — PhraseEngine provider pattern, random-candidate stabilization, MainWindow update loop
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Segment change detection**
- The fix must be general — not patched only into RudePhraseProvider. Both Rude and the new Poetic implementation must benefit automatically.
- The guard in `UpdatePhraseIfChanged` must detect "same bucket as last render" without calling `GetPhrase()` and comparing the random output string.
- Implementation approach is Claude's discretion (e.g. `GetSegmentKey(DateTime)` on `IPhraseProvider`, or segment key tracked externally). Whatever approach is chosen must require zero changes to Classic/Terse providers.

**Manual refresh behaviour**
- Explicit user actions still trigger a fresh random pick immediately, even if the time bucket has not changed.
- Affected triggers: `SetPhraseStyle`, `SetLanguage`, `ResetToDefaults`, phrase wrap toggle/style change.
- These paths already clear `_currentRawPhrase = ""`. They must also clear the segment-key cache so the next `UpdatePhraseIfChanged` call re-rolls the phrase.

**PoeticPhraseProvider restructure**
- Switch from hour-range to minute-bucket granularity — same bucket boundaries as RudePhraseProvider (upperBound per minute).
- 3–4 random candidates per bucket — Claude composes the phrases.
- Tone: lyrical with time hints AND melancholy/contemplative; mix both flavours across the candidate set for each bucket.
- Keep the two exact specials: `h==0 && m==0` → "the witching hour"; `h==12 && m==0` → "high noon".

**Scope of provider changes**
- `RudePhraseProvider`: no phrase content changes — only gains the general segment-key mechanism.
- `PoeticPhraseProvider`: full rewrite from hour-range to minute-bucket with multi-candidate random selection.
- `ClassicPhraseProvider`, `TersePhraseProvider`: no changes (deterministic; existing `_currentRawPhrase` guard still works perfectly).

**Test coverage**
- Unit tests for the segment-key mechanism: same bucket → same key; adjacent buckets → different key.
- At minimum, a smoke test that calling `GetPhrase()` twice in the same minute returns values from the same bucket (even if strings differ).

### Claude's Discretion
- Exact implementation of the segment-key mechanism (interface method vs external lookup vs PhraseEngine facade method)
- Specific phrase text for all Poetic candidates (user will review before shipping)
- Whether to add a `[DoNotParallelize]` attribute to new segment-key tests (follows existing pattern for static PhraseEngine state)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

The root bug is straightforward: `RudePhraseProvider.GetPhrase()` calls `Random.Shared.Next()` on every invocation. Because the `UpdatePhraseIfChanged()` loop runs every 10 seconds and compares the *output string* to `_currentRawPhrase`, a new random candidate is picked every tick — the guard never fires because the random strings differ. The phrase changes every 10 seconds instead of every ~5 minutes.

The fix requires a stable "bucket identity" that doesn't depend on the random output. The correct approach is to add a `GetSegmentKey(DateTime)` method to `IPhraseProvider` — each provider returns a string key representing the current time bucket. For deterministic providers (Classic, Terse, and all non-English providers), the key is simply the phrase text itself (which equals the output, so existing behaviour is preserved). For random-candidate providers (Rude, new Poetic), the key encodes locale + bucket index only, independent of which candidate was drawn. `UpdatePhraseIfChanged()` in MainWindow compares segment keys; `GetPhrase()` is only called when the key changes. Manual refresh paths clear both `_currentRawPhrase` and the `_lastSegmentKey` cache.

`PoeticPhraseProvider` is simultaneously rewritten from coarse hour-ranges to the same per-minute bucket structure as `RudePhraseProvider`, gaining 3–4 lyrical/melancholy candidates per bucket and the same segment-key stability.

**Primary recommendation:** Add `string GetSegmentKey(DateTime dt)` to `IPhraseProvider`; default implementations return `GetPhrase(dt)` for deterministic providers; random-candidate providers return a bucket-position string; MainWindow caches `_lastSegmentKey` alongside `_currentRawPhrase` and gates on both.

---

## Standard Stack

This phase is purely internal C# refactoring — no new NuGet packages or external libraries. All work is within the existing `FuzzyClock.Core` and `FuzzyClock.App` projects.

| Component | Current version | Role |
|-----------|----------------|------|
| `FuzzyClock.Core` | .NET 10 | Provider interface + phrase logic |
| `FuzzyClock.App` | .NET 10 WPF | MainWindow update loop (consumer) |
| MSTest 4.0.1 | existing | Unit tests in `FuzzyClock.Core.Tests` |
| `Random.Shared` | .NET 6+ | Thread-safe random; already used in RudePhraseProvider |

---

## Architecture Patterns

### Existing: IPhraseProvider contract

```csharp
// Current interface (IPhraseProvider.cs)
public interface IPhraseProvider
{
    string GetPhrase(DateTime dt);
    (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt);
}
```

### Proposed extension: GetSegmentKey

Add one method to the interface:

```csharp
public interface IPhraseProvider
{
    string GetPhrase(DateTime dt);
    (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt);
    /// <summary>
    /// Returns a stable key identifying the current time bucket.
    /// Two calls with DateTimes in the same bucket MUST return equal keys.
    /// Two calls with DateTimes in adjacent buckets MUST return different keys.
    /// The key MUST NOT depend on random candidate selection.
    /// </summary>
    string GetSegmentKey(DateTime dt);
}
```

### Default implementation strategy

For deterministic providers that already produce a stable string per time segment, the segment key equals the phrase output — no logic change:

```csharp
// Default pattern for ClassicPhraseProvider, TersePhraseProvider,
// FrenchPhraseProvider, SpanishPhraseProvider, etc.
public string GetSegmentKey(DateTime dt) => GetPhrase(dt);
```

This is correct because these providers return the same string for all DateTime values in a given bucket, so the phrase-equality guard in `UpdatePhraseIfChanged` already worked and continues to work.

### Segment key for random-candidate providers

For `RudePhraseProvider` and the new `PoeticPhraseProvider`, the key encodes locale tag + bucket index (the position in the `Buckets` array), not the randomly-chosen candidate:

```csharp
// RudePhraseProvider
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

The locale prefix in the key ensures that if the user switches from Rude to Poetic while the minute is still in the same numeric bucket slot, the keys differ and a fresh phrase fires.

### MainWindow: UpdatePhraseIfChanged with segment-key guard

```csharp
// New field alongside _currentRawPhrase
private string _lastSegmentKey = "";

private void UpdatePhraseIfChanged()
{
    string segmentKey = PhraseEngine.GetSegmentKey(DateTime.Now);
    if (segmentKey == _lastSegmentKey) return;  // same bucket — skip

    _lastSegmentKey  = segmentKey;
    string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
    _currentRawPhrase = newPhrase;

    ApplyPhraseWrap(newPhrase);
    // ... rest of existing body unchanged
}
```

Note: `GetPhrase()` is only called when the key says the bucket changed. This eliminates the spurious random re-rolls on each 10-second tick.

### Manual refresh paths: clear both caches

Every path that currently does `_currentRawPhrase = ""` must ALSO do `_lastSegmentKey = ""`:

```csharp
// SetPhraseStyle, SetLanguage, SetPhraseWrapEnabled, SetPhraseWrapStyle, ResetToDefaults
_currentRawPhrase = "";
_lastSegmentKey   = "";
UpdatePhraseIfChanged();
```

Clearing `_lastSegmentKey = ""` means `segmentKey != _lastSegmentKey` will always be true on the next call, triggering a fresh `GetPhrase()` call (and thus a new random pick).

### PoeticPhraseProvider: rewrite structure

The new implementation follows `RudePhraseProvider` exactly in structure. Bucket boundaries use the same 12-bucket `upperBound` array (2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 59). Each bucket gets 3–4 candidates mixing lyrical-with-time-hint and melancholy/contemplative tones. The two specials remain exact string returns:

```csharp
public class PoeticPhraseProvider : IPhraseProvider
{
    private static readonly (int UpperBound, string[] Candidates)[] Buckets =
    [
        ( 2, [
            "the hour turns",                       // lyrical
            "a new hour, barely begun",             // contemplative
            "the clock speaks once",                // spare/lyrical
            "time starts again",                    // melancholy
        ]),
        // ... 11 more buckets ...
    ];

    public string GetPhrase(DateTime dt)
    {
        if (dt.Hour == 0 && dt.Minute == 0) return "the witching hour";
        if (dt.Hour == 12 && dt.Minute == 0) return "high noon";

        int minute = dt.Minute;
        foreach (var (upperBound, candidates) in Buckets)
            if (minute <= upperBound)
                return candidates[Random.Shared.Next(candidates.Length)];

        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public string GetSegmentKey(DateTime dt)
    {
        if (dt.Hour == 0 && dt.Minute == 0) return "en-poetic:witching";
        if (dt.Hour == 12 && dt.Minute == 0) return "en-poetic:noon";
        int minute = dt.Minute;
        for (int i = 0; i < Buckets.Length; i++)
            if (minute <= Buckets[i].UpperBound) return $"en-poetic:{i}";
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));
}
```

Note that unlike `RudePhraseProvider`, `PoeticPhraseProvider` candidates do NOT use `{h}` / `{h1}` substitution tokens — the lyrical/melancholy tone avoids explicit hour naming (or uses it sparingly in a way that doesn't require the token system). This simplifies the implementation compared to Rude.

### PoeticPhraseProvider does not need HourWords

The Rude provider substitutes `{h}` and `{h1}` because its phrases explicitly name hours. Poetic phrases are atmospheric — they can hint at time position (quarter-past, half, near the hour) without naming the hour word. This avoids needing the `HourWords` array entirely. If any candidate does name a specific hour concept, it can be hardcoded in the string rather than parameterized.

### PhraseEngine facade: expose GetSegmentKey

Add one delegating method to the static facade:

```csharp
// PhraseEngine.cs addition
public static string GetSegmentKey(DateTime dt) =>
    _activeProvider.GetSegmentKey(dt);
```

This keeps MainWindow decoupled from provider internals.

### Recommended Project Structure (no changes)

```
FuzzyClock.Core/
├── IPhraseProvider.cs          # +GetSegmentKey method
├── PhraseEngine.cs             # +GetSegmentKey static facade
├── RudePhraseProvider.cs       # +GetSegmentKey impl
├── PoeticPhraseProvider.cs     # full rewrite (hour-range → minute-bucket)
├── EnglishPhraseProvider.cs    # +GetSegmentKey default impl
├── TersePhraseProvider.cs      # +GetSegmentKey default impl
├── [Fr/Es/De/Ja/Pl]...         # +GetSegmentKey default impl each

FuzzyClock.Core.Tests/
├── PhraseStyleProviderTests.cs  # extend with segment-key tests
├── SegmentKeyTests.cs           # new: cross-provider segment-key contract tests (optional)

FuzzyClock.App/
└── MainWindow.xaml.cs          # _lastSegmentKey field + UpdatePhraseIfChanged guard + cache clears
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time-bucket hashing | Custom DateTime hash or modulo arithmetic | Bucket-array linear scan already in providers | The `upperBound` scan is O(12) and already correct; no new data structure needed |
| Thread-safe random | `new Random()` per provider | `Random.Shared.Next()` | Already the pattern; `Random.Shared` is thread-safe since .NET 6 |
| Segment key storage | Separate dictionary/cache class | `_lastSegmentKey` field on MainWindow | Single call site; extra indirection adds complexity for no benefit |

---

## Common Pitfalls

### Pitfall 1: Clock drift between GetSegmentKey and GetPhrase calls

**What goes wrong:** `UpdatePhraseIfChanged` calls `DateTime.Now` twice — once for the key check, once for `GetPhrase()`. If the minute boundary falls between those two calls (rare but possible), the key says "changed" but `GetPhrase` uses the new minute's bucket. This is harmless — a phrase fires one tick early at the boundary, which is correct behaviour.

**How to avoid:** Accept it. Capturing `DateTime.Now` once and passing it to both calls is slightly cleaner but not required. Either approach is correct.

### Pitfall 2: Forgetting _lastSegmentKey on locale/style switch

**What goes wrong:** If only `_currentRawPhrase = ""` is cleared but `_lastSegmentKey` is not, the segment-key guard fires first and sees the old key matches the current bucket → returns early → `GetPhrase` never called → the fresh random pick the user expects never fires.

**How to avoid:** Every site that clears `_currentRawPhrase = ""` must also set `_lastSegmentKey = ""`. There are exactly 4 sites: `SetPhraseStyle`, `SetLanguage`, `SetPhraseWrapEnabled`, `SetPhraseWrapStyle`. `ResetToDefaults` calls `SetLanguage("auto")` which already handles the clear.

**Warning signs:** After switching phrase style, the phrase doesn't update until the minute rolls over.

### Pitfall 3: GetSegmentKey default implementation returning stale data

**What goes wrong:** Implementing `GetSegmentKey` as `return GetPhrase(dt)` in a provider that is later made random — the key becomes random again.

**How to avoid:** For Classic and Terse, `GetPhrase` is deterministic so the default is safe. Document this assumption. Any future random-candidate provider must override `GetSegmentKey` explicitly.

### Pitfall 4: PoeticPhraseProvider missing the midnight fallback bucket

**What goes wrong:** Current `PoeticPhraseProvider` returns `"the small hours"` for `h==0, m>0` via a fallback. The bucket structure handles this naturally: minute 0–2 of any hour falls into bucket 0. But the `h==0 && m==0` special must be checked BEFORE the bucket scan, otherwise minute 0 of hour 0 falls into bucket 0.

**How to avoid:** Keep the special-case checks (witching hour, high noon) BEFORE the bucket loop, identical to `RudePhraseProvider`'s noon/midnight checks. The witching-hour check uses `h==0 && m==0`, so minute 0 of other hours (1:00, 2:00, etc.) still fall into bucket 0 correctly.

### Pitfall 5: Poetic test for "small hours" breaks after rewrite

**What goes wrong:** The existing test `Poetic_SmallHours_ReturnsSmallHours` asserts `StringAssert.Contains(phrase, "small hours")`. After the rewrite, `3:00` no longer returns that exact phrase.

**How to avoid:** Update (or replace) the existing Poetic tests. The new tests should verify: (a) non-empty output, (b) witching-hour special, (c) high-noon special, (d) that two calls in the same minute return non-null strings (don't assert exact text since output is random). The old hour-range string assertions must be removed.

### Pitfall 6: [DoNotParallelize] on segment-key tests that touch PhraseEngine static state

**What goes wrong:** Tests that call `PhraseEngine.GetSegmentKey()` or `PhraseEngine.SetLocale()` share static state. Running in parallel causes flaky failures.

**How to avoid:** Any test class that calls `PhraseEngine` static methods (not just provider instances directly) must have `[DoNotParallelize]` and a `[TestCleanup]` that resets locale to `"en-classic"`. Tests that instantiate providers directly (e.g. `new RudePhraseProvider().GetSegmentKey(dt)`) are safe to parallelize.

---

## Code Examples

### Segment key: bucket scan pattern (HIGH confidence — derived from existing RudePhraseProvider source)

```csharp
// In RudePhraseProvider — matches existing Buckets array structure exactly
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

### Deterministic provider default (HIGH confidence)

```csharp
// In EnglishPhraseProvider, TersePhraseProvider, FrenchPhraseProvider, etc.
public string GetSegmentKey(DateTime dt) => GetPhrase(dt);
```

### MainWindow guard pattern (HIGH confidence — mirrors existing _currentRawPhrase pattern)

```csharp
private string _lastSegmentKey = "";

private void UpdatePhraseIfChanged()
{
    string segmentKey = PhraseEngine.GetSegmentKey(DateTime.Now);
    if (segmentKey == _lastSegmentKey) return;
    _lastSegmentKey   = segmentKey;
    string newPhrase  = PhraseEngine.GetPhrase(DateTime.Now);
    _currentRawPhrase = newPhrase;
    ApplyPhraseWrap(newPhrase);
    // ... rest of body unchanged
}
```

### Manual refresh cache clear (HIGH confidence — mirrors existing _currentRawPhrase clear sites)

```csharp
// Pattern at all 4 explicit-invalidation sites
_currentRawPhrase = "";
_lastSegmentKey   = "";
UpdatePhraseIfChanged();
```

### Segment-key unit test pattern (HIGH confidence — follows existing [DataRow] and [DoNotParallelize] patterns)

```csharp
[TestClass]
public class RudePhraseSegmentKeyTests
{
    private static readonly RudePhraseProvider _provider = new();

    [TestMethod]
    [DataRow(3, 0,  3, 1)]   // minute 0 and minute 1 are both in bucket 0 (upperBound=2)
    [DataRow(3, 0,  3, 2)]
    public void SameBucket_ReturnsSameKey(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }

    [TestMethod]
    [DataRow(3, 2, 3, 3)]    // bucket 0 (<=2) vs bucket 1 (<=7)
    [DataRow(3, 7, 3, 8)]    // bucket 1 vs bucket 2
    public void AdjacentBuckets_ReturnDifferentKey(int h1, int m1, int h2, int m2)
    {
        var dt1 = new DateTime(2024, 1, 1, h1, m1, 0);
        var dt2 = new DateTime(2024, 1, 1, h2, m2, 0);
        Assert.AreNotEqual(_provider.GetSegmentKey(dt1), _provider.GetSegmentKey(dt2));
    }
}
```

### Poetic bucket candidate tone examples (for planning reference)

Bucket 0 (on the hour, UpperBound=2):
- "the hour turns" — lyrical/spare
- "a new hour, barely begun" — contemplative
- "the clock speaks once" — lyrical
- "time starts over" — melancholy

Bucket 5 (≈25 past, UpperBound=27):
- "nearly half the hour is gone" — lyrical with hint
- "time drifts toward the half" — lyrical
- "the minutes pile up, unnoticed" — melancholy
- "not quite half past, and already forgetting" — melancholy/ironic

Bucket 9 (quarter to, UpperBound=47):
- "the quarter-hour approaches" — lyrical with hint
- "a quarter still to go" — spare
- "the last stretch of the hour" — contemplative
- "almost through, almost" — melancholy

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `RudePhraseProvider` string comparison guard | Segment-key guard (bucket identity) | Phrase stabilizes per bucket (~5 min); explicit actions still re-roll |
| `PoeticPhraseProvider` hour-range single phrase | Per-minute bucket with 3–4 random candidates | Same stability fix; richer variety; consistent structure with Rude |

---

## Open Questions

1. **Poetic candidates with hour-name tokens**
   - What we know: `RudePhraseProvider` uses `{h}` / `{h1}` for named hours. The lyrical/melancholy Poetic tone works without explicit hour naming.
   - What's unclear: Whether any Poetic candidates should name hours (e.g. "just past {h}").
   - Recommendation: Avoid the token system for Poetic; atmospheric phrasing is more authentic to the tone and avoids the `HourWords` array dependency. If a candidate benefits from naming, hardcode the concept rather than parameterize (e.g. "past the half" rather than "half past {h}").

2. **Number of providers needing GetSegmentKey default**
   - What we know: 7 providers exist beyond Rude and Poetic: en-classic, en-terse, fr, es, de, ja, pl.
   - What's unclear: Whether all 7 are truly deterministic (no future random additions).
   - Recommendation: Add `GetSegmentKey` to all 7 as `=> GetPhrase(dt)`. This is a one-liner per provider. The interface contract makes it explicit and prevents future providers from silently inheriting broken behaviour.

---

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.Core/RudePhraseProvider.cs` — bucket structure, `Random.Shared.Next()` pattern, upperBound values, `{h}`/`{h1}` substitution
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — current implementation to be replaced; exact specials
- `FuzzyClock.Core/IPhraseProvider.cs` — interface contract; extension point
- `FuzzyClock.Core/PhraseEngine.cs` — static facade; delegation pattern
- `FuzzyClock.App/MainWindow.xaml.cs` lines 586–620 — `UpdatePhraseIfChanged()` body; `_currentRawPhrase` guard
- `FuzzyClock.App/MainWindow.xaml.cs` lines 1216–1283 — `SetPhraseStyle`, `SetLanguage`, `SetPhraseWrapEnabled`, `SetPhraseWrapStyle` invalidation sites
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — existing Poetic/Rude test patterns to update
- `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — `[DoNotParallelize]` + `[TestCleanup]` pattern

### Secondary (MEDIUM confidence)
- `.planning/phases/53.../53-CONTEXT.md` — user decisions, scope, code insights

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure internal refactoring, no new dependencies
- Architecture: HIGH — all patterns derived directly from existing codebase source
- Pitfalls: HIGH — derived from reading actual code and understanding the bug mechanism
- Phrase content: MEDIUM — Poetic candidates are Claude-composed; user review required before shipping

**Research date:** 2026-03-18
**Valid until:** Stable — no external dependencies; valid until project structure changes
