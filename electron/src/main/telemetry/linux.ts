/**
 * Linux telemetry: file reads, and at most one child process.
 *
 * | Metric | Source | Spawns? |
 * |---|---|---|
 * | cpu | `os.cpus()` delta, i.e. `/proc/stat` | no |
 * | mem | `/proc/meminfo` | no |
 * | pag | `/proc/meminfo` — same read as mem | no |
 * | gpu | `/sys/class/drm/cardN/device/gpu_busy_percent`, else `nvidia-smi` | only on NVIDIA |
 * | batt | `/sys/class/power_supply/BAT*` + the AC adapter's `online` | no |
 *
 * This is the cheapest of the three platforms by a wide margin, and it is worth saying why rather than
 * letting it look like luck: Linux exposes all of this as small virtual files, so four of the five metrics
 * are a handful of sub-millisecond reads with no process, no PDH, and no parsing of a command's prose.
 * Windows needs `typeperf` children because there is no API for its counters; macOS needs four commands
 * because the kernel statistics are not exposed as files.
 *
 * ## The one spawn, and why it is cached
 *
 * `nvidia-smi` is the fallback when no `gpu_busy_percent` file exists. Which of the two applies is a
 * property of the machine's driver and does not change while the app runs, so the probe for it happens
 * **once** and the answer is remembered. Re-probing every tick would spawn a process per second on every AMD
 * box for a question already answered.
 *
 * There is a third answer, "neither", and it is reached from the *spawn* rather than from the probe: an
 * `ENOENT` says the binary does not exist, which pins the GPU row to `N/A` with no further spawns. See
 * {@link LinuxStatsSource.onNvidiaFailure} for why that one rejection latches and the others must not. This
 * paragraph used to claim the probe returned "neither" itself, which it never has — nothing called for the
 * `none` mode, so on every Intel-integrated Linux laptop this file spawned a child every tick, forever,
 * to be told again that there is no `nvidia-smi`.
 *
 * ## What is NOT measured here
 *
 * No Linux host is reachable from this machine, so — exactly as with `darwin.ts` — none of these paths has
 * been read on a real system. The parsers are tested against synthetic text (`test/linux-parse.test.ts` says
 * so in its header) and the file *locations* are from documentation. The CPU half is the exception and is
 * genuinely measured, because `os.cpus()` is `/proc/stat` and its arms run on this host.
 *
 * The glob is the most likely thing to be wrong: `card0` is not guaranteed to be the render node, a machine
 * with integrated *and* discrete graphics has several, and `BAT0` is `BAT1` on some ThinkPads. Both globs
 * take the first match in sorted order and log which path they settled on, so the first run on a real Linux
 * box says what it chose rather than leaving it to be inferred from a wrong number.
 */

import { execFile } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
// `node:path/posix`, not `node:path`. Identical on the only platform this file runs on, and NOT identical
// on the one that tests it: plain `join` under Windows composes `/sys/class/drm\card0\device\...`, so every
// path this module builds would depend on the host of the test rather than on the host of the app. The
// alternative was a separator-normalising fake filesystem in `test/linux-source.test.ts`, which would have
// been a test working around a module instead of a module stating what it means.
import { join } from "node:path/posix"
import { UNAVAILABLE, type StatsSample, type StatsSource } from "../../shared.js"
import { pluggedInReading } from "../../core/battery.js"
import { cpuBusyPercent, readCpuSnapshot, type CpuSnapshot } from "./cpu-delta.js"
import {
  isPluggedIn,
  memoryPercent,
  parseBatteryCapacity,
  parseGpuBusyPercent,
  parseMemInfo,
  parseNvidiaSmiPercent,
  swapPercent,
} from "./parse/linux.js"

const DRM_ROOT = "/sys/class/drm"
const POWER_SUPPLY_ROOT = "/sys/class/power_supply"
const NVIDIA_SMI_TIMEOUT_MS = 4_000

/** How the GPU number is obtained on this machine. Resolved once. */
type GpuMode = { kind: "sysfs"; path: string } | { kind: "nvidia-smi" } | { kind: "none" }

export interface LinuxSourceOptions {
  intervalSec?: number
  /** Seconds between battery reads; 60 by default, matching the other two platforms. */
  batteryIntervalSec?: number
  log?: (level: "info" | "warn" | "error", message: string) => void
  /** Injectable for tests, so the sysfs and /proc layout can be faked without a Linux host. */
  readFile?: (path: string) => string
  listDir?: (path: string) => string[]
  runNvidiaSmi?: () => Promise<string>
}

export class LinuxStatsSource implements StatsSource {
  /** Not readonly: the hover fast-refresh rewrites it. See {@link LinuxStatsSource.setIntervalSec}. */
  private intervalMs: number
  private readonly batteryIntervalMs: number
  private readonly log: (level: "info" | "warn" | "error", message: string) => void
  private readonly readFile: (path: string) => string
  private readonly listDir: (path: string) => string[]
  private readonly runNvidiaSmi: () => Promise<string>

  private timer: ReturnType<typeof setInterval> | null = null
  private onSample: ((sample: Partial<StatsSample>) => void) | null = null
  private stopped = false
  private previousCpu: CpuSnapshot | null = null

  /** `null` until the one-time probe runs. */
  private gpuMode: GpuMode | null = null
  private nvidiaInFlight = false
  /** Consecutive `nvidia-smi` rejections. Read only to log the first one. */
  private nvidiaFailures = 0
  /** Resolved battery directory, or `""` for "looked and there is none". `null` means not yet looked. */
  private batteryDir: string | null = null
  private acOnlinePath: string | null = null
  private elapsedMs = 0
  private batteryDueMs = 0

  public sampleCount = 0

  constructor(options: LinuxSourceOptions = {}) {
    this.intervalMs = (options.intervalSec ?? 1) * 1000
    this.batteryIntervalMs = (options.batteryIntervalSec ?? 60) * 1000
    this.log = options.log ?? (() => {})
    this.readFile = options.readFile ?? ((path) => readFileSync(path, "utf8"))
    this.listDir = options.listDir ?? ((path) => readdirSync(path))
    this.runNvidiaSmi = options.runNvidiaSmi ?? nvidiaSmiPercent
  }

  describe(): string {
    return (
      `Linux: os.cpus() delta + /proc/meminfo every ${String(this.intervalMs / 1000)}s, ` +
      `gpu via ${this.gpuMode?.kind ?? "unprobed"}, battery every ${String(this.batteryIntervalMs / 1000)}s`
    )
  }

  start(onSample: (sample: Partial<StatsSample>) => void): void {
    this.onSample = onSample
    this.stopped = false
    this.batteryDueMs = 0
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

  /**
   * Adopt a new cadence, in full — and it is the cheapest of the three platforms to do it on, because four
   * of the five metrics are file reads. Doubling the rate doubles a handful of sub-millisecond reads.
   *
   * The `nvidia-smi` fallback is the one case where a faster cadence costs something real, and the in-flight
   * guard in {@link LinuxStatsSource.sampleGpu} is what bounds it: at 0.5s a command that takes 700ms simply
   * runs at 1.4s instead of piling up children. So the hover fast-refresh degrades that one row rather than
   * the process.
   */
  setIntervalSec(sec: number): number {
    const next = Math.max(0.1, sec) * 1000
    if (next === this.intervalMs) return this.intervalMs / 1000
    this.intervalMs = next
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = setInterval(() => this.tick(), this.intervalMs)
    }
    return this.intervalMs / 1000
  }

  private tick(): void {
    if (this.stopped) return
    this.sampleCount++
    this.elapsedMs += this.intervalMs

    const current = readCpuSnapshot()
    const cpu = this.previousCpu === null ? UNAVAILABLE : cpuBusyPercent(this.previousCpu, current)
    this.previousCpu = current

    // One read serves both memory and swap: they are lines in the same file, and reading it twice would be
    // two different instants for two numbers a user reads as one snapshot.
    const info = this.readMemInfo()
    this.onSample?.({ cpu, mem: memoryPercent(info), pag: swapPercent(info) })

    this.sampleGpu()

    if (this.elapsedMs >= this.batteryDueMs) {
      this.batteryDueMs = this.elapsedMs + this.batteryIntervalMs
      this.sampleBattery()
    }
  }

  private readMemInfo(): ReturnType<typeof parseMemInfo> {
    try {
      return parseMemInfo(this.readFile("/proc/meminfo"))
    } catch {
      // `/proc` unmounted is the only way here, and it is not recoverable by retrying, so this is silent:
      // `null` renders both rows as `N/A`, which is the true statement.
      return null
    }
  }

  private sampleGpu(): void {
    this.gpuMode ??= this.probeGpuMode()

    if (this.gpuMode.kind === "none") return
    if (this.gpuMode.kind === "sysfs") {
      try {
        this.onSample?.({ gpu: parseGpuBusyPercent(this.readFile(this.gpuMode.path)) })
      } catch {
        this.onSample?.({ gpu: UNAVAILABLE })
      }
      return
    }

    // The in-flight guard matters more here than anywhere else in this file: this is the only spawn on the
    // platform, and `nvidia-smi` on a busy or initialising driver can take seconds.
    if (this.nvidiaInFlight) return
    this.nvidiaInFlight = true
    void this.runNvidiaSmi()
      .then((output) => {
        this.nvidiaFailures = 0
        this.onSample?.({ gpu: parseNvidiaSmiPercent(output) })
      })
      .catch((error: unknown) => {
        this.nvidiaFailures++
        this.onSample?.({ gpu: UNAVAILABLE })
        this.onNvidiaFailure(error)
      })
      .finally(() => {
        this.nvidiaInFlight = false
      })
  }

  /**
   * A rejected `nvidia-smi`, and the one rejection worth latching on.
   *
   * `ENOENT` is the binary not existing, which is not a condition that changes while the app runs, so the
   * mode goes to `none` and nothing spawns again. That case is the common one rather than an edge:
   * {@link LinuxStatsSource.probeGpuMode} resolves to `nvidia-smi` on any machine with no
   * `gpu_busy_percent` file, which is every Intel-integrated Linux laptop, and i915 has never exported one.
   *
   * Every OTHER rejection is deliberately NOT latched, and the reason is the asymmetry of being wrong. A
   * driver reset or a still-initialising GPU makes `nvidia-smi` time out for several seconds on a machine
   * that answers perfectly afterwards; latching there costs the GPU row for the rest of the session on a
   * real NVIDIA box, which is worse than a spawn per tick. A consecutive-failure counter cannot separate the
   * two without being long enough to be pointless, so the accepted cost stays exactly where
   * `probeGpuMode`'s comment accepted it: an installed `nvidia-smi` with no NVIDIA device to talk to exits
   * non-zero every tick, forever, and reads `N/A` through the parser.
   */
  private onNvidiaFailure(error: unknown): void {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined
    if (code === "ENOENT") {
      this.gpuMode = { kind: "none" }
      this.log("info", "linux gpu: nvidia-smi is not installed — reading as N/A, no further spawns")
      return
    }
    // One line per source rather than per tick: at a 1s cadence a per-tick warning is 60 lines a minute for
    // the lifetime of the process. Same rule as `darwin.ts`'s `failures === 1 || failures % 60 === 0`, minus
    // the periodic re-log, because there is only one command here to be told about.
    if (this.nvidiaFailures === 1) {
      this.log("warn", `linux gpu: nvidia-smi failed — ${String(error)}`)
    }
  }

  /**
   * Decide once how the GPU number comes in.
   *
   * The sysfs file is preferred whenever it exists because it costs a file read against a process spawn.
   * `nvidia-smi` is not probed for existence here — a spawn to find out whether spawning works is the same
   * cost as trying — so an NVIDIA-less machine with the binary installed resolves to `nvidia-smi` and then
   * reads `N/A` forever through the parser. That is the right row content, at the price of one spawn per tick
   * on a machine that will never answer, which is the one case worth revisiting if it turns up. The machine
   * with no binary at all is a different case and is not paid for twice:
   * {@link LinuxStatsSource.onNvidiaFailure} latches it to `none` on the first `ENOENT`.
   */
  private probeGpuMode(): GpuMode {
    let cards: string[] = []
    try {
      cards = this.listDir(DRM_ROOT)
        .filter((name) => /^card\d+$/.test(name))
        .sort()
    } catch {
      cards = []
    }

    for (const card of cards) {
      const path = join(DRM_ROOT, card, "device", "gpu_busy_percent")
      try {
        // Read rather than stat: the file can exist and be unreadable, and a mode that cannot deliver a
        // number is not a mode. A successful parse here is the only thing that settles it.
        if (parseGpuBusyPercent(this.readFile(path)) !== UNAVAILABLE) {
          this.log("info", `linux gpu: using ${path}`)
          return { kind: "sysfs", path }
        }
      } catch {
        continue
      }
    }

    this.log(
      "info",
      cards.length === 0
        ? "linux gpu: no drm cards found, falling back to nvidia-smi"
        : `linux gpu: no gpu_busy_percent among [${cards.join(",")}], falling back to nvidia-smi`,
    )
    return { kind: "nvidia-smi" }
  }

  private sampleBattery(): void {
    if (this.batteryDir === null) this.resolvePowerSupply()

    if (this.batteryDir === "") {
      // A desktop. `pluggedInReading` forces the flag FALSE here even though a desktop with a `Mains` supply
      // reads `online=1` and is very obviously plugged in — that is the WPF app's `NoSystemBattery` coupling,
      // and `core/battery.ts` carries the argument for reproducing it. An earlier version of this comment
      // asserted the opposite and was wrong.
      this.onSample?.({ battery: UNAVAILABLE, pluggedIn: pluggedInReading(UNAVAILABLE, this.readPlugged()) })
      return
    }

    let percent = UNAVAILABLE
    try {
      percent = parseBatteryCapacity(this.readFile(join(this.batteryDir ?? "", "capacity")))
    } catch {
      percent = UNAVAILABLE
    }
    this.onSample?.({ battery: percent, pluggedIn: pluggedInReading(percent, this.readPlugged()) })
  }

  private readPlugged(): boolean {
    const online = this.tryRead(this.acOnlinePath)
    const status = this.batteryDir === "" ? null : this.tryRead(join(this.batteryDir ?? "", "status"))
    return isPluggedIn(online, status)
  }

  /**
   * Find the battery and the mains adapter, once.
   *
   * `BAT0` is not universal — ThinkPads use `BAT1`, and a two-battery laptop has both — so the directory is
   * discovered rather than assumed, first match in sorted order. The adapter is any supply whose `type` is
   * `Mains`, which is more reliable than matching the name: it is `AC`, `ADP0`, `ADP1`, `ACAD` and
   * `MacBook-Charger` across different firmware, and `type` is the ABI's own answer to the question.
   */
  private resolvePowerSupply(): void {
    let entries: string[] = []
    try {
      entries = this.listDir(POWER_SUPPLY_ROOT).sort()
    } catch {
      this.batteryDir = ""
      this.acOnlinePath = null
      this.log("info", "linux battery: no /sys/class/power_supply — reading as N/A")
      return
    }

    this.batteryDir = ""
    for (const name of entries) {
      const dir = join(POWER_SUPPLY_ROOT, name)
      const type = this.tryRead(join(dir, "type"))?.trim().toLowerCase()
      if (type === "battery" && this.batteryDir === "") {
        this.batteryDir = dir
      } else if (type === "mains" && this.acOnlinePath === null) {
        this.acOnlinePath = join(dir, "online")
      }
    }

    this.log(
      "info",
      `linux battery: battery=${this.batteryDir === "" ? "none" : this.batteryDir} ` +
        `mains=${this.acOnlinePath ?? "none"}`,
    )
  }

  /** A read that answers `null` for "not there", since that is the input `isPluggedIn` is written against. */
  private tryRead(path: string | null): string | null {
    if (path === null) return null
    try {
      return this.readFile(path)
    } catch {
      return null
    }
  }
}

function nvidiaSmiPercent(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
      { timeout: NVIDIA_SMI_TIMEOUT_MS, encoding: "utf8" },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout)
      },
    )
  })
}
