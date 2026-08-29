/**
 * Phase 5 — PERF-01: the ghost fade, measured under load instead of argued about.
 *
 * ## The claim being tested, and the defect it descends from
 *
 * `.planning/STATE.md` carries v4.4's **PERF-01** — the WPF ghost fade freezing under 25–50% CPU load —
 * deferred to v4.6+ and never closed. The port's answer is architectural: WPF ran the interpolation on
 * `CompositionTarget.Rendering`, i.e. the UI thread that also served input, layout and the 1 Hz clock, so
 * anything that occupied that thread froze the animation. The port runs the interpolation on the
 * renderer's own `requestAnimationFrame` and lets main push only the *target* — so a busy main process
 * delays where the fade is going, never how smoothly it gets there. `core/ghost-fade.ts` is where that
 * decision is written down; this file is where it is either true or not.
 *
 * The plan's exit wording is "fade stays smooth under a synthetic 25–50% CPU load", and taking that
 * literally on its own would have produced a green with very little in it. **25–50% of a 32-core machine
 * leaves 16 idle cores**, which starves nothing: the mechanism that actually broke v4.4 was occupancy of
 * the ONE thread the animation shared, and a total-CPU figure is only a proxy for that. So both are
 * measured and reported separately: the plan's band, and the mechanism.
 *
 * ## Rule 18: the arm that proves the load bit
 *
 * "The renderer's frames stayed steady" is worth nothing without something that did not, because a load
 * that failed to arrive produces the same green. So every load condition is run TWICE — once with the
 * shipped renderer-side pump, and once with the same animation driven from main by `win.setOpacity()` at
 * 60 Hz, which is v4.4's architecture deliberately rebuilt. The control has to degrade. If it does not,
 * this probe reports INCONCLUSIVE rather than a pass, because then it has measured nothing.
 *
 * ## What this does NOT prove, stated up front
 *
 * The host is `probe-fade-app.cjs`, not `dist/main.js`. It loads the shipped renderer, the shipped preload
 * and the shipped `index.html` with `main.ts`'s exact window options, and drives the real `ghost` channel —
 * but it has no sampler, no 33 ms cursor poll and no `setIgnoreMouseEvents`. Two constraints force that,
 * both already recorded elsewhere in this directory: `probe-display.ts` — **CDP cannot reach
 * `ipcRenderer`**, so a probe attached to the real app cannot push a fade target; `probe-shell.ts` —
 * synthesising a cursor move needs `SendInput`, which moves Alex's real cursor, which is why the drag arm
 * is a manual one. The sampler half is covered by `ghost-driver.test.ts`'s 21 arms and by
 * `probe-shell.ts`'s live `WS_EX_TRANSPARENT` read; what neither can reach is whether the pump's clock
 * survives load, and that is this file's only subject.
 *
 * One arm therefore stays manual and is named as such at the end of the run: nobody has yet watched the
 * real app fade under a real cursor.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { cpus, tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULTS, type AppSettings } from "../src/core/settings.js"
import { spawnElectron } from "./lib/electron-launch.js"
import { sessionLockState } from "./lib/session-lock.js"

const HERE = import.meta.dirname
const HOST = join(HERE, "probe-fade-app.cjs")
const CHURN = join(HERE, "churn-cpu.ts")
const DIST_INDEX = join(HERE, "..", "dist", "index.html")

const READY_TIMEOUT_MS = 40_000
const RUN_TIMEOUT_MS = 180_000

/**
 * The smoothness bar, and both numbers are derived rather than picked.
 *
 * A 60 Hz frame is 16.7 ms, so two frames is 33.4 — one dropped frame in a 500 ms fade is at the edge of
 * perceptible and is what a busy desktop legitimately does. `P99` is held to that. `MAX` is 100 ms, which
 * is six dropped frames in a row: a fifth of the whole fade gone in one hitch, which is what "freezing"
 * looked like in v4.4 and is unambiguously visible.
 */
const SMOOTH_P99_MS = 33.4
const SMOOTH_MAX_MS = 100

/**
 * `probe-fade-app.cjs`'s `BUSY_SPIN_MS`, mirrored here because it is the derivation for F4's bar and a bar
 * that silently stops matching its instrument is worse than no bar. If that constant moves, this moves.
 *
 * The bar itself: the host holds its event loop for 40 ms out of every 50, so a timer it asked to fire every
 * 16 ms cannot TYPICALLY fire sooner than the block is long. So the control's median gap under saturation
 * must reach 40 ms, and -- the other half, without which the number proves nothing -- its median gap when
 * idle must not already be there.
 */
const BUSY_SPIN_MS = 40

/** The plan's band. Both ends are asserted, because 90% would also pass a ">= 25%" check and mean something else. */
const LOAD_BAND = { min: 20, max: 65 }

const cores = cpus().length
const workerArg = /--workers[= ](\d+)/.exec(process.argv.join(" "))
/** Mid-band by default: 37.5% of the logical cores, which is 12 of this desk's 32. */
const workers = workerArg === null ? Math.max(2, Math.round(cores * 0.375)) : Number(workerArg[1])

// ---------------------------------------------------------------------------------------------------
// Arms. The blocking-vs-diagnostic split and the exit-code rule are `probe-shell.ts`'s, unchanged --
// same shape as `probe-display.ts` and `probe-displays.ts`, so a reader of one can read all four.
// ---------------------------------------------------------------------------------------------------

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string; blocking: boolean }[] = []

function record(
  name: string,
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE",
  detail: string,
  blocking = false,
): void {
  results.push({ name, verdict, detail, blocking })
  console.log(`  → ${verdict}${blocking ? " (blocking)" : ""}: ${detail}\n`)
}

interface Recording {
  phase: string
  mode: "renderer" | "setopacity"
  busy: boolean
  elapsedMs: number
  /** Main's own clock, per ghost push or per `setOpacity` call, as ms from the phase start. */
  mainTicks: number[]
  /** Renderer-side `performance.now()` per rAF callback. */
  frames: number[]
  writes: { t: number; v: string | null }[]
  finalOpacity: string | null
}

interface GapStats {
  count: number
  median: number
  p99: number
  max: number
  overP99Bar: number
  overMaxBar: number
}

/** Gaps between consecutive timestamps, and the four numbers that describe them. */
function gapStats(timestamps: number[]): GapStats {
  const gaps: number[] = []
  for (let i = 1; i < timestamps.length; i++) gaps.push((timestamps[i] as number) - (timestamps[i - 1] as number))
  if (gaps.length === 0) return { count: 0, median: 0, p99: 0, max: 0, overP99Bar: 0, overMaxBar: 0 }
  const sorted = [...gaps].sort((a, b) => a - b)
  // `Math.min(..., length - 1)` rather than a bare index: at 20 gaps the 99th percentile rounds past the
  // end of the array, and an `undefined` there would become a NaN that compares false against every bar.
  const at = (q: number): number => sorted[Math.min(Math.floor(q * sorted.length), sorted.length - 1)] as number
  return {
    count: gaps.length,
    median: at(0.5),
    p99: at(0.99),
    max: sorted[sorted.length - 1] as number,
    overP99Bar: gaps.filter((g) => g > SMOOTH_P99_MS).length,
    overMaxBar: gaps.filter((g) => g > SMOOTH_MAX_MS).length,
  }
}

function fmt(stats: GapStats): string {
  return (
    `n=${String(stats.count)} median=${stats.median.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms ` +
    `max=${stats.max.toFixed(1)}ms (>${String(SMOOTH_P99_MS)}ms: ${String(stats.overP99Bar)}, ` +
    `>${String(SMOOTH_MAX_MS)}ms: ${String(stats.overMaxBar)})`
  )
}

/** Cumulative busy/total CPU ticks across every logical core. The delta of two of these is a utilisation. */
function cpuSnapshot(): { busy: number; total: number } {
  let busy = 0
  let total = 0
  for (const cpu of cpus()) {
    const t = cpu.times
    busy += t.user + t.nice + t.sys + t.irq
    total += t.user + t.nice + t.sys + t.irq + t.idle
  }
  return { busy, total }
}

function utilisation(from: { busy: number; total: number }, to: { busy: number; total: number }): number {
  const total = to.total - from.total
  return total <= 0 ? 0 : ((to.busy - from.busy) / total) * 100
}

// ---------------------------------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------------------------------

if (!existsSync(DIST_INDEX)) {
  console.log(`  ${DIST_INDEX} is missing -- run \`bun run build\` first.`)
  process.exit(1)
}

const profileDir = mkdtempSync(join(tmpdir(), "fc-fade-profile-"))
const settingsPath = join(profileDir, "probe-settings.json")
/**
 * The phase gate: a monotonically increasing integer the host polls.
 *
 * It is a file rather than a line on the host's stdin because **Electron's main process on Windows does not
 * deliver piped stdin** -- measured here, and written up at length in `probe-fade-app.cjs`'s header. The
 * first version of this probe hung on phase one with the write going nowhere and no error on either side.
 */
const goPath = join(profileDir, "go.txt")
let goCount = 0

function releasePhase(): void {
  goCount += 1
  writeFileSync(goPath, String(goCount), "utf8")
}

/**
 * The settings the host pushes down. Built from `DEFAULTS` rather than hand-written, so the object on the
 * wire is the shipped `AppSettings` shape and a field added to it arrives here without anyone remembering.
 *
 * `statsVisible` is on deliberately: the widget's 1 Hz repaint is real work in the same renderer, and a
 * fade measured on an otherwise-empty page would be measuring a page the app never shows. `opacity` is
 * 0.9 rather than 1.0 so the `windowOpacity * (1 - ratio)` product is a real multiplication — at 1.0 a
 * dropped factor would still produce the right number.
 */
const settings: AppSettings = { ...DEFAULTS, ghostModeEnabled: true, statsVisible: true, opacity: 0.9 }
writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8")
// Written before the host starts so its first poll always finds a readable file rather than an ENOENT.
writeFileSync(goPath, "0", "utf8")

/**
 * Sampled at both ends rather than once. A run takes about a minute, and Alex's machine locks on idle -- so a
 * check at the start alone would miss a lock that arrived mid-run and contaminated the later phases only.
 */
const lockAtStart = sessionLockState()

console.log(`=== PERF-01 fade probe ===`)
console.log(`  session: ${lockAtStart.detail}`)
console.log(`  ${String(cores)} logical cores, ${String(workers)} churn workers for the system-load phases`)
console.log(`  nominal system load: ${((workers / cores) * 100).toFixed(1)}%  (the plan's band is 25-50%)`)
console.log(`  settings: ${settingsPath}\n`)

let churn: ChildProcess[] = []

function startChurn(seconds: number, count: number): void {
  churn = Array.from({ length: count }, () =>
    spawn("bun", [CHURN, String(seconds)], { stdio: "ignore", windowsHide: true }),
  )
}

function stopChurn(): void {
  for (const proc of churn) proc.kill()
  churn = []
}

const host = spawnElectron(HOST, [settingsPath, goPath])
const recordings: Recording[] = []
let stdout = ""
let stderr = ""
/** CPU snapshot taken as each phase is released, keyed by phase name. */
const cpuAtStart = new Map<string, { busy: number; total: number }>()
const loadByPhase = new Map<string, number>()

host.stdout.on("data", (chunk: Buffer) => {
  stdout += chunk.toString()
  // Line-oriented, and the buffer is re-scanned rather than split incrementally: a `PROBE-FADE` payload is
  // tens of kilobytes of timestamps and arrives in several chunks, so a naive per-chunk split would cut it.
  const lines = stdout.split("\n")
  stdout = lines.pop() ?? ""
  for (const line of lines) handleLine(line.trimEnd())
})
host.stderr.on("data", (chunk: Buffer) => {
  stderr += chunk.toString()
})

function handleLine(line: string): void {
  if (line === "") return

  const phaseMatch = /^PROBE-FADE-PHASE (\S+)$/.exec(line)
  if (phaseMatch !== null) {
    const name = phaseMatch[1] as string
    console.log(`--- phase ${name}`)
    // The churn is started BEFORE the go, and given the phase's own length plus slack: a worker that
    // outlives its phase by a second is harmless, a worker that has not reached full speed when the
    // recording opens would put its own spin-up into the measurement.
    //
    // `cores + 4` for the oversubscribed pair rather than exactly `cores`: at exactly one worker per core
    // the scheduler can still place the renderer's compositor thread in the slack, and the subject of that
    // phase is a machine with no slack left.
    const load = name.endsWith("system-busy") ? workers : name.endsWith("oversubscribed") ? cores + 4 : 0
    if (load > 0) {
      if (churn.length !== load) {
        stopChurn()
        startChurn(20, load)
      }
      // Long enough for that many `bun` processes to be scheduled and hot. Scaled, because 36 of them take
      // measurably longer to all reach full speed than 12 do.
      setTimeout(
        () => {
          cpuAtStart.set(name, cpuSnapshot())
          releasePhase()
        },
        load > cores ? 2_500 : 1_200,
      )
    } else {
      stopChurn()
      cpuAtStart.set(name, cpuSnapshot())
      releasePhase()
    }
    return
  }

  if (line.startsWith("PROBE-FADE ")) {
    const payload = JSON.parse(line.slice("PROBE-FADE ".length)) as Recording
    const from = cpuAtStart.get(payload.phase)
    if (from !== undefined) loadByPhase.set(payload.phase, utilisation(from, cpuSnapshot()))
    recordings.push(payload)
    console.log(
      `    recorded: ${String(payload.frames.length)} frames, ${String(payload.writes.length)} opacity writes, ` +
        `${String(payload.mainTicks.length)} main ticks, system CPU ${(loadByPhase.get(payload.phase) ?? 0).toFixed(1)}%`,
    )
    return
  }

  if (line.startsWith("PROBE-FADE-ERROR") || line.startsWith("PROBE-FADE-CONSOLE")) {
    console.log(`    ${line}`)
    return
  }
  if (line === "PROBE-FADE-READY" || line === "PROBE-FADE-DONE") console.log(`    ${line}`)
}

const finished = await new Promise<boolean>((resolve) => {
  const timer = setTimeout(() => resolve(false), RUN_TIMEOUT_MS)
  const readyTimer = setTimeout(() => {
    if (recordings.length === 0) resolve(false)
  }, READY_TIMEOUT_MS)
  host.on("exit", () => {
    clearTimeout(timer)
    clearTimeout(readyTimer)
    resolve(true)
  })
})

/**
 * The other end of the lock sample. Taken here, before any teardown that could itself take a second, so the
 * pair brackets exactly the interval the frames were recorded in.
 */
const lockAtEnd = sessionLockState()

stopChurn()
if (!finished) host.kill()
rmSync(profileDir, { recursive: true, force: true })
if (stderr.trim() !== "") console.log(`  host stderr: ${stderr.slice(0, 800)}\n`)

const byPhase = new Map(recordings.map((r) => [r.phase, r]))
const EXPECTED = [
  "renderer-idle",
  "setopacity-idle",
  "renderer-main-busy",
  "setopacity-main-busy",
  "renderer-system-busy",
  "setopacity-system-busy",
  "renderer-oversubscribed",
  "setopacity-oversubscribed",
]

// ───────────────────────────────────────────────────────────────────────────────
// F0 — was anyone looking at the screen? Blocking, because a rAF cadence measured against a compositor
// that is not presenting is a number about this process rather than about what a user would see.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F0: the session was actually presenting ===")
const idleForF0 = byPhase.get("renderer-idle")
const idleMedian = idleForF0 === undefined ? 0 : gapStats(idleForF0.frames).median
/** 60, 75, 90, 120, 144, 165 and 240 Hz as frame intervals. A real panel lands on one of these. */
const KNOWN_INTERVALS = [16.67, 13.33, 11.11, 8.33, 6.94, 6.06, 4.17]
const nearest = KNOWN_INTERVALS.reduce((best, ms) =>
  Math.abs(ms - idleMedian) < Math.abs(best - idleMedian) ? ms : best,
)
const offRate = idleMedian > 0 && Math.abs(nearest - idleMedian) > 1
if (lockAtStart.locked || lockAtEnd.locked) {
  record(
    "F0 session presenting",
    "INCONCLUSIVE",
    `the workstation was LOCKED (${lockAtStart.locked ? lockAtStart.detail : lockAtEnd.detail}). The ` +
      `COMPARATIVE result below still holds -- both architectures ran in the same process on the same host ` +
      `under the same load, and F4's control degraded while the pump did not -- but the absolute cadence is ` +
      `not a claim about what a user sees, because nothing was being presented. Re-run unlocked before ` +
      `quoting PERF-01 as closed` +
      (offRate
        ? `. Corroborated: the idle median of ${idleMedian.toFixed(1)}ms is ~${(1_000 / idleMedian).toFixed(0)}Hz, ` +
          `which matches no standard refresh rate (nearest is ${(1_000 / nearest).toFixed(0)}Hz) -- a ` +
          `free-running compositor, not a vsync`
        : ``),
    true,
  )
} else {
  record(
    "F0 session presenting",
    "PASS",
    `${lockAtStart.detail}, unchanged at the end of the run. Idle median ${idleMedian.toFixed(1)}ms ` +
      `(~${(1_000 / idleMedian).toFixed(0)}Hz)` +
      (offRate
        ? ` -- which matches no standard refresh rate (nearest ${(1_000 / nearest).toFixed(0)}Hz), so read the ` +
          `absolute figures with that in mind`
        : `, consistent with a ${(1_000 / nearest).toFixed(0)}Hz panel`),
    true,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// F1 — the run happened. The denominator for everything below.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F1: the host ran every phase ===")
const missing = EXPECTED.filter((name) => !byPhase.has(name))
if (missing.length > 0) {
  record(
    "F1 run completed",
    "FAIL",
    `missing phases: ${missing.join(", ")}. Two failures look like this and the printed markers above tell ` +
      `them apart: no PROBE-FADE-READY means the window or the bridge never came up (the host's stderr is ` +
      `printed above for that case -- an Electron started with ELECTRON_RUN_AS_NODE set exits 0 with a stack ` +
      `trace), while a READY followed by a phase marker and then silence means the gate did not release`,
    true,
  )
} else {
  record("F1 run completed", "PASS", `all ${String(EXPECTED.length)} phases recorded`, true)
}

// ───────────────────────────────────────────────────────────────────────────────
// F2 — the pump was LIVE. Without this every frame arm below could be measuring an idle renderer.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F2: the shipped pump was actually running during the renderer phases ===")
for (const name of EXPECTED.filter((n) => n.startsWith("renderer-"))) {
  const rec = byPhase.get(name)
  if (rec === undefined) {
    record(`F2 ${name} pump live`, "INCONCLUSIVE", "phase not recorded", false)
    continue
  }
  const distinct = new Set(rec.writes.map((w) => w.v)).size
  // A live pump on a sine target writes a new value nearly every frame. 50 distinct values over 4s is a
  // floor an idle or detached pump cannot reach, and it is checked rather than the raw count because
  // `svg.ts`'s memo collapses repeats -- so a pump stuck writing one value would still show writes.
  const ok = rec.writes.length > 100 && distinct > 50
  // Not blocking for the oversubscribed phase: a starved pump writing less is that phase's FINDING, and a
  // diagnostic arm cannot be allowed to fail the gate for the answer it was added to obtain.
  record(
    `F2 ${name} pump live`,
    ok ? "PASS" : "FAIL",
    `${String(rec.writes.length)} opacity writes, ${String(distinct)} distinct values, ` +
      `final=${String(rec.finalOpacity)}`,
    !name.endsWith("oversubscribed"),
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// F3 — the idle baseline. Diagnostic: it is what the loaded arms are read against.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F3: the idle baseline (what this display and this desk do with nothing added) ===")
const idle = byPhase.get("renderer-idle")
const idleFrames = idle === undefined ? null : gapStats(idle.frames)
if (idleFrames === null) {
  record("F3 idle baseline", "INCONCLUSIVE", "renderer-idle not recorded")
} else {
  // The refresh rate is REPORTED rather than assumed, because the bars above are not derived from it: 33.4ms
  // is two frames at 60Hz as a perceptibility figure, so on a faster panel it is a looser bar in frames and
  // an identical one in milliseconds -- which is the right way round, since a stutter is perceived in time.
  record(
    "F3 idle baseline",
    idleFrames.max <= SMOOTH_MAX_MS ? "PASS" : "FAIL",
    `renderer frames ${fmt(idleFrames)} -- ~${(1_000 / idleFrames.median).toFixed(0)}Hz effective, so the ` +
      `${String(SMOOTH_P99_MS)}ms p99 bar is ${(SMOOTH_P99_MS / idleFrames.median).toFixed(1)} frames here`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// F4 — Rule 18's positive control: the v4.4 architecture must DEGRADE under main saturation.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F4: the negative control degrades, which is what proves the load arrived ===")
const controlBusy = byPhase.get("setopacity-main-busy")
const controlIdle = byPhase.get("setopacity-idle")
if (controlBusy === undefined || controlIdle === undefined) {
  record("F4 control degrades", "INCONCLUSIVE", "a setopacity phase was not recorded", true)
} else {
  const busyStats = gapStats(controlBusy.mainTicks)
  const idleStats = gapStats(controlIdle.mainTicks)
  // Median rather than max, and both halves asserted. Max was the first version of this bar and it was the
  // wrong quantity: `setInterval(16)` coalesces to ~31ms on Windows even idle, so idle max and busy max sat
  // one timer tick apart at 32 and 64 and a ratio test on them turned a plainly-arrived load into an
  // INCONCLUSIVE. The medians in the same run were 31 and 62, which is the load, stated once.
  const bit = busyStats.median >= BUSY_SPIN_MS && idleStats.median < BUSY_SPIN_MS
  record(
    "F4 control degrades",
    bit ? "PASS" : "INCONCLUSIVE",
    `setOpacity call cadence — idle ${fmt(idleStats)} | main-busy ${fmt(busyStats)}. ` +
      (bit
        ? `the ${String(BUSY_SPIN_MS)}ms event-loop block is visible in main's own clock (median ` +
          `${idleStats.median.toFixed(1)} → ${busyStats.median.toFixed(1)}ms, ` +
          `${String(busyStats.count)} vs ${String(idleStats.count)} ticks in the same 4s), so the load ` +
          `reached the process and the arms below are measuring something`
        : `main's clock did not degrade past the ${String(BUSY_SPIN_MS)}ms block length, so this run measured ` +
          `no load and NOTHING below is evidence`),
    true,
  )
  // A finding rather than a caveat, and it is the port's decision restated as a number: main's timer is not
  // tied to vsync, so the v4.4 architecture cannot be frame-accurate on this host BEFORE any load arrives.
  record(
    "F4b the control is off-vsync even when idle",
    "INCONCLUSIVE",
    `an idle main-driven animation asked for 16ms and got ${idleStats.median.toFixed(1)}ms — ` +
      `~${(1_000 / idleStats.median).toFixed(0)}Hz against the renderer pump's ` +
      `~${idleFrames === null ? "?" : (1_000 / idleFrames.median).toFixed(0)}Hz in the same run. Windows ` +
      `timer coalescing, not load`,
  )
  if (process.platform !== "win32" && process.platform !== "darwin") {
    record(
      "F4c setOpacity platform",
      "INCONCLUSIVE",
      `setOpacity is @platform win32,darwin and does nothing on ${process.platform} — this arm measured ` +
        `the CALL cadence only, which is still the right quantity for the control but paints nothing`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// F5 — THE CLAIM: main saturated, renderer frames steady. This is PERF-01.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F5: PERF-01 — the fade's clock survives a saturated main process ===")
const rendererBusy = byPhase.get("renderer-main-busy")
if (rendererBusy === undefined) {
  record("F5 fade smooth under main saturation", "INCONCLUSIVE", "renderer-main-busy not recorded", true)
} else {
  const frames = gapStats(rendererBusy.frames)
  const pushes = gapStats(rendererBusy.mainTicks)
  const smooth = frames.p99 <= SMOOTH_P99_MS && frames.max <= SMOOTH_MAX_MS
  record(
    "F5 fade smooth under main saturation",
    smooth ? "PASS" : "FAIL",
    `renderer frames ${fmt(frames)}`,
    true,
  )
  // The sentence the whole architecture is: the delay landed on the target, not on the animation.
  record(
    "F5b the delay lands on the TARGET",
    pushes.max > frames.max ? "PASS" : "INCONCLUSIVE",
    `main's ghost pushes ${fmt(pushes)} against the renderer's frames ${fmt(frames)} — ` +
      `main's own cadence is the half that stalled`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// F6 — the plan's literal band, measured rather than assumed, then read honestly.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F6: the plan's 25-50% system load, measured ===")
const rendererSystem = byPhase.get("renderer-system-busy")
const systemLoad = loadByPhase.get("renderer-system-busy") ?? 0
if (rendererSystem === undefined) {
  record("F6 fade smooth under system load", "INCONCLUSIVE", "renderer-system-busy not recorded", true)
} else if (systemLoad < LOAD_BAND.min || systemLoad > LOAD_BAND.max) {
  record(
    "F6 fade smooth under system load",
    "INCONCLUSIVE",
    `measured system CPU was ${systemLoad.toFixed(1)}%, outside the ${String(LOAD_BAND.min)}-${String(LOAD_BAND.max)}% ` +
      `window this arm is about — re-run with --workers N (currently ${String(workers)} of ${String(cores)} cores)`,
    true,
  )
} else {
  const frames = gapStats(rendererSystem.frames)
  const smooth = frames.p99 <= SMOOTH_P99_MS && frames.max <= SMOOTH_MAX_MS
  record(
    "F6 fade smooth under system load",
    smooth ? "PASS" : "FAIL",
    `${systemLoad.toFixed(1)}% measured system CPU, renderer frames ${fmt(frames)}`,
    true,
  )
  // The honest reading of a green here, stated as its own line so it cannot be quoted without it.
  const controlSystem = byPhase.get("setopacity-system-busy")
  const controlStats = controlSystem === undefined ? null : gapStats(controlSystem.mainTicks)
  record(
    "F6b what the system-load green is worth",
    "INCONCLUSIVE",
    `${String(workers)} saturated cores of ${String(cores)} leaves ${String(cores - workers)} idle, so this band ` +
      `starves neither process on this host — and the control agrees: ` +
      `${controlStats === null ? "not recorded" : fmt(controlStats)}. The plan's wording is a proxy for ` +
      `thread occupancy, which is what actually broke v4.4; F5 is the arm carrying the claim`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// F7 — past the bar: where does it actually break? Diagnostic by construction.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F7: the oversubscribed run, which is past what the plan asks for ===")
const oversub = byPhase.get("renderer-oversubscribed")
const oversubControl = byPhase.get("setopacity-oversubscribed")
const oversubLoad = loadByPhase.get("renderer-oversubscribed") ?? 0
if (oversub === undefined) {
  record("F7 oversubscribed limit", "INCONCLUSIVE", "renderer-oversubscribed not recorded")
} else {
  const frames = gapStats(oversub.frames)
  const control = oversubControl === undefined ? null : gapStats(oversubControl.mainTicks)
  const held = frames.p99 <= SMOOTH_P99_MS && frames.max <= SMOOTH_MAX_MS
  record(
    "F7 oversubscribed limit",
    "INCONCLUSIVE",
    `${String(cores + 4)} churn workers on ${String(cores)} cores, ${oversubLoad.toFixed(1)}% measured — ` +
      `renderer frames ${fmt(frames)} | control ${control === null ? "not recorded" : fmt(control)}. ` +
      (held
        ? `the pump held its clock with nothing left on the machine, so no limit was located here either — ` +
          `report it as "not found below full oversubscription", never as "immune"`
        : `THE LIMIT IS HERE: the pump degrades once every core is oversubscribed, which is worth knowing ` +
          `and is well past the state this widget is expected to run in`),
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// F8 — the manual arm nothing here can reach.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== F8: what is left for a human ===")
record(
  "F8 real-app end-to-end fade",
  "INCONCLUSIVE",
  `no probe has seen the REAL app fade under a REAL cursor: pushing a target needs ipcRenderer (CDP cannot ` +
    `reach it) and moving the cursor needs SendInput (which moves Alex's own). Joins the drag arm as manual ` +
    `— move the pointer toward the widget with ghost mode on and watch it fade, then away and watch it return`,
)

// ---------------------------------------------------------------------------------------------------
console.log("=== summary ===")
for (const r of results) console.log(`  ${r.verdict.padEnd(13)} ${r.blocking ? "*" : " "} ${r.name}`)
const blocking = results.filter((r) => r.blocking)
const failed = blocking.filter((r) => r.verdict !== "PASS")
console.log(
  `\n  ${String(blocking.filter((r) => r.verdict === "PASS").length)}/${String(blocking.length)} blocking arms pass ` +
    `(* = blocking; ${String(results.length - blocking.length)} diagnostic arms are reported, not gated)`,
)
process.exit(failed.length === 0 ? 0 : 1)
