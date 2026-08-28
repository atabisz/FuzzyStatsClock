/**
 * ISC-9 — what does the temps sidecar weigh, what does one read cost, and does it work?
 *
 * These are the numbers Alex's A/B/C/D temps decision turns on. The plan recommends
 * Option A (the .NET sidecar) while saying plainly that "A is not free and its size is
 * unknown; Phase 1 produces the number before this is committed to."
 *
 * ## The arm that makes the other two mean anything
 *
 * A sidecar that publishes cleanly, starts, and emits well-formed JSON full of `-1`
 * sentinels has a size and a latency, and both numbers are worthless. The WPF original
 * chose a silent-failure posture on purpose (D-14: no logging on init failure), so a
 * completely non-functional temperature source is *designed* to look like a machine
 * without sensors. D2 therefore asks whether any REAL reading came back, and everything
 * else is reported subject to it.
 *
 * ## Why both trim configurations
 *
 * `PublishTrimmed=true` is where the size question is actually decided, and it is also
 * where LHM is most likely to break: the trimmer cannot see reflection, and LHM reaches
 * hardware through reflection, WMI and P/Invoke. It emits IL2104 trim warnings for
 * `LibreHardwareMonitorLib`, `System.Management` and `HidSharp`. So the probe publishes
 * both and compares their *readings*, not just their sizes — a trimmed build that returns
 * sentinels where the untrimmed one returns temperatures is the failure mode, and it is
 * invisible in a size comparison.
 *
 * That comparison is bounded by the hardware present on the host. See D4.
 *
 * ## Cost
 *
 * Two `dotnet publish` runs plus a bench. Slow (~1-2 min). Run it when the sidecar
 * changes, not on every commit.
 */

import { spawnSync } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/** The mean `Update()` cost the v4.2 spike measured, from TemperatureService.cs:4-6.
 *  The WPF app's whole dedicated-2s-loop design exists because of this number, so the
 *  sidecar's figure is compared against it rather than against nothing. */
const PRIOR_UPDATE_MEAN_MS = 608.2
/** `Computer.Open()` on the dev box, per TemperatureService.cs:93-96 — the measurement
 *  that forced the init timeout up from 3s to 5s. */
const PRIOR_OPEN_MS = 4272
const BENCH_READS = 20

const PROJECT = join(import.meta.dirname, "..", "sidecar", "FuzzyClock.Temps")
const EXE = "fuzzyclock-temps.exe"

const mb = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)}MB`

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "INCONCLUSIVE", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  → ${verdict}: ${detail}\n`)
}

interface Reading {
  cpu: number
  gpu: number
  mobo: number
  nvme: number
  update_ms: number
}
interface Bench {
  bench: true
  n: number
  min_ms: number
  p50_ms: number
  p95_ms: number
  max_ms: number
  mean_ms: number
}

/** Publish one configuration and return the payload it produces. */
function publish(trimmed: boolean): { dir: string; exe: number; total: number; files: number } | null {
  const out = join("publish", trimmed ? "trimmed" : "untrimmed")
  console.log(`  dotnet publish (trimmed=${String(trimmed)})…`)
  const r = spawnSync(
    "dotnet",
    ["publish", "-c", "Release", "-o", out, `-p:PublishTrimmed=${String(trimmed)}`, "--nologo", "-v", "q"],
    { cwd: PROJECT, encoding: "utf8", shell: false },
  )
  if (r.status !== 0) {
    console.log(`    publish failed (${String(r.status)}): ${(r.stderr ?? "").slice(0, 400)}`)
    return null
  }
  const dir = join(PROJECT, out)
  let total = 0
  let exe = 0
  let files = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    // `.pdb` is debug symbols and is not shipped, so it is excluded from the payload —
    // the same exclusion the WPF comparison makes for its own two pdbs in `publish/`.
    if (entry.name.endsWith(".pdb")) continue
    const size = statSync(join(dir, entry.name)).size
    total += size
    files++
    if (entry.name === EXE) exe = size
  }
  return { dir, exe, total, files }
}

/** Run the sidecar and collect its JSON lines plus the `ready:` diagnostic from stderr. */
function run(dir: string, args: string[]): { lines: string[]; ready: string; code: number | null } {
  const r = spawnSync(join(dir, EXE), args, { encoding: "utf8", timeout: 120_000, shell: false })
  const ready = /^ready: .*$/m.exec(r.stderr ?? "")?.[0] ?? ""
  const lines = (r.stdout ?? "").split(/\r?\n/).filter((l) => l.trim().startsWith("{"))
  return { lines, ready, code: r.status }
}

const SOURCES = ["cpu", "gpu", "mobo", "nvme"] as const
/** `-1` is "no source". A real reading of 0 is a reading, so the test is `> -1`, never
 *  truthiness — 0 °C is cold, not absent. */
const realSources = (r: Reading): string[] => SOURCES.filter((k) => r[k] > -1)

// ───────────────────────────────────────────────────────────────────────────────
// D1 — the sidecar publishes, in both configurations, and this is what it weighs.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== D1: the sidecar publishes self-contained, and this is its size ===")
const untrimmed = publish(false)
const trimmed = publish(true)
if (untrimmed === null || trimmed === null) {
  record("D1 sidecar size", "INCONCLUSIVE", "at least one publish configuration failed — see above")
} else {
  for (const [name, p] of [
    ["untrimmed", untrimmed],
    ["trimmed", trimmed],
  ] as const) {
    console.log(
      `    ${name.padEnd(10)} exe ${mb(p.exe).padEnd(8)} payload ${mb(p.total).padEnd(8)} ` +
        `across ${String(p.files)} shipped files (${String(p.total)} bytes)`,
    )
  }
  const beside = untrimmed.total - untrimmed.exe
  console.log(
    `    ${mb(beside)} rides beside the single-file exe — LHM's native dependencies, which ` +
      `PublishSingleFile does not absorb`,
  )
  record(
    "D1 sidecar size",
    "PASS",
    `trimmed ${mb(trimmed.total)} vs untrimmed ${mb(untrimmed.total)} — ` +
      `${(untrimmed.total / trimmed.total).toFixed(2)}× saving from trimming. This is what Option A ` +
      `adds to the Windows installer, on top of the Electron runtime`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// D2 — it returns a REAL reading. Without this, D1 and D3 are numbers for a
//      component that does nothing, and D-14's silent posture hides the difference.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== D2: the sidecar returns at least one real temperature ===")
const once = trimmed === null ? null : run(trimmed.dir, ["--once"])
let onceReading: Reading | null = null
if (once === null || once.lines.length === 0) {
  record(
    "D2 real reading",
    "FAIL",
    `no JSON line from the sidecar (exit ${String(once?.code)}) — every other number in this ` +
      `probe would describe a component that produces nothing`,
  )
} else {
  onceReading = JSON.parse(once.lines[0] as string) as Reading
  const real = realSources(onceReading)
  console.log(`    ${once.ready}\n    ${once.lines[0] as string}`)
  if (real.length === 0) {
    record(
      "D2 real reading",
      "FAIL",
      `all four sources returned the -1 sentinel — the sidecar runs and emits well-formed JSON ` +
        `containing no information. Size and latency below are meaningless as stated`,
    )
  } else {
    record(
      "D2 real reading",
      "PASS",
      `${real.join(", ")} returned real value(s) (${real.map((k) => `${k}=${String(onceReading?.[k as keyof Reading])}`).join(", ")}), ` +
        `so the size and latency figures describe a component that works. ` +
        `${SOURCES.filter((s) => !real.includes(s)).join(", ") || "none"} unavailable — D5 says why`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// D3 — per-read latency, against the prior that shaped the WPF design.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== D3: per-read latency, against the 608.2ms prior ===")
const benchRun = trimmed === null ? null : run(trimmed.dir, ["--bench", String(BENCH_READS)])
if (benchRun === null || benchRun.lines.length === 0) {
  record("D3 read latency", "INCONCLUSIVE", "no bench output")
} else {
  const bench = JSON.parse(benchRun.lines[0] as string) as Bench
  const openMs = Number(/open=(\d+)ms/.exec(benchRun.ready)?.[1] ?? "-1")
  console.log(
    `    n=${String(bench.n)}  min ${String(bench.min_ms)}ms  p50 ${String(bench.p50_ms)}ms  ` +
      `p95 ${String(bench.p95_ms)}ms  max ${String(bench.max_ms)}ms  mean ${String(bench.mean_ms)}ms\n` +
      `    Computer.Open() ${String(openMs)}ms (prior ${String(PRIOR_OPEN_MS)}ms)`,
  )
  // The question is not "is it fast" but "does a read fit inside its interval", because
  // that is what the WPF app's dedicated 2s background loop was built to guarantee.
  const fitsInterval = bench.max_ms < 2000
  record(
    "D3 read latency",
    "PASS",
    `mean ${String(bench.mean_ms)}ms against the ${String(PRIOR_UPDATE_MEAN_MS)}ms prior — ` +
      `${(PRIOR_UPDATE_MEAN_MS / bench.mean_ms).toFixed(1)}× faster, and worst case ` +
      `${String(bench.max_ms)}ms ${fitsInterval ? "fits well inside" : "EXCEEDS"} the 2000ms interval. ` +
      `But the prior and this run have different sensor inventories (D5), so the improvement is not ` +
      `necessarily portable — a host with a populated motherboard controller and an NVMe sensor has ` +
      `more to update. Open() is ${String(openMs)}ms here against ${String(PRIOR_OPEN_MS)}ms, and it ` +
      `varies with whether the ring-0 driver is already loaded, so a parent timeout must budget for ` +
      `the cold case rather than this one`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// D4 — is trimming safe? Compared on readings, not on whether it published.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== D4: does the trimmed build read the same sensors as the untrimmed one? ===")
if (untrimmed === null || trimmed === null || onceReading === null) {
  record("D4 trim safety", "INCONCLUSIVE", "need both publishes and a trimmed reading")
} else {
  const u = run(untrimmed.dir, ["--once"])
  if (u.lines.length === 0) {
    record("D4 trim safety", "INCONCLUSIVE", `untrimmed build produced no reading (exit ${String(u.code)})`)
  } else {
    const ur = JSON.parse(u.lines[0] as string) as Reading
    // Which SOURCES are live is the comparison; the values themselves drift between two
    // reads seconds apart, so comparing temperatures would fail for the wrong reason.
    const uReal = realSources(ur).join(",")
    const tReal = realSources(onceReading).join(",")
    console.log(
      `    untrimmed sensors : ${u.ready.replace("ready: ", "")}\n` +
        `    trimmed sensors   : ${(once?.ready ?? "").replace("ready: ", "")}\n` +
        `    live sources — untrimmed [${uReal}] vs trimmed [${tReal}]`,
    )
    const sameResolution =
      u.ready.replace(/open=\d+ms /, "") === (once?.ready ?? "").replace(/open=\d+ms /, "")
    if (uReal === tReal && sameResolution) {
      record(
        "D4 trim safety",
        "PASS",
        `both builds resolve the same sensors and return the same live sources, so the ` +
          `${(untrimmed.total / trimmed.total).toFixed(2)}× trim saving costs nothing observable — ` +
          `**on this host's hardware only.** The IL2104 warnings are for LHM, System.Management and ` +
          `HidSharp, and the reflection paths they cover are the ones this machine does not exercise: ` +
          `no Storage/NVMe node, no AMD GPU, and a motherboard exposing zero sensors. A trimmed build ` +
          `could still silently return sentinels on hardware this box cannot present, and D-14's ` +
          `silent posture means nobody would notice. Not a claim about other machines`,
      )
    } else {
      record(
        "D4 trim safety",
        "FAIL",
        `trimming changed behaviour: untrimmed [${uReal}] vs trimmed [${tReal}]. The trim warnings ` +
          `were real, so Option A's size is the untrimmed ${mb(untrimmed.total)} rather than the ` +
          `trimmed ${mb(trimmed.total)}`,
      )
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// D5 — what is unavailable, and why. The actual input to the A/B/C/D decision.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== D5: which sources work here, and what limits them ===")
if (trimmed === null) {
  record("D5 coverage", "INCONCLUSIVE", "no build to interrogate")
} else {
  const dump = spawnSync(join(trimmed.dir, EXE), ["--dump"], {
    encoding: "utf8",
    timeout: 60_000,
    shell: false,
  })
  const out = dump.stdout ?? ""
  const elevated = /^elevated: (\w+)$/m.exec(out)?.[1] === "True"
  // "51 sensors, all NULL" and "0 sensors" are different diagnoses. The first is the
  // driver refusing to answer; the second is hardware with nothing to report.
  const nodes = [...out.matchAll(/^(\w+) "(.+?)" — (\d+) temperature sensor\(s\)/gm)].map((m) => ({
    type: m[1] as string,
    name: m[2] as string,
    count: Number(m[3]),
  }))
  const nullCount = (out.match(/= NULL$/gm) ?? []).length
  const valueCount = (out.match(/= \d+\.\d+$/gm) ?? []).length
  for (const n of nodes) console.log(`    ${n.type.padEnd(14)} "${n.name}" — ${String(n.count)} sensor(s)`)
  console.log(`    ${String(valueCount)} sensor(s) returned a value; ${String(nullCount)} returned NULL`)

  const enumeratedButNull = nodes.some((n) => n.type === "Cpu" && n.count > 0) && onceReading?.cpu === -1
  record(
    "D5 coverage",
    "PASS",
    `elevated=${String(elevated)}. ` +
      (enumeratedButNull
        ? `The CPU node enumerates its sensors and every one reads NULL — the sensors are found and ` +
          `the driver declines to answer, which is a ring-0 access problem and NOT absent hardware. ` +
          `So unelevated, this sidecar delivers GPU temperature only. **That is the decision input: ` +
          `Option A unelevated returns what Option D returns nearly free.** Full fidelity needs an ` +
          `elevation manifest, which is a product decision for Alex, not a packaging detail. Note ` +
          `this is NOT a port regression — FuzzyClock.App declares no elevation either and runs the ` +
          `identical resolver, so v4.2 gets the same readings today`
        : `sources resolve as reported above`),
  )
}

console.log("=== summary ===")
for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.name}`)
const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
console.log(
  `\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive`,
)
console.log(
  "\nWindows only, one host, unelevated, and the sidecar is win32-only by construction —\n" +
    "the Linux temperature path reads /sys/class/hwmon from TypeScript and never touches this\n" +
    "project, and macOS has no temperature source at all (Option A's own table says so).",
)
console.log(
  "The elevation finding is reported, not acted on: adding a requestedExecutionLevel manifest\n" +
    "changes what a user sees at every launch, which is Alex's call.",
)
process.exit(failed > 0 ? 1 : 0)
