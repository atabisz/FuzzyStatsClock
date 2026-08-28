/**
 * Unit tests for the phrase factory, on synthetic specs rather than the real tables.
 *
 * WHY A SECOND FILE. phrase-golden.test.ts checks the port against the C# oracle, so it can only
 * exercise shapes the 18 real locales actually have. Three things fall outside that:
 *
 *   - THE CONSTRUCTION-TIME PRECONDITIONS. makeProvider's guards cannot fire on the generated tables
 *     -- GoldenGen walked all 1440 minutes of all 18 locales without an exception, which is what
 *     proves the coverage. Guard code that has never once executed is guard code that might not work,
 *     and it only matters on the day someone regenerates the tables wrongly. So it is fed bad tables
 *     here on purpose.
 *   - THE oClockTemplate BRANCH. Mutation testing showed the golden suite stays green when that branch
 *     is disabled, because en-classic's own "{h} o'clock" makes it indistinguishable from the fallback.
 *     The branch is real for a template ending in an hour token, and that is the case pinned below.
 *   - specShapeMismatches ITSELF. The golden suite only ever asserts it returns nothing, which a
 *     function that returned nothing unconditionally would also satisfy. Each of its four rules gets a
 *     spec built to trip it.
 */
import { describe, expect, test } from "bun:test"
import {
  makeProvider,
  specShapeMismatches,
  type ProviderSpec,
  type SegmentKeyMode,
  type StructuredMode,
} from "../src/core/phrase/factories.js"
import type { LocaleTables, PhraseBucket } from "../src/core/phrase/tables.generated.js"
import type { Picker } from "../src/core/phrase/types.js"

/** Index 1..12 are addressed; slot 0 exists and is never read, as in every real locale. */
const HOUR_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]

/** Always the first candidate. These tests are about branches, not about the candidate space. */
const first: Picker = <T,>(items: readonly T[]): T => {
  const chosen = items[0]
  if (chosen === undefined) throw new Error("first: empty list")
  return chosen
}

interface TableOverrides {
  readonly declaredShape?: "candidates" | "template"
  readonly buckets?: readonly PhraseBucket[]
  readonly words?: { readonly [name: string]: readonly string[] }
}

function tables(o: TableOverrides = {}): LocaleTables {
  return {
    locale: "test",
    source: "Synthetic",
    declaredShape: o.declaredShape ?? "candidates",
    buckets: o.buckets ?? [{ upperBound: 59, candidates: ["{h}"] }],
    words: o.words ?? { hourWords: HOUR_WORDS },
  }
}

interface SpecOverrides {
  readonly tables?: LocaleTables
  readonly noon?: readonly string[]
  readonly midnight?: readonly string[]
  readonly midnightKey?: string
  readonly segmentKeyMode?: SegmentKeyMode
  readonly structuredMode?: StructuredMode
  readonly oClockTemplate?: string
}

function spec(o: SpecOverrides = {}): ProviderSpec {
  const base = {
    tables: o.tables ?? tables(),
    noon: o.noon ?? ["noon"],
    midnight: o.midnight ?? ["midnight"],
    noonKey: "noon",
    midnightKey: o.midnightKey ?? "midnight",
    segmentKeyMode: o.segmentKeyMode ?? ("bucket" as SegmentKeyMode),
    structuredMode: o.structuredMode ?? ("delegate" as StructuredMode),
  }
  // exactOptionalPropertyTypes is on: an optional property is omitted, never assigned undefined.
  return o.oClockTemplate === undefined ? base : { ...base, oClockTemplate: o.oClockTemplate }
}

/** Same self-checking construction as the golden suite: a zone shift here would be silent otherwise. */
function at(hour: number, minute: number): Date {
  const dt = new Date(2026, 0, 1, hour, minute, 0, 0)
  if (dt.getHours() !== hour || dt.getMinutes() !== minute)
    throw new Error(`at(${hour}, ${minute}) did not round-trip in this host's zone`)
  return dt
}

describe("the oClockTemplate guard", () => {
  const BUCKETS: readonly PhraseBucket[] = [{ upperBound: 59, candidates: ["half past {h}"] }]

  test("a template it names is emitted whole, with an empty qualifier", () => {
    const provider = makeProvider(
      spec({ tables: tables({ buckets: BUCKETS }), structuredMode: "split", oClockTemplate: "half past {h}" }),
      first,
    )
    expect(provider.getStructuredPhrase(at(3, 30))).toEqual({ qualifier: "", emphasis: "half past three" })
  })

  test("the same template splits when it is not named -- the only difference is the field", () => {
    // The counter-case. Identical tables, identical minute, one field removed: if the outputs did not
    // differ, the guard would be unreachable by construction and could be deleted.
    const provider = makeProvider(
      spec({ tables: tables({ buckets: BUCKETS }), structuredMode: "split" }),
      first,
    )
    expect(provider.getStructuredPhrase(at(3, 30))).toEqual({ qualifier: "half past", emphasis: "three" })
  })

  test("it is ignored for a template it does not name", () => {
    const provider = makeProvider(
      spec({ tables: tables({ buckets: BUCKETS }), structuredMode: "split", oClockTemplate: "{h} o'clock" }),
      first,
    )
    expect(provider.getStructuredPhrase(at(3, 30))).toEqual({ qualifier: "half past", emphasis: "three" })
  })
})

describe("construction-time preconditions", () => {
  test("hourWords must address indices 1..12", () => {
    expect(() => makeProvider(spec({ tables: tables({ words: { hourWords: HOUR_WORDS.slice(0, 12) } }) }), first)).toThrow(
      /hourWords has 12 entries/,
    )
  })

  test("a missing hourWords list names the generator to re-run", () => {
    expect(() => makeProvider(spec({ tables: tables({ words: {} }) }), first)).toThrow(/no 'hourWords' list/)
  })

  test("there must be at least one bucket", () => {
    expect(() => makeProvider(spec({ tables: tables({ buckets: [] }) }), first)).toThrow(/no buckets/)
  })

  test("the buckets must reach minute 59", () => {
    // The C# raises this from GetPhrase at the first uncovered minute, which for a bucket ending at 52
    // means an exception seven minutes into some hour. Hoisting it to construction is the one
    // deliberate behavioural divergence in factories.ts, and this is what it buys.
    expect(() => makeProvider(spec({ tables: tables({ buckets: [{ upperBound: 52, candidates: ["{h}"] }] }) }), first)).toThrow(
      /ends at minute 52, so minutes 53..59 match nothing/,
    )
  })

  test("no bucket may be empty", () => {
    expect(() => makeProvider(spec({ tables: tables({ buckets: [{ upperBound: 59, candidates: [] }] }) }), first)).toThrow(
      /bucket ending at minute 59 has no candidates/,
    )
  })

  test("the noon and midnight lists must be non-empty", () => {
    expect(() => makeProvider(spec({ noon: [] }), first)).toThrow(/noon or midnight candidate list is empty/)
    expect(() => makeProvider(spec({ midnight: [] }), first)).toThrow(/noon or midnight candidate list is empty/)
  })

  test("a well-formed spec constructs, so the guards above are rejecting the defect and not the shape", () => {
    // The positive control. Without it, every assertion above could be passing because makeProvider
    // throws on everything.
    expect(() => makeProvider(spec(), first)).not.toThrow()
  })
})

describe("specShapeMismatches reports each contradiction it is for", () => {
  test("a phrase-keyed locale whose buckets offer a choice", () => {
    const problems = specShapeMismatches([
      spec({
        tables: tables({ declaredShape: "template", buckets: [{ upperBound: 59, candidates: ["{h}", "{h} sharp"] }] }),
        segmentKeyMode: "phrase",
      }),
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/would not be stable within a minute/)
  })

  test("a template-shaped locale keyed on the bucket index", () => {
    const problems = specShapeMismatches([spec({ tables: tables({ declaredShape: "template" }), segmentKeyMode: "bucket" })])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/declared shape is "template"/)
  })

  test("a candidates-shaped locale keyed on the phrase", () => {
    const problems = specShapeMismatches([spec({ tables: tables({ declaredShape: "candidates" }), segmentKeyMode: "phrase" })])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/a randomly drawn phrase cannot be a stable key/)
  })

  test("an oClockTemplate that can never be consulted", () => {
    const problems = specShapeMismatches([spec({ structuredMode: "delegate", oClockTemplate: "{h} o'clock" })])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/can never be consulted/)
  })

  test("a spec with none of those problems reports nothing", () => {
    expect(specShapeMismatches([spec()])).toEqual([])
  })
})

describe("the special minutes", () => {
  test("noon is minute 720 and midnight is minute 0, and no other minute is special", () => {
    const provider = makeProvider(spec({ noon: ["NOON"], midnight: ["MIDNIGHT"] }), first)
    expect(provider.getPhrase(at(12, 0))).toBe("NOON")
    expect(provider.getPhrase(at(0, 0))).toBe("MIDNIGHT")
    // The two neighbours, which a >= or an off-by-one would capture.
    expect(provider.getPhrase(at(12, 1))).toBe("twelve")
    expect(provider.getPhrase(at(0, 1))).toBe("twelve")
    expect(provider.getPhrase(at(11, 59))).toBe("eleven")
  })

  test("the segment key uses the spec's own suffixes, so en-poetic's ':witching' is not special-cased", () => {
    const provider = makeProvider(spec({ midnightKey: "witching" }), first)
    expect(provider.getSegmentKey(at(12, 0))).toBe("test:noon")
    expect(provider.getSegmentKey(at(0, 0))).toBe("test:witching")
    expect(provider.getSegmentKey(at(0, 1))).toBe("test:0")
  })
})

describe("bucket selection", () => {
  const BUCKETS: readonly PhraseBucket[] = [
    { upperBound: 2, candidates: ["first"] },
    { upperBound: 30, candidates: ["second"] },
    { upperBound: 59, candidates: ["third"] },
  ]

  test("the upper bound is inclusive, and every one of the 60 minutes lands somewhere", () => {
    const provider = makeProvider(spec({ tables: tables({ buckets: BUCKETS }) }), first)
    const seen = new Map<string, number[]>()
    for (let minute = 0; minute < 60; minute++) {
      const phrase = provider.getPhrase(at(1, minute))
      const list = seen.get(phrase) ?? []
      list.push(minute)
      seen.set(phrase, list)
    }
    expect(seen.get("first")).toEqual([0, 1, 2])
    expect(seen.get("second")?.at(0)).toBe(3)
    expect(seen.get("second")?.at(-1)).toBe(30)
    expect(seen.get("third")?.at(0)).toBe(31)
    expect(seen.get("third")?.at(-1)).toBe(59)
    expect(seen.size).toBe(3)
  })
})
