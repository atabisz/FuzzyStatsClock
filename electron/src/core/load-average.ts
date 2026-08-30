/**
 * The uptime line, which is not just the uptime.
 *
 * `UpdateUptimeDisplay` (`MainWindow.xaml.cs:1194-1277`) writes
 *
 *     up 8d 12h 30m   0.52  0.48  0.51  14p
 *
 * — the formatted uptime, three rolling CPU averages over 1/5/15 minutes rendered load-average style, and
 * a count of processes above a CPU threshold. **The port rendered the first field and nothing else**, and
 * neither this plan's phase list nor its 15-cell telemetry table mentions the other four. Found by reading
 * the C# while wiring Phase 6's sources; recorded as a third unowned feature rather than absorbed
 * silently, because "the uptime line is done" was a claim the port had already made.
 *
 * ## Why the averages are a rolling window here and not `os.loadavg()`
 *
 * Node has `os.loadavg()`, it returns exactly three numbers for exactly these three windows, and it is the
 * wrong function. A Unix load average is **run-queue length** — processes wanting a core — and can exceed
 * the core count without the CPU being saturated. What the C# renders is `CpuPercent / 100`, an occupancy
 * ratio that cannot exceed 1.00. They are different quantities that happen to print in the same shape, so
 * substituting one would change what the widget claims while leaving it looking right. (`os.loadavg()`
 * also returns `[0, 0, 0]` on Windows, which would have made the substitution look correct in testing
 * here and wrong on the two platforms it works on.)
 *
 * ## The window is measured in SAMPLES, and that is why the hover guard exists
 *
 * The queue is trimmed to `(15 * 60) / interval` entries and each average takes the last
 * `ceil(seconds / interval)` of them, so every window's length in *time* depends on the sample interval
 * being what it claims. Hover fast-refresh moves that interval to 0.5s — six times the default cadence —
 * and pushing those samples would make "1 minute" mean ten seconds for as long as the cursor sat on the
 * widget. The C# skips the enqueue entirely while hovering rather than rescaling the window, and
 * {@link pushCpuSample} takes the same flag for the same reason.
 *
 * **But the flag is not "the cursor is on the widget", and reading it that way is wrong on Windows.** See
 * {@link isHoverFastRefresh}.
 */

/** `_cpuSamples`' cap: 15 minutes' worth at the configured interval, and never less than one. */
export function maxSamples(intervalSeconds: number): number {
  return Math.max(1, Math.trunc((15 * 60) / intervalSeconds))
}

/**
 * How many samples span a window of `seconds` at this interval.
 *
 * `Math.ceil`, matching `(int)Math.Ceiling(60.0 / interval)` — so a 2s interval asks for 30 samples for
 * the 1-minute window and a 0.7s interval asks for 86 rather than 85. Rounding down would make every
 * window quietly shorter than its label.
 */
export function windowSamples(seconds: number, intervalSeconds: number): number {
  return Math.ceil(seconds / intervalSeconds)
}

/**
 * `ComputeAvg(q, count)`: the mean of the most recent `count` samples, or 0 on an empty window.
 *
 * Zero for empty is the C#'s answer and it is a *display* decision rather than a statistical one — the
 * line has no unavailable state, so a cold start reads `0.00 0.00 0.00` for its first tick. Kept because
 * the alternative (a `N/A`) would be a field the original never shows.
 */
export function averageOfLast(samples: readonly number[], count: number): number {
  if (samples.length === 0) return 0
  const take = Math.min(Math.max(count, 0), samples.length)
  if (take === 0) return 0
  let sum = 0
  for (let index = samples.length - take; index < samples.length; index++) sum += samples[index] ?? 0
  return sum / take
}

/**
 * Append a CPU reading and trim, returning a NEW array.
 *
 * Immutable rather than a mutated queue because the caller is the main process's tick and the value is
 * read by a formatter — a shared mutable buffer between the two is how a sample gets counted twice. The
 * arrays here are at most 900 entries and reallocated once a second, which is nothing next to the IPC
 * message the same tick sends.
 *
 * Three reasons a sample is DROPPED, all the C#'s and all necessary:
 *   - `hoverFastRefresh` — the window is sample-counted, see the header.
 *   - `ready === false` — `StatsService` takes ~6s to initialise and reports 0% until it has, which is
 *     indistinguishable by value from a genuinely idle machine and would depress the 1-minute average for
 *     the first minute of every launch.
 *   - a negative reading — the `-1` unavailable sentinel is not a CPU load, and averaging it in would pull
 *     the displayed figure below zero. The C# has no such guard because its CPU counter has no unavailable
 *     state; the port's does, on every platform where `os.cpus()` has not yet produced two samples.
 */
export function pushCpuSample(
  samples: readonly number[],
  cpuPercent: number,
  options: { intervalSeconds: number; hoverFastRefresh: boolean; ready: boolean },
): readonly number[] {
  if (options.hoverFastRefresh || !options.ready || cpuPercent < 0) return samples
  const cap = maxSamples(options.intervalSeconds)
  const next = [...samples, cpuPercent]
  return next.length > cap ? next.slice(next.length - cap) : next
}

/**
 * Is the source sampling FASTER than its configured baseline — i.e. is a hover fast-refresh actually in
 * effect?
 *
 * The C# asks `_isHoverFastRefresh`, a flag set by `Window_MouseEnter`, and that is the *intent*. Here the
 * intent and the effect come apart, on one platform and in one direction: `typeperf -si` takes whole
 * seconds, so `Win32StatsSource.setIntervalSec(0.5)` **declines** and keeps sampling at the configured
 * cadence. A port that dropped samples on the intent would blank the averages for as long as the cursor
 * rested on the widget, on the platform this app primarily ships to, while the sample density had not
 * changed at all.
 *
 * So the question is asked of the adopted interval against the baseline the source adopted for
 * `settings.statsIntervalSeconds` — never against the setting itself. That distinction matters in the other
 * direction too: a user setting of 2.5s is also declined on Windows, so `adopted !== configured` is true
 * with no hover anywhere, and keying on it would drop **every** sample forever and leave the line reading
 * `0.00  0.00  0.00`.
 */
export function isHoverFastRefresh(adoptedIntervalSec: number, baselineIntervalSec: number): boolean {
  return adoptedIntervalSec < baselineIntervalSec
}

/**
 * The whole line: `"up 5h 30m   0.52  0.48  0.51  14p"`.
 *
 * Spacing is the C#'s interpolated string exactly — **three** spaces after the uptime and **two** between
 * every other field. Written as a template rather than joined, so the two widths cannot be normalised to
 * one by a later tidy-up.
 *
 * The averages are `percent / 100` at two decimals, which is where the load-average *look* comes from: a
 * fully loaded machine reads 1.00. `procCount` carries a literal `p` suffix.
 *
 * **`procCount: null` omits that field, and it is a real state rather than a convenience.** Node has no
 * per-process CPU time API, so `activeProcessCount`'s input map has no acquisition path on Windows yet
 * (`src/core/process-count.ts` is the pure half, and § Phase 6 of the port plan carries why the two obvious
 * mechanisms are both ruled out by measurements already in this tree). A dropped field is a visibly shorter
 * line; the alternative — rendering `0p` — is a *number*, and it is the number the C# legitimately shows on
 * its first tick, so it would read as a real count of zero busy processes rather than as an absent source.
 * Choosing the visible gap over the plausible lie is the same rule as `N/A` versus a zero everywhere else
 * in this port.
 */
export function uptimeLine(
  uptimeText: string,
  samples: readonly number[],
  intervalSeconds: number,
  procCount: number | null,
): string {
  const avg1m = averageOfLast(samples, windowSamples(60, intervalSeconds))
  const avg5m = averageOfLast(samples, windowSamples(300, intervalSeconds))
  // The 15-minute figure averages the WHOLE queue rather than a computed window, because the queue's cap
  // already is 15 minutes. At a 10s interval that is 90 samples either way; during warm-up it is however
  // many exist, which is the same thing `averageOfLast` does with an oversized count.
  const avg15m = averageOfLast(samples, samples.length)
  const ratio = (value: number): string => (value / 100).toFixed(2)
  const head = `${uptimeText}   ${ratio(avg1m)}  ${ratio(avg5m)}  ${ratio(avg15m)}`
  return procCount === null ? head : `${head}  ${String(procCount)}p`
}
