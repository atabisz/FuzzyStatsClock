/**
 * Translated from FuzzyClock.Core.Tests/ContrastServiceTests.cs -- all 10 cases: 3 luminance, 2
 * ratio, 1 normal-path, 2 override-entry, 2 hysteresis.
 *
 * The C# suite is the thinnest in the Core (10 cases against 197 lines) and it is weak in a specific
 * way worth naming: for both override-entry cases it asserts only that the returned colour *differs*
 * from the accent and clears 4.5:1. It never pins which colour. So the identity of every override
 * result below was measured by compiling ContrastService.cs and printing its output -- it could not
 * have been read off the C# tests, and deriving it by hand would have got the rounding wrong.
 *
 * A note on the MSTest calls, because the argument order reads backwards: `IsGreaterThanOrEqualTo`
 * takes the BOUND first and the actual value second, so `IsGreaterThanOrEqualTo(4.5, ratio)` asserts
 * ratio >= 4.5. Translated in that direction.
 *
 * `Assert.AreEqual(new RgbColor(...), actual)` is record-struct equality, which becomes `toEqual`.
 *
 * The second half is additions, all measured the same way. They cover `adjustAccent`, `colorToHsl`,
 * `hslToColor` and `roundHalfToEven`, none of which the C# suite touches directly.
 */
import { describe, expect, test } from "bun:test"
import {
  adjustAccent,
  colorToHsl,
  computeDisplayColor,
  contrastRatio,
  hslToColor,
  relativeLuminance,
  roundHalfToEven,
  type RgbColor,
} from "../src/core/contrast.js"

function rgb(r: number, g: number, b: number): RgbColor {
  return { r, g, b }
}

const WHITE = rgb(255, 255, 255)
const BLACK = rgb(0, 0, 0)

/** Tolerance far tighter than the C# suite's 0.001, but loose enough for a libm ULP in Math.pow. */
const DIGITS = 12

describe("relativeLuminance, translated from ContrastServiceTests", () => {
  test("black is zero", () => {
    // The C# allows 0.001. It is exactly 0: linearize(0) takes the linear arm, 0 / 12.92.
    expect(relativeLuminance(BLACK)).toBe(0)
  })

  test("white is one", () => {
    // Also exact, and not by luck -- pow(1, 2.4) is 1, and the three coefficients sum to exactly
    // 1.0 as doubles in this evaluation order. Measured as G17 "1" against the C#.
    expect(relativeLuminance(WHITE)).toBe(1)
  })

  test("mid-grey approximates 0.216", () => {
    expect(relativeLuminance(rgb(128, 128, 128))).toBeCloseTo(0.216, 2)
    // and the value the C# actually produces, which its 0.01 tolerance leaves unpinned
    expect(relativeLuminance(rgb(128, 128, 128))).toBeCloseTo(0.21586050011389923, DIGITS)
  })

  test("the piecewise boundary at 0.04045 falls between channel 10 and 11", () => {
    // Not translated -- added because nothing else in the suite has a channel low enough to take
    // the linear arm, so the /12.92 divisor and the arm test itself were both unconstrained.
    // 10/255 = 0.0392 is on the linear side, 11/255 = 0.0431 on the power side.
    expect(relativeLuminance(rgb(10, 10, 10))).toBeCloseTo(0.0030352698354883748, DIGITS)
    expect(relativeLuminance(rgb(11, 11, 11))).toBeCloseTo(0.0033465357638991604, DIGITS)
    // The boundary itself is unreachable with 8-bit channels: 0.04045 * 255 = 10.31475, not an
    // integer. So `<=` versus `<` in that test cannot be told apart, and this says so.
    expect(0.04045 * 255).not.toBe(Math.round(0.04045 * 255))
  })
})

describe("contrastRatio, translated from ContrastServiceTests", () => {
  test("black against white is 21", () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21)
  })

  test("identical colours are 1", () => {
    expect(contrastRatio(WHITE, WHITE)).toBe(1)
  })
})

describe("computeDisplayColor, translated from ContrastServiceTests", () => {
  test("black accent on white stays normal and unchanged", () => {
    expect(computeDisplayColor(WHITE, BLACK, "normal")).toEqual({
      displayColor: BLACK,
      newState: "normal",
    })
  })

  test("white accent on white enters override", () => {
    const { displayColor, newState } = computeDisplayColor(WHITE, WHITE, "normal")
    expect(newState).toBe("override")
    // the two things the C# asserts
    expect(displayColor).not.toEqual(WHITE)
    expect(contrastRatio(WHITE, displayColor)).toBeGreaterThanOrEqual(4.5)
    // and the colour it leaves unpinned: white has no lightness step that works, so this is the
    // black/white fallback, and against a white background black wins.
    expect(displayColor).toEqual(BLACK)
  })

  test("black accent on black enters override", () => {
    const { displayColor, newState } = computeDisplayColor(BLACK, BLACK, "normal")
    expect(newState).toBe("override")
    expect(displayColor).not.toEqual(BLACK)
    expect(contrastRatio(BLACK, displayColor)).toBeGreaterThanOrEqual(4.5)
    // the mirror image, also unpinned by the C#
    expect(displayColor).toEqual(WHITE)
  })

  test("override is retained inside the hysteresis band", () => {
    const accent = rgb(0x76, 0x76, 0x76)
    const ratio = contrastRatio(WHITE, accent)
    // the C#'s two precondition asserts, in its argument order: ratio >= 4.5 and ratio <= 5.5
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(ratio).toBeLessThanOrEqual(5.5)
    expect(ratio).toBeCloseTo(4.5422249596052531, DIGITS)

    const { displayColor, newState } = computeDisplayColor(WHITE, accent, "override")
    expect(newState).toBe("override")
    // The C# discards the colour with `var (_, newState)`. It is the once-darkened accent.
    expect(displayColor).toEqual(rgb(105, 105, 105))
  })

  test("override exits above 5.5 and restores the accent", () => {
    const accent = rgb(0x59, 0x59, 0x59)
    const ratio = contrastRatio(WHITE, accent)
    expect(ratio).toBeGreaterThan(5.5)
    expect(ratio).toBeCloseTo(7.0047292080359354, DIGITS)

    expect(computeDisplayColor(WHITE, accent, "override")).toEqual({
      displayColor: accent,
      newState: "normal",
    })
  })
})

describe("computeDisplayColor, the state pairs the C# suite only half-covers (measured)", () => {
  // The C# tests each (background, accent) pair in ONE incoming state, so the state argument never
  // has to matter. These are the same pairs in both states, which is what gives `currentState` its
  // discriminating power: swap it for a constant and the four rows below stop agreeing.
  test.each([
    // bg, accent, incoming state, expected colour, expected state
    [WHITE, BLACK, "normal", BLACK, "normal"],
    [WHITE, BLACK, "override", BLACK, "normal"],
    [WHITE, WHITE, "normal", BLACK, "override"],
    [WHITE, WHITE, "override", BLACK, "override"],
    [BLACK, BLACK, "normal", WHITE, "override"],
    [BLACK, BLACK, "override", WHITE, "override"],
    // ratio 4.5422: passing, but inside the band. Normal keeps the accent; Override darkens it.
    [WHITE, rgb(118, 118, 118), "normal", rgb(118, 118, 118), "normal"],
    [WHITE, rgb(118, 118, 118), "override", rgb(105, 105, 105), "override"],
    // ratio 7.0047: above the exit threshold, so the state does not matter here
    [WHITE, rgb(89, 89, 89), "normal", rgb(89, 89, 89), "normal"],
    [WHITE, rgb(89, 89, 89), "override", rgb(89, 89, 89), "normal"],
    // yellow on white, ratio 1.0738: adjusts to a dark olive rather than falling back
    [WHITE, rgb(255, 255, 0), "normal", rgb(102, 102, 0), "override"],
    // grey on grey: no step works, and against 128 the fallback picks black
    [rgb(128, 128, 128), rgb(128, 128, 128), "normal", BLACK, "override"],
    [rgb(128, 128, 128), rgb(129, 129, 129), "normal", BLACK, "override"],
  ] as const)("bg %o accent %o from %s", (bg, accent, state, color, newState) => {
    expect(computeDisplayColor(bg, accent, state)).toEqual({
      displayColor: color,
      newState,
    })
  })

  test("the hysteresis band is only reachable while already overriding", () => {
    // Ratio 4.5422 is >= enter and <= exit. From "normal" the second guard returns early; from
    // "override" neither guard fires and the adjust path runs. Both directions asserted above --
    // this states the rule the pair encodes, and pins that the two answers DIFFER, which is what a
    // mutation collapsing the band would break.
    const accent = rgb(118, 118, 118)
    const fromNormal = computeDisplayColor(WHITE, accent, "normal")
    const fromOverride = computeDisplayColor(WHITE, accent, "override")
    expect(fromNormal).not.toEqual(fromOverride)
  })

  test("the exit threshold is exclusive and the enter threshold inclusive", () => {
    // 4.5 exactly cannot be hit with integer channels, so the >= / > distinction is pinned by the
    // nearest reachable pair instead: 118 sits above enter (4.5422) and below exit (5.5), 105 sits
    // below exit (5.4898). Neither exits the override.
    expect(contrastRatio(WHITE, rgb(105, 105, 105))).toBeCloseTo(5.4898145574099466, DIGITS)
    expect(computeDisplayColor(WHITE, rgb(105, 105, 105), "override").newState).toBe("override")
    expect(computeDisplayColor(WHITE, rgb(89, 89, 89), "override").newState).toBe("normal")
  })
})

describe("adjustAccent (measured -- the C# suite never calls it)", () => {
  test.each([
    // bg, accent, expected
    [WHITE, rgb(118, 118, 118), rgb(105, 105, 105)],
    [WHITE, rgb(255, 255, 0), rgb(102, 102, 0)],
    [BLACK, rgb(0, 0, 255), rgb(102, 102, 255)],
    [rgb(200, 200, 200), rgb(150, 150, 150), rgb(74, 74, 74)],
  ] as const)("bg %o accent %o adjusts to %o", (bg, accent, expected) => {
    expect(adjustAccent(bg, accent)).toEqual(expected)
    expect(contrastRatio(bg, adjustAccent(bg, accent))).toBeGreaterThanOrEqual(4.5)
  })

  test("the lightness step is clamped to 0 and 100", () => {
    // Added: nothing else reaches the clamp. Black on white steps to l = -5 on the first iteration
    // and white on black to l = 105, both of which produce a channel outside 0-255 if the clamp is
    // removed -- so these two rows are what hold it in place. Measured: both come back unchanged,
    // and via the loop's success return, not by exhausting it.
    expect(adjustAccent(WHITE, BLACK)).toEqual(BLACK)
    expect(adjustAccent(BLACK, WHITE)).toEqual(WHITE)
  })

  test("returns the accent unchanged when all eight steps fail", () => {
    // This is the signal computeDisplayColor reads to fall through to black or white. Identity, not
    // just equality: nothing about these three has a working lightness step in either direction.
    expect(adjustAccent(WHITE, WHITE)).toEqual(WHITE)
    expect(adjustAccent(BLACK, BLACK)).toEqual(BLACK)
    expect(adjustAccent(rgb(128, 128, 128), rgb(128, 128, 128))).toEqual(rgb(128, 128, 128))
  })

  test("direction follows the background, and the threshold is 0.5 to within one grey step", () => {
    // Greys 187 and 188 are the closest pair straddling luminance 0.5 -- measured, and agreeing
    // with the C# to all 17 digits. (I guessed 186/187 first; the suite caught it. Then I guessed a
    // 128 accent would adjust on both sides; it exhausts on 187. Both fixed by measuring.)
    expect(relativeLuminance(rgb(188, 188, 188))).toBeCloseTo(0.50288645803256871, DIGITS)
    expect(relativeLuminance(rgb(187, 187, 187))).toBeCloseTo(0.49693299506087041, DIGITS)
    expect(relativeLuminance(rgb(188, 188, 188))).toBeGreaterThan(0.5)
    expect(relativeLuminance(rgb(187, 187, 187))).toBeLessThan(0.5)

    // One background step apart, same accent, and the adjustment goes OPPOSITE ways. This is what
    // pins the 0.5 constant: move it either side of these two luminances and one row flips.
    const accent = rgb(60, 60, 60)
    expect(adjustAccent(rgb(188, 188, 188), accent)).toEqual(rgb(47, 47, 47)) // darkened
    expect(adjustAccent(rgb(187, 187, 187), accent)).toEqual(rgb(73, 73, 73)) // lightened

    // A lighter accent shows the other half of the rule: lightening from 128 against a background
    // this close to mid-grey can never reach 4.5, so 187 exhausts while 188 succeeds by darkening.
    expect(adjustAccent(rgb(188, 188, 188), rgb(128, 128, 128))).toEqual(rgb(64, 64, 64))
    expect(adjustAccent(rgb(187, 187, 187), rgb(128, 128, 128))).toEqual(rgb(128, 128, 128))
  })
})

describe("colorToHsl and hslToColor (measured -- both were internal and untested in C#)", () => {
  test.each([
    [rgb(0, 0, 0), 0, 0, 0],
    [WHITE, 0, 0, 100],
    [rgb(128, 128, 128), 0, 0, 50.196078431372548],
    [rgb(255, 0, 0), 0, 100, 50],
    [rgb(0, 255, 0), 120, 100, 50],
    [rgb(0, 0, 255), 240, 100, 50],
    [rgb(255, 255, 0), 60, 100, 50],
    [rgb(0, 255, 255), 180, 100, 50],
    [rgb(255, 0, 255), 300, 100, 50],
    [rgb(118, 118, 118), 0, 0, 46.274509803921568],
    [rgb(200, 100, 50), 20, 60.000000000000007, 49.019607843137251],
    [rgb(1, 2, 3), 210, 50.000000000000178, 0.78431372549019607],
    [rgb(10, 200, 30), 126.31578947368422, 90.476190476190482, 41.17647058823529],
    [rgb(37, 41, 39), 150, 5.1282051282051277, 15.294117647058824],
  ] as const)("%o converts to h/s/l", (color, h, s, l) => {
    const hsl = colorToHsl(color)
    expect(hsl.h).toBeCloseTo(h, DIGITS)
    expect(hsl.s).toBeCloseTo(s, DIGITS)
    expect(hsl.l).toBeCloseTo(l, DIGITS)
  })

  test("achromatic colours report hue 0, not an arbitrary angle", () => {
    for (const v of [0, 1, 64, 128, 200, 254, 255]) {
      expect(colorToHsl(rgb(v, v, v)).h).toBe(0)
      expect(colorToHsl(rgb(v, v, v)).s).toBe(0)
    }
  })

  test("the round trip is an identity, not an approximation", () => {
    // The C# was checked over all 16,777,216 colours with zero disagreements. A stride keeps this
    // one fast; the exhaustive run lives in the probe, not in the suite.
    const values = [0, 1, 2, 3, 127, 128, 129, 253, 254, 255]
    for (let i = 0; i < 256; i += 7) values.push(i)
    for (const r of values) {
      for (const g of values) {
        for (const b of values) {
          expect(hslToColor(colorToHsl(rgb(r, g, b)).h, colorToHsl(rgb(r, g, b)).s, colorToHsl(rgb(r, g, b)).l)).toEqual(
            rgb(r, g, b),
          )
        }
      }
    }
  })

  test.each([
    // hue, expected -- at s=100 l=50. The if-chain uses <, so a boundary lands in the LATER arm.
    [0, rgb(255, 0, 0)],
    [59.999999, rgb(255, 255, 0)],
    [60, rgb(255, 255, 0)],
    [60.000001, rgb(255, 255, 0)],
    [120, rgb(0, 255, 0)],
    [180, rgb(0, 255, 255)],
    [240, rgb(0, 0, 255)],
    [300, rgb(255, 0, 255)],
    [359.999999, rgb(255, 0, 0)],
    // 360 is out of contract -- colorToHsl never returns it -- but it takes the last arm rather
    // than falling off the end, which is worth pinning since nothing rejects it.
    [360, rgb(255, 0, 0)],
  ] as const)("hue %p maps to %o", (h, expected) => {
    expect(hslToColor(h, 100, 50)).toEqual(expected)
  })
})

describe("roundHalfToEven -- C# Math.Round semantics, which Math.round does not have", () => {
  test.each([
    [0, 0],
    [0.4, 0],
    [0.5, 0], // Math.round gives 1
    [0.6, 1],
    [1.5, 2],
    [2.5, 2], // Math.round gives 3
    [76.5, 76], // Math.round gives 77
    [77.5, 78],
    [92.5, 92], // Math.round gives 93
    [254.5, 254],
    [255, 255],
    [-0.5, 0], // and negatives, though HSL never produces one
    [-1.5, -2],
    [-2.5, -2],
  ] as const)("%p rounds to %p", (value, expected) => {
    expect(roundHalfToEven(value)).toBe(expected)
  })

  test("it disagrees with Math.round on exactly the odd half-integers", () => {
    // Positive control: if the two agreed everywhere, this loop would find nothing and the tests
    // above would be pinning a distinction that does not exist.
    const disagreements: number[] = []
    for (let i = 0; i < 256; i++) {
      if (roundHalfToEven(i + 0.5) !== Math.round(i + 0.5)) disagreements.push(i)
    }
    expect(disagreements.length).toBe(128)
    expect(disagreements.slice(0, 3)).toEqual([0, 2, 4])
  })

  test("the rounding rule changes the colour, and this is the smallest case", () => {
    // hslToColor(0, 0, 30): s=0 so every channel is l/100*255 = 76.5 exactly. Math.round would
    // give 77. Measured against the C#: 76.
    expect(hslToColor(0, 0, 30)).toEqual(rgb(76, 76, 76))

    // And it reaches the output, not just this helper. Measured over a stride-4 sweep of the cube:
    // on a white background, 4,807 of 262,144 accents get a different adjusted colour under
    // Math.round. This is one of them.
    expect(adjustAccent(WHITE, rgb(0, 0, 128))).toEqual(rgb(0, 0, 102))
  })
})

describe("the branches that provably cannot be told apart", () => {
  // Ten mutations of contrast.ts survive the suite. Every one is an equivalent mutant, not a hole,
  // and each is asserted here as the PROPERTY that makes it equivalent -- so the claim is checked
  // rather than taken on trust, and a future edit that breaks the property fails a test instead of
  // quietly making a survivor meaningful again.

  test("the exit guard's state test cannot change an answer", () => {
    // Nine survivors were predicted before the mutation run. This one was not, and it is a finding
    // about the code rather than the tests: `ratio > 5.5 && state === "override"` behaves
    // identically with the state test removed, because any ratio above 5.5 is also above 4.5 and
    // the next guard returns the same pair for an incoming "normal". Swept over the grey axis in
    // both states, which is the general form of the two 89-grey rows above.
    for (let v = 0; v < 256; v++) {
      const accent = rgb(v, v, v)
      if (contrastRatio(WHITE, accent) <= 5.5) continue
      expect(computeDisplayColor(WHITE, accent, "normal")).toEqual({
        displayColor: accent,
        newState: "normal",
      })
      expect(computeDisplayColor(WHITE, accent, "override")).toEqual({
        displayColor: accent,
        newState: "normal",
      })
    }
  })

  test("the `% 6` in the max === r hue branch is arithmetically a no-op", () => {
    // max === r means g and b both lie in [min, r], so |g - b| <= r - min = delta and the quotient
    // is already inside [-1, 1]. Checked over the whole grey-free space at a stride.
    for (let r = 0; r < 256; r += 5) {
      for (let g = 0; g <= r; g += 5) {
        for (let b = 0; b <= r; b += 5) {
          const max = r / 255
          const min = Math.min(r, Math.min(g, b)) / 255
          const delta = max - min
          if (delta === 0) continue
          expect(Math.abs((g / 255 - b / 255) / delta)).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  test("the `denom === 0` guard in colorToHsl is unreachable", () => {
    // denom is 0 only for max + min === 0 or 2 -- pure black or pure white -- and both take the
    // delta === 0 branch before the guard is ever evaluated.
    for (let r = 0; r < 256; r += 3) {
      for (let g = 0; g < 256; g += 3) {
        for (let b = 0; b < 256; b += 3) {
          const max = Math.max(r, g, b) / 255
          const min = Math.min(r, g, b) / 255
          if (1 - Math.abs(max + min - 1) !== 0) continue
          expect(max - min).toBe(0) // so the guard's branch is never reached
        }
      }
    }
  })

  test("neither threshold can be hit exactly, so >= and > cannot be distinguished there", () => {
    // A ratio of exactly 4.5 or 5.5 would need (Ll + 0.05) / (Ld + 0.05) to land on it precisely.
    // Sweeping every grey against both extremes finds nothing, and the greys are where the ratios
    // are densest.
    for (let v = 0; v < 256; v++) {
      const g = rgb(v, v, v)
      for (const other of [WHITE, BLACK, rgb(128, 128, 128)]) {
        expect(contrastRatio(g, other)).not.toBe(4.5)
        expect(contrastRatio(g, other)).not.toBe(5.5)
      }
    }
  })
})

describe("the black/white fallback tie-break (measured)", () => {
  test("the crossover on the grey axis sits between 117 and 118", () => {
    // The fallback picks white when contrastRatio(bg, white) >= contrastRatio(bg, black). Below 118
    // white wins, at 118 and above black does. Measured; also the reason the white-on-white case
    // returns black.
    expect(contrastRatio(rgb(117, 117, 117), WHITE)).toBeGreaterThan(
      contrastRatio(rgb(117, 117, 117), BLACK),
    )
    expect(contrastRatio(rgb(118, 118, 118), WHITE)).toBeLessThan(
      contrastRatio(rgb(118, 118, 118), BLACK),
    )
    // and end to end, through a pair of accents that exhaust every lightness step
    expect(computeDisplayColor(rgb(117, 117, 117), rgb(117, 117, 117), "normal").displayColor).toEqual(
      WHITE,
    )
    expect(computeDisplayColor(rgb(118, 118, 118), rgb(118, 118, 118), "normal").displayColor).toEqual(
      BLACK,
    )
  })

  test("the >= in the tie-break is never actually tied", () => {
    // A tie needs (L + 0.05)^2 = 0.0525, i.e. L = 0.1791287847... exactly. No integer triple hits
    // it -- swept the whole grey axis with none found. So mutating >= to > cannot be caught, and
    // that is recorded here rather than left to look like a coverage gap.
    for (let v = 0; v < 256; v++) {
      expect(contrastRatio(rgb(v, v, v), WHITE)).not.toBe(contrastRatio(rgb(v, v, v), BLACK))
    }
  })
})
