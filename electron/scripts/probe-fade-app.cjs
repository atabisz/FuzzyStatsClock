/**
 * Electron-side half of the PERF-01 fade probe: a main process built to be a bad one.
 *
 * ## What this host is, and what it deliberately is not
 *
 * It loads the SHIPPED renderer -- `dist/index.html`, `dist/renderer.js` and `dist/preload.cjs`, with the
 * real window options copied from `main.ts` -- and drives it over the real `ghost` channel. What it is not
 * is `dist/main.js`: it has no tray, no settings store, no telemetry children and no cursor poll, and its
 * whole job is to push fade targets and then get in its own way on demand.
 *
 * That substitution is the only route to this measurement and the reason is recorded in two other files.
 * `probe-display.ts`: **CDP cannot reach `ipcRenderer`**, so a probe attached to the real app cannot push
 * a ghost target. `probe-shell.ts`: synthesising a cursor move needs `SendInput`, which moves the cursor on
 * Alex's real desk -- the same reason the drag arm was left as a manual one. So the choice is between a
 * host that is not the real main process and a probe that cannot run the fade at all.
 *
 * What the substitution costs is stated rather than hidden: this proves nothing about `main/ghost.ts`'s
 * sampler, its 33 ms timer, or the `WS_EX_TRANSPARENT` call. Those are `ghost-driver.test.ts`'s 21 arms
 * and `probe-shell.ts`'s style read. What it proves is the half neither of those can reach -- that the
 * shipped pump's clock survives a main process under load.
 *
 * ## The five things it does
 *
 * 1. Creates a window with `main.ts`'s exact `webPreferences`, `backgroundThrottling: false` included --
 *    a throttled renderer would read as a stalled one, which is the confusion this whole probe is about.
 * 2. Replies to the renderer's `ready` with a real `AppSettings`, written to a temp file by the driver
 *    from `DEFAULTS` so the object on the wire is the shipped shape and not a hand-rolled subset.
 * 3. Walks a ghost ratio along a sine at the sampler's own 33 ms cadence. A sine rather than an
 *    alternation between two targets, because a target the pump can REACH lets it converge and detach --
 *    and a detached pump writes nothing, which is indistinguishable from a stalled one in a write-interval
 *    histogram. The range is [0.05, 0.95], deliberately excluding 0 and 1: `lerpRatio` snaps hard on those
 *    two, so a schedule that touched them would spend part of every swing not interpolating at all.
 * 4. Blocks its own event loop 40 ms out of every 50 on request -- the main-process saturation arm.
 * 5. Runs the NEGATIVE CONTROL: the same animation driven from here with `win.setOpacity()` at 60 Hz,
 *    which is v4.4's architecture rebuilt on purpose. Its own call timestamps are recorded from this
 *    process's clock. Without it, "the renderer's frames were steady" is a number with nothing to be
 *    steady compared to, and the load could have failed to bite with every arm still green.
 *
 * Phases are gated on a counter FILE the driver writes, so it can start and stop external CPU churn between
 * them without either side guessing at the other's timing.
 *
 * ## Why a file and not stdin, which is what this was written as first
 *
 * **Electron's main process on Windows does not deliver piped stdin.** Measured: with `stdio: "pipe"`,
 * `process.stdin` in the main process is a bare `Readable` with `isTTY === undefined` that never emits a
 * `data` event, and never errors either -- so the first version of this file printed its phase marker and
 * then waited forever while the driver's write went nowhere. stdOUT is unaffected and works normally, which
 * is what makes the failure look like a hung renderer rather than a dead channel.
 *
 * The replacement is a monotonically increasing integer in a file inside the driver's own temp profile dir.
 * A counter rather than a sentinel's existence, because the latter needs a delete between phases and a
 * poll that lands mid-delete reads a phase that was never released.
 *
 * CommonJS and `.cjs` for `probe-displays-app.cjs`'s reason: this file is handed to `electron.exe`
 * directly rather than bundled, and Electron's main-process loader treats a `.js` under a
 * `"type": "module"` package as ESM, where `require` does not exist.
 */

const { app, BrowserWindow, ipcMain } = require("electron")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const DIST = join(__dirname, "..", "dist")
const SETTINGS_PATH = process.argv[2]
const GO_PATH = process.argv[3]

/** `GhostDriver`'s own cadence, so the target arrives as often as the real sampler would send it. */
const PUSH_MS = 33
/** The negative control's cadence: the frame rate the renderer-side pump is being measured at. */
const SETOPACITY_MS = 16
/** 40 ms of blocking in every 50 -- 80% of this process's event loop, gone. */
const BUSY_SPIN_MS = 40
const BUSY_GAP_MS = 10
/** Long enough for ~2.5 sine periods and ~240 frames at 60 Hz. */
const PHASE_MS = 4_000
/** The sine's angular scale: a period of 2*pi*300 ms, about 1.9 s per sweep in and out. */
const SINE_MS = 300

const PHASES = [
  { name: "renderer-idle", mode: "renderer", busy: false },
  { name: "setopacity-idle", mode: "setopacity", busy: false },
  { name: "renderer-main-busy", mode: "renderer", busy: true },
  { name: "setopacity-main-busy", mode: "setopacity", busy: true },
  { name: "renderer-system-busy", mode: "renderer", busy: false },
  { name: "setopacity-system-busy", mode: "setopacity", busy: false },
  // Past the plan's band on purpose, and reported as a diagnostic rather than gated: 25-50% of a 32-core
  // machine leaves half of it idle, so a green there locates no limit at all. These two oversubscribe every
  // core and answer the question the band cannot -- where does this actually break.
  { name: "renderer-oversubscribed", mode: "renderer", busy: false },
  { name: "setopacity-oversubscribed", mode: "setopacity", busy: false },
]

let win = null
let settings = null
let observerReady = false
let rendererReady = false
let busyTimer = null
/** Resolver for the in-flight `probe-record` drain. */
let pendingDrain = null

function say(line) {
  process.stdout.write(`${line}\n`)
}

/** The ratio at `elapsed` ms into a phase. Never 0 and never 1 -- see the header. */
function ratioAt(elapsed) {
  return 0.5 + 0.45 * Math.sin(elapsed / SINE_MS)
}

function startBusy() {
  const spin = () => {
    const until = Date.now() + BUSY_SPIN_MS
    // A bare `while` on the clock rather than arithmetic: the subject is the event loop being unavailable,
    // and the cheapest way to make it unavailable for a known duration is to hold it for that duration.
    while (Date.now() < until) {
      /* deliberately empty */
    }
    busyTimer = setTimeout(spin, BUSY_GAP_MS)
  }
  spin()
}

function stopBusy() {
  if (busyTimer !== null) clearTimeout(busyTimer)
  busyTimer = null
}

/** How many releases this process has already acted on. Compared against the counter file. */
let goesConsumed = 0

/**
 * Wait for the driver to bump the counter file past what this process has already used.
 *
 * The read is wrapped: the driver writes with `writeFileSync`, and a poll that lands between the truncate
 * and the write sees an empty file, which `Number("")` turns into 0 rather than a throw -- so the guard is
 * `> goesConsumed` rather than `!== goesConsumed`, and a transient 0 is simply another wait.
 *
 * 25 ms because this only runs BETWEEN phases: nothing is being recorded, so the poll cost is not in any
 * measurement, and a quarter of a frame is well inside the driver's own churn spin-up window.
 */
function waitForGo() {
  return new Promise((resolve) => {
    const poll = () => {
      let value = 0
      try {
        value = Number(readFileSync(GO_PATH, "utf8").trim())
      } catch {
        value = 0
      }
      if (Number.isFinite(value) && value > goesConsumed) {
        goesConsumed = value
        resolve()
        return
      }
      setTimeout(poll, 25)
    }
    poll()
  })
}

function drain() {
  return new Promise((resolve) => {
    pendingDrain = resolve
    win.webContents.send("probe-record-stop")
  })
}

/**
 * One phase. Both modes record the renderer's frames, and that is not redundant in the `setopacity` mode:
 * it is what shows the renderer kept producing frames all the way through the arm where the ANIMATION
 * stalled, which is the difference between "the machine was overloaded" and "this architecture stalls".
 */
async function runPhase(phase) {
  say(`PROBE-FADE-PHASE ${phase.name}`)
  await waitForGo()

  win.webContents.send("probe-record-start")
  if (phase.busy) startBusy()

  /** This process's own clock, per push or per `setOpacity` call. */
  const mainTicks = []
  const started = Date.now()
  const tick = () => {
    const now = Date.now()
    mainTicks.push(now - started)
    const ratio = ratioAt(now - started)
    if (phase.mode === "renderer") {
      win.webContents.send("ghost", { ratio })
    } else {
      // v4.4's architecture, on purpose. `setOpacity` is `@platform win32,darwin` and documented as doing
      // nothing on Linux -- which is one of the two reasons the shipped port does not use it -- so on
      // Linux this arm measures the CALL cadence only, and the driver reports it as such.
      win.setOpacity(settings.opacity * (1 - ratio))
    }
  }
  const interval = setInterval(tick, phase.mode === "renderer" ? PUSH_MS : SETOPACITY_MS)

  await new Promise((r) => setTimeout(r, PHASE_MS))
  clearInterval(interval)
  stopBusy()
  // Opacity back to the settings value, so the next phase does not start from wherever the sine stopped.
  if (phase.mode === "setopacity") win.setOpacity(settings.opacity)
  else win.webContents.send("ghost", { reset: true })

  const recorded = await drain()
  say(
    `PROBE-FADE ${JSON.stringify({
      phase: phase.name,
      mode: phase.mode,
      busy: phase.busy,
      elapsedMs: Date.now() - started,
      mainTicks,
      ...recorded,
    })}`,
  )
}

ipcMain.on("ready", () => {
  rendererReady = true
  win.webContents.send("settings", settings)
})
ipcMain.on("probe-observer-ready", () => {
  observerReady = true
})
ipcMain.on("probe-record", (_event, payload) => {
  if (pendingDrain !== null) {
    const resolve = pendingDrain
    pendingDrain = null
    resolve(payload)
  }
})
ipcMain.on("probe-error", (_event, message) => say(`PROBE-FADE-ERROR ${String(message)}`))
// The rest of the shipped surface, so nothing the renderer calls throws into a dead channel. `resize` is
// honoured rather than ignored: the renderer measures its content and expects the window to follow, and a
// window that stays at the placeholder size would clip the widget and change what Chromium composites.
ipcMain.on("resize", (_event, size) => {
  if (win !== null && !win.isDestroyed() && size && size.width > 0 && size.height > 0) {
    win.setContentSize(Math.ceil(size.width), Math.ceil(size.height))
  }
})
for (const channel of ["painted", "drag-start", "drag-move", "drag-end", "context-menu", "adjust-opacity"]) {
  ipcMain.on(channel, () => {
    /* no-op: this host has no tray, no store and no placement */
  })
}

app.whenReady().then(async () => {
  settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"))

  win = new BrowserWindow({
    width: 232,
    height: 260,
    // The real window's options, copied from `main.ts:137-157`. `backgroundThrottling: false` is the one
    // that matters most here -- Chromium throttles rAF in a renderer it considers hidden or occluded, and
    // a throttled clock is exactly the reading this probe must not produce by accident.
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    // Bottom-right-ish rather than the real app's saved position: it must be VISIBLE for rAF to be
    // serviced, and this is the least intrusive place to put a small always-on-top window for 30 seconds.
    x: 60,
    y: 60,
    webPreferences: {
      preload: join(__dirname, "probe-fade-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  win.webContents.on("did-fail-load", (_e, code, description, url) => {
    say(`PROBE-FADE-ERROR renderer failed to load ${url}: ${description} (${String(code)})`)
  })
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) say(`PROBE-FADE-CONSOLE ${message}`)
  })

  await win.loadFile(join(DIST, "index.html"))
  win.setAlwaysOnTop(true, "screen-saver")
  win.setOpacity(settings.opacity)
  win.show()

  // Both halves have to be live before a phase means anything: `rendererReady` says the shipped bridge is
  // listening (a `send` to a renderer with no listener is dropped silently), and `observerReady` says the
  // instrument is attached. Polled rather than raced on a fixed sleep, and with a ceiling so a broken
  // page fails loudly instead of producing an empty recording that reads as a stall.
  const deadline = Date.now() + 15_000
  while ((!rendererReady || !observerReady) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50))
  }
  if (!rendererReady || !observerReady) {
    say(`PROBE-FADE-ERROR not ready: renderer=${String(rendererReady)} observer=${String(observerReady)}`)
    app.exit(2)
    return
  }
  // A moment for the first tick to have laid out and resized, so the recording is not measuring startup.
  await new Promise((r) => setTimeout(r, 1_500))
  say("PROBE-FADE-READY")

  for (const phase of PHASES) await runPhase(phase)

  say("PROBE-FADE-DONE")
  app.exit(0)
})
