/**
 * macOS telemetry: four commands on two cadences, plus an in-process CPU delta.
 *
 * | Metric | Source | Cadence |
 * |---|---|---|
 * | cpu | `os.cpus()` delta, no process at all | every tick |
 * | mem | `vm_stat` | every tick |
 * | pag | `sysctl -n vm.swapusage` | every tick |
 * | gpu | `ioreg -r -c AGXAccelerator -l` | every tick |
 * | batt | `pmset -g batt` | every 60s |
 *
 * Parsing lives in `parse/darwin.ts` and is tested against real captures. This file is the part that needs
 * a Mac, and the honest statement about it is below.
 *
 * ## THE SPAWN COSTS HERE ARE UNMEASURED
 *
 * Stated first because `win32.ts` next door exists *because* of a cost measurement — a one-shot `typeperf`
 * sample costs 2.81s, which made per-tick spawning impossible rather than merely slow. No equivalent number
 * exists for any of these four commands, because no reachable Mac has run them under a clock. `vm_stat`,
 * `sysctl` and `pmset` are small single-purpose binaries and are very unlikely to be a problem. **`ioreg` is
 * the one to watch**: `-l` dumps every property of every matching node, and the repo's capture is one grep'd
 * line out of that output rather than the whole of it, so its true size on a real Mac is not known here
 * either.
 *
 * Three things follow from that, and they are the design:
 *
 *   - **Every command has an in-flight guard.** A tick that arrives while the previous invocation of the
 *     same command is still running is dropped, not queued. So a command that turns out to cost more than
 *     its interval degrades to a slower refresh rate instead of forking an unbounded pile of children.
 *   - **Every command self-reports its cost.** `costMs` per command is public, and a command whose wall
 *     cost exceeds a quarter of its own interval logs once at `warn`. The app says the thing a probe would
 *     have said, on the first Mac that runs it.
 *   - **The commands are the exact strings that were verified to work**, not tuned variants. `ioreg` has a
 *     `-d 1` depth limit that would very likely cut its output substantially — and if the flag interacts
 *     with `-r -c` in a way I have guessed wrong about, the GPU row reads `N/A` on every Mac. Recorded here
 *     as the first thing for a Mac-side probe to try, and deliberately not shipped untested.
 */

import { execFile } from "node:child_process"
import os from "node:os"
import { UNAVAILABLE, type StatsSample, type StatsSource } from "../../shared.js"
import { pluggedInReading } from "../../core/battery.js"
import { cpuBusyPercent, readCpuSnapshot, type CpuSnapshot } from "./cpu-delta.js"
import {
  memoryPercent,
  parseIoregGpuPercent,
  parsePmsetBattery,
  parseSwapUsage,
  parseVmStat,
  swapPercent,
} from "./parse/darwin.js"

/**
 * Per-command wall-clock ceiling. Past this the child is killed and the metric holds its previous value
 * until the next tick.
 *
 * 5s is deliberately far above any plausible cost for these four commands: it is a hang guard, not a
 * performance budget. A `ioreg` that genuinely takes 2s is a problem the cost warning reports, and killing
 * it would turn a slow GPU row into a permanently empty one.
 */
const COMMAND_TIMEOUT_MS = 5_000

/** `ioreg -l` output size on a real Mac is unknown, so the buffer is sized not to be the thing that fails. */
const MAX_BUFFER = 8 * 1024 * 1024

interface Command {
  readonly key: string
  readonly file: string
  readonly args: readonly string[]
  /** `"fast"` commands follow the stats interval, so a hover fast-refresh moves them; battery does not. */
  readonly cadence: "fast" | "battery"
  /** Mutable, because {@link DarwinStatsSource.setIntervalSec} rewrites it for the `fast` commands. */
  intervalMs: number
  /** True while a child is running, which is what stops ticks from stacking. */
  inFlight: boolean
  /** Last completed wall cost, ms. Public through {@link DarwinStatsSource.costs} for probes. */
  costMs: number
  /** One warning per command, not one per tick. */
  costWarned: boolean
  nextDueMs: number
  runs: number
  failures: number
}

export interface DarwinSourceOptions {
  /** Seconds between the three fast metrics. */
  intervalSec?: number
  /**
   * Seconds between battery reads. 60 by default.
   *
   * Battery is on its own cadence because it changes on a scale of minutes and `pmset` is the one command
   * here whose cost buys nothing at 1s.
   *
   * **This is a divergence from the WPF app, not a match to it.** An earlier version of this comment claimed
   * the original polls `Win32_Battery` at 60s "for the same reason", and that is false on both counts: it
   * reads `SystemInformation.PowerStatus` — not WMI — on its ordinary stats timer, with no dedicated battery
   * timer at all (`StatsService.cs:70-90`). It can afford to because that call is a `GetSystemPowerStatus`
   * struct read, measured at **0.0 ms**. Every port route to a *percentage* costs real time (23.7 ms for
   * `Get-CimInstance Win32_Battery` on Windows; a `pmset` spawn here), so all three platforms back off to 60s
   * and that is a decision the original never had to make.
   */
  batteryIntervalSec?: number
  log?: (level: "info" | "warn" | "error", message: string) => void
  /** Injectable for tests: replaces the real `execFile`. */
  run?: (file: string, args: readonly string[]) => Promise<string>
}

export class DarwinStatsSource implements StatsSource {
  /** Not readonly: the hover fast-refresh rewrites it. See {@link DarwinStatsSource.setIntervalSec}. */
  private intervalMs: number
  private readonly batteryIntervalMs: number
  private readonly log: (level: "info" | "warn" | "error", message: string) => void
  private readonly run: (file: string, args: readonly string[]) => Promise<string>

  private readonly commands: Command[]
  private timer: ReturnType<typeof setInterval> | null = null
  private onSample: ((sample: Partial<StatsSample>) => void) | null = null
  private stopped = false

  /** Previous CPU tick snapshot. `null` until the first tick, which is why the first CPU reading is `N/A`. */
  private previousCpu: CpuSnapshot | null = null

  /** Diagnostics a Mac-side probe reads; not part of the StatsSource contract. */
  public sampleCount = 0
  public elapsedSinceStartMs = 0

  constructor(options: DarwinSourceOptions = {}) {
    this.intervalMs = (options.intervalSec ?? 1) * 1000
    this.batteryIntervalMs = (options.batteryIntervalSec ?? 60) * 1000
    this.log = options.log ?? (() => {})
    this.run = options.run ?? execFileText

    const fast = this.intervalMs
    this.commands = [
      command("mem", "vm_stat", [], "fast", fast),
      command("pag", "sysctl", ["-n", "vm.swapusage"], "fast", fast),
      command("gpu", "ioreg", ["-r", "-c", "AGXAccelerator", "-l"], "fast", fast),
      command("batt", "pmset", ["-g", "batt"], "battery", this.batteryIntervalMs),
    ]
  }

  /**
   * Adopt a new cadence, in full. macOS pays nothing for this: every command is a fresh spawn on a timer,
   * so there is no long-lived child whose argument list is now wrong — unlike `win32.ts`, which has to
   * decline. The battery command keeps its own 60s cadence, because hovering does not make a battery move.
   *
   * The tick timer is restarted rather than left alone: it is what schedules everything, so a 0.5s interval
   * on the commands with a 2s tick would still only sample every 2s.
   */
  setIntervalSec(sec: number): number {
    const next = Math.max(0.1, sec) * 1000
    if (next === this.intervalMs) return this.intervalMs / 1000
    this.intervalMs = next
    for (const c of this.commands) {
      if (c.cadence !== "fast") continue
      c.intervalMs = next
      // The cost warning is a fraction of the interval, so a cadence change makes a previous verdict stale
      // in both directions -- a command that was fine at 2s may not be at 0.5s.
      c.costWarned = false
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = setInterval(() => this.tick(), this.intervalMs)
    }
    return this.intervalMs / 1000
  }

  describe(): string {
    return (
      `macOS: os.cpus() delta + vm_stat/sysctl/ioreg every ${String(this.intervalMs / 1000)}s, ` +
      `pmset every ${String(this.batteryIntervalMs / 1000)}s`
    )
  }

  /** Per-command last wall cost in ms, for a probe to report. */
  costs(): Record<string, number> {
    return Object.fromEntries(this.commands.map((c) => [c.key, c.costMs]))
  }

  /** Per-command failure counts, so a missing metric can be told from a metric that is genuinely absent. */
  failures(): Record<string, number> {
    return Object.fromEntries(this.commands.map((c) => [c.key, c.failures]))
  }

  start(onSample: (sample: Partial<StatsSample>) => void): void {
    this.onSample = onSample
    this.stopped = false
    // Every command is due immediately, so the first tick issues all four rather than waiting out the
    // battery interval to populate that row.
    for (const c of this.commands) c.nextDueMs = 0
    this.tick()
    this.timer = setInterval(() => this.tick(), this.intervalMs)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    if (this.stopped) return
    this.sampleCount++
    this.elapsedSinceStartMs += this.intervalMs

    this.sampleCpu()

    for (const c of this.commands) {
      if (c.inFlight) {
        // Not an error: a command slower than its interval is a slower refresh, and the guard is what makes
        // that true instead of a growing pile of children.
        continue
      }
      if (this.elapsedSinceStartMs < c.nextDueMs) continue
      c.nextDueMs = this.elapsedSinceStartMs + c.intervalMs
      void this.invoke(c)
    }
  }

  /**
   * CPU, in-process and free.
   *
   * The first tick has one snapshot and therefore no answer, so `cpuBusyPercent` returns `UNAVAILABLE` and
   * the row shows `N/A` for one interval at every launch. That is emitted rather than suppressed: the sample
   * is what it is, and `pushCpuSample` already declines to enter a negative reading into the load averages.
   */
  private sampleCpu(): void {
    const current = readCpuSnapshot()
    const cpu = this.previousCpu === null ? UNAVAILABLE : cpuBusyPercent(this.previousCpu, current)
    this.previousCpu = current
    this.onSample?.({ cpu })
  }

  private async invoke(c: Command): Promise<void> {
    c.inFlight = true
    const startedAt = performance.now()
    try {
      const output = await this.run(c.file, c.args)
      c.costMs = performance.now() - startedAt
      c.runs++
      this.emit(c, output)
      this.warnIfExpensive(c)
    } catch (err) {
      c.costMs = performance.now() - startedAt
      c.failures++
      // The metric keeps its previous value rather than being reset: one failed `vm_stat` out of sixty is a
      // blip, and blanking the row would make it flicker. A source that is genuinely absent fails every
      // time, which `failures()` reports and the parser's own `UNAVAILABLE` covers on the first success.
      if (c.failures === 1 || c.failures % 60 === 0) {
        this.log("warn", `darwin ${c.key}: ${c.file} failed (${String(c.failures)}x): ${String(err)}`)
      }
    } finally {
      c.inFlight = false
    }
  }

  private emit(c: Command, output: string): void {
    switch (c.key) {
      case "mem":
        this.onSample?.({ mem: memoryPercent(parseVmStat(output), os.totalmem()) })
        return
      case "pag":
        this.onSample?.({ pag: swapPercent(parseSwapUsage(output)) })
        return
      case "gpu":
        this.onSample?.({ gpu: parseIoregGpuPercent(output) })
        return
      case "batt": {
        const reading = parsePmsetBattery(output)
        this.onSample?.({
          battery: reading.percent,
          // The WPF app's `NoSystemBattery` coupling, applied identically on all three platforms. A Mac mini
          // takes this branch: `pmset -g batt` reports no battery, so the flag goes false regardless of the
          // fact that the machine has no other way of being powered. `core/battery.ts` has the argument.
          pluggedIn: pluggedInReading(reading.percent, reading.pluggedIn),
        })
        return
      }
      default:
        return
    }
  }

  /**
   * Say out loud, once per command, when a command costs a meaningful fraction of its own interval.
   *
   * This is the substitute for the measurement that could not be taken here. A quarter of the interval is
   * the threshold because three fast commands sharing a 1s tick at that cost is already most of a core.
   */
  private warnIfExpensive(c: Command): void {
    if (c.costWarned || c.runs < 3) return
    if (c.costMs * 4 <= c.intervalMs) return
    c.costWarned = true
    this.log(
      "warn",
      `darwin ${c.key}: ${c.file} costs ${c.costMs.toFixed(0)}ms against a ` +
        `${String(c.intervalMs)}ms interval — this is the unmeasured cost the module header flags`,
    )
  }
}

function command(
  key: string,
  file: string,
  args: readonly string[],
  cadence: "fast" | "battery",
  intervalMs: number,
): Command {
  return {
    key,
    file,
    args,
    cadence,
    intervalMs,
    inFlight: false,
    costMs: 0,
    costWarned: false,
    nextDueMs: 0,
    runs: 0,
    failures: 0,
  }
}

/**
 * `execFile` as a promise returning stdout.
 *
 * `shell` is left off deliberately — no argument here needs one, and a shell would make the argument arrays
 * above subject to word splitting. Non-zero exit rejects, which is what routes a missing binary to the
 * failure counter.
 */
function execFileText(file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: "utf8" },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout)
      },
    )
  })
}
