/**
 * ISC-33 — is `build/icon.png` the same artwork as the shipped icon, at a size macOS and Linux accept?
 *
 * `scripts/make-icon.ts` redraws the icon from parameters fitted to `assets/icon.png`. That is a claim
 * about pixels, so it gets measured against pixels. "I rendered a clock and it looks like a clock" is
 * exactly the assertion this file exists to replace: a wrong hand angle, a ring one pixel too thin or a
 * hub the wrong size all still look like a clock at a glance, and all three would ship.
 *
 * ## The arms, and what each one can catch that the others cannot
 *
 *   A1  The PNG codec round-trips. `lib/png.ts` is hand-rolled, so every number below is read through
 *       code that could itself be wrong. A1 runs a synthetic raster out through `encode()` and back in
 *       through `decode()` and demands byte equality, then does the same to the real 256px icon. Its
 *       negative control flips one IDAT byte and requires the decode to *change* — without that, "the
 *       round trip passed" would also pass for a decoder that ignored the data entirely.
 *   A2  The committed file is what the generator produces today. Byte-identical to a fresh render, so a
 *       hand-edited or stale `build/icon.png` cannot ride along behind a green A3.
 *   A3  Geometric parity. The 1024px render is box-downsampled to 256 and compared against
 *       `assets/icon.png` channel by channel, at two spatial scales — whole-image mean, and worst 16×16
 *       tile — because a mean over 65,536 pixels barely notices a wrong hand tip. Reported over stated
 *       denominators, in premultiplied space, and quoted twice: on the offset-matched basis, which is the
 *       fit, and as shipped, which is the fit plus a deliberate centring correction.
 *   A4  The mutation control, and the arm that gives A3 its teeth. Six single-parameter perturbations of a
 *       size a careless fit could plausibly produce (a 5° hand angle, a 4% radius, a 3% ring, a 20% hub, a
 *       15% hand width, an 8% hand length) must each push the error clear of A3's limits, and the limits
 *       must sit between the true residual and the weakest of them. If any slipped under, A3 would be
 *       measuring nothing, and the arm reports INCONCLUSIVE rather than passed.
 *   A5  Non-degenerate pixels. A file can round-trip, be reproducible and score a fine MAE while being
 *       mostly empty — an all-transparent raster scores well against an icon that is 27% transparent.
 *       A5 samples known points, checks the four colour populations against the source's own counts, and
 *       requires real antialiasing rather than a two-level alpha histogram.
 *   A6  Something consumes it. `electron-builder.yml` must actually point `mac.icon` and `linux.icon` at
 *       this file, and the file must clear electron-builder's own 512×512 floor. An icon nothing
 *       references is the state this whole exercise started in.
 *
 * ## What this cannot prove
 *
 * That `iconutil`/`icns` conversion accepts the file, and that macOS and Linux render it. Both need the
 * host platform, so neither is asserted here.
 *
 * **The first was bought on 2026-08-30, on a macOS 26.6.2 arm64 host.** `dist:mac` exited 0 and its bundle
 * carries a 1024×1024 `icon.icns` generated from this PNG (eleven images, dimensions verified individually
 * rather than read off the filenames), rendered back through macOS's own decoder and looked at. The 512
 * floor A6 checks was confirmed by negative control: a 256px downsample of this exact file fails `dist:mac`
 * with `Icon must be at least 512x512 pixels, provided: 256x256`.
 *
 * **The Linux side is thinner than an earlier draft of this comment claimed, and the correction is worth
 * keeping.** That draft said the converter "emitted all eight sizes" in `--format=set` mode. It does not:
 * for a single `.png` source `convertIcon` hands the file back AS-IS with one entry at its own size
 * (`app-builder-lib/out/util/iconConverter.js`, the branch commented `set: source is already a .png —
 * return as-is with its dimensions`). Measured directly, `format: "set"` on this file returns `[1024]` at
 * exit 0 — no ladder exists to inspect, and **no 512 floor applies to that format at all**: a 256px PNG
 * returns `[256]` where `format: "icns"` throws `ERR_ICON_TOO_SMALL` on the same input. So the floor A6
 * enforces is an icns constraint, and `linux.icon` was never the blocked half.
 *
 * **How the wrong claim survived is the useful part: it was read off a build that never ran the step.** A
 * `dist:linux` run fails at AppImage assembly before any icon work and its log contains **zero** lines
 * matching `icon`; `release/.icon-set` does not exist on the host that supposedly produced it. Looking for
 * the artefact is what caught it.
 *
 * What is still unbought is a Linux desktop environment *displaying* the result; no AppImage has been
 * assembled.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { decode, downsample, encode, pixel, type Raster } from "./lib/png.js"
import { cloneSpec, ICON, render, type IconSpec } from "./make-icon.js"

const HERE = import.meta.dirname
const SOURCE_256 = join(HERE, "..", "assets", "icon.png")
const BUILT_1024 = join(HERE, "..", "build", "icon.png")
const BUILDER_CONFIG = join(HERE, "..", "electron-builder.yml")

/**
 * A3's two ceilings on mean absolute error per channel, 0-255 — one global, one per 16×16 tile.
 *
 * Two scales, because they do different jobs, and because one alone was measured to be insufficient rather
 * than assumed to be. **The tile limit is the discriminating one.** It is placed at the geometric mean of the
 * two things it must separate: the fit's measured residual (1.85) and the weakest mutation A4 fires (25.8, an
 * hour hand 15% too thin) — so both sides carry the same *relative* margin, ~3.7× each way. The global limit
 * is a coarser guard against systematic drift, set at roughly 3× the measured residual of 0.40; it catches
 * four of A4's six perturbations and misses two, which is exactly why the tile metric exists.
 *
 * The mean is nearly blind to a small localised error, and that is measured: an 8% shorter minute hand moves
 * ~110 of 65,536 pixels and lifts the global figure to 0.70 — under this limit — while multiplying the worst
 * tile by nearly eighteen.
 *
 * The residual is not zero and cannot be: the source is a 256px raster from a different rasterizer, so its
 * antialiasing along the ring, the hub and two hand outlines disagrees with ours by a fraction of a level
 * everywhere the geometry is exactly right.
 *
 * A4 recomputes the separation on every run. If a future change narrows it, A4 reports INCONCLUSIVE rather
 * than letting A3 pass on a threshold that no longer discriminates.
 */
const MAE_LIMIT = 1.35
const TILE_LIMIT = 6.9

/** A4's floor on `weakest mutation ÷ measured residual`, on whichever metric detects it. */
const MIN_SEPARATION = 2.0

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "INCONCLUSIVE", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  → ${verdict}: ${detail}\n`)
}

/** Side of the square tile the local metric is averaged over. 16 gives a 16×16 grid across a 256px image. */
const TILE = 16

/**
 * Channel-wise deviation between two same-sized rasters, at two spatial scales.
 *
 * Both means are over **premultiplied** RGBA, which is what a pixel actually contributes when it is drawn:
 * a fully transparent pixel's RGB is unobservable, so counting it would penalise a difference nothing can
 * see. `straightMae` is reported alongside only because it is the number a naive comparison would give,
 * and the gap between the two is informative rather than alarming.
 */
interface Deviation {
  /** Whole-image mean absolute error per channel, premultiplied. */
  mae: number
  /** The same, unpremultiplied — the number a naive comparison reports. Informational only. */
  straightMae: number
  /**
   * The worst `TILE`×`TILE` tile's MAE.
   *
   * This exists because a whole-image mean is nearly blind to small localised differences, and that is
   * measured rather than supposed: shortening a hand by 8% moves about 110 pixels out of 65,536 and lifts
   * the global MAE by only 0.25, which is inside the antialiasing noise floor. The same change dominates
   * the one tile it lands in. Two metrics with different spatial scales catch two different classes of
   * error — a systematic drift shows in the mean, a wrong shape shows in a tile.
   */
  worstTile: number
  /** Where that tile is, for reading the failure rather than just its magnitude. */
  worstTileAt: { x: number; y: number }
  samples: number
  tileSamples: number
}

function compare(a: Raster, b: Raster): Deviation {
  if (a.width !== b.width || a.height !== b.height) throw new Error("size mismatch")
  let sum = 0
  let straightSum = 0
  /** Per-tile premultiplied absolute-error accumulator, indexed row-major over the tile grid. */
  const tilesAcross = Math.ceil(a.width / TILE)
  const tileSums = new Float64Array(tilesAcross * Math.ceil(a.height / TILE))
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4
      const aa = a.data[i + 3]!
      const ba = b.data[i + 3]!
      let pixelSum = 0
      for (let c = 0; c < 3; c++) {
        straightSum += Math.abs(a.data[i + c]! - b.data[i + c]!)
        pixelSum += Math.abs((a.data[i + c]! * aa) / 255 - (b.data[i + c]! * ba) / 255)
      }
      const alphaDelta = Math.abs(aa - ba)
      pixelSum += alphaDelta
      straightSum += alphaDelta
      sum += pixelSum
      tileSums[Math.floor(y / TILE) * tilesAcross + Math.floor(x / TILE)]! += pixelSum
    }
  }
  const tileSamples = TILE * TILE * 4
  let worst = 0
  let worstIndex = 0
  for (let t = 0; t < tileSums.length; t++) {
    if (tileSums[t]! > worst) {
      worst = tileSums[t]!
      worstIndex = t
    }
  }
  const samples = (a.data.length / 4) * 4
  return {
    mae: sum / samples,
    straightMae: straightSum / samples,
    worstTile: worst / tileSamples,
    worstTileAt: { x: (worstIndex % tilesAcross) * TILE, y: Math.floor(worstIndex / tilesAcross) * TILE },
    samples,
    tileSamples,
  }
}

/** Alpha-weighted centroid, in pixels — the measurement that exposed the source's off-centre artwork. */
function centroid(image: Raster): { x: number; y: number; area: number } {
  let x = 0
  let y = 0
  let total = 0
  for (let py = 0; py < image.height; py++) {
    for (let px = 0; px < image.width; px++) {
      const a = pixel(image, px, py)[3]
      x += (px + 0.5) * a
      y += (py + 0.5) * a
      total += a
    }
  }
  return { x: x / (total || 1), y: y / (total || 1), area: total / 255 }
}

const source = decode(new Uint8Array(readFileSync(SOURCE_256)))

// ───────────────────────────────────────────────────────────────────────────────
// A1 — the codec every other arm reads through.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A1: the PNG codec round-trips, and a corrupted stream does not ===")
{
  // A synthetic raster with every filter-relevant pattern: horizontal ramps, vertical ramps, and an
  // alpha gradient, so a broken unfilter shows up rather than cancelling out on flat colour.
  const synthetic: Raster = { width: 37, height: 23, data: new Uint8Array(37 * 23 * 4) }
  for (let y = 0; y < 23; y++) {
    for (let x = 0; x < 37; x++) {
      const at = (y * 37 + x) * 4
      synthetic.data[at] = (x * 7) & 0xff
      synthetic.data[at + 1] = (y * 11) & 0xff
      synthetic.data[at + 2] = (x * y) & 0xff
      synthetic.data[at + 3] = (x + y) % 3 === 0 ? 255 : ((x * 3 + y) & 0xff)
    }
  }
  const syntheticBack = decode(encode(synthetic))
  const syntheticOk =
    syntheticBack.width === 37 &&
    syntheticBack.height === 23 &&
    Buffer.compare(Buffer.from(syntheticBack.data), Buffer.from(synthetic.data)) === 0

  // And the real thing: decode → encode → decode must reproduce the same pixels.
  const sourceBack = decode(encode(source))
  const sourceOk = Buffer.compare(Buffer.from(sourceBack.data), Buffer.from(source.data)) === 0

  // Negative control: corrupt one byte inside the IDAT payload. The decode must not come back clean.
  const corrupted = new Uint8Array(encode(synthetic))
  const idatAt = corrupted.findIndex(
    (_, i) =>
      corrupted[i] === 0x49 && corrupted[i + 1] === 0x44 && corrupted[i + 2] === 0x41 && corrupted[i + 3] === 0x54,
  )
  let controlHeld = false
  let controlDetail = "IDAT chunk not located"
  if (idatAt > 0) {
    corrupted[idatAt + 20] = corrupted[idatAt + 20]! ^ 0xff
    try {
      const back = decode(corrupted)
      controlHeld = Buffer.compare(Buffer.from(back.data), Buffer.from(synthetic.data)) !== 0
      controlDetail = controlHeld ? "corrupted stream decoded to different pixels" : "corrupted stream decoded CLEAN"
    } catch (error) {
      controlHeld = true
      controlDetail = `corrupted stream threw: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  console.log(
    `    synthetic 37x23  : ${syntheticOk ? "identical" : "DIFFERS"}\n` +
      `    assets/icon.png  : ${sourceOk ? "identical" : "DIFFERS"} (${String(source.width)}x${String(source.height)})\n` +
      `    negative control : ${controlDetail}`,
  )
  if (!controlHeld) {
    record("A1 codec round trip", "INCONCLUSIVE", `${controlDetail} — the round trip proves nothing if a mangled stream also passes`)
  } else if (syntheticOk && sourceOk) {
    record(
      "A1 codec round trip",
      "PASS",
      "encode→decode is pixel-identical for a synthetic ramp and for the shipped icon, and a one-byte " +
        "IDAT corruption is detected — so every measurement below is read through a codec that has been tested",
    )
  } else {
    record("A1 codec round trip", "FAIL", `round trip lost data (synthetic ${String(syntheticOk)}, source ${String(sourceOk)})`)
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A2 — the committed artefact is this generator's output, byte for byte.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A2: build/icon.png is reproducible from make-icon.ts ===")
const built = (() => {
  try {
    return { bytes: new Uint8Array(readFileSync(BUILT_1024)), image: decode(new Uint8Array(readFileSync(BUILT_1024))) }
  } catch {
    return null
  }
})()
{
  if (built === null) {
    record("A2 reproducible", "INCONCLUSIVE", `no readable ${BUILT_1024} — run \`bun run icon\``)
  } else {
    const fresh = encode(render(1024))
    const identical = Buffer.compare(Buffer.from(built.bytes), Buffer.from(fresh)) === 0
    console.log(
      `    committed : ${String(built.bytes.length)} bytes, ${String(built.image.width)}x${String(built.image.height)}\n` +
        `    re-render : ${String(fresh.length)} bytes  → ${identical ? "byte-identical" : "DIFFERS"}`,
    )
    record(
      identical ? "A2 reproducible" : "A2 reproducible",
      identical ? "PASS" : "FAIL",
      identical
        ? "the committed PNG is exactly what `bun run icon` writes today — the artefact and its source " +
            "cannot have drifted apart"
        : "the committed PNG is not what the generator produces — it was hand-edited, or the generator " +
            "changed after it was written. Re-run `bun run icon`",
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A3 — geometric parity against the shipped artwork.
//
// The comparison basis is the render with the SOURCE's own off-centre offset applied, because the two
// questions have to come apart: "did the fit recover the artwork?" and "what does centring it cost?".
// Rolled together, the centring correction — a chosen 0.62px shift — dominates the residual and would
// mask a real fitting error four times its size. So A3 gates on the fit and *quotes* the centring cost.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A3: the redraw is the same artwork as assets/icon.png ===")
const sourceCentroid = centroid(source)
/** `ICON`, shifted to sit exactly where the source's artwork sits. The basis for A3 and A4. */
const fittedSpec: IconSpec = cloneSpec()
fittedSpec.centreOffsetX = (sourceCentroid.x - source.width / 2) / source.width
fittedSpec.centreOffsetY = (sourceCentroid.y - source.height / 2) / source.height
const fitted = compare(source, downsample(render(1024, fittedSpec), 4))
{
  const shipped = compare(source, downsample(render(1024), 4))
  const renderCentroid = centroid(downsample(render(1024), 4))

  console.log(
    `    denominators           : ${String(fitted.samples)} channel samples global, ${String(fitted.tileSamples)} per ${String(TILE)}x${String(TILE)} tile\n` +
      `    fit    global MAE      : ${fitted.mae.toFixed(3)}  (limit ${MAE_LIMIT.toFixed(2)})    straight MAE ${fitted.straightMae.toFixed(3)}\n` +
      `    fit    worst tile      : ${fitted.worstTile.toFixed(3)}  (limit ${TILE_LIMIT.toFixed(2)})    at ${String(fitted.worstTileAt.x)},${String(fitted.worstTileAt.y)}\n` +
      `      (basis: render offset by the source's own ${(fittedSpec.centreOffsetX * 256).toFixed(2)},${(fittedSpec.centreOffsetY * 256).toFixed(2)}px at 256)\n` +
      `    as-shipped global MAE  : ${shipped.mae.toFixed(3)}   ← centred on purpose; the extra ${(shipped.mae - fitted.mae).toFixed(3)} IS that correction\n` +
      `    centroid   source      : ${sourceCentroid.x.toFixed(3)},${sourceCentroid.y.toFixed(3)}  area ${sourceCentroid.area.toFixed(1)}px²\n` +
      `    centroid   redraw      : ${renderCentroid.x.toFixed(3)},${renderCentroid.y.toFixed(3)}  area ${renderCentroid.area.toFixed(1)}px²`,
  )
  const withinBoth = fitted.mae <= MAE_LIMIT && fitted.worstTile <= TILE_LIMIT
  record(
    "A3 geometric parity",
    withinBoth ? "PASS" : "FAIL",
    withinBoth
      ? `the fitted geometry reproduces the shipped artwork to a premultiplied MAE of ${fitted.mae.toFixed(3)} ` +
          `of 255 globally and ${fitted.worstTile.toFixed(3)} in its worst ${String(TILE)}x${String(TILE)} tile, ` +
          `and the alpha coverage areas agree to ` +
          `${Math.abs(renderCentroid.area - sourceCentroid.area).toFixed(1)}px² out of ${sourceCentroid.area.toFixed(0)} ` +
          `— so the disc, ring, hub and both hands are the same shapes at both scales. Centring the artwork ` +
          `adds ${(shipped.mae - fitted.mae).toFixed(3)} to the global figure: the source's own centroid sits ` +
          `${(fittedSpec.centreOffsetX * 256).toFixed(2)},${(fittedSpec.centreOffsetY * 256).toFixed(2)}px off ` +
          `centre at 256px, we ship it centred, and that difference is a correction rather than an error`
      : `on the offset-matched basis the fit still misses: global MAE ${fitted.mae.toFixed(3)} against a ` +
          `${MAE_LIMIT.toFixed(2)} limit, worst tile ${fitted.worstTile.toFixed(3)} at ` +
          `${String(fitted.worstTileAt.x)},${String(fitted.worstTileAt.y)} against ${TILE_LIMIT.toFixed(2)} — ` +
          `the fitted parameters do not reproduce the shipped artwork`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// A4 — the mutation control. Without this, A3 is a number with no scale.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A4: single-parameter mutations break A3 ===")
{
  // Each perturbation is the size of a mistake a careless fit could actually make — a hand a few degrees
  // out, a radius a few percent out, a hub or a hand width off by a fifth. None of them is large enough
  // to stop the result looking like a clock, which is the entire point.
  const mutations: { label: string; mutate: (s: IconSpec) => void }[] = [
    { label: "minute hand +5°", mutate: (s) => void (s.hands[0]!.clockDegrees += 5) },
    { label: "outer radius +4%", mutate: (s) => void (s.outerRadius *= 1.04) },
    { label: "ring inner +3%", mutate: (s) => void (s.ringInnerRadius *= 1.03) },
    { label: "hub radius +20%", mutate: (s) => void (s.hubRadius *= 1.2) },
    { label: "hour hand width −15%", mutate: (s) => void (s.hands[1]!.halfWidth *= 0.85) },
    { label: "minute hand −8% length", mutate: (s) => void (s.hands[0]!.length *= 0.92) },
  ]
  const rows = mutations.map((m) => {
    // Mutations are applied to the offset-matched spec, so they are measured against the same basis A3
    // gates on. Mutating the centred render instead would add the centring residual to every row and
    // flatter the control by inflating all of them equally.
    const spec = cloneSpec(fittedSpec)
    m.mutate(spec)
    const scored = compare(source, downsample(render(1024, spec), 4))
    // A mutation counts as caught if EITHER scale sees it, and `margin` is how far past its limit the
    // better-placed metric gets. A global drift shows in the mean; a wrong local shape shows in a tile.
    const globalMargin = scored.mae / MAE_LIMIT
    const tileMargin = scored.worstTile / TILE_LIMIT
    return {
      label: m.label,
      mae: scored.mae,
      worstTile: scored.worstTile,
      by: tileMargin > globalMargin ? "tile" : "global",
      margin: Math.max(globalMargin, tileMargin),
      /** Ratio against the true residual on whichever metric caught it — the separation that matters. */
      separation: tileMargin > globalMargin ? scored.worstTile / fitted.worstTile : scored.mae / fitted.mae,
    }
  })
  for (const r of rows) {
    console.log(
      `    ${r.label.padEnd(24)} global ${r.mae.toFixed(3).padStart(7)}  worst tile ${r.worstTile.toFixed(2).padStart(7)}` +
        `  → caught by ${r.by.padEnd(6)} at ${r.margin.toFixed(2)}× its limit, ${r.separation.toFixed(2)}× the residual` +
        `  ${r.margin > 1 ? "✓" : "✗ slips under"}`,
    )
  }
  const weakest = rows.reduce((w, r) => (r.margin < w.margin ? r : w))
  console.log(
    `    residual: global ${fitted.mae.toFixed(3)} / tile ${fitted.worstTile.toFixed(2)}   ` +
      `limits: ${MAE_LIMIT.toFixed(2)} / ${TILE_LIMIT.toFixed(2)}   ` +
      `weakest mutation ${weakest.label} at ${weakest.separation.toFixed(2)}× the residual ` +
      `(floor ${MIN_SEPARATION.toFixed(1)}×)`,
  )
  const allDetected = rows.every((r) => r.margin > 1)
  const wellSeparated = weakest.separation >= MIN_SEPARATION
  record(
    "A4 mutation control",
    allDetected && wellSeparated ? "PASS" : "INCONCLUSIVE",
    allDetected && wellSeparated
      ? `all ${String(rows.length)} perturbations are caught, the weakest (${weakest.label}) at ` +
          `${weakest.margin.toFixed(2)}× its limit and ${weakest.separation.toFixed(2)}× the true residual, ` +
          `with each limit sitting between the two. So A3's pass is a measurement that could have failed — ` +
          `and the second scale earns its keep: ${String(rows.filter((r) => r.mae <= MAE_LIMIT).length)} of ` +
          `${String(rows.length)} score under the global limit and would have slipped past the mean alone`
      : `the limits no longer separate signal from noise — weakest mutation ${weakest.label} at ` +
          `${weakest.margin.toFixed(2)}× its limit, ${weakest.separation.toFixed(2)}× the residual. A3's pass ` +
          `carries no weight until the limits are re-placed`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// A5 — the pixels are real: right places, right populations, real antialiasing.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A5: the raster is non-degenerate ===")
{
  if (built === null) {
    record("A5 non-degenerate", "INCONCLUSIVE", "no built icon to inspect")
  } else {
    const image = built.image
    const S = image.width
    const at = (fx: number, fy: number): [number, number, number, number] =>
      pixel(image, Math.round(fx * S), Math.round(fy * S))
    const lightness = (p: [number, number, number, number]): number => (p[0] + p[1] + p[2]) / 3

    const probes = [
      { name: "corner (0.01,0.01)", got: at(0.01, 0.01), want: "transparent", ok: (p: [number, number, number, number]) => p[3] === 0 },
      { name: "hub centre", got: at(0.5, 0.5), want: "opaque light", ok: (p: [number, number, number, number]) => p[3] === 255 && lightness(p) > 250 },
      { name: "dial at 6 o'clock r=0.30", got: at(0.5, 0.8), want: "opaque dark", ok: (p: [number, number, number, number]) => p[3] === 255 && lightness(p) < 40 },
      { name: "ring at 6 o'clock r=0.44", got: at(0.5, 0.94), want: "opaque light", ok: (p: [number, number, number, number]) => p[3] === 255 && lightness(p) > 250 },
      { name: "outside the disc r=0.49", got: at(0.5, 0.99), want: "transparent", ok: (p: [number, number, number, number]) => p[3] === 0 },
    ]
    for (const p of probes) {
      console.log(
        `    ${p.name.padEnd(26)} rgba(${p.got.join(",")})  want ${p.want}  ${p.ok(p.got) ? "✓" : "✗"}`,
      )
    }

    // Population census, against the source's own — scaled by 16 for the 4× linear resolution. Compared
    // as fractions so the two sizes are commensurable.
    const census = (img: Raster): { clear: number; dark: number; light: number; edge: number } => {
      let clear = 0
      let dark = 0
      let light = 0
      let edge = 0
      for (let i = 0; i < img.data.length; i += 4) {
        const a = img.data[i + 3]!
        const l = (img.data[i]! + img.data[i + 1]! + img.data[i + 2]!) / 3
        if (a === 0) clear++
        else if (a < 255) edge++
        else if (l > 200) light++
        else dark++
      }
      const total = img.data.length / 4
      return { clear: clear / total, dark: dark / total, light: light / total, edge: edge / total }
    }
    const sourceCensus = census(source)
    const builtCensus = census(image)
    console.log(
      `    population   clear      dark       light      partial-alpha\n` +
        `      source     ${sourceCensus.clear.toFixed(4)}     ${sourceCensus.dark.toFixed(4)}     ${sourceCensus.light.toFixed(4)}     ${sourceCensus.edge.toFixed(4)}\n` +
        `      redraw     ${builtCensus.clear.toFixed(4)}     ${builtCensus.dark.toFixed(4)}     ${builtCensus.light.toFixed(4)}     ${builtCensus.edge.toFixed(4)}`,
    )

    // Real antialiasing: a hard-edged render would have only two alpha values.
    const alphaLevels = new Set<number>()
    for (let i = 3; i < image.data.length; i += 4) alphaLevels.add(image.data[i]!)
    console.log(`    distinct alpha levels: ${String(alphaLevels.size)} (a hard-edged render would have 2)`)

    const placementOk = probes.every((p) => p.ok(p.got))
    // The partial-alpha fraction falls with resolution — the antialiased boundary is a 1px-wide curve, so
    // it is ~4× smaller as a share of a 4×-linear image. Only the three area populations are compared.
    const populationsOk =
      Math.abs(builtCensus.clear - sourceCensus.clear) < 0.01 &&
      Math.abs(builtCensus.dark - sourceCensus.dark) < 0.02 &&
      Math.abs(builtCensus.light - sourceCensus.light) < 0.02
    if (placementOk && populationsOk && alphaLevels.size > 32) {
      record(
        "A5 non-degenerate",
        "PASS",
        `all ${String(probes.length)} sampled points carry the expected class, the clear/dark/light area ` +
          `fractions match the source to within 1-2 points, and ${String(alphaLevels.size)} distinct alpha ` +
          `levels confirm a genuinely antialiased edge`,
      )
    } else {
      record(
        "A5 non-degenerate",
        "FAIL",
        `placement ${placementOk ? "ok" : "WRONG"}, populations ${populationsOk ? "ok" : "OFF"}, ` +
          `${String(alphaLevels.size)} alpha levels`,
      )
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A6 — the build actually consumes it, at a size electron-builder accepts.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A6: electron-builder points mac and linux at this file ===")
{
  const config = readFileSync(BUILDER_CONFIG, "utf8")
  // Line-based, tracking the current top-level key — enough to tell `mac.icon` from `win.icon` without
  // adding a YAML parser to a repo that has no production dependencies.
  const icons = new Map<string, string>()
  let section = ""
  for (const line of config.split(/\r?\n/)) {
    const top = /^([A-Za-z]\w*):/.exec(line)
    if (top) section = top[1]!
    const icon = /^\s+icon:\s*(\S+)/.exec(line)
    if (icon && section !== "") icons.set(section, icon[1]!)
  }
  const dims = built === null ? null : { w: built.image.width, h: built.image.height }
  console.log(
    `    icon keys found: ${[...icons].map(([k, v]) => `${k}=${v}`).join("  ") || "(none)"}\n` +
      `    built size     : ${dims === null ? "?" : `${String(dims.w)}x${String(dims.h)}`} (electron-builder floor for icns/linux is 512x512)`,
  )
  const wanted = "build/icon.png"
  const macOk = icons.get("mac") === wanted
  const linuxOk = icons.get("linux") === wanted
  const bigEnough = dims !== null && dims.w >= 512 && dims.h >= 512 && dims.w === dims.h
  if (macOk && linuxOk && bigEnough) {
    record(
      "A6 consumed by the build",
      "PASS",
      `mac.icon and linux.icon both resolve to ${wanted}, which is ${String(dims.w)}x${String(dims.h)} — ` +
        `over the 512 floor that kept both targets iconless. win.icon stays ${icons.get("win") ?? "?"}, ` +
        `since ICO cannot express a dimension above 256 in the first place`,
    )
  } else {
    record(
      "A6 consumed by the build",
      "FAIL",
      `mac.icon=${icons.get("mac") ?? "ABSENT"}, linux.icon=${icons.get("linux") ?? "ABSENT"}, ` +
        `size ${bigEnough ? "ok" : "below the 512 floor or not square"} — an icon nothing references is ` +
        `the state this work started in`,
    )
  }
}

console.log("=== summary ===")
for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.name}`)
const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
console.log(`\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive`)
console.log(
  `\nFitted parameters, for the record: outer ${ICON.outerRadius.toFixed(6)}, ring inner ` +
    `${ICON.ringInnerRadius.toFixed(6)}, hub ${ICON.hubRadius.toFixed(3)}, hands ` +
    ICON.hands.map((h) => `${h.name} ${h.clockDegrees.toFixed(2)}°`).join(" / ") +
    "\nThis is a host-independent measurement — it compares two rasters and never asks an OS anything.\n" +
    "That the icns conversion succeeds is NOT claimed here, and was measured on a real mac instead:\n" +
    "`dist:mac` exit 0, a 1024x1024 icon.icns in the bundle, and a 256px source rejected with\n" +
    "`Icon must be at least 512x512 pixels`. The Linux `set` format returns this PNG as-is at [1024]\n" +
    "with no ladder and no 512 floor — measured by calling convertIcon directly, because a dist:linux\n" +
    "run never reaches the icon step. A Linux desktop drawing it is still unbought.",
)
process.exit(failed > 0 ? 1 : 0)
