/**
 * Electron-side half of the ISC-7 display probe: enumerate, print, quit.
 *
 * CommonJS and `.cjs` on purpose. This file is handed to `electron.exe` directly rather
 * than bundled, and Electron's main-process loader treats a `.js` file under a
 * `"type": "module"` package as ESM — where `require` does not exist. `churn-gpu.cjs`
 * is the same shape for the same reason.
 *
 * No window is created. The `screen` module needs `app.whenReady()` but not a
 * BrowserWindow, and creating one would put a transparent overlay on Alex's desktop
 * three times per probe run for no measurement benefit.
 *
 * Everything is printed on one line behind a marker so the driver can find it in stdout
 * without parsing Electron's own chatter. Read it in `probe-displays.ts`.
 */

const { app, screen } = require("electron")

app.whenReady().then(() => {
  const primary = screen.getPrimaryDisplay()

  // A curated field set rather than the whole Display object: `JSON.stringify` on it
  // would also serialise anything Electron adds in a future version, and a probe whose
  // output shape drifts silently between versions is not a baseline.
  const displays = screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: d.label,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    rotation: d.rotation,
    internal: d.internal,
    colorDepth: d.colorDepth,
    displayFrequency: d.displayFrequency,
    isPrimary: d.id === primary.id,
  }))

  process.stdout.write(`PROBE-DISPLAYS ${JSON.stringify({ primaryId: primary.id, displays })}\n`)

  // exit(0) rather than quit(): with no window open there is nothing to close, and quit()
  // has to unwind a GPU process that only exists because Electron always starts one.
  app.exit(0)
})
