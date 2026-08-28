/**
 * Capture a real `typeperf` stream to a checked-in fixture, sanitized byte-exactly.
 *
 * The fixtures are what let the Windows telemetry parser be tested on macOS and Linux
 * (see `parse/typeperf.ts`), so they have to be faithful captures rather than
 * hand-written CSV. Two properties are load-bearing and both are easy to destroy:
 *
 *   - **CRLF line endings, verbatim.** `typeperf` emits a bare `\r` line before the
 *     header, and the parser splits on `/\r?\n/` precisely because of it. A fixture
 *     normalised to LF silently stops exercising that path. So the file is written
 *     from a Buffer, never through a text transform, and `.gitattributes` marks it
 *     `-text` so git does not normalise it on the way in or out.
 *   - **Byte-for-byte field widths.** Evidence recorded elsewhere cites exact lengths
 *     (a good 4-counter header is 40,020 chars; a header that dropped the Processor
 *     counter is 39,969). A substitution that changes any width invalidates the
 *     comparison, so the hostname is replaced with an **equal-length** placeholder and
 *     the script fails if the byte count moves.
 *
 * The hostname is replaced because this repository is public and PDH counter paths
 * embed the machine name in every one of several hundred fields. It is the only
 * identifying string in the output — pids and LUIDs are meaningless once the processes
 * are gone.
 *
 * Run: `bun scripts/capture-fixture.ts`
 */

import { spawn } from "node:child_process"
import { hostname } from "node:os"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { splitCsvLine } from "../src/main/telemetry/parse/typeperf.js"

const CPU = "\\Processor(_Total)\\% Processor Time"
const MEM = "\\Memory\\% Committed Bytes In Use"
const PAG = "\\Paging File(_Total)\\% Usage"
const GPU = "\\GPU Engine(*engtype_3D)\\Utilization Percentage"

const FIXTURE_DIR = join(import.meta.dirname, "..", "test", "fixtures")
/** Same length as this host's name, or the byte-width guard below will refuse it. */
const PLACEHOLDER_ALPHABET = "EXAMPLEHOSTNAMEPLACEHOLDER"

interface Capture {
  name: string
  counters: string[]
  samples: number
}

/**
 * How many times to re-capture when `typeperf` drops a counter from the header.
 *
 * Needed because the defect fires often enough to hit a capture: the first clean scalar
 * fixture written by this script was in fact a *dropped-header* capture — 2 declared
 * paths, 3 values per row — and it was only noticed because the parse tests failed on
 * it. A fixture named "typeperf-scalar" that quietly contains the defect is worse than
 * no fixture, because every test written against it encodes the broken shape as normal.
 *
 * The defect capture is valuable and IS checked in, deliberately, as
 * `typeperf-dropped-header.csv` — written by hand from a caught instance rather than by
 * this script, so a re-run cannot overwrite the good copy with a clean one.
 */
const MAX_CAPTURE_ATTEMPTS = 6

const CAPTURES: Capture[] = [
  { name: "typeperf-4counter.csv", counters: [CPU, MEM, PAG, GPU], samples: 4 },
  { name: "typeperf-scalar.csv", counters: [CPU, MEM, PAG], samples: 4 },
]

/** Raw stdout bytes until `samples` sample lines have arrived, then kill. */
function capture(counters: string[], samples: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("typeperf", [...counters, "-si", "1"], { windowsHide: true })
    const chunks: Buffer[] = []
    let lines = 0
    let settled = false

    proc.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
      // Counting on the raw bytes rather than a decoded string: a multi-byte character
      // split across two chunks would be mis-decoded, and the point is the bytes.
      for (const byte of chunk) if (byte === 0x0a) lines++
      // header + banner + blank + N samples, generously bounded
      if (lines >= samples + 3 && !settled) {
        settled = true
        proc.kill()
        resolve(Buffer.concat(chunks))
      }
    })
    proc.on("error", reject)
    proc.on("exit", () => {
      if (!settled) {
        settled = true
        resolve(Buffer.concat(chunks))
      }
    })
  })
}

const host = hostname()
if (host.length > PLACEHOLDER_ALPHABET.length) {
  console.error(`hostname "${host}" is longer than the placeholder alphabet — extend it`)
  process.exit(1)
}
const placeholder = PLACEHOLDER_ALPHABET.slice(0, host.length)

mkdirSync(FIXTURE_DIR, { recursive: true })

/**
 * Drop anything after the final CRLF.
 *
 * `capture()` kills `typeperf` the moment it has enough lines, which lands mid-line —
 * the first scalar fixture ended `"08/28/2026 15:33:32.124"` with no values. That is a
 * *pipe* artefact, not something the parser ever sees: the ingest path buffers partial
 * lines and only parses complete ones. Leaving it in makes the fixture assert a case
 * that cannot happen, and it fails confusingly — the truncated line reduces every
 * counter to -1, which looks like a sentinel bug rather than a capture bug.
 */
function trimToLastCompleteLine(buffer: Buffer): Buffer {
  const text = buffer.toString("latin1")
  const end = text.lastIndexOf("\r\n")
  return end === -1 ? buffer : Buffer.from(text.slice(0, end + 2), "latin1")
}

/**
 * Whether a capture is internally consistent: header width equals sample width, and
 * every counter asked for is present.
 *
 * The width comparison is the load-bearing half — it detects a drop without knowing
 * which counter vanished.
 */
function isSound(raw: Buffer, counters: string[]): string | null {
  const lines = raw
    .toString("latin1")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
  const header = lines.find((l) => l.includes("(PDH-CSV"))
  const sample = lines.find((l) => !l.includes("(PDH-CSV"))
  if (header === undefined || sample === undefined) return "no header or no sample line"

  const headerWidth = splitCsvLine(header).length - 1
  const sampleWidth = splitCsvLine(sample).length - 1
  if (headerWidth !== sampleWidth) {
    return `header declares ${headerWidth} counters but samples carry ${sampleWidth} values`
  }
  // Wildcards expand to many columns, so only the non-wildcard counters can be checked
  // by count; each is asserted present by its distinguishing leaf name.
  for (const counter of counters) {
    if (counter.includes("*")) continue
    const leaf = counter.slice(counter.lastIndexOf("\\") + 1).toLowerCase()
    if (!header.toLowerCase().includes(leaf)) return `header is missing "${leaf}"`
  }
  return null
}

for (const spec of CAPTURES) {
  // Annotated: `Buffer.alloc(0)` infers the narrower `Buffer<ArrayBuffer>`, which the
  // `Buffer<ArrayBufferLike>` coming back from the helpers is not assignable to.
  let raw: Buffer = Buffer.alloc(0)
  let problem: string | null = null
  for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt++) {
    raw = trimToLastCompleteLine(await capture(spec.counters, spec.samples))
    problem = isSound(raw, spec.counters)
    if (problem === null) break
    console.log(`${spec.name}: attempt ${attempt} unsound (${problem}) — re-capturing`)
  }
  if (problem !== null) {
    console.error(
      `${spec.name}: ${MAX_CAPTURE_ATTEMPTS} attempts all unsound (${problem}) — refusing to write`,
    )
    process.exit(1)
  }
  // Byte-exact substitution: split/join on the Buffer's latin1 view so no byte is
  // reinterpreted, and the equal-length placeholder keeps every offset where it was.
  const sanitized = Buffer.from(raw.toString("latin1").split(host).join(placeholder), "latin1")

  if (sanitized.length !== raw.length) {
    console.error(
      `${spec.name}: sanitizing changed the byte count ${raw.length}→${sanitized.length} — ` +
        `refusing to write a fixture whose field widths no longer match the capture`,
    )
    process.exit(1)
  }
  if (sanitized.includes(host)) {
    console.error(`${spec.name}: hostname still present after substitution — refusing to write`)
    process.exit(1)
  }

  const crlf = raw.toString("latin1").includes("\r\n")
  const target = join(FIXTURE_DIR, spec.name)
  writeFileSync(target, sanitized)
  console.log(
    `${spec.name}: ${sanitized.length} bytes, CRLF=${String(crlf)}, ` +
      `host "${host}" → "${placeholder}" (${String(raw.toString("latin1").split(host).length - 1)} sites)`,
  )
}

process.exit(0)
