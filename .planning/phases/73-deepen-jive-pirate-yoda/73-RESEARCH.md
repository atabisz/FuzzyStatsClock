# Phase 73: Deepen Jive/Pirate/Yoda - Research

**Researched:** 2026-04-01
**Domain:** Linguistic authenticity for novelty phrase providers (AAVE-inspired jive, nautical pirate, Yoda OSV syntax)
**Confidence:** HIGH

## Summary

Phase 73 deepens three novelty phrase providers—Jive, Pirate, and Yoda—from basic vocabulary tagging to authentic, consistent linguistic patterns. The technical infrastructure is identical to Phase 72 (multi-candidate buckets, Random.Shared selection, stable GetSegmentKey), but the challenge is **content quality**: each provider must apply its linguistic rules **consistently** across all 14 time slots while remaining readable and authentic, not caricature.

**Jive:** Currently uses 1940s Harlem vocabulary (daddy-o, cat, solid, dig) but lacks rhythmic flow and expressive AAVE patterns. Needs natural contraction patterns ("comin' up on"), emphatic repetition ("solid, solid"), and organic vocabulary placement—not just appending "daddy-o" to standard English.

**Pirate:** Currently uses nautical vocabulary (arr, yarr, bells, avast) but lacks authentic maritime metaphors. Real nautical time-telling uses **bells** (ship's watch system), **watches** (4-hour duty periods), **course** and **bearing** metaphors. Needs natural integration of seafaring concepts, not just pirate movie catchphrases.

**Yoda:** Currently has OSV syntax inversion but inconsistently applied. Yoda's pattern is **OBJECT-VERB-SUBJECT** ("quarter to four, it is" not "it's quarter to four"), with declarative affirmations ("hmm", "yes", "mmm") as sentence enders or starters, never mid-sentence fillers. Needs consistent inversion across ALL phrases plus authentic meditative tone.

**Primary recommendation:** Expand each provider to 5 candidates per bucket (same as Phase 72 coverage) with **strict linguistic rules** documented in code comments. Each candidate must pass the "could a native speaker say this naturally?" test. Prioritize **authenticity over density**—readability matters.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERS-01 | Jive provider uses rhythmic, expressive AAVE-inspired phrasing consistently across all buckets | Natural contraction patterns, emphatic repetition, organic vocabulary flow documented; current provider has vocabulary but lacks rhythm |
| PERS-02 | Pirate provider uses nautical metaphors and seafaring language naturally in time expressions | Ship's bells system, watch structure, maritime metaphors researched; current provider has pirate vocabulary but lacks authentic nautical time concepts |
| PERS-03 | Yoda provider consistently applies OSV (Object-Subject-Verb) syntax inversion to phrases | OSV pattern rules documented with declarative affirmation placement; current provider has partial inversion but inconsistent application |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Random.Shared | .NET 6+ | Thread-safe random candidate selection | Already used in Phase 72 expansion; zero-allocation, established pattern |
| MSTest | 4.0.1 | Unit testing framework | Existing test infrastructure with 467 tests passing |

### Supporting
None required—this is a content refactoring using existing infrastructure.

**Installation:**
```bash
# No new packages required—reusing Phase 72 multi-candidate pattern
```

## Architecture Patterns

### Recommended Project Structure
```
FuzzyClock.Core/
├── JivePhraseProvider.cs          # Deepen AAVE-inspired patterns
├── PiratePhraseProvider.cs        # Add authentic nautical metaphors
├── YodaPhraseProvider.cs          # Enforce consistent OSV syntax
└── IPhraseProvider.cs             # No changes needed

FuzzyClock.Core.Tests/
├── PhraseStyleProviderTests.cs    # Expand Jive/Pirate/Yoda test classes
└── NoveltyPhraseAuthenticityTests.cs  # NEW: Linguistic pattern validation tests
```

### Pattern 1: Jive Rhythmic Phrasing (AAVE-Inspired)
**What:** Authentic AAVE-inspired patterns with natural contraction, emphatic repetition, rhythmic flow
**When to use:** All Jive provider buckets (14 time slots)
**Authenticity rules:**
- Natural contractions: "comin' up on", "just gone", "nigh on" (NOT "coming up on")
- Emphatic repetition: "solid, solid", "real gone, real gone" (common in AAVE rhythm)
- Vocabulary placement: Integrate naturally, not append ("it's three, daddy-o" → "three on the nose, cat")
- Avoid caricature: No minstrel-show exaggeration; maintain dignity and authenticity

**Current pattern (weak):**
```csharp
// Source: JivePhraseProvider.cs lines 20-24 (bucket 0)
( 2, [
    "solid {h} o'clock, daddy-o",
    "that's {h} on the nose, cat",
    "straight-up {h} — dig it",
    "all reet, it's {h}, hep cat",
]),
```
**Analysis:** Good vocabulary ("solid", "all reet", "hep cat") but "it's {h}" is standard English with vocabulary appended. "on the nose" is idiomatic and strong.

**Improved pattern (authentic rhythm):**
```csharp
( 2, [
    "{h} on the nose, cat",               // Idiomatic placement
    "solid {h}, daddy-o — solid",         // Emphatic repetition
    "the clock's blowin' {h}, dig it",    // Natural contraction + expressive verb
    "{h} sharp, hep cat — all reet",      // Vocabulary integration, not append
    "that's {h} right now, real gone",    // Rhythmic emphasis
]),
```

### Pattern 2: Pirate Nautical Authenticity
**What:** Authentic maritime language using ship's bells, watches, course metaphors
**When to use:** All Pirate provider buckets (14 time slots)
**Nautical time-telling:**
- **Bells:** Ship's watch uses bells to mark 30-minute intervals (1 bell = 30min, 2 bells = 1hr, 8 bells = 4hr/watch end)
- **Watches:** 4-hour duty periods (middle watch, morning watch, forenoon watch, afternoon watch, first dog watch, second dog watch)
- **Metaphors:** Course (direction/progress), bearing (heading), trim (ship balance), steady on (maintain course)

**Current pattern (vocabulary only):**
```csharp
// Source: PiratePhraseProvider.cs lines 19-24 (bucket 0)
( 2, [
    "{h} bells, arr",
    "avast — {h} bells, yarr",
    "shiver me timbers, it's {h} o'clock",
    "ahoy, {h} bells, ye scallywag",
]),
```
**Analysis:** Uses "bells" but incorrectly (ship's bells don't map 1:1 to clock hours). "it's {h} o'clock" is landlubber phrasing.

**Improved pattern (authentic nautical):**
```csharp
( 2, [
    "eight bells strike {h}, arr",        // 8 bells = watch end, contextually valid
    "mark {h} by the watch, yarr",        // "mark" = note time officially
    "the glass shows {h}, steady on",     // "glass" = hourglass/timepiece
    "on the stroke of {h}, avast",        // "stroke" = bell strike
    "{h} bells true, by the log",         // "by the log" = ship's official record
]),
```

### Pattern 3: Yoda Consistent OSV Syntax
**What:** Object-Subject-Verb word order with declarative affirmations
**When to use:** All Yoda provider buckets (14 time slots)
**OSV syntax rules:**
- Standard English: "It is three o'clock" (Subject-Verb-Object)
- Yoda OSV: "Three o'clock, it is" (Object-Verb-Subject)
- Affirmations: "hmm", "yes", "mmm" as sentence enders or starters, NOT mid-sentence
- Declarative endings: "it is", "we are", "it has", "we have" (present tense, calm authority)

**Current pattern (inconsistent):**
```csharp
// Source: YodaPhraseProvider.cs lines 18-24 (bucket 0)
( 2, [
    "{h} o'clock, it is",                 // ✓ Correct OSV
    "it is {h}, hmm",                     // ✗ Wrong: SVO order ("it is" before object)
    "{h} — the hour, it is, yes",         // ✓ Correct: object first, then declarative
    "{h} o'clock, hmm, it is",            // ✗ Wrong: affirmation mid-sentence
]),
```

**Improved pattern (consistent OSV):**
```csharp
( 2, [
    "{h} o'clock, it is",                 // ✓ Pure OSV
    "the hour of {h}, upon us it is",     // ✓ Object-Subject-Verb
    "{h}, the time shows, hmm",           // ✓ Object-Verb-Subject + affirmation end
    "hmm, {h} o'clock it is, yes",        // ✓ Affirmation start, OSV, affirmation end
    "{h} — struck, the hour has",         // ✓ Object-Verb-Subject
]),
```

### Pattern 4: Authenticity Test Coverage
**What:** Unit tests that verify linguistic pattern consistency, not just phrase existence
**When to use:** New test class `NoveltyPhraseAuthenticityTests.cs`

```csharp
[TestClass]
public class NoveltyPhraseAuthenticityTests
{
    // Jive authenticity: Check for AAVE contraction patterns
    [TestMethod]
    public void Jive_AllPhrases_UseNaturalContractions()
    {
        var provider = new JivePhraseProvider();
        int[] allMinutes = Enumerable.Range(0, 60).ToArray();

        foreach (int minute in allMinutes)
        {
            string phrase = provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));

            // Should NOT have standard "coming" — should use "comin'"
            if (phrase.Contains("coming"))
                Assert.Fail($"Jive phrase '{phrase}' uses standard 'coming' instead of contraction 'comin''");

            // If has "it's", should be minimal (Jive prefers direct phrasing)
            if (phrase.StartsWith("it's "))
                Assert.Fail($"Jive phrase '{phrase}' starts with standard 'it's' — needs more expressive phrasing");
        }
    }

    // Pirate authenticity: Check for nautical terminology
    [TestMethod]
    public void Pirate_AllPhrases_UseNauticalTerminology()
    {
        var provider = new PiratePhraseProvider();
        int[] allMinutes = Enumerable.Range(0, 60).ToArray();

        // Define authentic nautical terms (not just pirate vocabulary)
        string[] nauticalTerms = ["bells", "watch", "mark", "glass", "course", "bearing", "log", "strike"];

        foreach (int minute in allMinutes)
        {
            string phrase = provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));

            bool hasNauticalTerm = nauticalTerms.Any(term => phrase.Contains(term, StringComparison.OrdinalIgnoreCase));
            bool hasPirateVocab = phrase.Contains("arr") || phrase.Contains("yarr") || phrase.Contains("avast")
                               || phrase.Contains("ahoy") || phrase.Contains("blimey");

            Assert.IsTrue(hasNauticalTerm || hasPirateVocab,
                $"Pirate phrase '{phrase}' lacks both nautical terminology and pirate vocabulary");
        }
    }

    // Yoda authenticity: Check for OSV syntax in all phrases
    [TestMethod]
    public void Yoda_AllPhrases_UseOSVSyntax()
    {
        var provider = new YodaPhraseProvider();
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int minute in sampleMinutes)
        {
            string phrase = provider.GetPhrase(new DateTime(2024, 1, 1, 3, minute, 0));

            // OSV indicators: should END with declarative verb phrases
            bool endsWithDeclarative = phrase.EndsWith("it is") || phrase.EndsWith("we are")
                                    || phrase.EndsWith("it has") || phrase.EndsWith("yes")
                                    || phrase.EndsWith("hmm") || phrase.EndsWith("mmm");

            // Should NOT start with "it is" or "it's" (that's SVO order)
            bool startsWithSVO = phrase.StartsWith("it is ") || phrase.StartsWith("it's ");

            Assert.IsTrue(endsWithDeclarative,
                $"Yoda phrase '{phrase}' doesn't end with OSV declarative pattern");
            Assert.IsFalse(startsWithSVO,
                $"Yoda phrase '{phrase}' starts with SVO order 'it is/it's' — violates OSV syntax");
        }
    }
}
```

### Anti-Patterns to Avoid
- **Vocabulary tagging:** Appending "daddy-o" to standard English phrases (current Jive problem)
- **Movie catchphrases only:** "Arr" and "yarr" without authentic nautical concepts (current Pirate problem)
- **Inconsistent syntax:** Mixing OSV and SVO in same provider (current Yoda problem)
- **Caricature density:** Over-stuffing every phrase with vocabulary markers makes them unreadable
- **Ignoring readability:** Authenticity must balance with clarity—users need to read the time

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AAVE grammar rules engine | Custom parser/validator for AAVE patterns | Manual review with documented patterns | AAVE is complex and evolving; automated validation risks false positives/negatives |
| Nautical time conversion | Algorithm to map clock time to ship's bells | Direct phrase authoring with nautical metaphors | Ship's bells system is contextual (watch-relative), not a pure formula |
| Syntax inversion algorithm | Automated OSV converter from standard phrases | Hand-authored OSV phrases with test validation | Yoda's syntax is idiosyncratic (Star Wars character, not linguistic standard); automation would miss nuance |

**Key insight:** Linguistic authenticity for novelty providers requires **human judgment** and **documented patterns**, not automation. The codebase already has the right structure (multi-candidate buckets); Phase 73 is about **content quality**, not new infrastructure.

## Common Pitfalls

### Pitfall 1: Vocabulary Appending (Jive)
**What goes wrong:** Standard English phrases with vocabulary tacked on: "it's three o'clock, daddy-o"

**Why it happens:** Easier to add markers than restructure phrasing naturally.

**How to avoid:**
- **Before expansion:** Document 5 AAVE patterns (contraction, repetition, emphatic placement, rhythmic flow, natural idioms)
- **During authoring:** Each phrase must integrate vocabulary organically: "three on the nose, cat" not "it's three, cat"
- **Test validation:** Scan for "it's" + vocabulary — flag for revision

**Warning signs:** Phrases feel like standard English with costume vocabulary, not authentic voice.

### Pitfall 2: Pirate Movie Clichés (Pirate)
**What goes wrong:** Overuse of "arr", "yarr", "shiver me timbers" without nautical authenticity. Real sailors don't say "shiver me timbers" for time-telling.

**Why it happens:** Pop culture pirate image (movie tropes) vs. historical maritime language.

**How to avoid:**
- **Nautical research:** Ship's bells (8-bell watch cycle), watches (4-hour duty), navigation terms (bearing, course, trim)
- **Authentic phrasing:** "mark three by the watch" (nautical) not "it's three o'clock, arr" (landlubber + arr)
- **Balance:** Mix pirate vocabulary (arr, yarr, avast) with authentic maritime concepts (bells, watch, glass, log)

**Warning signs:** User feedback that pirate sounds "gimmicky" or "not like a real sailor."

### Pitfall 3: Inconsistent OSV Application (Yoda)
**What goes wrong:** Some phrases use OSV ("three o'clock, it is"), others use SVO ("it is three o'clock"), breaking immersion.

**Why it happens:** OSV is unnatural for English speakers; easy to slip into standard SVO during authoring.

**How to avoid:**
- **Document OSV rules:** Object-Verb-Subject, declarative endings ("it is", "we are"), affirmations as bookends
- **Test validation:** Check for SVO patterns ("it is " + object, "it's " + object) — flag as violations
- **Manual review:** Read each phrase aloud — Yoda's voice should be unmistakable

**Warning signs:** Some phrases "sound like Yoda", others sound normal — inconsistency breaks character.

### Pitfall 4: Caricature Over-Density
**What goes wrong:** Every phrase stuffed with markers: "Arr, yarr, by Davy Jones, it's three bells, ye scallywag, shiver me timbers, avast!"

**Why it happens:** Trying too hard to signal personality; fear that subtlety won't read as authentic.

**How to avoid:**
- **Readability first:** Users must be able to glance and know the time—clarity > density
- **Vary intensity:** Some phrases can be subtle ("mark three by the watch"), others more expressive ("arr, three bells strike!")
- **Human review:** If a phrase feels like parody, it probably is—dial back

**Warning signs:** Test users laugh at phrases but can't quickly tell what time it is.

### Pitfall 5: Forgetting 5-Candidate Coverage
**What goes wrong:** Some buckets have 5 candidates, others have 4—uneven variety.

**Why it happens:** Phrase authoring fatigue—14 slots × 5 candidates = 70 total per provider × 3 providers = 210 new phrases.

**How to avoid:**
- **Systematic approach:** Complete one provider fully before moving to next (don't interleave)
- **Test coverage:** Verify all buckets have exactly 5 candidates (same test pattern as Phase 72)
- **Incremental commits:** Commit after each provider completion for clear progress tracking

**Warning signs:** Some time ranges show good variety, others repeat quickly.

## Code Examples

### Jive AAVE-Inspired Authenticity (5 candidates per bucket)
```csharp
// Source: JivePhraseProvider.cs (to be expanded)
// Bucket 0 (0-2 minutes past hour) — "on the hour" category
( 2, [
    "{h} on the nose, cat",                    // Idiomatic, integrated vocabulary
    "solid {h}, daddy-o — solid",              // Emphatic repetition
    "the clock's blowin' {h}, dig it",         // Natural contraction, expressive verb
    "{h} sharp, hep cat — all reet",           // Multiple vocabulary, organic flow
    "that's {h} right now, real gone",         // Rhythmic emphasis
]),

// Bucket 6 (28-32 minutes) — "half past" category
(32, [
    "half past {h}, in the groove",            // Vocabulary as idiom extension
    "half past {h}, solid — real solid",       // Emphatic doubling
    "gone the half of {h}, daddy-o",           // AAVE "gone" (passed) construction
    "we at half past {h}, cat — dig",          // Contraction "we at" (AAVE present)
    "half past {h}, all reet and righteous",   // Vocabulary pairing
]),
```

### Pirate Nautical Metaphor Authenticity
```csharp
// Source: PiratePhraseProvider.cs (to be expanded)
// Bucket 0 (0-2 minutes past hour)
( 2, [
    "eight bells strike {h}, arr",             // Authentic bells reference
    "mark {h} by the watch, yarr",             // Nautical time-keeping verb
    "the glass shows {h}, steady on",          // Hourglass/timepiece reference
    "on the stroke of {h}, avast",             // Bell strike terminology
    "{h} bells true, by the log",              // Ship's log (official record)
]),

// Bucket 6 (28-32 minutes) — "half past" category
(32, [
    "half past {h}, arr — steady as she goes", // Navigation metaphor
    "half the glass of {h}, yarr",             // Hourglass half-empty
    "gone the half-hour watch of {h}",         // Watch structure reference
    "half past {h}, trim yer course",          // Ship balance metaphor
    "mid-watch past {h}, by the compass",      // Navigation tool reference
]),
```

### Yoda Consistent OSV Syntax
```csharp
// Source: YodaPhraseProvider.cs (to be expanded)
// Bucket 0 (0-2 minutes past hour)
( 2, [
    "{h} o'clock, it is",                      // Pure OSV
    "the hour of {h}, upon us it is",          // Object-Subject-Verb
    "{h}, the time shows, hmm",                // Object-Verb-Subject + affirmation
    "hmm, {h} o'clock it is, yes",             // Affirmation bookends + OSV
    "{h} — struck, the hour has",              // Object-Verb-Subject
]),

// Bucket 6 (28-32 minutes) — "half past" category
(32, [
    "half past {h}, mmm, it is",               // OSV + affirmation
    "the half hour of {h}, passed it has",     // Object-Verb-Subject
    "hmm, half past {h} we are, yes",          // Affirmation start/end + OSV
    "half past {h}, reached we have",          // OSV declarative
    "gone the half of {h}, it has, mmm",       // Object-Verb-Subject + affirmation
]),
```

### Linguistic Authenticity Tests
```csharp
// Source: NoveltyPhraseAuthenticityTests.cs (new file)
[TestClass]
public class JiveAuthenticityTests
{
    private static readonly IPhraseProvider _provider = new JivePhraseProvider();

    [TestMethod]
    public void Jive_AllBuckets_AvoidStandardEnglishCopula()
    {
        // "Copula" = "it's", "it is" — AAVE often drops copula
        // Test that Jive phrases don't overuse standard English "it's X"
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
        int copulaCount = 0;

        foreach (int m in sampleMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, m, 0));
            if (phrase.StartsWith("it's ") || phrase.StartsWith("it is "))
                copulaCount++;
        }

        // Allow some standard forms, but majority should use AAVE patterns
        Assert.IsTrue(copulaCount < 6,
            $"Jive provider uses standard English copula in {copulaCount}/12 samples — too high");
    }
}

[TestClass]
public class PirateAuthenticityTests
{
    private static readonly IPhraseProvider _provider = new PiratePhraseProvider();

    [TestMethod]
    public void Pirate_BellsReferences_UseAuthenticNauticalContext()
    {
        // When phrase mentions "bells", should have nautical context
        int[] allMinutes = Enumerable.Range(0, 60).ToArray();

        foreach (int m in allMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, m, 0));

            if (phrase.Contains("bells") || phrase.Contains("bell"))
            {
                // Should have nautical terms OR pirate vocabulary, not just "bells"
                bool hasContext = phrase.Contains("watch") || phrase.Contains("strike")
                               || phrase.Contains("mark") || phrase.Contains("arr")
                               || phrase.Contains("yarr");

                Assert.IsTrue(hasContext,
                    $"Pirate phrase '{phrase}' uses 'bells' without nautical/pirate context");
            }
        }
    }
}

[TestClass]
public class YodaAuthenticityTests
{
    private static readonly IPhraseProvider _provider = new YodaPhraseProvider();

    [TestMethod]
    public void Yoda_AllBuckets_EnforceOSVSyntax()
    {
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int m in sampleMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, m, 0));

            // OSV: Should NOT start with subject-verb ("it is", "it's", "we are")
            bool violatesSVO = phrase.StartsWith("it is ") || phrase.StartsWith("it's ")
                            || phrase.StartsWith("we are ") || phrase.StartsWith("we're ");

            Assert.IsFalse(violatesSVO,
                $"Yoda phrase '{phrase}' at minute {m} uses SVO order — violates OSV syntax rule");
        }
    }

    [TestMethod]
    public void Yoda_AllBuckets_UseDeclarativeEndings()
    {
        int[] sampleMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

        foreach (int m in sampleMinutes)
        {
            string phrase = _provider.GetPhrase(new DateTime(2024, 1, 1, 3, m, 0));

            // OSV with declarative: should end with verb phrase or affirmation
            bool hasDeclarativeEnd = phrase.EndsWith("it is") || phrase.EndsWith("we are")
                                  || phrase.EndsWith("it has") || phrase.EndsWith("we have")
                                  || phrase.EndsWith("yes") || phrase.EndsWith("hmm")
                                  || phrase.EndsWith("mmm");

            Assert.IsTrue(hasDeclarativeEnd,
                $"Yoda phrase '{phrase}' at minute {m} doesn't end with OSV declarative pattern");
        }
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single phrase per bucket | Multi-candidate arrays (4-5 per bucket) | v3.2 (Mar 2026) | Variety within personality styles |
| Vocabulary tagging only | Linguistic pattern authenticity | Phase 73 (v4.1) | Deepens novelty providers from gimmick to authentic voice |
| No linguistic tests | Pattern-based authenticity tests | Phase 73 (v4.1) | Automated verification of style consistency |

**Deprecated/outdated:**
- Vocabulary-only novelty: Early providers just appended markers ("daddy-o", "arr") to standard phrases—now requires integrated linguistic patterns
- Inconsistent syntax: Yoda mixed OSV and SVO—now enforces consistent OSV across all phrases

## Open Questions

1. **AAVE sensitivity:** Jive provider is inspired by 1940s Harlem slang, not modern AAVE. Should documentation clarify historical vs. contemporary distinction?
   - **What we know:** Current provider cites Cab Calloway's Hepster's Dictionary (1938) and Dan Burley's Original Handbook of Harlem Jive (1944)
   - **What's unclear:** Whether modern users will interpret as respectful historical reference or caricature
   - **Recommendation:** Keep historical vocabulary (solid, hep cat, daddy-o, dig) but add comment noting 1940s jazz era origin; avoid modern AAVE patterns to prevent confusion

2. **Nautical bells mapping:** Ship's bells are watch-relative (1 bell = 30min into watch), not absolute clock time. Should pirate phrases use "bells" metaphorically or avoid the term?
   - **What we know:** Current phrases use "{h} bells" which is nautically incorrect (clock hours ≠ ship's bells count)
   - **What's unclear:** Whether to keep simplified "bells" for flavor or use accurate "mark {h} by the watch"
   - **Recommendation:** Mix both—some phrases use "bells" as flavor (acceptable in pirate fiction), others use accurate nautical terms ("mark", "watch", "glass")

3. **Yoda affirmation frequency:** Should every phrase have "hmm"/"yes"/"mmm", or is sparing use more authentic?
   - **What we know:** Star Wars Yoda uses affirmations frequently but not in every sentence
   - **What's unclear:** Optimal density for time phrases (every phrase? 50%? 25%?)
   - **Recommendation:** Vary—some phrases end with affirmation, some don't; aim for 60-70% affirmation presence to maintain voice without over-saturation

## Sources

### Primary (HIGH confidence)
- JivePhraseProvider.cs (lines 1-134) — Current implementation, vocabulary sourcing from Cab Calloway's Hepster's Dictionary (1938) noted in comments
- PiratePhraseProvider.cs (lines 1-133) — Current implementation, nautical vocabulary list in comments
- YodaPhraseProvider.cs (lines 1-133) — Current implementation, OSV syntax examples
- Phase 72 RESEARCH.md — Multi-candidate pattern architecture (established in previous phase)
- PhraseStyleProviderTests.cs — Test patterns for novelty providers (lines 209-587)

### Secondary (MEDIUM confidence)
- General knowledge: AAVE contraction patterns, emphatic repetition, copula dropping (linguistic features)
- General knowledge: Nautical time-keeping (ship's bells, watch system, maritime terminology)
- General knowledge: Yoda syntax patterns from Star Wars character (OSV inversion, declarative affirmations)

### Tertiary (LOW confidence)
None—no web research conducted (Brave API unavailable); relying on codebase inspection and general linguistic knowledge.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Reusing Phase 72 multi-candidate infrastructure, no new dependencies
- Architecture: HIGH — Same bucket expansion pattern as Phase 72, proven in 8 existing providers
- Linguistic patterns: MEDIUM — Based on general knowledge and existing code comments; authenticity requires human review
- Test coverage: HIGH — Pattern-based tests can verify consistency automatically

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (30 days—content work is stable, no technology dependencies)
