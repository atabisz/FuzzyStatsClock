/**
 * Types crossing the main/preload/renderer boundary.
 *
 * The `-1` unavailable sentinel is carried over from the WPF app deliberately
 * (`FuzzyClock.App/StatsService.cs:20-23`). Its stats panel already renders `-1`
 * as "N/A", and that path is already tested — so a platform with no source for a
 * metric degrades through a route that exists rather than one invented for the
 * port. The distinction that matters: **`-1` is "no source", `0` is "a real
 * reading of zero"**. Collapsing them would make a broken counter look like an
 * idle machine, which is the exact failure the Windows GPU counter produces on
 * its own (see `telemetry/win32.ts`).
 */

/** Every metric is a percentage 0-100, or -1 for "no source on this platform". */
export const UNAVAILABLE = -1

/**
 * No temperature fields, by decision rather than by omission (Option C, Alex's call after ISC-9
 * measured 51 CPU sensors present and every one reading NULL unelevated). They are absent rather than
 * stubbed at -1 on the reasoning the sentinel doc above sets out in reverse: `-1` means "no source on
 * this platform", which invites a platform that does have one, and there is now no source on any.
 */
export interface StatsSample {
  cpu: number
  mem: number
  gpu: number
  /** Swap on macOS/Linux, pagefile on Windows. Same meaning, three sources. */
  pag: number
  battery: number
  pluggedIn: boolean
  uptimeSec: number
}

/**
 * What a platform telemetry source must provide.
 *
 * Deliberately push-based rather than pull-based: the Windows implementation owns
 * a long-lived child process that emits on its own schedule, and a `read()` API
 * would either block on it or lie about freshness. The renderer's repaint cadence
 * and the source's sample cadence are separate concerns and stay that way.
 */
export interface StatsSource {
  /** Begin sampling. `onSample` fires once per source interval. */
  start(onSample: (sample: Partial<StatsSample>) => void): void
  stop(): void
  /** Human-readable description of what this source actually reads, for the log. */
  describe(): string
}
