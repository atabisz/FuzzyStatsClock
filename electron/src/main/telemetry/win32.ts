/**
 * Windows telemetry: two long-lived `typeperf` children streaming PDH counters.
 *
 * Why a child process at all — measured, not assumed. There is no Node API for
 * `Memory\% Committed Bytes In Use`, `Paging File(_Total)\% Usage`, or
 * `GPU Engine(*engtype_3D)\Utilization Percentage`. And spawning per tick is ruled
 * out by measurement: a one-shot `typeperf` sample costs 2.81s wall and
 * `Get-Counter` 2.55s, against a bare process start of 0.17s / 0.51s. At the app's
 * 1s interval — 0.5s during a hover fast-refresh — that is not a slow path, it is
 * an impossible one. One child that streams amortises the cost to zero.
 *
 * CPU could come from `os.cpus()` and is deliberately taken from PDH instead: the
 * WPF app reports `\Processor(_Total)\% Processor Time`, and mixing sources would
 * make the port's CPU number quietly disagree with the original's.
 *
 * ## Why TWO children, which is not the obvious design
 *
 * Measured on this host (`scripts/repro-header-shift.ts`, 22 spawns): a child
 * **silently omits a requested counter from its header on ~21% of spawns** — 3 of 14.
 * The header comes back 39,969 chars instead of 40,020, exactly one field short, with
 * **empty stderr and exit code 0**. Nothing errors.
 *
 * The consequence is not the missing metric reading "N/A", which is what this comment
 * used to say. A later capture caught the defect in full — a scalar child whose header
 * declared 2 paths while its sample rows carried 3 values:
 *
 *     header: [Memory, PagingFile]        sample: [39.317, 92.581, 4.386]
 *     true:   cpu=39.3 mem=92.6 pag=4.4   rendered: mem=39.3 pag=92.6
 *
 * The dropped counter's *data* stays in the rows. So the columns after the gap are off
 * by one and render **plausible, stable, wrong numbers** — memory reading 39% while it
 * is really 93%. That is strictly worse than a missing reading, and it is why there are
 * two guards below: `acceptHeader` matches names, and `acceptSampleWidth` compares the
 * header's field count against the first sample's, which catches a drop without knowing
 * which counter went missing.
 *
 * The split is NOT the fix for that, and believing it was is a mistake this comment
 * used to make. The hypothesis was that the 354-instance wildcard perturbs the batch,
 * supported by scalars-only 0/8 and gpu-wildcard-only 0/8. A later `probe-typeperf`
 * run **refuted it**: the three-counter scalar child dropped `cpu` on its first spawn
 * (`header missing [cpu] (attempt 1/4)`), with no wildcard anywhere in its command
 * line. 0/8 bounded the rate loosely, as noted at the time, and loosely was not enough.
 *
 * So the drop is a `typeperf` property, not a batch-size effect, and the only thing
 * standing between it and a permanently-"N/A" CPU reading is `acceptHeader()` below.
 * That guard is load-bearing, not defence in depth — it fired on a real run and
 * recovered on the retry, which is the only reason A1 read `cpu=74.41` that run.
 *
 * The split is still right, for three reasons that never depended on the defect:
 *   - The scalar child never needs recycling (only the GPU wildcard's instance set
 *     goes stale), so CPU/MEM/PAG stream untouched for the whole process lifetime.
 *   - The scalar header is 158 chars against the wildcard's 40,020, which arrives in
 *     ~360 stdout chunks. First CPU value lands on the first chunk instead of the
 *     360th.
 *   - It makes the retry cheap, which is what turns the guard from a good idea into a
 *     usable one. Re-spawning a scalar child re-reads a 158-char header; re-spawning an
 *     all-four child would re-expand the 354-instance wildcard as well, paying the full
 *     enumeration a second time to recover a counter that has nothing to do with it.
 *
 * ## The GPU instance defect, and why recycling is the fix
 *
 * PDH resolves the instances behind a wildcard **at spawn time**. GPU Engine
 * instance names are process-ID-scoped, so any 3D engine belonging to a process that
 * starts *later* is invisible to a child that is already running — it does not
 * error, it reports less GPU than exists. Measured: launching one process took the
 * live set 319 → 354, and a running child stayed blind to all 35 until recycled.
 *
 * The WPF app has the same blind spot and hides it by accident:
 * `StatsService.BuildGpuCounters()` enumerates once at init and re-enumerates only
 * when `NextValue()` throws `InvalidOperationException`, which fires when an
 * existing instance *vanishes* — never when a new one appears. In practice instances
 * churn often enough that it self-heals, but that is luck, not design. Here the
 * re-enumeration is explicit and on a timer.
 *
 * The recycle **overlaps**: the replacement is spawned and must deliver a sample
 * before the incumbent is killed. A sequential kill-then-spawn would leave a ~3s
 * hole in which the only honest answers are a stale value or `-1`, and `-1` renders
 * as "N/A" — a visible flicker every recycle. Measured worst gap across a swap:
 * 1041ms, against the ~3000ms a sequential swap would show.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { UNAVAILABLE, type StatsSample, type StatsSource } from "../../shared.js"
import {
  classifyColumns,
  extractInstanceName,
  isHeaderLine,
  parseHeaderPaths,
  parseSampleLine,
  splitCsvLine,
  type CounterLayout,
  type ReducedSample,
} from "./parse/typeperf.js"
import { parseBatteryLine } from "./parse/powershell.js"
import { pluggedInReading } from "../../core/battery.js"

/**
 * Counter paths, in the English locale's names.
 *
 * KNOWN LIMITATION, not yet handled: `typeperf` takes *localized* counter names, so
 * these paths fail on a non-English Windows. The locale-independent form is the
 * numeric index path (resolved through the `Perflib\009` vs `CurrentLanguage`
 * registry maps). Deferred deliberately — it is a lookup table, not a redesign, and
 * it needs a non-English host to verify on.
 */
export const CPU_PATH = "\\Processor(_Total)\\% Processor Time"
export const MEM_PATH = "\\Memory\\% Committed Bytes In Use"
export const PAG_PATH = "\\Paging File(_Total)\\% Usage"
export const GPU_PATH = "\\GPU Engine(*engtype_3D)\\Utilization Percentage"

export const SCALAR_PATHS = [CPU_PATH, MEM_PATH, PAG_PATH] as const

/**
 * How many times to re-spawn a child whose header came back missing a counter.
 *
 * At the measured ~21% single-spawn drop rate, four attempts leaves under 0.2%
 * residual. Bounded rather than unlimited because a counter that is genuinely
 * absent — a machine with no pagefile, say — would otherwise spawn forever.
 */
const MAX_HEADER_ATTEMPTS = 4

type Role = "scalar" | "gpu"

interface Child {
  role: Role
  proc: ChildProcessWithoutNullStreams
  layout: CounterLayout | null
  /** Counter paths exactly as this child's header declared them. */
  headerPaths: string[]
  buffer: string
  /** Header validation is one-shot per child; this stops it re-firing. */
  headerChecked: boolean
  /** Width validation runs on the first sample line only, for the same reason. */
  widthChecked: boolean
}

export interface Win32SourceOptions {
  /** Seconds between samples. `typeperf`'s floor is 1. */
  intervalSec?: number
  /**
   * How often to re-enumerate GPU engine instances, in ms. `0` disables.
   *
   * Trade-off, to be tuned in Phase 6: too long and a newly launched game's GPU load
   * stays invisible; too short and the spawn cost stops being amortised. Only the
   * GPU child is affected — the scalar child is never recycled.
   */
  recycleMs?: number
  log?: (level: "info" | "warn" | "error", message: string) => void
  /**
   * Diagnostics sink for the full reduced sample, including `typeperf`'s own
   * timestamp and the live GPU column count.
   *
   * Separate from `StatsSource.start`'s callback on purpose: the renderer needs four
   * numbers, and widening the shared `StatsSample` contract to carry probe
   * instrumentation would push Windows-shaped fields onto the macOS and Linux
   * sources that have no equivalent.
   */
  onReduced?: (reduced: ReducedSample) => void
  /**
   * Seconds between battery reads. 60 by default.
   *
   * **This is a deliberate divergence from the WPF app, and the reason is a cost the C# does not pay.** It
   * polls battery on its ordinary stats timer — every 2s — because `SystemInformation.PowerStatus` is a
   * `GetSystemPowerStatus` struct read measured at **0.0 ms** on this host. The cheapest route to a
   * *percentage* from Node is `Get-CimInstance Win32_Battery` at **23.7 ms**, and paying that 30x a minute
   * for a number that moves on a scale of minutes buys nothing. `pluggedIn` is not on this cadence — see
   * {@link Win32SourceOptions.readAcLine}, which is free and therefore stays per-tick.
   */
  batteryIntervalSec?: number
  /**
   * Read the AC line directly. Injected, and when supplied it **overrides** the battery child's inference.
   *
   * This is the parity source: Electron's `powerMonitor.isOnBatteryPower()` and the WPF app's
   * `PowerStatus.PowerLineStatus` are both `GetSystemPowerStatus`'s `ACLineStatus` byte, so the port reads
   * exactly what the original reads, for nothing. The fallback — inferring from `Win32_Battery.BatteryStatus`
   * — is a different field with mushy semantics (`parse/powershell.ts` documents which codes are guesses).
   *
   * Injected rather than imported so this module keeps working under plain `bun`. Importing `electron` here
   * would drag the whole runtime into every unit test and probe that loads the file, and the seam costs one
   * line at the construction site in `main.ts`.
   */
  readAcLine?: () => boolean
}

export class Win32StatsSource implements StatsSource {
  /**
   * The interval the children are ACTUALLY running at: a whole number of seconds, at least 1.
   *
   * Not readonly, but only {@link Win32StatsSource.setIntervalSec} writes it, and only for a request it can
   * honour exactly. Normalised in the constructor as well, because the setting it comes from is validated to
   * `[0.5, 10.0]` at one decimal place — so `2.5` is a legal user setting and `typeperf -si 2.5` is not a
   * legal command line.
   */
  private intervalSec: number
  private readonly recycleMs: number
  private readonly log: (level: "info" | "warn" | "error", message: string) => void
  private readonly onReduced: ((reduced: ReducedSample) => void) | undefined
  private readonly batteryIntervalSec: number
  private readonly readAcLine: (() => boolean) | undefined

  private scalar: Child | null = null
  private scalarAttempts = 0
  private gpu: Child | null = null
  private gpuReplacement: Child | null = null
  private gpuAttempts = 0

  /**
   * The battery poller. A plain child rather than a {@link Child} — it has no header, no column layout and
   * no width to validate, so none of that machinery applies to it.
   */
  private battery: ChildProcessWithoutNullStreams | null = null
  private batteryBuffer = ""
  private batteryRestarts = 0

  private recycleTimer: ReturnType<typeof setInterval> | null = null
  private onSample: ((sample: Partial<StatsSample>) => void) | null = null
  private stopped = false

  /** Latest GPU reading, carried between scalar ticks. */
  private latestGpu = UNAVAILABLE
  private latestGpuColumnsLive = 0

  /** Diagnostics the probes read; not part of the StatsSource contract. */
  public lastReduced: ReducedSample | null = null
  public sampleCount = 0
  public spawnCount = 0
  public headerRetries = 0

  constructor(options: Win32SourceOptions = {}) {
    const asked = options.intervalSec ?? 1
    this.intervalSec = wholeSeconds(asked)
    this.recycleMs = options.recycleMs ?? 30_000
    this.log = options.log ?? (() => {})
    this.onReduced = options.onReduced
    this.batteryIntervalSec = Math.max(1, Math.round(options.batteryIntervalSec ?? 60))
    this.readAcLine = options.readAcLine
    if (this.intervalSec !== asked) {
      // Said out loud, because the widget is now sampling at a cadence the user did not choose. The
      // constructor rounds where `setIntervalSec` declines, and the asymmetry has a reason: there is no
      // working cadence yet to fall back to, so some whole second has to be picked.
      this.log(
        "warn",
        `typeperf: interval ${String(asked)}s is not expressible — \`-si\` takes whole seconds ` +
          `(\`[[hh:]mm:]ss\`), so sampling at ${String(this.intervalSec)}s`,
      )
    }
  }

  describe(): string {
    return (
      `typeperf, two children at ${String(this.intervalSec)}s: scalar(cpu,mem,pag) never recycled, ` +
      `gpu(*engtype_3D) recycled every ${String(this.recycleMs)}ms; ` +
      `Win32_Battery via one PowerShell child every ${String(this.batteryIntervalSec)}s ` +
      `(ac line: ${this.readAcLine ? "powerMonitor" : "inferred from BatteryStatus"})`
    )
  }

  /**
   * Adopt a new cadence **only if `typeperf` can express it exactly**, and report what is actually running.
   *
   * Two measured facts drive every branch here, and neither is a guess:
   *
   *   1. **`-si` takes whole seconds.** `typeperf … -si 0.5` prints `Invalid syntax: -si <[[hh:]mm:]ss>`
   *      and exits immediately — not a slow path, an unavailable one. So the 0.5s hover fast-refresh cannot
   *      be served here at all, and neither can a user's legal `1.5`.
   *   2. **A respawn costs ~2.81s to first sample**, which is the measurement `win32.ts` exists because of.
   *
   * Put together: rounding a 0.5s request up to 1s would stall the three scalar rows for ~2.8s to buy a
   * cadence nobody asked for — so a hover shorter than three seconds, which is most of them, would leave the
   * numbers **staler** than not acting at all. That is why an inexact request is declined outright rather
   * than approximated. An exact request is honoured, because a user changing their interval setting is rare
   * and expects it to take effect.
   */
  setIntervalSec(sec: number): number {
    const whole = wholeSeconds(sec)
    if (whole === this.intervalSec) return this.intervalSec
    if (whole !== sec) {
      this.log(
        "info",
        `typeperf: declining a ${String(sec)}s cadence — \`-si\` takes whole seconds, and rounding to ` +
          `${String(whole)}s would cost a ~2.8s respawn stall to reach a cadence that was not asked for. ` +
          `Still sampling at ${String(this.intervalSec)}s`,
      )
      return this.intervalSec
    }
    this.log("info", `typeperf: cadence ${String(this.intervalSec)}s → ${String(whole)}s, respawning children`)
    this.intervalSec = whole
    if (this.stopped) return this.intervalSec
    // Both children, and in the same order `start()` uses. The scalar rows hold their previous values across
    // the gap rather than blanking (`latestGpu` does the same for GPU), so this is stale-then-correct.
    for (const child of [this.scalar, this.gpu, this.gpuReplacement]) this.kill(child)
    this.gpuReplacement = null
    this.scalar = this.spawnChild("scalar", [...SCALAR_PATHS])
    this.gpu = this.spawnChild("gpu", [GPU_PATH])
    return this.intervalSec
  }

  /**
   * The 3D-engine instances the serving GPU child is actually bound to.
   *
   * Exposed so the recycle can be stated as a set difference against a live
   * `typeperf -qx` enumeration, rather than inferred from the GPU number moving — a
   * number that also moves when the GPU load moves.
   */
  boundInstances(): string[] {
    const child = this.gpu
    if (!child?.layout) return []
    return child.layout.gpu
      .map((index) => extractInstanceName(child.headerPaths[index] ?? ""))
      .filter((name): name is string => name !== null)
      .sort()
  }

  start(onSample: (sample: Partial<StatsSample>) => void): void {
    this.onSample = onSample
    this.stopped = false
    this.scalar = this.spawnChild("scalar", [...SCALAR_PATHS])
    this.gpu = this.spawnChild("gpu", [GPU_PATH])
    this.battery = this.spawnBatteryChild()
    if (this.recycleMs > 0) {
      this.recycleTimer = setInterval(() => this.recycle(), this.recycleMs)
    }
  }

  stop(): void {
    this.stopped = true
    if (this.recycleTimer) {
      clearInterval(this.recycleTimer)
      this.recycleTimer = null
    }
    for (const child of [this.scalar, this.gpu, this.gpuReplacement]) this.kill(child)
    this.scalar = null
    this.gpu = null
    this.gpuReplacement = null
    // The battery child spends nearly all its life inside `Start-Sleep`, and it does not need to wake up to
    // die: Node's `kill()` on Windows is `TerminateProcess` for every signal, so a sleeping PowerShell goes
    // down as promptly as a busy one.
    if (this.battery) {
      this.killProc(this.battery)
      this.battery = null
    }
  }

  /**
   * Re-enumerate GPU instances by rotating in a fresh GPU child.
   *
   * Public so a probe can force it rather than waiting out the timer — a claim about
   * the recycle needs a before/after transition in one run, and a probe that has to
   * sleep 30s to get it is a probe nobody runs twice.
   */
  recycle(): void {
    if (this.stopped || this.gpuReplacement) return
    this.log("info", "typeperf: recycling GPU child to re-enumerate engine instances")
    this.gpuReplacement = this.spawnChild("gpu", [GPU_PATH], "replacement")
  }

  /**
   * Maximum battery-child restarts before the row is left at `N/A` for good.
   *
   * Bounded for the reason `MAX_HEADER_ATTEMPTS` is: `powershell.exe` can be absent, blocked by policy, or
   * killed by an endpoint agent, and an unbounded restart would spawn a 1.3-second process forever on a
   * machine that is never going to answer. Three is enough to ride out a transient failure and few enough
   * that a permanent one costs four seconds total and then stops.
   */
  private static readonly MAX_BATTERY_RESTARTS = 3

  /**
   * Spawn the one long-lived PowerShell that reports the battery.
   *
   * The loop lives in the child rather than in a Node timer that spawns per read, and that is the whole point:
   * a cold `powershell -Command` costs **1,326 ms** measured on this host against **23.7 ms** for the query it
   * wraps — 56x. One startup at launch, then a cheap query every interval, forever.
   *
   * `Start-Sleep` inside the child rather than `-si`-style flag: unlike `typeperf` there is no cadence
   * argument to get wrong, and unlike the scalar children this one never needs to change rate — battery is
   * exempt from the hover fast-refresh, because hovering does not make a battery move. So
   * {@link Win32StatsSource.setIntervalSec} leaves it entirely alone, which is why it is not in the list of
   * children that respawn there.
   */
  private spawnBatteryChild(): ChildProcessWithoutNullStreams {
    this.spawnCount++
    const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", batteryScript(this.batteryIntervalSec)], {
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams

    proc.stdout.setEncoding("utf8")
    proc.stdout.on("data", (chunk: string) => this.ingestBattery(chunk))
    proc.on("error", (err) => {
      // Distinct from the exit handler: this is "could not start", which on this platform means PowerShell is
      // missing or blocked, and no number of restarts fixes it.
      // `N/A`, not `--`. The row's placeholder is the literal the C# writes (`MainWindow.xaml.cs:1149`), and
      // this message said `--` while the screen said `N/A` — the same wrong string the renderer itself
      // carried through Phases 4 and 5.
      this.log("error", `battery: powershell spawn failed: ${String(err)} — battery row stays N/A`)
      this.batteryRestarts = Win32StatsSource.MAX_BATTERY_RESTARTS
    })
    proc.on("exit", (code) => {
      if (this.stopped || proc !== this.battery) return
      this.battery = null
      if (++this.batteryRestarts > Win32StatsSource.MAX_BATTERY_RESTARTS) {
        this.log("error", `battery: child exited code=${String(code)} — giving up after ${String(this.batteryRestarts - 1)} restarts, battery row stays N/A`)
        // Said once and made true: the last reading would otherwise sit on screen indefinitely, which is a
        // stale number rather than a missing one. `N/A` is the honest end state.
        this.onSample?.({ battery: UNAVAILABLE, pluggedIn: false })
        return
      }
      this.log("warn", `battery: child exited code=${String(code)} — restarting (${String(this.batteryRestarts)}/${String(Win32StatsSource.MAX_BATTERY_RESTARTS)})`)
      this.battery = this.spawnBatteryChild()
    })

    return proc
  }

  /** Line-reassemble the battery child's stdout. Same CRLF split as {@link Win32StatsSource.ingest}. */
  private ingestBattery(chunk: string): void {
    this.batteryBuffer += chunk
    const lines = this.batteryBuffer.split(/\r?\n/)
    this.batteryBuffer = lines.pop() ?? ""
    for (const line of lines) this.handleBatteryLine(line)
  }

  /**
   * Act on one battery line.
   *
   * Public so a test can drive the whole reading path — the sentinel coupling below especially — without a
   * PowerShell on the other end. Same reason {@link Win32StatsSource.recycle} is public.
   */
  handleBatteryLine(line: string): void {
    const reading = parseBatteryLine(line)
    if (reading === null) return

    // The direct AC-line read wins whenever it is available, because it is the same `ACLineStatus` byte the
    // WPF app reads. `acFromStatus` is an inference from a different CIM field and only one of its codes is
    // measured, so it is the fallback for a source loaded without Electron.
    const onAc = this.readAcLine?.() ?? reading.acFromStatus

    // The C#'s coupling of the plug flag to the percentage's readability. Shared with the other two platforms
    // rather than restated here — `core/battery.ts` carries the argument for why it is parity and not a bug.
    this.onSample?.({ battery: reading.percent, pluggedIn: pluggedInReading(reading.percent, onAc) })
  }

  /**
   * `label` is annotated `string` rather than left to infer from its default: with
   * `= role` alone TypeScript narrows the parameter to `Role`, and every caller
   * passing a descriptive label like `"gpu-retry"` fails to compile.
   */
  private spawnChild(role: Role, counters: string[], label: string = role): Child {
    this.spawnCount++
    const proc = spawn("typeperf", [...counters, "-si", String(this.intervalSec)], {
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams

    const child: Child = {
      role,
      proc,
      layout: null,
      headerPaths: [],
      buffer: "",
      headerChecked: false,
      widthChecked: false,
    }

    proc.stdout.setEncoding("utf8")
    proc.stdout.on("data", (chunk: string) => this.ingest(child, chunk))
    proc.on("error", (err) => this.log("error", `typeperf ${label} spawn failed: ${String(err)}`))
    proc.on("exit", (code) => {
      if (this.stopped) return
      this.log("warn", `typeperf ${label} exited code=${String(code)}`)
      // A replacement dying before it delivered is a failed recycle, not an outage:
      // the incumbent is still serving, so drop it and let the next cycle retry.
      if (child === this.gpuReplacement) {
        this.gpuReplacement = null
      } else if (child === this.scalar) {
        this.scalar = this.spawnChild("scalar", [...SCALAR_PATHS], "scalar-restart")
      } else if (child === this.gpu) {
        this.gpu = this.spawnChild("gpu", [GPU_PATH], "gpu-restart")
      }
    })

    return child
  }

  private ingest(child: Child, chunk: string): void {
    child.buffer += chunk
    const lines = child.buffer.split(/\r?\n/)
    // Last element is a partial line unless the chunk ended on a newline. The GPU
    // child's 40KB header arrives in ~360 chunks, the first of them 2 bytes, so this
    // reassembly is load-bearing rather than defensive.
    child.buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === "") continue

      if (isHeaderLine(trimmed)) {
        child.headerPaths = parseHeaderPaths(trimmed)
        child.layout = classifyColumns(child.headerPaths)
        if (!this.acceptHeader(child)) return
        continue
      }

      if (!child.layout) continue
      if (!this.acceptSampleWidth(child, trimmed)) return
      this.handleSample(child, parseSampleLine(trimmed, child.layout))
    }
  }

  /**
   * Check the first sample line's field count against the header's, and reject on a
   * mismatch. **This is the stronger of the two guards.**
   *
   * Captured live: a scalar child's header declared 2 paths — `Memory`, `Paging File`,
   * with `Processor` dropped — while every sample line carried **3 values**. So the
   * drop removes the counter from the *header* and leaves its data in the rows, and the
   * consequence is not the missing metric reading unavailable. It is that every column
   * after the gap is **off by one**:
   *
   *     header: [Memory, PagingFile]        indices mem=0 pag=1
   *     sample: [39.317, 92.581, 4.386]     true: cpu=39.3 mem=92.6 pag=4.4
   *     => mem renders 39.3 (the CPU value), pag renders 92.6 (the memory value)
   *
   * Plausible, stable, wrong numbers — the worst failure mode available, and strictly
   * worse than the "CPU reads N/A" this code was originally written to prevent.
   *
   * Comparing widths catches it without knowing which counter went missing, which is
   * what makes this guard independent of `acceptHeader`'s name matching. Name matching
   * alone would pass a header that dropped a *GPU* column, since all three scalar names
   * would still be present while every 3D index silently shifted — 353 wrong engine
   * readings, summed, with nothing missing to notice. The fixture for this is
   * `test/fixtures/typeperf-dropped-header.csv`.
   */
  private acceptSampleWidth(child: Child, line: string): boolean {
    if (child.widthChecked) return true
    child.widthChecked = true

    const values = splitCsvLine(line).length - 1 // less the timestamp column
    if (values === child.headerPaths.length) return true

    return this.rejectChild(
      child,
      `header declares ${child.headerPaths.length} counters but samples carry ${values} ` +
        `values — every column after the gap would read its neighbour's value`,
    )
  }

  /**
   * Validate a header against what was actually requested; re-spawn if short.
   *
   * This is the guard for the measured silent-drop defect. Returns false when the
   * child has been discarded, so the caller stops feeding it the rest of the chunk.
   */
  private acceptHeader(child: Child): boolean {
    if (child.headerChecked || !child.layout) return true
    child.headerChecked = true

    const missing: string[] = []
    if (child.role === "scalar") {
      if (child.layout.cpu === -1) missing.push("cpu")
      if (child.layout.mem === -1) missing.push("mem")
      if (child.layout.pag === -1) missing.push("pag")
    } else if (child.layout.gpu.length === 0) {
      missing.push("gpu")
    }

    if (missing.length === 0) {
      this.log(
        "info",
        `typeperf ${child.role} header ok: ${child.headerPaths.length} paths` +
          (child.role === "gpu" ? `, ${child.layout.gpu.length} 3D instances` : ""),
      )
      return true
    }

    return this.rejectChild(child, `header missing [${missing.join(",")}]`)
  }

  /**
   * Discard a child whose output cannot be trusted and rotate a fresh one in.
   *
   * Shared by both validators so a bad header and a width mismatch are handled
   * identically. Returns `false` to tell `ingest` to stop feeding the discarded child
   * the rest of the current chunk — its remaining lines are as misaligned as the first.
   *
   * Beyond `MAX_HEADER_ATTEMPTS` this **accepts the child rather than looping forever**,
   * because a counter can be genuinely absent — a machine with no pagefile — and an
   * unbounded retry would spawn `typeperf` every few seconds for the life of the app.
   * The degraded case is logged at `error`, not `warn`: on a width mismatch the numbers
   * that do render are wrong rather than missing, which is worth a louder signal than a
   * metric that reads `N/A`.
   */
  private rejectChild(child: Child, reason: string): boolean {
    const attempts = child.role === "scalar" ? ++this.scalarAttempts : ++this.gpuAttempts
    if (attempts >= MAX_HEADER_ATTEMPTS) {
      this.log(
        "error",
        `typeperf ${child.role}: ${reason} — after ${attempts} attempts, accepting degraded`,
      )
      return true
    }

    this.headerRetries++
    this.log(
      "warn",
      `typeperf ${child.role}: ${reason} (attempt ${attempts}/${MAX_HEADER_ATTEMPTS}) — re-spawning`,
    )
    this.kill(child)
    if (child.role === "scalar") {
      this.scalar = this.spawnChild("scalar", [...SCALAR_PATHS], "scalar-retry")
    } else if (child === this.gpuReplacement) {
      this.gpuReplacement = this.spawnChild("gpu", [GPU_PATH], "replacement-retry")
    } else {
      this.gpu = this.spawnChild("gpu", [GPU_PATH], "gpu-retry")
    }
    return false
  }

  private handleSample(child: Child, reduced: ReducedSample): void {
    // Promote a GPU replacement only once it has actually delivered — that is the
    // whole point of the overlap.
    if (child === this.gpuReplacement) {
      this.log(
        "info",
        `typeperf: replacement delivered, promoting (${reduced.gpuColumnsLive} live 3D columns)`,
      )
      this.kill(this.gpu)
      this.gpu = child
      this.gpuReplacement = null
    }

    if (child === this.gpu) {
      this.latestGpu = reduced.gpu
      this.latestGpuColumnsLive = reduced.gpuColumnsLive
      return // the scalar child owns the emit cadence
    }

    if (child !== this.scalar) return // an outgoing child's last gasp; superseded

    // One coherent sample per scalar tick, carrying the most recent GPU reading.
    // Both children run at the same interval, so the GPU value is at most one
    // interval old — and a stale-by-1s GPU number is preferable to two emit paths
    // racing to repaint the same panel.
    const merged: ReducedSample = {
      cpu: reduced.cpu,
      mem: reduced.mem,
      pag: reduced.pag,
      gpu: this.latestGpu,
      gpuColumnsLive: this.latestGpuColumnsLive,
      stampMs: reduced.stampMs,
    }

    this.sampleCount++
    this.lastReduced = merged
    this.onReduced?.(merged)
    this.onSample?.({
      cpu: merged.cpu,
      mem: merged.mem,
      pag: merged.pag,
      gpu: merged.gpu,
    })
  }

  private kill(child: Child | null): void {
    if (!child) return
    this.killProc(child.proc)
  }

  /**
   * Kill a raw child, listeners first.
   *
   * Split out of {@link Win32StatsSource.kill} so the battery poller — which is a bare process with no header
   * or column layout, and therefore not a {@link Child} — is torn down by exactly the same code. Dropping the
   * `data` listeners before the kill is the load-bearing half: a child can have buffered output still in
   * flight, and a discarded child's remaining lines are precisely the ones not to act on.
   */
  private killProc(proc: ChildProcessWithoutNullStreams): void {
    proc.stdout.removeAllListeners("data")
    proc.kill()
  }
}

/**
 * The nearest cadence `typeperf -si` will accept: a whole number of seconds, at least 1.
 *
 * `-si` takes `[[hh:]mm:]ss`, so a fractional argument is rejected at parse time rather than rounded by the
 * tool — the child prints `Invalid syntax: -si <[[hh:]mm:]ss>` and exits with an empty stdout. The floor of
 * 1 is what stops a `0.4` request from becoming `-si 0` (which `typeperf` also rejects) and a negative or
 * non-finite one from becoming a command line at all.
 *
 * Exported for the tests, which is the only reason it is not a method.
 */
/**
 * The PowerShell the battery child runs.
 *
 * Exported so a test can assert the shape of the command line rather than trusting it, and so the string is
 * greppable when it turns up in Process Explorer on someone's machine.
 *
 * Three details are deliberate:
 *
 *   - **`-Property` is narrowed to the two fields used.** `Get-CimInstance` without it materialises every
 *     property of the class. Measured, it made no difference here (23.5 ms against 23.7 ms, inside the
 *     noise), so this is tidiness rather than a win — recorded as measured-and-negligible so nobody
 *     re-measures it hoping for one.
 *   - **`-1` and `0` stand in for NULL properties.** `EstimatedChargeRemaining` can genuinely be NULL, and
 *     `'batt ' + $null + ' ' + 2` emits `batt  2`, whose middle field has *vanished* rather than gone empty.
 *     That is the `typeperf` dropped-header defect in a different costume: every field after the gap reads
 *     its neighbour's value, and the wrong answer here is a believable "2%" that also drags a low-battery
 *     alert on. `parse/powershell.ts` has the arm that pins it.
 *   - **`[Console]::Out.Flush()` every iteration.** PowerShell's stdout is not line-buffered when it is a
 *     pipe rather than a console, and a reading that arrives in a 60-second-late batch is worse than useless.
 *
 * Statements are joined with a space and separated by explicit `;` so the whole thing is one uncomplicated
 * argv element. No `shell: true` anywhere near it, so nothing re-parses the `$` signs.
 *
 * **Every statement needs its own `;`, and two of them were missing on the first attempt** — the array is
 * space-joined, so a newline is not there to act as the separator the way it would be in a script file. The
 * result was `$ErrorActionPreference='SilentlyContinue' while (...)` and `Select-Object -First 1 if (...)`,
 * both parse errors, and the child exited code 1 four times before giving up. `probe-battery.ts` caught it;
 * no unit test could have. The one place a `;` must NOT go is before `else`, which has to stay attached to its
 * `if`'s closing brace.
 */
export function batteryScript(intervalSec: number): string {
  return [
    "$ErrorActionPreference='SilentlyContinue';",
    "while ($true) {",
    "$b = Get-CimInstance -ClassName Win32_Battery -Property EstimatedChargeRemaining,BatteryStatus | Select-Object -First 1;",
    "if ($null -eq $b) { Write-Output 'batt none' }",
    "else {",
    "$p = if ($null -eq $b.EstimatedChargeRemaining) { -1 } else { $b.EstimatedChargeRemaining };",
    "$s = if ($null -eq $b.BatteryStatus) { 0 } else { $b.BatteryStatus };",
    "Write-Output ('batt ' + $p + ' ' + $s)",
    "};",
    "[Console]::Out.Flush();",
    `Start-Sleep -Seconds ${String(Math.max(1, Math.round(intervalSec)))}`,
    "}",
  ].join(" ")
}

export function wholeSeconds(sec: number): number {
  if (!Number.isFinite(sec)) return 1
  return Math.max(1, Math.round(sec))
}
