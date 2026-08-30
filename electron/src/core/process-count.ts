/**
 * The `14p` field in the uptime line: **not** the number of processes.
 *
 * It is the number of processes that used at least `processCountThresholdPercent` of the machine's total CPU
 * capacity over the last interval. Worth stating loudly because "process count" reads as `\System\Processes`
 * or `ps | wc -l`, and that is a completely different number — around 400 on this host against a typical
 * reading in the single digits.
 *
 * Transcribed from `MainWindow.xaml.cs:1230-1269`. The formula there is:
 *
 *     pct = (cpuTime - prev).TotalMilliseconds / (elapsedMs * Environment.ProcessorCount) * 100.0
 *     if (pct >= _processCountThreshold) procCount++
 *
 * ## The `ProcessorCount` divisor is the whole semantic, and it is easy to drop
 *
 * Dividing by the core count makes this a share of the **whole machine**, so one process can never exceed
 * 100% and a process pinning a single core reads `100 / cores`. On this 32-core host that is **3.125%** —
 * *under* the 5% default — so a fully-saturated core does not register, and a process needs to be using more
 * than 1.6 cores to count. That is surprising, it is what the WPF app does, and parity is the bar, so it is
 * reproduced exactly rather than improved.
 *
 * The alternative reading — a per-core percentage, which is what `top` and `ps %cpu` show, where one busy
 * core is 100% — differs by a factor of the core count. Both produce small plausible integers, which is why
 * `test/process-count.test.ts` measures the divergence on one input rather than checking the output looks
 * like a count.
 *
 * ## Why a Map delta and not a rate
 *
 * Same reason as `cpu-delta.ts`: every platform exposes *cumulative* CPU time per process, so a single
 * reading describes the process's whole life. A browser open for three hours has hours of CPU time and may
 * be doing nothing at all now.
 */

/** Cumulative CPU time per process, keyed by pid, in **milliseconds**. */
export type ProcessCpuTimes = ReadonlyMap<number, number>

/**
 * How many processes crossed the threshold between two samples.
 *
 * `elapsedMs` is wall-clock time between the two samples, and `cpuCount` the logical core count. Returns 0
 * rather than a sentinel when there is nothing to compare: this is a count, `0` is a legitimate value of it,
 * and the WPF app renders `0p` on its first tick for exactly this reason.
 *
 * Three exclusions, each matching the original:
 *
 *   - **A pid only in `current` is not counted.** It has no previous reading, so its delta would be its
 *     entire lifetime's CPU time measured against one interval — a process that just started after running
 *     for an hour elsewhere would read thousands of percent. The C# reaches this through
 *     `_prevProcTimes.TryGetValue` failing.
 *   - **A pid only in `previous` is dropped.** It exited; there is nothing to measure.
 *   - **A negative delta is skipped.** Pid reuse: a pid dies holding 40s of CPU time and the number is
 *     handed to a new process holding 0.1s, giving a delta of −39.9s. The C# has no explicit guard here and
 *     relies on a negative percentage failing `>= threshold`, which holds for every threshold the settings
 *     ladder permits (2, 5, 10) and would stop holding at a threshold of 0 or below. Made explicit so the
 *     behaviour does not depend on the threshold's sign.
 */
export function activeProcessCount(
  previous: ProcessCpuTimes,
  current: ProcessCpuTimes,
  elapsedMs: number,
  cpuCount: number,
  thresholdPercent: number,
): number {
  // The first tick has no elapsed interval, which is the C#'s `_prevProcSample == DateTime.MinValue` branch.
  // `cpuCount` is guarded because it is a divisor: 0 would make every delta Infinity percent and count every
  // process on the machine, which looks like a real reading rather than a failure.
  if (elapsedMs <= 0 || cpuCount <= 0) return 0

  const capacityMs = elapsedMs * cpuCount
  let count = 0
  for (const [pid, cpuMs] of current) {
    const before = previous.get(pid)
    if (before === undefined) continue
    const deltaMs = cpuMs - before
    if (deltaMs < 0) continue
    const percent = (deltaMs / capacityMs) * 100
    // `>=`, not `>`. At the default 5% threshold and a 1s interval on 32 cores that boundary is 1.6s of CPU
    // time, so it is not a value anything lands on by accident -- but the original is `>=` and a count is
    // the kind of number someone compares between the two builds.
    if (percent >= thresholdPercent) count++
  }
  return count
}

/**
 * The share of total machine CPU one process used, as a percentage — the per-process figure
 * {@link activeProcessCount} thresholds on.
 *
 * Exported for the tests and for a future settings preview, not used by the counter itself: doing the
 * division once per process inside the loop avoids building an intermediate array of 400 objects every tick.
 */
export function processCpuPercent(
  deltaMs: number,
  elapsedMs: number,
  cpuCount: number,
): number {
  if (elapsedMs <= 0 || cpuCount <= 0) return 0
  return (deltaMs / (elapsedMs * cpuCount)) * 100
}
