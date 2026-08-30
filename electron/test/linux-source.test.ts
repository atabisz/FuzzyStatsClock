/**
 * `linux.ts` as a SOURCE, driven through its injected `readFile` / `listDir` / `runNvidiaSmi` seams. The
 * wiring and the discovery, not the parsing.
 *
 * `test/linux-parse.test.ts` pins what the text means and says loudly that its samples are synthetic. This
 * file inherits that limitation and adds a second one worth naming separately: **the fake filesystem below is
 * my belief about a sysfs layout, so a wrong path here is a wrong path in both places and nothing fails.**
 * What these arms genuinely settle is everything downstream of the path — which file's content reaches which
 * field, how often each one is read, what happens when a read throws, and that the discovery runs once.
 *
 * ## The coincidence this file has to work around, which the macOS sibling did not
 *
 * On macOS four different commands are read by four different parsers, so a crossed wire lands unparseable
 * text in a field and shows up as the sentinel. Here `gpu_busy_percent` and `capacity` are **the same format**
 * — a bare integer — and `parseGpuBusyPercent` and `parseBatteryCapacity` accept each other's input happily.
 * The only thing distinguishing those two readings is the *path*, so the GPU and battery values in the
 * fixtures below are deliberately different numbers (37 and 87), and the first arm asserts that.
 *
 * ## Real timers, virtual battery clock
 *
 * Same shape as `darwin-source.test.ts`: `tick()` is private, so the way in is a 20ms cadence and a sleep.
 * Tick-dependent counts are floors — except the battery, which is exact because its 60s cadence is measured
 * on the source's own virtual clock (`elapsedMs += intervalMs`), and except the per-tick read counts, which
 * are asserted against `sampleCount` rather than against wall clock.
 */
import { describe, expect, test } from "bun:test"
import { LinuxStatsSource } from "../src/main/telemetry/linux.js"
import {
  isPluggedIn,
  memoryPercent,
  parseBatteryCapacity,
  parseGpuBusyPercent,
  parseMemInfo,
  parseNvidiaSmiPercent,
  swapPercent,
} from "../src/main/telemetry/parse/linux.js"
import { UNAVAILABLE, type StatsSample } from "../src/shared.js"

const DRM = "/sys/class/drm"
const PSU = "/sys/class/power_supply"
const MEMINFO_PATH = "/proc/meminfo"
const busyPath = (card: string): string => `${DRM}/${card}/device/gpu_busy_percent`

/**
 * 16 GiB, moderate load, swap at exactly 75%. Hand-written, like every Linux sample in this repo.
 *
 * The swap figures are chosen so paging (75) is nowhere near memory (41.13): both come out of this one file
 * through two functions, and two numbers a few points apart would make a transposed pair a subtle failure
 * instead of an obvious one.
 */
const MEMINFO = `MemTotal:       16316456 kB
MemFree:          281612 kB
MemAvailable:    9605928 kB
Buffers:          317308 kB
Cached:          8021404 kB
SwapTotal:       2097152 kB
SwapFree:         524288 kB
`

const MEM_PERCENT = memoryPercent(parseMemInfo(MEMINFO))
const PAG_PERCENT = swapPercent(parseMemInfo(MEMINFO))

interface FakeFs {
  files: Record<string, string>
  dirs: Record<string, string[]>
}

/** An AMD laptop: one card with a busy file, a battery at 87%, and a mains adapter with the cable in. */
function laptopFs(): FakeFs {
  return {
    files: {
      [MEMINFO_PATH]: MEMINFO,
      [busyPath("card0")]: "37\n",
      [`${PSU}/AC/type`]: "Mains\n",
      [`${PSU}/AC/online`]: "1\n",
      [`${PSU}/BAT0/type`]: "Battery\n",
      [`${PSU}/BAT0/capacity`]: "87\n",
      [`${PSU}/BAT0/status`]: "Charging\n",
    },
    dirs: {
      // The connector directories are real and are in every `/sys/class/drm`. They are here as the near-miss
      // the `/^card\d+$/` filter exists for — `card0-eDP-1` has no `device/gpu_busy_percent` under it.
      [DRM]: ["card0", "card0-eDP-1", "card0-HDMI-A-1", "renderD128", "version"],
      [PSU]: ["AC", "BAT0"],
    },
  }
}

/** What a missing sysfs path really throws, `code` and all, because the source now branches on `code`. */
function enoent(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), { code: "ENOENT" })
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

interface Harness {
  readonly source: LinuxStatsSource
  /** Mutable, so a file can be taken away mid-run. */
  readonly fs: FakeFs
  /** Every `readFile` path, in order, duplicates included. */
  readonly reads: string[]
  readonly dirLists: string[]
  readonly nvidiaCalls: { n: number }
  /** `main.ts`'s own merge: `Object.assign(latest, sample)` over an all-`UNAVAILABLE` seed. */
  readonly latest: StatsSample
  readonly logs: string[]
}

/**
 * Start a source over a fake filesystem.
 *
 * `latest` is seeded and merged exactly as `main.ts:734` does. A source emitting the right numbers under the
 * wrong keys would still hand a plausible-looking partial to a test that inspected the partials directly.
 */
function harness(
  options: {
    fs?: FakeFs
    nvidia?: () => Promise<string>
    intervalSec?: number
    batteryIntervalSec?: number
  } = {},
): Harness {
  const fs = options.fs ?? laptopFs()
  const reads: string[] = []
  const dirLists: string[] = []
  const nvidiaCalls = { n: 0 }
  const logs: string[] = []
  const latest: StatsSample = {
    cpu: UNAVAILABLE,
    mem: UNAVAILABLE,
    gpu: UNAVAILABLE,
    pag: UNAVAILABLE,
    battery: UNAVAILABLE,
    pluggedIn: false,
    uptimeText: "",
  }
  // Wrapped before construction rather than patched in after it: the field is private and readonly, and a
  // test reaching past that would be testing a shape the app cannot rely on.
  const nvidia = options.nvidia ?? ((): Promise<string> => Promise.resolve("42\n"))
  const source = new LinuxStatsSource({
    intervalSec: options.intervalSec ?? 0.02,
    batteryIntervalSec: options.batteryIntervalSec ?? 60,
    log: (level, message) => logs.push(`${level}: ${message}`),
    readFile: (path) => {
      reads.push(path)
      const content = fs.files[path]
      if (content === undefined) throw enoent(path)
      return content
    },
    listDir: (path) => {
      dirLists.push(path)
      const entries = fs.dirs[path]
      if (entries === undefined) throw enoent(path)
      return [...entries]
    },
    runNvidiaSmi: () => {
      nvidiaCalls.n++
      return nvidia()
    },
  })
  source.start((sample) => Object.assign(latest, sample))
  return { source, fs, reads, dirLists, nvidiaCalls, latest, logs }
}

const countReads = (reads: readonly string[], path: string): number =>
  reads.filter((p) => p === path).length

describe("the fake filesystem is distinguishable, which is what licenses every arm below", () => {
  test("mem, pag, gpu and batt are four different numbers, and the last two share a parser", () => {
    const values = [MEM_PERCENT, PAG_PERCENT, parseGpuBusyPercent("37\n"), parseBatteryCapacity("87\n")]
    expect(values).toEqual([MEM_PERCENT, 75, 37, 87])
    expect(new Set(values).size).toBe(4)
    for (const value of values) expect(value).toBeGreaterThan(0)

    // The coincidence named in the header, asserted rather than described: these two parsers cannot tell each
    // other's files apart, so only the differing values make a crossed GPU/battery wire visible.
    expect(parseGpuBusyPercent("87\n")).toBe(87)
    expect(parseBatteryCapacity("37\n")).toBe(37)
  })

  test("cross-feeding the wrong content does NOT produce a plausible number", () => {
    // The negative control for the fields that do have distinct formats.
    expect(parseMemInfo("37\n")).toBeNull()
    expect(parseGpuBusyPercent(MEMINFO)).toBe(UNAVAILABLE)
    expect(parseBatteryCapacity(MEMINFO)).toBe(UNAVAILABLE)
    expect(parseNvidiaSmiPercent(MEMINFO)).toBe(UNAVAILABLE)
  })
})

describe("the file table", () => {
  test("is exactly these eight paths on the first tick", () => {
    // Pinned as strings, for the same reason `darwin-source.test.ts` pins its command lines: a path typo is a
    // permanently `N/A` row on a platform no check in this repo can reach, so it has to break a test.
    const h = harness()
    h.source.stop()
    expect(h.source.sampleCount).toBe(1)

    expect([...new Set(h.reads)].sort()).toEqual([
      "/proc/meminfo",
      "/sys/class/drm/card0/device/gpu_busy_percent",
      "/sys/class/power_supply/AC/online",
      "/sys/class/power_supply/AC/type",
      "/sys/class/power_supply/BAT0/capacity",
      "/sys/class/power_supply/BAT0/status",
      "/sys/class/power_supply/BAT0/type",
    ])
    expect(h.dirLists.sort()).toEqual(["/sys/class/drm", "/sys/class/power_supply"])
  })

  test("every path is POSIX, which on this host is a property of the MODULE and not of the test", () => {
    // The arm `node:path/posix` exists for. Under plain `node:path` on Windows this module composes
    // `/sys/class/drm\card0\device\gpu_busy_percent`, and a fake filesystem keyed on the paths it happens to
    // produce would agree with it — so the test would pass while the app read nothing on a real Linux box.
    const h = harness()
    h.source.stop()
    for (const path of [...h.reads, ...h.dirLists]) {
      expect(path.includes("\\"), `${path} must be POSIX`).toBe(false)
      expect(path.startsWith("/"), `${path} must be absolute`).toBe(true)
    }
  })

  test("the GPU file is read TWICE on the first tick, once to probe and once to sample", () => {
    // Not a defect worth code — it is one sub-millisecond virtual-file read, once per process — but asserting
    // it keeps the count above honest rather than leaving a reader to wonder if the probe was skipped.
    const h = harness()
    h.source.stop()
    expect(countReads(h.reads, busyPath("card0"))).toBe(2)
  })
})

describe("each file's content reaches its own field", () => {
  test("mem, pag, gpu, batt and the plug land where they belong", async () => {
    const h = harness()
    await sleep(40)
    h.source.stop()

    expect(h.latest.mem).toBe(MEM_PERCENT)
    expect(h.latest.pag).toBe(75)
    expect(h.latest.gpu).toBe(37)
    expect(h.latest.battery).toBe(87)
    expect(h.latest.pluggedIn).toBe(true)
  })

  test("cpu is in-process, and its first reading is the sentinel", async () => {
    // `os.cpus()` is `/proc/stat`, so this arm runs against this machine's real counters rather than the fake
    // filesystem. The first tick has one snapshot and no delta, which is a real `N/A` for one interval at
    // every launch — emitted rather than hidden, which is why it is asserted.
    //
    // POLLED, not slept once. `cpuBusyPercent` returns the sentinel for a zero total delta, and two
    // `os.cpus()` reads inside one clock tick's resolution really do produce one at a 20ms cadence —
    // `cpu-delta.ts:95` says so in as many words. A single sleep-then-assert made this arm flaky, which the
    // mutation run measuring this file surfaced: two defects that cannot touch the CPU path both reported it
    // as their first failure. The bound is what keeps it a test rather than a wait.
    const h = harness()
    expect(h.latest.cpu).toBe(UNAVAILABLE)
    let cpu = UNAVAILABLE
    for (let attempt = 0; attempt < 40 && cpu === UNAVAILABLE; attempt++) {
      await sleep(25)
      cpu = h.latest.cpu
    }
    h.source.stop()
    expect(cpu).toBeGreaterThanOrEqual(0)
    expect(cpu).toBeLessThanOrEqual(100)
  })

  test("one /proc/meminfo read per tick serves both mem and pag", async () => {
    // Reading it twice would be two different kernel instants behind two numbers the user reads as one
    // snapshot. Asserted against `sampleCount` rather than a sleep, so it is exact.
    const h = harness()
    await sleep(120)
    h.source.stop()
    expect(h.source.sampleCount).toBeGreaterThanOrEqual(3)
    expect(countReads(h.reads, MEMINFO_PATH)).toBe(h.source.sampleCount)
  })
})

describe("the GPU mode is resolved once", () => {
  test("sysfs is preferred, probed once, and nvidia-smi is never spawned", async () => {
    const h = harness()
    await sleep(120)
    h.source.stop()

    expect(h.source.sampleCount).toBeGreaterThanOrEqual(3)
    // The whole point of caching the mode: one directory listing for the life of the process.
    expect(countReads(h.dirLists, DRM)).toBe(1)
    expect(h.nvidiaCalls.n).toBe(0)
    expect(h.source.describe()).toContain("gpu via sysfs")
    expect(h.logs).toContain(`info: linux gpu: using ${busyPath("card0")}`)
  })

  test("cards are taken in SORTED order, not listing order", async () => {
    const fs = laptopFs()
    fs.dirs[DRM] = ["card1", "card0"]
    fs.files[busyPath("card0")] = "37\n"
    fs.files[busyPath("card1")] = "99\n"
    const h = harness({ fs })
    await sleep(40)
    h.source.stop()

    expect(h.latest.gpu).toBe(37)
    expect(h.latest.gpu).not.toBe(99)
    expect(h.reads).not.toContain(busyPath("card1"))
  })

  test("the probe READS rather than stats, so an unreadable card0 falls through to card1", async () => {
    // The discriminating arm for `parseGpuBusyPercent(...) !== UNAVAILABLE` instead of an existence check.
    // A runtime-suspended amdgpu card has the file and reads empty; a stat-based probe settles on it and the
    // GPU row reads `N/A` for the life of the process while a second card sits there answering.
    const fs = laptopFs()
    fs.dirs[DRM] = ["card1", "card0", "card0-eDP-1", "renderD128"]
    fs.files[busyPath("card0")] = "\n"
    fs.files[busyPath("card1")] = "99\n"
    const h = harness({ fs })
    await sleep(40)
    h.source.stop()

    expect(h.latest.gpu).toBe(99)
    expect(h.source.describe()).toContain("gpu via sysfs")
    expect(h.logs).toContain(`info: linux gpu: using ${busyPath("card1")}`)
    // And the connector directory was never opened: `/^card\d+$/` and not `/^card/`. Sorted, `card0-eDP-1`
    // comes between the two cards, so a looser filter would have read it on the way past.
    expect(h.reads.some((p) => p.includes("-eDP-"))).toBe(false)
  })

  test("no drm directory at all falls back to nvidia-smi", async () => {
    const fs = laptopFs()
    delete fs.dirs[DRM]
    const h = harness({ fs })
    await sleep(40)
    h.source.stop()

    expect(h.latest.gpu).toBe(42)
    expect(h.nvidiaCalls.n).toBeGreaterThanOrEqual(1)
    expect(h.logs).toContain("info: linux gpu: no drm cards found, falling back to nvidia-smi")
    expect(h.source.describe()).toContain("gpu via nvidia-smi")
  })

  test("cards with no busy file fall back too, and the log names the cards it looked at", async () => {
    // The Intel-integrated case, which is the common one: i915 exposes no `gpu_busy_percent`.
    const fs = laptopFs()
    fs.dirs[DRM] = ["card0", "card1"]
    delete fs.files[busyPath("card0")]
    const h = harness({ fs })
    await sleep(40)
    h.source.stop()

    expect(h.latest.gpu).toBe(42)
    expect(h.logs).toContain(
      "info: linux gpu: no gpu_busy_percent among [card0,card1], falling back to nvidia-smi",
    )
  })
})

describe("nvidia-smi is the only spawn, and it is bounded", () => {
  const noCards = (): FakeFs => {
    const fs = laptopFs()
    delete fs.dirs[DRM]
    return fs
  }

  test("a call slower than the interval is DROPPED, not queued", async () => {
    const h = harness({ fs: noCards(), nvidia: () => new Promise<string>(() => {}) })
    await sleep(120)
    h.source.stop()

    expect(h.nvidiaCalls.n).toBe(1)
    // The positive control: the ticks really were arriving while the spawn count stayed at one.
    expect(countReads(h.reads, MEMINFO_PATH)).toBeGreaterThanOrEqual(3)
    expect(h.latest.gpu).toBe(UNAVAILABLE)
  })

  test("a rejection is the sentinel, warns ONCE, and keeps trying", async () => {
    const h = harness({
      fs: noCards(),
      nvidia: () => Promise.reject(new Error("nvidia-smi: timed out")),
    })
    await sleep(120)
    h.source.stop()

    expect(h.latest.gpu).toBe(UNAVAILABLE)
    // Keeps trying, on purpose: a timeout is what an initialising or resetting driver looks like on a machine
    // that will answer perfectly a few seconds later, so this one must NOT latch.
    expect(h.nvidiaCalls.n).toBeGreaterThanOrEqual(3)
    const warnings = h.logs.filter((line) => line.startsWith("warn: linux gpu"))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("timed out")
    // Containment: the four file-read metrics are unaffected.
    expect(h.latest.mem).toBe(MEM_PERCENT)
    expect(h.latest.battery).toBe(87)
  })

  test("ENOENT LATCHES to none — one spawn, then never again", async () => {
    // The case the module header used to claim the probe handled and it never did. Reachable on every
    // Intel-integrated Linux laptop, where there is no `gpu_busy_percent` and no `nvidia-smi`, and the cost of
    // not latching is a child process every tick for the life of the app.
    const h = harness({ fs: noCards(), nvidia: () => Promise.reject(enoent("nvidia-smi")) })
    await sleep(120)
    h.source.stop()

    expect(h.source.sampleCount).toBeGreaterThanOrEqual(3)
    expect(h.nvidiaCalls.n).toBe(1)
    expect(h.latest.gpu).toBe(UNAVAILABLE)
    expect(h.source.describe()).toContain("gpu via none")
    expect(h.logs).toContain(
      "info: linux gpu: nvidia-smi is not installed — reading as N/A, no further spawns",
    )
    // And it latched quietly: a missing binary is a fact about the machine, not a fault to warn about every
    // launch. The contrast with the arm above is the whole distinction.
    expect(h.logs.filter((line) => line.startsWith("warn:"))).toHaveLength(0)
  })

  test("unparseable output is the sentinel and does not latch", async () => {
    // A vGPU-mode card prints `[N/A]`. It resolved, so the binary works and the driver may start answering.
    const h = harness({ fs: noCards(), nvidia: () => Promise.resolve("[N/A]\n") })
    await sleep(120)
    h.source.stop()

    expect(h.latest.gpu).toBe(UNAVAILABLE)
    expect(h.nvidiaCalls.n).toBeGreaterThanOrEqual(3)
    expect(h.source.describe()).toContain("gpu via nvidia-smi")
  })
})

describe("the battery is discovered, once, and read on its own cadence", () => {
  test("finds BAT1 and an ADP0 adapter BY TYPE, not by name", async () => {
    // `BAT0` is `BAT1` on plenty of ThinkPads and the adapter is `AC`, `ADP0`, `ADP1`, `ACAD` or
    // `MacBook-Charger` depending on firmware. `type` is the sysfs ABI's own answer, so the names below are
    // ones a name-matching implementation gets wrong.
    const fs = laptopFs()
    fs.dirs[PSU] = ["ADP0", "BAT1"]
    fs.files = {
      ...fs.files,
      [`${PSU}/ADP0/type`]: "Mains\n",
      [`${PSU}/ADP0/online`]: "1\n",
      [`${PSU}/BAT1/type`]: "Battery\n",
      [`${PSU}/BAT1/capacity`]: "64\n",
      [`${PSU}/BAT1/status`]: "Discharging\n",
    }
    delete fs.files[`${PSU}/AC/type`]
    delete fs.files[`${PSU}/AC/online`]
    delete fs.files[`${PSU}/BAT0/type`]

    const h = harness({ fs })
    await sleep(40)
    h.source.stop()

    expect(h.latest.battery).toBe(64)
    // `online` beats a disagreeing `status`, which is the parser's rule and is exercised here end to end: the
    // battery says `Discharging` while the cable is in, which a plugged-in laptop under load really reports.
    expect(h.latest.pluggedIn).toBe(true)
    expect(h.logs).toContain(`info: linux battery: battery=${PSU}/BAT1 mains=${PSU}/ADP0/online`)
  })

  test("discovery runs once: one listing and one type read per entry, ever", async () => {
    const h = harness()
    await sleep(120)
    h.source.stop()

    expect(h.source.sampleCount).toBeGreaterThanOrEqual(3)
    expect(countReads(h.dirLists, PSU)).toBe(1)
    expect(countReads(h.reads, `${PSU}/AC/type`)).toBe(1)
    expect(countReads(h.reads, `${PSU}/BAT0/type`)).toBe(1)
  })

  test("the charge is read every 60s, so exactly ONCE across a run this short", async () => {
    // Exact rather than a floor: 60s is measured on the source's virtual clock, which advances 20ms per tick
    // regardless of how long a tick really took. Matches `pmset` on macOS and the WPF timer it came from.
    const h = harness()
    await sleep(120)
    h.source.stop()

    expect(h.source.sampleCount).toBeGreaterThanOrEqual(3)
    expect(countReads(h.reads, `${PSU}/BAT0/capacity`)).toBe(1)
    expect(countReads(h.reads, `${PSU}/BAT0/status`)).toBe(1)
    // And it happened on the FIRST tick rather than 60s in. Without that the battery row reads `N/A` for the
    // first minute of every launch, which looks exactly like a desktop.
    expect(h.latest.battery).toBe(87)
  })

  test("a shorter battery interval is honoured", async () => {
    // The positive control for the arm above: the 1-read result there is the cadence, not a stuck read.
    const h = harness({ batteryIntervalSec: 0.02 })
    await sleep(120)
    h.source.stop()
    expect(countReads(h.reads, `${PSU}/BAT0/capacity`)).toBeGreaterThanOrEqual(3)
  })
})

describe("degradation", () => {
  test("a desktop reads N/A and NOT plugged in, even with online=1", async () => {
    // The `pluggedInReading` coupling, and the sharpest arm in this file. A desktop's `Mains` supply reports
    // `online=1` and is very obviously on mains, and the flag is still forced false because there is no
    // percentage — that is the WPF app's `NoSystemBattery` behaviour, which `core/battery.ts` argues for. A
    // source that simply forwarded `isPluggedIn`'s answer would pass every other arm here.
    expect(isPluggedIn("1\n", null)).toBe(true)

    const fs = laptopFs()
    fs.dirs[PSU] = ["AC"]
    const h = harness({ fs })
    await sleep(40)
    h.source.stop()

    expect(h.latest.battery).toBe(UNAVAILABLE)
    expect(h.latest.pluggedIn).toBe(false)
    expect(h.logs).toContain(`info: linux battery: battery=none mains=${PSU}/AC/online`)
    // No capacity read was attempted against a directory that does not exist.
    expect(h.reads.some((p) => p.endsWith("/capacity"))).toBe(false)
  })

  test("no /sys/class/power_supply at all is N/A and unplugged, and says so once", async () => {
    // A VM or a container. The log line is asserted verbatim because it is user-visible text and it carried
    // the `--` placeholder this port inherited from its own plan before the sweep to `N/A`.
    const fs = laptopFs()
    delete fs.dirs[PSU]
    const h = harness({ fs })
    await sleep(120)
    h.source.stop()

    expect(h.latest.battery).toBe(UNAVAILABLE)
    expect(h.latest.pluggedIn).toBe(false)
    expect(h.logs.filter((l) => l.includes("no /sys/class/power_supply"))).toEqual([
      "info: linux battery: no /sys/class/power_supply — reading as N/A",
    ])
    // The other metrics are untouched.
    expect(h.latest.mem).toBe(MEM_PERCENT)
    expect(h.latest.gpu).toBe(37)
  })

  test("/proc/meminfo throwing is TWO sentinels and SILENCE", async () => {
    // `/proc` unmounted is the only way here and retrying cannot fix it, so there is deliberately no log line
    // — asserted, because "logs nothing" is a decision and a later well-meaning `this.log` would be 60 lines
    // a minute. Both rows go to `N/A`; neither goes to 0, which would be a claim about the machine.
    const fs = laptopFs()
    delete fs.files[MEMINFO_PATH]
    const h = harness({ fs })
    await sleep(40)
    h.source.stop()

    expect(h.latest.mem).toBe(UNAVAILABLE)
    expect(h.latest.pag).toBe(UNAVAILABLE)
    expect(h.logs.some((line) => line.includes("meminfo"))).toBe(false)
    // Containment, and the positive control that the tick did not simply die at the first throw.
    expect(h.latest.gpu).toBe(37)
    expect(h.latest.battery).toBe(87)
  })

  test("a GPU file that disappears mid-run goes to the sentinel, not stale", async () => {
    // Runtime suspend, or a card removed on a hybrid-graphics machine. The mode stays resolved — re-probing
    // would spawn — so the row has to degrade through the read rather than through the probe.
    const h = harness()
    await sleep(40)
    expect(h.latest.gpu).toBe(37)

    delete h.fs.files[busyPath("card0")]
    await sleep(60)
    h.source.stop()

    expect(h.latest.gpu).toBe(UNAVAILABLE)
    expect(h.latest.gpu).not.toBe(37)
    // Still no spawn: a lost file is not a reason to change how the number is obtained.
    expect(h.nvidiaCalls.n).toBe(0)
    expect(countReads(h.dirLists, DRM)).toBe(1)
  })

  test("unparseable content everywhere is sentinels, not zeros and not a crash", async () => {
    const fs = laptopFs()
    for (const path of Object.keys(fs.files)) fs.files[path] = "unrelated output\n"
    // The spawn has to be unparseable too, and finding that out is what this arm was worth: an unreadable
    // `gpu_busy_percent` is not a GPU failure, it is a failed *probe*, so the mode falls through to
    // `nvidia-smi` and the row then reports whatever that says. Leaving the responder answering `42` had this
    // arm asserting a sentinel against a source that was working correctly.
    const h = harness({ fs, nvidia: () => Promise.resolve("unrelated output\n") })
    await sleep(40)
    h.source.stop()

    expect(h.latest.mem).toBe(UNAVAILABLE)
    expect(h.latest.pag).toBe(UNAVAILABLE)
    expect(h.latest.gpu).toBe(UNAVAILABLE)
    expect(h.source.describe()).toContain("gpu via nvidia-smi")
    expect(h.latest.battery).toBe(UNAVAILABLE)
    // `type` read as `unrelated output` matches neither `battery` nor `mains`, so there is no battery
    // directory and the plug is false by the same coupling as the desktop arm.
    expect(h.latest.pluggedIn).toBe(false)
  })
})

describe("cadence control", () => {
  test("setIntervalSec adopts in FULL, clamps at 0.1s, and leaves the battery cadence alone", async () => {
    const h = harness()
    // Linux never declines: four of the five metrics are file reads and the fifth is a fresh spawn, so there
    // is no long-lived child whose argument list would now be wrong. `win32.ts` is the source that returns
    // something other than what it was asked for, and `core/hover.ts` depends on the difference.
    expect(h.source.setIntervalSec(0.5)).toBe(0.5)
    expect(h.source.describe()).toContain("every 0.5s")
    expect(h.source.describe()).toContain("battery every 60s")
    expect(h.source.setIntervalSec(2)).toBe(2)
    // A floor rather than a policy: a zero or negative interval is a spin.
    expect(h.source.setIntervalSec(0.05)).toBe(0.1)
    expect(h.source.setIntervalSec(0)).toBe(0.1)
    // Idempotent — the same value back does not restart the timer.
    expect(h.source.setIntervalSec(0.1)).toBe(0.1)
    h.source.stop()
    await sleep(1)
  })

  test("describe() reports the mode as unprobed until the first tick resolves it", () => {
    const source = new LinuxStatsSource({ intervalSec: 0.02 })
    expect(source.describe()).toContain("gpu via unprobed")
    source.stop()
  })

  test("stop() ends sampling, and a stopped source reads nothing further", async () => {
    const h = harness()
    await sleep(60)
    h.source.stop()
    const atStop = h.reads.length
    await sleep(60)
    expect(h.reads.length).toBe(atStop)
  })
})

describe("what this still cannot settle", () => {
  test("every path above is a BELIEF about sysfs, and the same belief the module holds", () => {
    // Stated as an arm so it is read rather than skimmed in the header. The fake filesystem is keyed on the
    // paths this module composes, so the two agree by construction: if `/sys/class/drm/cardN/device/` is the
    // wrong shape on a real kernel, every arm above still passes and the GPU row is `N/A` on every Linux box.
    // Only a Linux host settles it, and `linux-parse.test.ts` carries the matching tripwire for the formats.
    const h = harness()
    h.source.stop()
    expect(h.reads).toContain(busyPath("card0"))
    expect(h.reads).toContain(`${PSU}/BAT0/capacity`)
  })
})
