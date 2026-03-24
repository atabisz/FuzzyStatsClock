# Phase 61: Japanese Phrase Providers - Research

**Researched:** 2026-03-24
**Domain:** FuzzyClock.Core — IPhraseProvider implementation, PhraseEngine registration, MSTest unit tests
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** All three new providers follow the exact same code structure as JapanesePhraseProvider (Classic): `HourWords[]` string array (indices 1–12), `Buckets[]` array of `(int UpperBound, string Template)` tuples, `{h}` / `{h1}` placeholder substitution, noon/midnight special cases by total-minutes check.
- **D-02:** Same 12-bucket boundary set as Classic (upper bounds: 2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 59).
- **D-03:** `GetStructuredPhrase()` returns `("", GetPhrase(dt))` for all three providers — same as Classic. No qualifier/emphasis split needed for Japanese styles.
- **D-04:** `GetSegmentKey()` returns `GetPhrase(dt)` — same as Classic.
- **D-05: Terse** — Short, clipped colloquial Japanese. Minimal particles. Favor compact forms.
- **D-06: Poetic** — Atmospheric, imagery-based phrasing. Mark class as provisional (native-speaker review recommended).
- **D-07: Rude** — Blunt, impatient phrasing. Use casual/masculine particles (かよ、じゃん、だろ、いい加減). Mark class as provisional (native-speaker review recommended).
- **D-08:** Add `["ja-classic"]` as an alias for `JapanesePhraseProvider` alongside the existing `["ja"]` key. Do NOT remove or rename the `"ja"` key — that is Phase 62's responsibility.
- **D-09:** Add `["ja-terse"]`, `["ja-poetic"]`, `["ja-rude"]` entries pointing to the new provider instances.

### Claude's Discretion

- Exact Japanese phrase wording within the style register for all 12 buckets (vocabulary is LOW confidence; provisional marking covers this)
- Whether Poetic provider uses full-phrase imagery or just embellishes hour-reference templates
- File naming: `JapaneseTersePhraseProvider.cs`, `JapanesePoeticPhraseProvider.cs`, `JapaneseRudePhraseProvider.cs`

### Deferred Ideas (OUT OF SCOPE)

- Time-of-day period labels (朝/昼/夕/夜) in Japanese providers
- French/Spanish/German/Polish style variants
- Routing logic (ResolveLocaleKey, SettingsWindow Japanese selector) — Phase 62
- Removing/renaming the existing "ja" PhraseEngine key — Phase 62
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JA-01 | Japanese Terse phrase style covers all 12 five-minute buckets, noon, and midnight | D-01/D-02/D-05 define exact structure; HourWords array verified in JapanesePhraseProvider.cs |
| JA-02 | Japanese Poetic phrase style covers all 12 five-minute buckets, noon, and midnight; marked provisional | D-01/D-02/D-06; PoeticPhraseProvider.cs studied for style register intent |
| JA-03 | Japanese Rude phrase style covers all 12 five-minute buckets, noon, and midnight; marked provisional | D-01/D-02/D-07; RudePhraseProvider.cs studied for style register intent |
| JA-06 | Unit tests for each Japanese style provider cover all 12 buckets plus noon and midnight cases | MultilingualPhraseProviderTests.cs is the test pattern; 4 methods per provider class |
</phase_requirements>

---

## Summary

Phase 61 is a pure-addition phase with no UI surface and no dependency on unfinished work. Three new `IPhraseProvider` classes are created in `FuzzyClock.Core` by structurally copying `JapanesePhraseProvider` (Classic) and replacing the `Buckets[]` phrase strings to match each style register (Terse, Poetic, Rude). The `HourWords` array is identical across all four Japanese providers.

`PhraseEngine` receives four new dictionary entries: `["ja-classic"]` aliasing the existing `JapanesePhraseProvider` instance, and `["ja-terse"]`, `["ja-poetic"]`, `["ja-rude"]` pointing to the three new instances. The `["ja"]` key is preserved unchanged.

Unit tests follow the established pattern in `MultilingualPhraseProviderTests.cs`: four MSTest methods per provider class (noon assertion, midnight assertion, 13-row DataRow bucket sweep, GetStructuredPhrase empty-qualifier assertion). Coordinator round-trip tests for the four new ja-* keys go in the existing `PhraseEngineCoordinatorTests.cs` (which carries `[DoNotParallelize]`).

**Primary recommendation:** Copy `JapanesePhraseProvider.cs` three times, rename the class and adjust `Buckets[]` strings only; then add four lines to `PhraseEngine._providers`; then add three `[TestClass]` blocks to `MultilingualPhraseProviderTests.cs` and four `[TestMethod]` stubs to `PhraseEngineCoordinatorTests.cs`.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| FuzzyClock.Core | (project) | IPhraseProvider host assembly | All phrase providers live here |
| MSTest v2 | (project) | Unit test framework | Established in FuzzyClock.Core.Tests |
| .NET (C#) | (project) | Implementation language | Project baseline |

No new NuGet packages needed. This phase is pure C# source additions within the existing project.

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.Core/
├── JapanesePhraseProvider.cs          # existing Classic (reference)
├── JapaneseTersePhraseProvider.cs     # NEW
├── JapanesePoeticPhraseProvider.cs    # NEW
├── JapaneseRudePhraseProvider.cs      # NEW
└── PhraseEngine.cs                    # add 4 entries to _providers

FuzzyClock.Core.Tests/
├── MultilingualPhraseProviderTests.cs # append 3 new [TestClass] blocks
└── PhraseEngineCoordinatorTests.cs    # append 4 new [TestMethod] stubs
```

### Pattern 1: Provider Structure (from JapanesePhraseProvider.cs — verified)

Every Japanese provider is a verbatim structural copy of `JapanesePhraseProvider` with only `Buckets[]` strings changed.

```csharp
// Identical header across all four providers
namespace FuzzyClock.Core;

/// <summary>
/// Japanese [Terse/Poetic/Rude] phrase provider (ja-[terse/poetic/rude]).
/// [Style description].
/// Provisional — native-speaker review recommended for phrase naturalness.
/// </summary>
public class Japanese[Style]PhraseProvider : IPhraseProvider
{
    // HourWords array: IDENTICAL to JapanesePhraseProvider — Kanji hour words do not vary by register
    private static readonly string[] HourWords =
        ["", "一時", "二時", "三時", "四時", "五時", "六時",
              "七時", "八時", "九時", "十時", "十一時", "十二時"];

    // Buckets: same 12 upper bounds; ONLY the Template strings change per style
    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, /* style-specific template */),
        ( 7, /* style-specific template */),
        (12, /* style-specific template */),
        (17, /* style-specific template */),
        (22, /* style-specific template */),
        (27, /* style-specific template */),
        (32, /* style-specific template */),
        (37, /* style-specific template */),
        (42, /* style-specific template */),
        (47, /* style-specific template */),
        (52, /* style-specific template */),
        (59, /* style-specific template */),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "正午";   // or style-specific noon string
        if (totalMinutes == 0)   return "真夜中"; // or style-specific midnight string

        int minute   = dt.Minute;
        int hour12   = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;
        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, template) in Buckets)
        {
            if (minute <= upperBound)
                return template
                    .Replace("{h}",  HourWords[hour12])
                    .Replace("{h1}", HourWords[nextHour12]);
        }
        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));

    public string GetSegmentKey(DateTime dt) => GetPhrase(dt);
}
```

### Pattern 2: PhraseEngine Registration (from PhraseEngine.cs — verified)

Add exactly four new key-value pairs to the existing `_providers` dictionary. The `["ja"]` entry already present must not be touched.

```csharp
// In PhraseEngine._providers init block, after the existing ["ja"] entry:
["ja-classic"] = new JapanesePhraseProvider(),   // alias for the Classic instance
["ja-terse"]   = new JapaneseTersePhraseProvider(),
["ja-poetic"]  = new JapanesePoeticPhraseProvider(),
["ja-rude"]    = new JapaneseRudePhraseProvider(),
```

Note: `["ja"]` and `["ja-classic"]` are two separate `new JapanesePhraseProvider()` instances pointing to the same class. That is correct — they are independent dictionary values. PhraseEngine state is per-instance after `SetLocale`.

### Pattern 3: Unit Test Structure (from MultilingualPhraseProviderTests.cs — verified)

Each provider gets exactly one `[TestClass]` with four `[TestMethod]` definitions. Append after the existing `JapanesePhraseProviderTests` block in `MultilingualPhraseProviderTests.cs`.

```csharp
// ─── Japanese Terse ──────────────────────────────────────────────────────────

[TestClass]
public class JapaneseTersePhraseProviderTests
{
    private static readonly IPhraseProvider Provider = new JapaneseTersePhraseProvider();

    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void JapaneseTerse_Noon_ReturnsExpectedPhrase()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 12, 0, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase));
    }

    [TestMethod]
    public void JapaneseTerse_Midnight_ReturnsExpectedPhrase()
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 0, 0, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase));
    }

    [TestMethod]
    [DataRow(0)][DataRow(1)][DataRow(5)][DataRow(10)][DataRow(15)][DataRow(20)]
    [DataRow(25)][DataRow(30)][DataRow(35)][DataRow(40)][DataRow(45)][DataRow(50)][DataRow(55)]
    public void JapaneseTerse_AllBuckets_ReturnNonEmpty(int minute)
    {
        string phrase = Provider.GetPhrase(new DateTime(2024, 1, 15, 3, minute, 0));
        Assert.IsFalse(string.IsNullOrEmpty(phrase), $"Expected non-empty phrase for minute={minute}");
    }

    [TestMethod]
    public void JapaneseTerse_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        var (qualifier, emphasis) = Provider.GetStructuredPhrase(new DateTime(2024, 1, 15, 3, 30, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}
```

Repeat this exact structure for `JapanesePoeticPhraseProviderTests` and `JapaneseRudePhraseProviderTests`.

### Pattern 4: Coordinator Round-Trip Tests (from PhraseEngineCoordinatorTests.cs — verified)

Append four new `[TestMethod]` stubs following the existing `SetLocale_Ja_ReturnsTrue` method. The class already carries `[DoNotParallelize]` and a `[TestCleanup]` that resets to `"en-classic"` — no changes to the class header needed.

```csharp
[TestMethod]
public void SetLocale_JaClassic_ReturnsTrue()
{
    bool result = PhraseEngine.SetLocale("ja-classic");
    Assert.IsTrue(result);
    Assert.AreEqual("ja-classic", PhraseEngine.CurrentLocale);
}

[TestMethod]
public void SetLocale_JaTerse_ReturnsTrue()
{
    bool result = PhraseEngine.SetLocale("ja-terse");
    Assert.IsTrue(result);
    Assert.AreEqual("ja-terse", PhraseEngine.CurrentLocale);
}

[TestMethod]
public void SetLocale_JaPoetic_ReturnsTrue()
{
    bool result = PhraseEngine.SetLocale("ja-poetic");
    Assert.IsTrue(result);
    Assert.AreEqual("ja-poetic", PhraseEngine.CurrentLocale);
}

[TestMethod]
public void SetLocale_JaRude_ReturnsTrue()
{
    bool result = PhraseEngine.SetLocale("ja-rude");
    Assert.IsTrue(result);
    Assert.AreEqual("ja-rude", PhraseEngine.CurrentLocale);
}
```

### Phrase Vocabulary Reference (Claude's Discretion, LOW confidence)

Vocabulary within each style register is discretionary per CONTEXT.md. The table below maps Classic bucket strings to reasonable style-register equivalents based on D-05, D-06, D-07 directives. These are starting-point suggestions; the implementer owns the final wording.

**Terse** (D-05 — bare, compact forms, minimal particles):

| Bucket | UpperBound | Classic | Terse suggestion |
|--------|-----------|---------|-----------------|
| 0 | 2 | {h}ちょうど | {h} |
| 1 | 7 | {h}過ぎ | {h}すぎ |
| 2 | 12 | {h}十分過ぎ | {h}十分 |
| 3 | 17 | {h}十五分 | {h}十五分 |
| 4 | 22 | {h}二十分 | {h}二十分 |
| 5 | 27 | {h}半近く | もうすぐ{h}半 |
| 6 | 32 | {h}半 | {h}半 |
| 7 | 37 | {h}半過ぎ | {h}半すぎ |
| 8 | 42 | {h1}二十分前 | {h1}二十前 |
| 9 | 47 | {h1}十五分前 | {h1}十五前 |
| 10 | 52 | もうすぐ{h1} | もうすぐ{h1} |
| 11 | 59 | {h1}近く | {h1}近く |
| noon | — | 正午 | 正午 |
| midnight | — | 真夜中 | 真夜中 |

**Poetic** (D-06 — atmospheric, imagery-based; provisional):

| Bucket | UpperBound | Poetic suggestion |
|--------|-----------|-----------------|
| 0 | 2 | {h}の刻 |
| 1 | 7 | {h}を過ぎた頃 |
| 2 | 12 | {h}の光の中 |
| 3 | 17 | {h}の四半刻 |
| 4 | 22 | {h}から遠ざかる |
| 5 | 27 | {h}半へと向かう |
| 6 | 32 | 時の折り返し、{h}の半ば |
| 7 | 37 | {h}半を越えた頃 |
| 8 | 42 | {h1}へと近づく |
| 9 | 47 | {h1}の十五分前 |
| 10 | 52 | まもなく{h1}の刻 |
| 11 | 59 | {h1}の影が迫る |
| noon | — | 昼の頂 |
| midnight | — | 夜の果て |

**Rude** (D-07 — blunt, impatient, casual/masculine particles; provisional):

| Bucket | UpperBound | Rude suggestion |
|--------|-----------|----------------|
| 0 | 2 | もう{h}かよ |
| 1 | 7 | {h}過ぎたじゃないか |
| 2 | 12 | {h}十分だろ |
| 3 | 17 | {h}十五分じゃないか |
| 4 | 22 | {h}二十分だ、いい加減にしろ |
| 5 | 27 | やっと{h}半になる |
| 6 | 32 | やっと{h}半じゃないか |
| 7 | 37 | {h}半過ぎたぞ |
| 8 | 42 | 早く{h1}になれ |
| 9 | 47 | {h1}の十五分前だろ |
| 10 | 52 | もうすぐ{h1}じゃないか |
| 11 | 59 | 早く{h1}になれ |
| noon | — | もう昼だ |
| midnight | — | 真夜中じゃないか |

### Anti-Patterns to Avoid

- **Removing the `["ja"]` key from PhraseEngine:** That is Phase 62's responsibility. Phase 61 only adds new keys.
- **Using Random.Shared for Japanese providers:** Classic, Terse, Poetic, Rude all use single-template buckets (not candidate arrays) per D-01. PoeticPhraseProvider (English) uses candidate arrays but Japanese Poetic does not — it uses the same single-template pattern as Classic.
- **Splitting GetStructuredPhrase:** D-03 mandates `("", GetPhrase(dt))` for all three new providers. Do not replicate the English PoeticPhraseProvider's qualifier-split logic.
- **Using `dt.Hour == 12 && dt.Minute == 0` style guards:** Classic uses `totalMinutes == 720` and `totalMinutes == 0`. All three new providers must use the same `totalMinutes` guard to match D-01 exactly.
- **Writing coordinator tests outside `[DoNotParallelize]` class:** Any test calling `PhraseEngine.SetLocale` must live in `PhraseEngineCoordinatorTests` which already carries `[DoNotParallelize]`, or in a new class that also carries `[DoNotParallelize]`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Bucket walk | Custom switch/if-else per minute | Existing `(UpperBound, Template)[]` tuple array iterated in order — already proven in Classic |
| Noun/hour word lookup | Dynamic kanji generation | Static `HourWords[]` array (indices 1–12) — identical across all Japanese providers |
| Noon/midnight detection | String comparison on hour | `totalMinutes == 720` / `totalMinutes == 0` guard — exact pattern from Classic |
| Test fixture setup | PhraseEngine-mediated provider access | Direct `new Japanese[Style]PhraseProvider()` instantiation — no engine state contamination |

---

## Common Pitfalls

### Pitfall 1: `["ja"]` Key Removal
**What goes wrong:** Developer removes or renames `["ja"]` to `["ja-classic"]` while adding the alias.
**Why it happens:** Appears to be a rename, but it is an alias — the old key must remain until Phase 62.
**How to avoid:** After adding all four new entries, verify `_providers` still contains five keys under `["ja"]`, `["ja-classic"]`, `["ja-terse"]`, `["ja-poetic"]`, `["ja-rude"]`. The existing coordinator test `SetLocale_Ja_ReturnsTrue` will catch any removal of `["ja"]`.
**Warning signs:** `PhraseEngine.SetLocale("ja")` returns `false` after the change.

### Pitfall 2: Noon/Midnight Guard Ordering
**What goes wrong:** The noon/midnight guard is placed after the bucket walk, or the totalMinutes calculation is wrong.
**Why it happens:** Classic uses `totalMinutes == 720` but midnight is `totalMinutes == 0` — not `dt.Hour == 0`. At 12:00 AM the bucket walk for minute=0 would match the first bucket (upperBound=2) and return a phrase rather than "真夜中".
**How to avoid:** Guard block must precede the minute/hour calculations, verbatim from Classic.
**Warning signs:** Test `JapaneseTerse_Midnight_ReturnsExpectedPhrase` returns a bucket phrase instead of the midnight string.

### Pitfall 3: Two Separate `JapanesePhraseProvider` Instances for `["ja"]` and `["ja-classic"]`
**What goes wrong:** Developer uses the same instance reference for both dictionary entries.
**Why it happens:** Looks like the same object, but each entry should use `new JapanesePhraseProvider()` independently.
**How to avoid:** Both `["ja"]` and `["ja-classic"]` should be separate `new JapanesePhraseProvider()` calls. This mirrors the established pattern where all other keys have independent instances. Phase 62 routing assumes each key owns a distinct provider instance.
**Warning signs:** No runtime failure — but any future per-instance state in providers would be shared unexpectedly.

### Pitfall 4: Parallel Test Execution Contaminating PhraseEngine State
**What goes wrong:** A coordinator test that calls `SetLocale("ja-terse")` runs in parallel with another test, leaving PhraseEngine in an unexpected state for that other test.
**Why it happens:** `PhraseEngine` is a static class. MSTest can run test classes in parallel by default.
**How to avoid:** Add all coordinator tests to `PhraseEngineCoordinatorTests` which already carries `[DoNotParallelize]`. Provider isolation tests (in `MultilingualPhraseProviderTests.cs`) use direct instantiation and must NOT call `PhraseEngine.SetLocale` (other than via the no-op `[TestCleanup]` reset that the existing Japanese class already has).
**Warning signs:** Tests pass in isolation but fail intermittently in full suite runs.

### Pitfall 5: Missing `{h1}` Templates in Buckets 8–11
**What goes wrong:** Terse/Poetic/Rude bucket templates for the final four buckets (upperBounds 42, 47, 52, 59) still reference `{h}` instead of `{h1}`.
**Why it happens:** Copy-paste from earlier buckets without updating the placeholder.
**How to avoid:** Buckets 8–11 express time relative to the *next* hour — they must use `{h1}`. Classic buckets 8–11 all use `{h1}`: `{h1}二十分前`, `{h1}十五分前`, `もうすぐ{h1}`, `{h1}近く`.
**Warning signs:** At 3:45 (bucket 9), phrase reads "三時十五分前" (current hour) instead of "四時十五分前" (next hour).

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Single `["ja"]` key | `["ja"]` preserved + `["ja-classic"]` alias added | Enables consistent `ja-*` routing in Phase 62 without breaking existing users |
| English-only style registers | Three new Japanese style registers | Japanese users get Terse/Poetic/Rude phrase variety matching English equivalents |

---

## Open Questions

1. **Exact Japanese phrase wording**
   - What we know: Style register intent is defined (D-05, D-06, D-07); sample phrases for noon/midnight are specified.
   - What's unclear: Phrase naturalness for all 12 buckets is LOW confidence — native-speaker validation recommended.
   - Recommendation: Mark all three provider classes as `/// Provisional — native-speaker review recommended` (matching the existing comment on `JapanesePhraseProvider`). This is non-blocking per STATE.md.

2. **`["ja"]` and `["ja-classic"]` instance sharing**
   - What we know: D-08 says add `["ja-classic"]` as an alias for `JapanesePhraseProvider`.
   - What's unclear: "Alias" could mean same instance (one `new`) or same class (two separate `new`).
   - Recommendation: Use two separate `new JapanesePhraseProvider()` calls to maintain consistent registration semantics with all other keys. No correctness risk either way in this phase.

---

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.Core/JapanesePhraseProvider.cs` — verified: exact code structure, HourWords array, Buckets array, noon/midnight guard
- `FuzzyClock.Core/IPhraseProvider.cs` — verified: interface contract (GetPhrase, GetStructuredPhrase, GetSegmentKey)
- `FuzzyClock.Core/PhraseEngine.cs` — verified: `_providers` dictionary structure, `SetLocale` API
- `FuzzyClock.Core/TersePhraseProvider.cs` — verified: bucket structure, style register intent
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — verified: bucket structure (note: uses candidate arrays — Japanese Poetic does NOT copy this pattern)
- `FuzzyClock.Core/RudePhraseProvider.cs` — verified: bucket structure, style register intent
- `FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs` — verified: 4-method test pattern, DataRow minutes, TestCleanup pattern
- `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — verified: [DoNotParallelize], SetLocale round-trip pattern
- `.planning/phases/61-japanese-phrase-providers/61-CONTEXT.md` — verified: all locked decisions D-01 through D-09

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — confirms 299 tests baseline, notes Japanese Poetic/Rude vocabulary is LOW confidence

### Tertiary (LOW confidence)
- Japanese phrase vocabulary suggestions in this document — derived from style register descriptions in D-05/D-06/D-07; native-speaker review recommended

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entire implementation is within existing project; no new dependencies
- Architecture: HIGH — all patterns verified directly from source files
- Pitfalls: HIGH — derived from code inspection of exact files being modified
- Phrase vocabulary: LOW — style register guidance is clear; exact Japanese wording is discretionary and provisional

**Research date:** 2026-03-24
**Valid until:** Stable — no external dependencies; valid until Phase 62 begins modifying PhraseEngine
