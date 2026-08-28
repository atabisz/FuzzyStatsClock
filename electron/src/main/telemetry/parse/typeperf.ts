/**
 * Pure parser for `typeperf` CSV output.
 *
 * Nothing here spawns a process, reads a file, or imports Electron. That is the
 * point: the Windows telemetry path is exercised against captured fixtures on any
 * OS, and only *acquisition* needs a real Windows box. The same rule applies to
 * the macOS and Linux parsers beside it — it is what makes a three-platform port
 * testable from one machine.
 *
 * `typeperf` emits a header line naming every counter path, then one line per
 * sample. Every field is quoted. Column 0 of both lines is the timestamp (or, in
 * the header, the PDH-CSV version and timezone banner) and is not a counter.
 */

import { UNAVAILABLE } from "../../../shared.js"

/**
 * Split one CSV line into fields, honouring quotes.
 *
 * Written rather than string-split on `","` because PDH instance names are
 * attacker-free but not comma-free in principle, and a header path like
 * `\GPU Engine(luid_0x...engtype_3D)\Utilization Percentage` is exactly the shape
 * where a naive split silently shifts every subsequent column by one. A shifted
 * column does not throw — it reports the memory counter's value as the GPU's.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // A doubled quote inside a quoted field is one literal quote.
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

/** Counter paths from a header line, with the timestamp/banner column dropped. */
export function parseHeaderPaths(line: string): string[] {
  return splitCsvLine(line).slice(1)
}

/**
 * Which columns feed which metric.
 *
 * GPU is an array because the counter is requested as a wildcard
 * (`\GPU Engine(*engtype_3D)\Utilization Percentage`) and PDH expands it to one
 * column per graphics engine.
 */
export interface CounterLayout {
  cpu: number
  mem: number
  pag: number
  gpu: number[]
}

export const NO_COLUMN = -1

/**
 * Map counter paths to metric slots by matching on the path text.
 *
 * Positional assumptions are avoided on purpose: PDH does not promise to preserve
 * the order counters were requested in once a wildcard is expanded, and it does
 * not promise how many columns a wildcard yields. Matching on the path is the only
 * thing the output actually guarantees.
 */
export function classifyColumns(paths: string[]): CounterLayout {
  const layout: CounterLayout = { cpu: NO_COLUMN, mem: NO_COLUMN, pag: NO_COLUMN, gpu: [] }

  paths.forEach((path, index) => {
    const p = path.toLowerCase()
    if (p.includes("engtype_3d")) {
      layout.gpu.push(index)
    } else if (p.includes("% processor time")) {
      layout.cpu = index
    } else if (p.includes("% committed bytes in use")) {
      layout.mem = index
    } else if (p.includes("% usage")) {
      layout.pag = index
    }
  })

  return layout
}

/**
 * Numeric values from a sample line, timestamp column dropped.
 *
 * `NaN` for anything unparseable, which the caller turns into the unavailable
 * sentinel. `typeperf` writes `" "` — a single space — for a counter that had no
 * data for an interval, and `parseFloat(" ")` is `NaN`, so that case arrives here
 * already distinguishable from a real zero. **It must never become `0`**: a zero
 * renders as an idle machine.
 */
export function parseSampleValues(line: string): number[] {
  return splitCsvLine(line)
    .slice(1)
    .map((field) => {
      const trimmed = field.trim()
      if (trimmed === "") return Number.NaN
      return Number.parseFloat(trimmed)
    })
}

/** Whether a line looks like a header rather than a sample. */
export function isHeaderLine(line: string): boolean {
  return line.includes("(PDH-CSV")
}

/**
 * Column 0 of a sample line as milliseconds since midnight, or `null`.
 *
 * `typeperf` stamps every sample from its own clock. That stamp is the only true
 * record of when a counter was read: Node delivers stdout in chunks that do not
 * align to line boundaries, so two samples can be parsed microseconds apart and a
 * third can appear to arrive 2.6s late. Timing sample *arrival* measures the pipe,
 * not the sampler — which is how a perfectly-cadenced 1s stream reads as jitter of
 * `[1395, 665, 1027, 2619, 0, 449, 1026]ms`.
 *
 * Only the time-of-day is parsed, never the date: the date half is written in the
 * host's locale order (`MM/DD` vs `DD/MM`) and misreading it silently is worse than
 * not reading it. Time-of-day plus a midnight-wrap correction is enough for the two
 * things this is for — sample cadence and staleness.
 *
 * Returns ms-of-day so a caller compares two stamps by subtraction; see
 * `stampDeltaMs` for the wrap handling.
 */
export function parseSampleTimestampMs(line: string): number | null {
  const stamp = splitCsvLine(line)[0]
  if (stamp === undefined) return null

  const match = /(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\s*(AM|PM)?/i.exec(stamp)
  if (!match) return null

  let hours = Number.parseInt(match[1] ?? "", 10)
  const minutes = Number.parseInt(match[2] ?? "", 10)
  const seconds = Number.parseInt(match[3] ?? "", 10)
  const fraction = (match[4] ?? "").padEnd(3, "0")
  const meridiem = match[5]?.toUpperCase()

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null

  // A 12-hour locale is unlikely for typeperf but costs one branch to survive.
  if (meridiem === "PM" && hours < 12) hours += 12
  if (meridiem === "AM" && hours === 12) hours = 0

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number.parseInt(fraction, 10)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Elapsed ms between two ms-of-day stamps, correcting for a midnight rollover.
 *
 * A negative raw delta can only mean the clock wrapped, because samples arrive in
 * order. Without this an overlay left running overnight reports one sample as
 * -86,399,000ms old and any staleness check built on it fires exactly once a day.
 */
export function stampDeltaMs(earlier: number, later: number): number {
  const delta = later - earlier
  return delta < 0 ? delta + MS_PER_DAY : delta
}

/**
 * Instance names from a counter path, e.g. the `pid_1234_..._engtype_3D` inside
 * `\GPU Engine(pid_1234_luid_..._engtype_3D)\Utilization Percentage`.
 *
 * Used two ways: to read what a running child actually bound to (from its header),
 * and to read what PDH would resolve *right now* (from `typeperf -qx` output). The
 * difference between those two sets is the spawn-time-binding defect, stated as a
 * set difference rather than as a symptom.
 *
 * Takes the text between the first `(` and the last `)` so an instance name
 * containing parentheses does not truncate.
 */
export function extractInstanceName(path: string): string | null {
  const open = path.indexOf("(")
  const close = path.lastIndexOf(")")
  if (open === NO_COLUMN || close <= open) return null
  return path.slice(open + 1, close)
}

/**
 * 3D-engine instance names out of `typeperf -qx "\GPU Engine"` output.
 *
 * One counter path per line, every instance crossed with every counter under the
 * object — so the same instance appears many times and the result is deduped.
 */
export function parse3dEngineInstances(output: string): string[] {
  const found = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.toLowerCase().includes("engtype_3d")) continue
    const instance = extractInstanceName(trimmed)
    if (instance) found.add(instance)
  }
  return [...found].sort()
}

export interface ReducedSample {
  cpu: number
  mem: number
  pag: number
  gpu: number
  /** How many GPU engine columns contributed a finite value this sample. */
  gpuColumnsLive: number
  /** `typeperf`'s own stamp as ms-of-day, or `null` if it did not parse. */
  stampMs: number | null
}

function readColumn(values: number[], index: number): number {
  if (index === NO_COLUMN) return UNAVAILABLE
  const raw = values[index]
  if (raw === undefined || !Number.isFinite(raw)) return UNAVAILABLE
  return raw
}

/**
 * Collapse one sample's columns into the four Windows metrics.
 *
 * GPU is **the sum of every 3D engine, clamped to 100** — not the maximum, and not
 * an average. That is what `FuzzyClock.App/StatsService.cs:129-131` does
 * (`Math.Min(_gpuCounters.Sum(c => c.NextValue()), 100f)`), and matching it is a
 * fidelity requirement rather than a design choice: work is spread across engines,
 * so a max under-reports a loaded GPU and an average under-reports it worse.
 *
 * `gpuColumnsLive` is carried out separately because "every engine read zero" and
 * "no engine columns existed" are different failures with different fixes, and the
 * summed value cannot tell them apart.
 */
export function reduceSample(
  values: number[],
  layout: CounterLayout,
  stampMs: number | null = null,
): ReducedSample {
  let gpuSum = 0
  let gpuColumnsLive = 0

  for (const index of layout.gpu) {
    const raw = values[index]
    if (raw !== undefined && Number.isFinite(raw)) {
      gpuSum += raw
      gpuColumnsLive++
    }
  }

  return {
    cpu: readColumn(values, layout.cpu),
    mem: readColumn(values, layout.mem),
    pag: readColumn(values, layout.pag),
    gpu: layout.gpu.length === 0 ? UNAVAILABLE : Math.min(gpuSum, 100),
    gpuColumnsLive,
    stampMs,
  }
}

/**
 * One sample line straight to a reduced sample.
 *
 * Exists so the stamp and the values are read from the *same* line by construction.
 * Passing them separately invited a caller to reduce line N's values with line
 * N-1's stamp — a bug that produces plausible numbers and a quietly wrong cadence.
 */
export function parseSampleLine(line: string, layout: CounterLayout): ReducedSample {
  return reduceSample(parseSampleValues(line), layout, parseSampleTimestampMs(line))
}
