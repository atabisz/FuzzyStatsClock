/**
 * Electron main process.
 *
 * Two jobs, and they arrived in that order. It began as the **ISC-6 workload** — the real window shape
 * driven by the real telemetry source, whose cost decided whether the port continued — and Phase 3 made
 * it the shell: settings load and save, the tray, per-monitor placement, drag-to-move.
 *
 * The ISC-6 instrumentation is deliberately still here (`PROBE-READY`, `PROBE-PAINTS`,
 * `backgroundThrottling: false`). It is what lets the CPU figure be re-measured against the *current*
 * app rather than against the harness that produced the original number, and Algorithm rule 17 says
 * every one of those greens is void the moment this file changes — which it just did.
 *
 * What is NOT here yet, and where it lands:
 *   - The mac/linux telemetry sources, and per-row stat visibility (Phase 6).
 *   - Auto-launch registration (Phase 7) and auto-contrast (Phase 8).
 *   - **The settings window, which no phase in the plan owns.** Found while wiring the tray: the plan's
 *     component table lists it ("second `BrowserWindow`") but no phase's exit criteria mention it. The
 *     `open-settings` action therefore logs and does nothing, and the plan has been corrected rather
 *     than this file quietly carrying the gap.
 *   - **The hover backdrop and hover fast-refresh, which no phase owned either.** Found the same way as
 *     the wheel gesture below, by reading the C#'s `Window_MouseEnter`/`MouseLeave`: hovering the widget
 *     paints a semi-transparent backdrop behind it and drops the stats interval to 0.5s, and neither the
 *     element nor the interval change exists here. `backdropAlwaysVisible` and `backdropOpacityPercent`
 *     are in `AppSettings` with no reader anywhere. Assigned to Phase 6 in the plan, since the interval
 *     half belongs with that phase's stats work.
 *
 * Ghost mode (Phase 5) is here now: the 33 ms cursor poll and the click-through toggle live in
 * `main/ghost.ts`, the fade itself runs in the renderer (PERF-01), and this process owns only the target.
 *
 * Every tray toggle in between persists its setting NOW, so nothing is lost while those phases land:
 * the state is real and saved, only the visible effect is pending.
 */

import { BrowserWindow, app, ipcMain, screen } from "electron"
import { join } from "node:path"
import { uptime as osUptime } from "node:os"
import { Win32StatsSource } from "./telemetry/win32.js"
import { UNAVAILABLE, type StatsSample, type StatsSource } from "../shared.js"
import {
  IS_WIN,
  applyPlatformWindowTraits,
  forceX11OnLinux,
  hideFromAppSwitcher,
  platformWindowOptions,
} from "../platform.js"
import { SettingsStore } from "./settings-store.js"
import { WindowPlacer, displayGeometries } from "./window-placement.js"
import type { CommitReason } from "./window-placement.js"
import { AppTray } from "./tray.js"
import { GhostDriver } from "./ghost.js"
import { DEFAULTS } from "../core/settings.js"
import type { AppSettings, ClockType } from "../core/settings.js"
import { displayKey, primaryDisplay } from "../core/display-key.js"
import { centreOnPrimary } from "../core/placement.js"
import { resetToDefaults } from "../core/reset.js"
import { shouldOpenContextMenu } from "../core/menu-gate.js"
import { stepOpacity } from "../core/opacity-step.js"
import type { TrayAction, TrayMenuState } from "../core/tray-menu.js"

const REPAINT_MS = 1_000

/**
 * The size the window is CREATED at, and nothing more.
 *
 * `MainWindow.xaml` is `SizeToContent="WidthAndHeight"`, and there is no Electron equivalent — so the
 * real size arrives from the renderer over `resize` as soon as it has measured its own text, which
 * happens on the first settings push and therefore before `ready-to-show`. These two are what the window
 * occupies for the few frames before that, matching `index.html`'s authored `viewBox` so the pre-measured
 * frame is at least self-consistent.
 *
 * 24.7% of the 1536 reachable settings combinations exceed one of these two, so they are a floor rather
 * than a design: the widest reachable face row is 366 and the widest date row 422.24.
 */
const WINDOW_WIDTH = 232
const WINDOW_HEIGHT = 260

/**
 * Directory of this bundle — `dist/`, beside `index.html`, `preload.cjs` and `icon.png`.
 *
 * NOT `app.getAppPath()`. With `main` pointing at `dist/main.js`, Electron already resolves the app
 * path to `dist/`, so `join(getAppPath(), "dist", "index.html")` asks for `dist/dist/index.html`. That
 * failed silently: the transparent window still showed, `ready-to-show` still fired, and only the paint
 * counter revealed it. Resolving against this module's own location is true in both layouts — and
 * inside an asar archive, where `getAppPath()` changes shape again.
 */
const HERE = import.meta.dirname

function log(level: "info" | "warn" | "error", message: string): void {
  process.stdout.write(`[main] ${level} ${message}\n`)
}

/** Must run before `app.whenReady()` — a switch appended after it is ignored. */
forceX11OnLinux(app.commandLine, log)

let source: StatsSource | null = null
let repaintTimer: ReturnType<typeof setInterval> | null = null

/** The single live copy of settings. Every mutation goes through `applySettings`. */
let settings: AppSettings = DEFAULTS
let store: SettingsStore | null = null
let placer: WindowPlacer | null = null
let tray: AppTray | null = null
let mainWindow: BrowserWindow | null = null
let ghost: GhostDriver | null = null

/**
 * Whether the renderer has registered its IPC listeners.
 *
 * `webContents.send` into a renderer that has not yet run `ipcRenderer.on` for that channel is dropped
 * silently, and `applyWindowSettings()` runs during startup — before the renderer has loaded — so the
 * FIRST push is exactly the one that would go missing. The renderer's `ready` message releases the gate.
 */
let rendererReady = false

/**
 * Latest reading, held in main rather than pushed straight through.
 *
 * The source emits on `typeperf`'s schedule and the window repaints on its own; coupling them would
 * make the repaint cadence hostage to a child process's jitter, and would repaint twice when the scalar
 * and GPU children happen to report in the same interval.
 */
const latest: StatsSample = {
  cpu: UNAVAILABLE,
  mem: UNAVAILABLE,
  gpu: UNAVAILABLE,
  pag: UNAVAILABLE,
  battery: UNAVAILABLE,
  pluggedIn: false,
  uptimeSec: 0,
}

/** Paints the renderer has actually completed. Reported so a silent renderer
 *  cannot be mistaken for a cheap one. */
let paints = 0

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
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

  // "screen-saver" rather than plain true: the WPF original is Topmost and stays above a maximised
  // window, and the default "floating" level does not.
  win.setAlwaysOnTop(true, "screen-saver")
  applyPlatformWindowTraits(win, log)

  // Loud on failure. `loadFile` rejects into a warning Electron prints once, and the result is a
  // transparent window with nothing in it — which is visually identical to a working overlay against a
  // dark desktop, and reads as a *cheap* one in any CPU measurement. This fired for real:
  // `dist/dist/index.html`, see HERE above.
  win.webContents.on("did-fail-load", (_e, code, description, url) => {
    log("error", `renderer failed to load ${url}: ${description} (${String(code)})`)
  })

  void win.loadFile(join(HERE, "index.html"))
  return win
}

function trayState(s: AppSettings): TrayMenuState {
  return {
    ghostModeEnabled: s.ghostModeEnabled,
    statsVisible: s.statsVisible,
    autoContrastEnabled: s.autoContrastEnabled,
    autoLaunchEnabled: s.autoLaunchEnabled,
    clockType: s.clockType,
  }
}

/**
 * The one route by which settings change: replace, persist, re-tick the menu.
 *
 * Re-ticking on every mutation is not belt-and-braces on Linux — it is the only thing that keeps the
 * menu honest there, because `main/tray.ts` cannot rebuild on open (no `popUpContextMenu`). Routing
 * every change through here is what stops that from being something a caller can forget.
 */
function applySettings(next: AppSettings, why: string): void {
  settings = next
  const saved = store?.save(settings) ?? false
  tray?.setStateAndRefresh(trayState(settings))
  applyWindowSettings()
  log("info", `settings: ${why}${saved ? "" : " (NOT SAVED)"}`)
}

/**
 * The window's own share of the settings, plus the push that makes the renderer redraw.
 *
 * The renderer gets the whole object rather than a diff — `ApplySettings` re-pushes to every control too,
 * and a diff would need both processes to agree on what changed, which is a second copy of the settings
 * shape on the wire. The ghost sampler is the one consumer that takes named fields instead, because it is
 * a `core/` object with no business knowing what an `AppSettings` is.
 *
 * **This used to call `mainWindow.setOpacity(settings.opacity)` and deliberately no longer does.** That
 * call is `@platform win32,darwin` and documented as doing nothing on Linux (`electron.d.ts:3115-3120`),
 * which would have made the opacity setting silently inert there. The whole `windowOpacity * (1 - ratio)`
 * product now lives in the renderer, on `#root`'s `opacity` attribute — see `core/ghost-fade.ts`.
 *
 * Both callers matter: `applySettings` for a change, and startup for the initial state. Routing both
 * through here is what stops a settings change from reaching the tray and the file but not the screen.
 */
function applyWindowSettings(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  ghost?.applySettings(settings.ghostModeEnabled, settings.ghostFadeRadiusPx, {
    ctrl: settings.useCtrl,
    alt: settings.useAlt,
    shift: settings.useShift,
    win: settings.useWin,
  })
  pushSettings()
}

/** Send the current settings down, once the renderer is listening. See {@link rendererReady}. */
function pushSettings(): void {
  if (!rendererReady || mainWindow === null || mainWindow.isDestroyed()) return
  mainWindow.webContents.send("settings", settings)
}

/**
 * The ghost channel: a fade target, a menu pin, or a reset. Same gate as {@link pushSettings}.
 *
 * Only ever sent when something changed — `GhostDriver.tick` is silent at steady state (D-08), and the
 * pin fires twice per menu. The renderer runs the interpolation itself, so this is a low-rate control
 * channel rather than an animation one, which is the whole of PERF-01's architecture.
 */
function sendGhost(state: { ratio?: number; menuOpen?: boolean; reset?: boolean }): void {
  if (!rendererReady || mainWindow === null || mainWindow.isDestroyed()) return
  mainWindow.webContents.send("ghost", state)
}

/**
 * The renderer measured its content: match the window to it.
 *
 * CSS pixels are DIPs at zoom factor 1, which is the unit `setContentSize` takes — so there is no
 * conversion to do here, and doing one would double-scale on a HiDPI display. `setContentSize` rather than
 * `setSize` because the renderer measured *content*; on this frameless window they are the same number,
 * but only one of them says so by contract.
 *
 * This window is `resizable: false`, and whether that also blocks a programmatic resize varies by
 * platform. Rather than trusting either answer, the size is read back and the flag is toggled only if the
 * first attempt did not take — so the workaround costs nothing where it is unnecessary and leaves a log
 * line where it is.
 */
function onResize(width: number, height: number): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    log("warn", `resize: refusing ${String(width)}x${String(height)}`)
    return
  }
  const want = { width: Math.ceil(width), height: Math.ceil(height) }
  const before = mainWindow.getContentBounds()
  if (before.width === want.width && before.height === want.height) return

  mainWindow.setContentSize(want.width, want.height)
  let after = mainWindow.getContentBounds()
  if (after.width !== want.width || after.height !== want.height) {
    mainWindow.setResizable(true)
    mainWindow.setContentSize(want.width, want.height)
    mainWindow.setResizable(false)
    after = mainWindow.getContentBounds()
    log(
      after.width === want.width && after.height === want.height ? "info" : "error",
      `resize: ${String(want.width)}x${String(want.height)} needed the resizable toggle` +
        ` — now ${String(after.width)}x${String(after.height)}`,
    )
  }
  // Reported on stdout because `probe-display.ts` needs to see that the window followed the content, and
  // the DOM it reads over CDP cannot tell it what the OS window ended up as.
  process.stdout.write(`PROBE-SIZE ${String(after.width)} ${String(after.height)}\n`)
  // The window just changed size, so a position that was inside the work area may no longer be. This is
  // the same re-clamp a display change gets, for the same reason.
  commitPlacement("display-change")
}

/**
 * Persist the window's position after it moves. Returns whether anything was written.
 *
 * The `changed` check matters more than it looks: a display-metrics event fires several times for one
 * physical change (Windows sends one per display, plus one for the work-area recalculation), and
 * writing the settings file on each would turn a monitor being switched on into five file writes.
 */
function commitPlacement(reason: CommitReason): boolean {
  if (placer === null) return false
  const update = placer.commit(settings, reason)
  if (!update.changed) return false
  applySettings(
    { ...settings, monitorPositions: update.monitorPositions, lastActiveMonitor: update.lastActiveMonitor },
    `placement committed (${reason}) on ${update.lastActiveMonitor}` +
      (update.removedKey === null ? "" : ` — dropped ${update.removedKey}`),
  )
  return true
}

// ---------------------------------------------------------------------------------------------------
// Drag-to-move
// ---------------------------------------------------------------------------------------------------

/**
 * Why this is hand-rolled instead of `-webkit-app-region: drag`.
 *
 * The CSS drag region is one line and would work — but the window it produces is dropped wherever the
 * cursor was released, with no callback and no chance to snap or clamp. ISC-20 requires the window to
 * stay inside the target display's work area, and `SnapToEdge` requires an 8px edge snap on release.
 * Neither is reachable from a drag Electron performs internally, so the drag is ours.
 *
 * Coordinates come from `screen.getCursorScreenPoint()` in main rather than from the renderer's
 * `MouseEvent.screenX/Y`. Both are DIPs, but the renderer's are relative to the display the window is
 * on, and this desk has a display at a negative x — so a drag across the seam would jump. Reading the
 * cursor in main keeps the anchor and the current point in one coordinate space by construction.
 */
interface DragAnchor {
  readonly cursor: { x: number; y: number }
  readonly window: { x: number; y: number }
}

let dragAnchor: DragAnchor | null = null

/** RMB-02's input: a right-click during a drag opens no menu. */
function isDragging(): boolean {
  return dragAnchor !== null
}

function onDragStart(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  dragAnchor = { cursor: screen.getCursorScreenPoint(), window: { x: bounds.x, y: bounds.y } }
}

function onDragMove(): void {
  if (dragAnchor === null || mainWindow === null || mainWindow.isDestroyed()) return
  const now = screen.getCursorScreenPoint()
  // Unclamped on purpose. `DragMove` lets a WPF user drag the widget anywhere, including straddling two
  // monitors; clamping per frame would make the window stick at an edge while the cursor kept going,
  // which feels broken. The clamp is on release, where the C# also does its work.
  mainWindow.setPosition(
    dragAnchor.window.x + (now.x - dragAnchor.cursor.x),
    dragAnchor.window.y + (now.y - dragAnchor.cursor.y),
  )
}

function onDragEnd(): void {
  if (dragAnchor === null) return
  dragAnchor = null
  commitPlacement("drag")
}

// ---------------------------------------------------------------------------------------------------
// Tray actions
// ---------------------------------------------------------------------------------------------------

const CLOCK_TYPE_ACTIONS: Readonly<Record<string, ClockType>> = {
  "set-clock-type:phrase": "phrase",
  "set-clock-type:dial": "dial",
  "set-clock-type:lcd": "lcd",
  "set-clock-type:nixie": "nixie",
}

/**
 * `ResetToDefaults`: 27 fields back to their reset values, the saved positions cleared, and the window
 * centred on the primary display.
 *
 * The order is the C#'s and it is load-bearing. The window is moved FIRST, then the settings are
 * replaced, then the new position is committed — so the single entry the commit writes is keyed to the
 * primary display the reset just centred on. Replacing the settings first would commit against a
 * `lastActiveMonitor` that has no stored position, which `resolveStartPosition` reads as first-run.
 */
function onResetToDefaults(): void {
  const displays = displayGeometries(screen)
  const primary = primaryDisplay(displays)
  if (primary === null || mainWindow === null || mainWindow.isDestroyed()) {
    log("warn", "reset: no primary display or no window — settings reset, position left alone")
    applySettings(resetToDefaults(settings, settings.lastActiveMonitor), "reset to defaults (position kept)")
    return
  }
  const bounds = mainWindow.getBounds()
  const centre = centreOnPrimary(primary.bounds, bounds.width, bounds.height)
  mainWindow.setPosition(Math.round(centre.left), Math.round(centre.top))
  applySettings(resetToDefaults(settings, displayKey(primary)), "reset to defaults")
  commitPlacement("reset")
}

function handleTrayAction(action: TrayAction): void {
  const clockType = CLOCK_TYPE_ACTIONS[action]
  if (clockType !== undefined) {
    applySettings({ ...settings, clockType }, `clockType = ${clockType}`)
    return
  }
  switch (action) {
    case "open-settings":
      // No settings window exists. See the header: the plan lists the component but assigns it to no
      // phase. Logged rather than silently ignored, so a click produces evidence.
      log("warn", "tray: Open Settings — no settings window yet; the plan does not assign one to a phase")
      return
    case "toggle-ghost-mode":
      applySettings(
        { ...settings, ghostModeEnabled: !settings.ghostModeEnabled },
        `ghostModeEnabled = ${String(!settings.ghostModeEnabled)}`,
      )
      return
    case "toggle-stats":
      applySettings(
        { ...settings, statsVisible: !settings.statsVisible },
        // The panel obeys this now. What Phase 6 adds is per-ROW visibility and the platform sources
        // behind the numbers — so a toggle today shows a panel of `--`s on macOS and Linux.
        `statsVisible = ${String(!settings.statsVisible)}`,
      )
      return
    case "toggle-auto-contrast":
      applySettings(
        { ...settings, autoContrastEnabled: !settings.autoContrastEnabled },
        `autoContrastEnabled = ${String(!settings.autoContrastEnabled)} (takes effect in Phase 8)`,
      )
      return
    case "toggle-auto-launch":
      // The setting is persisted here and the login item is registered in Phase 7 (ISC-30). Split on
      // purpose: the C# also keeps the two apart (`_autoLaunchEnabled` and `AutoLaunchService`), and a
      // tick that survives a restart with no registration is a visible, findable inconsistency —
      // whereas registering without persisting would be an invisible one.
      applySettings(
        { ...settings, autoLaunchEnabled: !settings.autoLaunchEnabled },
        `autoLaunchEnabled = ${String(!settings.autoLaunchEnabled)} (registration lands in Phase 7)`,
      )
      return
    case "reset-defaults":
      onResetToDefaults()
      return
    case "about":
      tray?.showAbout(app.getVersion())
      return
    case "quit":
      app.quit()
      return
  }
}

// ---------------------------------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------------------------------

app.whenReady().then(() => {
  hideFromAppSwitcher(app, log)

  ipcMain.on("painted", () => {
    paints++
  })
  ipcMain.on("ready", () => {
    rendererReady = true
    pushSettings()
    log("info", "renderer: ready — settings pushed")
  })
  // Validated rather than destructured straight: this is a process boundary, and a malformed payload
  // reaching `setContentSize` is a thrown exception in the main process, which takes the whole app down.
  ipcMain.on("resize", (_event, payload: unknown) => {
    if (typeof payload !== "object" || payload === null) return
    const { width, height } = payload as { width?: unknown; height?: unknown }
    if (typeof width !== "number" || typeof height !== "number") return
    onResize(width, height)
  })
  ipcMain.on("drag-start", onDragStart)
  ipcMain.on("drag-move", onDragMove)
  ipcMain.on("drag-end", onDragEnd)
  ipcMain.on("context-menu", () => {
    // The idempotence guard first, and it is `Window_PreviewMouseRightButtonUp`'s own order: the C# tests
    // `_menuOpen` BEFORE the gate, so a second right-click while the menu is up is a no-op rather than a
    // re-open that repositions an already-visible menu (Pitfall 7's flicker).
    if (tray?.isMenuOpen === true) return
    // RMB-02 / RMB-03, now with both real inputs. Note what RMB-03 can and cannot do here: on Windows the
    // C# says this handler never fires while click-through is applied, because the OS routes the click
    // past the window entirely — so the `isGhostActive` arm is defensive on that platform too, and its
    // value is that it is *true* rather than a literal, so the two RMB claims are answered by state.
    if (shouldOpenContextMenu(isDragging(), ghost?.isActive ?? false, ghost?.isModifierHeld ?? false)) {
      tray?.popUp()
    }
  })
  // The wheel gesture, which no phase owned. See `core/opacity-step.ts` for how it was found and for the
  // sign inversion between `WheelEvent.deltaY` and WPF's `e.Delta`. Validated at the boundary like
  // `resize` is: this is a process boundary and a malformed payload reaching arithmetic is a main-process
  // exception, which takes the whole app down rather than dropping one scroll.
  ipcMain.on("adjust-opacity", (_event, payload: unknown) => {
    if (typeof payload !== "number" || !Number.isFinite(payload)) return
    const next = stepOpacity(settings.opacity, payload)
    if (next === settings.opacity) return
    applySettings({ ...settings, opacity: next }, `opacity = ${next.toFixed(2)} (wheel)`)
  })

  // Settings BEFORE the window: `restore()` runs before `show()`, so the saved position has to be in
  // hand by then, and the displays the import matches positions against are needed here too.
  store = new SettingsStore({
    userDataDir: app.getPath("userData"),
    displays: displayGeometries(screen),
    log,
  })
  const loaded = store.load()
  settings = loaded.settings
  log("info", `settings: loaded from ${loaded.origin} (${store.path})`)

  const win = createWindow()
  mainWindow = win
  placer = new WindowPlacer(win, screen, log)
  const restored = placer.restore(settings)

  // BEFORE `applyWindowSettings()`, which is what hands the driver its enabled flag, radius and modifier
  // config. Constructed after `restore()` for a smaller reason that is still real: the first tick reads
  // `getBounds()`, and restoring the saved position first means that read is against where the widget
  // actually is rather than against the primary display's top-right default.
  //
  // `screen` is passed as the cursor source and `win` as the window: both satisfy `main/ghost.ts`'s
  // structural interfaces, which is what lets the driver be tested with no Electron on the path.
  ghost = new GhostDriver({
    window: win,
    cursor: screen,
    // Target only. The renderer owns the interpolation — PERF-01, and the reason a busy main process
    // delays where the fade is going rather than how smoothly it gets there.
    onRatio: (ratio) => sendGhost({ ratio }),
    onRestored: () => sendGhost({ reset: true }),
    log,
  })
  ghost.start()
  applyWindowSettings()

  // The first write after a WPF import, and it happens only once the window is placed. Two reasons,
  // both from `settings-store.ts`'s own note: until this point the WPF file is still the only copy of
  // the user's configuration, and the key the import produced may not resolve — `restore()` is what
  // turns it into one that does. `commitPlacement` writes both the resolved key and the clamped
  // position, so a `display5`-keyed orphan becomes a real entry on the display it recovered onto.
  if (loaded.origin === "wpf-import" || restored.clamped || restored.source !== "key") {
    commitPlacement("display-change")
  }

  tray = new AppTray({
    iconPath: join(HERE, "icon.png"),
    initialState: trayState(settings),
    onAction: handleTrayAction,
    log,
    // RMB-04. The pin travels to the renderer because that is where the fade is; main only relays it.
    onMenuOpenChange: (open) => sendGhost({ menuOpen: open }),
  })

  // One handler for all three display events. Windows fires `display-metrics-changed` several times for
  // a single change and `commitPlacement` returns early when nothing moved, so the duplicates cost a
  // bounds read rather than a file write.
  const onDisplayChange = (): void => {
    log("info", `displays: ${String(screen.getAllDisplays().length)} attached — re-clamping`)
    commitPlacement("display-change")
  }
  screen.on("display-added", onDisplayChange)
  screen.on("display-removed", onDisplayChange)
  screen.on("display-metrics-changed", onDisplayChange)

  win.once("ready-to-show", () => {
    win.show()
    log("info", `window shown, transparent+topmost, paints will follow at ${String(REPAINT_MS)}ms`)
    process.stdout.write(`PROBE-READY pid=${String(process.pid)}\n`)
  })

  if (IS_WIN) {
    const win32 = new Win32StatsSource({ intervalSec: 1, recycleMs: 30_000, log })
    source = win32
    log("info", `telemetry: ${win32.describe()}`)
    win32.start((sample) => Object.assign(latest, sample))
  } else {
    // macOS and Linux sources are Phase 6. Stated rather than silently skipped: an ISC-6 figure
    // measured with no telemetry attached is not the workload.
    log("warn", `telemetry: no source implemented for ${process.platform} — stats will read as --`)
  }

  repaintTimer = setInterval(() => {
    // `os.uptime()`, not `process.uptime()`. The harness used the process's own uptime, which shows
    // "up 2m" after an app restart where the WPF app shows "up 3d": `UpdateUptimeDisplay` reads
    // `Environment.TickCount64`, milliseconds since BOOT. `os.uptime()` is that same counter
    // (`GetTickCount64` on Windows), in seconds. One of Phase 6's 15 cells, paid early because it is a
    // wrong number on screen rather than a missing one.
    latest.uptimeSec = Math.floor(osUptime())
    if (!win.isDestroyed()) win.webContents.send("stats", latest)
  }, REPAINT_MS)

  // Paint count on a slow cadence, so the probe can read it out of stdout without the reporting itself
  // becoming a measurable cost.
  setInterval(() => process.stdout.write(`PROBE-PAINTS ${String(paints)}\n`), 5_000)
})

// The tray is the app now, so a closed window is not an exit — and on macOS it never was. Left as an
// explicit quit rather than removed: with `skipTaskbar` and no dock icon there is no way for a user to
// close this window, so reaching here means something else closed it and quitting is the honest answer.
app.on("window-all-closed", () => app.quit())

app.on("before-quit", () => {
  if (repaintTimer) clearInterval(repaintTimer)
  // The cursor poll before the window goes away: its tick reads `getBounds()` and calls
  // `setIgnoreMouseEvents`, and `isDestroyed()` is checked per tick, so this is tidiness rather than a
  // crash guard — but a 33 ms timer left running through teardown is 30 chances a second to be wrong about
  // that ordering.
  ghost?.stop()
  // Without this the `typeperf` children outlive the app: they are spawned by this process but nothing
  // reparents or reaps them on exit.
  source?.stop()
  tray?.destroy()
})
