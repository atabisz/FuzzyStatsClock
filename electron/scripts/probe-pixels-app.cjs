/**
 * Two windows, stacked, so a screenshot can answer a question no style bit can: does a `transparent: true`
 * Electron window actually composite, or does it paint an opaque box?
 *
 * ## Why two windows and not one over the wallpaper
 *
 * The naive version captures the desktop, then shows the transparent window and captures again, and passes
 * when the two match. It has a hole big enough to drive the whole regression through: if the desktop under
 * the rect is dark and the window paints an opaque dark box, the captures also match. So the backdrop is
 * OURS -- an opaque magenta window placed at the same rect -- and magenta is chosen for being a colour no
 * theme, wallpaper, taskbar or Chromium default will supply by accident.
 *
 * The transparent window then sits ON TOP of that backdrop at the `screen-saver` z-level, exactly as the real
 * widget does. Magenta still visible through it means the compositor honoured the alpha. Anything else means
 * it did not, and the widget on Alex's desk is a box.
 *
 * ## The control, which is the half that makes it discriminating
 *
 * A "still magenta" reading also happens if the top window never showed at all -- wrong z-order, off-screen,
 * still hidden. So the same window is asked, in a later stage, to paint itself fully OPAQUE green. If the
 * capture does not turn green, the probe has been photographing the backdrop the whole time and its earlier
 * green means nothing. `probe-pixels.ts` gates on both.
 *
 * Stages are released through a counter file, not stdin: **Electron's main process on Windows does not
 * deliver piped stdin** -- measured, and written up in `probe-fade-app.cjs`'s header.
 *
 * CommonJS for `probe-fade-app.cjs`'s reason: handed to `electron.exe` directly rather than bundled, and
 * Electron's main-process loader treats a `.js` under a `"type": "module"` package as ESM.
 */

const { app, BrowserWindow } = require("electron")
const { readFileSync } = require("node:fs")

const GO_PATH = process.argv[2]

/** Where both windows go. Passed in so the driver grabs exactly the rect it asked for. */
const X = Number(process.argv[3])
const Y = Number(process.argv[4])
const W = Number(process.argv[5])
const H = Number(process.argv[6])

/**
 * The two colours, as `rgb()` and NOT as hex.
 *
 * `#ff00ff` inside a `data:text/html,` URL is a FRAGMENT: everything from the `#` on is stripped before the
 * document is parsed, so the first version of this file served a page whose style ended at `background:` and
 * whose closing tags were gone. Chosen for being un-supplyable by accident -- see the header -- which is worth
 * nothing if the page never receives them.
 */
const BACKDROP = "rgb(255,0,255)"
const CONTROL = "rgb(0,200,0)"

let consumed = 0

function say(line) {
  process.stdout.write(`${line}\n`)
}

function waitForGo() {
  return new Promise((resolve) => {
    const poll = () => {
      let value = 0
      try {
        value = Number(readFileSync(GO_PATH, "utf8").trim())
      } catch {
        value = 0
      }
      if (Number.isFinite(value) && value > consumed) {
        consumed = value
        resolve()
        return
      }
      setTimeout(poll, 25)
    }
    poll()
  })
}

/**
 * A page that fills the viewport with one colour, or with nothing at all.
 *
 * `encodeURIComponent` on the whole document rather than a raw data URL: the markup carries quotes, angle
 * brackets and spaces, and leaving those to the URL parser is how the fragment bug above got in.
 */
function page(colour) {
  const body = colour === null ? "background:transparent" : `background:${colour}`
  const html = `<body style="margin:0;width:100vw;height:100vh;${body}"></body>`
  return `data:text/html,${encodeURIComponent(html)}`
}

app.whenReady().then(async () => {
  // The backdrop. Opaque, framed off, and NOT at the screen-saver level -- it has to lose the z-fight with
  // the widget window, otherwise the control stage would be photographing this one.
  const backdrop = new BrowserWindow({
    x: X,
    y: Y,
    width: W,
    height: H,
    frame: false,
    transparent: false,
    backgroundColor: BACKDROP,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    title: "FCPixelBackdrop",
  })
  await backdrop.loadURL(page(BACKDROP))
  backdrop.show()

  // The subject: `main.ts:137-157`'s options, with only the position and the title changed. If this list and
  // the real one drift apart the probe stops being about the real widget's window, so it is copied whole
  // rather than reduced to the flags that "matter".
  const widget = new BrowserWindow({
    x: X,
    y: Y,
    width: W,
    height: H,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    title: "FCPixelWidget",
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  await widget.loadURL(page(null))
  widget.setAlwaysOnTop(true, "screen-saver")

  // The bounds are REPORTED rather than assumed to be the ones asked for. The driver grabs what this says,
  // because a window can legitimately land elsewhere -- work-area clamping, a display that is not at the
  // origin, or a scale factor -- and a probe that photographs the rect it requested instead of the rect the
  // window occupies reads the wallpaper and calls it a failed paint. That is exactly what happened on the
  // first run of this file.
  const b = widget.getBounds()
  const back = backdrop.getBounds()
  say(
    `PIXEL-BOUNDS ${JSON.stringify({
      widget: b,
      backdrop: back,
      scale: require("electron").screen.getDisplayMatching(b).scaleFactor,
    })}`,
  )
  say(`PID ${String(process.pid)}`)

  // Stage 1: backdrop alone. Establishes what magenta reads as through this capture path, on this display,
  // at this colour profile -- rather than assuming `ff00ff` on the glass reads back as `ff00ff`.
  say("PIXEL-STAGE backdrop-only")
  await waitForGo()

  // Stage 2: the transparent widget on top, painting nothing.
  widget.show()
  say("PIXEL-STAGE widget-transparent")
  await waitForGo()

  // Stage 3: the same window, same flags, now painting an opaque colour. The control.
  await widget.loadURL(page(CONTROL))
  say("PIXEL-STAGE widget-opaque")
  await waitForGo()

  // Stage 4: back to transparent, to show stage 2 was not a one-off ordering fluke and that the window
  // recovers -- which is also the state ghost mode's fade returns to.
  await widget.loadURL(page(null))
  say("PIXEL-STAGE widget-transparent-again")
  await waitForGo()

  say("PIXEL-DONE")
  app.exit(0)
})
