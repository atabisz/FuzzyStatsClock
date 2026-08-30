/**
 * `cpu-delta.ts` — the macOS/Linux CPU source, which is the one metric with no command behind it.
 *
 * Two kinds of arm here, and the split matters:
 *
 *   - **Synthetic snapshots** for the arithmetic and every failure mode. The inputs are hand-built because
 *     the interesting cases — a counter going backwards, a core count changing, two reads inside one tick —
 *     cannot be produced on demand from a real machine.
 *   - **The real `os.cpus()`**, twice, with work in between. That runs on this Windows host and is the arm
 *     that says the field names and units this module assumes are the ones Node actually reports. It is
 *     *not* parity evidence for macOS or Linux — the function is the same on all three, but only one of them
 *     is measured here, and this file says so rather than implying three.
 *
 * ## Why the busy definition is "everything but idle"
 *
 * `total - idle` and not `user + sys`. The C#'s counter is `\Processor(_Total)\% Processor Time`, which PDH
 * defines as `100 - %Idle Time`, so the parity-preserving reading is also the one that keeps `nice` and
 * `irq` — and on a machine saturating a NIC, `irq` is precisely the time a user would call busy. The arm
 * below puts a whole sample's worth of ticks in `irq` alone, which is the case the two definitions disagree
 * on completely: 100% against 0%.
 */
import { describe, expect, test } from "bun:test"
import os from "node:os"
import { cpuBusyPercent, readCpuSnapshot, type CpuSnapshot, type CpuTimes } from "../src/main/telemetry/cpu-delta.js"
import { UNAVAILABLE } from "../src/shared.js"

const core = (times: Partial<CpuTimes>): CpuTimes => ({
  user: 0,
  nice: 0,
  sys: 0,
  idle: 0,
  irq: 0,
  ...times,
})

/** One core, `before` → `after`, as a snapshot pair. */
const pair = (before: Partial<CpuTimes>, after: Partial<CpuTimes>): [CpuSnapshot, CpuSnapshot] => [
  [core(before)],
  [core(after)],
]

describe("the arithmetic", () => {
  test("half the ticks idle is 50%", () => {
    expect(cpuBusyPercent(...pair({}, { user: 500, idle: 500 }))).toBe(50)
  })

  test("all idle is 0 and no idle is 100", () => {
    expect(cpuBusyPercent(...pair({}, { idle: 1000 }))).toBe(0)
    expect(cpuBusyPercent(...pair({}, { user: 1000 }))).toBe(100)
  })

  test("is a DELTA, so the counters' absolute size is irrelevant", () => {
    // The whole reason this module exists. `os.cpus()` reports cumulative ticks since boot, so a machine up
    // for a week reads ~99% idle no matter what it is doing now — a rate read off one snapshot is not a
    // slightly stale reading, it is a different quantity.
    const uptime = { user: 40_000_000, idle: 960_000_000 }
    const later = { user: 40_000_500, idle: 960_000_500 }
    expect(cpuBusyPercent([core(uptime)], [core(later)])).toBe(50)
    // Read as a rate off the second snapshot alone, the same instant is 4% busy.
    expect((later.user / (later.user + later.idle)) * 100).toBeCloseTo(4, 4)
  })

  test("sums across cores rather than averaging per-core percentages", () => {
    // Four cores, one saturated. `\Processor(_Total)` is total time over total capacity, so this is 25% — an
    // average of per-core percentages happens to agree here, and stops agreeing the moment the cores'
    // elapsed ticks differ, which the next arm covers.
    const before: CpuSnapshot = [core({}), core({}), core({}), core({})]
    const after: CpuSnapshot = [
      core({ user: 1000 }),
      core({ idle: 1000 }),
      core({ idle: 1000 }),
      core({ idle: 1000 }),
    ]
    expect(cpuBusyPercent(before, after)).toBe(25)
  })

  test("weights by elapsed ticks, which is where a per-core average diverges", () => {
    // Core 0 accounted for 1000 ticks and was busy for all of them; core 1 accounted for 10 and was idle.
    // Total time says 1000/1010 = 99.0% busy. A mean of per-core percentages says 50%. The first is what a
    // `_Total` counter means, and the second is a plausible-looking number that halves under a stalled core.
    const before: CpuSnapshot = [core({}), core({})]
    const after: CpuSnapshot = [core({ sys: 1000 }), core({ idle: 10 })]
    expect(cpuBusyPercent(before, after)).toBeCloseTo(99.0099, 4)
  })

  test("counts nice and irq as busy, which user+sys would call idle", () => {
    // The definitional arm, and the two readings disagree completely rather than slightly.
    expect(cpuBusyPercent(...pair({}, { irq: 1000 }))).toBe(100)
    expect(cpuBusyPercent(...pair({}, { nice: 1000 }))).toBe(100)
    expect(cpuBusyPercent(...pair({}, { nice: 250, irq: 250, idle: 500 }))).toBe(50)
    // `user + sys` over the total would report 0% for the first case above.
    expect(cpuBusyPercent(...pair({}, { user: 0, sys: 0, irq: 1000 }))).not.toBe(0)
  })

  test("mixes all five buckets", () => {
    const result = cpuBusyPercent(
      [core({ user: 10, nice: 1, sys: 5, idle: 100, irq: 2 })],
      [core({ user: 110, nice: 11, sys: 55, idle: 800, irq: 22 })],
    )
    // Busy delta 100+10+50+20 = 180; idle delta 700; total 880.
    expect(result).toBeCloseTo((180 / 880) * 100, 9)
    expect(result).toBeCloseTo(20.4545, 4)
  })
})

describe("the cases with no answer", () => {
  test("the first sample has none, which is why UNAVAILABLE reaches load-average.ts", () => {
    // At every launch on mac and Linux, the first tick has exactly one snapshot. This `-1` is a real value
    // the widget produces on a normal start, not a defensive branch — which is what makes
    // `pushCpuSample`'s negative-reading guard necessary rather than paranoid.
    expect(cpuBusyPercent([], [core({ user: 1 })])).toBe(UNAVAILABLE)
    expect(cpuBusyPercent([], [])).toBe(UNAVAILABLE)
  })

  test("no elapsed ticks is UNAVAILABLE, not 0% and not NaN", () => {
    // Reachable: a Linux tick is 10ms, so two reads in the same tick produce identical counters. 0/0 is NaN,
    // which would render `NaN%` in the row and `NaN` into the load averages, poisoning the whole 15-minute
    // window from one duplicated poll.
    expect(cpuBusyPercent(...pair({ user: 100, idle: 900 }, { user: 100, idle: 900 }))).toBe(UNAVAILABLE)
    expect(cpuBusyPercent([core({})], [core({})])).toBe(UNAVAILABLE)
  })

  test("a core count change is UNAVAILABLE", () => {
    // CPU hotplug on a VM, and macOS renumbering cores across sleep/wake. Zipping snapshots of different
    // lengths compares core 3's ticks against core 3's from a different topology.
    expect(cpuBusyPercent([core({})], [core({ user: 10 }), core({ user: 10 })])).toBe(UNAVAILABLE)
    expect(cpuBusyPercent([core({}), core({})], [core({ user: 10 })])).toBe(UNAVAILABLE)
  })

  test("a counter going backwards is UNAVAILABLE even when the SUM still rises", () => {
    // The arm the guard exists for, and the one a total-only check fails. Core 0 resets (its ticks drop) while
    // core 1 advances normally: the summed total is still positive, but the idle sum fell further than the
    // total, so the busy fraction comes out inflated — a plausible 100% row after a sleep/wake.
    const before: CpuSnapshot = [core({ user: 500, idle: 500 }), core({ user: 100, idle: 100 })]
    const after: CpuSnapshot = [core({ user: 5, idle: 5 }), core({ user: 1100, idle: 1100 })]
    const totalDelta = 5 + 5 - 1000 + (2200 - 200)
    expect(totalDelta).toBeGreaterThan(0)
    expect(cpuBusyPercent(before, after)).toBe(UNAVAILABLE)
  })

  test("an idle counter alone going backwards is UNAVAILABLE", () => {
    // Idle is the term the result is most sensitive to, so it gets its own arm: a total that rose with an
    // idle that fell reads as a busy spike rather than as lost tracking.
    expect(cpuBusyPercent(...pair({ user: 100, idle: 100 }, { user: 300, idle: 50 }))).toBe(UNAVAILABLE)
  })

  test("is clamped, and the clamp is not doing the backwards guard's job", () => {
    // Both statements together. The clamp bounds an honest reading; it must never be the thing that turns a
    // counter reset into a pinned 100%, which the arms above are what establish.
    expect(cpuBusyPercent(...pair({}, { user: 1000, idle: 0 }))).toBe(100)
    expect(cpuBusyPercent(...pair({}, { idle: 1000 }))).toBe(0)
  })
})

describe("against the real os.cpus() on this host", () => {
  test("readCpuSnapshot has one entry per logical core, with the five buckets", () => {
    // Says the field names this module reads are the ones Node reports. Cheap, and the alternative is a
    // module whose every arm passes against its own synthetic shape.
    const snapshot = readCpuSnapshot()
    expect(snapshot).toHaveLength(os.cpus().length)
    expect(snapshot.length).toBeGreaterThan(0)
    for (const times of snapshot) {
      for (const bucket of [times.user, times.nice, times.sys, times.idle, times.irq]) {
        expect(Number.isFinite(bucket)).toBe(true)
        expect(bucket).toBeGreaterThanOrEqual(0)
      }
      // Cumulative-since-boot, so at least one bucket on every core is non-trivially large.
      expect(times.user + times.nice + times.sys + times.idle + times.irq).toBeGreaterThan(0)
    }
  })

  test("two real snapshots with work between them yield a percentage in range", () => {
    // Measured here on Windows (32 logical cores), which is NOT the platform this module ships to — the
    // function is identical on all three, but only this one is under test. The macOS and Linux arms are the
    // sources' own evidence and need those hosts.
    const before = readCpuSnapshot()
    const deadline = performance.now() + 60
    let sink = 0
    while (performance.now() < deadline) sink += Math.sqrt(sink + 1)
    expect(sink).toBeGreaterThan(0)
    const after = readCpuSnapshot()

    const busy = cpuBusyPercent(before, after)
    // Not UNAVAILABLE: 60ms is several ticks on any of the three platforms, so the counters must have moved.
    expect(busy).not.toBe(UNAVAILABLE)
    expect(busy).toBeGreaterThanOrEqual(0)
    expect(busy).toBeLessThanOrEqual(100)
  })

  test("the same snapshot against itself is UNAVAILABLE, on real data", () => {
    // The zero-elapsed case with the real shape rather than a hand-built one.
    const snapshot = readCpuSnapshot()
    expect(cpuBusyPercent(snapshot, snapshot)).toBe(UNAVAILABLE)
  })
})
