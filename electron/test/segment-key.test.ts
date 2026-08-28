/**
 * ISC-12: SegmentKeyTests (37 cases over 4 classes) translated from
 * FuzzyClock.Core.Tests/SegmentKeyTests.cs -- `RudeSegmentKeyTests` 10, `PoeticSegmentKeyTests` 7,
 * `TerseSegmentKeyTests` 10, `ClassicSegmentKeyTests` 10, each driving one provider directly.
 *
 * A segment key exists so the UI can tell "the phrase may have changed" from "it cannot have changed"
 * without comparing phrases, which is why every case here is about *equality* rather than content.
 *
 * ## The C# comments make a claim the C# assertions do not check, and that gap is this file's subject
 *
 * Every DataRow carries a comment naming the buckets it means to exercise -- `[DataRow(3, 2, 3, 3)]
 * // bucket 0 (<=2) vs bucket 1 (<=7)`. The assertion only asks whether two keys differ. So a provider
 * whose bucket boundary sat anywhere else in the hour would satisfy the assertion while falsifying the
 * comment, and a provider that returned a *different key every minute* would pass all 16 of the
 * `AdjacentBuckets` rows across the four classes.
 *
 * Each row below therefore asserts the C#'s own comparison AND the bucket structure its comment
 * asserts in prose: that the same-bucket pair sits inside one run of identical keys, and that the
 * adjacent pair straddles a boundary at exactly that minute. The bucket bounds are recorded from the
 * C#, not from the port -- read out of `test/fixtures/phrase-golden-segments.tsv`, which tools/GoldenGen
 * produced by walking all 1440 minutes of all 18 locales through the compiled providers:
 *
 *   - nine of the ten bucket-keyed locales:  upper bounds 2 7 12 17 22 27 32 37 42 47 52 59  (12 buckets)
 *   - en-terse:                              upper bounds 2 7 12 17 22    32 37 42 47 52 59  (11 buckets)
 *
 * en-terse is the exception, and the C# knows: `TerseSegmentKeyTests` is the only class whose
 * bucket-5-vs-6 row is `[DataRow(3, 32, 3, 33)]` where the others use `(3, 27, 3, 28)`. It has no
 * separate "almost half past" bucket, so 23-32 is one span. Recorded here because a translation that
 * silently used the 12-bucket bounds for all ten would fail on en-terse for a reason no diff explains.
 *
 * The structure is also identical across all 22 non-special hours of every locale (measured), so
 * checking hour 3 -- the hour the C# uses -- is checking the whole day.
 *
 * ## One C# claim is TRUE ONLY WHERE IT IS TESTED, and the port records where it fails
 *
 * `DifferentProviders_SameBucket_DifferentKeys` has the comment "Ensures locale prefix prevents
 * cross-provider key collision". That holds for the ten locales whose key IS `"<locale>:<bucket>"`, and
 * the C# only ever tests two of them. The other eight locales key on the phrase itself, with no prefix
 * at all -- and measured over the fixture, **ja-classic and ja-terse return an identical segment key on
 * 650 of 1440 minutes**. No other pair of the 18 collides anywhere.
 *
 * So the universal is not "keys never collide across providers". It is "keys never collide among the
 * ten prefixed locales", plus a recorded, exact collision count for the one pair that does. Asserting
 * the stronger sentence would have been asserting something false about the original.
 *
 * ## What the strengthenings are worth, measured
 *
 * 15 defects were injected into factories.ts, specs.ts and tables.generated.ts with THIS FILE AS THE
 * ONLY SUITE -- narrowed, so no other suite's fixture can take the credit. 14 caught, 1 survivor,
 * predicted with its reason written before the run: replacing `bucketIndex`'s no-match throw with a
 * fallback, which is unreachable because makeProvider checks bucket coverage at construction.
 *
 * Two results are the reason the additions exist:
 *
 *   - shifting `bucketIndex` to an exclusive bound moves EVERY boundary in every locale, and a suite
 *     asserting only "these two keys differ" survives it -- a shifted partition still has boundaries.
 *     It dies here on the run-structure addition and on each translated row's ends-at/starts-at pair.
 *   - giving en-terse the 12th bucket the other nine have is invisible to every translated row,
 *     including its own: `TerseSegmentKeyTests` samples 32/33, which straddles a boundary either way.
 *     Only the run-structure and 11-bucket additions see it.
 *
 * And two are the reason the collision census is stated as an exact count: killing phrase-mode outright
 * (all 18 keying on the bucket index) and having it return the locale name both leave the eight
 * phrase-keyed locales collision-free, so `{}` fails against `{ja-classic <-> ja-terse: 650}`. A test
 * that merely said "they sometimes collide" would have passed both.
 */
import { describe, expect, test } from "bun:test"
import { makeProvider } from "../src/core/phrase/factories.js"
import { SPECS } from "../src/core/phrase/specs.js"
import { LOCALES } from "../src/core/phrase/tables.generated.js"
import { randomPicker, type PhraseProvider } from "../src/core/phrase/types.js"
import { wallTime } from "./support/picker.js"

/** The C#'s `new DateTime(2024, 1, 1, h, m, 0)`. */
const at = (hour: number, minute: number): Date => wallTime(hour, minute, [2024, 0, 1])

/**
 * The ten locales whose segment key is `"<locale>:<bucket>"`, read off the fixture by testing whether
 * every one of a locale's 1440 keys starts with its own name. Listed rather than derived from SPECS,
 * so the port's `segmentKeyMode` is checked against the C# instead of supplying its own answer.
 */
const CSHARP_BUCKET_KEYED = [
  "en-classic", "en-dwarf", "en-jive", "en-pirate", "en-poetic",
  "en-rude", "en-shakespeare", "en-terse", "en-valleygirl", "en-yoda",
] as const

/** Inclusive upper bounds of each bucket, from the fixture. en-terse merges 23-27 with 28-32. */
const TWELVE = [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 59] as const
const EN_TERSE = [2, 7, 12, 17, 22, 32, 37, 42, 47, 52, 59] as const
const BOUNDS = (locale: string): readonly number[] => (locale === "en-terse" ? EN_TERSE : TWELVE)

/** The two special-minute suffixes per locale. en-poetic is the only one that is not "midnight". */
const CSHARP_SPECIAL = Object.fromEntries(
  CSHARP_BUCKET_KEYED.map((l) => [l, l === "en-poetic" ? "witching" : "midnight"]),
) as Record<string, string>

function providerFor(locale: string): PhraseProvider {
  const spec = SPECS[locale]
  if (!spec) throw new Error(`segment-key.test.ts: no spec for locale '${locale}'.`)
  return makeProvider(spec, randomPicker)
}

/** Which bucket a minute falls in, per the recorded bounds. */
function bucketOf(locale: string, minute: number): number {
  const bounds = BOUNDS(locale)
  const i = bounds.findIndex((b) => minute <= b)
  if (i < 0) throw new Error(`${locale}: minute ${minute} is past the last recorded bound.`)
  return i
}

/** The contiguous runs of identical keys over minutes 0..59 of an hour. */
function runsOverHour(p: PhraseProvider, hour: number): readonly { key: string; from: number; to: number }[] {
  const out: { key: string; from: number; to: number }[] = []
  for (let m = 0; m < 60; m++) {
    const key = p.getSegmentKey(at(hour, m))
    const last = out[out.length - 1]
    if (last && last.key === key) last.to = m
    else out.push({ key, from: m, to: m })
  }
  return out
}

/** The run of identical keys that contains this minute, located by reading the provider. */
function runAt(p: PhraseProvider, hour: number, minute: number): { key: string; from: number; to: number } {
  const run = runsOverHour(p, hour).find((r) => minute >= r.from && minute <= r.to)
  if (!run) throw new Error(`no run covers minute ${minute} of hour ${hour}.`)
  return run
}

/** The recorded span of the bucket a minute belongs to, from the fixture-measured bounds. */
function recordedSpan(locale: string, minute: number): { from: number; to: number } {
  const bounds = BOUNDS(locale)
  const i = bucketOf(locale, minute)
  return { from: i === 0 ? 0 : bounds[i - 1]! + 1, to: bounds[i]! }
}

/**
 * The two assertions every same-bucket row makes: the C#'s own equality, and the bucket structure its
 * comment claims -- that the pair sits inside ONE run whose span is the recorded bucket. Both halves
 * read the provider; the recorded bounds are only the expected value, never also the measurement.
 */
function sameBucket(locale: string, h: number, m1: number, m2: number): void {
  const p = providerFor(locale)
  expect(p.getSegmentKey(at(h, m1))).toBe(p.getSegmentKey(at(h, m2)))

  // Located by minute rather than by index, so a provider that merged or split a bucket elsewhere in
  // the hour cannot shift this lookup onto a different run and still match.
  const run = runAt(p, h, m1)
  expect({ from: run.from, to: run.to }).toEqual(recordedSpan(locale, m1))
  // And m2 is inside that same run -- stronger than "same key", which one key all hour would satisfy.
  expect(m2 >= run.from && m2 <= run.to).toBe(true)
}

/**
 * The two assertions every adjacent-bucket row makes: the C#'s inequality, and that the boundary sits
 * at exactly this minute -- which is what makes the row a boundary test rather than any two minutes.
 * Read off the provider's own runs, so a provider whose boundary moved fails here even though the
 * inequality above would still hold.
 */
function adjacentBuckets(locale: string, h: number, m1: number, m2: number): void {
  const p = providerFor(locale)
  expect(p.getSegmentKey(at(h, m1))).not.toBe(p.getSegmentKey(at(h, m2)))

  expect(m2).toBe(m1 + 1) // the DataRow's own shape, so "adjacent minutes" is not an assumption
  const before = runAt(p, h, m1)
  const after = runAt(p, h, m2)
  // The boundary is HERE: m1 is the last minute of its run and m2 the first of the next, and both runs
  // span exactly the buckets recorded off the fixture.
  expect({ endsAt: before.to, startsAt: after.from }).toEqual({ endsAt: m1, startsAt: m2 })
  expect({ from: before.from, to: before.to }).toEqual(recordedSpan(locale, m1))
  expect({ from: after.from, to: after.to }).toEqual(recordedSpan(locale, m2))
}

interface ClassSpec {
  readonly cls: string
  readonly locale: string
  readonly same: readonly (readonly [number, number, number, number])[]
  readonly adjacent: readonly (readonly [number, number, number, number])[]
  /** The C# method name for the midnight case -- PoeticSegmentKeyTests calls it WitchingHour. */
  readonly midnightMethod: string
}

// The four classes, with their DataRows verbatim including the duplicated (3,0,3,1)/(3,0,3,2) pair.
const CLASSES: readonly ClassSpec[] = [
  {
    cls: "RudeSegmentKeyTests",
    locale: "en-rude",
    same: [[3, 0, 3, 1], [3, 0, 3, 2], [3, 3, 3, 5], [3, 15, 3, 17]],
    adjacent: [[3, 2, 3, 3], [3, 7, 3, 8], [3, 27, 3, 28], [3, 52, 3, 53]],
    midnightMethod: "Midnight_ReturnsSpecialKey",
  },
  {
    cls: "PoeticSegmentKeyTests",
    locale: "en-poetic",
    same: [[3, 0, 3, 1], [3, 15, 3, 17]],
    adjacent: [[3, 2, 3, 3], [3, 7, 3, 8]],
    midnightMethod: "WitchingHour_ReturnsSpecialKey",
  },
  {
    cls: "TerseSegmentKeyTests",
    locale: "en-terse",
    same: [[3, 0, 3, 1], [3, 0, 3, 2], [3, 3, 3, 5], [3, 15, 3, 17]],
    // 32/33 rather than 27/28: en-terse has no separate "almost half past" bucket, so 23-32 is one
    // span and 27/28 would NOT straddle a boundary. The C# row differs here for the same reason.
    adjacent: [[3, 2, 3, 3], [3, 7, 3, 8], [3, 32, 3, 33], [3, 52, 3, 53]],
    midnightMethod: "Midnight_ReturnsSpecialKey",
  },
  {
    cls: "ClassicSegmentKeyTests",
    locale: "en-classic",
    same: [[3, 0, 3, 1], [3, 0, 3, 2], [3, 3, 3, 5], [3, 15, 3, 17]],
    adjacent: [[3, 2, 3, 3], [3, 7, 3, 8], [3, 27, 3, 28], [3, 52, 3, 53]],
    midnightMethod: "Midnight_ReturnsSpecialKey",
  },
]

describe("SegmentKeyTests, translated (37 cases over 4 classes)", () => {
  for (const { cls, locale, same, adjacent, midnightMethod } of CLASSES)
    describe(`${cls} (${locale})`, () => {
      for (const [h1, m1, , m2] of same)
        test(`SameBucket_ReturnsSameKey(${h1}, ${m1}, ${h1}, ${m2}) -- one run, spanning bucket ${bucketOf(locale, m1)}`, () => {
          sameBucket(locale, h1, m1, m2)
        })

      for (const [h1, m1, , m2] of adjacent)
        test(`AdjacentBuckets_ReturnDifferentKeys(${h1}, ${m1}, ${h1}, ${m2}) -- boundary is exactly here`, () => {
          adjacentBuckets(locale, h1, m1, m2)
        })

      test(`${midnightMethod} -- "${locale}:${CSHARP_SPECIAL[locale]}"`, () => {
        expect(providerFor(locale).getSegmentKey(at(0, 0))).toBe(`${locale}:${CSHARP_SPECIAL[locale]}`)
      })

      test(`Noon_ReturnsSpecialKey -- "${locale}:noon"`, () => {
        expect(providerFor(locale).getSegmentKey(at(12, 0))).toBe(`${locale}:noon`)
      })
    })

  test("DifferentProviders_SameBucket_DifferentKeys -- en-rude vs en-poetic at 3:15", () => {
    // The C#'s own case, then the universal its comment reaches for, scoped to where it is true: no two
    // of the TEN prefixed locales share a key at any minute of the day. The comment's reasoning is the
    // prefix, and only these ten have one.
    const dt = at(3, 15)
    expect(providerFor("en-rude").getSegmentKey(dt)).not.toBe(providerFor("en-poetic").getSegmentKey(dt))

    const providers = CSHARP_BUCKET_KEYED.map((l) => [l, providerFor(l)] as const)
    for (let hour = 0; hour < 24; hour++)
      for (let minute = 0; minute < 60; minute++) {
        const t = at(hour, minute)
        const keys = providers.map(([, p]) => p.getSegmentKey(t))
        expect(new Set(keys).size).toBe(providers.length)
      }
  })
})

describe("additions, measured against the C#", () => {
  test("the port's bucket-keyed set is exactly the 10 the fixture shows prefixing their own name", () => {
    // Two routes to the same answer: the fixture (does every key start with the locale name?) and the
    // port's hand-written `segmentKeyMode`. Asserting they agree is the point -- reading the mode off
    // SPECS and then testing SPECS would be self-agreement.
    const fromSpecs = LOCALES.filter((l) => SPECS[l]?.segmentKeyMode === "bucket")
    expect([...fromSpecs].sort()).toEqual([...CSHARP_BUCKET_KEYED].sort())
    expect(fromSpecs.length).toBe(10)
  })

  test("every bucket-keyed locale's run structure matches the fixture, in all 22 ordinary hours", () => {
    // The C# samples 3 of the 12 boundaries in one hour of one locale per class. This is the whole
    // partition, every hour, every locale -- and it is what makes each translated row's structural
    // half non-vacuous rather than a restatement of the constant it was given.
    for (const locale of CSHARP_BUCKET_KEYED) {
      const p = providerFor(locale)
      const bounds = BOUNDS(locale)
      for (let hour = 0; hour < 24; hour++) {
        if (hour === 0 || hour === 12) continue // the special minute splits those hours' first run
        const runs = runsOverHour(p, hour)
        expect({ locale, hour, bounds: runs.map((r) => r.to) }).toEqual({ locale, hour, bounds: [...bounds] })
        // Keys are the bucket INDEX, not the minute -- the misreading that cost a session once.
        expect(runs.map((r) => r.key)).toEqual(bounds.map((_, i) => `${locale}:${i}`))
      }
    }
  })

  test("en-terse is the only locale with 11 buckets, and it merges 23-32", () => {
    // Stated as its own case so the exception is visible rather than buried in a table. If a
    // regeneration gave en-terse a 12th bucket, or gave another locale 11, this is what says so.
    const counts = Object.fromEntries(CSHARP_BUCKET_KEYED.map((l) => [l, runsOverHour(providerFor(l), 3).length]))
    expect(counts["en-terse"]).toBe(11)
    expect(Object.entries(counts).filter(([, n]) => n !== 12).map(([l]) => l)).toEqual(["en-terse"])
    const terse = providerFor("en-terse")
    for (let m = 23; m <= 32; m++) expect(terse.getSegmentKey(at(3, m))).toBe(terse.getSegmentKey(at(3, 23)))
  })

  test("each bucket-keyed locale's whole key set is distinct: 14 keys, or 13 for en-terse", () => {
    // 12 buckets + noon + midnight. The C#'s adjacent-bucket rows check 3 or 4 pairs; this checks that
    // no two of the day's keys coincide at all, which is the property the UI actually relies on.
    for (const locale of CSHARP_BUCKET_KEYED) {
      const p = providerFor(locale)
      const keys = new Set<string>()
      for (let hour = 0; hour < 24; hour++) for (let minute = 0; minute < 60; minute++) keys.add(p.getSegmentKey(at(hour, minute)))
      expect({ locale, n: keys.size }).toEqual({ locale, n: locale === "en-terse" ? 13 : 14 })
      expect(keys.has(`${locale}:noon`)).toBe(true)
      expect(keys.has(`${locale}:${CSHARP_SPECIAL[locale]}`)).toBe(true)
    }
  })

  test("en-poetic is the only locale whose midnight suffix is not 'midnight'", () => {
    // The lone exception, and the reason specs.ts spells the suffix out per locale instead of deriving
    // it: a computed exception is an exception that goes missing on the next refactor.
    const odd = CSHARP_BUCKET_KEYED.filter((l) => providerFor(l).getSegmentKey(at(0, 0)) !== `${l}:midnight`)
    expect(odd).toEqual(["en-poetic"])
    expect(providerFor("en-poetic").getSegmentKey(at(0, 0))).toBe("en-poetic:witching")
  })

  test("the cross-provider guarantee does NOT extend past the 10 prefixed locales", () => {
    // The C# comment says the prefix prevents cross-provider collision, and the eight phrase-keyed
    // locales have no prefix. Measured over the fixture's 25920 rows: exactly one pair collides, on
    // exactly 650 of 1440 minutes, and no other pair anywhere. Asserted as the exact count, because
    // "they sometimes collide" would pass for a port where they always did.
    const providers = LOCALES.map((l) => [l, providerFor(l)] as const)
    const collisions = new Map<string, number>()
    for (let hour = 0; hour < 24; hour++)
      for (let minute = 0; minute < 60; minute++) {
        const t = at(hour, minute)
        const byKey = new Map<string, string[]>()
        for (const [l, p] of providers) {
          const k = p.getSegmentKey(t)
          byKey.set(k, [...(byKey.get(k) ?? []), l])
        }
        for (const locs of byKey.values())
          for (let i = 0; i < locs.length; i++)
            for (let j = i + 1; j < locs.length; j++) {
              const pair = [locs[i]!, locs[j]!].sort().join(" <-> ")
              collisions.set(pair, (collisions.get(pair) ?? 0) + 1)
            }
      }
    expect(Object.fromEntries(collisions)).toEqual({ "ja-classic <-> ja-terse": 650 })
  })

  test("a segment key is stable across repeated calls in the same minute, for all 18 locales", () => {
    // The property the whole abstraction rests on: the UI compares this minute's key to last minute's,
    // so a key that varied between two calls at the same instant would report a change every tick.
    // Trivial for the ten bucket-keyed locales and true for the other eight ONLY because each of their
    // buckets holds one template -- which is exactly what specShapeMismatches guards statically, and
    // this is that guard's behavioural form. randomPicker on purpose: a seeded picker would prove
    // nothing about a provider that draws.
    for (const locale of LOCALES) {
      const p = providerFor(locale)
      for (const [hour, minute] of [[0, 0], [3, 15], [3, 45], [12, 0], [17, 38], [23, 59]] as const) {
        const t = at(hour, minute)
        const first = p.getSegmentKey(t)
        for (let i = 0; i < 50; i++) expect(p.getSegmentKey(t)).toBe(first)
      }
    }
  })
})
