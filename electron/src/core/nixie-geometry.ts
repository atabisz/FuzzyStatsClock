/**
 * The Nixie tube's geometry, ported from `NixieDigit.RebuildGeometry`
 * (`NixieDigit.xaml.cs:121-235`), `OnFlickerTick` (`:241-256`) and `UpdateDisplay` (`:262-284`).
 *
 * ## The ten cathode paths are copied, not redrawn
 *
 * `DIGIT_PATHS` is byte-identical to the C#'s `DigitPaths`, which is possible because WPF's
 * `Geometry.Parse` mini-language and SVG's `d` attribute are the same grammar for the subset used here
 * (`M`, `L`, `C`, `A`, `Z`) with the same argument order -- including `A`'s
 * `rx ry rotation large-arc sweep x y`. So the digits are the *same* curves rather than a redrawing of
 * them, and there is nothing here to get subtly wrong. Any future glyph edit must be made in both
 * places, which is why the paths sit in one exported constant rather than being inlined.
 *
 * ## Why the geometry is transformed rather than pre-scaled
 *
 * The paths live in a fixed 30x50 space and the C# scales them per instance with a `TransformGroup` of
 * `ScaleTransform` then `TranslateTransform`. WPF applies a `TransformGroup` in **list order**; SVG
 * applies a `transform` list **right to left**. So the same composition is
 * `translate(cx, cy + i*depth) scale(s)` -- see `nixieTransform`, whose argument order is the whole
 * point of the function existing rather than being written out at the call site.
 *
 * This is checked against measured **bounds**, not against the transform string: `wpf-geometry.tsv`'s
 * `nix-bounds` rows are `Geometry.Bounds` for all ten digits at all three sizes, which pins `scale`,
 * `centerX`, `centerY` **and** the per-digit depth offset simultaneously. A transform that is subtly
 * wrong -- scale-after-translate, say -- moves those bounds and fails.
 *
 * ## The depth stack, and the four glow layers
 *
 * Each of the ten cathodes is offset a little further down than the last (`i * depthOffset`), which is
 * what makes the unlit digits read as sitting behind one another in a real tube. The C# comment records
 * that the spec's `1.5 * scale` was reduced to `0.4 * scale` because digit 9 overflowed the tube at
 * small sizes -- so this constant is a fix, and restoring the "correct" value would reintroduce the bug.
 *
 * The lit digit is drawn **four times** in decreasing stroke width, outermost first, which is how the
 * bloom is built without a blur filter. In SVG that becomes one `<path>` in `<defs>` and four
 * `<use href>` elements: `stroke` and `stroke-width` are inherited presentation attributes so they
 * cascade into the referenced geometry, while `opacity` applies to the `<use>` as a group. Two
 * consequences, both wanted: a digit change is **one** `d` write instead of four, and the 40 ms flicker
 * touches nothing but `opacity` -- which is exactly what `OnFlickerTick` does, and what ISC-22 requires.
 */

/** The ten cathode paths in a 30x50 space. Byte-identical to `NixieDigit.DigitPaths`. */
export const DIGIT_PATHS: readonly string[] = [
  // 0: oval -- four quarter arcs CW
  "M 15,3 A 11,22 0 0 1 26,25 A 11,22 0 0 1 15,47 A 11,22 0 0 1 4,25 A 11,22 0 0 1 15,3 Z",
  // 1: diagonal top hook + vertical stem
  "M 10,9 L 14,5 L 14,49",
  // 2: reverse-S curve
  "M 6,13 C 6,5 26,5 26,15 C 26,24 6,32 6,49 L 26,49",
  // 3: two open loops
  "M 6,10 C 6,5 26,5 26,16 C 26,23 17,27 26,30 C 26,42 6,50 6,46",
  // 4: diagonal down + horizontal bar + vertical
  "M 23,5 L 6,31 L 27,31 M 23,5 L 23,49",
  // 5: top horizontal + left vertical + curve
  "M 26,5 L 6,5 L 6,27 C 16,23 26,24 26,38 C 26,49 6,50 6,46",
  // 6: hooked descender with inner loop
  "M 24,7 C 9,2 4,15 4,29 C 4,41 9,49 17,49 C 25,49 27,41 27,33 C 27,25 21,23 15,25 C 9,27 4,34 4,45",
  // 7: top bar + diagonal
  "M 5,5 L 26,5 L 12,49",
  // 8: two stacked loops
  "M 16,27 C 6,27 6,5 16,5 C 26,5 26,27 16,27 C 6,27 6,49 16,49 C 26,49 26,27 16,27",
  // 9: upper loop + descending tail (tail originates from loop's lower-right)
  "M 5,20 C 5,9 9,4 16,4 C 23,4 27,11 27,19 C 27,27 22,31 16,30 C 10,29 5,23 5,20 C 5,17 10,15 18,17 C 24,19 27,28 25,38 C 23,46 17,50 11,49",
]

/** The cathode design space the paths are drawn in. */
export const DIGIT_PATH_WIDTH = 30
export const DIGIT_PATH_HEIGHT = 50

/** `GlowWidthMultipliers` -- outermost halo to core, index 0 to 3. */
export const GLOW_WIDTH_MULTIPLIERS: readonly number[] = [3.6, 2.4, 1.6, 1.0]

/** `GlowBaseOpacities`, the values the flicker multiplies. */
export const GLOW_BASE_OPACITIES: readonly number[] = [0.04, 0.1, 0.3, 1.0]

/** `GlowLayerColors`: halo, mid glow, inner bloom, core. */
export const GLOW_LAYER_COLORS: readonly string[] = [
  "#FF7800",
  "#FF8C00",
  "#FFA000",
  "#FFB814",
]

/** The tube's fixed colours, as they appear in the C#'s `FromArgb` calls. */
export const TUBE_FILL = "rgb(26 8 0 / 0.8)" //  #CC1A0800 -- 0xCC/255 = 0.8
export const TUBE_STROKE = "rgb(255 140 0 / 0.5019607843137255)" // #80FF8C00
export const TUBE_STROKE_WIDTH = 1.5
export const HIGHLIGHT_FILL = "rgb(255 255 255 / 0.0784313725490196)" // #14FFFFFF
export const WIRE_STROKE = "rgb(255 140 0 / 0.09411764705882353)" // #18FF8C00
export const WIRE_STROKE_WIDTH = 0.5
export const GHOST_STROKE = "rgb(255 120 0 / 0.12941176470588237)" // #21FF7800

/** A horizontal scan line across the tube. */
export interface WireLine {
  readonly x1: number
  readonly x2: number
  readonly y: number
}

export interface NixieGeometry {
  /** Control and canvas width, `digitH * 0.62 + (int)(haloHalf * 2)`. */
  readonly width: number
  /** Control and canvas height, `digitH + (int)(haloHalf * 2) + 4`. */
  readonly height: number
  /** Corner radius of the tube rect: a literal 8 in both axes at every size. */
  readonly tubeRadius: number
  /** Height of the glass-curvature highlight, `height * 0.18`; its radius is a literal 6. */
  readonly highlightHeight: number
  readonly highlightRadius: number
  /** The wire mesh, seven to twelve lines depending on the size. */
  readonly wires: readonly WireLine[]
  /** Scale from the 30x50 path space. */
  readonly scale: number
  readonly centerX: number
  readonly centerY: number
  /** Vertical offset per depth-stacked cathode. */
  readonly depthOffset: number
  /** The ghost cathodes' stroke width, and the base the glow multipliers scale. */
  readonly baseStroke: number
  /** The four glow layers' stroke widths, outermost first. */
  readonly glowStrokeWidths: readonly number[]
}

/**
 * `RebuildGeometry`'s size arithmetic, transcribed with its casts intact.
 *
 * Two of them matter. `haloHalf` is a `Math.Ceiling`, so it is a whole number, but `(int)(haloHalf * 2)`
 * is *still* a cast -- and it is applied to the doubled value rather than to `haloHalf`, so the two
 * cannot be folded. And `digitH * 0.62` is not exact in binary, which is why the measured width at
 * `digitHeight = 40` is `32.799999999999997` and not `32.8`. Both are pinned by `nix-metrics`.
 */
export function buildNixieDigit(digitHeight: number): NixieGeometry {
  const digitH = digitHeight
  const haloHalf = Math.ceil((Math.max(2.0, digitH * 0.05) * 3.6) / 2.0)
  const width = digitH * 0.62 + Math.trunc(haloHalf * 2)
  const height = digitH + Math.trunc(haloHalf * 2) + 4
  const tubePad = 4.0
  const scale = digitH / 50.0
  const baseStroke = Math.max(2.0, digitH * 0.05)
  // Spec says 1.5*scale; reduced to 0.4*scale in the C# to stop digit 9 overflowing the tube at small
  // DigitHeight values. A fix, not an approximation -- see the module header.
  const depthOffset = 0.4 * scale
  const centerX = (width - DIGIT_PATH_WIDTH * scale) / 2.0
  const centerY = (height - DIGIT_PATH_HEIGHT * scale) / 2.0

  const wires: WireLine[] = []
  // `for (double y = tubePad; y <= canvasH - tubePad; y += 7.0)`. The accumulation is reproduced rather
  // than replaced by a count-and-multiply, because `<=` on an accumulated double is exactly the kind of
  // boundary where the two disagree -- the last wire either exists or it does not.
  for (let y = tubePad; y <= height - tubePad; y += 7.0) {
    wires.push({ x1: tubePad + 2, x2: width - tubePad - 2, y })
  }

  return {
    width,
    height,
    tubeRadius: 8,
    highlightHeight: height * 0.18,
    highlightRadius: 6,
    wires,
    scale,
    centerX,
    centerY,
    depthOffset,
    baseStroke,
    glowStrokeWidths: GLOW_WIDTH_MULTIPLIERS.map((m) => baseStroke * m),
  }
}

/**
 * The SVG `transform` for cathode `index`, equivalent to the C#'s `TransformGroup`.
 *
 * Scale-then-translate in WPF is `translate(...) scale(...)` in SVG, because SVG's transform list is
 * applied right to left. Writing it the other way round is a silent, plausible-looking bug: the digit
 * still appears, just displaced by `centerX * (1 - scale)`.
 */
export function nixieTransform(geometry: NixieGeometry, index: number): string {
  const ty = geometry.centerY + index * geometry.depthOffset
  return `translate(${String(geometry.centerX)} ${String(ty)}) scale(${String(geometry.scale)})`
}

/**
 * `OnFlickerTick`'s target draw: `Clamp(1.0 + (rng * 2 - 1) * 0.18, 0.82, 1.18)`.
 *
 * `draw` is the caller's `NextDouble()` equivalent, passed in rather than generated, so the smoothing
 * is testable against the recorded `nix-flicker` sequence. The clamp bounds are exactly the extremes the
 * expression can reach, so it never actually clips -- it is there to bound the *expression*, and
 * keeping it means a future change to `0.18` stays inside the intended range.
 */
export function flickerTarget(draw: number): number {
  return Math.min(1.18, Math.max(0.82, 1.0 + (draw * 2.0 - 1.0) * 0.18))
}

/** The C#'s next-change delay in milliseconds: `30 + rng * 80`. */
export function flickerDelayMs(draw: number): number {
  return 30 + draw * 80
}

/** `_flickerCurrent += (target - current) * 0.25` -- a quarter of the way there each 40 ms tick. */
export function flickerStep(current: number, target: number): number {
  return current + (target - current) * 0.25
}

/** One layer's opacity: `Min(1.0, base * current)`. The core layer is what the clamp is for. */
export function glowOpacity(layer: number, current: number): number {
  const base = GLOW_BASE_OPACITIES[layer]
  if (base === undefined) throw new RangeError(`glow layer out of range: ${String(layer)}`)
  return Math.min(1.0, base * current)
}

/** The flicker tick interval. */
export const FLICKER_INTERVAL_MS = 40

/** `NixieClockView.OnSizeChanged`: the colon dots are 13% of the digit height. */
export function colonDotSize(digitHeight: number): number {
  return digitHeight * 0.13
}
