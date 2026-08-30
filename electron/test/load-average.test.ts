/**
 * `load-average.ts` — the four fields of the uptime line the port was not rendering.
 *
 * Provenance:
 *
 *   - **`UpdateUptimeDisplay` (`MainWindow.xaml.cs:1194-1277`)** for the line's shape, the interpolated
 *     string's exact spacing, the `p` suffix and the three enqueue guards.
 *   - **`ComputeAvg` (`:1357-1362`)** for the mean-of-last-N and its zero-on-empty.
 *   - **`(int)Math.Ceiling(60.0 / interval)`** for the window sizing, and `(15 * 60) / interval` for the cap.
 *
 * The process count is a *parameter* here rather than a measurement: acquiring it is the expensive half and
 * is still unresolved for Phase 6 (a third `typeperf` child on `\Process(*)` versus a slower dedicated
 * cadence versus `/proc` and `ps`). This file settles the formatting and the windowing so that whichever
 * mechanism wins only has to produce a number.
 *
 * ## Why the spacing gets its own arms
 *
 * Three spaces after the uptime, two between the rest. It is a single interpolated string in the C#, so it
 * is a fact rather than a style choice — and it is the one detail a `join(" ")`-shaped rewrite loses without
 * changing anything a value-level test can see. The arms below assert the gaps by index, not by eyeballing
 * a golden string.
 *
 * ## What is deliberately NOT here
 *
 * `os.loadavg()`. It returns three numbers for the same three windows and measures a different quantity —
 * run-queue length rather than occupancy — so there is no arm comparing the two. The module header carries
 * the argument; repeating it as a test would assert that Node's function is Node's function.
 */
import { describe, expect, test } from "bun:test"
import {
  averageOfLast,
  isHoverFastRefresh,
  maxSamples,
  pushCpuSample,
  uptimeLine,
  windowSamples,
} from "../src/core/load-average.js"
import { formatUptime } from "../src/core/uptime.js"

/** The default cadence: `REPAINT_MS` is 1s and the Windows source samples at 1s. */
const INTERVAL = 1

const LIVE = { intervalSeconds: INTERVAL, hoverFastRefresh: false, ready: true }

/** Push `count` copies of `value` through the real function, so the cap applies as it would live. */
const fill = (
  count: number,
  value: number,
  options: { intervalSeconds: number; hoverFastRefresh: boolean; ready: boolean } = LIVE,
): readonly number[] => {
  let samples: readonly number[] = []
  for (let index = 0; index < count; index++) samples = pushCpuSample(samples, value, options)
  return samples
}

describe("the queue's cap", () => {
  test("is 15 minutes' worth of samples at the configured interval", () => {
    expect(maxSamples(1)).toBe(900)
    expect(maxSamples(0.5)).toBe(1800)
    expect(maxSamples(2)).toBe(450)
    expect(maxSamples(10)).toBe(90)
    expect(maxSamples(60)).toBe(15)
  })

  test("truncates a non-integer interval and never returns zero", () => {
    // 900/7 is 128.57 — 128 samples is 14m56s, which is the C#'s own slight undershoot and is kept. The
    // floor of 1 is the port's guard: a huge interval would give a cap of 0 and a queue that could never
    // hold the sample just pushed, so every average would read 0.00 forever.
    expect(maxSamples(7)).toBe(128)
    expect(maxSamples(901)).toBe(1)
    expect(maxSamples(Number.MAX_SAFE_INTEGER)).toBe(1)
  })

  test("holds the queue at the cap and drops from the FRONT", () => {
    // Oldest-out. Dropping from the back would keep a 15-minute-old sample forever and freeze the 1-minute
    // average, which is the failure that looks like the machine idling.
    const capped = fill(905, 50)
    expect(capped).toHaveLength(900)
    const overflowing = pushCpuSample([...Array.from({ length: 900 }, () => 10), 99], 77, LIVE)
    expect(overflowing).toHaveLength(900)
    expect(overflowing[899]).toBe(77)
    expect(overflowing[898]).toBe(99)
  })

  test("returns a NEW array and never mutates the one it was given", () => {
    // The caller is main's tick and the reader is the formatter. A shared buffer between the two is how a
    // sample gets counted twice, and it is invisible in the output because the average barely moves.
    const before: readonly number[] = [1, 2, 3]
    const after = pushCpuSample(before, 4, LIVE)
    expect(before).toEqual([1, 2, 3])
    expect(after).toEqual([1, 2, 3, 4])
    expect(after).not.toBe(before)
  })
})

describe("the three enqueue guards", () => {
  test("drops the sample while hover fast-refresh is on", () => {
    // The window is counted in SAMPLES, so a 0.5s cadence would make "1 minute" mean 30 seconds for as long
    // as the cursor sat on the widget. The C# skips the enqueue rather than rescaling, and the returned
    // array is the same reference, which is the cheap way to see nothing happened.
    const samples: readonly number[] = [10, 20]
    const result = pushCpuSample(samples, 90, { ...LIVE, hoverFastRefresh: true })
    expect(result).toBe(samples)
  })

  test("drops the sample until the source reports ready", () => {
    // `StatsService` takes ~6s to initialise and reports 0% until it has — a value indistinguishable from a
    // genuinely idle machine, which would drag the 1-minute average down for the first minute of every
    // launch. This is the guard that makes a cold start's `0.00` mean "no data" rather than "six zeros".
    expect(pushCpuSample([], 0, { ...LIVE, ready: false })).toEqual([])
    expect(pushCpuSample([50], 0, { ...LIVE, ready: false })).toEqual([50])
  })

  test("drops a negative reading, which is the port's guard and not the C#'s", () => {
    // `-1` is `UNAVAILABLE`. Averaging it in pulls the display below zero and prints `-0.01`, a load average
    // that cannot exist. Reachable on every platform where `os.cpus()` has not yet produced two samples,
    // which is every mac and Linux launch.
    expect(pushCpuSample([], -1, LIVE)).toEqual([])
    expect(pushCpuSample([10, 20], -0.001, LIVE)).toEqual([10, 20])
    // Zero is NOT negative and must be kept: a genuinely idle machine reads 0% and that is data.
    expect(pushCpuSample([10], 0, LIVE)).toEqual([10, 0])
  })

  test("accepts everything else, including a reading above 100", () => {
    // The GPU counter can exceed 100 across engines and the CPU sum can overshoot by a fraction on a
    // wildcard sample. Clamping here would be a second opinion about the source's data; the display's own
    // formatting is where a >1.00 ratio becomes visible, and it should be.
    expect(pushCpuSample([], 101, LIVE)).toEqual([101])
    expect(pushCpuSample([], 100, LIVE)).toEqual([100])
  })
})

describe("the average over a window", () => {
  test("is the mean of the most recent N samples", () => {
    expect(averageOfLast([10, 20, 30], 3)).toBe(20)
    expect(averageOfLast([10, 20, 30], 2)).toBe(25)
    expect(averageOfLast([10, 20, 30], 1)).toBe(30)
  })

  test("takes the most recent, which a from-the-front read gets wrong at the same length", () => {
    // The discriminator. `[0,0,0,0,90]` with a window of 1 is 90 from the back and 0 from the front, and
    // both are plausible-looking numbers — a spike that shows up 15 minutes late is the symptom.
    expect(averageOfLast([0, 0, 0, 0, 90], 1)).toBe(90)
    expect(averageOfLast([0, 0, 0, 0, 90], 5)).toBe(18)
  })

  test("clamps an oversized window to what exists, which is the warm-up path", () => {
    // Asking for 60 samples 3 seconds after launch. The C# does the same and it is why the 1-minute figure
    // is *live* during warm-up rather than climbing out of a bed of zeros.
    expect(averageOfLast([50, 50, 50], 60)).toBe(50)
    expect(averageOfLast([50], 900)).toBe(50)
  })

  test("is 0 on an empty queue and on a zero-or-negative window", () => {
    // A display decision, not a statistical one: the line has no unavailable state, so a cold start reads
    // `0.00 0.00 0.00`. A `N/A` here would be a field the original never shows.
    expect(averageOfLast([], 60)).toBe(0)
    expect(averageOfLast([], 0)).toBe(0)
    expect(averageOfLast([10, 20], 0)).toBe(0)
    expect(averageOfLast([10, 20], -5)).toBe(0)
  })
})

describe("the window sizes", () => {
  test("are ceilings, so a window is never shorter than its label", () => {
    // `(int)Math.Ceiling`. Flooring 60/0.7 gives 85 samples = 59.5s, which is a 1-minute average over 59.5
    // seconds — right in the way that is impossible to notice and wrong in the way that compounds.
    expect(windowSamples(60, 1)).toBe(60)
    expect(windowSamples(60, 0.7)).toBe(86)
    expect(windowSamples(60, 2)).toBe(30)
    expect(windowSamples(300, 1)).toBe(300)
    expect(windowSamples(300, 7)).toBe(43)
  })

  test("the 15-minute window OVERSHOOTS the cap at non-integer intervals, which is why it is not used", () => {
    // Measured while writing this arm, and it is the reason `uptimeLine` averages `samples.length` for the
    // 15-minute figure instead of `windowSamples(900, interval)`. The cap truncates and the window ceils, so
    // at any interval that does not divide 900 they disagree by one: 7s gives a cap of 128 and a window of
    // 129. Asking for 129 out of a queue that can hold 128 is not an error -- `averageOfLast` clamps -- but
    // it means the two expressions of "15 minutes" are not the same number, and only one of them can be the
    // definition. The cap is, because it is what bounds memory.
    for (const interval of [0.5, 1, 2, 3, 5, 10, 30, 60]) {
      expect(windowSamples(900, interval)).toBe(maxSamples(interval))
    }
    expect(maxSamples(7)).toBe(128)
    expect(windowSamples(900, 7)).toBe(129)
    // And the consequence is nil, because the clamp absorbs it. Stated as the arm that says so.
    const capped = fill(200, 40, { ...LIVE, intervalSeconds: 7 })
    expect(capped).toHaveLength(128)
    expect(averageOfLast(capped, windowSamples(900, 7))).toBe(40)
  })
})

describe("the rendered line", () => {
  test("is uptime, three ratios and a process count, in that order", () => {
    const samples = fill(900, 52)
    expect(uptimeLine("up 5h 30m", samples, INTERVAL, 14)).toBe("up 5h 30m   0.52  0.52  0.52  14p")
  })

  test("has THREE spaces after the uptime and TWO between the rest", () => {
    // Asserted by index rather than as a golden string, so the arm names the fact instead of restating the
    // output. A `join(" ")` rewrite passes every value arm above and fails only here.
    const line = uptimeLine("up 1m", fill(60, 100), INTERVAL, 7)
    const gaps = [...line.matchAll(/ +/g)].map((match) => match[0].length)
    expect(gaps).toEqual([1, 3, 2, 2, 2])
    // `[1, …]` is the space inside "up 1m"; the four after it are the field separators.
    expect(line).toBe("up 1m   1.00  1.00  1.00  7p")
  })

  test("renders occupancy as a load-average-looking ratio: a saturated machine is 1.00", () => {
    // Where the whole look comes from. 100% becomes 1.00, which is why substituting `os.loadavg()` would
    // pass a glance and change what the widget claims — that number can be 40 on a busy 32-core box.
    expect(uptimeLine("up", fill(900, 100), INTERVAL, 1)).toBe("up   1.00  1.00  1.00  1p")
    expect(uptimeLine("up", fill(900, 0), INTERVAL, 1)).toBe("up   0.00  0.00  0.00  1p")
    expect(uptimeLine("up", fill(900, 12.5), INTERVAL, 1)).toBe("up   0.13  0.13  0.13  1p")
  })

  test("is two decimals always, including the trailing zeros", () => {
    // `toFixed(2)`. A bare division prints `0.5` and `0.125`, and the three fields stop lining up — the
    // column alignment is the only reason the three numbers read as a set.
    expect(uptimeLine("up", fill(900, 50), INTERVAL, 1)).toContain("0.50  0.50  0.50")
    expect(uptimeLine("up", fill(900, 100), INTERVAL, 1)).toContain("1.00")
  })

  test("the three windows differ when the load has changed, which is the point of having three", () => {
    // A ramp: 840 samples of idle then 60 of full load. The 1-minute figure sees only the load, the
    // 5-minute figure sees a fifth of it, and the 15-minute figure a fifteenth. If all three agree on a
    // ramp, the windows are not being applied.
    let samples: readonly number[] = fill(840, 0)
    for (let index = 0; index < 60; index++) samples = pushCpuSample(samples, 100, LIVE)
    expect(samples).toHaveLength(900)

    const line = uptimeLine("up", samples, INTERVAL, 3)
    expect(line).toBe("up   1.00  0.20  0.07  3p")
    // The three numbers, derived independently: 60/60, 60/300, 60/900.
    expect((60 / 60).toFixed(2)).toBe("1.00")
    expect((60 / 300).toFixed(2)).toBe("0.20")
    expect((60 / 900).toFixed(2)).toBe("0.07")
  })

  test("the 15-minute figure is the whole queue, so it is live during warm-up", () => {
    // It averages `samples.length` rather than a computed window. At the cap the two are the same thing; in
    // the first 15 minutes it means the longest average is over however much data exists, which is what
    // makes a fresh launch show three equal numbers rather than two numbers and a zero.
    const young = fill(10, 60)
    expect(uptimeLine("up 10s", young, INTERVAL, 2)).toBe("up 10s   0.60  0.60  0.60  2p")
  })

  test("an empty queue reads 0.00 three times rather than throwing or printing NaN", () => {
    expect(uptimeLine("up 0s", [], INTERVAL, 0)).toBe("up 0s   0.00  0.00  0.00  0p")
  })

  test("the process count is a literal integer with a p, and is not formatted", () => {
    // `{count}p` in the C#. No thousands separator and no padding, so a machine with 1,204 processes reads
    // `1204p` — which is the original's behaviour and is what the fixed 184px panel has to fit.
    expect(uptimeLine("up", [], INTERVAL, 1204)).toContain("1204p")
    expect(uptimeLine("up", [], INTERVAL, 0)).toContain("0p")
  })

  test("composes with formatUptime, which is the field the port already had", () => {
    // The one field that shipped. Asserted through the real formatter so the line is checked end to end and
    // the leading-zero-unit suppression is visible in context.
    expect(uptimeLine(formatUptime(0), [], INTERVAL, 0)).toBe("up 0m   0.00  0.00  0.00  0p")
    const week = 7 * 24 * 3600 + 3 * 3600 + 4 * 60
    expect(uptimeLine(formatUptime(week), fill(900, 25), INTERVAL, 431)).toBe(
      `${formatUptime(week)}   0.25  0.25  0.25  431p`,
    )
    expect(formatUptime(week)).toBe("up 7d 3h 4m")
  })

  test("honours a non-default interval by re-sizing the windows, not by rescaling the values", () => {
    // At a 10s cadence, 60 samples IS the 15-minute cap and the 1-minute window is 6 of them. Same ramp
    // shape as above, different arithmetic — the arm that says `intervalSeconds` reaches the windows rather
    // than only the cap.
    const interval = 10
    let samples: readonly number[] = fill(84, 0, { ...LIVE, intervalSeconds: interval })
    for (let index = 0; index < 6; index++) {
      samples = pushCpuSample(samples, 100, { ...LIVE, intervalSeconds: interval })
    }
    expect(samples).toHaveLength(90)
    expect(uptimeLine("up", samples, interval, 5)).toBe("up   1.00  0.20  0.07  5p")
  })

  test("a null process count DROPS the field rather than printing 0p, and that is what main sends", () => {
    // The shipped state as of Phase 6: `main.ts` passes `null`, because the `Np` field needs per-process
    // cumulative CPU time and Node exposes none. The distinction this arm exists for is that `0p` is a
    // legitimate reading — the C# renders it on its first tick and on a genuinely quiet machine — so a
    // zero-instead-of-absent would be indistinguishable from a real count.
    expect(uptimeLine("up 5h 30m", fill(90, 52), INTERVAL, null)).toBe("up 5h 30m   0.52  0.52  0.52")
    expect(uptimeLine("up 5h 30m", fill(90, 52), INTERVAL, 0)).toBe("up 5h 30m   0.52  0.52  0.52  0p")
    // The head is byte-identical either way, so adding the field later cannot shift the three averages.
    const head = "up 0m   0.00  0.00  0.00"
    expect(uptimeLine("up 0m", [], INTERVAL, null)).toBe(head)
    expect(uptimeLine("up 0m", [], INTERVAL, 14)).toBe(`${head}  14p`)
    // And no trailing whitespace, which a template with the field blanked instead of removed would leave —
    // invisible in a diff, visible in an SVG `textLength` measurement.
    expect(uptimeLine("up 0m", [], INTERVAL, null)).toBe(uptimeLine("up 0m", [], INTERVAL, null).trimEnd())
  })
})

describe("isHoverFastRefresh — the flag, which is not the intent", () => {
  test("compares the ADOPTED cadence against the baseline, not against the setting", () => {
    // The macOS/Linux case: hover asked for 0.5s and got it, so the samples arriving are twice as dense as
    // the window arithmetic assumes and must be dropped.
    expect(isHoverFastRefresh(0.5, 1)).toBe(true)
    // The Windows case, and the reason this function exists rather than a boolean threaded from `hoverEnter`.
    // `typeperf -si` takes whole seconds, so `setIntervalSec(0.5)` declines and returns the cadence already
    // running. Nothing got denser, so nothing may be dropped — a port keying on "the cursor is on the widget"
    // reads TRUE here and blanks the averages for the length of the hover.
    expect(isHoverFastRefresh(1, 1)).toBe(false)
    // The second half of the same trap, in the other direction: a legal fractional SETTING is also declined
    // on Windows, so `adopted !== settings.statsIntervalSeconds` is true with no cursor anywhere near the
    // widget. Judged against the baseline the source adopted for that setting, it is correctly false — and
    // keying on the setting would have dropped every sample for the lifetime of the process.
    expect(isHoverFastRefresh(2, 2)).toBe(false)
    expect(isHoverFastRefresh(3, 3)).toBe(false)
  })

  test("a cadence SLOWER than baseline is not a fast refresh", () => {
    // Not reachable through `hoverEnter`, which only ever asks for a faster interval — asserted because the
    // comparison is directional and `!==` would read this as a fast refresh. Samples here are sparser than
    // the windows assume, which makes each average span longer than its label rather than shorter; dropping
    // them would leave the line frozen instead.
    expect(isHoverFastRefresh(2, 1)).toBe(false)
    expect(isHoverFastRefresh(10, 0.5)).toBe(false)
  })

  test("feeds pushCpuSample, and the two together are what the C# guard does", () => {
    // End to end over the seam main wires, both branches, so the composition is checked rather than the
    // predicate alone.
    const hovering = { intervalSeconds: 0.5, hoverFastRefresh: isHoverFastRefresh(0.5, 1), ready: true }
    expect(pushCpuSample([12], 99, hovering)).toEqual([12])
    const declined = { intervalSeconds: 1, hoverFastRefresh: isHoverFastRefresh(1, 1), ready: true }
    expect(pushCpuSample([12], 99, declined)).toEqual([12, 99])
  })
})
