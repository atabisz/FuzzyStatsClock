/**
 * ISC-12: PhraseStyleProviderTests (64 cases over 9 classes) translated from
 * FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs -- `Terse` 5, `Poetic` 12, `Rude` 4, `Jive` 8,
 * `Pirate` 7, `Dwarf` 7, `ValleyGirl` 7, `Yoda` 7, `Shakespeare` 7.
 *
 * These are nine of the ten bucket-keyed locales; en-classic is the tenth and phrase-engine.test.ts has
 * it. Between the two files the drawing half of the registry is covered, which the last addition below
 * asserts rather than leaves as a claim in a comment.
 *
 * ## What this file adds, given that phrase-golden.test.ts already checks every string
 *
 * Golden's `describe("the complete candidate set for every bucket")` enumerates all 1440 minutes of
 * these nine locales, compares the port's phrase set AND its (qualifier, emphasis) set against the
 * fixture per bucket, and asserts the arity equals the oracle's. So every assertion below is subsumed
 * on content -- there is no string here golden does not already pin.
 *
 * What is NOT subsumed is where the expectations come from. **All 64 C# assertions were typed by a
 * person reading the tables**: eight exact literals (`"midday. eat."`, `"Hark! 'Tis the noontide hour"`,
 * ...), six vocabulary disjunctions (`Contains("noon") || Contains("zenith")`), and the substring claims
 * about hour words. Every other oracle in this port descends from tools/GoldenGen walking the compiled
 * providers, so a systematic generator bug is invisible to it: the fixture and the port agree with each
 * other and golden stays green. specs.ts:36-38 already rests on that argument. This file is the second
 * origin for the nine drawing locales, and the mutation run measures it rather than asserting it -- see
 * "What that is worth" below.
 *
 * ## Every sampled assertion is a universal, checked against the fixture before it was written
 *
 * The C# draws ONE candidate and asserts a substring; its own comment says "With randomization, we check
 * for patterns, not exact text", which is a claim about every candidate that the original can only
 * sample. These buckets hold 4 or 5, so each C# case is a 1-in-4 or 1-in-5 sample of what it means. Each
 * case below enumerates the bucket through the `Picker` seam and holds EVERY candidate to it, with the
 * exact arity asserted alongside so the tightening cannot go vacuous.
 *
 * All 64 universals were checked against test/fixtures/phrase-golden-candidates.tsv -- the C#-generated
 * one -- before any of them was written here. All 64 hold.
 *
 * ## Two C# claims are true only at the hour they sample, and the port records that
 *
 * Generalising the universals along the HOUR axis as well found two:
 *
 *   - `Terse_HalfHour_ReturnsBritishHalf` asserts 3:30 contains "four" and NOT "three". As a substring
 *     test over all twelve hours it has exactly one counterexample: at 1:30 en-terse can emit
 *     "gone half two", and "gone" contains "one". With word boundaries the claim holds 60/60.
 *   - `Shakespeare_OnTheHour_ContainsHourWord` carries the comment "('fourth' is also a match since it
 *     contains 'four' as a substring)". True at the hour it picked and a coincidence of it: three of
 *     that bucket's four candidates use the ordinal, and "fourth" contains "four" while "first",
 *     "second", "third", "fifth", "ninth" and "twelfth" do not contain theirs. At 4:00 the assertion
 *     holds for 4 candidates of 4; at 1:00 it would hold for 1 of 4.
 *
 * Both are recorded as exact maps rather than repaired quietly, because each is a fact about the
 * original: the C# picked hour 3 and hour 4, and at those hours it is right.
 *
 * ## What that is worth, measured
 *
 * 18 defects injected, each run against THREE targets separately -- this file, phrase-golden.test.ts, and
 * every other suite in test/ -- because a bare "18 of 18" says nothing about a file that overlaps an
 * existing suite, and "golden misses it" is not the same claim as "nothing else catches it". The
 * multilingual unit only asked the first. Full numbers are in the ISA verification row.
 *
 *   - PORT-ONLY (8, source changed and fixtures left alone): all 8 caught here AND by golden. **That is
 *     the overlap, measured rather than assumed.**
 *   - CONSISTENT (10, source changed AND the candidates fixture regenerated from the mutated source --
 *     what a GoldenGen bug looks like): all 10 caught here, **9 of them by this file alone**. The tenth
 *     (en-poetic stops splitting) is also caught by phrase-engine-coordinator.test.ts, which counts the
 *     two split-mode locales, so that addition has a second independent expectation behind it.
 *
 * Worth knowing about golden, because two predictions were refuted and this was the reason: its
 * `expect(CANDIDATE_ROWS.length).toBe(12984)` at phrase-golden.test.ts:107 is a tripwire for any
 * arity-changing generator bug -- a regenerated fixture has a different row count. It is a fact about the
 * FILE though, not a comparison between the port and the oracle, and whoever lands a regenerated fixture
 * updates it in the same commit. Re-running those two with the count corrected, as a real landing would,
 * puts golden green and leaves this file the only objector.
 *
 * ## Not this file's subject
 *
 * en-terse having eleven buckets (so 4:55 is bucket 10, not 11) and en-poetic naming its midnight key
 * ":witching" are both asserted by segment-key.test.ts, which owns bucket structure. They are used as
 * inputs here and not re-claimed. The `[TestCleanup]`-has-nothing-to-undo property is multilingual
 * test.ts's; this C# file has no `[TestCleanup]` at all -- it holds a `static readonly` provider per
 * class instead, with the comment "avoids race on PhraseEngine._activeProvider shared static", and each
 * SetLocale case restores en-classic inline BEFORE its assert.
 */
import { describe, expect, test } from "bun:test"
import { PhraseEngine } from "../src/core/phrase/engine.js"
import { makeProvider } from "../src/core/phrase/factories.js"
import { SPECS } from "../src/core/phrase/specs.js"
import { LOCALES, TABLES } from "../src/core/phrase/tables.generated.js"
import type { StructuredPhrase } from "../src/core/phrase/types.js"
import { enumerateAll, indexPicker, wallTime } from "./support/picker.js"

/** The C#'s `new DateTime(2024, 1, 1, h, m, 0)`. */
const at = (hour: number, minute: number): Date => wallTime(hour, minute, [2024, 0, 1])

interface Probe {
  /** Every phrase the bucket at this time can emit. */
  phrasesAt(hour: number, minute: number): readonly string[]
  /** Every (qualifier, emphasis) pair the bucket at this time can emit. */
  structuredAt(hour: number, minute: number): readonly StructuredPhrase[]
  keyAt(hour: number, minute: number): string
}

function probeFor(locale: string): Probe {
  const spec = SPECS[locale]
  if (!spec) throw new Error(`phrase-style.test.ts: no spec for locale '${locale}'.`)
  const ctl = indexPicker()
  const provider = makeProvider(spec, ctl.picker)
  return {
    phrasesAt: (hour, minute) => enumerateAll(ctl, () => provider.getPhrase(at(hour, minute))).values,
    structuredAt: (hour, minute) => enumerateAll(ctl, () => provider.getStructuredPhrase(at(hour, minute))).values,
    keyAt: (hour, minute) => provider.getSegmentKey(at(hour, minute)),
  }
}

/**
 * The C#'s `StringAssert.Contains` over every candidate, with the arity stated.
 *
 * `toBe(arity)` rather than `toBeGreaterThan(1)`: a bucket that lost a candidate then fails here instead
 * of quietly weakening the universal into a smaller one, and the specials of four of these locales hold
 * exactly one candidate, where "more than one" would be false rather than weak.
 */
function everyCandidate<T>(values: readonly T[], arity: number, check: (v: T) => void): void {
  expect(values.length).toBe(arity)
  for (const v of values) check(v)
}

/** Case-insensitive as the C#'s `OrdinalIgnoreCase` overload is; the tables are lowercase but for one. */
const containsWord = (haystack: string, word: string): void => {
  expect({ phrase: haystack, contains: word, found: haystack.toLowerCase().includes(word) }).toEqual({
    phrase: haystack,
    contains: word,
    found: true,
  })
}

/** A noon or midnight expectation, in whichever of the two forms the C# class chose. */
interface Special {
  readonly method: string
  /** Only possible where the special holds a single candidate -- see the correlation addition below. */
  readonly exact?: string
  /** The C# writes these as `phrase.Contains(a) || phrase.Contains(b)`, case-sensitive. */
  readonly anyOf?: readonly string[]
}

function assertSpecial(values: readonly string[], arity: number, s: Special): void {
  everyCandidate(values, arity, (v) => {
    if (s.exact !== undefined) {
      expect(v).toBe(s.exact)
      return
    }
    const anyOf = s.anyOf ?? []
    expect({ phrase: v, matched: anyOf.some((w) => v.includes(w)) }).toEqual({ phrase: v, matched: true })
  })
}

interface StyleCase {
  /** The C# `[TestClass]` name. */
  readonly cls: string
  readonly locale: string
  /** The C# method-name prefix, e.g. `Jive` in `Jive_OnTheHour_ContainsHourWord`. */
  readonly prefix: string
  readonly setLocaleMethod: string
  /** Arity of an ordinary bucket, then of bucket 0, which en-rude alone differs on. */
  readonly bucketArity: number
  readonly bucket0Arity: number
  readonly specialArity: number
  readonly noon?: Special
  readonly midnight?: Special
  /** Which of the two C# segment-key cases the class carries. Only Jive has the second. */
  readonly segmentKey: "none" | "same" | "same+adjacent"
}

// The nine classes in the order the C# file declares them. Terse and Poetic are written out below
// because their case sets are unique; the remaining seven share one shape.
const TERSE: StyleCase = {
  cls: "TersePhraseProviderTests",
  locale: "en-terse",
  prefix: "Terse",
  setLocaleMethod: "SetLocale_EnTerse_ReturnsTrue",
  bucketArity: 5,
  bucket0Arity: 5,
  specialArity: 5,
  segmentKey: "none",
}

const POETIC: StyleCase = {
  cls: "PoeticPhraseProviderTests",
  locale: "en-poetic",
  prefix: "Poetic",
  setLocaleMethod: "SetLocale_EnPoetic_ReturnsTrue",
  bucketArity: 4,
  bucket0Arity: 4,
  specialArity: 1,
  noon: { method: "Poetic_Noon_ReturnsHighNoon", exact: "high noon" },
  midnight: { method: "Poetic_WitchingHour_ReturnsWitchingHour", exact: "the witching hour" },
  segmentKey: "none",
}

const REGULAR: readonly StyleCase[] = [
  {
    cls: "RudePhraseProviderTests",
    locale: "en-rude",
    prefix: "Rude",
    setLocaleMethod: "SetLocale_EnRude_ReturnsTrue",
    // The one locale of the nine whose bucket 0 holds a different number of candidates than its others.
    bucketArity: 4,
    bucket0Arity: 5,
    specialArity: 1,
    // This class tests no special case, so nothing here asserts en-rude's noon or midnight text. Their
    // arity is still covered by the arity addition below.
    segmentKey: "none",
  },
  {
    cls: "JivePhraseProviderTests",
    locale: "en-jive",
    prefix: "Jive",
    setLocaleMethod: "SetLocale_EnJive_ReturnsTrue",
    bucketArity: 5,
    bucket0Arity: 5,
    specialArity: 5,
    noon: { method: "Jive_Noon_ReturnsNoonPhrase", anyOf: ["noon", "twelve"] },
    midnight: { method: "Jive_Midnight_ReturnsMidnightPhrase", anyOf: ["midnight", "witching", "zero hour", "night"] },
    segmentKey: "same+adjacent",
  },
  {
    cls: "PiratePhraseProviderTests",
    locale: "en-pirate",
    prefix: "Pirate",
    setLocaleMethod: "SetLocale_EnPirate_ReturnsTrue",
    bucketArity: 5,
    bucket0Arity: 5,
    specialArity: 5,
    noon: { method: "Pirate_Noon_ReturnsNoonPhrase", anyOf: ["noon", "zenith"] },
    midnight: { method: "Pirate_Midnight_ReturnsMidnightPhrase", anyOf: ["midnight", "night", "watch"] },
    segmentKey: "same",
  },
  {
    cls: "DwarfPhraseProviderTests",
    locale: "en-dwarf",
    prefix: "Dwarf",
    setLocaleMethod: "SetLocale_EnDwarf_ReturnsTrue",
    bucketArity: 4,
    bucket0Arity: 4,
    specialArity: 1,
    noon: { method: "Dwarf_Noon_ReturnsNoonPhrase", exact: "midday. eat." },
    midnight: { method: "Dwarf_Midnight_ReturnsMidnightPhrase", exact: "deep in the night, bah" },
    segmentKey: "same",
  },
  {
    cls: "ValleyGirlPhraseProviderTests",
    locale: "en-valleygirl",
    prefix: "ValleyGirl",
    setLocaleMethod: "SetLocale_EnValleyGirl_ReturnsTrue",
    bucketArity: 4,
    bucket0Arity: 4,
    specialArity: 1,
    noon: { method: "ValleyGirl_Noon_ReturnsNoonPhrase", exact: "like, it's literally noon" },
    midnight: { method: "ValleyGirl_Midnight_ReturnsMidnightPhrase", exact: "omg it's literally midnight" },
    segmentKey: "same",
  },
  {
    cls: "YodaPhraseProviderTests",
    locale: "en-yoda",
    prefix: "Yoda",
    setLocaleMethod: "SetLocale_EnYoda_ReturnsTrue",
    bucketArity: 5,
    bucket0Arity: 5,
    specialArity: 5,
    noon: { method: "Yoda_Noon_ReturnsNoonPhrase", anyOf: ["noon", "midday"] },
    midnight: { method: "Yoda_Midnight_ReturnsMidnightPhrase", anyOf: ["midnight", "witching", "night"] },
    segmentKey: "same",
  },
  {
    cls: "ShakespearePhraseProviderTests",
    locale: "en-shakespeare",
    prefix: "Shakespeare",
    setLocaleMethod: "SetLocale_EnShakespeare_ReturnsTrue",
    bucketArity: 4,
    bucket0Arity: 4,
    specialArity: 1,
    noon: { method: "Shakespeare_Noon_ReturnsNoonPhrase", exact: "Hark! 'Tis the noontide hour" },
    midnight: { method: "Shakespeare_Midnight_ReturnsMidnightPhrase", exact: "The witching hour doth toll" },
    segmentKey: "same",
  },
]

const ALL: readonly StyleCase[] = [TERSE, POETIC, ...REGULAR]
const PROBES = new Map(ALL.map((c) => [c.locale, probeFor(c.locale)]))
const probe = (locale: string): Probe => {
  const p = PROBES.get(locale)
  if (!p) throw new Error(`phrase-style.test.ts: no probe for '${locale}'.`)
  return p
}

/**
 * The C#'s `SetLocale_EnX_ReturnsTrue`, which calls the static, restores en-classic, and only then
 * asserts -- so a failing assert leaves the shared static clean. The port's locale is per-instance, so
 * the restore protects nothing; it is kept because its return value is a claim the C# makes and
 * discards, namely that en-classic is registered too.
 */
function setLocaleCase(c: StyleCase): void {
  test(`${c.setLocaleMethod} -- "${c.locale}" is registered`, () => {
    const engine = new PhraseEngine()
    const result = engine.setLocale(c.locale)
    expect(engine.setLocale("en-classic")).toBe(true)
    expect(result).toBe(true)
    expect(engine.currentLocale).toBe("en-classic")
  })
}

describe("PhraseStyleProviderTests, translated (64 cases over 9 classes)", () => {
  describe(`${TERSE.cls} (${TERSE.locale})`, () => {
    setLocaleCase(TERSE)

    test('Terse_OnTheHour_ContainsHourWord -- 3:00, all 5 candidates contain "three"', () => {
      // The C# comment is "With randomization, we check for patterns, not exact text" -- so the pattern
      // is the claim and one draw is the sample. All five candidates, then.
      everyCandidate(probe(TERSE.locale).phrasesAt(3, 0), 5, (v) => containsWord(v, "three"))
    })

    test('Terse_QuarterPast_ContainsQuarterPast -- 3:15, all 5 contain "quarter" and "three"', () => {
      everyCandidate(probe(TERSE.locale).phrasesAt(3, 15), 5, (v) => {
        containsWord(v, "quarter")
        containsWord(v, "three")
      })
    })

    test('Terse_HalfHour_ReturnsBritishHalf -- 3:30, all 5 contain "four" and none contains "three"', () => {
      // British "half four" means half past three. The C#'s negative half is a substring test, which is
      // exactly why it works at this hour and not at every hour -- see the generalisation below.
      everyCandidate(probe(TERSE.locale).phrasesAt(3, 30), 5, (v) => {
        containsWord(v, "four")
        expect(v.toLowerCase()).not.toContain("three")
      })
    })

    test('Terse_GetStructuredPhrase_ReturnsEmptyQualifier -- 3:30, all 5 are ("", ...contains "four")', () => {
      everyCandidate(probe(TERSE.locale).structuredAt(3, 30), 5, ({ qualifier, emphasis }) => {
        expect(qualifier).toBe("")
        containsWord(emphasis, "four")
      })
    })
  })

  describe(`${POETIC.cls} (${POETIC.locale})`, () => {
    setLocaleCase(POETIC)

    // The two exact literals. Arity 1, which is what makes an equality possible at all, and the C#
    // author evidently knew: the four classes that assert exactly are the four whose specials hold one.
    test(`${POETIC.midnight?.method} -- 0:00 is exactly "the witching hour"`, () => {
      assertSpecial(probe(POETIC.locale).phrasesAt(0, 0), 1, POETIC.midnight as Special)
    })

    test(`${POETIC.noon?.method} -- 12:00 is exactly "high noon"`, () => {
      assertSpecial(probe(POETIC.locale).phrasesAt(12, 0), 1, POETIC.noon as Special)
    })

    test("Poetic_RegularTime_ReturnsNonEmpty -- 3:15, all 4 candidates are non-empty", () => {
      everyCandidate(probe(POETIC.locale).phrasesAt(3, 15), 4, (v) => expect(v).not.toBe(""))
    })

    // en-poetic is the only one of the nine that splits its phrase, so it is the only class whose
    // structured cases assert a NON-empty qualifier. The other eight assert the opposite.
    const STRUCTURED: readonly (readonly [string, number, number, string])[] = [
      ["Poetic_GetStructuredPhrase_EmphasisIsHourWord", 3, 0, "three"],
      ["Poetic_GetStructuredPhrase_ToHalf_EmphasisIsNextHourWord", 3, 40, "four"],
      ["Poetic_GetStructuredPhrase_HalfPast_EmphasisIsCurrentHourWord", 3, 30, "three"],
    ]
    for (const [method, hour, minute, expected] of STRUCTURED)
      test(`${method} -- ${hour}:${String(minute).padStart(2, "0")}, all 4 emphases are exactly "${expected}"`, () => {
        // Exact equality in the original too, not a substring: poetic's split puts the bare hour word in
        // the emphasis and the imagery in the qualifier.
        everyCandidate(probe(POETIC.locale).structuredAt(hour, minute), 4, ({ qualifier, emphasis }) => {
          expect(emphasis).toBe(expected)
          expect(qualifier).not.toBe("")
        })
      })

    for (const [method, hour, minute, expected] of [
      ["Poetic_GetStructuredPhrase_WitchingHour_EmptyQualifier", 0, 0, "the witching hour"],
      ["Poetic_GetStructuredPhrase_Noon_EmptyQualifier", 12, 0, "high noon"],
    ] as const)
      test(`${method} -- ${hour}:00 is ("", "${expected}")`, () => {
        everyCandidate(probe(POETIC.locale).structuredAt(hour, minute), 1, (v) =>
          expect(v).toEqual({ qualifier: "", emphasis: expected }),
        )
      })

    test('Poetic_AllBuckets_PhraseContainsHourWord -- 12 sampled minutes, every candidate names "three" or "four"', () => {
      // One C# method looping `int[] sampleMinutes = [1,5,10,15,20,25,30,35,40,45,50,55]`, so one test
      // here. Buckets 0-7 name the current hour and 8-11 the next, and the disjunction is how the
      // original avoids saying which -- kept, with all four candidates held to it at each minute.
      for (const minute of [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
        everyCandidate(probe(POETIC.locale).phrasesAt(3, minute), 4, (v) => {
          const s = v.toLowerCase()
          expect({ minute, phrase: v, named: s.includes("three") || s.includes("four") }).toEqual({
            minute,
            phrase: v,
            named: true,
          })
        })
    })

    test('Poetic_OnTheHour_ContainsHourWord -- 4:00, all 4 contain "four"', () => {
      everyCandidate(probe(POETIC.locale).phrasesAt(4, 0), 4, (v) => containsWord(v, "four"))
    })

    test('Poetic_NearlyHour_ContainsNextHourWord -- 4:55, all 4 contain "five"', () => {
      everyCandidate(probe(POETIC.locale).phrasesAt(4, 55), 4, (v) => containsWord(v, "five"))
    })
  })

  for (const c of REGULAR)
    describe(`${c.cls} (${c.locale})`, () => {
      setLocaleCase(c)

      test(`${c.prefix}_OnTheHour_ContainsHourWord -- 4:00, all ${c.bucket0Arity} candidates contain "four"`, () => {
        everyCandidate(probe(c.locale).phrasesAt(4, 0), c.bucket0Arity, (v) => containsWord(v, "four"))
      })

      test(`${c.prefix}_NearlyHour_ContainsNextHourWord -- 4:55, all ${c.bucketArity} candidates contain "five"`, () => {
        // The C# comments on this case for four of the classes, each saying the same thing: "All bucket-11
        // candidates reference {h1}, so at 4:55 every possible phrase contains 'five'." That IS the
        // universal, written in prose above a sampled assertion.
        everyCandidate(probe(c.locale).phrasesAt(4, 55), c.bucketArity, (v) => containsWord(v, "five"))
      })

      if (c.noon !== undefined) {
        const noon = c.noon
        test(`${noon.method} -- 12:00, all ${c.specialArity} ${noon.exact !== undefined ? `are exactly "${noon.exact}"` : `contain one of ${JSON.stringify(noon.anyOf)}`}`, () => {
          assertSpecial(probe(c.locale).phrasesAt(12, 0), c.specialArity, noon)
        })
      }

      if (c.midnight !== undefined) {
        const midnight = c.midnight
        test(`${midnight.method} -- 0:00, all ${c.specialArity} ${midnight.exact !== undefined ? `are exactly "${midnight.exact}"` : `contain one of ${JSON.stringify(midnight.anyOf)}`}`, () => {
          assertSpecial(probe(c.locale).phrasesAt(0, 0), c.specialArity, midnight)
        })
      }

      if (c.segmentKey !== "none")
        test(`${c.prefix}_GetSegmentKey_SameBucket_ReturnsSameKey -- 4:00 and 4:02`, () => {
          expect(probe(c.locale).keyAt(4, 0)).toBe(probe(c.locale).keyAt(4, 2))
        })

      if (c.segmentKey === "same+adjacent")
        test(`${c.prefix}_GetSegmentKey_AdjacentBuckets_ReturnDifferentKeys -- 4:02 and 4:03`, () => {
          expect(probe(c.locale).keyAt(4, 2)).not.toBe(probe(c.locale).keyAt(4, 3))
        })

      test(`${c.prefix}_GetStructuredPhrase_ReturnsEmptyQualifier -- 4:00, all ${c.bucket0Arity} are ("", non-empty)`, () => {
        everyCandidate(probe(c.locale).structuredAt(4, 0), c.bucket0Arity, ({ qualifier, emphasis }) => {
          expect(qualifier).toBe("")
          expect(emphasis).not.toBe("")
        })
      })
    })
})

describe("additions, measured against the C#", () => {
  test("the arity of every bucket of all nine locales, in both kinds", () => {
    // The premise of all 64 universals above, and the tightest form of it. Overlapping, not new: golden
    // asserts `arity === oracle set size` per bucket already. Kept because the universals are written
    // against these numbers, and because the cross-bucket statement below is one golden never makes --
    // it compares each bucket to the oracle independently and so cannot say a locale is uniform.
    for (const c of ALL) {
      const p = probe(c.locale)
      const observed = new Map<string, Set<number>>()
      for (let hour = 0; hour < 24; hour++)
        for (let minute = 0; minute < 60; minute++) {
          const key = p.keyAt(hour, minute)
          const seen = observed.get(key) ?? new Set<number>()
          seen.add(p.phrasesAt(hour, minute).length)
          seen.add(p.structuredAt(hour, minute).length)
          observed.set(key, seen)
        }
      // The key SET is segment-key.test.ts's subject (11 buckets for en-terse, ":witching" for
      // en-poetic); this only says what arity sits behind each key the provider produced.
      const wrong: string[] = []
      for (const [key, arities] of observed) {
        const suffix = key.slice(c.locale.length + 1)
        const bucket = /^\d+$/.test(suffix) ? Number(suffix) : null
        const expected = bucket === null ? c.specialArity : bucket === 0 ? c.bucket0Arity : c.bucketArity
        if (arities.size !== 1 || !arities.has(expected))
          wrong.push(`${key}: expected ${expected}, saw ${[...arities].sort((a, b) => a - b).join("/")}`)
      }
      expect({ locale: c.locale, wrong }).toEqual({ locale: c.locale, wrong: [] })
    }
  })

  test("en-rude is the only one of the nine whose bucket 0 differs from its other buckets", () => {
    // 5 candidates in bucket 0, 4 in the other eleven. Localised rather than left implicit in the table
    // above, so a regeneration that evened it out fails on the mechanism rather than on a number.
    expect(ALL.filter((c) => c.bucket0Arity !== c.bucketArity).map((c) => c.locale)).toEqual(["en-rude"])
    const p = probe("en-rude")
    expect({ bucket0: p.phrasesAt(4, 0).length, bucket1: p.phrasesAt(4, 5).length }).toEqual({ bucket0: 5, bucket1: 4 })
  })

  test("the C# asserts a special exactly where it holds one candidate, and a vocabulary where it holds five", () => {
    // A claim about the correspondence between the C# file and the tables, which no generated oracle can
    // make: GoldenGen does not know what the test file asserted. Seven of the nine classes test a
    // special; all four that use `AreEqual` have arity 1 and all three that use a `Contains || Contains`
    // disjunction have arity 5. So the exact literals are not a stylistic choice, and a table change
    // that gave en-dwarf's noon a second candidate would make six translations above unwritable --
    // this is where that is caught, in one place, instead of as four confusing equality failures.
    const forms = ALL.filter((c) => c.noon !== undefined || c.midnight !== undefined).map((c) => ({
      locale: c.locale,
      form: c.noon?.exact !== undefined || c.midnight?.exact !== undefined ? "exact" : "anyOf",
      arity: c.specialArity,
    }))
    expect(forms.filter((f) => f.form === "exact").map((f) => f.arity)).toEqual([1, 1, 1, 1])
    expect(forms.filter((f) => f.form === "anyOf").map((f) => f.arity)).toEqual([5, 5, 5])
    // And the two classes that test no special are one of each, so the correlation is not an artefact of
    // the tables being uniform.
    expect(ALL.filter((c) => c.noon === undefined && c.midnight === undefined).map((c) => `${c.locale}:${c.specialArity}`))
      .toEqual(["en-terse:5", "en-rude:1"])
  })

  test("en-poetic is the only one of the nine that splits: 1438 of 1440 minutes carry a qualifier", () => {
    // The structural reason its class has three dedicated structured cases asserting a NON-empty
    // qualifier while the other eight assert `AreEqual("", qualifier)`. The two exceptions are its own
    // noon and witching minutes, which is the C#'s `_EmptyQualifier` pair. Exact counts, so a
    // structuredMode flipped on any of the nine fails here.
    const counts = ALL.map((c) => {
      const p = probe(c.locale)
      let withQualifier = 0
      for (let hour = 0; hour < 24; hour++)
        for (let minute = 0; minute < 60; minute++)
          if (p.structuredAt(hour, minute).every((v) => v.qualifier !== "")) withQualifier++
      return { locale: c.locale, withQualifier }
    })
    expect(counts).toEqual(
      ALL.map((c) => ({ locale: c.locale, withQualifier: c.locale === "en-poetic" ? 1438 : 0 })),
    )
  })

  test("the British-half claim holds at every hour with word boundaries, and has one substring counterexample", () => {
    // Terse_HalfHour_ReturnsBritishHalf sampled 3:30. Generalising along the hour axis: the positive
    // half ("names the next hour") holds for all 5 candidates of all 24 hours. The negative half ("does
    // not name the current hour") holds too as a WORD, but the C# wrote a substring test, and at 1:30
    // en-terse can emit "gone half two" -- "gone" contains "one". Recorded rather than repaired: at the
    // hour the C# picked it is right, and the counterexample is what limits it to that hour.
    const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
    const p = probe("en-terse")
    const substringFailures: string[] = []
    let checked = 0
    for (let hour = 0; hour < 24; hour++) {
      const h12 = hour % 12 === 0 ? 12 : hour % 12
      const current = WORDS[h12]!
      const next = WORDS[(h12 % 12) + 1]!
      for (const phrase of p.phrasesAt(hour, 30)) {
        checked++
        const s = phrase.toLowerCase()
        expect(new RegExp(`\\b${next}\\b`).test(s)).toBe(true)
        expect(new RegExp(`\\b${current}\\b`).test(s)).toBe(false)
        if (s.includes(current)) substringFailures.push(`${hour}:30 "${phrase}" contains "${current}"`)
      }
    }
    expect(checked).toBe(120)
    expect(substringFailures).toEqual([
      '1:30 "gone half two" contains "one"',
      '13:30 "gone half two" contains "one"',
    ])
  })

  test("Shakespeare's bucket-0 comment is true at the hour it picked and false at six of the twelve", () => {
    // "('fourth' is also a match since it contains 'four' as a substring)". Three of that bucket's four
    // candidates use the ordinal, so the comment holds exactly where the ordinal contains the cardinal:
    // fourth, sixth, seventh, eighth, tenth, eleventh do; first, second, third, fifth, ninth, twelfth do
    // not. An exact map rather than a repair, because the C# is right about 4:00.
    const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
    const p = probe("en-shakespeare")
    const hits = new Map<number, number>()
    for (let h12 = 1; h12 <= 12; h12++) {
      const hour = h12 === 12 ? 12 : h12
      // Minute 1, not 0: at 12:00 and 0:00 the special case takes over, so bucket 0 at hour12 = 12 is
      // reached at 12:01. Every hour with the same hour12 offers the same candidates.
      const phrases = p.phrasesAt(hour, 1)
      expect(phrases.length).toBe(4)
      hits.set(h12, phrases.filter((v) => v.toLowerCase().includes(WORDS[h12]!)).length)
    }
    expect([...hits.entries()]).toEqual([
      [1, 1], [2, 1], [3, 1], [4, 4], [5, 1], [6, 4],
      [7, 4], [8, 4], [9, 1], [10, 4], [11, 4], [12, 1],
    ])
    // The universal that IS true for all nine, and the one worth keeping: the last bucket names the next
    // hour at every hour. Bucket 0 naming the current hour is true for the other eight and not for this
    // one, which is the whole point of the map above.
    for (const c of ALL) {
      const q = probe(c.locale)
      for (let hour = 0; hour < 24; hour++) {
        const h12 = hour % 12 === 0 ? 12 : hour % 12
        const next = WORDS[(h12 % 12) + 1]!
        for (const phrase of q.phrasesAt(hour, 59)) expect(new RegExp(`\\b${next}\\b`).test(phrase.toLowerCase())).toBe(true)
        if (c.locale === "en-shakespeare") continue
        for (const phrase of q.phrasesAt(hour, 1)) expect(phrase.toLowerCase()).toContain(WORDS[h12]!)
      }
    }
  })

  test("these nine plus en-classic are exactly the locales the tables declare as drawing", () => {
    // The coverage claim, as a denominator rather than a comment: a file that iterated over only what it
    // had translated would report all-green while skipping a locale. en-classic is phrase-engine.test.ts.
    const drawing = LOCALES.filter((l) => TABLES[l]!.declaredShape === "candidates").sort()
    expect([...ALL.map((c) => c.locale), "en-classic"].sort()).toEqual(drawing)
    expect(drawing.length).toBe(10)
  })
})
