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
  /**
   * The whole uptime line, composed in main — `"up 8d 12h 30m   0.52  0.48  0.51"` — not a seconds count.
   *
   * A string on the wire rather than `uptimeSec`, because the line carries four fields the renderer cannot
   * compute: the three rolling averages need a 900-entry sample queue and the interval the source actually
   * adopted, both of which live in main. The renderer held `formatUptime(uptimeSec)` through Phases 4 and 5
   * and so rendered exactly the first field of five (`core/load-average.ts` has the finding). Sending both
   * would put the same value on the wire twice and let a renderer pick the shorter one silently.
   *
   * No source writes this — main does, on its own repaint tick. It is on `StatsSample` because that type is
   * what main pushes to the renderer, which `uptimeSec` was too.
   */
  uptimeText: string
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
  /**
   * Ask for a new sampling cadence, and **return the one actually adopted**.
   *
   * The return value is the whole point of the signature. A source is allowed to decline, and the Windows
   * one has to: `typeperf -si` takes `[[hh:]mm:]ss` and rejects a fractional argument outright — measured,
   * the child prints `Invalid syntax: -si <[[hh:]mm:]ss>` and exits immediately — so the 0.5s hover
   * fast-refresh, and any fractional user setting, are not expressible there at all.
   *
   * Returning the adopted interval rather than a boolean is what keeps the caller honest downstream:
   * `core/load-average.ts` drops samples while the cadence is faster than configured, because its windows
   * are counted in samples. Deriving that flag from what was *asked for* would drop samples on Windows to
   * pay for a speed-up that never happened, freezing the 1/5/15-minute averages for as long as the cursor
   * rested on the widget. `core/hover.ts`'s header carries the full argument.
   */
  setIntervalSec(sec: number): number
}
