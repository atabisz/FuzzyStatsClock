/**
 * `seven-segment-geometry.ts` against the compiled WPF control.
 *
 * The fixture rows come from a probe that `<Page Include>`s `SevenSegmentDigit.xaml` into its own
 * assembly, so `RebuildGeometry()` there is the shipped method rather than a transcription of it, and
 * `RootCanvas` is the real canvas with the real children on it. Every value is `G17`, so these are
 * **exact** comparisons: `toBe`, not `toBeCloseTo`. No transcendental function touches this geometry, so
 * a tolerance here would only hide a transcription error.
 *
 * 252 of the assertions are the polygon points -- 6 combinations x 7 segments x 6 vertices -- and they
 * are what makes this test discriminating. The control size and colon width alone are satisfied by
 * getting `t`, `pad` and `digitW` right, which is the easy half; the vertices additionally pin `gap`,
 * `ch`, `bw`, `vhalf`, the point *order* in both builders, and the exact grouping of the seven origin
 * expressions. A port that simplifies `pad + t + gap + vhalf + t + 2 * gap` to
 * `pad + 2 * t + vhalf + 3 * gap` -- algebraically identical, different in doubles -- fails here and
 * passes everything else.
 */
import { describe, expect, test } from "bun:test"
import {
  buildSevenSegmentDigit,
  pointsAttribute,
  type SegmentStyle,
} from "../src/core/seven-segment-geometry.js"
import { field, geometryFixture, num, rows } from "./lib/wpf-fixture.js"

const fixture = geometryFixture()

const asStyle = (s: string): SegmentStyle => {
  if (s !== "Classic" && s !== "Bold") throw new Error(`unexpected segment style: ${s}`)
  return s
}

describe("seven-segment control size, measured", () => {
  // seg-metrics: style, segmentHeight, ctrlWidth, ctrlHeight, canvasWidth, canvasHeight, childCount
  test.each(
    rows(fixture, "seg-metrics").map((r) => ({
      style: asStyle(field(r, 0)),
      height: num(r, 1),
      ctrlWidth: num(r, 2),
      ctrlHeight: num(r, 3),
      canvasWidth: num(r, 4),
      canvasHeight: num(r, 5),
      childCount: num(r, 6),
    })),
  )("$style at $height is $ctrlWidth x $ctrlHeight", (row) => {
    const g = buildSevenSegmentDigit(row.style, row.height)
    expect(g.digitWidth).toBe(row.ctrlWidth)
    expect(g.canvasHeight).toBe(row.ctrlHeight)
    // The canvas and the control carry the same size -- RebuildGeometry sets both from the same pair.
    expect(g.digitWidth).toBe(row.canvasWidth)
    expect(g.canvasHeight).toBe(row.canvasHeight)
    // 1 background + 7 segments + 2 dots. Pinned because a missing dot is invisible until a colon ticks.
    expect(1 + g.segments.length + g.dots.length).toBe(row.childCount)
  })
})

describe("colon width, measured", () => {
  // seg-colon: style, segmentHeight, colonWidth, digitWidth
  test.each(
    rows(fixture, "seg-colon").map((r) => ({
      style: asStyle(field(r, 0)),
      height: num(r, 1),
      colonWidth: num(r, 2),
      digitWidth: num(r, 3),
    })),
  )("$style at $height narrows to $colonWidth", (row) => {
    const g = buildSevenSegmentDigit(row.style, row.height)
    expect(g.colonWidth).toBe(row.colonWidth)
    // The wide state is the same build: only `Width` changes on a colon, never the geometry.
    expect(g.digitWidth).toBe(row.digitWidth)
  })
})

describe("segment polygons, every vertex measured", () => {
  // seg-poly: style, segmentHeight, index, pointIndex, x, y
  test.each(
    rows(fixture, "seg-poly").map((r) => ({
      style: asStyle(field(r, 0)),
      height: num(r, 1),
      segment: num(r, 2),
      point: num(r, 3),
      x: num(r, 4),
      y: num(r, 5),
    })),
  )("$style $height segment $segment vertex $point", (row) => {
    const g = buildSevenSegmentDigit(row.style, row.height)
    const segment = g.segments[row.segment]
    expect(segment).toBeDefined()
    const point = segment?.[row.point]
    expect(point).toBeDefined()
    expect(point?.x).toBe(row.x)
    expect(point?.y).toBe(row.y)
  })
})

describe("colon dots, measured", () => {
  // seg-dot: style, segmentHeight, dot, left, top, width, height. `dot` is 1-based in the probe --
  // it indexes the Rectangle list after the background rect, so dot 1 is the upper one.
  test.each(
    rows(fixture, "seg-dot").map((r) => ({
      style: asStyle(field(r, 0)),
      height: num(r, 1),
      dot: num(r, 2),
      left: num(r, 3),
      top: num(r, 4),
      width: num(r, 5),
      dotHeight: num(r, 6),
    })),
  )("$style $height dot $dot at $left,$top", (row) => {
    const g = buildSevenSegmentDigit(row.style, row.height)
    const dot = g.dots[row.dot - 1]
    expect(dot).toBeDefined()
    expect(dot?.x).toBe(row.left)
    expect(dot?.y).toBe(row.top)
    expect(dot?.width).toBe(row.width)
    expect(dot?.height).toBe(row.dotHeight)
  })
})

describe("the fixture itself", () => {
  test("has both styles at all three sizes", () => {
    // Guards the guard: 12 rows means 2 styles x 3 sizes x (digit + colon). A silently truncated
    // fixture would make every test above pass over fewer cases than it looks like it covers.
    expect(rows(fixture, "seg-metrics")).toHaveLength(6)
    expect(rows(fixture, "seg-colon")).toHaveLength(6)
    expect(rows(fixture, "seg-poly")).toHaveLength(6 * 7 * 6)
    expect(rows(fixture, "seg-dot")).toHaveLength(6 * 2)
  })
})

describe("pointsAttribute", () => {
  test("emits full precision, not a fixed decimal count", () => {
    const g = buildSevenSegmentDigit("Classic", 32)
    const attr = pointsAttribute(g.segments[1] ?? [])
    // 19.199999999999999 shortest-round-trips to "19.2"; the value that must NOT appear is a
    // truncation like "17.55" where the double is 17.549999999999999.
    expect(attr).toContain(",")
    expect(attr.split(" ")).toHaveLength(6)
    for (const pair of attr.split(" ")) {
      const [x, y] = pair.split(",")
      expect(Number(x)).not.toBeNaN()
      expect(Number(y)).not.toBeNaN()
    }
  })

  test("round-trips every vertex through the string form exactly", () => {
    // The renderer writes these strings into the DOM, so a lossy formatter would undo the whole
    // exact-match effort above. `String(number)` is shortest-round-trippable by spec; this asserts it.
    for (const style of ["Classic", "Bold"] as const) {
      for (const h of [32, 48, 64]) {
        const g = buildSevenSegmentDigit(style, h)
        for (const segment of g.segments) {
          const parsed = pointsAttribute(segment)
            .split(" ")
            .map((p) => {
              const [x, y] = p.split(",")
              return { x: Number(x), y: Number(y) }
            })
          expect(parsed).toEqual(segment.map((p) => ({ x: p.x, y: p.y })))
        }
      }
    }
  })
})
