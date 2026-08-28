/**
 * ISC-12: PhraseEngineTests (51 cases) and GetStructuredPhraseTests (17) translated from
 * FuzzyClock.Core.Tests/PhraseEngineTests.cs. Both classes live in that one C# file and both drive
 * `new EnglishPhraseProvider()` directly, i.e. en-classic.
 *
 * ## Every sampled assertion is translated as a UNIVERSAL, and that is measured, not assumed
 *
 * The C# tests draw ONE phrase from a random bucket and assert a substring -- their own comments say
 * "With randomization, check that phrase contains the hour word", which is a statement about every
 * candidate that the original can only sample. Every en-classic bucket holds exactly 5 candidates
 * (measured over all 146 buckets: 12 buckets x 12 hours + noon + midnight, arity 5 everywhere), so
 * each C# case is a 1-in-5 sample of what it means to say.
 *
 * The port has the `Picker` seam, so it can assert the whole thing. Each case below enumerates the
 * bucket and holds EVERY candidate to the C# assertion. Before writing them I checked the universals
 * against the C#-generated golden fixture rather than against my reading of the tables, and all five
 * hold there:
 *
 *   - every en-classic phrase candidate contains its bucket's hour word (next hour for buckets 8-11)
 *   - every noon candidate contains "noon" or "midday"; every midnight candidate contains "midnight"
 *   - to-hour structured emphasis is EXACTLY the next hour word, with a non-empty qualifier
 *   - current-hour structured emphasis contains its hour word; noon/midnight qualifiers are empty
 *   - no candidate in any of the 18 locales contains " 0"
 *
 * So the strengthening is a property of the original, recorded from it, and not an invention of the
 * port. It is also 5x more discriminating than what it replaces: a port that got one candidate in a
 * bucket wrong passes the C# assertion four times in five.
 *
 * That last sentence is the one claim here that a green run cannot support, so it was mutation-tested
 * with THIS FILE AS THE ONLY SUITE -- the golden fixture withheld, because the layer already passed a
 * run with the fixture in play and the question is what these 68 cases add. 28 defects injected into
 * factories.ts / types.ts / tables.generated.ts: 22 caught, 6 survivors, all 6 predicted with their
 * reason written beforehand, none refuted. The one that matters is a single candidate in the :45
 * bucket changed from `{h1}` to `{h}` -- caught here every time, and by a sampled assertion one time
 * in five. Of the 6 survivors, 4 are caught by phrase-golden.test.ts and 1 by phrase-factories.test.ts;
 * the last is reversing the substitution order in `resolve`, which survives the entire suite because it
 * is a true equivalent mutant (see the comment on `resolve`).
 *
 * ## Two notes on faithfulness
 *
 * - The C# uses the arbitrary date 2024-01-15, so `at()` does too -- providers read only hour and
 *   minute, and matching the date keeps the two files readable side by side.
 * - `GetStructuredPhraseTests` carries a `[TestInitialize]` that calls `PhraseEngine.SetLocale`, and
 *   nothing in the class reads the static it sets: the class holds its own provider. It is dead in the
 *   original, so there is nothing here to correspond to it. (The comment above it says as much --
 *   "avoids race on PhraseEngine._activeProvider shared static.")
 */
import { describe, expect, test } from "bun:test"
import { makeProvider } from "../src/core/phrase/factories.js"
import { SPECS } from "../src/core/phrase/specs.js"
import { LOCALES } from "../src/core/phrase/tables.generated.js"
import type { StructuredPhrase } from "../src/core/phrase/types.js"
import { enumerateAll, indexPicker, wallTime } from "./support/picker.js"

/** The C#'s `T(hour, minute)`: 2024-01-15 at the given wall time. */
const at = (hour: number, minute: number): Date => wallTime(hour, minute, [2024, 0, 15])

const ctl = indexPicker()
const provider = makeProvider(SPECS["en-classic"]!, ctl.picker)

/** Every phrase the bucket at this time can emit. */
const phrasesAt = (hour: number, minute: number): readonly string[] => {
  const dt = at(hour, minute)
  return enumerateAll(ctl, () => provider.getPhrase(dt)).values
}

/** Every (qualifier, emphasis) pair the bucket at this time can emit. */
const structuredAt = (hour: number, minute: number): readonly StructuredPhrase[] => {
  const dt = at(hour, minute)
  return enumerateAll(ctl, () => provider.getStructuredPhrase(dt)).values
}

/**
 * The C#'s `Contains(word, OrdinalIgnoreCase)` over every candidate.
 *
 * Ordinal case folding on an ASCII hour word is plain lowercasing, and the tables hold lowercase, so
 * the fold is here only to keep the assertion the same shape as the original's.
 */
function everyCandidateContains(values: readonly string[], word: string): void {
  expect(values.length).toBeGreaterThan(1) // else "every candidate" says no more than "the candidate"
  for (const v of values) expect(v.toLowerCase()).toContain(word)
}

describe("PhraseEngineTests, translated (51 cases)", () => {
  describe("SpecialCases_NoonAndMidnight", () => {
    // The C# accepts "midday" for noon because the noon bucket holds candidates without "noon" in
    // them. Kept verbatim, including the asymmetry: midnight has no second spelling.
    const ROWS = [
      [12, 0, "noon"],
      [0, 0, "midnight"],
    ] as const
    for (const [hour, minute, keyword] of ROWS)
      test(`${hour}:${String(minute).padStart(2, "0")} -- every candidate contains "${keyword}"${keyword === "noon" ? ' or "midday"' : ""}`, () => {
        const values = phrasesAt(hour, minute)
        expect(values.length).toBeGreaterThan(1)
        for (const v of values) {
          const s = v.toLowerCase()
          expect(s.includes(keyword) || (keyword === "noon" && s.includes("midday"))).toBe(true)
        }
      })
  })

  // The twelve minute buckets. Buckets 0-7 (minutes 0-37) name the current hour; buckets 8-11
  // (minutes 38-59) name the NEXT one, which is what the C#'s `nextHourWord` parameter says.
  const BUCKETS: readonly { readonly method: string; readonly rows: readonly (readonly [number, number, string])[] }[] = [
    { method: "Bucket00_OClockBoundaries", rows: [[3, 0, "three"], [3, 1, "three"], [3, 2, "three"], [9, 0, "nine"], [15, 0, "three"]] },
    { method: "Bucket05_JustAfterBoundaries", rows: [[3, 3, "three"], [3, 7, "three"], [6, 5, "six"]] },
    { method: "Bucket10_TenPastBoundaries", rows: [[3, 8, "three"], [3, 12, "three"], [7, 10, "seven"]] },
    { method: "Bucket15_QuarterPastBoundaries", rows: [[3, 13, "three"], [3, 17, "three"], [8, 15, "eight"]] },
    { method: "Bucket20_JustAfterQuarterPastBoundaries", rows: [[3, 18, "three"], [3, 22, "three"], [5, 20, "five"]] },
    { method: "Bucket25_AlmostHalfPastBoundaries", rows: [[3, 23, "three"], [3, 27, "three"], [10, 25, "ten"]] },
    { method: "Bucket30_HalfPastBoundaries", rows: [[3, 28, "three"], [3, 32, "three"], [11, 30, "eleven"]] },
    { method: "Bucket35_JustPastHalfPastBoundaries", rows: [[3, 33, "three"], [3, 37, "three"], [9, 35, "nine"]] },
    { method: "Bucket40_AlmostQuarterBeforeBoundaries", rows: [[3, 38, "four"], [3, 42, "four"], [11, 40, "twelve"]] },
    { method: "Bucket45_QuarterBeforeBoundaries", rows: [[3, 43, "four"], [3, 47, "four"], [11, 45, "twelve"]] },
    { method: "Bucket50_NearlyBoundaries", rows: [[3, 48, "four"], [3, 52, "four"], [11, 50, "twelve"]] },
    { method: "Bucket55_AlmostBoundariesIncluding58And59", rows: [[3, 53, "four"], [3, 57, "four"], [3, 58, "four"], [3, 59, "four"], [11, 55, "twelve"]] },
  ]

  for (const { method, rows } of BUCKETS)
    describe(method, () => {
      for (const [hour, minute, word] of rows)
        test(`${hour}:${String(minute).padStart(2, "0")} -- every candidate contains "${word}"`, () => {
          everyCandidateContains(phrasesAt(hour, minute), word)
        })
    })

  describe("HourConversionEdgeCases", () => {
    // The C#'s own inline comments are the point of this table, so they are carried across as-is.
    const ROWS = [
      [12, 5, "twelve", "noon+5: NOT noon; hour12=12"],
      [0, 5, "twelve", "midnight+5: hour 0 => hour12=12"],
      [12, 45, "one", "nextHour12=(12%12)+1=1, not 13"],
      [11, 55, "twelve", "nextHour12=(11%12)+1=12"],
      [23, 55, "twelve", "hour 23 => hour12=11, nextHour12=12"],
      [13, 0, "one", "13:00 => hour12=1"],
      [0, 1, "twelve", "00:01 => hour12=12"],
    ] as const
    for (const [hour, minute, word, why] of ROWS)
      test(`${hour}:${String(minute).padStart(2, "0")} -- ${why}`, () => {
        everyCandidateContains(phrasesAt(hour, minute), word)
      })
  })

  test("NoPhraseContainsZeroAsHourValue -- 00:05 uses 'twelve', never ' 0'", () => {
    const values = phrasesAt(0, 5)
    expect(values.length).toBeGreaterThan(1)
    for (const v of values) {
      expect(v).not.toContain(" 0")
      expect(v.toLowerCase()).toContain("twelve")
    }
  })

  test("GetPhrase_AcceptsDateTimeParameter_ReturnsValidPhrase -- 03:30 is a non-empty half-past variant", () => {
    // The C# builds this one from a different date (2024-06-15) than its own T() helper. Carried over,
    // because "the date does not matter" is a claim about the provider and this row is where the
    // original happens to exercise it.
    const dt = wallTime(3, 30, [2024, 5, 15])
    const values = enumerateAll(ctl, () => provider.getPhrase(dt)).values
    expect(values.length).toBeGreaterThan(1)
    for (const v of values) {
      expect(v).not.toBe("")
      const s = v.toLowerCase()
      expect(s.includes("three") || s.includes("half")).toBe(true)
    }
  })
})

describe("GetStructuredPhraseTests, translated (17 cases)", () => {
  describe("SpecialCases_NoQualifier", () => {
    for (const [hour, minute] of [[12, 0], [0, 0]] as const)
      test(`${hour}:${String(minute).padStart(2, "0")} -- empty qualifier, emphasis names the special case`, () => {
        const values = structuredAt(hour, minute)
        expect(values.length).toBeGreaterThan(1)
        for (const { qualifier, emphasis } of values) {
          expect(qualifier).toBe("")
          expect(emphasis).not.toBe("")
          const s = emphasis.toLowerCase()
          if (hour === 12) expect(s.includes("noon") || s.includes("midday")).toBe(true)
          else expect(s).toContain("midnight")
        }
      })
  })

  describe("OClockBucket_EmphasisContainsHourWord", () => {
    for (const [hour, minute, word] of [[3, 0, "three"], [9, 0, "nine"]] as const)
      test(`${hour}:${String(minute).padStart(2, "0")} -- every emphasis is non-empty and contains "${word}"`, () => {
        const values = structuredAt(hour, minute)
        expect(values.length).toBeGreaterThan(1)
        for (const { emphasis } of values) {
          expect(emphasis).not.toBe("")
          expect(emphasis.toLowerCase()).toContain(word)
        }
      })
  })

  describe("CurrentHourTemplates_EmphasisContainsCurrentHour", () => {
    // The C# comment notes the qualifier may be empty or not, and asserts nothing about it. Neither
    // does this -- see the addition below, which pins that both shapes actually occur.
    for (const minute of [5, 10, 15, 20, 25, 30, 35] as const)
      test(`3:${String(minute).padStart(2, "0")} -- every emphasis contains "three"`, () => {
        const values = structuredAt(3, minute)
        expect(values.length).toBeGreaterThan(1)
        for (const { emphasis } of values) expect(emphasis.toLowerCase()).toContain("three")
      })
  })

  describe("NextHourTemplates_EmphasisIsNextHour", () => {
    // Exact equality in the original, not a substring -- the to-hour templates put the bare hour word
    // in the emphasis and everything else in the qualifier.
    for (const [minute, expected] of [[40, "four"], [45, "four"], [50, "four"], [55, "four"]] as const)
      test(`3:${minute} -- every emphasis is exactly "${expected}", every qualifier non-empty`, () => {
        const values = structuredAt(3, minute)
        expect(values.length).toBeGreaterThan(1)
        for (const { qualifier, emphasis } of values) {
          expect(emphasis).toBe(expected)
          expect(qualifier).not.toBe("")
        }
      })
  })

  describe("HourWrap_EmphasisIsNextHour", () => {
    for (const [hour, minute, expected] of [[12, 55, "one"], [11, 50, "twelve"]] as const)
      test(`${hour}:${minute} -- every emphasis is exactly "${expected}" (wrapped), every qualifier non-empty`, () => {
        const values = structuredAt(hour, minute)
        expect(values.length).toBeGreaterThan(1)
        for (const { qualifier, emphasis } of values) {
          expect(emphasis).toBe(expected)
          expect(qualifier).not.toBe("")
        }
      })
  })
})

describe("additions, measured against the C#", () => {
  test("every en-classic bucket offers exactly 5 candidates, in both kinds", () => {
    // This is what makes every universal above non-vacuous, and it is the tightest statement of it:
    // not "more than one" but exactly five, so a bucket that lost or gained a candidate fails here
    // rather than quietly weakening 68 assertions. 146 buckets = 12 x 12 hours + noon + midnight.
    const arities = new Set<number>()
    const buckets = new Set<string>()
    for (let hour = 0; hour < 24; hour++)
      for (let minute = 0; minute < 60; minute++) {
        const dt = at(hour, minute)
        buckets.add(`${provider.getSegmentKey(dt)}|${hour % 12 === 0 ? 12 : hour % 12}`)
        arities.add(enumerateAll(ctl, () => provider.getPhrase(dt)).arity)
        arities.add(enumerateAll(ctl, () => provider.getStructuredPhrase(dt)).arity)
      }
    expect([...arities]).toEqual([5])
    expect(buckets.size).toBe(146)
  })

  test("the o'clock bucket emits both qualifier shapes, 3 empty and 2 non-empty in every hour", () => {
    // The C# comment claims both shapes occur ("three o'clock" and "just three") and then asserts
    // nothing about the qualifier, so a port that always emitted a non-empty one passes all 17
    // structured cases above. Measured off the C#-generated candidates fixture, and the split is
    // uniform: all 12 hour12 values are 3 empty / 2 non-empty. Asserted per bucket rather than as a
    // 36/24 total, so the reader does not have to redo any arithmetic to see what is being claimed.
    //
    // Minute 1 rather than 0, because 12:00 and 0:00 are the noon and midnight buckets -- 12:01 and
    // 00:01 are how bucket 0 is reached at hour12 = 12.
    const seen = new Set<number>()
    for (let hour = 0; hour < 24; hour++) {
      const values = structuredAt(hour, 1)
      const empty = values.filter((v) => v.qualifier === "").length
      expect({ hour, empty, nonEmpty: values.length - empty }).toEqual({ hour, empty: 3, nonEmpty: 2 })
      seen.add(hour % 12 === 0 ? 12 : hour % 12)
    }
    expect(seen.size).toBe(12)
  })

  test('no candidate in ANY of the 18 locales contains " 0"', () => {
    // NoPhraseContainsZeroAsHourValue checks one draw of one bucket of one locale. The property is
    // universal across the registry -- measured off the golden candidates fixture before being
    // asserted here -- and this is the form that would catch a new locale introducing a bare 0 hour.
    for (const locale of LOCALES) {
      const control = indexPicker()
      const p = makeProvider(SPECS[locale]!, control.picker)
      for (let hour = 0; hour < 24; hour++)
        for (const minute of [0, 5, 30, 45, 55]) {
          const dt = at(hour, minute)
          for (const v of enumerateAll(control, () => p.getPhrase(dt)).values) expect(v).not.toContain(" 0")
          for (const { qualifier, emphasis } of enumerateAll(control, () => p.getStructuredPhrase(dt)).values) {
            expect(qualifier).not.toContain(" 0")
            expect(emphasis).not.toContain(" 0")
          }
        }
    }
  })
})
