/**
 * The seven-segment digit's geometry, ported from `SevenSegmentDigit.RebuildGeometry`
 * (`SevenSegmentDigit.xaml.cs:144-222`) and its two point-collection builders.
 *
 * Every number here is checked against the **compiled control**, not against a reading of it: the probe
 * `<Page Include>`s `SevenSegmentDigit.xaml` into its own assembly so `RebuildGeometry()` is the shipped
 * method and `RootCanvas` is the real canvas, then writes out the control size, the colon width and all
 * 42 polygon points at `G17`. Those rows are `test/fixtures/wpf-geometry.tsv` and they are what
 * `seven-segment-geometry.test.ts` asserts against, to the last representable digit.
 *
 * That matters more than it sounds. The two styles differ in five constants, and `vhalf` --
 * `(h - 3t - 4gap) / 2` -- is a difference of products of a double by a decimal literal, so the results
 * are values like `19.199999999999999` rather than `19.2`. A port that rounds anywhere lands on
 * plausible geometry that is a fraction of a pixel out at every vertex, which reads as slightly soft
 * segments and never as a bug. Nothing here rounds.
 *
 * ## What the shape is
 *
 * Each segment is a **hexagon**, not a rectangle: `ch` (the chamfer) cuts the ends to a point so
 * adjacent segments meet at a mitre the way a real LCD mask does. `ch` is half the segment thickness in
 * Classic and a quarter of it in Bold, which is why Bold's segments read as blunt bars and Classic's as
 * tapered ones.
 *
 * ## The colon is the same control, narrowed
 *
 * `UpdateSegments` does not build a separate colon glyph. On `':'` it hides all seven polygons, paints
 * the two dots, and narrows the background rect, the canvas and the control to `_builtColonW` --
 * **width only, the height never changes**. The dots exist in every digit and sit in the ghost colour
 * when the character is not a colon, so they are built here unconditionally too. The C# uses
 * `Visibility.Hidden` rather than `Collapsed`, whose SVG equivalent is `visibility: hidden`.
 */

/** The two styles `ApplyLcdColors` can select. Not a settings value -- it is derived from `lcdStyle`. */
export type SegmentStyle = "Classic" | "Bold"

/** The five style-dependent constants, as fractions of the segment height. */
interface StyleRatios {
  readonly thickness: number
  readonly gap: number
  readonly padding: number
  /** Chamfer, as a fraction of `thickness` rather than of the height. */
  readonly chamferOfThickness: number
  readonly digitWidth: number
}

const RATIOS: Record<SegmentStyle, StyleRatios> = {
  Classic: { thickness: 0.1, gap: 0.05, padding: 0.05, chamferOfThickness: 0.5, digitWidth: 0.6 },
  Bold: { thickness: 0.19, gap: 0.012, padding: 0.04, chamferOfThickness: 0.25, digitWidth: 0.7 },
}

/** A point in the digit's own coordinate space, origin at the canvas's top-left. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** A colon dot: a `thickness`-square rect at a canvas offset. */
export interface DotRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SevenSegmentGeometry {
  /** `Width` when the character is anything but `':'`, and the background rect's width with it. */
  readonly digitWidth: number
  /** `Width` when the character is `':'`. `t * 3`, so one thickness of padding each side. */
  readonly colonWidth: number
  /** `Height`, unchanged between the two states. */
  readonly canvasHeight: number
  /** Segment thickness, which is also the colon dot's side. */
  readonly thickness: number
  /** The seven hexagons in `RebuildGeometry`'s order: a, b, c, d, e, f, g -- indices 0..6. */
  readonly segments: readonly (readonly Point[])[]
  /** The upper and lower colon dots, in the order the C# adds them. */
  readonly dots: readonly [DotRect, DotRect]
}

/**
 * `HorizontalSegment` (`:227-236`), verbatim including the point order, which is what makes the
 * polygon wind correctly.
 */
function horizontalSegment(
  x: number,
  y: number,
  barWidth: number,
  thickness: number,
  ch: number,
): readonly Point[] {
  return [
    { x: x + ch, y },
    { x: x + barWidth - ch, y },
    { x: x + barWidth, y: y + ch },
    { x: x + barWidth - ch, y: y + thickness },
    { x: x + ch, y: y + thickness },
    { x, y: y + ch },
  ]
}

/** `VerticalSegment` (`:238-247`), verbatim. */
function verticalSegment(
  x: number,
  y: number,
  barHeight: number,
  thickness: number,
  ch: number,
): readonly Point[] {
  return [
    { x: x + ch, y },
    { x: x + thickness, y: y + ch },
    { x: x + thickness, y: y + barHeight - ch },
    { x: x + ch, y: y + barHeight },
    { x, y: y + barHeight - ch },
    { x, y: y + ch },
  ]
}

/**
 * Builds one digit's geometry for a style and segment height.
 *
 * The arithmetic is transcribed in the C#'s own order and with its own groupings -- `pad + t + gap +
 * vhalf + t + 2 * gap` is not simplified to `pad + 2 * t + vhalf + 3 * gap`, because in floating point
 * those are different numbers and the fixture holds the first one's result.
 */
export function buildSevenSegmentDigit(
  style: SegmentStyle,
  segmentHeight: number,
): SevenSegmentGeometry {
  const h = segmentHeight
  const r = RATIOS[style]
  const t = h * r.thickness
  const gap = h * r.gap
  const pad = h * r.padding
  const ch = t * r.chamferOfThickness
  const digitW = h * r.digitWidth

  const bw = digitW - 2 * pad
  const vhalf = (h - 3 * t - 4 * gap) / 2
  const canvasH = h + 2 * pad

  const segments: readonly (readonly Point[])[] = [
    // 0 = a (top horizontal)
    horizontalSegment(pad, pad, bw, t, ch),
    // 1 = b (top-right vertical)
    verticalSegment(pad + bw - t + gap, pad + t + gap, vhalf, t, ch),
    // 2 = c (bottom-right vertical)
    verticalSegment(pad + bw - t + gap, pad + t + gap + vhalf + t + 2 * gap, vhalf, t, ch),
    // 3 = d (bottom horizontal)
    horizontalSegment(pad, pad + 2 * t + 2 * vhalf + 4 * gap, bw, t, ch),
    // 4 = e (bottom-left vertical)
    verticalSegment(pad + gap, pad + t + gap + vhalf + t + 2 * gap, vhalf, t, ch),
    // 5 = f (top-left vertical)
    verticalSegment(pad + gap, pad + t + gap, vhalf, t, ch),
    // 6 = g (middle horizontal)
    horizontalSegment(pad, pad + t + vhalf + 2 * gap, bw, t, ch),
  ]

  const colonW = t * 3.0
  const dotX = (colonW - t) / 2

  return {
    digitWidth: digitW,
    colonWidth: colonW,
    canvasHeight: canvasH,
    thickness: t,
    segments,
    dots: [
      { x: dotX, y: canvasH / 3 - t / 2, width: t, height: t },
      { x: dotX, y: (2 * canvasH) / 3 - t / 2, width: t, height: t },
    ],
  }
}

/**
 * An SVG `points` attribute for one segment.
 *
 * Full precision, no `toFixed`: an SVG number is parsed as a double, so writing the shortest
 * round-trippable form is both smaller and exact, while a fixed decimal count would quantise the
 * geometry the fixture pins.
 */
export function pointsAttribute(points: readonly Point[]): string {
  return points.map((p) => `${String(p.x)},${String(p.y)}`).join(" ")
}
