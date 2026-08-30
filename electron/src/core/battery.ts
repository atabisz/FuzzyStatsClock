/**
 * The battery row: its text, and the low-battery alert's state machine.
 *
 * Two things the other four stat rows do not have, both read off `UpdateStatsDisplay` and
 * `UpdateBatteryAlertState` (`MainWindow.xaml.cs:1147-1193`):
 *
 *   1. **A plugged-in prefix.** `BattText` is `$"{pluggedPrefix}{percent:F0}%"` with the prefix a literal
 *      `⚡` when charging. So this row's text is not `renderRow`'s rule, and running it through that rule
 *      is a silently missing indicator rather than a visible defect.
 *   2. **A colour the theme may not touch.** The bar goes `#FFFF4444` while the alert is active, and
 *      `ApplyTheme` / `ApplyDisplayColor` both guard on `_batteryAlertActive` — which `renderer/theme.ts`
 *      already implements as `ThemeOverrides.batteryAlertActive` over `BATTERY_ALERT_OWNED_ID`. That side
 *      was built in Phase 4 against this module's absence; this is the half that decides the flag.
 *
 * ## Why the state machine is a function of the previous state
 *
 * It would be simpler as `alert = !plugged && percent <= threshold`, and that is wrong: the C# has a
 * **1% dead-band on clear only**, so an unplugged battery sitting at exactly the threshold flips the alert
 * on and does not flip it off until it recovers past `threshold + 1`. Between the two the alert holds
 * whatever it already was, which is not expressible without the previous value. A battery oscillating a
 * tenth of a percent around 20 is the case that produces a flashing bar without it, and the C# comment
 * says so.
 *
 * The asymmetry is worth stating precisely, because it also means the alert is **not** reachable by
 * arriving at 20.5% from above: `shouldAlert` needs `<= 20`, so 20.5 neither alerts nor clears, and a
 * cold start at 20.5 stays quiet. That is the original's behaviour and the test pins it.
 */

import { UNAVAILABLE } from "../shared.js"

/**
 * `Color.FromArgb(0xFF, 0xFF, 0x44, 0x44)` as CSS. The alpha is dropped, not lost: it is opaque, and
 * `#FF4444` is the same colour in a form SVG's `fill` takes.
 */
export const BATTERY_ALERT_COLOR = "#FF4444"

/** The charging indicator. A literal in `UpdateStatsDisplay`, not a font glyph choice made here. */
export const PLUGGED_PREFIX = "⚡"

/**
 * `BattText.Text`. `-1` is "no battery" and renders the same `N/A` the other rows use -- the literal from
 * `UpdateStatsDisplay`:1149, not a placeholder. This function returned `--` until the renderer's
 * {@link renderRow} counterpart was checked against the C# and both were corrected.
 *
 * The prefix is applied to a *rounded* percentage rather than composed around the raw float, because
 * `$"{prefix}{percent:F0}%"` interpolates the formatted number -- a battery at 99.6% plugged in reads
 * `⚡100%`, and rounding after concatenation is not a thing that can happen.
 */
export function batteryText(percent: number, pluggedIn: boolean): string {
  if (percent === UNAVAILABLE || percent < 0) return "N/A"
  const clamped = Math.max(0, Math.min(100, percent))
  return `${pluggedIn ? PLUGGED_PREFIX : ""}${String(Math.round(clamped))}%`
}

/**
 * The WPF app's coupling of `IsPluggedIn` to the *percentage's* readability, reproduced rather than corrected.
 *
 * `StatsService.cs:70-90` returns early on `BatteryChargeStatus.NoSystemBattery || BatteryLifePercent > 1.0f`
 * having set **both** `BatteryPercent = -1f` **and** `IsPluggedIn = false`. So the original reports a
 * mains-powered desktop as "not plugged in", and it is a consequence of the early return rather than a
 * decision anyone wrote down.
 *
 * Three reasons this ships as parity instead of being quietly improved:
 *
 *   1. It is **invisible through both current readers**. {@link batteryText} draws `N/A` with no prefix at
 *      `-1`, and {@link nextBatteryAlert} clears on a no-battery reading regardless of the flag. Invisible
 *      through two call sites is a property of those two call sites, not of the field — a settings window or
 *      a tooltip that surfaces `pluggedIn` directly would expose the divergence immediately.
 *   2. Parity is the bar for the port, and a divergence nobody can see is the worst kind to introduce: there
 *      is no test that would fail and no screen that would look wrong.
 *   3. Stated in one place, all three platforms apply the identical rule. It was previously about to be
 *      written three times, and `linux.ts` had already got it backwards with a comment asserting the
 *      opposite ("`pluggedIn` is still true and still correct").
 *
 * @param percent the reading the platform source obtained, possibly {@link UNAVAILABLE}
 * @param onAc what the platform's AC-line evidence says on its own
 */
export function pluggedInReading(percent: number, onAc: boolean): boolean {
  return percent === UNAVAILABLE ? false : onAc
}

/**
 * The next alert state. Pure, and deliberately total: every input combination returns something.
 *
 * A no-battery reading **clears** rather than holding, which is the one branch that is not symmetric with
 * the other two -- the C# returns early there after forcing the bar back to the accent colour. That
 * matters on a machine where the source drops out mid-alert: a stale red bar on an `N/A` reading is a claim
 * about a battery that is no longer being measured.
 */
export function nextBatteryAlert(
  active: boolean,
  percent: number,
  pluggedIn: boolean,
  thresholdPercent: number,
): boolean {
  if (percent === UNAVAILABLE || percent < 0) return false

  const shouldAlert = !pluggedIn && percent <= thresholdPercent
  // `> threshold + 1`, not `>= `: the dead-band is the half-open interval `(threshold, threshold + 1]`.
  const shouldClear = pluggedIn || percent > thresholdPercent + 1

  if (!active && shouldAlert) return true
  if (active && shouldClear) return false
  return active
}
