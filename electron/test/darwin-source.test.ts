/**
 * `darwin.ts` as a SOURCE, driven through its injected `run` seam. The wiring, not the parsing.
 *
 * `test/darwin-parse.test.ts` pins what the four captures mean; this file pins that the right capture
 * reaches the right field, that the cadences are what the module claims, and that a slow or broken command
 * degrades the way the header says it does. Neither file needs a Mac and neither replaces one — see
 * "What this still cannot settle" at the bottom.
 *
 * ## Why a wiring test can compute its expectations with the parsers
 *
 * Every expectation below is `parser(fixture)`, which looks circular and is not: the question here is which
 * of four outputs lands in which of five fields, and the parsers' own numbers are pinned next door. What
 * licenses the claim is that the four fixtures produce four **distinct** values — asserted explicitly in the
 * first arm — so a crossed wire cannot pass by coincidence. Without that check a test asserting
 * `gpu === parseIoregGpuPercent(IOREG)` would also pass if `gpu` were fed `vm_stat`'s output and both came
 * back `UNAVAILABLE`.
 *
 * ## Real timers, short intervals
 *
 * `tick()` is private and the source schedules itself with `setInterval`, so the only honest way in is to
 * start it at a 20ms cadence and sleep. Two consequences are designed around rather than ignored:
 *
 *   - **Tick counts are asserted as floors, not equalities**, wherever the number depends on wall clock.
 *   - **The battery arm is exact anyway**, because its cadence is 60s of the source's own VIRTUAL clock
 *     (`elapsedSinceStartMs += intervalMs`), which advances 20ms per tick regardless of how long the tick
 *     really took. One battery invocation is guaranteed for any test shorter than 3000 ticks.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import os from "node:os"
import { join } from "node:path"
import { DarwinStatsSource } from "../src/main/telemetry/darwin.js"
import {
  memoryPercent,
  parseIoregGpuPercent,
  parsePmsetBattery,
  parseSwapUsage,
  parseVmStat,
  swapPercent,
} from "../src/main/telemetry/parse/darwin.js"
import { UNAVAILABLE, type StatsSample } from "../src/shared.js"

const FIXTURES = join(import.meta.dirname, "fixtures")
const read = (name: string): string => readFileSync(join(FIXTURES, name), "utf8")

const VM_STAT = read("macos-vm_stat.txt")
const SWAPUSAGE = read("macos-vm-swapusage.txt")
const IOREG = read("macos-ioreg-agxaccelerator.txt")
const PMSET_AC = read("macos-pmset-batt-ac-charged.txt")

/** `pmset -g batt` on a Mac mini: the drawing-from line and nothing else. Synthetic, and said to be. */
const PMSET_NO_BATTERY = "Now drawing from 'AC Power'\n"

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** The four fixtures by the command that produces them, which is the mapping under test. */
const OUTPUT: Record<string, string> = {
  vm_stat: VM_STAT,
  sysctl: SWAPUSAGE,
  ioreg: IOREG,
  pmset: PMSET_AC,
}

interface Harness {
  readonly source: DarwinStatsSource
  /** Every `run` call, in order. The command table as observed rather than as declared. */
  readonly calls: { file: string; args: readonly string[] }[]
  /** `main.ts`'s own merge: `Object.assign(latest, sample)` over an all-`UNAVAILABLE` seed. */
  readonly latest: StatsSample
  readonly logs: string[]
}

/**
 * Start a source with a scripted `run`.
 *
 * `latest` is seeded and merged exactly as `main.ts` does, because a partial-sample source is only correct
 * *through* that merge: a source that emitted `{gpu}` under the key `gpuPercent` would still deliver a
 * plausible-looking partial to a test that inspected the partials directly.
 */
function harness(
  respond: (file: string) => Promise<string>,
  options: { intervalSec?: number; batteryIntervalSec?: number } = {},
): Harness {
  const calls: { file: string; args: readonly string[] }[] = []
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
  const source = new DarwinStatsSource({
    intervalSec: options.intervalSec ?? 0.02,
    batteryIntervalSec: options.batteryIntervalSec ?? 60,
    log: (level, message) => logs.push(`${level}: ${message}`),
    run: (file, args) => {
      calls.push({ file, args })
      return respond(file)
    },
  })
  source.start((sample) => Object.assign(latest, sample))
  return { source, calls, latest, logs }
}

const fixtureResponder = (file: string): Promise<string> =>
  Promise.resolve(OUTPUT[file] ?? `no fixture for ${file}`)

const count = (calls: readonly { file: string }[], file: string): number =>
  calls.filter((c) => c.file === file).length

describe("the four fixtures are distinguishable, which is what licenses every arm below", () => {
  test("mem, pag, gpu and batt are four different numbers", () => {
    // Measured on this host: mem depends on `os.totalmem()` and so is not a literal, the other three are
    // 40.375, 26 and 100. Distinctness is the property that matters — it is what makes a crossed wire a
    // failure rather than a coincidence.
    const values = [
      memoryPercent(parseVmStat(VM_STAT), os.totalmem()),
      swapPercent(parseSwapUsage(SWAPUSAGE)),
      parseIoregGpuPercent(IOREG),
      parsePmsetBattery(PMSET_AC).percent,
    ]
    expect(new Set(values).size).toBe(4)
    // And none of them is the sentinel, or "the wire is connected" and "the parser gave up" would be the
    // same observation.
    for (const value of values) expect(value).toBeGreaterThan(0)
  })

  test("cross-parsing a fixture with the wrong parser does NOT produce the right answer", () => {
    // The negative control for the whole file. If `ioreg`'s output were routed to the memory field, this is
    // the value that would arrive — and it is the sentinel, not a plausible percentage.
    expect(parseIoregGpuPercent(VM_STAT)).toBe(UNAVAILABLE)
    expect(swapPercent(parseSwapUsage(IOREG))).toBe(UNAVAILABLE)
    expect(parsePmsetBattery(VM_STAT).percent).toBe(UNAVAILABLE)
    expect(memoryPercent(parseVmStat(SWAPUSAGE), os.totalmem())).toBe(UNAVAILABLE)
  })
})

describe("the command table", () => {
  test("is the four exact command lines the header says were verified", async () => {
    // Pinned as strings on purpose. The module header names `ioreg -d 1` as a plausible-looking optimisation
    // whose interaction with `-r -c` is unverified, and the cost of it being wrong is a GPU row that reads
    // `N/A` on every Mac — a silent failure on a platform no check here can reach. So the tuning has to
    // break a test rather than ship.
    const h = harness(fixtureResponder)
    await sleep(10)
    h.source.stop()

    const first = new Map(h.calls.map((c) => [c.file, c.args]))
    expect([...first.keys()].sort()).toEqual(["ioreg", "pmset", "sysctl", "vm_stat"])
    expect(first.get("vm_stat")).toEqual([])
    expect(first.get("sysctl")).toEqual(["-n", "vm.swapusage"])
    expect(first.get("ioreg")).toEqual(["-r", "-c", "AGXAccelerator", "-l"])
    expect(first.get("pmset")).toEqual(["-g", "batt"])
  })

  test("issues all four on the FIRST tick rather than waiting out the battery interval", async () => {
    // `start()` sets every `nextDueMs` to 0 for this reason. Without it the battery row would read `N/A` for
    // the first 60 seconds of every launch, which looks exactly like a Mac with no battery.
    const h = harness(fixtureResponder, { batteryIntervalSec: 600 })
    await sleep(10)
    h.source.stop()
    expect(count(h.calls, "pmset")).toBe(1)
    expect(h.latest.battery).toBe(100)
  })
})

describe("each command's output reaches its own field", () => {
  test("mem, pag, gpu and batt land where they belong", async () => {
    const h = harness(fixtureResponder)
    await sleep(40)
    h.source.stop()

    expect(h.latest.mem).toBe(memoryPercent(parseVmStat(VM_STAT), os.totalmem()))
    expect(h.latest.pag).toBe(swapPercent(parseSwapUsage(SWAPUSAGE)))
    expect(h.latest.gpu).toBe(parseIoregGpuPercent(IOREG))
    expect(h.latest.battery).toBe(100)
    expect(h.latest.pluggedIn).toBe(true)
  })

  test("cpu is in-process, and its first reading is the sentinel", async () => {
    // `os.cpus()` is the same call on every platform, so this arm genuinely runs here rather than being
    // stubbed. The first tick has one snapshot and no delta, which is a real `N/A` on screen for one
    // interval at every launch — emitted rather than hidden, and the reason it is asserted.
    //
    // POLLED rather than slept once, for the reason `linux-source.test.ts`'s twin arm carries in full:
    // `cpuBusyPercent` returns the sentinel on a zero total delta, and two `os.cpus()` reads inside one clock
    // tick's resolution produce one at a 20ms cadence. This arm was written sleep-then-assert first and was
    // latently flaky; the Linux file's mutation run is what caught it.
    const h = harness(fixtureResponder)
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

  test("a desktop Mac reports NO battery and NOT plugged in, which the parser alone does not", async () => {
    // The one place the source and the parser deliberately disagree, and so the sharpest arm in the file:
    // `parsePmsetBattery` reads `Now drawing from 'AC Power'` as plugged in, and `pluggedInReading` then
    // forces the flag false because the percentage is absent. That is the WPF app's `NoSystemBattery`
    // coupling (`core/battery.ts`), and a source that simply forwarded the parser's pair would pass every
    // other arm here.
    expect(parsePmsetBattery(PMSET_NO_BATTERY)).toEqual({ percent: UNAVAILABLE, pluggedIn: true })

    const h = harness((file) =>
      Promise.resolve(file === "pmset" ? PMSET_NO_BATTERY : (OUTPUT[file] ?? "")),
    )
    await sleep(20)
    h.source.stop()
    expect(h.latest.battery).toBe(UNAVAILABLE)
    expect(h.latest.pluggedIn).toBe(false)
  })
})

describe("cadences", () => {
  test("the three fast commands repeat and the battery command does not", async () => {
    const h = harness(fixtureResponder)
    await sleep(120)
    h.source.stop()

    // Floors, because the tick count is wall-clock dependent. The point is the RATIO: three commands moving
    // while a fourth stays put.
    expect(count(h.calls, "vm_stat")).toBeGreaterThanOrEqual(3)
    expect(count(h.calls, "sysctl")).toBeGreaterThanOrEqual(3)
    expect(count(h.calls, "ioreg")).toBeGreaterThanOrEqual(3)
    // Exact, and it can be: 60s is measured on the source's virtual clock, which advances 20ms per tick.
    expect(count(h.calls, "pmset")).toBe(1)
  })

  test("setIntervalSec adopts in full, clamps at 0.1s, and leaves the battery cadence alone", async () => {
    const h = harness(fixtureResponder, { intervalSec: 0.02 })
    expect(h.source.setIntervalSec(0.5)).toBe(0.5)
    expect(h.source.describe()).toContain("every 0.5s")
    expect(h.source.describe()).toContain("pmset every 60s")
    // macOS never declines — every command is a fresh spawn, so there is no long-lived child whose argument
    // list would now be wrong. `win32.ts` is the source that returns something other than what it was asked.
    expect(h.source.setIntervalSec(2)).toBe(2)
    // The floor is a guard against a zero or negative interval becoming a spin, not a policy.
    expect(h.source.setIntervalSec(0.05)).toBe(0.1)
    expect(h.source.setIntervalSec(0)).toBe(0.1)
    // Idempotent: the same value back does not restart the timer.
    expect(h.source.setIntervalSec(0.1)).toBe(0.1)
    h.source.stop()
    await sleep(1)
  })

  test("stop() ends the sampling, and a stopped source issues nothing further", async () => {
    const h = harness(fixtureResponder)
    await sleep(60)
    h.source.stop()
    const atStop = h.calls.length
    await sleep(60)
    expect(h.calls.length).toBe(atStop)
  })
})

describe("degradation", () => {
  test("a command slower than its interval is DROPPED, not queued", async () => {
    // The in-flight guard, and the arm that discriminates it from a queue: `vm_stat` never resolves, so a
    // source without the guard would have one child per tick outstanding. `sysctl` on the same tick timer is
    // the positive control — it proves the ticks really are arriving while `vm_stat` stays at one.
    const h = harness((file) =>
      file === "vm_stat" ? new Promise<string>(() => {}) : Promise.resolve(OUTPUT[file] ?? ""),
    )
    await sleep(120)
    h.source.stop()

    expect(count(h.calls, "vm_stat")).toBe(1)
    expect(count(h.calls, "sysctl")).toBeGreaterThanOrEqual(3)
    // And the metric it owns keeps its seed rather than being blanked or set to a stale guess.
    expect(h.latest.mem).toBe(UNAVAILABLE)
    expect(h.latest.pag).toBe(swapPercent(parseSwapUsage(SWAPUSAGE)))
  })

  test("a failing command counts, warns ONCE, and leaves the other four metrics alone", async () => {
    const h = harness((file) =>
      file === "ioreg" ? Promise.reject(new Error("ioreg: command not found")) : fixtureResponder(file),
    )
    await sleep(120)
    h.source.stop()

    expect(h.source.failures().gpu).toBeGreaterThanOrEqual(3)
    expect(h.source.failures().mem).toBe(0)
    // One warning for many failures. `c.failures === 1 || c.failures % 60 === 0` — a per-tick log would be
    // 60 lines a minute for the lifetime of the process on any Mac where `ioreg` is not what is assumed.
    const warnings = h.logs.filter((line) => line.startsWith("warn: darwin gpu"))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("command not found")
    // The failure is contained: the other three commands reported normally.
    expect(h.latest.gpu).toBe(UNAVAILABLE)
    expect(h.latest.mem).toBe(memoryPercent(parseVmStat(VM_STAT), os.totalmem()))
    expect(h.latest.battery).toBe(100)
  })

  test("unparseable output is the sentinel, not a crash and not a zero", async () => {
    // A `vm_stat` that prints something else — a different macOS version, a localised build — must reach the
    // row as `N/A`. Zero would be a claim about the machine; a throw would take the tick down with it.
    const h = harness(() => Promise.resolve("unrelated output\n"))
    await sleep(40)
    h.source.stop()
    expect(h.latest.mem).toBe(UNAVAILABLE)
    expect(h.latest.pag).toBe(UNAVAILABLE)
    expect(h.latest.gpu).toBe(UNAVAILABLE)
    expect(h.latest.battery).toBe(UNAVAILABLE)
    expect(h.latest.pluggedIn).toBe(false)
    // Nothing failed — `run` resolved every time — so this is the parsers' sentinel and not the catch block's.
    expect(h.source.failures().mem).toBe(0)
  })
})

describe("what this still cannot settle", () => {
  test("costs() reports per-command wall time, which is the number no Mac has produced yet", async () => {
    // The module header's honest statement, kept honest: `costs()` exists so the first Mac to run this says
    // what `ioreg` really cost. A resolved-promise stub measures the event loop, so the only assertable
    // property here is that the field is wired and numeric — the measurement itself needs the host.
    const h = harness(fixtureResponder)
    await sleep(40)
    h.source.stop()
    for (const key of ["mem", "pag", "gpu", "batt"]) {
      expect(typeof h.source.costs()[key]).toBe("number")
    }
  })
})
