/**
 * CPU occupancy from two `os.cpus()` snapshots. Shared by the macOS and Linux sources.
 *
 * Windows gets its CPU from `\Processor(_Total)\% Processor Time` because a `typeperf` child is already
 * running for memory and paging, so the counter is free. The other two platforms have no equivalent
 * long-lived process, and spawning one per second to read a number Node already has in-process would be
 * the most expensive metric in the widget.
 *
 * ## Why a delta and not a rate
 *
 * `os.cpus()[i].times` are **cumulative tick counters since boot**, not rates. The absolute values are
 * meaningless on their own: a machine up for a week reads ~99% "idle" no matter what it is doing right now.
 * So the first call after start has no answer, and {@link cpuBusyPercent} says `UNAVAILABLE` rather than
 * inventing a zero — which is also what makes `load-average.ts`' negative-reading guard necessary rather
 * than defensive, since that `-1` is a real value this function produces at every launch.
 *
 * ## What counts as busy
 *
 * `total - idle`, summed across every core, where `total` is all five buckets. Not `user + sys`: that drops
 * `nice` and `irq`, and on a machine doing heavy network I/O `irq` is exactly the time a user would call
 * busy. The C#'s `\Processor(_Total)\% Processor Time` is `100 - %Idle Time` by definition, so
 * "everything but idle" is the parity-preserving reading as well as the defensible one.
 *
 * ## The counters can go backwards, and it is not a rounding artefact
 *
 * Three ways, all real, and the third was found by the guard firing where nothing predicted it. A core going
 * offline and coming back resets its ticks; macOS renumbers cores across a sleep/wake; and **Windows simply
 * reports a per-core `idle` that regresses between two ordinary reads** — by up to -312ms, on an idle desktop
 * with no sleep and no core offlining. Real node v24.20.0 reproduces it, which makes it the kernel's counter
 * rather than a runtime artefact. The rate varies run to run (6.3% to 16.4% of 60ms sample pairs across four
 * runs on one host), so `bun run probe:cpu-counter` measures it rather than this comment asserting a figure,
 * and the regressions come in **clusters** of up to 7 consecutive pairs rather than independently.
 *
 * The same probe on macOS arm64 was 0 of 600 under both runtimes, which is why this costs the product
 * nothing: Windows takes its CPU from `typeperf`, and of the two platforms that DO use this function, macOS
 * has not been seen to regress and Linux has never been measured. It cost a flaky test instead, and
 * `test/cpu-delta.test.ts` carries the reasoning behind its retry bound.
 *
 * Any of the three produces a negative delta on some core while others are positive, so the guard is on the
 * *summed* total being positive AND no bucket having gone backwards — a sum can stay positive while one
 * core's reset quietly inflates the busy fraction past 100%.
 */

import os from "node:os"
import { UNAVAILABLE } from "../../shared.js"

/** One core's cumulative tick counters, as `os.cpus()` reports them. */
export interface CpuTimes {
  readonly user: number
  readonly nice: number
  readonly sys: number
  readonly idle: number
  readonly irq: number
}

/** A whole-machine snapshot: every core's counters, in `os.cpus()` order. */
export type CpuSnapshot = readonly CpuTimes[]

/** Every bucket summed, which is the wall-clock ticks that core has accounted for. */
function totalOf(times: CpuTimes): number {
  return times.user + times.nice + times.sys + times.idle + times.irq
}

/**
 * Read the current snapshot.
 *
 * Here rather than in the callers so the two platform sources share one definition of "a sample", and so
 * this module can be tested against the real `os.cpus()` on any platform — the function works on Windows
 * too, it is simply not what the Windows source uses.
 */
export function readCpuSnapshot(): CpuSnapshot {
  return os.cpus().map((cpu) => ({
    user: cpu.times.user,
    nice: cpu.times.nice,
    sys: cpu.times.sys,
    idle: cpu.times.idle,
    irq: cpu.times.irq,
  }))
}

/**
 * Busy percentage between two snapshots, or `UNAVAILABLE`.
 *
 * `UNAVAILABLE` on: an empty snapshot, a core count that changed between the two, no elapsed ticks at all
 * (two reads inside one tick's resolution — 10ms on Linux, so entirely reachable if a caller polls twice in
 * a row), and any core whose idle or total went backwards.
 *
 * The result is clamped to 0-100. Clamping is not a substitute for the backwards guard: it would turn a
 * counter reset into a plausible 100% rather than a `N/A`, and a stat row pinned at 100% after a sleep is
 * worse than one that admits it lost track.
 */
export function cpuBusyPercent(previous: CpuSnapshot, current: CpuSnapshot): number {
  if (previous.length === 0 || previous.length !== current.length) return UNAVAILABLE

  let totalDelta = 0
  let idleDelta = 0
  for (const [index, before] of previous.entries()) {
    const after = current[index]
    if (after === undefined) return UNAVAILABLE
    const total = totalOf(after) - totalOf(before)
    const idle = after.idle - before.idle
    if (total < 0 || idle < 0) return UNAVAILABLE
    totalDelta += total
    idleDelta += idle
  }

  if (totalDelta <= 0) return UNAVAILABLE
  const busy = ((totalDelta - idleDelta) / totalDelta) * 100
  return Math.min(100, Math.max(0, busy))
}
