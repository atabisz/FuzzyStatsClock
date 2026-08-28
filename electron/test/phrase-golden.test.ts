/**
 * ISC-13: the TypeScript phrase layer against the C# oracle.
 *
 * WHY THIS TEST CANNOT COMPARE PHRASES DIRECTLY. 10 of the 18 providers choose their wording with
 * `Random.Shared.Next()`, so no sweep of the C# and no sweep of the port can be expected to agree
 * byte for byte. Two things about them are nonetheless total functions of the clock, and those are
 * what tools/GoldenGen recorded:
 *
 *   - the segment key, for every one of the 1440 minutes in all 18 locales (25,920 rows), and
 *   - the COMPLETE set of strings each bucket can emit, for the 10 that draw (12,984 rows).
 *
 * The second only became checkable because the port takes its `Picker` as a parameter. Driving it by
 * index enumerates a bucket's whole candidate space deterministically AND exposes `items.length`,
 * which is what makes the arity assertion below possible: a port with a duplicated sixth candidate in
 * a five-candidate bucket has the right SET and the wrong distribution, and a set comparison alone
 * would sign it off.
 *
 * WHAT MAKES THIS A CHECK AND NOT A MIRROR. The tables came across by reflection (tools/TableExport);
 * the fixture came across by calling the providers and saturating their random draws (tools/GoldenGen);
 * the ~40 noon/midnight strings that live in C# method locals were transcribed by hand into specs.ts.
 * Three routes to the same source tree. A mistake in any one of them fails here, which would not be
 * true had one generator supplied both sides.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { makeProvider, specShapeMismatches } from "../src/core/phrase/factories.js"
import { ALL_SPECS, SPECS } from "../src/core/phrase/specs.js"
import { LOCALES, TABLES } from "../src/core/phrase/tables.generated.js"
import { hour12Of } from "../src/core/phrase/types.js"
import { enumerateAll, indexPicker, wallTime } from "./support/picker.js"

const FIXTURES = join(import.meta.dirname, "fixtures")

/**
 * Reads a golden TSV, requiring the exact field count on every row.
 *
 * Strict rather than tolerant on purpose. A ragged row is how a fixture silently loses a column, and
 * a comparison against a fixture that lost a column reports "0 mismatches" over 0 rows. The CR check
 * is the same worry: both files are `-text` in .gitattributes, and if that ever stopped holding, every
 * last field would carry a trailing `\r` and every diff would name a phrase instead of the cause.
 */
function readRows(name: string, fields: number): readonly (readonly string[])[] {
  const text = readFileSync(join(FIXTURES, name), "utf8")
  if (text.includes("\r"))
    throw new Error(`${name}: contains CR -- the fixture must stay LF-only (.gitattributes marks it -text).`)

  const rows: string[][] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line === "" || line.startsWith("#")) continue
    const cells = line.split("\t")
    if (cells.length !== fields)
      throw new Error(`${name}:${i + 1}: ${cells.length} fields, expected ${fields}.`)
    rows.push(cells)
  }
  if (rows.length === 0) throw new Error(`${name}: no data rows.`)
  return rows
}

const SEGMENT_ROWS = readRows("phrase-golden-segments.tsv", 3)
const CANDIDATE_ROWS = readRows("phrase-golden-candidates.tsv", 6)

/** `locale|hh:mm` -> segmentKey. */
const GOLDEN_SEGMENTS = new Map<string, string>()
for (const [locale, hhmm, key] of SEGMENT_ROWS as readonly [string, string, string][])
  GOLDEN_SEGMENTS.set(`${locale}|${hhmm}`, key)

/** `locale|segmentKey|hour12|kind` -> the complete value set. Structured pairs join on TAB, as the
 * fixture itself does -- sound because the uniform 6-field parse above proves no value contains one. */
const GOLDEN_CANDIDATES = new Map<string, Set<string>>()
for (const row of CANDIDATE_ROWS) {
  const [locale, segKey, hour12, kind, value1, value2] = row as readonly [string, string, string, string, string, string]
  const value = kind === "structured" ? `${value1}\t${value2}` : value1
  const mapKey = `${locale}|${segKey}|${hour12}|${kind}`
  let set = GOLDEN_CANDIDATES.get(mapKey)
  if (set === undefined) {
    set = new Set<string>()
    GOLDEN_CANDIDATES.set(mapKey, set)
  }
  set.add(value)
}

const GOLDEN_SEGMENT_LOCALES = new Set(SEGMENT_ROWS.map((r) => r[0]!))
const GOLDEN_CANDIDATE_LOCALES = new Set(CANDIDATE_ROWS.map((r) => r[0]!))
const PORTED = new Set<string>(LOCALES)

const pad = (n: number): string => String(n).padStart(2, "0")

/**
 * The wall-clock builder, the index picker and the enumeration now live in test/support/picker.ts --
 * phrase-engine.test.ts needs the same three, and the "exactly one draw per call" guard inside
 * enumerateAll must have exactly one definition. `at` stays as a local alias so the sweeps below read
 * unchanged; 2026-01-01 is this fixture's arbitrary date, checked for a zone shift by the helper.
 */
const at = (hour: number, minute: number): Date => wallTime(hour, minute)

describe("golden fixture integrity", () => {
  test("the segments fixture is 18 locales x 1440 minutes, with no duplicate keys", () => {
    expect(SEGMENT_ROWS.length).toBe(25920)
    expect(GOLDEN_SEGMENTS.size).toBe(25920)
    expect(GOLDEN_SEGMENT_LOCALES.size).toBe(18)
  })

  test("the candidates fixture holds both kinds, and phrase rows leave value2 empty", () => {
    expect(CANDIDATE_ROWS.length).toBe(12984)
    const kinds = new Set(CANDIDATE_ROWS.map((r) => r[3]!))
    expect([...kinds].sort()).toEqual(["phrase", "structured"])
    // The header claims value2 is unused for kind=phrase. A non-empty one would mean the two kinds
    // were written in one shape, and the structured comparison below would be reading phrase rows.
    const stray = CANDIDATE_ROWS.filter((r) => r[3] === "phrase" && r[5] !== "")
    expect(stray.length).toBe(0)
  })

  test("no golden value contains a TAB, so joining structured pairs on TAB is unambiguous", () => {
    // Implied by the uniform field count, asserted because the structured comparison depends on it.
    const offenders = CANDIDATE_ROWS.filter((r) => r[4]!.includes("\t") || r[5]!.includes("\t"))
    expect(offenders.length).toBe(0)
  })

  test("every locale in the oracle is ported, and every ported locale is in the oracle", () => {
    // The PENDING set is the honest denominator: while a locale was untranslated it belonged here, and
    // an empty PENDING is the claim that no locale is being skipped. A test that iterated only over
    // what it had ported would report all-green on a port of one locale.
    const pending = [...GOLDEN_SEGMENT_LOCALES].filter((l) => !PORTED.has(l)).sort()
    const extra = [...PORTED].filter((l) => !GOLDEN_SEGMENT_LOCALES.has(l)).sort()
    expect(pending).toEqual([])
    expect(extra).toEqual([])
    expect(PORTED.size).toBe(18)
  })

  test("the candidates fixture covers exactly the locales the tables declare as drawing", () => {
    // Two independently generated artifacts agreeing on which 10 locales draw: GoldenGen decided by
    // redrawing each minute and watching the phrase change, TableExport by the C# field's static type.
    const declaredDrawing = LOCALES.filter((l) => TABLES[l]!.declaredShape === "candidates").sort()
    expect([...GOLDEN_CANDIDATE_LOCALES].sort()).toEqual([...declaredDrawing])
    expect(GOLDEN_CANDIDATE_LOCALES.size).toBe(10)
  })
})

describe("the segment key for every minute", () => {
  for (const locale of LOCALES) {
    test(`${locale}: all 1440 minutes match the oracle`, () => {
      const spec = SPECS[locale]
      if (spec === undefined) throw new Error(`${locale}: no spec`)
      const ctl = indexPicker()
      const provider = makeProvider(spec, ctl.picker)

      const mismatches: string[] = []
      let checked = 0
      for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute++) {
          const hhmm = `${pad(hour)}:${pad(minute)}`
          const golden = GOLDEN_SEGMENTS.get(`${locale}|${hhmm}`)
          if (golden === undefined) {
            mismatches.push(`${hhmm}: no golden row`)
            continue
          }
          const actual = provider.getSegmentKey(at(hour, minute))
          if (actual !== golden)
            mismatches.push(`${hhmm}: got ${JSON.stringify(actual)}, oracle ${JSON.stringify(golden)}`)
          checked++
        }
      }
      // Sliced so a systematic break prints ten readable lines instead of 1440.
      expect(mismatches.slice(0, 10)).toEqual([])
      expect(checked).toBe(1440)
    })
  }

  test("a bucket-keyed locale takes no draw to produce a key, and a phrase-keyed one has nothing to draw", () => {
    // The interface's load-bearing sentence is "Must NOT depend on random candidate selection", and
    // this is that sentence as an assertion. For the 10 bucket-keyed locales it holds because the key
    // is computed, so the picker is never consulted. For the 8 phrase-keyed ones the key IS the
    // phrase, which is only stable because every bucket offers exactly one candidate -- so the draw
    // happens but has no choice to make. Those are different arguments and both are checked.
    const problems: string[] = []
    for (const locale of LOCALES) {
      const spec = SPECS[locale]!
      const ctl = indexPicker()
      const provider = makeProvider(spec, ctl.picker)
      for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute++) {
          ctl.resetCalls()
          provider.getSegmentKey(at(hour, minute))
          if (spec.segmentKeyMode === "bucket") {
            if (ctl.calls !== 0) problems.push(`${locale} ${pad(hour)}:${pad(minute)}: drew ${ctl.calls} time(s)`)
          } else if (ctl.calls !== 1 || ctl.lastLength !== 1) {
            problems.push(`${locale} ${pad(hour)}:${pad(minute)}: ${ctl.calls} draw(s) from ${ctl.lastLength} candidate(s)`)
          }
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([])
  })
})

describe("the complete candidate set for every bucket", () => {
  for (const locale of LOCALES.filter((l) => TABLES[l]!.declaredShape === "candidates")) {
    test(`${locale}: every reachable phrase and structured pair matches the oracle`, () => {
      const spec = SPECS[locale]!
      const ctl = indexPicker()
      const provider = makeProvider(spec, ctl.picker)

      /** `segmentKey|hour12|kind` -> arity and the union of everything seen. */
      const observed = new Map<string, { arity: number; values: Set<string> }>()
      const record = (key: string, arity: number, values: readonly string[]): void => {
        const prior = observed.get(key)
        if (prior === undefined) {
          observed.set(key, { arity, values: new Set(values) })
          return
        }
        // Every minute in a bucket sees the same candidate list, so a disagreement here means the
        // bucket boundaries put two different lists behind one key.
        if (prior.arity !== arity)
          throw new Error(`${locale} ${key}: arity was ${prior.arity}, now ${arity}`)
        for (const v of values) prior.values.add(v)
      }

      // Unioning over all 1440 minutes rather than sampling one minute per bucket: if two minutes that
      // share a key produced different text, the union would exceed the arity and fail below.
      for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute++) {
          const dt = at(hour, minute)
          const segKey = provider.getSegmentKey(dt)
          const h12 = hour12Of(hour)

          const phrases = enumerateAll(ctl, () => provider.getPhrase(dt))
          record(`${segKey}|${h12}|phrase`, phrases.arity, phrases.values)

          const structured = enumerateAll(ctl, () => provider.getStructuredPhrase(dt))
          record(
            `${segKey}|${h12}|structured`,
            structured.arity,
            structured.values.map((v) => `${v.qualifier}\t${v.emphasis}`),
          )
        }
      }

      const goldenKeys = [...GOLDEN_CANDIDATES.keys()]
        .filter((k) => k.startsWith(`${locale}|`))
        .map((k) => k.slice(locale.length + 1))
        .sort()
      expect([...observed.keys()].sort()).toEqual(goldenKeys)

      const problems: string[] = []
      for (const [key, { arity, values }] of observed) {
        const golden = GOLDEN_CANDIDATES.get(`${locale}|${key}`)
        if (golden === undefined) {
          problems.push(`${key}: no golden rows`)
          continue
        }
        const missing = [...golden].filter((v) => !values.has(v)).sort()
        const surplus = [...values].filter((v) => !golden.has(v)).sort()
        if (missing.length > 0) problems.push(`${key}: oracle has, port cannot emit: ${JSON.stringify(missing)}`)
        if (surplus.length > 0) problems.push(`${key}: port emits, oracle never saw: ${JSON.stringify(surplus)}`)

        // The arity check the set comparison cannot make. For a numeric bucket GoldenGen asserted its
        // saturated sample size equalled the C# array length, so oracle-set-size IS the C# arity, and
        // comparing the port's list length to it catches a reflection slip that duplicated an entry.
        // Asserted for the :noon / :midnight / :witching keys too, where GoldenGen had no expected
        // count -- there it is a measured equality rather than a derived one, and it holds because no
        // provider repeats a special-case string.
        if (arity !== golden.size)
          problems.push(`${key}: port offers ${arity} candidate(s), oracle recorded ${golden.size} distinct`)
      }
      expect(problems.slice(0, 10)).toEqual([])
      expect(observed.size).toBe(goldenKeys.length)
    })
  }
})

describe("the 8 single-template locales", () => {
  // These have no rows in the candidates fixture, and would otherwise have their structured phrase
  // untested. They do not need rows: their structured mode forwards to getPhrase, and their key IS
  // their phrase, so the segments fixture already holds every string they can produce.
  for (const locale of LOCALES.filter((l) => TABLES[l]!.declaredShape === "template")) {
    test(`${locale}: the structured phrase is ("", <the segment key>) at every minute`, () => {
      const spec = SPECS[locale]!
      const provider = makeProvider(spec, indexPicker().picker)
      const problems: string[] = []
      let checked = 0
      for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute++) {
          const golden = GOLDEN_SEGMENTS.get(`${locale}|${pad(hour)}:${pad(minute)}`)!
          const { qualifier, emphasis } = provider.getStructuredPhrase(at(hour, minute))
          if (qualifier !== "" || emphasis !== golden)
            problems.push(`${pad(hour)}:${pad(minute)}: got (${JSON.stringify(qualifier)}, ${JSON.stringify(emphasis)})`)
          checked++
        }
      }
      expect(problems.slice(0, 10)).toEqual([])
      expect(checked).toBe(1440)
    })
  }
})

describe("spec and table shapes agree", () => {
  test("no spec contradicts the generated tables", () => {
    expect(specShapeMismatches(ALL_SPECS)).toEqual([])
    expect(ALL_SPECS.length).toBe(18)
  })

  test("declaredShape and segmentKeyMode line up 8 to 10, as they do in the C#", () => {
    // Written out per locale in specs.ts rather than derived from declaredShape, because the alignment
    // is something observed about the original and not a rule the port should inherit silently. This
    // is where the observation is recorded as a fact about today's C#.
    const byMode = { bucket: 0, phrase: 0 }
    for (const spec of ALL_SPECS) {
      const expected = spec.tables.declaredShape === "template" ? "phrase" : "bucket"
      expect(spec.segmentKeyMode).toBe(expected)
      byMode[spec.segmentKeyMode]++
    }
    expect(byMode).toEqual({ bucket: 10, phrase: 8 })
  })
})
