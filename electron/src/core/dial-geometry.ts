/**
 * The analogue dial's geometry, ported from `MainWindow.InitDialDecorations` (`:1955-2024`) and
 * `UpdateDialDisplay` (`:2193-2220`). The angles themselves are `dial.ts`, translated in Phase 2.
 *
 * ## This half of the dial is a transcription, and the fixture knows it
 *
 * Both C# methods are `private` on a 2,221-line `MainWindow` with a tray icon and a settings service
 * behind it, so unlike the two digit controls they could not be compiled into the probe. The probe
 * therefore reproduces their two formulas rather than calling them. That makes the `dial-*` rows in
 * `wpf-geometry.tsv` a comparison of **.NET's `Math.Sin`/`Cos` and cast semantics against V8's** -- the
 * part that could genuinely differ between the two runtimes -- and *not* evidence that the transcription
 * matches `MainWindow`. `GeomProbe.cs`'s header says the same thing, and no test built on those rows
 * claims more. The transcription itself was checked by reading both methods, which is a weaker
 * instrument than the digit controls got, and saying so is the point.
 *
 * ## The hands rotate, they do not get redrawn
 *
 * The C# writes `X2`/`Y2` on two `Line`s every second. Doing that in SVG would mutate geometry
 * attributes per frame and re-rasterise the element, which ISC-22 forbids. So the port draws each hand
 * **once**, pointing straight up from the centre, and animates a CSS `transform: rotate()` about the
 * centre.
 *
 * That substitution is exact rather than approximate, and `rotateUpwardPoint` is here to prove it. A
 * hand from `(40, 40)` to `(40, 40 - L)` rotated by θ about `(40, 40)` has its far end at
 *
 * ```
 * x = 40 + (0)·cosθ - (-L)·sinθ = 40 + L·sinθ
 * y = 40 + (0)·sinθ + (-L)·cosθ = 40 - L·cosθ
 * ```
 *
 * which is `UpdateDialDisplay`'s formula character for character. The test asserts the two agree at
 * every recorded time, so the claim "the transform is not an approximation" is measured rather than
 * argued.
 */

import { hourAngleDegrees, minuteAngleDegrees } from "./dial.js"

/** `DialCanvas` is `Width="80" Height="80"` in MainWindow.xaml, and the centre is its middle. */
export const DIAL_SIZE = 80
export const DIAL_CENTER_X = 40.0
export const DIAL_CENTER_Y = 40.0

/** `HourLength` and `MinuteLength` from `UpdateDialDisplay`. */
export const HOUR_HAND_LENGTH = 25.0
export const MINUTE_HAND_LENGTH = 35.0

/** Hour ticks: 12 lines from R=31 to R=36, stroke 1.5. */
export const TICK_INNER_RADIUS = 31.0
export const TICK_OUTER_RADIUS = 36.0
export const TICK_STROKE_WIDTH = 1.5

/** Minute dots: 60 ellipses 2x2 at R=35, placed by their top-left, hence the 1.0 offsets. */
export const DOT_RADIUS = 35.0
export const DOT_SIZE = 2.0

/** Hour numbers: `TextBlock`s at R=25, Segoe UI Light 7, placed by top-left with -4.0/-4.5. */
export const NUMBER_RADIUS = 25.0
export const NUMBER_FONT_SIZE = 7
export const NUMBER_OFFSET_X = 4.0
export const NUMBER_OFFSET_Y = 4.5

export interface TickLine {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

export interface PlacedCircle {
  readonly cx: number
  readonly cy: number
  /** `Canvas.SetLeft` value: `cx - 1.0`. Kept because the fixture records it. */
  readonly left: number
  readonly top: number
}

export interface PlacedNumber {
  readonly text: string
  readonly cx: number
  readonly cy: number
  readonly left: number
  readonly top: number
}

/**
 * The angle in radians for an index out of a whole turn, exactly as all three loops compute it:
 * `(i / divisions) * 2 * Math.PI`.
 *
 * Written once rather than three times because the three loops use the same expression, and the shared
 * helper is what makes a change to one of them visible as a change to all of them.
 */
function turnRadians(index: number, divisions: number): number {
  return (index / divisions) * 2 * Math.PI
}

/** The 12 hour ticks, index 0 at 12 o'clock. */
export function hourTicks(): readonly TickLine[] {
  const ticks: TickLine[] = []
  for (let h = 0; h < 12; h++) {
    const a = turnRadians(h, 12)
    ticks.push({
      x1: DIAL_CENTER_X + TICK_INNER_RADIUS * Math.sin(a),
      y1: DIAL_CENTER_Y - TICK_INNER_RADIUS * Math.cos(a),
      x2: DIAL_CENTER_X + TICK_OUTER_RADIUS * Math.sin(a),
      y2: DIAL_CENTER_Y - TICK_OUTER_RADIUS * Math.cos(a),
    })
  }
  return ticks
}

/** The 60 minute dots. `left`/`top` are the WPF placement; `cx`/`cy` is what an SVG circle wants. */
export function minuteDots(): readonly PlacedCircle[] {
  const dots: PlacedCircle[] = []
  for (let m = 0; m < 60; m++) {
    const a = turnRadians(m, 60)
    const cx = DIAL_CENTER_X + DOT_RADIUS * Math.sin(a)
    const cy = DIAL_CENTER_Y - DOT_RADIUS * Math.cos(a)
    dots.push({ cx, cy, left: cx - 1.0, top: cy - 1.0 })
  }
  return dots
}

/**
 * The 12 hour numbers, 1 through 12 -- note the loop runs `1..12`, so index 0 is "1" at one o'clock
 * and "12" is last, at the top. The `-4.0`/`-4.5` offsets are WPF centring a 7pt glyph by hand.
 */
export function hourNumbers(): readonly PlacedNumber[] {
  const numbers: PlacedNumber[] = []
  for (let h = 1; h <= 12; h++) {
    const a = turnRadians(h, 12)
    const cx = DIAL_CENTER_X + NUMBER_RADIUS * Math.sin(a)
    const cy = DIAL_CENTER_Y - NUMBER_RADIUS * Math.cos(a)
    numbers.push({
      text: String(h),
      cx,
      cy,
      left: cx - NUMBER_OFFSET_X,
      top: cy - NUMBER_OFFSET_Y,
    })
  }
  return numbers
}

/** A hand's far end, `UpdateDialDisplay`'s formula verbatim. */
export function handEndpoint(degrees: number, length: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180.0
  return {
    x: DIAL_CENTER_X + length * Math.sin(rad),
    y: DIAL_CENTER_Y - length * Math.cos(rad),
  }
}

/** Both hands' far ends for a time, for the equivalence test and for nothing else. */
export function handEndpoints(
  hour: number,
  minute: number,
): { readonly hour: { x: number; y: number }; readonly minute: { x: number; y: number } } {
  return {
    hour: handEndpoint(hourAngleDegrees(hour, minute), HOUR_HAND_LENGTH),
    minute: handEndpoint(minuteAngleDegrees(minute), MINUTE_HAND_LENGTH),
  }
}

/**
 * Where `rotate(degrees)` about the dial centre sends the point `(40, 40 - length)`.
 *
 * This is the CSS transform written out as arithmetic. It exists so a test can assert it equals
 * `handEndpoint` -- which is what licenses the port to animate `transform` instead of writing `x2`/`y2`,
 * and is therefore ISC-22's discriminator rather than a comment claiming the two are the same.
 */
export function rotateUpwardPoint(degrees: number, length: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180.0
  const dx = 0
  const dy = -length
  return {
    x: DIAL_CENTER_X + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: DIAL_CENTER_Y + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

/** The `transform` a hand carries. `transform-origin` is the centre, set in CSS. */
export function handTransform(degrees: number): string {
  return `rotate(${String(degrees)}deg)`
}
