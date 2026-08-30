/**
 * Fixture tests for the `typeperf` CSV parser.
 *
 * These run on any OS. That is the whole point: `typeperf` exists only on Windows, so
 * without captured fixtures the Windows telemetry path could only be tested on Windows,
 * and a three-platform port whose per-platform parsers are each testable on exactly one
 * platform is a port with three untested parsers.
 *
 * Fixtures come from `scripts/capture-fixture.ts` — real output, hostname replaced with
 * an equal-length placeholder, CRLF preserved.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { UNAVAILABLE } from "../src/shared.js"
import {
  NO_COLUMN,
  classifyColumns,
  extractInstanceName,
  isHeaderLine,
  parse3dEngineInstances,
  parseHeaderPaths,
  parseSampleLine,
  parseSampleTimestampMs,
  parseSampleValues,
  reduceSample,
  splitCsvLine,
  stampDeltaMs,
} from "../src/main/telemetry/parse/typeperf.js"

const FIXTURES = join(import.meta.dirname, "fixtures")
const read = (name: string): string => readFileSync(join(FIXTURES, name), "utf8")

const fourCounter = read("typeperf-4counter.csv")
const scalarOnly = read("typeperf-scalar.csv")
/**
 * A capture in which `typeperf` dropped a counter from the header, kept its data in the
 * rows, and reported success. Caught by accident while capturing the clean scalar
 * fixture above; kept because the defect cannot be triggered on demand and this is the
 * only deterministic copy of it.
 */
const dropped = read("typeperf-dropped-header.csv")

/** Non-empty lines, exactly as the ingest path splits them. */
function lines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
}

const fourLines = lines(fourCounter)
const scalarLines = lines(scalarOnly)
const fourHeader = fourLines.find(isHeaderLine)
const scalarHeader = scalarLines.find(isHeaderLine)

describe("fixture shape", () => {
  test("both captures carry CRLF endings", () => {
    // Guards the `.gitattributes` `-text` rule. If someone normalises these to LF the
    // parser still passes every test below, which is exactly why this is asserted
    // separately: the regression is invisible in the behavioural tests.
    expect(fourCounter).toContain("\r\n")
    expect(scalarOnly).toContain("\r\n")
  })

  test("typeperf emits a bare CR line before the header", () => {
    // The reason `splitCsvLine` callers trim and skip empties rather than assuming
    // line 0 is the header.
    expect(fourCounter.startsWith("\r\n")).toBe(true)
  })

  test("the hostname was sanitized out", () => {
    expect(fourCounter).not.toMatch(/TRI-9QPCB24/)
    expect(fourCounter).toContain("EXAMPLEHOST")
  })
})

describe("splitCsvLine", () => {
  test("quoted fields containing no comma still split on the delimiter", () => {
    expect(splitCsvLine('"a","b","c"')).toEqual(["a", "b", "c"])
  })

  test("a comma inside quotes does not split — the shift-every-column bug", () => {
    expect(splitCsvLine('"a","b,c","d"')).toEqual(["a", "b,c", "d"])
  })

  test("a doubled quote inside a quoted field is one literal quote", () => {
    expect(splitCsvLine('"a","b""c"')).toEqual(["a", 'b"c'])
  })

  test("the real header's quotes are balanced", () => {
    const quotes = (fourHeader?.match(/"/g) ?? []).length
    expect(quotes % 2).toBe(0)
  })
})

describe("classifyColumns on real headers", () => {
  test("the 4-counter header resolves all three scalars and many GPU columns", () => {
    expect(fourHeader).toBeDefined()
    const layout = classifyColumns(parseHeaderPaths(fourHeader ?? ""))
    expect(layout.cpu).not.toBe(NO_COLUMN)
    expect(layout.mem).not.toBe(NO_COLUMN)
    expect(layout.pag).not.toBe(NO_COLUMN)
    expect(layout.gpu.length).toBeGreaterThan(0)
    // Distinct, not merely present: a classifier that assigned every scalar to column
    // 0 would satisfy the assertions above.
    expect(new Set([layout.cpu, layout.mem, layout.pag]).size).toBe(3)
  })

  test("the scalar-only header resolves three scalars and zero GPU columns", () => {
    const layout = classifyColumns(parseHeaderPaths(scalarHeader ?? ""))
    expect(layout.cpu).not.toBe(NO_COLUMN)
    expect(layout.mem).not.toBe(NO_COLUMN)
    expect(layout.pag).not.toBe(NO_COLUMN)
    expect(layout.gpu).toEqual([])
  })

  test("classification is by path text, not by request order", () => {
    // The counter-case: reversing the requested order must move the column indices and
    // must not move which metric each path maps to. A positional parser passes the
    // tests above and fails this one.
    const paths = parseHeaderPaths(scalarHeader ?? "")
    const forward = classifyColumns(paths)
    const reversed = classifyColumns([...paths].reverse())
    expect(reversed.cpu).toBe(paths.length - 1 - forward.cpu)
    expect(reversed.pag).toBe(paths.length - 1 - forward.pag)
    expect(reversed.cpu).not.toBe(forward.cpu)
  })

  test("a header that dropped the Processor counter is DETECTED, not silently accepted", () => {
    // This is the deterministic half of the silent-drop defect (ISC-4.1). `typeperf`
    // omits a requested counter on ~21% of spawns with empty stderr and exit code 0;
    // the only signal is the missing field. Synthesised from the real header by
    // deleting exactly that field, because the drop cannot be triggered on demand.
    const paths = parseHeaderPaths(scalarHeader ?? "")
    const short = paths.filter((p) => !p.toLowerCase().includes("% processor time"))
    expect(short.length).toBe(paths.length - 1)

    const layout = classifyColumns(short)
    expect(layout.cpu).toBe(NO_COLUMN)
    // The other two must survive: a guard that fired on any short header would also
    // fire when the pagefile counter is legitimately absent, and that is a different
    // machine, not a defect.
    expect(layout.mem).not.toBe(NO_COLUMN)
    expect(layout.pag).not.toBe(NO_COLUMN)
  })
})

/**
 * The real defect, captured. `typeperf` dropped `Processor` from the header of a
 * three-counter child while still emitting its data in every sample row.
 *
 * These tests document what goes wrong rather than assert that the parser fixes it —
 * the parser *cannot* fix it, because a shifted column is indistinguishable from a
 * correct one by inspection. Detection belongs to `Win32StatsSource.acceptSampleWidth`,
 * and what makes it possible is the width disagreement asserted first.
 */
describe("the dropped-header defect, from a live capture", () => {
  const droppedHeader = lines(dropped).find(isHeaderLine)
  const droppedSample = lines(dropped).find((l) => !isHeaderLine(l))

  test("the header is one field short of the samples", () => {
    // The name-independent signal, and the whole basis of the width guard.
    const headerWidth = parseHeaderPaths(droppedHeader ?? "").length
    const sampleWidth = parseSampleValues(droppedSample ?? "").length
    expect(headerWidth).toBe(2)
    expect(sampleWidth).toBe(3)
    expect(sampleWidth).toBe(headerWidth + 1)
  })

  test("the dropped counter's data is still in the rows", () => {
    // Which is why the failure is misalignment and not absence. If typeperf omitted the
    // *values* too, path-matching would degrade safely to `N/A`.
    expect(parseSampleValues(droppedSample ?? "")).toEqual([39.317162, 92.581233, 4.385855])
  })

  test("name matching alone yields plausible, stable, WRONG values", () => {
    // The failure this documents: memory renders 39.3% when it is really 92.6%. Nothing
    // is NaN, nothing is missing, nothing logs. Asserted so that a future "simplify the
    // guards" change has to delete a test that spells out the consequence.
    const layout = classifyColumns(parseHeaderPaths(droppedHeader ?? ""))
    expect(layout.cpu).toBe(NO_COLUMN)

    const reduced = parseSampleLine(droppedSample ?? "", layout)
    expect(reduced.cpu).toBe(UNAVAILABLE)
    expect(reduced.mem).toBe(39.317162) // the CPU value, wearing memory's label
    expect(reduced.pag).toBe(92.581233) // the memory value, wearing the pagefile's
    // The true readings, for the record:
    expect(parseSampleValues(droppedSample ?? "")[1]).toBe(92.581233) // real memory
    expect(parseSampleValues(droppedSample ?? "")[2]).toBe(4.385855) // real pagefile
  })

  test("a GPU-column drop would pass name matching entirely", () => {
    // Why the width guard is the stronger of the two. Every scalar name is present, so
    // `acceptHeader` sees nothing wrong, while all 353 3D indices shift by one and the
    // summed GPU value is built from the wrong columns.
    const paths = parseHeaderPaths(fourHeader ?? "")
    const oneGpuGone = paths.filter(
      (p, i) => !(p.toLowerCase().includes("engtype_3d") && i === paths.length - 1),
    )
    const layout = classifyColumns(oneGpuGone)
    expect(layout.cpu).not.toBe(NO_COLUMN)
    expect(layout.mem).not.toBe(NO_COLUMN)
    expect(layout.pag).not.toBe(NO_COLUMN)
    expect(layout.gpu.length).toBe(paths.filter((p) => p.toLowerCase().includes("engtype_3d")).length - 1)
    // Nothing above is detectable by name. The width comparison is:
    expect(oneGpuGone.length).not.toBe(parseSampleValues(fourLines[2] ?? "").length)
  })
})

describe("sample values and the -1 sentinel", () => {
  test("real sample lines yield finite scalars", () => {
    const layout = classifyColumns(parseHeaderPaths(scalarHeader ?? ""))
    const samples = scalarLines.filter((l) => !isHeaderLine(l))
    expect(samples.length).toBeGreaterThan(0)

    for (const line of samples) {
      const reduced = parseSampleLine(line, layout)
      // Asserted against the sentinel, not with `Number.isFinite`: -1 is finite, so
      // `isFinite` passes on a completely unavailable reading. That weakness let a
      // truncated fixture line through on the first run of this test.
      expect(reduced.cpu).not.toBe(UNAVAILABLE)
      expect(reduced.cpu).toBeGreaterThanOrEqual(0)
      expect(reduced.mem).toBeGreaterThan(0)
      expect(reduced.mem).toBeLessThanOrEqual(100)
      expect(reduced.stampMs).not.toBeNull()
    }
  })

  test("a line truncated mid-field reduces to the sentinel, never to 0", () => {
    // Synthesised rather than captured: the ingest path buffers partial lines, so the
    // parser never sees one in production. The case is here because a stray one *did*
    // reach it once, via a fixture the capture script cut mid-line.
    const layout = classifyColumns(parseHeaderPaths(scalarHeader ?? ""))
    const reduced = parseSampleLine('"08/28/2026 15:33:32.124"', layout)
    expect(reduced.cpu).toBe(UNAVAILABLE)
    expect(reduced.mem).toBe(UNAVAILABLE)
    expect(reduced.pag).toBe(UNAVAILABLE)
  })

  test("the fixtures themselves end on a complete line", () => {
    // Guards the capture script's `trimToLastCompleteLine`. Without it a re-capture
    // silently reintroduces the truncated tail and the test above starts passing for
    // the wrong reason.
    for (const raw of [fourCounter, scalarOnly]) expect(raw.endsWith("\r\n")).toBe(true)
  })

  test('typeperf\'s " " for no-data becomes -1, never 0', () => {
    // The failure being designed out: a zero renders as a real reading of zero, i.e. an
    // idle machine, where -1 renders as "--".
    const values = parseSampleValues('"11:00:00.000"," ","42.0"')
    expect(Number.isNaN(values[0])).toBe(true)

    const layout = { cpu: 0, mem: 1, pag: NO_COLUMN, gpu: [] }
    const reduced = reduceSample(values, layout)
    expect(reduced.cpu).toBe(UNAVAILABLE)
    expect(reduced.cpu).not.toBe(0)
    expect(reduced.mem).toBe(42)
  })

  test("an absent column reads unavailable rather than reading its neighbour", () => {
    const reduced = reduceSample([1, 2], { cpu: 0, mem: 1, pag: NO_COLUMN, gpu: [] })
    expect(reduced.pag).toBe(UNAVAILABLE)
  })
})

describe("GPU reduction — sum, clamped to 100", () => {
  test("engines are summed, matching StatsService.cs:129-131", () => {
    // Not max and not mean: work spreads across engines, so a max under-reports a
    // loaded GPU and a mean under-reports it worse. Fidelity to the WPF original.
    const reduced = reduceSample([0, 10, 20, 30], { cpu: NO_COLUMN, mem: NO_COLUMN, pag: NO_COLUMN, gpu: [1, 2, 3] })
    expect(reduced.gpu).toBe(60)
    expect(reduced.gpuColumnsLive).toBe(3)
  })

  test("the sum is clamped at 100", () => {
    const reduced = reduceSample([0, 80, 80], { cpu: NO_COLUMN, mem: NO_COLUMN, pag: NO_COLUMN, gpu: [1, 2] })
    expect(reduced.gpu).toBe(100)
  })

  test("no GPU columns reads unavailable; all-zero columns reads a real zero", () => {
    // The distinction `gpuColumnsLive` exists for. Both would be "0" without it.
    const none = reduceSample([0], { cpu: NO_COLUMN, mem: NO_COLUMN, pag: NO_COLUMN, gpu: [] })
    expect(none.gpu).toBe(UNAVAILABLE)
    expect(none.gpuColumnsLive).toBe(0)

    const zeroed = reduceSample([0, 0, 0], { cpu: NO_COLUMN, mem: NO_COLUMN, pag: NO_COLUMN, gpu: [1, 2] })
    expect(zeroed.gpu).toBe(0)
    expect(zeroed.gpuColumnsLive).toBe(2)
  })

  test("a dead engine column is skipped, not counted as zero", () => {
    const reduced = reduceSample(
      [0, 25, Number.NaN],
      { cpu: NO_COLUMN, mem: NO_COLUMN, pag: NO_COLUMN, gpu: [1, 2] },
    )
    expect(reduced.gpu).toBe(25)
    expect(reduced.gpuColumnsLive).toBe(1)
  })
})

describe("instance names", () => {
  test("the instance is taken from the first ( to the last )", () => {
    expect(extractInstanceName("\\GPU Engine(pid_1_eng_0_engtype_3D)\\Utilization Percentage")).toBe(
      "pid_1_eng_0_engtype_3D",
    )
  })

  test("a name containing parentheses is not truncated", () => {
    expect(extractInstanceName("\\Obj(a(b)c)\\Counter")).toBe("a(b)c")
  })

  test("a path with no instance yields null", () => {
    expect(extractInstanceName("\\Memory\\% Committed Bytes In Use")).toBeNull()
  })

  test("real 3D instances are extracted and deduped from the fixture header", () => {
    const found = parse3dEngineInstances(fourCounter)
    expect(found.length).toBeGreaterThan(0)
    expect(new Set(found).size).toBe(found.length)
    for (const name of found) expect(name.toLowerCase()).toContain("engtype_3d")
  })
})

describe("timestamps", () => {
  test("column 0 parses to ms-of-day", () => {
    expect(parseSampleTimestampMs('"01:02:03.500","1.0"')).toBe(((1 * 60 + 2) * 60 + 3) * 1000 + 500)
  })

  test("real sample stamps are ~1s apart, read from typeperf's own clock", () => {
    // Not from arrival time: Node chunks stdout without regard to line boundaries, so
    // timing arrival made a perfectly-cadenced 1s stream read as jitter of
    // [1395, 665, 1027, 2619, 0, 449, 1026]ms.
    const stamps = scalarLines
      .filter((l) => !isHeaderLine(l))
      .map(parseSampleTimestampMs)
      .filter((v): v is number => v !== null)
    expect(stamps.length).toBeGreaterThanOrEqual(2)

    for (let i = 1; i < stamps.length; i++) {
      const gap = stampDeltaMs(stamps[i - 1] ?? 0, stamps[i] ?? 0)
      expect(gap).toBeGreaterThan(800)
      expect(gap).toBeLessThan(1_400)
    }
  })

  test("a midnight rollover reads as a small positive delta, not -86,399,000ms", () => {
    const beforeMidnight = 23 * 3_600_000 + 59 * 60_000 + 59_000
    const afterMidnight = 1_000
    expect(stampDeltaMs(beforeMidnight, afterMidnight)).toBe(2_000)
  })

  test("a 12-hour locale stamp maps onto the 24-hour clock", () => {
    expect(parseSampleTimestampMs('"12:00:00.000 AM"')).toBe(0)
    expect(parseSampleTimestampMs('"12:00:00.000 PM"')).toBe(12 * 3_600_000)
    expect(parseSampleTimestampMs('"01:00:00.000 PM"')).toBe(13 * 3_600_000)
  })

  test("an unparseable stamp yields null rather than 0", () => {
    // 0 is a valid ms-of-day (midnight), so collapsing a parse failure into it would
    // make one sample per day indistinguishable from a broken clock.
    expect(parseSampleTimestampMs('"not a time","1.0"')).toBeNull()
  })
})

describe("isHeaderLine", () => {
  test("distinguishes the real header from the real samples", () => {
    expect(fourLines.filter(isHeaderLine).length).toBe(1)
    expect(scalarLines.filter(isHeaderLine).length).toBe(1)
    expect(isHeaderLine('"11:00:00.000","1.0","2.0"')).toBe(false)
  })
})
