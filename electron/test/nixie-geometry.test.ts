/**
 * `nixie-geometry.ts` against the compiled `NixieDigit`.
 *
 * The tube, highlight, wire mesh, stroke widths and glow opacities are exact `G17` comparisons -- none
 * of them involves a transcendental function, so a tolerance would only mask a transcription error.
 *
 * ## How the transform is verified without a path parser
 *
 * The interesting rows are `nix-bounds`: `Geometry.Bounds` for all ten cathodes at all three sizes, after
 * the `TransformGroup` has been applied. Those bounds depend on the curves themselves -- the extremes of
 * an `A` arc and a `C` bezier -- and this module has no path parser, so it cannot predict them from the
 * `d` strings.
 *
 * What it can do is stronger than a spot check anyway. Each measured bound is the same underlying
 * design-space rectangle pushed through `scale`, `centerX`, `centerY` and `index * depthOffset`. Invert
 * the transform and the design-space rectangle falls out -- and it must be the **same rectangle** at all
 * three sizes, because the paths do not change. So:
 *
 *  1. Invert every measured bound with this module's own transform parameters.
 *  2. Assert all three sizes agree, per digit, on the design-space rectangle.
 *  3. Assert that rectangle lies inside the declared 30x50 path space.
 *
 * Step 2 is a three-way cross-check that fails if `scale`, `centerX`, `centerY` or `depthOffset` is wrong
 * in *any* size-dependent way -- which is every way they can be wrong, since all four are functions of
 * `digitHeight`. Step 3 catches the residual case where all three are wrong by the same constant offset.
 * Together they pin the transform without ever asserting a number this module could not have produced.
 *
 * A worked example of what step 2 catches: `translate` and `scale` swapped in the SVG string displaces the
 * digit by `centerX * (1 - scale)`, which is a *different* displacement at each size, so the three
 * inverted rectangles disagree and the test fails. Reasoning about the composition order in a comment
 * would not have caught it.
 */
import { describe, expect, test } from "bun:test"
import {
  COLON_DOT_GAP,
  COLON_SIDE_MARGIN,
  DIGIT_PATHS,
  DIGIT_PATH_HEIGHT,
  DIGIT_PATH_WIDTH,
  GLOW_BASE_OPACITIES,
  GLOW_WIDTH_MULTIPLIERS,
  buildNixieDigit,
  colonDotSize,
  flickerStep,
  flickerTarget,
  glowOpacity,
  nixieColonPanel,
  nixieTransform,
} from "../src/core/nixie-geometry.js"
import { geometryFixture, num, rows } from "./lib/wpf-fixture.js"

const fixture = geometryFixture()

describe("nixie control size and child counts, measured", () => {
  // nix-metrics: digitHeight, ctrlWidth, ctrlHeight, childCount, wireCount, ghostCount, glowCount
  test.each(
    rows(fixture, "nix-metrics").map((r) => ({
      digitHeight: num(r, 0),
      width: num(r, 1),
      height: num(r, 2),
      childCount: num(r, 3),
      wireCount: num(r, 4),
      ghostCount: num(r, 5),
      glowCount: num(r, 6),
    })),
  )("digitHeight $digitHeight is $width x $height", (row) => {
    const g = buildNixieDigit(row.digitHeight)
    expect(g.width).toBe(row.width)
    expect(g.height).toBe(row.height)
    // The wire count is the `<=` boundary on an accumulated double. It is 7, 10 and 12 across the three
    // sizes -- not a constant -- so it is the one child count that could plausibly be off by one.
    expect(g.wires).toHaveLength(row.wireCount)
    expect(DIGIT_PATHS).toHaveLength(row.ghostCount)
    expect(g.glowStrokeWidths).toHaveLength(row.glowCount)
    // 2 rects (tube + highlight) + wires + 10 ghosts + 4 glows.
    expect(2 + g.wires.length + row.ghostCount + row.glowCount).toBe(row.childCount)
  })
})

describe("tube and highlight, measured", () => {
  // nix-tube: digitHeight, width, height, radiusX, radiusY, strokeThickness
  test.each(
    rows(fixture, "nix-tube").map((r) => ({
      digitHeight: num(r, 0),
      width: num(r, 1),
      height: num(r, 2),
      radiusX: num(r, 3),
      radiusY: num(r, 4),
      stroke: num(r, 5),
    })),
  )("tube at $digitHeight", (row) => {
    const g = buildNixieDigit(row.digitHeight)
    expect(g.width).toBe(row.width)
    expect(g.height).toBe(row.height)
    // The radius is a literal 8 at every size -- it does not scale, so a large tube is proportionally
    // squarer. Asserted because "scale the radius too" is the natural-looking improvement.
    expect(g.tubeRadius).toBe(row.radiusX)
    expect(g.tubeRadius).toBe(row.radiusY)
    expect(1.5).toBe(row.stroke)
  })

  // nix-highlight: digitHeight, width, height, radiusX, radiusY
  test.each(
    rows(fixture, "nix-highlight").map((r) => ({
      digitHeight: num(r, 0),
      width: num(r, 1),
      height: num(r, 2),
      radiusX: num(r, 3),
      radiusY: num(r, 4),
    })),
  )("highlight at $digitHeight is $height tall", (row) => {
    const g = buildNixieDigit(row.digitHeight)
    expect(g.width).toBe(row.width)
    expect(g.highlightHeight).toBe(row.height)
    expect(g.highlightRadius).toBe(row.radiusX)
    expect(g.highlightRadius).toBe(row.radiusY)
  })
})

describe("wire mesh, every line measured", () => {
  // nix-wire: digitHeight, index, x1, x2, y
  test.each(
    rows(fixture, "nix-wire").map((r) => ({
      digitHeight: num(r, 0),
      index: num(r, 1),
      x1: num(r, 2),
      x2: num(r, 3),
      y: num(r, 4),
    })),
  )("wire $index at $digitHeight", (row) => {
    const wire = buildNixieDigit(row.digitHeight).wires[row.index]
    expect(wire).toBeDefined()
    expect(wire?.x1).toBe(row.x1)
    expect(wire?.x2).toBe(row.x2)
    expect(wire?.y).toBe(row.y)
  })
})

describe("stroke widths and glow opacities, measured", () => {
  // nix-ghoststroke: digitHeight, thickness
  test.each(
    rows(fixture, "nix-ghoststroke").map((r) => ({
      digitHeight: num(r, 0),
      thickness: num(r, 1),
    })),
  )("ghost stroke at $digitHeight is $thickness", (row) => {
    expect(buildNixieDigit(row.digitHeight).baseStroke).toBe(row.thickness)
  })

  // nix-stroke: digitHeight, layer, thickness, opacity
  test.each(
    rows(fixture, "nix-stroke").map((r) => ({
      digitHeight: num(r, 0),
      layer: num(r, 1),
      thickness: num(r, 2),
      opacity: num(r, 3),
    })),
  )("glow layer $layer at $digitHeight", (row) => {
    const g = buildNixieDigit(row.digitHeight)
    expect(g.glowStrokeWidths[row.layer]).toBe(row.thickness)
    // The resting opacity is the base value, unmultiplied: RebuildGeometry sets it before any tick.
    expect(GLOW_BASE_OPACITIES[row.layer]).toBe(row.opacity)
  })

  test("the multipliers run outermost to core", () => {
    // Order is load-bearing: reversed, the core hairline is drawn under a 3.6x halo and the digit
    // disappears into a smear. The values themselves are pinned by nix-stroke above.
    expect(GLOW_WIDTH_MULTIPLIERS).toEqual([3.6, 2.4, 1.6, 1.0])
    expect(GLOW_BASE_OPACITIES).toEqual([0.04, 0.1, 0.3, 1.0])
  })
})

describe("colon dot size, measured", () => {
  // nix-dot: digitHeight, dotSize
  test.each(
    rows(fixture, "nix-dot").map((r) => ({ digitHeight: num(r, 0), dotSize: num(r, 1) })),
  )("dot at $digitHeight is $dotSize", (row) => {
    expect(colonDotSize(row.digitHeight)).toBe(row.dotSize)
  })
})

describe("the depth-stacked transform, cross-checked across all three sizes", () => {
  interface Bound {
    readonly digitHeight: number
    readonly digit: number
    readonly left: number
    readonly top: number
    readonly width: number
    readonly height: number
  }

  const bounds: readonly Bound[] = rows(fixture, "nix-bounds").map((r) => ({
    digitHeight: num(r, 0),
    digit: num(r, 1),
    left: num(r, 2),
    top: num(r, 3),
    width: num(r, 4),
    height: num(r, 5),
  }))

  /** Undo `translate(centerX, centerY + i*depth) scale(s)` to recover the 30x50-space rectangle. */
  function toDesignSpace(b: Bound): { left: number; top: number; width: number; height: number } {
    const g = buildNixieDigit(b.digitHeight)
    return {
      left: (b.left - g.centerX) / g.scale,
      top: (b.top - (g.centerY + b.digit * g.depthOffset)) / g.scale,
      width: b.width / g.scale,
      height: b.height / g.scale,
    }
  }

  test("the fixture covers all ten digits at all three sizes", () => {
    expect(bounds).toHaveLength(30)
  })

  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "digit %p inverts to one design-space rectangle at every size",
    (digit) => {
      const forDigit = bounds.filter((b) => b.digit === digit)
      expect(forDigit).toHaveLength(3)
      const inverted = forDigit.map(toDesignSpace)
      const first = inverted[0]
      expect(first).toBeDefined()
      if (first === undefined) return
      for (const other of inverted.slice(1)) {
        // 4 places, and the number is measured rather than chosen. `Geometry.Bounds` is computed in
        // WPF's graphics pipeline, which is **single precision**: the measured
        // `16.799999237060547` is exactly the double nearest `fround(21 * 0.8)`, and the rest sit a few
        // float32 ulps off their exact products, consistent with float32 arithmetic through several
        // steps rather than one final rounding. So the fixture carries ~7 significant digits, not 17,
        // and the residual is float32 noise at three different scales.
        //
        // Worst observed disagreement across all 10 digits is 5.83e-6, at digit 4 -- which is all
        // straight lines, so this is not bezier flattening. The 5e-5 tolerance is ~8.6x that and ~13
        // float32 ulps at these magnitudes, while a wrong transform is out by whole pixels: the
        // scale/translate swap below displaces digit 4 by 0.88, which is 17,600x the tolerance.
        expect(other.left).toBeCloseTo(first.left, 4)
        expect(other.top).toBeCloseTo(first.top, 4)
        expect(other.width).toBeCloseTo(first.width, 4)
        expect(other.height).toBeCloseTo(first.height, 4)
      }
      // Inside the declared design space -- catches a centre that is right in its size-dependence and
      // wrong by a constant, which step 1 alone would accept.
      expect(first.left).toBeGreaterThanOrEqual(0)
      expect(first.top).toBeGreaterThanOrEqual(0)
      expect(first.left + first.width).toBeLessThanOrEqual(DIGIT_PATH_WIDTH)
      expect(first.top + first.height).toBeLessThanOrEqual(DIGIT_PATH_HEIGHT)
    },
  )

  test("translate outside scale is the composition the measured bounds require", () => {
    // Digit 4 is `M 23,5 L 6,31 L 27,31 M 23,5 L 23,49` -- straight lines only, no arc and no bezier --
    // so its design-space bounds are readable off the path by eye: left 6, top 5, width 21, height 44.
    // That makes it the one digit whose measured `nix-bounds` row can be predicted without a path
    // parser, and therefore the one that can discriminate between the two composition orders. It is
    // also, separately, the digit with the largest float32 residual, which is why the tolerance above
    // was measured on it.
    const g = buildNixieDigit(40)
    const measured = bounds.find((b) => b.digitHeight === 40 && b.digit === 4)
    expect(measured).toBeDefined()
    if (measured === undefined) return

    // WPF's order: scale in design space, then translate in control space.
    expect(g.centerX + 6 * g.scale).toBeCloseTo(measured.left, 4)
    // Digit 4 is the fifth cathode, so four depth offsets down.
    expect(g.centerY + 4 * g.depthOffset + 5 * g.scale).toBeCloseTo(measured.top, 4)
    expect(21 * g.scale).toBeCloseTo(measured.width, 4)
    expect(44 * g.scale).toBeCloseTo(measured.height, 4)

    // The plausible-looking inversion -- translate first, then scale the lot -- displaces the left edge
    // by centerX * (1 - scale) = 0.88 here. Asserted as a gap rather than a value so it stays a
    // statement about discriminating power: the tolerance above is 5e-5, this is 17,600x it.
    expect(Math.abs((g.centerX + 6) * g.scale - measured.left)).toBeGreaterThan(0.5)
  })

  test("the transform string is written at full precision", () => {
    // A regression pin on the string form, not an independent check of the numbers -- those are pinned
    // by the bounds above. `centerX` at digitHeight 40 is 4.399999999999999, because the measured
    // control width is 32.799999999999997; writing "4.4" would be a rounding this module does nowhere
    // else. Separators are space-and-space, not comma, and the two ops are in SVG's right-to-left order.
    const g = buildNixieDigit(40)
    expect(nixieTransform(g, 0)).toBe("translate(4.399999999999999 6) scale(0.8)")
    // Cathode 3 sits three depth offsets lower: 6 + 3 * 0.32.
    expect(nixieTransform(g, 3)).toBe("translate(4.399999999999999 6.96) scale(0.8)")
  })
})

describe("flicker, measured", () => {
  // nix-flicker: draw, target, current, layer0..layer3. `current` accumulates across rows, so the
  // sequence is replayed in order rather than each row being checked independently -- which is the
  // point: the bug this catches is a reset of `current` on every tick.
  test("replays the recorded eight-tick sequence", () => {
    let current = 1.0
    for (const row of rows(fixture, "nix-flicker")) {
      const draw = num(row, 0)
      const target = flickerTarget(draw)
      expect(target).toBe(num(row, 1))
      current = flickerStep(current, target)
      expect(current).toBe(num(row, 2))
      for (let layer = 0; layer < 4; layer++) {
        expect(glowOpacity(layer, current)).toBe(num(row, 3 + layer))
      }
    }
  })

  test("the core layer is the one the Min(1.0, ...) clamp is for", () => {
    // base 1.0 x current 1.18 would be 1.18; the other three cannot reach 1.0 at any reachable current.
    expect(glowOpacity(3, 1.18)).toBe(1.0)
    expect(glowOpacity(2, 1.18)).toBeCloseTo(0.354, 12)
  })

  test("rejects a layer index that does not exist", () => {
    expect(() => glowOpacity(4, 1.0)).toThrow(RangeError)
  })
})

describe("the cathode paths", () => {
  test("are ten strings in an SVG-compatible subset", () => {
    expect(DIGIT_PATHS).toHaveLength(10)
    for (const d of DIGIT_PATHS) {
      // M/L/C/A/Z only. WPF's Geometry.Parse and SVG's `d` agree on exactly this subset with the same
      // argument order, which is what lets the paths be copied rather than redrawn -- so a future edit
      // introducing a WPF-only command (or a relative one, where the two differ in practice) fails here.
      expect(d).toMatch(/^[MLCAZ0-9 ,.-]+$/)
      expect(d.startsWith("M ")).toBe(true)
    }
  })
})

describe("the colon panel", () => {
  // Every reachable digit height, read from the fixture rather than listed, so a new size tier is covered
  // the moment it is measured.
  const digitHeights = rows(fixture, "nix-metrics").map((r) => num(r, 0))

  test("covers all three measured sizes", () => {
    expect(digitHeights).toHaveLength(3)
  })

  test("the width is the two margins plus the dot, and only the dot scales", () => {
    for (const digitHeight of digitHeights) {
      const geometry = buildNixieDigit(digitHeight)
      const panel = nixieColonPanel(digitHeight, geometry.height)
      expect(panel.dotSize).toBe(colonDotSize(digitHeight))
      expect(panel.width).toBe(2 * COLON_SIDE_MARGIN + panel.dotSize)
      // The margin is the same absolute 4 at every size -- the C# rescales only the diameter. So the
      // panel's non-dot width is a constant, which is the property that makes the colon look tighter at
      // Large than at Small. `toBeCloseTo` rather than `toBe`: subtracting a `h * 0.13` back out of a sum
      // it was added into loses an ulp (7.999999999999999 at digitHeight 30), and it is the *arithmetic
      // here* that is inexact -- the line above asserts the exact identity the implementation computes.
      expect(panel.width - panel.dotSize).toBeCloseTo(2 * COLON_SIDE_MARGIN, 12)
      expect(panel.dotX).toBe(COLON_SIDE_MARGIN)
    }
  })

  test("the two dots are one gap apart and the stack is vertically centred in the tube", () => {
    for (const digitHeight of digitHeights) {
      const geometry = buildNixieDigit(digitHeight)
      const panel = nixieColonPanel(digitHeight, geometry.height)
      expect(panel.dot2Y - panel.dot1Y).toBe(panel.dotSize + COLON_DOT_GAP)
      // `VerticalAlignment="Center"`: the space above the first dot equals the space below the second.
      const above = panel.dot1Y
      const below = geometry.height - (panel.dot2Y + panel.dotSize)
      expect(below).toBeCloseTo(above, 12)
      expect(above).toBeGreaterThan(0)
    }
  })

  test("the gap is the dot's bottom margin and not a derived fraction", () => {
    // `Margin="4,0,4,6"` on ColonDot1 and `"4,0,4,0"` on ColonDot2. Both literals, so the gap does not
    // move with the size -- asserted across all three because a fraction of the height would look correct
    // at any single size and only show up as a difference between them. Recovering the gap needs a
    // subtraction, so the comparison is to 12 places rather than exact; the three recovered values span
    // 5.999999999999999 to 6.000000000000001, which is noise and not a scaling.
    for (const digitHeight of digitHeights) {
      const panel = nixieColonPanel(digitHeight, buildNixieDigit(digitHeight).height)
      expect(panel.dot2Y - panel.dot1Y - panel.dotSize).toBeCloseTo(COLON_DOT_GAP, 12)
    }
  })
})
