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
}

export class Win32StatsSource implements StatsSource {
  private readonly intervalSec: number
  private readonly recycleMs: number
  private readonly log: (level: "info" | "warn" | "error", message: string) => void
  private readonly onReduced: ((reduced: ReducedSample) => void) | undefined

  private scalar: Child | null = null
  private scalarAttempts = 0
  private gpu: Child | null = null
  private gpuReplacement: Child | null = null
  private gpuAttempts = 0

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
    this.intervalSec = options.intervalSec ?? 1
    this.recycleMs = options.recycleMs ?? 30_000
    this.log = options.log ?? (() => {})
    this.onReduced = options.onReduced
  }

  describe(): string {
    return (
      `typeperf, two children at ${this.intervalSec}s: scalar(cpu,mem,pag) never recycled, ` +
      `gpu(*engtype_3D) recycled every ${this.recycleMs}ms`
    )
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
   * metric that reads `--`.
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
    child.proc.stdout.removeAllListeners("data")
    child.proc.kill()
  }
}
