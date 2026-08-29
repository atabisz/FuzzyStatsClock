/**
 * `text-metrics.ts` against both fixtures.
 *
 * Two independent claims live here and they are worth keeping apart.
 *
 * **The `(int)` casts** (`text-size` rows, from the compiled `ApplyFontSize` arithmetic) are exact
 * integers and are compared exactly. The reason this block exists at all is that `Math.round` passes a
 * casual reading of the C# and is wrong at two of the six recorded sizes.
 *
 * **The line heights** (`text-line` rows, 78 of them) come from `Measure()`/`DesiredSize` on real WPF
 * `TextBlock`s, so they are a property of three font files rather than of any code. `lineHeight()` is a
 * formula fitted to them, and the fit is asserted against **every** row rather than at a few sizes: a
 * formula that matches a table at four places and diverges at the fifth is exactly what a spot check
 * misses. The widths in those rows are deliberately *not* asserted -- see the last block.
 */
import { describe, expect, test } from "bun:test"
import { toDigitHeight, toSegmentHeight, type LcdSize } from "../src/core/digit-size.js"
import { TEXT_STYLES } from "../src/core/settings.js"
import {
  LINE_SPACING,
  STATS_PANEL_WIDTH,
  deriveFontSizes,
  fontNameFor,
  fontSizeToLcdSize,
  fontStackFor,
  lineHeight,
  lineHeightIdealUnits,
  wrapThreshold,
  type WpfFontName,
} from "../src/core/text-metrics.js"
import { field, geometryFixture, layoutFixture, num, rows } from "./lib/wpf-fixture.js"

const geometry = geometryFixture()
const layout = layoutFixture()

const asFont = (s: string): WpfFontName => {
  if (s !== "Segoe UI Light" && s !== "Palatino Linotype" && s !== "Consolas") {
    throw new Error(`unexpected font family: ${s}`)
  }
  return s
}

/** The probe writes `LcdSize.Small`; this module's type is lowercase. */
const asLcdSize = (s: string): LcdSize => {
  const lower = s.toLowerCase()
  if (lower !== "small" && lower !== "medium" && lower !== "large") {
    throw new Error(`unexpected LcdSize: ${s}`)
  }
  return lower
}

describe("derived font sizes, measured", () => {
  // text-size: fontSize, phrase, qualifier, emphasis, date, lcdSize, segmentHeight, digitHeight
  test.each(
    rows(geometry, "text-size").map((r) => ({
      fontSize: num(r, 0),
      phrase: num(r, 1),
      qualifier: num(r, 2),
      emphasis: num(r, 3),
      date: num(r, 4),
      lcdSize: asLcdSize(field(r, 5)),
      segmentHeight: num(r, 6),
      digitHeight: num(r, 7),
    })),
  )("fontSize $fontSize derives $qualifier/$emphasis/$date", (row) => {
    const derived = deriveFontSizes(row.fontSize)
    expect(derived.phrase).toBe(row.phrase)
    expect(derived.qualifier).toBe(row.qualifier)
    expect(derived.emphasis).toBe(row.emphasis)
    expect(derived.date).toBe(row.date)
    expect(fontSizeToLcdSize(row.fontSize)).toBe(row.lcdSize)
    expect(toSegmentHeight(row.lcdSize)).toBe(row.segmentHeight)
    expect(toDigitHeight(row.lcdSize)).toBe(row.digitHeight)
  })

  test("the fixture covers the four menu sizes and four out-of-menu ones", () => {
    // 4 + 4. The out-of-menu values matter because a hand-edited settings file reaches them and the C#
    // has no clamp -- `fontSizeToLcdSize`'s default arm is the only thing catching them.
    expect(rows(geometry, "text-size")).toHaveLength(8)
  })

  test("Math.round would be wrong at 24, and wrong in the other direction at 45", () => {
    // The rows the truncation rule is for, restated as the failure they prevent so a future
    // "simplification" to Math.round has to argue with numbers rather than with a comment.
    expect(24 * 1.4).toBe(33.599999999999994)
    expect(deriveFontSizes(24).emphasis).toBe(33)
    expect(Math.round(24 * 1.4)).toBe(34)

    // The sharp case: the exact product is 63 and the double is just below it, so the cast gives 62.
    // The C# was measured at this size -- see the `text-size 45` row -- rather than reasoned about.
    expect(45 * 1.4).toBe(62.99999999999999)
    expect(deriveFontSizes(45).emphasis).toBe(62)
    expect(Math.round(45 * 1.4)).toBe(63)

    // And the claim that is NOT true, kept because an earlier version of this file asserted it: this
    // product is exactly 26, so 0.65 never exhibits the effect above at any reachable size.
    expect(40 * 0.65).toBe(26)
    expect(deriveFontSizes(40).qualifier).toBe(26)
  })

  test("only the 1.40 factor can lose a point to the truncation", () => {
    // Exhaustive over 1..200 for all three factors: enumerate the sizes whose exact product is a whole
    // number, and check whether the double lands under it. Answer, measured: qualifier 0, date 0,
    // emphasis 7 -- 45, 85, 90, 165, 170, 175, 180. Two of those are in the fixture.
    const losses = (numerator: number, denominator: number, factor: number): number[] => {
      const out: number[] = []
      for (let size = 1; size <= 200; size++) {
        if ((size * numerator) % denominator !== 0) continue
        if (Math.trunc(size * factor) !== (size * numerator) / denominator) out.push(size)
      }
      return out
    }
    expect(losses(65, 100, 0.65)).toEqual([])
    expect(losses(8, 10, 0.8)).toEqual([])
    expect(losses(14, 10, 1.4)).toEqual([45, 85, 90, 165, 170, 175, 180])
  })

  test("every reachable font size derives sizes that are integers and ordered", () => {
    // 8..100 covers the menu, the two recorded outliers and everything a settings file can hold in
    // between. Ordering is the invariant the layout depends on: emphasis is the largest line.
    for (let size = 8; size <= 100; size++) {
      const d = deriveFontSizes(size)
      expect(Number.isInteger(d.qualifier)).toBe(true)
      expect(Number.isInteger(d.emphasis)).toBe(true)
      expect(Number.isInteger(d.date)).toBe(true)
      expect(d.qualifier).toBeLessThan(d.phrase)
      expect(d.date).toBeLessThan(d.phrase)
      expect(d.emphasis).toBeGreaterThan(d.phrase)
    }
  })
})

describe("line heights, all 78 measured rows", () => {
  // text-line: family, fontSize, height, widthOfSample
  const lines = rows(layout, "text-line").map((r) => ({
    family: asFont(field(r, 0)),
    fontSize: num(r, 1),
    height: num(r, 2),
  }))

  test.each(lines)("$family at $fontSize is $height tall", (row) => {
    // The exact claim is the integer: WPF lays text out in whole 1/300ths of a pixel, and the measured
    // height is an exact multiple of 1/300 on all 78 rows, so `Math.round(height * 300)` recovers the
    // integer .NET had with no ambiguity. That integer agrees on 78 of 78.
    expect(lineHeightIdealUnits(row.family, row.fontSize)).toBe(Math.round(row.height * 300))
    // The pixel value agrees bit for bit on 43 of 78 and is out by exactly 1 ulp on the other 35 --
    // measured, not assumed. .NET reaches the same rational by a different division order and 1/300 is
    // not representable. `toBeCloseTo(..., 9)` is ~5e-10 against a worst observed 2.84e-14, i.e. 17,000x
    // headroom, while a wrong lineSpacing constant is out in the 9th significant figure at minimum.
    expect(lineHeight(row.family, row.fontSize)).toBeCloseTo(row.height, 9)
  })

  test("the pixel disagreement is at most one ulp, and only in the last bit", () => {
    // Bounds the loosening above with the thing it is loosening for, so nobody widens the tolerance
    // later on the belief that these numbers are merely approximate. 1 ulp at 133 is 2.8e-14.
    let exact = 0
    let worst = 0
    for (const row of lines) {
      const got = lineHeight(row.family, row.fontSize)
      if (got === row.height) exact++
      worst = Math.max(worst, Math.abs(got - row.height))
    }
    expect(exact).toBe(43)
    expect(worst).toBeLessThanOrEqual(3e-14)
  })

  test("all three faces are covered at 26 sizes each", () => {
    expect(lines).toHaveLength(78)
    for (const family of Object.keys(LINE_SPACING) as WpfFontName[]) {
      expect(lines.filter((l) => l.family === family)).toHaveLength(26)
    }
  })

  test("64 is the tie case, and both rounding rules agree there", () => {
    // fontSize * 2724/2048 * 300 lands exactly on .5 only at 64 among reachable sizes. Half-to-even
    // gives 25538 and half-away-from-zero gives 25538 too, so `Math.round` is safe -- recorded as a test
    // because "is there a tie?" is the question a reader of the formula will have, and the answer is
    // load-bearing rather than obvious.
    const ideal = 64 * LINE_SPACING["Segoe UI Light"] * 300
    expect(ideal).toBe(25537.5)
    expect(Math.round(ideal)).toBe(25538)
    expect(lineHeight("Segoe UI Light", 64)).toBe(85.126666666666665)
  })

  test("the spacing constants are exact dyadic fractions, not typed decimals", () => {
    // Written as `2724 / 2048` in the module. If a future edit replaces one with a decimal literal, the
    // value shifts in the 9th place and every row above still passes at 4 places while the total window
    // height drifts by a pixel at large sizes. Asserted as an exact multiple of 2^-11.
    for (const spacing of Object.values(LINE_SPACING)) {
      expect(Number.isInteger(spacing * 2048)).toBe(true)
    }
    expect(LINE_SPACING["Segoe UI Light"] * 2048).toBe(2724)
    expect(LINE_SPACING["Palatino Linotype"] * 2048).toBe(2763)
    expect(LINE_SPACING.Consolas * 2048).toBe(2398)
  })

  test("every measured height is an exact multiple of 1/300", () => {
    // This is what makes the division by 300 a reconstruction of WPF's own quantisation rather than a
    // curve fit -- and it is checked on the *measured* values, independently of this module's formula.
    // A tolerance of 1e-9 on a quantity of order 25,000 admits nothing but representation error: the
    // nearest competing grid, 1/301, would put these off by ~80 units.
    for (const row of lines) {
      const ideal = row.height * 300
      expect(Math.abs(ideal - Math.round(ideal))).toBeLessThan(1e-9)
    }
  })

  test("summing ideal units avoids the per-line rounding that summing pixels invites", () => {
    // Why `lineHeightIdealUnits` is exported rather than kept private. The Split text style stacks a
    // qualifier line and an emphasis line, and `layout.ts` adds them; adding integers and dividing once
    // is exact, while adding two already-divided values need not be.
    const sizes = deriveFontSizes(24)
    const a = lineHeightIdealUnits("Segoe UI Light", sizes.qualifier)
    const b = lineHeightIdealUnits("Segoe UI Light", sizes.emphasis)
    expect(Number.isInteger(a)).toBe(true)
    expect(Number.isInteger(b)).toBe(true)
    expect((a + b) / 300).toBeCloseTo(
      lineHeight("Segoe UI Light", sizes.qualifier) + lineHeight("Segoe UI Light", sizes.emphasis),
      9,
    )
  })
})

describe("font family selection", () => {
  test("each style maps to the family SetTextStyle sets", () => {
    expect(fontNameFor("Classic")).toBe("Segoe UI Light")
    expect(fontNameFor("Split")).toBe("Segoe UI Light")
    expect(fontNameFor("Literary")).toBe("Palatino Linotype")
    expect(fontNameFor("Mono")).toBe("Consolas")
  })

  test("every style has a family and a stack, with the WPF face first", () => {
    // Exhaustive over the union rather than the four spelled out above, so adding a fifth style to
    // `TEXT_STYLES` without teaching this module about it fails here instead of silently rendering in
    // the default face.
    for (const style of TEXT_STYLES) {
      const font = fontNameFor(style)
      expect(Object.keys(LINE_SPACING)).toContain(font)
      const stack = fontStackFor(style)
      // The first entry is the WPF face, quoted if it contains a space.
      const first = stack.split(",")[0]?.trim().replaceAll('"', "")
      expect(first).toBe(font)
      // And there is a generic family at the end, or a Linux box with none of the named faces gets the
      // browser default rather than the intended shape.
      expect(stack).toMatch(/(serif|sans-serif|monospace)$/)
    }
  })

  test("the mono stack ends in monospace and the literary one in serif", () => {
    // The distinction that actually shows: a serif style falling back to sans-serif is a visible parity
    // failure, and `sans-serif` also matches `/serif$/` if the assertion is written carelessly.
    expect(fontStackFor("Mono").endsWith("monospace")).toBe(true)
    expect(fontStackFor("Literary").endsWith("serif")).toBe(true)
    expect(fontStackFor("Literary").endsWith("sans-serif")).toBe(false)
    expect(fontStackFor("Classic").endsWith("sans-serif")).toBe(true)
  })
})

describe("the phrase wrap threshold, measured", () => {
  // wrap-threshold: panelWidth, threshold
  test.each(
    rows(geometry, "wrap-threshold").map((r) => ({ panelWidth: num(r, 0), threshold: num(r, 1) })),
  )("panel $panelWidth wraps past $threshold", (row) => {
    expect(wrapThreshold(row.panelWidth)).toBe(row.threshold)
  })

  test("the declared panel width is 184, not the 180 the XAML comment says", () => {
    // MainWindow.xaml's own comment says 180 in prose while the attribute is 184. The attribute wins;
    // this is the record that the discrepancy was seen rather than transcribed from the comment.
    expect(STATS_PANEL_WIDTH).toBe(184)
    expect(wrapThreshold(STATS_PANEL_WIDTH)).toBe(202.40000000000001)
  })
})

describe("what these rows deliberately do not claim", () => {
  test("the recorded sample widths are not asserted anywhere", () => {
    // `text-line` carries a `widthOfSample` column and nothing reads it. That is intentional: a text
    // width is a property of the installed font file, and on macOS and Linux "Segoe UI Light" is absent
    // so the browser substitutes. Asserting those widths would pass on this machine and fail on a Mac
    // for a reason that is not a defect. The renderer measures real width with `getComputedTextLength()`
    // where a width decision matters. This test exists so the unused column reads as a decision.
    const sample = rows(layout, "text-line")[0]
    expect(sample).toBeDefined()
    expect(sample?.fields).toHaveLength(4)
  })

  test("height parity is a Windows-only claim", () => {
    // Same reasoning for heights: the formula reproduces WPF's quantisation of three specific font
    // files. It is used to lay the port's own SVG out consistently, not asserted against a browser.
    // Recorded here rather than only in the module header, because a reader who arrives via a failing
    // test on a Mac needs to find this sentence.
    expect(lineHeight("Segoe UI Light", 12)).toBe(15.960000000000001)
    expect(lineHeight("Consolas", 12)).toBe(14.050000000000001)
  })
})
