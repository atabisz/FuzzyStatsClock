/**
 * ISC-12: MultilingualPhraseProviderTests (128 cases over 8 classes) translated from
 * FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs -- `FrenchPhraseProviderTests`,
 * `SpanishPhraseProviderTests`, `GermanPhraseProviderTests`, `JapanesePhraseProviderTests`,
 * `PolishPhraseProviderTests`, `JapaneseTersePhraseProviderTests`, `JapanesePoeticPhraseProviderTests`,
 * `JapaneseRudePhraseProviderTests` -- 16 cases each, structurally identical: noon, midnight,
 * 13 `[DataRow]` bucket probes, and one structured-phrase case.
 *
 * These are exactly the 8 phrase-keyed locales, the ones whose `GetSegmentKey(dt) => GetPhrase(dt)`.
 *
 * ## What this file adds, stated honestly, because most of it is already covered
 *
 * `phrase-golden.test.ts` sweeps all 1440 minutes of all 18 locales against the generated fixture, and
 * its `describe("the 8 single-template locales")` already asserts the structured phrase is
 * `("", <segment key>)` at every one of those minutes. So of the C#'s 128 cases:
 *
 *   - the 104 `AllBuckets_ReturnNonEmpty` rows are subsumed by that sweep, and their C# assertion is
 *     only `IsNullOrEmpty == false` -- a bar a provider returning "x" would clear
 *   - the 8 `GetStructuredPhrase_ReturnsEmptyQualifier` cases are subsumed by it outright
 *   - the 16 noon/midnight cases are NOT subsumed in the way that matters, and that is the point below
 *
 * The 16 noon/midnight expectations are **hand-written literals in the C# test file**. Every other
 * oracle in this port descends from tools/GoldenGen walking the compiled providers, so a systematic
 * generator bug would be invisible: the fixture and the port would agree with each other and the sweep
 * would stay green. These 16 strings were typed by a person reading the C# tables, which makes them an
 * independent route -- and all 16 agree with the fixture, measured. That agreement is the finding; the
 * assertions below are what keeps it from silently lapsing.
 *
 * The 104 probe values are transcribed from the fixture, so they are NOT independent of the golden
 * suite. They are still worth writing: they turn "non-empty" into an exact string, and the mutation run
 * measures whether that earns its place rather than assuming it does.
 *
 * ## What that is worth, measured
 *
 * 13 defects were injected and each run against THIS FILE and `phrase-golden.test.ts` separately, since
 * a bare "13 of 13 caught" would say nothing about a file that overlaps an existing suite. Two classes:
 *
 *   - 7 PORT-ONLY mutations -- source changed, fixtures untouched. All 7 caught by BOTH suites. That is
 *     the overlap, measured rather than assumed. One of them is worth naming: growing fr's bucket 4 to
 *     two candidates is caught by golden through its instrumented picker, not by any phrase comparison,
 *     because it draws with `indexPicker` and always takes candidate 0.
 *   - 6 CONSISTENT mutations -- source changed AND the segments fixture regenerated from the mutated
 *     source, which is what a tools/GoldenGen bug looks like: oracle and port agree with each other and
 *     are both wrong. **All 6 green under phrase-golden.test.ts and all 6 caught here.**
 *
 * So this file's contribution is not coverage, it is the second origin. specs.ts:36-38 already rests on
 * that argument -- "had TableExport harvested these by sampling too, both sides would share one origin
 * and the check would be worth nothing" -- and the consistent class is that sentence's failure mode made
 * real. The six are: fr's noon, ja-rude's noon, de's bucket 4, ja-rude's bucket 11 (which the 134
 * census, the [8,11] localisation and the 11-distinct-probe count all object to), es's midnight made
 * equal to a bucket phrase, and pl's bucket 6 (which the minute-30 probe and the structured case share).
 *
 * ## Every exact equality here is a universal, not a sample of a draw
 *
 * All 8 locales carry exactly one template in each of their 12 buckets (measured off
 * tables.generated.ts, and asserted behaviourally below). That is why `03:15 -> "et quart trois heures"`
 * is a fact about the locale rather than one of five candidates. For the ten `en-*` locales the same
 * assertion would be meaningless -- they draw from up to five.
 *
 * ## The one locale whose table repeats itself
 *
 * ja-rude has 134 distinct phrases across the day where the other seven have 146
 * (12 buckets x 12 hour-words + noon + midnight). Buckets 8 (38-42) and 11 (53-59) share a single
 * template, `早く{h1}になれ`, so each of the 12 hour-words loses one phrase. The C#'s own probe set sees
 * it: minutes 40 and 55 return the same string, making ja-rude the only class whose 13 rows yield 12
 * distinct phrases rather than 13. Recorded as an exact count because a table regeneration that
 * de-duplicated or further duplicated a template is otherwise invisible.
 *
 * ## The `[TestCleanup]` does not translate, and that is a design property
 *
 * Every C# class ends `[TestCleanup] public void ResetLocale() => PhraseEngine.SetLocale("en-classic")`
 * -- a static call, so the tests share one mutable locale and must undo it. The port's locale lives on a
 * `PhraseEngine` INSTANCE (`this.locale`), and providers never consult the engine at all: `makeProvider`
 * closes over its own spec and tables. There is nothing to reset, and the addition below asserts that
 * rather than just claiming it.
 */
import { describe, expect, test } from "bun:test"
import { PhraseEngine } from "../src/core/phrase/engine.js"
import { makeProvider } from "../src/core/phrase/factories.js"
import { SPECS } from "../src/core/phrase/specs.js"
import { randomPicker, type PhraseProvider } from "../src/core/phrase/types.js"
import { wallTime } from "./support/picker.js"

/** The C#'s `new DateTime(2024, 1, 15, h, m, 0)`. */
const at = (hour: number, minute: number): Date => wallTime(hour, minute, [2024, 0, 15])

function providerFor(locale: string): PhraseProvider {
  const spec = SPECS[locale]
  if (!spec) throw new Error(`multilingual.test.ts: no spec for locale '${locale}'.`)
  // randomPicker on purpose: a seeded picker would hide an arity that grew past 1.
  return makeProvider(spec, randomPicker)
}

/** The C#'s 13 `[DataRow]` minutes, in order. Hour 3, which avoids both special minutes. */
const PROBE_MINUTES = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const

interface LocaleCase {
  /** The C# `[TestClass]` name. */
  readonly cls: string
  readonly locale: string
  /** The C# method-name prefix, e.g. `French` in `French_Noon_ReturnsMidi`. */
  readonly prefix: string
  /** The C# method name and its hand-written literal, verbatim. */
  readonly noon: readonly [string, string]
  readonly midnight: readonly [string, string]
  /** The 13 probes, transcribed from the fixture in `PROBE_MINUTES` order. */
  readonly probes: readonly string[]
  /** Distinct phrases over all 1440 minutes. 146 everywhere but ja-rude. */
  readonly distinctPerDay: number
}

const CASES: readonly LocaleCase[] = [
  {
    cls: "FrenchPhraseProviderTests",
    locale: "fr",
    prefix: "French",
    noon: ["French_Noon_ReturnsMidi", "midi"],
    midnight: ["French_Midnight_ReturnsMinuit", "minuit"],
    probes: [
      "trois heures",
      "trois heures",
      "trois heures passé",
      "dix minutes passé trois heures",
      "et quart trois heures",
      "vingt minutes passé trois heures",
      "presque la demie trois heures",
      "trois heures et demie",
      "passé la demie trois heures",
      "presque vingt minutes avant quatre heures",
      "moins le quart quatre heures",
      "bientôt quatre heures",
      "presque quatre heures",
    ],
    distinctPerDay: 146,
  },
  {
    cls: "SpanishPhraseProviderTests",
    locale: "es",
    prefix: "Spanish",
    noon: ["Spanish_Noon_ReturnsMediodia", "mediodía"],
    midnight: ["Spanish_Midnight_ReturnsMedianoche", "medianoche"],
    probes: [
      "las tres en punto",
      "las tres en punto",
      "las tres y pico",
      "las tres y diez",
      "las tres y cuarto",
      "las tres y veinte",
      "las tres y casi media",
      "las tres y media",
      "pasada la media las tres",
      "casi veinte para las cuatro",
      "cuarto para las cuatro",
      "diez para las cuatro",
      "casi las cuatro",
    ],
    distinctPerDay: 146,
  },
  {
    cls: "GermanPhraseProviderTests",
    locale: "de",
    prefix: "German",
    noon: ["German_Noon_ReturnsMittag", "Mittag"],
    midnight: ["German_Midnight_ReturnsMitternacht", "Mitternacht"],
    probes: [
      "drei Uhr",
      "drei Uhr",
      "kurz nach drei Uhr",
      "zehn nach drei Uhr",
      "Viertel nach drei Uhr",
      "zwanzig nach drei Uhr",
      "kurz vor halb vier Uhr",
      "halb vier Uhr",
      "kurz nach halb vier Uhr",
      "zwanzig vor vier Uhr",
      "Viertel vor vier Uhr",
      "zehn vor vier Uhr",
      "kurz vor vier Uhr",
    ],
    distinctPerDay: 146,
  },
  {
    cls: "JapanesePhraseProviderTests",
    locale: "ja-classic",
    prefix: "Japanese",
    noon: ["Japanese_Noon_ReturnsShogo", "正午"],
    midnight: ["Japanese_Midnight_ReturnsMayonaka", "真夜中"],
    probes: [
      "三時ちょうど",
      "三時ちょうど",
      "三時過ぎ",
      "三時十分過ぎ",
      "三時十五分",
      "三時二十分",
      "三時半近く",
      "三時半",
      "三時半過ぎ",
      "四時二十分前",
      "四時十五分前",
      "もうすぐ四時",
      "四時近く",
    ],
    distinctPerDay: 146,
  },
  {
    cls: "PolishPhraseProviderTests",
    locale: "pl",
    prefix: "Polish",
    noon: ["Polish_Noon_ReturnsPoudnie", "południe"],
    // "Return", not "Returns" -- the typo is in the original, kept so the two files grep alike.
    midnight: ["Polish_Midnight_ReturnPolnoc", "północ"],
    probes: [
      "trzecia",
      "trzecia",
      "chwila po trzecia",
      "dziesięć po trzecia",
      "kwadrans po trzecia",
      "dwadzieścia po trzecia",
      "prawie wpół do czwarta",
      "wpół do czwarta",
      "chwila po wpół do czwarta",
      "za dwadzieścia czwarta",
      "za kwadrans czwarta",
      "za dziesięć czwarta",
      "prawie czwarta",
    ],
    distinctPerDay: 146,
  },
  {
    cls: "JapaneseTersePhraseProviderTests",
    locale: "ja-terse",
    prefix: "JapaneseTerse",
    // Identical to ja-classic's two specials -- part of why those two locales share a segment key on
    // 650 minutes of the day (segment-key.test.ts records the exact count).
    noon: ["JapaneseTerse_Noon_ReturnsExpectedPhrase", "正午"],
    midnight: ["JapaneseTerse_Midnight_ReturnsExpectedPhrase", "真夜中"],
    probes: [
      "三時",
      "三時",
      "三時すぎ",
      "三時十分",
      "三時十五分",
      "三時二十分",
      "もうすぐ三時半",
      "三時半",
      "三時半すぎ",
      "四時二十前",
      "四時十五前",
      "もうすぐ四時",
      "四時近く",
    ],
    distinctPerDay: 146,
  },
  {
    cls: "JapanesePoeticPhraseProviderTests",
    locale: "ja-poetic",
    prefix: "JapanesePoetic",
    noon: ["JapanesePoetic_Noon_ReturnsExpectedPhrase", "昼の頂"],
    midnight: ["JapanesePoetic_Midnight_ReturnsExpectedPhrase", "夜の果て"],
    probes: [
      "三時の刻",
      "三時の刻",
      "三時を過ぎた頃",
      "三時の光の中",
      "三時の四半刻",
      "三時から遠ざかる",
      "三時半へと向かう",
      "時の折り返し、三時の半ば",
      "三時半を越えた頃",
      "四時へと近づく",
      "四時の十五分前",
      "まもなく四時の刻",
      "四時の影が迫る",
    ],
    distinctPerDay: 146,
  },
  {
    cls: "JapaneseRudePhraseProviderTests",
    locale: "ja-rude",
    prefix: "JapaneseRude",
    noon: ["JapaneseRude_Noon_ReturnsExpectedPhrase", "もう昼だ"],
    midnight: ["JapaneseRude_Midnight_ReturnsExpectedPhrase", "真夜中じゃないか"],
    probes: [
      "もう三時かよ",
      "もう三時かよ",
      "三時過ぎたじゃないか",
      "三時十分だろ",
      "三時十五分じゃないか",
      "三時二十分だ、いい加減にしろ",
      "やっと三時半になる",
      "やっと三時半じゃないか",
      "三時半過ぎたぞ",
      // Bucket 8. The same template serves bucket 11, so minute 55 below repeats this exact string.
      "早く四時になれ",
      "四時の十五分前だろ",
      "もうすぐ四時じゃないか",
      "早く四時になれ",
    ],
    distinctPerDay: 134,
  },
]

describe("MultilingualPhraseProviderTests, translated (128 cases over 8 classes)", () => {
  for (const c of CASES)
    describe(`${c.cls} (${c.locale})`, () => {
      test(`${c.noon[0]} -- "${c.noon[1]}"`, () => {
        // A literal typed by hand in the C# test file, not generated. Independent of the fixture.
        expect(providerFor(c.locale).getPhrase(at(12, 0))).toBe(c.noon[1])
      })

      test(`${c.midnight[0]} -- "${c.midnight[1]}"`, () => {
        expect(providerFor(c.locale).getPhrase(at(0, 0))).toBe(c.midnight[1])
      })

      // The C#'s 13 [DataRow]s, one test each so the case count stays honest. Its assertion was
      // `IsNullOrEmpty == false`; both halves are here, the exact value and the C#'s own bar.
      PROBE_MINUTES.forEach((minute, i) => {
        const expected = c.probes[i]!
        test(`${c.prefix}_AllBuckets_ReturnNonEmpty(${minute}) -- "${expected}"`, () => {
          const phrase = providerFor(c.locale).getPhrase(at(3, minute))
          expect(phrase).not.toBe("")
          expect(phrase).toBe(expected)
        })
      })

      test(`${c.prefix}_GetStructuredPhrase_ReturnsEmptyQualifier -- ("", "${c.probes[7]!}")`, () => {
        // The C# asserts qualifier == "" and emphasis non-empty. The emphasis is the whole phrase for
        // these locales, so the exact 03:30 value is the strengthening.
        const { qualifier, emphasis } = providerFor(c.locale).getStructuredPhrase(at(3, 30))
        expect(qualifier).toBe("")
        expect(emphasis).not.toBe("")
        expect({ qualifier, emphasis }).toEqual({ qualifier: "", emphasis: c.probes[7]! })
      })
    })
})

describe("additions, measured against the C#", () => {
  test("each locale carries exactly one template per bucket -- what makes the 104 equalities universal", () => {
    // The premise of every exact assertion above. 200 draws under randomPicker at one minute of each
    // bucket plus both specials: a bucket that grew a second candidate shows up here as a difference.
    //
    // NOT a gap this fills -- phrase-golden.test.ts already asserts arity 1 for these 8 at all 1440
    // minutes, by instrumenting the picker and checking it was handed one candidate. Kept because it is
    // the stated premise of the 104 equalities above and it argues behaviourally rather than by
    // instrumentation, so the two fail for visibly different reasons. Measured as overlapping, not new.
    const oneMinuteOfEachBucket = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const
    for (const c of CASES) {
      const p = providerFor(c.locale)
      for (const [hour, minute] of [...oneMinuteOfEachBucket.map((m) => [3, m] as const), [12, 0], [0, 0]] as const) {
        const t = at(hour, minute)
        const first = p.getPhrase(t)
        const drawn = new Set<string>()
        for (let i = 0; i < 200; i++) drawn.add(p.getPhrase(t))
        expect({ locale: c.locale, hour, minute, drawn: [...drawn] }).toEqual({
          locale: c.locale,
          hour,
          minute,
          drawn: [first],
        })
      }
    }
  })

  test("the day holds 146 distinct phrases, or 134 for ja-rude", () => {
    // 12 buckets x 12 hour-words + noon + midnight = 146. ja-rude is 12 short because buckets 8 and 11
    // share one template. An exact count, so a regeneration that collapsed or split a template fails.
    const counts = CASES.map((c) => {
      const p = providerFor(c.locale)
      const seen = new Set<string>()
      for (let hour = 0; hour < 24; hour++) for (let minute = 0; minute < 60; minute++) seen.add(p.getPhrase(at(hour, minute)))
      return { locale: c.locale, n: seen.size }
    })
    expect(counts).toEqual(CASES.map((c) => ({ locale: c.locale, n: c.distinctPerDay })))
    expect(counts.filter((x) => x.n !== 146).map((x) => x.locale)).toEqual(["ja-rude"])
  })

  test("ja-rude's buckets 8 and 11 are the only cross-bucket template reuse, in all 22 ordinary hours", () => {
    // Localised rather than left as a bare count, so the failure names the mechanism. Hours 0 and 12
    // are excluded: their special minute is not part of any bucket.
    const bucketOfMinute = (m: number): number => [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 59].findIndex((b) => m <= b)
    const found: { locale: string; hour: number; buckets: number[] }[] = []
    for (const c of CASES) {
      const p = providerFor(c.locale)
      for (let hour = 0; hour < 24; hour++) {
        if (hour === 0 || hour === 12) continue
        const byPhrase = new Map<string, Set<number>>()
        for (let minute = 0; minute < 60; minute++) {
          const phrase = p.getPhrase(at(hour, minute))
          const bucket = bucketOfMinute(minute)
          byPhrase.set(phrase, (byPhrase.get(phrase) ?? new Set()).add(bucket))
        }
        for (const buckets of byPhrase.values())
          if (buckets.size > 1) found.push({ locale: c.locale, hour, buckets: [...buckets].sort((a, b) => a - b) })
      }
    }
    expect(found.length).toBe(22)
    expect([...new Set(found.map((f) => f.locale))]).toEqual(["ja-rude"])
    expect([...new Set(found.map((f) => JSON.stringify(f.buckets)))]).toEqual(["[8,11]"])
  })

  test("the C#'s 13 probes are discriminating: 12 distinct, or 11 for ja-rude", () => {
    // Records what the sampled row set is actually worth. 12 rather than 13 because minutes 0 and 1
    // are both bucket 0 -- the C# probes that pair deliberately. ja-rude loses one more to 40/55.
    const distinct = CASES.map((c) => {
      const p = providerFor(c.locale)
      return { locale: c.locale, n: new Set(PROBE_MINUTES.map((m) => p.getPhrase(at(3, m)))).size }
    })
    expect(distinct).toEqual(CASES.map((c) => ({ locale: c.locale, n: c.locale === "ja-rude" ? 11 : 12 })))
  })

  test("neither special phrase collides with any bucket phrase, for all 8 locales", () => {
    // What makes the noon and midnight cases observable at all. If a locale's noon phrase also appeared
    // in a bucket, the noon assertion could pass for a provider that had lost the special case.
    for (const c of CASES) {
      const p = providerFor(c.locale)
      const bucketPhrases = new Set<string>()
      for (let hour = 0; hour < 24; hour++)
        for (let minute = 0; minute < 60; minute++) {
          if ((hour === 12 || hour === 0) && minute === 0) continue
          bucketPhrases.add(p.getPhrase(at(hour, minute)))
        }
      expect({
        locale: c.locale,
        noonReused: bucketPhrases.has(c.noon[1]),
        midnightReused: bucketPhrases.has(c.midnight[1]),
      }).toEqual({ locale: c.locale, noonReused: false, midnightReused: false })
    }
  })

  test("a provider ignores the engine's locale, so the C#'s [TestCleanup] has nothing to undo", () => {
    // The C# resets a static locale after every test. Here the locale is per-engine state and providers
    // close over their own spec, so a switch cannot reach a provider a test already holds. Asserted
    // rather than asserted-in-a-comment: this is the property that lets the 128 cases above run in any
    // order without cleanup.
    const engine = new PhraseEngine()
    expect(engine.currentLocale).toBe("en-classic")

    const held = CASES.map((c) => [c, engine.providerFor(c.locale)!, engine.providerFor(c.locale)!.getPhrase(at(3, 15))] as const)
    for (const c of CASES) expect(engine.setLocale(c.locale)).toBe(true)
    expect(engine.setLocale("no-such-locale")).toBe(false)

    for (const [c, provider, before] of held) {
      expect(provider.getPhrase(at(3, 15))).toBe(before)
      expect(provider.getPhrase(at(3, 15))).toBe(c.probes[4]!)
    }
    // And the engine is left wherever the last successful switch put it -- no implicit reset.
    expect(engine.currentLocale).toBe("ja-rude")
  })
})
