/**
 * ISC-6 — the go/no-go. What does the Electron overlay cost, against the WPF original?
 *
 * A prior session measured the WPF Release build at 24.2% of one core / 326.5MB WS from
 * `TotalProcessorTime` deltas over 20s. This probe does **not** trust that figure: it
 * measures both builds itself, with one instrument, back to back, on the same host.
 * The ISA requires "the identical probe shape that produced the WPF figure, or the
 * comparison is rigged" — measuring both sides here is strictly stronger than asserting
 * two runs had the same shape, and it means the prior number is a cross-check rather
 * than a dependency.
 *
 * The claim is allowed to fail. If Electron is not cheaper, the port stops pending
 * Alex's call (AC-4).
 *
 * ## What makes this comparison fair rather than favourable
 *
 * **Whole process tree, both sides.** WPF is one process; Electron is 4+ plus two
 * `typeperf` children and their conhosts. Measuring `electron.exe` alone would drop the
 * renderer, which is the part that draws.
 *
 * **A window longer than the workload's period.** The Electron source recycles its GPU
 * counter child every 30s, and that respawn — re-expanding a 354-instance wildcard — is
 * the single most expensive thing it does. A 20s window can miss it entirely and report
 * roughly half the true cost. Measured: a run that caught one recycle attributed 2.078s
 * of 3.70 total CPU-seconds to the replacement child. So the window is 70s, which
 * guarantees at least two recycles, and the count is reported.
 *
 * **Steady state, with the startup transient reported separately rather than hidden.**
 * Electron's first seconds are JIT, snapshot load and GPU init; WPF's are JIT and XAML
 * parse. Both are real costs the user pays once, and both are printed on their own line.
 *
 * **Paints are counted.** A renderer Chromium thinks is occluded stops rendering and
 * becomes very cheap, and a `dist/dist/index.html` typo yields a transparent window that
 * costs almost nothing — that happened, and only the paint counter caught it. A window
 * that did not draw is INCONCLUSIVE, never PASS.
 *
 * **The arithmetic is positive-controlled.** A1 measures a deliberate spin loop and
 * requires ~100% of one core. Without it, a plumbing fault returning near-zero CPU for
 * everything would present as a spectacular result.
 *
 * ## What this probe does NOT resolve
 *
 * **The memory half of ISC-6.** There is no single true RSS for a multi-process tree:
 * summing working sets double-counts shared pages (upper bound), summing private
 * working sets omits resident shared ones (lower bound). Both bounds are printed and
 * the comparison is interval-against-interval; when they overlap, the answer is
 * INDETERMINATE and is reported as such. **The pass/fail gate is therefore CPU alone**,
 * stated in the verdict rather than implied — a PASS here is not a claim about memory.
 *
 * ## Two asymmetries that remain, stated because they cut opposite ways
 *
 * **Against Electron:** it repaints every 1s, where Alex's live WPF settings sample
 * every 3s. Electron is doing three times the update work per unit time.
 *
 * **For Electron:** the WPF build polls LibreHardwareMonitor for temperatures
 * (`TempsLineVisible: true` in his settings) and Electron has no temperature source
 * yet — that is ISC-9, still undecided. So some part of WPF's cost buys a feature
 * Electron does not have. This probe cannot separate it without editing his live
 * settings, which it will not do. It is reported as a bound on the margin, and it is
 * why an ISC-6 PASS is conditional on ISC-9 rather than final.
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { spawnElectron } from "./lib/electron-launch.js"

/** The prior session's figures. Cross-checked here, not depended on. */
const PRIOR_WPF_CPU_PCT = 24.2
const PRIOR_WPF_WS_MB = 326.5

/** Longer than two GPU-child recycle periods (30s), so the window cannot alias them. */
const MEASURE_SEC = 70
const SETTLE_SEC = 15
/** A 1s repaint over the window should paint about this often. */
const MIN_PAINTS = Math.floor(MEASURE_SEC * 0.7)

const SAMPLER = join(import.meta.dirname, "proc-sampler.ps1")
const ELECTRON_MAIN = join(import.meta.dirname, "..", "dist", "main.js")
const WPF_EXE = join(
  import.meta.dirname,
  "..",
  "..",
  "FuzzyClock.App",
  "bin",
  "Release",
  "net10.0-windows",
  "FuzzyClock.exe",
)

interface Row {
  pid: number
  name: string
  cpu: number
  ws: number
  pv: number
  wsp: number
}
interface Sample {
  t: string
  rows: Row[]
}

function sampleTree(rootPid: number, durationSec: number): Promise<Sample[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        SAMPLER,
        "-RootPid",
        String(rootPid),
        "-DurationSec",
        String(durationSec),
      ],
      { windowsHide: true },
    )

    const collected: Sample[] = []
    let buffer = ""
    let errors = ""

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString()
      // Keep the trailing partial: a several-hundred-byte JSON line split across two
      // chunks is the default case here, not an edge one.
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === "") continue
        try {
          collected.push(JSON.parse(trimmed) as Sample)
        } catch {
          errors += `unparseable sampler line: ${trimmed.slice(0, 120)}\n`
        }
      }
    })
    proc.stderr.on("data", (chunk: Buffer) => {
      errors += chunk.toString()
    })
    proc.on("error", reject)
    proc.on("exit", () => {
      if (errors !== "") console.log(`  sampler stderr:\n${errors.trimEnd()}`)
      resolve(collected)
    })
  })
}

interface Usage {
  cpuSeconds: number
  elapsedSec: number
  cpuPctOfOneCore: number
  /** Sum of full working sets. Double-counts pages shared between processes. */
  wsMb: number
  /** Sum of private working sets. No double counting; -1 if the perf class failed. */
  wspMb: number
  perProcess: { pid: number; name: string; cpuSeconds: number; appearedMidWindow: boolean }[]
  processCount: number
  /** Processes that started inside the window — for Electron, the counter recycles. */
  midWindowStarts: number
}

/**
 * Fold a sample series into one usage figure.
 *
 * The per-pid bookkeeping is the load-bearing part. A pid present in the first sample
 * contributes `last - first`. A pid that appeared *during* the window contributes its
 * **entire** CPU time, because it started inside the window and all of it belongs
 * there. Without that second rule the GPU child's 30s recycle silently discards the
 * cost of every replacement it spawns — which was measured at 56% of the total.
 */
function fold(samples: Sample[]): Usage {
  const empty: Usage = {
    cpuSeconds: 0,
    elapsedSec: 0,
    cpuPctOfOneCore: 0,
    wsMb: 0,
    wspMb: 0,
    perProcess: [],
    processCount: 0,
    midWindowStarts: 0,
  }
  if (samples.length < 2) return empty

  const first = samples[0] as Sample
  const last = samples[samples.length - 1] as Sample
  const elapsedSec = (Date.parse(last.t) - Date.parse(first.t)) / 1_000

  const atStart = new Set(first.rows.map((r) => r.pid))
  const firstSeen = new Map<number, Row>()
  const lastSeen = new Map<number, Row>()
  for (const sample of samples) {
    for (const row of sample.rows) {
      if (!firstSeen.has(row.pid)) firstSeen.set(row.pid, row)
      lastSeen.set(row.pid, row)
    }
  }

  let cpuSeconds = 0
  let midWindowStarts = 0
  const perProcess: Usage["perProcess"] = []
  for (const [pid, lastRow] of lastSeen) {
    const firstRow = firstSeen.get(pid) as Row
    const appearedMidWindow = !atStart.has(pid)
    if (appearedMidWindow) midWindowStarts++
    const contribution = appearedMidWindow ? lastRow.cpu : lastRow.cpu - firstRow.cpu
    cpuSeconds += contribution
    perProcess.push({ pid, name: lastRow.name, cpuSeconds: contribution, appearedMidWindow })
  }
  perProcess.sort((a, b) => b.cpuSeconds - a.cpuSeconds)

  // Memory at the end of the window over the processes alive then. A peak or a mean
  // across a recycling tree would count a replaced child twice.
  const wsBytes = last.rows.reduce((sum, r) => sum + r.ws, 0)
  const anyPrivateMissing = last.rows.some((r) => r.wsp < 0)
  const wspBytes = last.rows.reduce((sum, r) => sum + Math.max(0, r.wsp), 0)

  return {
    cpuSeconds,
    elapsedSec,
    cpuPctOfOneCore: elapsedSec > 0 ? (cpuSeconds / elapsedSec) * 100 : 0,
    wsMb: wsBytes / 1_048_576,
    wspMb: anyPrivateMissing ? -1 : wspBytes / 1_048_576,
    perProcess,
    processCount: last.rows.length,
    midWindowStarts,
  }
}

function reportUsage(label: string, usage: Usage, samples: number): void {
  console.log(
    `\n  ${label}\n` +
      `    processes         : ${String(usage.processCount)}` +
      `${usage.midWindowStarts > 0 ? ` (+${String(usage.midWindowStarts)} started mid-window)` : ""}\n` +
      `    window            : ${usage.elapsedSec.toFixed(1)}s, ${String(samples)} samples\n` +
      `    CPU               : ${usage.cpuSeconds.toFixed(2)} CPU-seconds → ` +
      `${usage.cpuPctOfOneCore.toFixed(2)}% of one core\n` +
      `    memory sum WS     : ${usage.wsMb.toFixed(1)}MB\n` +
      `    memory sum priv WS: ${usage.wspMb < 0 ? "unavailable" : `${usage.wspMb.toFixed(1)}MB`}`,
  )
  console.log("    per-process:")
  for (const p of usage.perProcess) {
    if (p.cpuSeconds <= 0 && !p.appearedMidWindow) continue
    console.log(
      `      ${p.name.padEnd(14)} pid ${String(p.pid).padEnd(7)} ${p.cpuSeconds.toFixed(3)}s` +
        `${p.appearedMidWindow ? "  (started mid-window)" : ""}`,
    )
  }

  // The decomposition that matters for Phase 6. Processes that started inside the window
  // are, for the Electron tree, the GPU counter child's recycle replacements and their
  // conhosts. Separating them says how much of the cost is the *app* and how much is one
  // tunable interval — a distinction invisible in the total.
  const respawn = usage.perProcess
    .filter((p) => p.appearedMidWindow)
    .reduce((sum, p) => sum + p.cpuSeconds, 0)
  const resident = usage.cpuSeconds - respawn
  if (usage.midWindowStarts > 0 && usage.cpuSeconds > 0) {
    console.log(
      `    decomposition     : ${resident.toFixed(2)}s resident + ${respawn.toFixed(2)}s respawns ` +
        `= ${((respawn / usage.cpuSeconds) * 100).toFixed(0)}% of CPU spent on processes that ` +
        `started mid-window`,
    )
  }
}

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "INCONCLUSIVE", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  → ${verdict}: ${detail}\n`)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Kill a tree. Windows does not reap descendants when the root dies. */
function killTree(pid: number): void {
  spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true })
}

// ───────────────────────────────────────────────────────────────────────────────
// A1 — positive control: does this instrument detect a process that IS busy?
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A1: positive control — a spin loop must read as ~100% of one core ===")
{
  const spin = spawn(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", "$x=0; while($true){$x++}"],
    { windowsHide: true },
  )
  await sleep(1_500)
  // 20s, not 8: the first `Win32_Process` CIM query in a fresh PowerShell costs several
  // seconds of WMI warm-up, and an 8s budget spent most of itself on it — the control
  // came back with the bare minimum of 2 samples. The percentage was still right (it is
  // derived from the sampler's clock, not the sample count), but a positive control
  // running on the minimum viable sample count is not much of a control.
  const samples = await sampleTree(spin.pid ?? 0, 20)
  const usage = fold(samples)
  spin.kill()
  if (spin.pid !== undefined) killTree(spin.pid)

  console.log(
    `  ${String(samples.length)} samples over ${usage.elapsedSec.toFixed(1)}s, ` +
      `${usage.cpuSeconds.toFixed(2)} CPU-seconds → ${usage.cpuPctOfOneCore.toFixed(1)}% of one core`,
  )
  if (samples.length < 2) {
    record("A1 positive control", "INCONCLUSIVE", "sampler produced fewer than 2 samples")
  } else if (usage.cpuPctOfOneCore < 80) {
    record(
      "A1 positive control",
      "FAIL",
      `a busy-wait read as ${usage.cpuPctOfOneCore.toFixed(1)}% of one core — the instrument ` +
        `undercounts, so every figure below is suspect`,
    )
  } else {
    record(
      "A1 positive control",
      "PASS",
      `busy-wait measured ${usage.cpuPctOfOneCore.toFixed(1)}% of one core — the CPU-delta ` +
        `arithmetic and the sampler both work`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A2 — the Electron overlay at steady state.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A2: Electron overlay, steady state ===")
let electronUsage: Usage | null = null
{
  const app = spawnElectron(ELECTRON_MAIN)
  let out = ""
  let appErr = ""
  app.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString()
  })
  app.stderr.on("data", (chunk: Buffer) => {
    appErr += chunk.toString()
  })

  const paintsNow = (): number =>
    [...out.matchAll(/^PROBE-PAINTS (\d+)$/gm)].map((m) => Number(m[1])).at(-1) ?? 0

  const readyDeadline = Date.now() + 20_000
  while (!/^PROBE-READY pid=\d+$/m.test(out) && Date.now() < readyDeadline) await sleep(250)
  const ready = /^PROBE-READY pid=(\d+)$/m.exec(out)

  if (ready === null) {
    app.kill()
    record(
      "A2 Electron steady state",
      "INCONCLUSIVE",
      `no PROBE-READY within 20s — the window never showed. stderr: ${appErr.slice(0, 300) || "(empty)"}`,
    )
  } else {
    const rootPid = Number(ready[1])
    console.log(`  main pid ${String(rootPid)}; settling ${String(SETTLE_SEC)}s (transient, reported separately)`)
    const startup = fold(await sampleTree(rootPid, SETTLE_SEC))
    console.log(`  startup+settle: ${startup.cpuPctOfOneCore.toFixed(2)}% of one core over ${startup.elapsedSec.toFixed(1)}s`)

    const paintsBefore = paintsNow()
    console.log(`  measuring ${String(MEASURE_SEC)}s…`)
    const samples = await sampleTree(rootPid, MEASURE_SEC)
    const usage = fold(samples)
    const painted = paintsNow() - paintsBefore
    reportUsage("electron:", usage, samples.length)
    console.log(`    paints in window  : ${String(painted)} (need ≥${String(MIN_PAINTS)})`)

    app.kill()
    killTree(rootPid)
    await sleep(2_000)

    if (samples.length < 2) {
      record("A2 Electron steady state", "INCONCLUSIVE", "sampler produced fewer than 2 samples")
    } else if (usage.processCount < 4) {
      record(
        "A2 Electron steady state",
        "INCONCLUSIVE",
        `only ${String(usage.processCount)} processes — Electron runs 4+ plus two typeperf ` +
          `children, so the tree walk missed most of the cost`,
      )
    } else if (painted < MIN_PAINTS) {
      record(
        "A2 Electron steady state",
        "INCONCLUSIVE",
        `${String(painted)} paints in ${String(MEASURE_SEC)}s — the renderer was throttled or ` +
          `idle, so this measured a window that was not drawing`,
      )
    } else {
      electronUsage = usage
      record(
        "A2 Electron steady state",
        "PASS",
        `${usage.cpuPctOfOneCore.toFixed(2)}% of one core, ${usage.wsMb.toFixed(1)}MB sum-WS / ` +
          `${usage.wspMb.toFixed(1)}MB private, across ${String(painted)} real paints and ` +
          `${String(usage.midWindowStarts)} mid-window process starts`,
      )
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A3 — the WPF original, same instrument, same window, Alex's live settings.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A3: WPF Release, same instrument ===")
let wpfUsage: Usage | null = null
{
  if (!existsSync(WPF_EXE)) {
    record("A3 WPF baseline", "INCONCLUSIVE", `no Release build at ${WPF_EXE}`)
  } else {
    // Launched with his real settings (StatsVisible: true, 3s interval, temps and uptime
    // on) and NOT modified — the point is what the app he actually runs costs.
    const wpf = spawn(WPF_EXE, [], { windowsHide: true, detached: false })
    let wpfErr = ""
    wpf.stderr?.on("data", (chunk: Buffer) => {
      wpfErr += chunk.toString()
    })
    await sleep(3_000)
    const rootPid = wpf.pid

    if (rootPid === undefined || wpf.exitCode !== null) {
      record(
        "A3 WPF baseline",
        "INCONCLUSIVE",
        `WPF exited immediately (code ${String(wpf.exitCode)}): ${wpfErr.slice(0, 300) || "(empty)"}`,
      )
    } else {
      console.log(`  pid ${String(rootPid)}; settling ${String(SETTLE_SEC)}s (transient, reported separately)`)
      const startup = fold(await sampleTree(rootPid, SETTLE_SEC))
      console.log(`  startup+settle: ${startup.cpuPctOfOneCore.toFixed(2)}% of one core over ${startup.elapsedSec.toFixed(1)}s`)

      console.log(`  measuring ${String(MEASURE_SEC)}s…`)
      const samples = await sampleTree(rootPid, MEASURE_SEC)
      const usage = fold(samples)
      reportUsage("wpf:", usage, samples.length)

      // Killed rather than closed, deliberately: a clean exit would let the app write
      // to his live settings.json, and this probe has no business modifying it.
      killTree(rootPid)
      await sleep(2_000)

      if (samples.length < 2) {
        record("A3 WPF baseline", "INCONCLUSIVE", "sampler produced fewer than 2 samples")
      } else if (usage.processCount < 1) {
        record("A3 WPF baseline", "INCONCLUSIVE", "no processes in tree — the app died")
      } else {
        wpfUsage = usage
        const priorDelta = usage.cpuPctOfOneCore - PRIOR_WPF_CPU_PCT
        record(
          "A3 WPF baseline",
          "PASS",
          `${usage.cpuPctOfOneCore.toFixed(2)}% of one core, ${usage.wsMb.toFixed(1)}MB WS / ` +
            `${usage.wspMb.toFixed(1)}MB private — vs the prior session's ` +
            `${String(PRIOR_WPF_CPU_PCT)}% / ${String(PRIOR_WPF_WS_MB)}MB, delta ` +
            `${priorDelta >= 0 ? "+" : ""}${priorDelta.toFixed(2)}pp`,
        )
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A4 — the claim itself: is Electron cheaper than WPF, both measured here?
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A4: ISC-6 — is the Electron build cheaper than the WPF build? ===")
{
  if (electronUsage === null || wpfUsage === null) {
    record(
      "A4 ISC-6 go/no-go",
      "INCONCLUSIVE",
      `missing a side: electron=${electronUsage === null ? "no" : "yes"}, ` +
        `wpf=${wpfUsage === null ? "no" : "yes"}`,
    )
  } else {
    const e = electronUsage
    const w = wpfUsage
    const cpuFactor = w.cpuPctOfOneCore / e.cpuPctOfOneCore
    const wsFactor = w.wsMb / e.wsMb
    const wspFactor = e.wspMb > 0 && w.wspMb > 0 ? w.wspMb / e.wspMb : Number.NaN

    console.log(
      `  CPU      electron ${e.cpuPctOfOneCore.toFixed(2)}%  vs  wpf ${w.cpuPctOfOneCore.toFixed(2)}%  ` +
        `→ ${cpuFactor.toFixed(2)}× ${cpuFactor >= 1 ? "cheaper" : "MORE EXPENSIVE"}\n` +
        `  sum WS   electron ${e.wsMb.toFixed(1)}MB vs  wpf ${w.wsMb.toFixed(1)}MB ` +
        `→ ${wsFactor.toFixed(2)}× ${wsFactor >= 1 ? "cheaper" : "MORE EXPENSIVE"}\n` +
        `  priv WS  electron ${e.wspMb.toFixed(1)}MB vs  wpf ${w.wspMb.toFixed(1)}MB ` +
        `→ ${Number.isNaN(wspFactor) ? "n/a" : `${wspFactor.toFixed(2)}×`}`,
    )
    console.log(
      `\n  asymmetries: electron repaints at 1s vs WPF's configured 3s (against electron); ` +
        `\n  WPF polls LibreHardwareMonitor temps and electron has no temp source yet ` +
        `(for electron, bounded at ISC-9).`,
    )

    /**
     * The memory half, stated as a bound rather than a number.
     *
     * Neither memory figure is *the* footprint. Sum-WS double-counts every page shared
     * between Electron's processes, so it is an upper bound; private WS excludes shared
     * pages that are genuinely resident, so it is a lower bound. A single-process
     * baseline has the same two bounds, they are just much closer together. So the
     * honest comparison is interval against interval, and when the intervals overlap
     * this method cannot say which build uses less memory — in either direction.
     */
    const haveBounds = e.wspMb > 0 && w.wspMb > 0
    const eLow = e.wspMb
    const eHigh = e.wsMb
    const wLow = w.wspMb
    const wHigh = w.wsMb
    const memVerdict = !haveBounds
      ? "unmeasured (private WS unavailable)"
      : eHigh < wLow
        ? "electron strictly lower"
        : wHigh < eLow
          ? "electron strictly higher"
          : "INDETERMINATE — the intervals overlap"
    const memSentence = haveBounds
      ? `memory: electron [${eLow.toFixed(1)}, ${eHigh.toFixed(1)}]MB vs wpf ` +
        `[${wLow.toFixed(1)}, ${wHigh.toFixed(1)}]MB (private WS → sum WS) — ${memVerdict}`
      : `memory: ${memVerdict}`
    console.log(`\n  ${memSentence}`)

    if (cpuFactor < 1) {
      record(
        "A4 ISC-6 go/no-go",
        "FAIL",
        `Electron costs ${e.cpuPctOfOneCore.toFixed(2)}% of one core against WPF's ` +
          `${w.cpuPctOfOneCore.toFixed(2)}% — the port's resource premise does not hold (AC-4)`,
      )
    } else {
      // The gate is CPU only, and says so. ISC-6 names CPU% *and* RSS, and this probe
      // resolves only the first: the two footprint intervals overlap, so a
      // memory-direction gate here would be a coin flip dressed as a measurement.
      // Passing on CPU while calling the memory half open is the accurate report —
      // narrowing it needs a different instrument (per-process PSS / shared-page
      // accounting), which is where the residual ISC goes.
      record(
        "A4 ISC-6 go/no-go",
        "PASS",
        `on CPU only: Electron is ${cpuFactor.toFixed(2)}× cheaper ` +
          `(${e.cpuPctOfOneCore.toFixed(2)}% vs ${w.cpuPctOfOneCore.toFixed(2)}% of one core), ` +
          `both measured by this probe. The gate is CPU alone — ${memSentence}, so the RSS ` +
          `half of ISC-6 stays OPEN and is not claimed here`,
      )
    }
  }
}

console.log("=== summary ===")
for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.name}`)
const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
console.log(
  `\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive`,
)
process.exit(failed > 0 ? 1 : 0)
