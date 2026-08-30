/**
 * `process-count.ts` — the `14p` field, transcribed from `MainWindow.xaml.cs:1230-1269`.
 *
 * Every expectation here comes from that source read line by line, not from what a process count ought to
 * be. The distinction matters more than usual because the number is a small plausible integer either way:
 * this field is the count of processes over a **share-of-whole-machine** CPU threshold, and three different
 * readings of the same input produce 1, 3 and 400.
 *
 * The divergence that drives most of this file, measured below on one input:
 *
 * | Reading | Result on the same sample |
 * |---|---|
 * | share of the whole machine, `Δ / (elapsed × cores)` | **1** ← the port and the C# |
 * | per-core, `Δ / elapsed` — what `top` and `ps %cpu` show | 3 |
 * | every process with any CPU time at all | 4 |
 *
 * `os.cpus().length` is never read here. The core count is a parameter precisely so the arms can pin the
 * 32-core behaviour of this host *and* an 8-core machine's from the same test run.
 */
import { describe, expect, test } from "bun:test"
import { activeProcessCount, processCpuPercent, type ProcessCpuTimes } from "../src/core/process-count.js"
import { DEFAULTS } from "../src/core/settings.js"

const T = DEFAULTS.processCountThresholdPercent

/** pid → cumulative CPU ms. */
const times = (entries: Record<number, number>): ProcessCpuTimes =>
  new Map(Object.entries(entries).map(([pid, ms]) => [Number(pid), ms]))

/** One second of wall clock, the app's default stats interval. */
const SECOND = 1000

describe("the shipped default, since every arm is relative to it", () => {
  test("the threshold is 5%", () => {
    expect(T).toBe(5)
  })
})

describe("the threshold is a share of the WHOLE machine", () => {
  test("a process pinning one core of 32 reads 3.125% and does NOT count", () => {
    // The arm this module exists for. 1000ms of CPU time in a 1000ms interval is one saturated core, which
    // every system monitor on all three platforms displays as 100%. Here it is 100/32 = 3.125%, under the 5%
    // default, so it does not register. Surprising, faithful, and load-bearing: a per-core implementation
    // would count it.
    expect(processCpuPercent(1000, SECOND, 32)).toBeCloseTo(3.125, 9)
    expect(processCpuPercent(1000, SECOND, 32)).toBeLessThan(T)
    expect(activeProcessCount(times({ 100: 0 }), times({ 100: 1000 }), SECOND, 32, T)).toBe(0)
  })

  test("the same process on an 8-core machine reads 12.5% and DOES count", () => {
    // Same input, same threshold, different machine — and the reading crosses. So this field is not
    // comparable across hosts, which is worth knowing before anyone reads two screenshots side by side.
    expect(processCpuPercent(1000, SECOND, 8)).toBeCloseTo(12.5, 9)
    expect(activeProcessCount(times({ 100: 0 }), times({ 100: 1000 }), SECOND, 8, T)).toBe(1)
  })

  test("on 32 cores a process must use more than 1.6 cores to count at all", () => {
    // The threshold restated as the thing it actually gates. 5% of 32 cores is 1.6 cores.
    const perCoreMs = SECOND
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 1.6 * perCoreMs }), SECOND, 32, T)).toBe(1)
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 1.59 * perCoreMs }), SECOND, 32, T)).toBe(0)
  })

  test("a per-core reading gives 3 where the correct answer is 1, on one sample", () => {
    // The full divergence table from the header, measured. Four processes on a 32-core host over one second:
    // 2000ms (two cores), 1000ms, 900ms, 4ms.
    const before = times({ 1: 0, 2: 0, 3: 0, 4: 0 })
    const after = times({ 1: 2000, 2: 1000, 3: 900, 4: 4 })

    expect(activeProcessCount(before, after, SECOND, 32, T)).toBe(1)

    // Per-core: 200%, 100%, 90%, 0.4% -- three of the four clear 5%.
    const perCore = [2000, 1000, 900, 4].filter((ms) => (ms / SECOND) * 100 >= T).length
    expect(perCore).toBe(3)

    // And "any CPU time at all" is 4. Each reading is a small plausible integer.
    expect([2000, 1000, 900, 4].filter((ms) => ms > 0).length).toBe(4)
  })

  test("uses >= and not >, at the exact boundary", () => {
    // 5% of one second on 32 cores is exactly 1600ms.
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 1600 }), SECOND, 32, T)).toBe(1)
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 1599.99 }), SECOND, 32, T)).toBe(0)
  })

  test("counts each crossing process once and ignores the rest", () => {
    const before = times({ 10: 5000, 11: 5000, 12: 5000, 13: 5000 })
    const after = times({ 10: 7000, 11: 7000, 12: 5100, 13: 5000 })
    expect(activeProcessCount(before, after, SECOND, 32, T)).toBe(2)
  })
})

describe("the cases that count nothing", () => {
  test("the FIRST tick is 0p, which is a real rendered value", () => {
    // `_prevProcSample == DateTime.MinValue` in the C#: elapsed is 0, so the first tick after launch shows
    // `0p` no matter how busy the machine is. Not a defensive branch -- it is on screen at every start.
    expect(activeProcessCount(new Map(), times({ 1: 9_000_000 }), 0, 32, T)).toBe(0)
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 9_000_000 }), 0, 32, T)).toBe(0)
  })

  test("a negative or zero elapsed interval is 0, not a division blow-up", () => {
    // Reachable: the clock going backwards across an NTP correction or a resume from sleep.
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 5000 }), -250, 32, T)).toBe(0)
    expect(processCpuPercent(5000, 0, 32)).toBe(0)
    expect(Number.isNaN(processCpuPercent(5000, 0, 32))).toBe(false)
  })

  test("a zero core count is 0 rather than counting every process on the machine", () => {
    // The guard's whole point. Without it the divisor is 0, every delta is Infinity percent, and `>= 5` is
    // true for all ~400 processes -- a reading of `400p` that looks like data.
    const before = times({ 1: 0, 2: 0, 3: 0 })
    const after = times({ 1: 1, 2: 1, 3: 1 })
    expect(activeProcessCount(before, after, SECOND, 0, T)).toBe(0)
    expect(activeProcessCount(before, after, SECOND, -4, T)).toBe(0)
    // The positive control: the same input with a real core count is a real answer.
    expect(activeProcessCount(before, after, SECOND, 32, 0.0001)).toBe(3)
  })

  test("an empty machine and empty samples are 0", () => {
    expect(activeProcessCount(new Map(), new Map(), SECOND, 32, T)).toBe(0)
    expect(activeProcessCount(times({ 1: 100 }), new Map(), SECOND, 32, T)).toBe(0)
  })

  test("an idle machine is 0 even though every process is present in both samples", () => {
    // The distinction the whole field rests on: present is not busy.
    const idle = times({ 1: 50_000, 2: 900_000, 3: 12_345 })
    expect(activeProcessCount(idle, idle, SECOND, 32, T)).toBe(0)
  })
})

describe("processes appearing and disappearing between samples", () => {
  test("a process seen for the FIRST time is not counted, however much CPU it holds", () => {
    // Without this, a browser that has been running for three hours and is only now visible to the sampler
    // (a pid that was access-denied last tick, or genuinely new) would report its entire lifetime's CPU
    // against one second -- millions of percent, and a count that jumps for no reason.
    const before = times({ 1: 0 })
    const after = times({ 1: 0, 999: 10_800_000 })
    expect(activeProcessCount(before, after, SECOND, 32, T)).toBe(0)
    // Positive control: the same pid counts on the NEXT interval, once it has a baseline.
    expect(activeProcessCount(after, times({ 1: 0, 999: 10_802_000 }), SECOND, 32, T)).toBe(1)
  })

  test("a process that exited is dropped rather than counted from its last delta", () => {
    const before = times({ 1: 0, 2: 0 })
    const after = times({ 1: 2000 })
    expect(activeProcessCount(before, after, SECOND, 32, T)).toBe(1)
  })

  test("PID REUSE gives a negative delta and is skipped", () => {
    // A pid holding 40s of CPU time dies; the number is handed to a fresh process holding 0.1s. The delta is
    // -39.9s. The C# has no explicit guard and relies on a negative percentage failing `>= threshold`, which
    // is true for every threshold its settings ladder allows -- this arm pins the behaviour so it does not
    // depend on the threshold's sign.
    expect(activeProcessCount(times({ 500: 40_000 }), times({ 500: 100 }), SECOND, 32, T)).toBe(0)
    // The part that is NOT just the comparison: at a zero threshold a negative delta still must not count.
    expect(activeProcessCount(times({ 500: 40_000 }), times({ 500: 100 }), SECOND, 32, 0)).toBe(0)
    // ...while a genuine zero-CPU process at a zero threshold does count, so the guard is not swallowing the
    // threshold-0 case wholesale.
    expect(activeProcessCount(times({ 500: 100 }), times({ 500: 100 }), SECOND, 32, 0)).toBe(1)
  })
})

describe("the interval and the threshold both scale the answer", () => {
  test("the same CPU time over a longer interval is a smaller share", () => {
    // The hover fast-refresh halves the interval to 0.5s, so the same process reads twice the percentage.
    // Worth pinning: it means the `p` field genuinely changes on hover, which is not a bug.
    expect(processCpuPercent(1000, 500, 32)).toBeCloseTo(6.25, 9)
    expect(processCpuPercent(1000, 1000, 32)).toBeCloseTo(3.125, 9)
    expect(processCpuPercent(1000, 10_000, 32)).toBeCloseTo(0.3125, 9)
    // And the crossing is real at the default threshold, on this host.
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 1000 }), 500, 32, T)).toBe(1)
    expect(activeProcessCount(times({ 1: 0 }), times({ 1: 1000 }), 1000, 32, T)).toBe(0)
  })

  test("the other two ladder thresholds behave", () => {
    // `SettingsService` validates this field against a 2 / 5 / 10 ladder, so those are the only three values
    // reachable through the UI and all three are worth an arm.
    const before = times({ 1: 0, 2: 0, 3: 0 })
    // 3.125%, 6.25%, 12.5% of a 32-core machine over one second.
    const after = times({ 1: 1000, 2: 2000, 3: 4000 })
    expect(activeProcessCount(before, after, SECOND, 32, 2)).toBe(3)
    expect(activeProcessCount(before, after, SECOND, 32, 5)).toBe(2)
    expect(activeProcessCount(before, after, SECOND, 32, 10)).toBe(1)
  })

  test("a threshold above 100 counts nothing, since one process cannot exceed the machine", () => {
    // Not reachable through the ladder, and it is the statement that the divisor makes 100% the ceiling.
    const saturated = times({ 1: SECOND * 32 })
    expect(processCpuPercent(SECOND * 32, SECOND, 32)).toBe(100)
    expect(activeProcessCount(times({ 1: 0 }), saturated, SECOND, 32, 100)).toBe(1)
    expect(activeProcessCount(times({ 1: 0 }), saturated, SECOND, 32, 100.01)).toBe(0)
  })
})

describe("a realistic sample", () => {
  test("a 32-core host with one busy compiler reads 1p", () => {
    // Hand-built to look like this machine: a compile using 4 cores, a browser using a third of one, and a
    // long tail of idle services. The point of the arm is the tail -- 12 processes with real CPU time in the
    // interval, exactly one of which is a meaningful share of the machine.
    const before = times({
      4: 0, 8: 1000, 12: 400, 16: 90_000, 20: 3000, 24: 12, 28: 8, 32: 0, 36: 44, 40: 6, 44: 250, 48: 0,
    })
    const after = times({
      4: 4000, // 4 cores of compile -> 12.5%
      8: 1300, // 0.3 core of browser -> 0.94%
      12: 420,
      16: 90_020,
      20: 3050,
      24: 12,
      28: 8,
      32: 30,
      36: 44,
      40: 6,
      44: 250,
      48: 0,
    })
    expect(activeProcessCount(before, after, SECOND, 32, T)).toBe(1)
    expect(processCpuPercent(4000, SECOND, 32)).toBeCloseTo(12.5, 9)
    expect(processCpuPercent(300, SECOND, 32)).toBeCloseTo(0.9375, 9)
    // Twelve processes sampled, six of them used some CPU in the interval, one counted. So the reading a
    // "processes with CPU activity" implementation would show on this input is 6.
    expect(after.size).toBe(12)
    expect([...after].filter(([pid, ms]) => ms > (before.get(pid) ?? 0)).length).toBe(6)
  })
})
