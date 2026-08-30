/**
 * `battery.ts` — the two things the battery row does that the other four stat rows do not.
 *
 * Every expectation here comes from one of two places, and the file says which for each:
 *
 *   - **`MainWindow.xaml.cs:1147-1193`**, read line by line. `UpdateStatsDisplay`'s `BattText` assignment
 *     for the text, `UpdateBatteryAlertState` for the machine. The threshold-comparison operators are the
 *     part that had to be read rather than inferred, because `<=` against `>` + 1 is not a symmetry.
 *   - **`Color.FromArgb(0xFF, 0xFF, 0x44, 0x44)`**, for the one constant.
 *
 * Nothing here is measured off a fixture, and nothing needs to be: the module is arithmetic and a
 * three-state machine over inputs the source supplies. The one thing a fixture *would* add — a real
 * battery reporting a real percentage — is Phase 6's `Get-CimInstance Win32_Battery` arm, not this file's.
 *
 * ## The dead-band is asserted as an interval, not as two points
 *
 * The clear rule is `> threshold + 1`, so `(20, 21]` is a region where the machine returns its input. A
 * pair of spot checks at 20 and 22 passes against `alert = !plugged && pct <= threshold` too — the version
 * this module exists *not* to be. So the hold region is swept, and the sweep is what discriminates.
 */
import { describe, expect, test } from "bun:test"
import {
  BATTERY_ALERT_COLOR,
  PLUGGED_PREFIX,
  batteryText,
  nextBatteryAlert,
} from "../src/core/battery.js"
import { cssColor, parseAccentColor } from "../src/core/display-colors.js"
import { DEFAULTS } from "../src/core/settings.js"
import { UNAVAILABLE } from "../src/shared.js"

/** The shipped default, so the sweeps below run at the threshold a real install has. */
const T = DEFAULTS.batteryAlertThresholdPercent

describe("the battery row's text", () => {
  test("is a rounded integer percent with a % suffix", () => {
    expect(batteryText(0, false)).toBe("0%")
    expect(batteryText(37, false)).toBe("37%")
    expect(batteryText(100, false)).toBe("100%")
  })

  test("rounds like F0 does, not like a truncation", () => {
    // `$"{percent:F0}"` rounds. A `(int)` cast here would read 99% on a battery at 99.6, which is the
    // difference between "nearly full" and "full" on the one reading a user checks.
    expect(batteryText(99.6, false)).toBe("100%")
    expect(batteryText(0.4, false)).toBe("0%")
    expect(batteryText(0.5, false)).toBe("1%")
    expect(batteryText(19.5, false)).toBe("20%")
  })

  test("prefixes ⚡ when plugged in, and the prefix is outside the rounding", () => {
    // The prefix is applied to the formatted number, so there is no arithmetic downstream of the
    // concatenation that could be thrown off by it. Stated because "prepend a glyph" is the kind of change
    // someone makes in the renderer's `renderRow` instead, where it would be lost on the next repaint.
    expect(PLUGGED_PREFIX).toBe("⚡")
    expect(batteryText(37, true)).toBe("⚡37%")
    expect(batteryText(99.6, true)).toBe("⚡100%")
    expect(batteryText(100, true)).toBe("⚡100%")
    // And it is exactly one code point of prefix, not a space-padded one.
    expect(batteryText(37, true)).toBe(`${PLUGGED_PREFIX}${batteryText(37, false)}`)
  })

  test("renders N/A for no battery, with or without the plug", () => {
    // The sentinel is shared with the C# (`StatsService.cs:23`) and so is the string it renders as:
    // `UpdateStatsDisplay`:1149 writes the literal `"N/A"`. This asserted `--` until both readers were
    // checked against the original — no WPF test covers that line, so nothing else would have caught it.
    expect(batteryText(UNAVAILABLE, false)).toBe("N/A")
    expect(batteryText(UNAVAILABLE, true)).toBe("N/A")
    // Any negative reading, not only the exact sentinel: a source that reports -0.5 has not measured a
    // battery either, and `⚡-1%` would be the alternative.
    expect(batteryText(-0.5, true)).toBe("N/A")
    expect(batteryText(-100, false)).toBe("N/A")
  })

  test("clamps above 100 rather than reporting it", () => {
    // Reachable: `Win32_Battery.EstimatedChargeRemaining` is a UInt16 and some firmware reports 101 while
    // topping off. 101% in a widget reads as a broken widget.
    expect(batteryText(101, false)).toBe("100%")
    expect(batteryText(255, true)).toBe("⚡100%")
  })
})

describe("the low-battery alert, as a state machine", () => {
  test("fires when an unplugged battery reaches the threshold", () => {
    expect(nextBatteryAlert(false, T, false, T)).toBe(true)
    expect(nextBatteryAlert(false, T - 5, false, T)).toBe(true)
    expect(nextBatteryAlert(false, 0, false, T)).toBe(true)
  })

  test("does not fire above the threshold, and 20.5 is the case that proves the operator", () => {
    // `<=` against the raw float. 20.5 is above the threshold so it cannot alert, and it is inside the
    // clear dead-band so it cannot clear either — a cold start there stays quiet, and that is the
    // original's behaviour rather than an oversight this port should smooth over.
    expect(nextBatteryAlert(false, T + 0.5, false, T)).toBe(false)
    expect(nextBatteryAlert(false, T + 1, false, T)).toBe(false)
    expect(nextBatteryAlert(false, 100, false, T)).toBe(false)
  })

  test("never fires while plugged in, at any percentage", () => {
    for (const percent of [0, 1, T - 1, T, T + 1, 50, 100]) {
      expect(nextBatteryAlert(false, percent, true, T)).toBe(false)
    }
  })

  test("clears on the plug, immediately and regardless of the dead-band", () => {
    // `shouldClear` is `pluggedIn || …`, so plugging in at 3% clears at once. The dead-band is a hysteresis
    // on the *percentage*, and the plug is not a percentage.
    expect(nextBatteryAlert(true, 3, true, T)).toBe(false)
    expect(nextBatteryAlert(true, T, true, T)).toBe(false)
  })

  test("clears only ABOVE threshold + 1, swept across the whole hold region", () => {
    // The discriminating arm. Across `(20, 21]` an active alert stays active and an inactive one stays
    // inactive — the machine returns its input. The simpler `pct <= threshold` version would clear at
    // 20.01, which is what makes this a sweep and not two points.
    const inside = [T + 0.01, T + 0.25, T + 0.5, T + 0.75, T + 1]
    for (const percent of inside) {
      expect(nextBatteryAlert(true, percent, false, T)).toBe(true)
      expect(nextBatteryAlert(false, percent, false, T)).toBe(false)
    }
    // And the first value outside it does clear, so the interval has a measured right edge.
    expect(nextBatteryAlert(true, T + 1.01, false, T)).toBe(false)
    expect(nextBatteryAlert(true, T + 2, false, T)).toBe(false)
  })

  test("a battery oscillating around the threshold produces ONE transition, not a flicker", () => {
    // Why the previous state is a parameter at all. The C# comment names this case; here it is as a
    // trace. A stateless rule flips on every other reading, which paints the bar red/accent/red at 1Hz.
    const readings = [T + 0.4, T - 0.1, T + 0.3, T - 0.2, T + 0.6, T + 0.9, T - 0.4]
    let active = false
    const transitions: boolean[] = []
    for (const percent of readings) {
      const next = nextBatteryAlert(active, percent, false, T)
      if (next !== active) transitions.push(next)
      active = next
    }
    expect(transitions).toEqual([true])
    expect(active).toBe(true)

    // Recovery needs a real recharge past 21, and then it is one transition the other way.
    active = nextBatteryAlert(active, T + 1, false, T)
    expect(active).toBe(true)
    active = nextBatteryAlert(active, T + 5, false, T)
    expect(active).toBe(false)
  })

  test("a battery that disappears mid-alert force-clears rather than holding", () => {
    // The one asymmetric branch. Holding would leave a red bar on an `N/A` reading — a claim about a battery
    // nothing is measuring any more. Reachable on a laptop whose counter drops out, and on any machine
    // where the 60s battery poll fails after having succeeded.
    expect(nextBatteryAlert(true, UNAVAILABLE, false, T)).toBe(false)
    expect(nextBatteryAlert(true, UNAVAILABLE, true, T)).toBe(false)
    expect(nextBatteryAlert(true, -3, false, T)).toBe(false)
    // Which is not the same as the hold branch: at the same previous state, an in-band reading holds.
    expect(nextBatteryAlert(true, T + 0.5, false, T)).toBe(true)
  })

  test("is total: every combination of the four inputs returns a boolean", () => {
    // A machine that can hold, set, clear and force-clear has four branches and one implicit fall-through.
    // Sweeping the cross-product is cheap and is what says the fall-through is `active` rather than
    // `undefined` on some input nobody thought about.
    for (const active of [false, true]) {
      for (const percent of [UNAVAILABLE, -1.5, 0, 5, T - 1, T, T + 0.5, T + 1, T + 1.5, 50, 100, 101]) {
        for (const plugged of [false, true]) {
          for (const threshold of [0, 5, T, 50, 99]) {
            expect(typeof nextBatteryAlert(active, percent, plugged, threshold)).toBe("boolean")
          }
        }
      }
    }
  })

  test("honours a non-default threshold, including 0", () => {
    // The settings window's range is 5-50 (`settings.ts` validates it), but 0 is what an out-of-range value
    // clamps toward and the machine must not special-case it: at 0 the alert fires only at exactly 0%.
    expect(nextBatteryAlert(false, 45, false, 50)).toBe(true)
    expect(nextBatteryAlert(false, 51, false, 50)).toBe(false)
    expect(nextBatteryAlert(false, 0, false, 0)).toBe(true)
    expect(nextBatteryAlert(false, 0.5, false, 0)).toBe(false)
    expect(nextBatteryAlert(true, 0.5, false, 0)).toBe(true)
    expect(nextBatteryAlert(true, 1.5, false, 0)).toBe(false)
  })
})

describe("the alert colour", () => {
  test("is the ARGB literal with its opaque alpha dropped", () => {
    // Dropped rather than translated to `#FFFF4444`: SVG accepts 8-digit hex, but the four-byte form here
    // would be read as RGBA — `#FFFF4444` is a *yellow* at 27% alpha, not a red. Worth an assertion.
    expect(BATTERY_ALERT_COLOR).toBe("#FF4444")
    expect(BATTERY_ALERT_COLOR).not.toBe("#FFFF4444")
  })

  test("is distinct from the default accent, so the alert reads as one", () => {
    // The alert takes ownership of `battBar` from the theme (`theme.ts:125` yields the id while active).
    // If the accent happened to equal the alert colour the takeover would be invisible, which is the kind
    // of thing only a comparison finds.
    const accent = parseAccentColor(DEFAULTS.accentColor)
    const channels = [accent.r, accent.g, accent.b]
      .map((v) => v.toString(16).toUpperCase().padStart(2, "0"))
      .join("")
    expect(`#${channels}`).not.toBe(BATTERY_ALERT_COLOR)
  })

  test("is hex where the theme writes rgb(), which is two forms of one thing and not a mismatch", () => {
    // `applyTheme` paints in `rgb(r g b)` and this constant is `#RRGGBB`. Both are legal SVG `fill`
    // values, they never collide because the theme yields the element while the alert owns it, and the hex
    // form is kept because it is what the C# literal reads as. Recorded so the asymmetry looks deliberate
    // to whoever notices it next.
    expect(cssColor({ r: 0xff, g: 0x44, b: 0x44 })).toBe("rgb(255 68 68)")
    expect(BATTERY_ALERT_COLOR).toMatch(/^#[0-9A-F]{6}$/)
  })
})
