/**
 * ISC-12: the five `*PhraseProviderExpandedTests` classes (58 cases) translated from
 * FuzzyClock.Core.Tests/{English,Terse,Yoda,Jive,Pirate}PhraseProviderExpandedTests.cs --
 * `English` 13, `Yoda` 12, `Jive` 11, `Pirate` 11, `Terse` 11.
 *
 * One file rather than five because the five classes share eight cases each -- hour word, noon variant,
 * midnight variant, four segment-key cases and randomization -- differing only in a style claim apiece.
 * Five copies of that core would be five places for it to drift.
 *
 * ## What is new here and what is already owned
 *
 * Most of the shared core is owned elsewhere and is translated for faithfulness, not for coverage:
 * phrase-engine.test.ts holds en-classic's hour-word, special-vocabulary and structured claims;
 * phrase-style.test.ts holds arity and the special text for the other four; segment-key.test.ts holds
 * en-classic's and en-terse's bucket structure in a much stronger form (it locates the boundary run
 * rather than comparing two keys), and phrase-style.test.ts holds the same-bucket case for en-pirate and
 * en-yoda and both cases for en-jive. Those are used as inputs and not re-argued; where a case below is
 * a pure duplicate it says so on the line.
 *
 * What is genuinely new is the STYLE-STRUCTURE half, and it is the strongest hand-typed oracle in the
 * port so far -- five word lists and two shape rules that exist nowhere in the tables:
 *
 *   - en-yoda: no phrase opens with an SVO subject-verb, and every phrase closes on one of seven
 *     declarative endings.
 *   - en-jive: no phrase opens with a standard-English copula, and every phrase carries one of
 *     fourteen jive terms.
 *   - en-pirate: every phrase carries one of twelve nautical or seven pirate terms, and none says
 *     "shiver me timbers".
 *   - en-terse: no phrase uses the American "til ".
 *   - en-classic: quarter-past emphasis is EXACTLY the current hour word, which phrase-engine.test.ts
 *     only bounds with `contains`.
 *
 * No generated fixture can state any of those: they are claims about register, not about text a
 * reflection pass can harvest. That is the same argument specs.ts:36-38 makes, one layer up.
 *
 * ## Every sampled assertion is a universal, and all 58 were checked against the C# fixture first
 *
 * Each C# case draws ONE candidate per sampled minute at hour 3, and every bucket of these five locales
 * holds exactly 5 -- so each case samples a fifth of what it says, at one hour of twelve. Each case below
 * enumerates the bucket through the `Picker` seam and holds EVERY candidate to the C# assertion, with the
 * arity asserted alongside so the tightening cannot go vacuous. The hour, the sampled minutes and the
 * iteration counts stay as the C# wrote them; the widening along the hour axis is in the additions, where
 * it is labelled.
 *
 * All 58 universals were checked against test/fixtures/phrase-golden-candidates.tsv -- the C#-generated
 * one -- before any was written. All 58 hold there, and the widened forms hold too, with one exception
 * recorded rather than repaired: see `Terse_HalfHour_UsesBritishIdiom`.
 *
 * ## Three findings the check turned up, asserted rather than left as comments
 *
 *   - `"ahoy"` matches NOTHING. It is one of the nineteen arms of the pirate vocabulary disjunction and
 *     no candidate in any of the 730 contains it, so the assertion would read the same with the arm
 *     deleted. It is the only dead arm in the four lists.
 *   - The pirate disjunction is irreducible to either half: the nautical list alone leaves 195 of 730
 *     candidates unmatched and the pirate list alone leaves 243, so `hasNautical || hasPirate` is doing
 *     real work rather than hedging.
 *   - en-yoda's seven endings are the only list of the four where no arm can be dropped. Four of jive's
 *     fourteen are removable and ten of pirate's nineteen, mostly by subsumption -- "real gone" cannot
 *     match anything "gone" does not.
 *
 * The two C# files also disagree about two of the special-case disjunctions, and both versions hold:
 * this file's jive midnight list ends "dead of night" where PhraseStyleProviderTests' ends "night", and
 * this file's pirate midnight list has a fourth arm "graveyard". The jive difference matters -- with
 * "dead of night" all four arms are load-bearing, and with "night" the "midnight" arm becomes removable.
 *
 * ## Bounded
 *
 * These five locales, phrase and structured text only. Nothing here touches wrapping or rendering, and
 * bucket structure stays segment-key.test.ts's.
 */
import { describe, expect, test } from "bun:test"
import { makeProvider } from "../src/core/phrase/factories.js"
import { SPECS } from "../src/core/phrase/specs.js"
import type { StructuredPhrase } from "../src/core/phrase/types.js"
import { enumerateAll, indexPicker, wallTime } from "./support/picker.js"

/** The C#'s `new DateTime(2024, 1, 1, h, m, 0)`. */
const at = (hour: number, minute: number): Date => wallTime(hour, minute, [2024, 0, 1])

/**
 * The twelve English cardinals, hand-typed.
 *
 * Deliberately not read from `TABLES[locale].words.hourWords`: the whole point of this file is that its
 * expectations do not come from the tables. All five locales share these -- checked on the fixture, where
 * the shared list satisfies the hour-word universal for every bucket candidate of all five.
 */
const CARDINALS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"] as const
const hour12 = (hour: number): number => hour % 12 || 12
const currentWord = (hour: number): string => CARDINALS[hour12(hour)]!
const nextWord = (hour: number): string => CARDINALS[(hour12(hour) % 12) + 1]!

/** The two minutes of the 1440 that are special cases: 12:00 and 0:00. */
const isSpecialMinute = (hour: number, minute: number): boolean => minute === 0 && (hour === 12 || hour === 0)

interface Probe {
  phrasesAt(hour: number, minute: number): readonly string[]
  structuredAt(hour: number, minute: number): readonly StructuredPhrase[]
  keyAt(hour: number, minute: number): string
}

function probeFor(locale: string): Probe {
  const spec = SPECS[locale]
  if (!spec) throw new Error(`phrase-expanded.test.ts: no spec for locale '${locale}'.`)
  const ctl = indexPicker()
  const provider = makeProvider(spec, ctl.picker)
  return {
    phrasesAt: (hour, minute) => enumerateAll(ctl, () => provider.getPhrase(at(hour, minute))).values,
    structuredAt: (hour, minute) => enumerateAll(ctl, () => provider.getStructuredPhrase(at(hour, minute))).values,
    keyAt: (hour, minute) => provider.getSegmentKey(at(hour, minute)),
  }
}

interface Sited {
  readonly hour: number
  readonly minute: number
  readonly value: string
}

/** Every phrase candidate of every non-special minute, with the time it came from. Cached per locale. */
const allPhrases = new Map<string, readonly Sited[]>()
function bucketPhrases(locale: string): readonly Sited[] {
  const cached = allPhrases.get(locale)
  if (cached) return cached
  const p = probe(locale)
  const out: Sited[] = []
  for (let hour = 0; hour < 24; hour++)
    for (let minute = 0; minute < 60; minute++) {
      if (isSpecialMinute(hour, minute)) continue
      for (const value of p.phrasesAt(hour, minute)) out.push({ hour, minute, value })
    }
  allPhrases.set(locale, out)
  return out
}

/**
 * The C#'s assertion over every candidate, with the arity stated.
 *
 * `toBe(arity)` rather than `toBeGreaterThan(1)`: a bucket that lost a candidate then fails here instead
 * of quietly weakening the universal into a smaller one.
 */
function everyCandidate<T>(values: readonly T[], arity: number, check: (v: T) => void): void {
  expect(values.length).toBe(arity)
  for (const v of values) check(v)
}

/** An `expect` whose failure prints the offending phrase rather than just `false`. */
function claim(phrase: string, what: string, held: boolean): void {
  expect({ phrase, claim: what, holds: held }).toEqual({ phrase, claim: what, holds: true })
}

interface Expanded {
  /** The C# `[TestClass]` name. */
  readonly cls: string
  readonly locale: string
  /** The C# method-name prefix, e.g. `Jive` in `Jive_AllBuckets_PhraseContainsHourWord`. */
  readonly prefix: string
  /** The class's own `sampleMinutes` array, verbatim. */
  readonly sampleMinutes: readonly number[]
  readonly noonArms: readonly string[]
  readonly midnightArms: readonly string[]
  /** English alone uses the `OrdinalIgnoreCase` overload; the other four are case-sensitive. */
  readonly fold: boolean
  /** Bucket and special arity, 5 for all five locales -- measured on the fixture. */
  readonly arity: number
  /** Whether the class asserts `distinctPhrases.Count >= 2` inside its noon/midnight cases. */
  readonly specialsAssertVariety: boolean
}

const TWELVE_SAMPLES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const

const CLASSES: readonly Expanded[] = [
  {
    cls: "EnglishPhraseProviderExpandedTests",
    locale: "en-classic",
    prefix: "Classic",
    sampleMinutes: TWELVE_SAMPLES,
    // "noontime" is a third arm that "noon" already matches -- see the removable-arm addition.
    noonArms: ["noon", "midday", "noontime"],
    midnightArms: ["midnight"],
    fold: true,
    arity: 5,
    specialsAssertVariety: false,
  },
  {
    cls: "TersePhraseProviderExpandedTests",
    locale: "en-terse",
    prefix: "Terse",
    // Eleven, not twelve: en-terse merges 23-27 into 23-32, so there is no bucket for minute 25 to
    // sample. The C# comment says "all 11 buckets" and segment-key.test.ts owns that fact.
    sampleMinutes: [1, 5, 10, 15, 20, 30, 35, 40, 45, 50, 55],
    noonArms: ["noon", "midday"],
    midnightArms: ["midnight"],
    fold: false,
    arity: 5,
    specialsAssertVariety: false,
  },
  {
    cls: "YodaPhraseProviderExpandedTests",
    locale: "en-yoda",
    prefix: "Yoda",
    sampleMinutes: TWELVE_SAMPLES,
    noonArms: ["noon", "midday"],
    midnightArms: ["midnight", "witching", "night"],
    fold: false,
    arity: 5,
    specialsAssertVariety: true,
  },
  {
    cls: "JivePhraseProviderExpandedTests",
    locale: "en-jive",
    prefix: "Jive",
    sampleMinutes: TWELVE_SAMPLES,
    noonArms: ["noon", "twelve"],
    // PhraseStyleProviderTests' fourth arm is "night"; this class's is "dead of night", which is the
    // tighter of the two -- see the disagreement addition.
    midnightArms: ["midnight", "witching", "zero hour", "dead of night"],
    fold: false,
    arity: 5,
    specialsAssertVariety: true,
  },
  {
    cls: "PiratePhraseProviderExpandedTests",
    locale: "en-pirate",
    prefix: "Pirate",
    sampleMinutes: TWELVE_SAMPLES,
    noonArms: ["noon", "zenith"],
    midnightArms: ["midnight", "night", "watch", "graveyard"],
    fold: false,
    arity: 5,
    specialsAssertVariety: true,
  },
]

const PROBES = new Map(CLASSES.map((c) => [c.locale, probeFor(c.locale)]))
function probe(locale: string): Probe {
  const p = PROBES.get(locale)
  if (!p) throw new Error(`phrase-expanded.test.ts: no probe for '${locale}'.`)
  return p
}

/** The C#'s `terms.Any(t => phrase.Contains(t))`, in whichever case-sensitivity the class wrote. */
const anyArm = (phrase: string, arms: readonly string[], fold: boolean): boolean =>
  arms.some((a) => (fold ? phrase.toLowerCase() : phrase).includes(a))

// --- the four style vocabularies, transcribed from the C# test files -----------------------------
/** `Yoda_AllBuckets_UseDeclarativeEndings` / `Yoda_NoonMidnight_UseDeclarativeEndings`. */
const YODA_ENDINGS = ["it is", "we are", "it has", "we have", "yes", "hmm", "mmm"] as const
/** `Yoda_AllBuckets_NoSVOStart`. */
const YODA_SVO_OPENERS = ["it is ", "it's ", "we are ", "we're "] as const
/** `Jive_AllBuckets_AvoidStandardEnglishCopula`. */
const JIVE_COPULAS = ["it's ", "it is "] as const
/** `Jive_AllPhrases_ContainJiveVocabulary`. */
const JIVE_TERMS = [
  "daddy-o", "cat", "solid", "dig", "hep cat", "real gone", "groove", "blow your wig",
  "righteous", "all reet", "copacetic", "alligator", "hip", "gone",
] as const
/** `Pirate_AllPhrases_UseNauticalOrPirateTerminology`, which keeps the two lists separate. */
const NAUTICAL_TERMS = [
  "bells", "watch", "mark", "glass", "course", "bearing",
  "log", "strike", "trim", "steady", "horizon", "crow's nest",
] as const
const PIRATE_TERMS = ["arr", "yarr", "avast", "ahoy", "blimey", "aye", "heave"] as const

describe("the five *PhraseProviderExpandedTests classes, translated (58 cases)", () => {
  for (const c of CLASSES)
    describe(`${c.cls} (${c.locale})`, () => {
      const p = probe(c.locale)

      test(`${c.prefix}_AllBuckets_PhraseContainsHourWord -- every candidate at each of ${c.sampleMinutes.length} sampled minutes`, () => {
        for (const minute of c.sampleMinutes)
          everyCandidate(p.phrasesAt(3, minute), c.arity, (v) =>
            claim(v, `3:${minute} names "three" or "four"`, anyArm(v, [currentWord(3), nextWord(3)], c.fold)),
          )
      })

      test(`${c.prefix}_Noon_ContainsNoonVariant -- every candidate matches [${c.noonArms.join(", ")}]`, () => {
        // Where the C# also asserts `distinctPhrases.Count >= 2` over 30 draws, the exact arity below is
        // the same claim made exactly; where it does not, the arity is the port's own tightening.
        everyCandidate(p.phrasesAt(12, 0), c.arity, (v) => claim(v, `matches [${c.noonArms.join(", ")}]`, anyArm(v, c.noonArms, c.fold)))
      })

      test(`${c.prefix}_Midnight_ContainsMidnightVariant -- every candidate matches [${c.midnightArms.join(", ")}]`, () => {
        everyCandidate(p.phrasesAt(0, 0), c.arity, (v) =>
          claim(v, `matches [${c.midnightArms.join(", ")}]`, anyArm(v, c.midnightArms, c.fold)),
        )
      })

      // segment-key.test.ts asserts these four for en-classic and en-terse in a far stronger form (it
      // locates the boundary in the provider's own runs), and phrase-style.test.ts holds the
      // same-bucket case for en-pirate and en-yoda and both for en-jive. Translated for faithfulness.
      test(`${c.prefix}_GetSegmentKey_SameBucket_ReturnsSameKey -- 4:00 and 4:02`, () => {
        expect(p.keyAt(4, 0)).toBe(p.keyAt(4, 2))
      })

      test(`${c.prefix}_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys -- 4:02 and 4:03`, () => {
        expect(p.keyAt(4, 2)).not.toBe(p.keyAt(4, 3))
      })

      test(`${c.prefix}_GetSegmentKey_Noon_ReturnsNoonKey -- "${c.locale}:noon"`, () => {
        expect(p.keyAt(12, 0)).toBe(`${c.locale}:noon`)
      })

      test(`${c.prefix}_GetSegmentKey_Midnight_ReturnsMidnightKey -- "${c.locale}:midnight"`, () => {
        expect(p.keyAt(0, 0)).toBe(`${c.locale}:midnight`)
      })

      test(`${c.prefix}_Randomization_ProducesVariety -- 3:15 offers exactly ${c.arity}, not merely 2 of 50 draws`, () => {
        // The C# collects 50 draws and asserts >= 2 distinct, which a 5-candidate bucket satisfies with
        // probability 1 - 5*(1/5)^50. The seam turns the sampling into the exact number.
        expect(new Set(p.phrasesAt(3, 15)).size).toBe(c.arity)
      })
    })

  // --- the style-specific cases, one block per class ------------------------------------------
  describe("EnglishPhraseProviderExpandedTests -- the five structured cases (en-classic splits)", () => {
    const p = probe("en-classic")

    test("Classic_GetStructuredPhrase_OnTheHour_HasEmphasis -- non-empty, contains \"three\"", () => {
      everyCandidate(p.structuredAt(3, 0), 5, (s) => {
        expect(s.emphasis).not.toBe("")
        claim(s.emphasis, 'contains "three"', s.emphasis.toLowerCase().includes("three"))
      })
    })

    test('Classic_GetStructuredPhrase_QuarterPast_SplitsCorrectly -- emphasis is EXACTLY "three"', () => {
      // The exact equality is the new part: phrase-engine.test.ts bounds the current-hour buckets with
      // `contains`, and only the to-hour buckets with equality.
      everyCandidate(p.structuredAt(3, 15), 5, (s) => {
        expect(s.emphasis).toBe("three")
        expect(s.qualifier).not.toBe("")
      })
    })

    test('Classic_GetStructuredPhrase_QuarterTo_SplitsCorrectly -- emphasis is EXACTLY "four"', () => {
      everyCandidate(p.structuredAt(3, 45), 5, (s) => {
        expect(s.emphasis).toBe("four")
        expect(s.qualifier).not.toBe("")
      })
    })

    test("Classic_GetStructuredPhrase_Noon_EmptyQualifier -- and emphasis is a noon variant", () => {
      everyCandidate(p.structuredAt(12, 0), 5, (s) => {
        expect(s.qualifier).toBe("")
        claim(s.emphasis, "matches [noon, midday, noontime]", anyArm(s.emphasis, ["noon", "midday", "noontime"], true))
      })
    })

    test("Classic_GetStructuredPhrase_Midnight_EmptyQualifier -- and emphasis contains \"midnight\"", () => {
      everyCandidate(p.structuredAt(0, 0), 5, (s) => {
        expect(s.qualifier).toBe("")
        claim(s.emphasis, 'contains "midnight"', s.emphasis.toLowerCase().includes("midnight"))
      })
    })
  })

  describe("TersePhraseProviderExpandedTests -- the British-idiom and Americanism cases", () => {
    const p = probe("en-terse")

    test('Terse_HalfHour_UsesBritishIdiom -- 3:30 names "four" and not "three"', () => {
      // The same claim as PhraseStyleProviderTests' `Terse_HalfHour_ReturnsBritishHalf`, duplicated
      // across the two C# files. phrase-style.test.ts owns the generalisation along the hour axis and
      // the one substring counterexample it has (1:30 "gone half two"); at the hour the C# picked, the
      // substring form is what it wrote and it holds.
      everyCandidate(p.phrasesAt(3, 30), 5, (v) => {
        claim(v, 'contains "four"', v.includes("four"))
        claim(v, 'does not contain "three"', !v.includes("three"))
      })
    })

    test('Terse_NoAmericanForms -- no candidate at any sampled minute contains "til "', () => {
      for (const minute of [1, 5, 10, 15, 20, 30, 35, 40, 45, 50, 55])
        everyCandidate(p.phrasesAt(3, minute), 5, (v) => claim(v, 'has no "til "', !v.includes("til ")))
    })

    test("Terse_GetStructuredPhrase_AlwaysEmptyQualifier -- 3:00, 3:30, 3:45", () => {
      for (const minute of [0, 30, 45])
        everyCandidate(p.structuredAt(3, minute), 5, (s) => {
          expect(s.qualifier).toBe("")
          expect(s.emphasis).not.toBe("")
        })
    })
  })

  describe("YodaPhraseProviderExpandedTests -- the OSV cases", () => {
    const p = probe("en-yoda")

    test(`Yoda_AllBuckets_NoSVOStart -- no candidate opens with [${YODA_SVO_OPENERS.join(", ")}]`, () => {
      for (const minute of TWELVE_SAMPLES)
        everyCandidate(p.phrasesAt(3, minute), 5, (v) =>
          claim(v, "opens with no SVO subject-verb", !YODA_SVO_OPENERS.some((o) => v.startsWith(o))),
        )
    })

    test(`Yoda_AllBuckets_UseDeclarativeEndings -- every candidate ends on one of ${YODA_ENDINGS.length}`, () => {
      for (const minute of TWELVE_SAMPLES)
        everyCandidate(p.phrasesAt(3, minute), 5, (v) =>
          claim(v, `ends on one of [${YODA_ENDINGS.join(", ")}]`, YODA_ENDINGS.some((e) => v.endsWith(e))),
        )
    })

    test("Yoda_NoonMidnight_UseDeclarativeEndings -- both specials, every candidate", () => {
      for (const [hour, which] of [[12, "noon"], [0, "midnight"]] as const)
        everyCandidate(p.phrasesAt(hour, 0), 5, (v) =>
          claim(v, `${which} ends on a declarative`, YODA_ENDINGS.some((e) => v.endsWith(e))),
        )
    })

    test("Yoda_GetStructuredPhrase_AlwaysEmptyQualifier -- 3:00, 3:30, 3:45", () => {
      for (const minute of [0, 30, 45])
        everyCandidate(p.structuredAt(3, minute), 5, (s) => {
          expect(s.qualifier).toBe("")
          expect(s.emphasis).not.toBe("")
        })
    })
  })

  describe("JivePhraseProviderExpandedTests -- the AAVE cases", () => {
    const p = probe("en-jive")

    test(`Jive_AllBuckets_AvoidStandardEnglishCopula -- no candidate opens with [${JIVE_COPULAS.join(", ")}]`, () => {
      for (const minute of TWELVE_SAMPLES)
        everyCandidate(p.phrasesAt(3, minute), 5, (v) =>
          claim(v, "opens with no standard copula", !JIVE_COPULAS.some((o) => v.startsWith(o))),
        )
    })

    test(`Jive_AllPhrases_ContainJiveVocabulary -- every candidate carries one of ${JIVE_TERMS.length} terms`, () => {
      for (const minute of TWELVE_SAMPLES)
        everyCandidate(p.phrasesAt(3, minute), 5, (v) => claim(v, "carries a jive term", anyArm(v, JIVE_TERMS, true)))
    })

    test("Jive_GetStructuredPhrase_AlwaysEmptyQualifier -- 3:00, 3:30, 3:45", () => {
      for (const minute of [0, 30, 45])
        everyCandidate(p.structuredAt(3, minute), 5, (s) => {
          expect(s.qualifier).toBe("")
          expect(s.emphasis).not.toBe("")
        })
    })
  })

  describe("PiratePhraseProviderExpandedTests -- the nautical cases", () => {
    const p = probe("en-pirate")

    test(`Pirate_AllPhrases_UseNauticalOrPirateTerminology -- ${NAUTICAL_TERMS.length} nautical OR ${PIRATE_TERMS.length} pirate`, () => {
      for (const minute of TWELVE_SAMPLES)
        everyCandidate(p.phrasesAt(3, minute), 5, (v) =>
          claim(v, "carries nautical or pirate vocabulary", anyArm(v, NAUTICAL_TERMS, true) || anyArm(v, PIRATE_TERMS, true)),
        )
    })

    test('Pirate_NoPhrases_ContainShiverMeTimbers -- the movie cliche is absent', () => {
      for (const minute of TWELVE_SAMPLES)
        everyCandidate(p.phrasesAt(3, minute), 5, (v) =>
          claim(v, 'has no "shiver me timbers"', !v.includes("shiver me timbers")),
        )
    })

    test("Pirate_GetStructuredPhrase_AlwaysEmptyQualifier -- 3:00, 3:30, 3:45", () => {
      for (const minute of [0, 30, 45])
        everyCandidate(p.structuredAt(3, minute), 5, (s) => {
          expect(s.qualifier).toBe("")
          expect(s.emphasis).not.toBe("")
        })
    })
  })
})

describe("additions, measured against the C# fixture", () => {
  /** 1438 non-special minutes x arity 5. en-terse has eleven buckets, but the same 1438 minutes. */
  const EXPECTED_CANDIDATES = 1438 * 5

  test("the four style universals hold at EVERY hour and minute, not just the sampled ones", () => {
    // The C# samples one hour and 11 or 12 minutes of it; each of these is the same claim over all 1438
    // non-special minutes and every candidate at each. The counts are asserted so a probe that silently
    // enumerated less than the whole space cannot pass this.
    const measured = CLASSES.map((c) => {
      const all = bucketPhrases(c.locale)
      const bad: string[] = []
      for (const { hour, minute, value } of all) {
        const ok =
          c.locale === "en-terse"
            ? !value.includes("til ")
            : c.locale === "en-yoda"
              ? !YODA_SVO_OPENERS.some((o) => value.startsWith(o)) && YODA_ENDINGS.some((e) => value.endsWith(e))
              : c.locale === "en-jive"
                ? !JIVE_COPULAS.some((o) => value.startsWith(o)) && anyArm(value, JIVE_TERMS, true)
                : c.locale === "en-pirate"
                  ? (anyArm(value, NAUTICAL_TERMS, true) || anyArm(value, PIRATE_TERMS, true)) &&
                    !value.includes("shiver me timbers")
                  : true // en-classic's style claim is the hour word, covered below
        const namesAnHour = anyArm(value, [currentWord(hour), nextWord(hour)], c.fold)
        if (!ok || !namesAnHour) bad.push(`${c.locale} ${hour}:${String(minute).padStart(2, "0")} "${value}"`)
      }
      return { locale: c.locale, candidates: all.length, violations: bad }
    })
    expect(measured.map((m) => `${m.locale}:${m.candidates}`)).toEqual([
      `en-classic:${EXPECTED_CANDIDATES}`,
      `en-terse:${EXPECTED_CANDIDATES}`,
      `en-yoda:${EXPECTED_CANDIDATES}`,
      `en-jive:${EXPECTED_CANDIDATES}`,
      `en-pirate:${EXPECTED_CANDIDATES}`,
    ])
    expect(measured.flatMap((m) => m.violations)).toEqual([])
  })

  test('"ahoy" matches nothing -- it is the one dead arm in the four vocabulary lists', () => {
    // An arm that matches no candidate is indistinguishable from a deleted arm, and a passing assertion
    // cannot tell them apart. Asserted as the exact set so a table change that starts using "ahoy"
    // fails here and gets to be a decision rather than a silent repair.
    const LISTS = [
      { name: "jive", locale: "en-jive", arms: JIVE_TERMS, match: (v: string, a: string) => v.toLowerCase().includes(a) },
      { name: "nautical", locale: "en-pirate", arms: NAUTICAL_TERMS, match: (v: string, a: string) => v.toLowerCase().includes(a) },
      { name: "pirate", locale: "en-pirate", arms: PIRATE_TERMS, match: (v: string, a: string) => v.toLowerCase().includes(a) },
      { name: "yoda-endings", locale: "en-yoda", arms: YODA_ENDINGS, match: (v: string, a: string) => v.endsWith(a) },
    ] as const
    const dead: string[] = []
    for (const l of LISTS) {
      const values = bucketPhrases(l.locale).map((s) => s.value)
      const specials = [...probe(l.locale).phrasesAt(12, 0), ...probe(l.locale).phrasesAt(0, 0)]
      for (const arm of l.arms) if (![...values, ...specials].some((v) => l.match(v, arm))) dead.push(`${l.name}:${arm}`)
    }
    expect(dead).toEqual(["pirate:ahoy"])
  })

  test("the pirate disjunction is irreducible to either half -- 195 and 243 uncovered", () => {
    // `hasNautical || hasPirate` reads like hedging. It is not: neither list alone covers the locale, so
    // the disjunction is the claim and not a convenience. Counted over the fixture's 730 distinct
    // candidates (12 buckets x 12 hours + two specials, arity 5), not over the 7190 minute-sited ones.
    const distinct = new Set([
      ...bucketPhrases("en-pirate").map((s) => s.value),
      ...probe("en-pirate").phrasesAt(12, 0),
      ...probe("en-pirate").phrasesAt(0, 0),
    ])
    const values = [...distinct]
    expect(values.length).toBe(730)
    expect({
      nauticalAloneLeaves: values.filter((v) => !anyArm(v, NAUTICAL_TERMS, true)).length,
      pirateAloneLeaves: values.filter((v) => !anyArm(v, PIRATE_TERMS, true)).length,
      togetherLeave: values.filter((v) => !anyArm(v, NAUTICAL_TERMS, true) && !anyArm(v, PIRATE_TERMS, true)).length,
    }).toEqual({ nauticalAloneLeaves: 195, pirateAloneLeaves: 243, togetherLeave: 0 })
  })

  test("en-yoda's endings are the only irredundant list of the four", () => {
    // Removable = every candidate it matches is matched by some other arm too, so dropping it changes
    // no verdict. Four of jive's fourteen and ten of pirate's nineteen are removable, mostly by
    // subsumption ("real gone" cannot match anything "gone" does not). Yoda's seven all carry weight,
    // which is what makes that list the strongest style claim in the five classes.
    const removable = (locale: string, arms: readonly string[], match: (v: string, a: string) => boolean): string[] => {
      const values = [
        ...new Set([
          ...bucketPhrases(locale).map((s) => s.value),
          ...probe(locale).phrasesAt(12, 0),
          ...probe(locale).phrasesAt(0, 0),
        ]),
      ]
      return arms.filter((a) => {
        const rest = arms.filter((x) => x !== a)
        return values.every((v) => rest.some((x) => match(v, x)))
      })
    }
    const ci = (v: string, a: string): boolean => v.toLowerCase().includes(a)
    expect({
      yoda: removable("en-yoda", YODA_ENDINGS, (v, a) => v.endsWith(a)),
      jive: removable("en-jive", JIVE_TERMS, ci),
      pirateCount: removable("en-pirate", [...NAUTICAL_TERMS, ...PIRATE_TERMS], ci).length,
    }).toEqual({
      yoda: [],
      jive: ["hep cat", "real gone", "copacetic", "gone"],
      pirateCount: 10,
    })
  })

  test("which special-case arms carry weight, per class, and where the two C# files disagree", () => {
    // Each class writes its own disjunction over the same five candidates, and three of them include an
    // arm the others already cover: "noontime" is inside "noon", "zenith" only appears in a candidate
    // that also says "noon". Recorded as the exact map because it is a fact about the C# assertions.
    const removableSpecial = (locale: string, hour: number, arms: readonly string[], fold: boolean): string[] => {
      const values = probe(locale).phrasesAt(hour, 0)
      const hit = (v: string, a: string): boolean => (fold ? v.toLowerCase() : v).includes(a)
      return arms.filter((a) => {
        const rest = arms.filter((x) => x !== a)
        return values.every((v) => rest.some((x) => hit(v, x)))
      })
    }
    const map = Object.fromEntries(
      CLASSES.flatMap((c) => [
        [`${c.locale}:noon`, removableSpecial(c.locale, 12, c.noonArms, c.fold)],
        [`${c.locale}:midnight`, removableSpecial(c.locale, 0, c.midnightArms, c.fold)],
      ]),
    )
    expect(map).toEqual({
      "en-classic:noon": ["noontime"],
      "en-classic:midnight": [],
      "en-terse:noon": [],
      "en-terse:midnight": [],
      "en-yoda:noon": [],
      "en-yoda:midnight": ["midnight"],
      "en-jive:noon": [],
      "en-jive:midnight": [],
      "en-pirate:noon": ["zenith"],
      "en-pirate:midnight": ["midnight", "graveyard"],
    })

    // The disagreement itself: PhraseStyleProviderTests' jive midnight list ends "night" where this
    // file's ends "dead of night". Both hold, and this file's is the tighter -- with "night" the
    // "midnight" arm becomes removable, so the style file's four arms are really three.
    expect(removableSpecial("en-jive", 0, ["midnight", "witching", "zero hour", "night"], false)).toEqual(["midnight"])
    expect(removableSpecial("en-pirate", 0, ["midnight", "night", "watch"], false)).toEqual(["midnight"])
  })

  test('"always empty qualifier" understates delegate mode: the emphasis set IS the phrase set', () => {
    // The C# asserts qualifier == "" and emphasis != "" at three times. The property is stronger and
    // holds per cell: for the four delegate locales the structured emphases are exactly the phrases,
    // as sets. en-classic splits, so it is the control -- it matches in exactly 2 of its 146 cells, and
    // those two are its noon and midnight, where the whole special goes into the emphasis.
    const sameSet = (locale: string): { cells: number; matching: string[] } => {
      const p = probe(locale)
      const matching: string[] = []
      let cells = 0
      const seen = new Set<string>()
      for (let hour = 0; hour < 24; hour++)
        for (let minute = 0; minute < 60; minute++) {
          const key = p.keyAt(hour, minute)
          const id = `${key}|${hour12(hour)}`
          if (seen.has(id)) continue
          seen.add(id)
          cells++
          const phrases = new Set(p.phrasesAt(hour, minute))
          const emph = new Set(p.structuredAt(hour, minute).map((s) => s.emphasis))
          if (phrases.size === emph.size && [...phrases].every((v) => emph.has(v))) matching.push(id)
        }
      return { cells, matching }
    }
    for (const locale of ["en-terse", "en-yoda", "en-jive", "en-pirate"]) {
      const { cells, matching } = sameSet(locale)
      expect({ locale, cells, matching: matching.length }).toEqual({
        locale,
        cells: locale === "en-terse" ? 134 : 146,
        matching: locale === "en-terse" ? 134 : 146,
      })
    }
    const classic = sameSet("en-classic")
    expect({ cells: classic.cells, matching: classic.matching }).toEqual({
      cells: 146,
      // Midnight first: the scan walks hour 0 before hour 12.
      matching: ["en-classic:midnight|12", "en-classic:noon|12"],
    })
  })

  test("the two C# files' case-sensitivity difference is unobservable, and why", () => {
    // Four of these classes write `Contains(word)` and EnglishPhraseProviderExpandedTests writes
    // `Contains(word, OrdinalIgnoreCase)`. The two forms return the same verdict for every candidate of
    // all five locales -- so the inconsistency is invisible today. It would stop being invisible the
    // moment a table gained a capitalised hour word, which is why the equivalence is asserted rather
    // than assumed: en-shakespeare already capitalises, and it is not one of these five.
    const differing: string[] = []
    for (const c of CLASSES)
      for (const { hour, value } of bucketPhrases(c.locale))
        for (const word of [currentWord(hour), nextWord(hour)])
          if (value.includes(word) !== value.toLowerCase().includes(word)) differing.push(`${c.locale} "${value}" / ${word}`)
    expect(differing).toEqual([])
  })
})
