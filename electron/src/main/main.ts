/**
 * Electron main process.
 *
 * At this stage of the port this is the **ISC-6 workload** — the thing whose cost
 * decides whether the port continues. So it is deliberately not a stub: it is the
 * real window shape (frameless, transparent, topmost, out of Alt-Tab), driven by
 * the real telemetry source with its two live `typeperf` children, repainting real
 * SVG once per second. A harness cheaper than the finished app would produce a
 * number that flatters the port and then fail to hold in Phase 6.
 *
 * What is NOT here yet, and why it does not distort the measurement:
 *   - The fuzzy phrase engine (Phase 2). The phrase is a placeholder, but phrase
 *     text is rewritten at most once a minute in the WPF original
 *     (`UpdatePhraseIfChanged`), so it contributes nothing to per-second cost.
 *   - Tray, settings, per-monitor position memory, ghost mode (Phases 4-8). None
 *     of them run work on the 1s tick.
 *
 * The per-second cost is what the stats panel does: five bar widths, five
 * percentage strings, the uptime line. That is present and real.
 *
 * `backgroundThrottling: false` is set on purpose. Chromium throttles timers and
 * defers rendering in a renderer it believes is hidden or occluded, and an
 * accidentally-throttled renderer would make ISC-6 measure a window that is not
 * drawing. The paint counter below exists for the same reason — see PROBE-PAINTS.
 */

import { BrowserWindow, app, ipcMain, screen } from "electron"
import { join } from "node:path"
import { Win32StatsSource } from "./telemetry/win32.js"
import { EMPTY_TEMPS, UNAVAILABLE, type StatsSample, type StatsSource } from "../shared.js"
import {
  IS_WIN,
  applyPlatformWindowTraits,
  forceX11OnLinux,
  hideFromAppSwitcher,
  platformWindowOptions,
} from "../platform.js"

const REPAINT_MS = 1_000

/**
 * Directory of this bundle — `dist/`, beside `index.html` and `preload.cjs`.
 *
 * NOT `app.getAppPath()`. With `main` pointing at `dist/main.js`, Electron already
 * resolves the app path to `dist/`, so `join(getAppPath(), "dist", "index.html")`
 * asks for `dist/dist/index.html`. That failed silently: the transparent window
 * still showed, `ready-to-show` still fired, and only the paint counter revealed it.
 * Resolving against this module's own location is true in both layouts — and inside
 * an asar archive, where `getAppPath()` changes shape again.
 */
const HERE = import.meta.dirname

function log(level: "info" | "warn" | "error", message: string): void {
  process.stdout.write(`[main] ${level} ${message}\n`)
}

/** Must run before `app.whenReady()` — a switch appended after it is ignored. */
forceX11OnLinux(app.commandLine, log)

let source: StatsSource | null = null
let repaintTimer: ReturnType<typeof setInterval> | null = null

/**
 * Latest reading, held in main rather than pushed straight through.
 *
 * The source emits on `typeperf`'s schedule and the window repaints on its own;
 * coupling them would make the repaint cadence hostage to a child process's
 * jitter, and would repaint twice when the scalar and GPU children happen to
 * report in the same interval.
 */
const latest: StatsSample = {
  cpu: UNAVAILABLE,
  mem: UNAVAILABLE,
  gpu: UNAVAILABLE,
  pag: UNAVAILABLE,
  battery: UNAVAILABLE,
  pluggedIn: false,
  temps: { ...EMPTY_TEMPS },
  uptimeSec: 0,
}

/** Paints the renderer has actually completed. Reported so a silent renderer
 *  cannot be mistaken for a cheap one. */
let paints = 0

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 232,
    height: 260,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    ...platformWindowOptions(),
    webPreferences: {
      preload: join(HERE, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  // "screen-saver" rather than plain true: the WPF original is Topmost and stays
  // above a maximised window, and the default "floating" level does not.
  win.setAlwaysOnTop(true, "screen-saver")
  applyPlatformWindowTraits(win, log)

  const area = screen.getPrimaryDisplay().workArea
  win.setPosition(area.x + area.width - 260, area.y + 40)

  // Loud on failure. `loadFile` rejects into a warning Electron prints once, and the
  // result is a transparent window with nothing in it — which is visually identical
  // to a working overlay against a dark desktop, and reads as a *cheap* one in any
  // CPU measurement. This fired for real: `dist/dist/index.html`, see HERE above.
  win.webContents.on("did-fail-load", (_e, code, description, url) => {
    log("error", `renderer failed to load ${url}: ${description} (${String(code)})`)
  })

  void win.loadFile(join(HERE, "index.html"))
  return win
}

app.whenReady().then(() => {
  hideFromAppSwitcher(app, log)

  ipcMain.on("painted", () => {
    paints++
  })

  const win = createWindow()

  win.once("ready-to-show", () => {
    win.show()
    log("info", `window shown, transparent+topmost, paints will follow at ${REPAINT_MS}ms`)
    process.stdout.write(`PROBE-READY pid=${process.pid}\n`)
  })

  if (IS_WIN) {
    const win32 = new Win32StatsSource({ intervalSec: 1, recycleMs: 30_000, log })
    source = win32
    log("info", `telemetry: ${win32.describe()}`)
    win32.start((sample) => Object.assign(latest, sample))
  } else {
    // macOS and Linux sources are Phase 6. Stated rather than silently skipped:
    // an ISC-6 figure measured with no telemetry attached is not the workload.
    log("warn", `telemetry: no source implemented for ${process.platform} — stats will read as --`)
  }

  repaintTimer = setInterval(() => {
    latest.uptimeSec = Math.floor(process.uptime())
    if (!win.isDestroyed()) win.webContents.send("stats", latest)
  }, REPAINT_MS)

  // Paint count on a slow cadence, so the probe can read it out of stdout without
  // the reporting itself becoming a measurable cost.
  setInterval(() => process.stdout.write(`PROBE-PAINTS ${paints}\n`), 5_000)
})

app.on("window-all-closed", () => app.quit())

app.on("before-quit", () => {
  if (repaintTimer) clearInterval(repaintTimer)
  // Without this the `typeperf` children outlive the app: they are spawned by this
  // process but nothing reparents or reaps them on exit.
  source?.stop()
})
