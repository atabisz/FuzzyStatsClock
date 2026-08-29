/**
 * `stepOpacity` -- the wheel gesture no phase of the port owned.
 *
 * There is no C# test suite to translate here, and not because one was missed: `Window_PreviewMouseWheel`
 * is a WPF event handler returning void that mutates `_windowOpacity` and calls `SaveSettings()`, so
 * nothing in the WPF tree reaches it. Every expectation below therefore comes from one of three places,
 * and each arm says which:
 *
 *   - the C# handler read line by line (the `Math.Sign`, the 0.10 step, the `Math.Clamp` bounds);
 *   - `SettingsService.Validate`, imported here rather than described, so the asymmetry arm is measured
 *     against the real validator instead of a claim about it;
 *   - measurement in this runtime, for the float arms -- the ladder's residue is not derivable by reading
 *     either side, and the numbers are pinned exactly rather than with `toBeCloseTo`.
 *
 * ## What is worth testing in a two-line function
 *
 * The arithmetic is not. Three things are, and all three are decisions rather than sums: that a MAGNITUDE
 * never scales the step (the trackpad defect), that direction 0 is a return rather than a clamp (the
 * hand-edited-1.5 defect), and that the clamp is exact enough for `main.ts:497`'s `next === settings.opacity`
 * guard to actually fire at the ends -- otherwise every scroll at the ceiling writes the settings file.
 */
import { describe, expect, test } from "bun:test"
import { OPACITY_MAX, OPACITY_MIN, OPACITY_STEP, stepOpacity } from "../src/core/opacity-step.js"
import { validateSettings } from "../src/core/settings.js"

/** The exact values nine steps of the ladder lands on. Measured in this runtime, not computed here. */
const NINE_DOWN = 0.10000000000000014
const NINE_UP = 0.9999999999999999

/** Walk the ladder the way a user's wheel does: repeated single steps, each fed the previous result. */
function ladder(from: number, direction: number, notches: number): number[] {
  const values: number[] = []
  let current = from
  for (let i = 0; i < notches; i++) {
    current = stepOpacity(current, direction)
    values.push(current)
  }
  return values
}

describe("the constants, which are the C#'s literals", () => {
  test("one notch is one tenth", () => {
    // `Math.Sign(e.Delta) * 0.10`, and the C#'s comment calls it "exactly one 10% step per physical notch".
    expect(OPACITY_STEP).toBe(0.1)
  })

  test("the bounds are Math.Clamp's, and the floor is not zero", () => {
    // `Math.Clamp(_windowOpacity + step, 0.10, 1.0)`. A floor of 0 would be the invisible-widget regression
    // `SettingsService`'s own `<= 0` arm exists to prevent, reintroduced through a different door.
    expect(OPACITY_MIN).toBe(0.1)
    expect(OPACITY_MAX).toBe(1.0)
    expect(OPACITY_MIN).not.toBe(0)
  })
})

describe("the direction, and everything the magnitude must not do", () => {
  test("one notch each way from the middle", () => {
    expect(stepOpacity(0.5, 1)).toBe(0.6)
    expect(stepOpacity(0.5, -1)).toBe(0.4)
  })

  test("ANY magnitude is exactly one step -- the trackpad arm", () => {
    // The defect this closes: a high-resolution wheel or a trackpad emits many small deltas per physical
    // notch, and a device that reports 120 per notch would move the setting 12x further than one that
    // reports 1. Scaling is not "less precise", it is a different feature on every mouse.
    for (const direction of [1, 3, 5, 120, 1e9, 0.001]) {
      expect(stepOpacity(0.5, direction)).toBe(0.6)
    }
    for (const direction of [-1, -3, -5, -120, -1e9, -0.001]) {
      expect(stepOpacity(0.5, direction)).toBe(0.4)
    }
  })

  test("a fractional direction under one still steps a full tenth, because Math.sign is total", () => {
    // Chromium's smooth-scroll gestures emit small deltas, and `renderer.ts` reduces them with
    // `-Math.sign(event.deltaY)` before they get here -- so this function never sees one in production. The
    // arm is here because the guarantee has to hold if a caller ever forgets that reduction: a step is a
    // step, never a fraction of one.
    expect(stepOpacity(0.5, 0.4)).toBe(0.6)
    expect(stepOpacity(0.5, -0.4)).toBe(0.4)
  })

  test("direction 0 returns the input UNTOUCHED, which is not the same as clamping it", () => {
    // Chromium emits a `deltaY` of exactly 0 at the end of a smooth-scroll gesture, and `renderer.ts`
    // already drops those -- but the contract matters anyway, because "no direction" and "clamp where you
    // are" differ for exactly the values the clamp would move. 1.5 is that value, and it is reachable from
    // a hand-edited file: without the early return, a stray horizontal trackpad drift would silently
    // rewrite the user's setting to 1.0.
    expect(stepOpacity(1.5, 0)).toBe(1.5)
    expect(stepOpacity(0.05, 0)).toBe(0.05)
    expect(stepOpacity(0.5, 0)).toBe(0.5)
    expect(stepOpacity(-3, 0)).toBe(-3)
  })

  test("a NaN direction is a no-op, and a NaN current propagates", () => {
    // `Math.sign(NaN)` is NaN, so `NaN !== 0` takes the arithmetic path and the clamp yields NaN. Neither
    // is reachable -- `main.ts:495` rejects a non-finite payload at the process boundary and
    // `validateSettings` rejects a non-finite opacity before load -- and the module's doc says why there is
    // no guard here: a check that cannot alter the result reads as protection that exists.
    expect(stepOpacity(0.5, Number.NaN)).toBeNaN()
    expect(stepOpacity(Number.NaN, 1)).toBeNaN()
  })
})

describe("the clamp at both ends, and the exactness main.ts depends on", () => {
  test("scrolling up at the ceiling returns the ceiling, by identity", () => {
    // `===`, not `toBeCloseTo`, and the strictness is the point: `main.ts:497` drops a scroll whose result
    // equals the current opacity, and that guard is the only thing stopping every wheel notch at the
    // ceiling from rewriting the settings file and re-broadcasting to the renderer.
    expect(stepOpacity(1.0, 1)).toBe(1.0)
    expect(stepOpacity(1.0, 5)).toBe(1.0)
  })

  test("scrolling down at the floor returns the floor, by identity", () => {
    expect(stepOpacity(0.1, -1)).toBe(0.1)
    expect(stepOpacity(0.1, -120)).toBe(0.1)
  })

  test("a value already past the ceiling snaps to it in EITHER direction", () => {
    // The 1.5 case. Up clamps, and so does down: `1.5 - 0.1` is 1.4, still over, so the clamp lands on 1.0
    // rather than stepping to 1.4. So the first scroll of any kind recovers a hand-edited file, which is
    // the behaviour the asymmetry below makes necessary.
    expect(stepOpacity(1.5, 1)).toBe(1.0)
    expect(stepOpacity(1.5, -1)).toBe(1.0)
  })

  test("a value below the floor snaps UP when dimming, but steps normally when brightening", () => {
    // Measured, and the asymmetry is real rather than an oversight: `0.05 - 0.1` is negative and clamps to
    // the floor, while `0.05 + 0.1` is 0.15, which is in range and therefore kept. So a below-floor file
    // value recovers on the first scroll DOWN and only partially on the first scroll up.
    expect(stepOpacity(0.05, -1)).toBe(0.1)
    expect(stepOpacity(0.05, 1)).toBe(0.15000000000000002)
  })

  test("the clamp is asymmetric with validateSettings, and that is the C#'s", () => {
    // Measured against the real validator rather than described. `SettingsService.Validate` guards opacity
    // only from below, so 1.5 survives a load intact and the wheel is what corrects it -- while 0 does not
    // survive, because a fully transparent overlay cannot be clicked and there would be no way back.
    expect(validateSettings({ opacity: 1.5 }).opacity).toBe(1.5)
    expect(validateSettings({ opacity: 0 }).opacity).toBe(1.0)
    // The pair that names the divergence: the validator lets it through, this clamps it.
    expect(stepOpacity(validateSettings({ opacity: 1.5 }).opacity, -1)).toBe(1.0)
  })

  test("no reachable input escapes the range", () => {
    // A sweep rather than an argument. Every start value the settings path can produce, both directions.
    for (const start of [0, 0.05, 0.1, 0.3, 0.5, 0.9, 1.0, 1.5, 42]) {
      for (const direction of [1, -1]) {
        const next = stepOpacity(start, direction)
        expect(next).toBeGreaterThanOrEqual(OPACITY_MIN)
        expect(next).toBeLessThanOrEqual(OPACITY_MAX)
      }
    }
  })
})

describe("monotonicity, which is what makes the gesture feel like a dial", () => {
  test("brightening never dims and dimming never brightens, in range", () => {
    for (let start = 0.1; start <= 1.0; start += 0.05) {
      expect(stepOpacity(start, 1)).toBeGreaterThanOrEqual(start)
      expect(stepOpacity(start, -1)).toBeLessThanOrEqual(start)
    }
  })

  test("a run of notches is strictly monotone until it hits the bound", () => {
    const down = ladder(1.0, -1, 9)
    for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThan(down[i - 1] ?? 0)
    const up = ladder(0.1, 1, 9)
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1] ?? 1)
  })
})

describe("the float ladder, measured and kept", () => {
  test("nine notches down from the ceiling does NOT land on the floor", () => {
    // The residue of repeated binary addition, pinned exactly because it is observable in two places: the
    // settings file (JSON round-trips it verbatim) and the `next === settings.opacity` guard. Faithful to
    // the C#, which does the same arithmetic on a `double` behind the same `Math.Clamp`, so this is parity
    // rather than a JS artefact -- and the reason the renderer writes `toFixed(4)` instead of the raw value.
    const down = ladder(1.0, -1, 9)
    expect(down.at(-1)).toBe(NINE_DOWN)
    expect(down.at(-1)).not.toBe(OPACITY_MIN)
    expect(down).toEqual([
      0.9, 0.8, 0.7000000000000001, 0.6000000000000001, 0.5000000000000001, 0.40000000000000013,
      0.30000000000000016, 0.20000000000000015, NINE_DOWN,
    ])
  })

  test("nine notches up from the floor does NOT land on the ceiling", () => {
    // And the dust runs the other way: subtracting accumulates above the true value, adding below it.
    const up = ladder(0.1, 1, 9)
    expect(up.at(-1)).toBe(NINE_UP)
    expect(up.at(-1)).not.toBe(OPACITY_MAX)
    expect(up).toEqual([
      0.2, 0.30000000000000004, 0.4, 0.5, 0.6, 0.7, 0.7999999999999999, 0.8999999999999999, NINE_UP,
    ])
  })

  test("one more notch settles onto the bound exactly, so the dust does not accumulate forever", () => {
    // The arm that makes the two above harmless rather than a slow drift. From the residue, the next step
    // in the same direction is out of range and the clamp returns the bound BY IDENTITY -- so the ladder
    // has a fixed point, `main.ts`'s equality guard fires on the notch after that, and a user leaning on
    // the wheel writes the settings file twice more rather than indefinitely.
    expect(stepOpacity(NINE_DOWN, -1)).toBe(OPACITY_MIN)
    expect(stepOpacity(NINE_UP, 1)).toBe(OPACITY_MAX)
    expect(stepOpacity(stepOpacity(NINE_DOWN, -1), -1)).toBe(OPACITY_MIN)
  })

  test("and the residue never reaches the screen, because the write rounds", () => {
    // `renderer.ts`'s `writeOpacity` is `value.toFixed(4)`, and 1e-4 is 0.0255 of one 8-bit alpha level --
    // finer than the compositor can render. So the ladder's 1.4e-16 is invisible by two orders of magnitude
    // more than it needs to be, which is what makes keeping the C#'s arithmetic the cheap choice.
    expect(NINE_DOWN.toFixed(4)).toBe("0.1000")
    expect(NINE_UP.toFixed(4)).toBe("1.0000")
    expect(NINE_DOWN.toFixed(4)).toBe(OPACITY_MIN.toFixed(4))
  })

  test("the ladder is reversible in feel even though it is not in bits", () => {
    // Nine down then nine up returns to the ceiling, not to `1 - epsilon`: the clamp absorbs the residue on
    // the way back. This is the arm a user would notice if it failed -- scroll down and back up, end up
    // dimmer than you started, every time.
    const bottom = ladder(1.0, -1, 9).at(-1) ?? 0
    const back = ladder(bottom, 1, 9).at(-1)
    expect(back).toBe(OPACITY_MAX)
  })
})
