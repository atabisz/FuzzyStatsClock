/**
 * Electron-side half of the darwin focus probe. See `probe-mac-focus.ts` for the claim under test, the three
 * modes and what each one is for.
 *
 * ## What is real here and what is a stand-in
 *
 * REAL: `hideFromAppSwitcher` from `src/platform.ts` and `SettingsWindowHost` from
 * `src/main/settings-window.ts`, both bundled by the driver and `require`d here — so the activation policy is
 * applied by the function the app calls, and the window is created by the module under test with its own
 * `ready-to-show` → `show()` ordering, and its own create-or-focus branch on the second `open()`. REAL:
 * `dist/settings.html` and its preload, loaded exactly as the app loads them.
 *
 * STAND-IN: the overlay, built here with `main.ts`'s `createWindow` options rather than by calling it. It is
 * not decoration — the arms need to know whether ANY window of ours holds key focus, and the overlay is the
 * other candidate. Its traits are copied because two of them (`skipTaskbar`, `alwaysOnTop`) are the ones that
 * would plausibly change activation behaviour if they differed.
 *
 * ## The step that makes any of this mean anything, and the first version of this probe lacked it
 *
 * A freshly launched app is ALREADY the active application — the accessory policy removes the Dock tile and
 * the Cmd-Tab entry, it does not stop `open`/`exec` from activating the process. So the first version opened
 * the settings window seconds after launch, while the app was still active from launching, and the mutated
 * run took focus exactly like the shipped one. It was measuring an app that never needed activating.
 *
 * The real scenario is a background app: the widget has been up for hours, the user is typing somewhere else,
 * and a tray click opens the window. So EVERY phase below hands focus to Finder first and waits until no
 * window of ours is key before it does anything. `deactivated` is reported per phase and graded, because a
 * phase that could not reach that state produces an unattributable reading rather than a wrong one.
 *
 * Finder because it is always running and `tell application "Finder" to activate` needs no Accessibility
 * grant — UI scripting through System Events would prompt for TCC on a host we are borrowing. The driver
 * records the frontmost app before the runs and puts it back afterwards.
 *
 * ## Two phases, because the module has two paths to the same window
 *
 * Phase `first` is a cold `open()`: construct, `ready-to-show`, `show()`. Phase `second` is the
 * create-or-focus branch — the window already exists and is visible, and the module runs `show()`/`focus()`
 * on it. That is the path a second tray click takes, and it is a different mechanism: `show()` on an
 * already-visible window is not the call that ordered it in. Measuring only the cold path would leave the
 * realistic case ungraded, and the two paths do not behave the same under the controls below.
 *
 * ## Timing
 *
 * Activation is not synchronous with `show()`, so focus is sampled every 50 ms for 2 s per phase and what is
 * reported is `everFocused` — true if any sample caught it. A window that activates late still counts; a
 * window that never does cannot be explained by having looked too early. Counters reset immediately after
 * each deactivation, so a reading from a previous phase cannot leak forward.
 *
 * `browser-window-created` is where the focus/blur listeners attach, and it is registered before the overlay
 * is constructed — an earlier version that attached after construction silently missed every overlay edge.
 * The polled samples are the primary evidence and the event trace is the corroboration.
 */

const { app, BrowserWindow, ipcMain } = require("electron")
const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")

const [, , HOST_MODULE, PLATFORM_MODULE, DIST_DIR, FORM_PATH, MODE] = process.argv

const { SettingsWindowHost } = require(HOST_MODULE)
const { hideFromAppSwitcher } = require(PLATFORM_MODULE)

const form = JSON.parse(readFileSync(FORM_PATH, "utf8"))

const observed = {
  mode: MODE,
  logs: [],
  /** `app.dock.isVisible()` after `hideFromAppSwitcher`. The precondition every arm rests on. */
  dockVisible: null,
  /** Did each mutation actually take? Recorded rather than assumed. */
  focusPatched: false,
  showPatched: false,
  /** How many times the shipped code reached `app.focus`. Zero would mean the arms measured something else. */
  focusCalls: 0,
  phases: {},
  /** Window `focus`/`blur` events across the whole run, labelled and in order. */
  focusEvents: [],
  failure: null,
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Reach "we are not the active application", the state the claim is about.
 *
 * Three consecutive unfocused samples rather than one, because the first negative reading can land in the
 * middle of an activation handoff. Failure to reach it is recorded rather than thrown — the driver grades it.
 */
async function deactivate(phase) {
  try {
    execFileSync("osascript", ["-e", 'tell application "Finder" to activate'], { timeout: 10_000 })
  } catch (error) {
    observed.logs.push(`warn: could not activate Finder: ${error instanceof Error ? error.message : String(error)}`)
  }
  let quiet = 0
  for (let i = 0; i < 60; i++) {
    await wait(50)
    phase.deactivateSamples += 1
    quiet = BrowserWindow.getAllWindows().some((w) => w.isFocused()) ? 0 : quiet + 1
    if (quiet >= 3) {
      phase.deactivated = true
      return
    }
  }
}

/** Deactivate, run `act()`, then sample for 2 s. One phase of the experiment. */
async function phase(name, standIn, act) {
  const record = {
    deactivated: false,
    deactivateSamples: 0,
    samples: 0,
    visible: false,
    everFocused: false,
    focusedAtEnd: false,
    overlayEverFocused: false,
  }
  observed.phases[name] = record
  await deactivate(record)
  observed.focusEvents.push(`--${name}--`)

  act()
  const win = BrowserWindow.getAllWindows().find((w) => w !== standIn) ?? null
  if (win === null) throw new Error(`${name}: no settings window`)

  for (let i = 0; i < 40; i++) {
    await wait(50)
    record.samples += 1
    if (win.isVisible()) record.visible = true
    if (win.isFocused()) record.everFocused = true
    if (standIn.isFocused()) record.overlayEverFocused = true
  }
  record.focusedAtEnd = win.isFocused()
}

function main() {
  // The app's own first line after `whenReady`, driven rather than reproduced.
  hideFromAppSwitcher(app, (level, message) => observed.logs.push(`${level}: ${message}`))
  observed.dockVisible = app.dock === undefined ? null : app.dock.isVisible()

  // Counted in every mode. The shipped run must read ZERO — that is the arm guarding the deleted call against
  // quiet reintroduction — and in `with-focus` it confirms the reconstruction is what ran.
  const realFocus = app.focus.bind(app)
  app.focus = (...args) => {
    observed.focusCalls += 1
    return realFocus(...args)
  }

  // The control. `show()` is `makeKeyAndOrderFront` and `showInactive()` is `orderFrontRegardless`, so this
  // swap produces the exact failure the arms are looking for — a window that appears and never takes key —
  // without touching `src/`. If the arms cannot see THIS, they cannot see anything.
  if (MODE === "no-activate" || MODE === "with-focus") {
    BrowserWindow.prototype.show = function patchedShow() {
      return this.showInactive()
    }
    observed.showPatched = true
  }

  // `with-focus` puts the DELETED line back, in the position it occupied — immediately after each `show()` —
  // and under the only condition where it could have mattered, `show()` no longer taking key. This is what
  // keeps the reason for the deletion reproducible from the repo instead of surviving as a claim in a
  // changelog: the restored call activates the app and hands key focus to the wrong window.
  if (MODE === "with-focus") {
    const orderedFront = BrowserWindow.prototype.show
    BrowserWindow.prototype.show = function patchedShowThenFocus() {
      const result = orderedFront.call(this)
      app.focus({ steal: true })
      return result
    }
    observed.focusPatched = true
  }

  // Registered before the construction it observes. The overlay is built first, so the first window to
  // arrive here is it — labelled by order because identity is not available yet, which is the whole point.
  let standIn = null
  app.on("browser-window-created", (_event, win) => {
    const label = standIn === null ? "overlay" : "settings"
    win.on("focus", () => observed.focusEvents.push(`${label}:focus`))
    win.on("blur", () => observed.focusEvents.push(`${label}:blur`))
  })

  // `main.ts`'s `createWindow` options, copied. See the header.
  standIn = new BrowserWindow({
    width: 232,
    height: 260,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: true,
  })
  void standIn.loadURL("about:blank")

  const host = new SettingsWindowHost({
    dir: DIST_DIR,
    log: (level, message) => observed.logs.push(`${level}: ${message}`),
    buildForm: () => form,
    onVisibilityChange: () => {},
    parent: () => standIn,
  })

  ipcMain.on("settings-ready", (event) => host.markReady(event.sender))
  ipcMain.on("settings-edit", () => {})
  ipcMain.on("settings-close", () => host.close())

  void run(host, standIn)
}

async function run(host, standIn) {
  try {
    // Cold open: construct → ready-to-show → show().
    await phase("first", standIn, () => host.open())
    // Create-or-focus: the window is already up, so this is show()/focus() on a live window.
    await phase("second", standIn, () => host.open())
  } catch (error) {
    observed.failure = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  }
  process.stdout.write(`PROBE_RESULT ${JSON.stringify(observed)}\n`)
  app.exit(0)
}

app.whenReady().then(main, (error) => {
  process.stdout.write(`PROBE_RESULT ${JSON.stringify({ failure: String(error) })}\n`)
  app.exit(1)
})
