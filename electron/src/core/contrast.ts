/**
 * WCAG 2.1 contrast maths and the auto-contrast hysteresis state machine, ported from
 * FuzzyClock.Core/ContrastService.cs. Pure functions, no Electron or DOM types.
 *
 * The state machine picks what colour the widget paints over a sampled background: keep the
 * configured accent while it clears 4.5:1, otherwise step its HSL lightness toward the background's
 * opposite until it does, otherwise fall back to pure black or white. The two thresholds differ on
 * purpose -- entering the override at 4.5 and leaving it only above 5.5 stops a background hovering
 * at the boundary from flickering the colour every sample.
 *
 * ## Rounding is the one thing a naive port gets wrong
 *
 * C# `Math.Round` is round-half-to-**even**; JS `Math.round` is round-half-away-from-zero. That is
 * not a theoretical difference here -- `hslToColor`'s channel value lands exactly on `x.5` all over
 * the space this code reaches, because a lightness step of 5 units is 12.75/255 and two steps are
 * exactly 25.5/255. Measured against the compiled C#, over the inputs `adjustAccent` actually
 * generates:
 *
 * - grey accents, all 256 x 2 directions x 8 steps: **215 of 4,096 calls** round differently
 * - a stride-4 sweep of the colour cube: **44,017 of 4,194,304 calls** round differently
 * - and it reaches the output, not just this helper: on a white background **4,807 of 262,144**
 *   sampled accents get a different adjusted colour (accent `0,0,128` -> `0,0,102` here vs
 *   `0,0,103` under `Math.round`)
 *
 * So `roundHalfToEven` is load-bearing, and `hslToColor(0, 0, 30)` is the smallest case that shows
 * it: 76, not 77.
 *
 * ## Shape changes from the C#
 *
 * - `ContrastState` is a string union rather than a numeric enum, so it survives a settings round
 *   trip and an IPC hop as itself rather than as `0`/`1`.
 * - `ComputeDisplayColor`'s named value tuple becomes an object with the same two field names.
 * - `RgbColor` holds plain numbers. C# had `byte`, so its type system guaranteed 0-255; nothing does
 *   here, and the contract is stated rather than enforced -- see `RgbColor`.
 * - `AdjustAccent`, `ColorToHsl` and `HslToColor` were `internal` and, apart from being reached
 *   through `ComputeDisplayColor`, untested. They are exported here, which is what lets the three of
 *   them be pinned directly -- including the round trip, which the C# suite never checked.
 *
 * Every expectation in contrast.test.ts was measured by compiling this C# and printing its output,
 * `roundHalfToEven`'s cases included. The C# suite asserts only that the override colour *differs*
 * from the accent and clears 4.5 -- it never pins which colour, so those values could not have come
 * from reading it.
 */

/** WCAG AA: enter the override when the ratio drops below this. */
const ENTER_THRESHOLD = 4.5
/** Hysteresis: leave the override only once the ratio rises above this. */
const EXIT_THRESHOLD = 5.5

const BLACK: RgbColor = { r: 0, g: 0, b: 0 }
const WHITE: RgbColor = { r: 255, g: 255, b: 255 }

/**
 * An opaque colour. Each channel is expected to be an integer in 0-255; alpha is not modelled
 * because the C# ignored it. Out-of-range channels are not rejected -- `relativeLuminance` would
 * simply extrapolate, exactly as the C# would have on a value its `byte` type made unreachable.
 */
export interface RgbColor {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** Hue in [0, 360), saturation and lightness in [0, 100]. */
export interface Hsl {
  readonly h: number
  readonly s: number
  readonly l: number
}

/**
 * `"normal"` -- the accent clears the threshold and is being painted as configured.
 * `"override"` -- the accent was replaced by an adjusted or fallback colour.
 */
export type ContrastState = "normal" | "override"

export interface DisplayColor {
  readonly displayColor: RgbColor
  readonly newState: ContrastState
}

/** WCAG 2.1 relative luminance, in [0, 1]. */
export function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b)
  )
}

/** WCAG 2.1 contrast ratio, from 1.0 (identical colours) to 21.0 (black against white). */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Decides what colour to paint, given the sampled background, the configured accent, and the state
 * the previous call returned. The state has to be fed back in -- that is what makes the hysteresis
 * band work, and passing a stale state changes the answer inside the band.
 */
export function computeDisplayColor(
  background: RgbColor,
  accent: RgbColor,
  currentState: ContrastState,
): DisplayColor {
  const ratio = contrastRatio(background, accent)

  // Hysteresis exit: the accent now clears the upper threshold, so restore it.
  //
  // `currentState === "override"` is redundant and kept only because it names the intent. Found by
  // mutation: dropping it leaves the suite green, and that is not a coverage gap. A ratio above 5.5
  // is also above 4.5, so an incoming "normal" that skips this guard is caught by the next one and
  // returns the identical pair. The state test therefore cannot change an answer -- it only marks
  // which of the two rules a reader is looking at. Dropping it from the guard BELOW is a different
  // matter and is caught.
  if (ratio > EXIT_THRESHOLD && currentState === "override") {
    return { displayColor: accent, newState: "normal" }
  }

  // Already passing, and not currently overriding -- nothing to do.
  if (ratio >= ENTER_THRESHOLD && currentState === "normal") {
    return { displayColor: accent, newState: "normal" }
  }

  // Override needed: either below the enter threshold, or inside the band while still overriding.
  const adjusted = adjustAccent(background, accent)
  if (contrastRatio(background, adjusted) >= ENTER_THRESHOLD) {
    return { displayColor: adjusted, newState: "override" }
  }

  // Nothing in HSL space worked. Take whichever pure extreme contrasts better.
  const fallback = contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? WHITE : BLACK
  return { displayColor: fallback, newState: "override" }
}

/**
 * Steps the accent's HSL lightness toward the background's opposite -- darker on a light background,
 * lighter on a dark one -- in units of 5, up to 40, and returns the first candidate to clear 4.5:1.
 *
 * Returns the accent **unchanged** when all eight steps fail, which is the signal
 * `computeDisplayColor` reads to fall through to black or white. That is not rare: measured over a
 * stride-4 sweep of the cube, 10,817 of 262,144 accents exhaust the loop against a white background
 * and 2,075 against black.
 */
export function adjustAccent(background: RgbColor, accent: RgbColor): RgbColor {
  const direction = relativeLuminance(background) > 0.5 ? -1 : 1
  const { h, s, l } = colorToHsl(accent)

  for (let step = 5; step <= 40; step += 5) {
    const candidate = hslToColor(h, s, clamp(l + direction * step, 0, 100))
    if (contrastRatio(background, candidate) >= ENTER_THRESHOLD) return candidate
  }

  return accent
}

/** RGB to HSL. Achromatic colours come back as hue 0, saturation 0. */
export function colorToHsl(color: RgbColor): Hsl {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255

  const max = Math.max(r, Math.max(g, b))
  const min = Math.min(r, Math.min(g, b))
  const delta = max - min

  const l = ((max + min) / 2) * 100

  let s: number
  if (delta === 0) {
    s = 0
  } else {
    const denom = 1 - Math.abs(max + min - 1)
    // The C# comments this guard as avoiding a division by zero "when l is exactly 0 or 100". It
    // cannot fire: denom is 0 only when max + min is 0 or 2, which means the colour is pure black or
    // pure white, and both of those have delta === 0 and never reach this branch. Kept for parity,
    // and contrast.test.ts asserts the implication rather than asking anyone to take it on trust.
    s = denom === 0 ? 0 : (delta / denom) * 100
  }

  let h: number
  if (delta === 0) {
    h = 0
  } else if (max === r) {
    // The `% 6` is the canonical formula's, and provably a no-op on this branch: max === r means
    // both g and b lie in [min, r], so |g - b| <= delta and the quotient is already within
    // [-1, 1]. Kept so the code reads as the standard conversion -- a mutation deleting it cannot
    // be caught, and contrast.test.ts says so rather than pretending otherwise.
    h = 60 * (((g - b) / delta) % 6)
  } else if (max === g) {
    h = 60 * ((b - r) / delta + 2)
  } else {
    h = 60 * ((r - g) / delta + 4)
  }

  h = (h + 360) % 360

  return { h, s, l }
}

/**
 * HSL back to RGB. Exact inverse of `colorToHsl`: verified against the compiled C# over all
 * 16,777,216 colours with zero disagreements, so the round trip is a genuine identity here and not
 * an approximation that happens to hold on the sampled cases.
 *
 * `h` is read as an angle in [0, 360); values at or above 300 -- 360 included -- take the last arm.
 */
export function hslToColor(h: number, s: number, l: number): RgbColor {
  const sn = s / 100
  const ln = l / 100

  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2

  let r: number
  let g: number
  let b: number
  if (h < 60) {
    ;[r, g, b] = [c, x, 0]
  } else if (h < 120) {
    ;[r, g, b] = [x, c, 0]
  } else if (h < 180) {
    ;[r, g, b] = [0, c, x]
  } else if (h < 240) {
    ;[r, g, b] = [0, x, c]
  } else if (h < 300) {
    ;[r, g, b] = [x, 0, c]
  } else {
    ;[r, g, b] = [c, 0, x]
  }

  return {
    r: roundHalfToEven((r + m) * 255),
    g: roundHalfToEven((g + m) * 255),
    b: roundHalfToEven((b + m) * 255),
  }
}

/**
 * Rounds to the nearest integer, breaking an exact tie toward the **even** one -- what C#
 * `Math.Round` does by default and `Math.round` does not. See this module's header for how often the
 * two disagree on real inputs; it is not an edge case here.
 */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value)
  const fraction = value - floor
  if (fraction > 0.5) return floor + 1
  if (fraction < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function linearize(channel: number): number {
  const srgb = channel / 255
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4)
}
