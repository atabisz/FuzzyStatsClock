/**
 * The X11 twin of `scripts/screengrab.ps1` — read the actual COMPOSITED pixels of a screen rectangle
 * (ISC-10 / ISC-15 / ISC-16 Linux half; port plan task L5).
 *
 * `screengrab.ps1` uses GDI `CopyFromScreen`, which reads the desktop *after* the compositor has drawn
 * it — the whole point, because `webContents.capturePage()` captures a window's own surface and so a
 * transparent page reads back transparent whether or not the OS honoured the alpha.
 *
 * The Linux equivalent of "the desktop after compositing" is `desktopCapturer` with `types: ['screen']`:
 * on X11 it returns the composited root image with no portal prompt. This helper grabs it once at full
 * resolution, crops to the requested rect, and emits the SAME contract `screengrab.ps1` does — a mean
 * plus an 8x8 grid — so `probe-pixels-x11.ts` compares stages exactly as `probe-pixels.ts` does on
 * Windows. A full bitmap over stdout would make the transport the slowest thing in the run; a grid is
 * what stops a uniform-colour check passing on an image that is uniform in the wrong place.
 *
 * CommonJS and handed to the Electron binary directly, for `probe-pixels-app.cjs`'s reason.
 *
 * argv: <X> <Y> <W> <H> [grid]
 */

const { app, desktopCapturer, screen } = require("electron")

// Electron keeps its own switches (`--no-sandbox`) in argv, so parse the TRAILING run of integer args
// rather than fixed positions: <X> <Y> <W> <H> [grid].
const ints = process.argv.filter((a) => /^-?\d+$/.test(a))
const [X, Y, W, H, GRIDRAW] = ints.slice(-5).map(Number)
const GRID = Number.isFinite(GRIDRAW) && GRIDRAW >= 2 && GRIDRAW <= 16 ? GRIDRAW : 8

app.whenReady().then(async () => {
  // Full virtual-screen size, so the thumbnail is 1:1 and the crop rect is in real pixels.
  const primary = screen.getPrimaryDisplay()
  const size = { width: primary.size.width, height: primary.size.height }

  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size })
  if (sources.length === 0) {
    process.stdout.write("GRAB-ERROR no screen sources\n")
    app.exit(2)
    return
  }
  // The display whose bounds contain the rect's centre.
  const cx = X + W / 2
  const cy = Y + H / 2
  const match = screen.getAllDisplays().find((d) => {
    const b = d.bounds
    return cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height
  })
  const wantId = match ? String(match.id) : null
  const source =
    sources.find((s) => wantId !== null && s.display_id === wantId) ?? sources[0]

  const img = source.thumbnail
  const isize = img.getSize()
  // BGRA, row-major, 4 bytes/px.
  const buf = img.toBitmap()
  const stride = isize.width * 4

  const px = (ix, iy) => {
    if (ix < 0 || iy < 0 || ix >= isize.width || iy >= isize.height) return null
    const o = iy * stride + ix * 4
    return { b: buf[o], g: buf[o + 1], r: buf[o + 2], a: buf[o + 3] }
  }

  let sr = 0
  let sg = 0
  let sb = 0
  let n = 0
  const cells = []
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const ix = Math.round(X + ((gx + 0.5) / GRID) * W)
      const iy = Math.round(Y + ((gy + 0.5) / GRID) * H)
      const p = px(ix, iy)
      if (p === null) {
        cells.push(null)
        continue
      }
      sr += p.r
      sg += p.g
      sb += p.b
      n++
      cells.push([p.r, p.g, p.b])
    }
  }
  const mean = n > 0 ? [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] : null
  process.stdout.write(
    `GRAB ${JSON.stringify({ rect: { X, Y, W, H }, thumb: isize, source: source.name, mean, cells })}\n`,
  )
  app.exit(0)
})
