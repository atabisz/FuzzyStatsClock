/**
 * Draw the product icon at any size — the ≥512px source `electron-builder` needs for macOS and Linux.
 *
 * ## Why this exists rather than an upscale
 *
 * The shipped icon had exactly one raster form: `FuzzyClock.App/app.ico`, whose largest entry is 256×256,
 * copied to `build/icon.ico` by `scripts/extract-icon.ts`. Windows is happy with that — the ICO format
 * cannot even express a dimension above 256, since its size fields are single bytes with 0 meaning 256.
 * macOS `icns` and the Linux icon set are not: electron-builder refuses a PNG source below 512×512, so
 * `mac` and `linux` were configured-but-iconless, and `electron-builder.yml` said so in a comment.
 *
 * Resampling 256→1024 was never the answer. The artwork is four primitives — a filled disc, a stroked
 * ring, a round hub, two round-capped hands — so it can be redrawn at any resolution with no loss at all.
 * That is what this file does, and `probe:icon` is what keeps the redraw honest.
 *
 * ## The parameters are recovered from the shipped icon, not invented
 *
 * Two passes. First `assets/icon.png` (the 256px RGBA copy of the same artwork) was decoded and measured
 * directly: alpha-coverage area gives the outer radius to three decimals, per-ring mean lightness gives the
 * ring's inner edge by its 50% crossing, and each hand's angular span against radius gives its axis angle,
 * its half-width (`r·sin(halfSpan)`) and its tip. Then all eleven parameters were refined by coordinate
 * descent against the pixels, minimising the same error `probe:icon` reports — which cut the global MAE from
 * 0.95 to 0.33 and the worst 16×16 tile from 20.8 to 1.9, the second of those being the number that says a
 * shape is right rather than merely close.
 *
 * **And the refinement landed on a round-number grid.** Every one of the nine shape parameters came back
 * within 0.2px of a clean hundredth of the canvas edge, and the two hand angles came back at 59.96° and
 * 300.005°. That is not a coincidence worth reporting and then ignoring: the artwork was authored on a
 * hundredths grid at exactly 60° and 300°, and the descent recovered it. So the values below are the round
 * ones, not the descent's. They score a *better* worst tile (1.85 vs 1.88) with nine fewer degrees of
 * freedom — the descent's extra decimals were fitting the source's rasterizer, not its geometry.
 *
 * Three deliberate departures, each because it is a property of the source *raster* rather than of the
 * artwork:
 *
 *   1. **Centred exactly.** The original's alpha centroid sits at (128.62, 128.68) on a 256px canvas —
 *      0.62px right and down of centre, and the descent, free to move it, stayed exactly there. A3 quotes
 *      the residual with and without that offset, so what correcting it costs is a number, not a footnote.
 *   2. **Hands run from the centre.** Each hand's inner end is buried under the hub (radius 0.09·S, wider
 *      than either hand's half-width), so where it truly starts is unmeasurable from the raster. Starting
 *      both at the centre is the simplest shape that cannot differ in any visible pixel.
 *   3. **The round grid over the numerical minimum**, as above.
 *
 * One thing to be plain about: these parameters were chosen by minimising the very error A3 measures, so
 * A3's residual is a best case by construction and is not on its own evidence of anything. What makes it
 * evidence is A4 — six single-parameter perturbations, each the size of a mistake a careless fit could
 * make, each shown to push the error clear of A3's limits.
 *
 *     bun run icon        # writes build/icon.png at 1024x1024
 *     bun run probe:icon  # proves it is the same artwork, and that the proof can fail
 */

import { encode, type Raster } from "./lib/png.js"

/**
 * The artwork, as fractions of the canvas edge `S`, so one set of numbers renders every size.
 *
 * Angles are **clock degrees**: 0 is twelve o'clock, increasing clockwise. That is the natural frame for
 * a clock face and it is the frame the measurements were taken in; converting to the maths convention
 * happens once, in `handAxis()`.
 */
export const ICON = {
  /** Outer edge of the ring, and the radius of the dark disc beneath it. Descent: 0.47990 (122.855px/256). */
  outerRadius: 0.48,
  /**
   * Inner edge of the ring. Descent: 0.39971 (102.326px/256). With `outerRadius` this is a circle of
   * radius 0.44·S stroked at 0.08·S — which is almost certainly how it was drawn.
   */
  ringInnerRadius: 0.4,
  /** The hub cap over both hands' inner ends. Descent: 0.08966 (22.953px/256). */
  hubRadius: 0.09,
  /**
   * Shift of the whole artwork off the canvas centre, as a fraction of the edge. Zero here on purpose —
   * the shipped raster's own centroid sits 0.62/256 right and down, and `probe:icon` arm A3 renders it
   * both ways so the residual that correction costs is a number rather than a footnote.
   */
  centreOffsetX: 0,
  centreOffsetY: 0,
  /** Dial fill. `30,30,30` is the exact value the shipped raster uses across 28,126 of its pixels. */
  dark: [30, 30, 30] as const,
  /** Ring, hub and hands. */
  light: [255, 255, 255] as const,
  hands: [
    {
      /**
       * The long, thin one, at ten past. Descent: 59.96°, length 0.33940, half-width 0.03497 — so a hand
       * 0.07·S wide whose axis ends at 0.34·S, and the round cap puts its tip at 0.375·S (96px/256).
       */
      name: "minute",
      clockDegrees: 60,
      length: 0.34,
      halfWidth: 0.035,
    },
    {
      /**
       * The short, thick one at ten o'clock — wider than the minute hand, which was measured rather than
       * assumed. Descent: 300.005°, length 0.21981, half-width 0.05503.
       */
      name: "hour",
      clockDegrees: 300,
      length: 0.22,
      halfWidth: 0.055,
    },
  ],
} as const

/** A mutable copy of `ICON`, for the probe's mutation arm. */
export type IconSpec = {
  outerRadius: number
  ringInnerRadius: number
  hubRadius: number
  centreOffsetX: number
  centreOffsetY: number
  dark: readonly [number, number, number]
  light: readonly [number, number, number]
  hands: { name: string; clockDegrees: number; length: number; halfWidth: number }[]
}

export function cloneSpec(spec: IconSpec = ICON as unknown as IconSpec): IconSpec {
  return { ...spec, hands: spec.hands.map((h) => ({ ...h })) }
}

/** Clock degrees → the hand's outer axis endpoint, in pixels relative to the centre, y growing downward. */
function handAxis(clockDegrees: number, length: number, size: number): { x: number; y: number } {
  const radians = (clockDegrees * Math.PI) / 180
  return { x: Math.sin(radians) * length * size, y: -Math.cos(radians) * length * size }
}

/** Signed distance to a segment from the origin to `(bx, by)`, minus `half` — negative inside the capsule. */
function capsuleDistance(px: number, py: number, bx: number, by: number, half: number): number {
  const lengthSquared = bx * bx + by * by
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / lengthSquared))
  return Math.hypot(px - bx * t, py - by * t) - half
}

/**
 * Rasterize at `size`×`size`.
 *
 * Coverage is computed by supersampling, but only where it can matter: a pixel whose distance to every
 * boundary exceeds one pixel is uniform by construction, so it is settled with a single evaluation. That
 * early-out is what keeps a 1024px render at 8×8 sampling (67M potential samples) down to well under a
 * second, and it cannot change the result — the guard is the distance bound itself.
 *
 * Colour is accumulated over *covered* samples only and divided by the coverage count, which yields
 * straight (non-premultiplied) RGBA: an edge pixel comes out with the dial's colour at partial alpha
 * rather than a dark fringe blended toward transparent black.
 */
export function render(size: number, spec: IconSpec = ICON as unknown as IconSpec): Raster {
  const centreX = size / 2 + spec.centreOffsetX * size
  const centreY = size / 2 + spec.centreOffsetY * size
  const outer = spec.outerRadius * size
  const ringInner = spec.ringInnerRadius * size
  const hub = spec.hubRadius * size
  const hands = spec.hands.map((h) => ({ ...handAxis(h.clockDegrees, h.length, size), half: h.halfWidth * size }))
  const [dr, dg, db] = spec.dark
  const [lr, lg, lb] = spec.light

  const data = new Uint8Array(size * size * 4)
  const SAMPLES = 8
  const step = 1 / SAMPLES
  const offset = step / 2

  /** Distance to the disc edge (negative inside) and to the nearest light shape (negative inside). */
  const distances = (x: number, y: number): { disc: number; light: number } => {
    const radius = Math.hypot(x, y)
    let light = Math.max(ringInner - radius, radius - outer) // the annulus
    if (radius - hub < light) light = radius - hub
    for (const hand of hands) {
      const d = capsuleDistance(x, y, hand.x, hand.y, hand.half)
      if (d < light) light = d
    }
    return { disc: radius - outer, light }
  }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const cxRel = px + 0.5 - centreX
      const cyRel = py + 0.5 - centreY
      const at = (py * size + px) * 4
      const centreDistances = distances(cxRel, cyRel)

      // Uniform pixel: both boundaries are more than a pixel away, so no sample inside it can differ.
      if (Math.abs(centreDistances.disc) > 1 && Math.abs(centreDistances.light) > 1) {
        if (centreDistances.disc > 0) continue // fully outside → left transparent
        const inLight = centreDistances.light < 0
        data[at] = inLight ? lr : dr
        data[at + 1] = inLight ? lg : dg
        data[at + 2] = inLight ? lb : db
        data[at + 3] = 255
        continue
      }

      let covered = 0
      let rSum = 0
      let gSum = 0
      let bSum = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const d = distances(cxRel - 0.5 + offset + sx * step, cyRel - 0.5 + offset + sy * step)
          if (d.disc > 0) continue
          covered++
          if (d.light < 0) {
            rSum += lr
            gSum += lg
            bSum += lb
          } else {
            rSum += dr
            gSum += dg
            bSum += db
          }
        }
      }
      if (covered === 0) continue
      data[at] = Math.round(rSum / covered)
      data[at + 1] = Math.round(gSum / covered)
      data[at + 2] = Math.round(bSum / covered)
      data[at + 3] = Math.round((255 * covered) / (SAMPLES * SAMPLES))
    }
  }
  return { width: size, height: size, data }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const args = process.argv.slice(2)
  const sizeArg = args.indexOf("--size")
  const outArg = args.indexOf("--out")
  const size = sizeArg >= 0 ? Number(args[sizeArg + 1]) : 1024
  const out = outArg >= 0 ? args[outArg + 1]! : new URL("../build/icon.png", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "")
  if (!Number.isInteger(size) || size < 16) throw new Error(`--size must be an integer >= 16, got ${String(size)}`)

  const started = performance.now()
  const image = render(size)
  const bytes = encode(image)
  await Bun.write(out, bytes)
  console.log(
    `wrote ${out}\n  ${String(size)}x${String(size)} RGBA, ${String(bytes.length)} bytes, ` +
      `rendered in ${Math.round(performance.now() - started).toString()}ms`,
  )
}
