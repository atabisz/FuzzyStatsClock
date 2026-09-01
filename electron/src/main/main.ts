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
 *   - Auto-contrast (Phase 8).
 *
 * The settings window is here now, and the way it got here is worth keeping: it was found while wiring the
 * tray, because the plan's component table listed it ("second `BrowserWindow`") while no phase's exit
 * criteria mentioned it. That gap became Phase 6.5 rather than a comment in this file. Its window lifetime
 * lives in `main/settings-window.ts`; the form itself is `core/settings-form.ts`, which has no Electron on
 * its path, so the whole 1536-combination control surface is driven by `bun test` and this file only hosts
 * it.
 *
 * Hover is here now — it was the other thing no phase owned, found the same way as the wheel gesture
 * below, by reading the C#'s `Window_MouseEnter`/`MouseLeave`. Both halves are wired: the backdrop travels
 * down the `backdrop` channel and the fast refresh is {@link applyStatsInterval}'s. **One divergence
 * remains and it is deliberate:** the C# `Stop()`s its stats timer when the panel is collapsed
 * (`SetStatsVisible`:1408), so `_statsTimer.IsEnabled` and "the panel is visible" are the same fact there.
 * The port's source runs regardless, so {@link statsRunning} answers the question the C# asks — which keeps
 * hover's behaviour identical — while the port still pays to sample a panel nobody can see. That cost is a
 * plan item, not a hover one.
 *
 * Ghost mode (Phase 5) is here now: the 33 ms cursor poll and the click-through toggle live in
 * `main/ghost.ts`, the fade itself runs in the renderer (PERF-01), and this process owns only the target.
 *
 * Every tray toggle in between persists its setting NOW, so nothing is lost while those phases land:
 * the state is real and saved, only the visible effect is pending.
 *
 * Phase 7 added the two things that reach outside this process: `main/auto-launch.ts` writes the login item
 * (three sinks, one contract) and `main/update-check.ts` asks GitHub once per launch. Both are constructed
 * with injected seams — a process runner, a file writer, a `fetch` — so both are driven by tests and probes
 * with no Electron on the path, and this file is the only place either one meets a real OS.
 */

import { BrowserWindow, app, ipcMain, powerMonitor, screen } from "electron"
import { join } from "node:path"
import { homedir, uptime as osUptime } from "node:os"
import { Win32StatsSource } from "./telemetry/win32.js"
import { DarwinStatsSource } from "./telemetry/darwin.js"
import { LinuxStatsSource } from "./telemetry/linux.js"
import { HOVER_INTERVAL_SEC, hoverEnter, hoverLeave, type GhostHoverState } from "../core/hover.js"
import { isHoverFastRefresh, pushCpuSample, uptimeLine } from "../core/load-average.js"
import { formatUptime } from "../core/uptime.js"
import { UNAVAILABLE, type StatsSample, type StatsSource } from "../shared.js"
import {
  IS_LINUX,
  IS_MAC,
  IS_WIN,
  applyPlatformWindowTraits,
  forceX11OnLinux,
  hideFromAppSwitcher,
  platformWindowOptions,
} from "../platform.js"
import { SettingsStore } from "./settings-store.js"
import { AutoLaunch, autoLaunchExePath, type AutoLaunchPlatform } from "./auto-launch.js"
// `processRunner`/`fileSeam` live in their own module so `scripts/probe-autolaunch.ts` can drive the SAME
// adapters this app uses. See `main/seams.ts`.
import { fileSeam, processRunner } from "./seams.js"
import { UpdateChecker, shouldOfferUpdate, updateNoticeText } from "./update-check.js"
import { WindowPlacer, displayGeometries } from "./window-placement.js"
import type { CommitReason } from "./window-placement.js"
import { AppTray } from "./tray.js"
import { GhostDriver, STALE_CURSOR_RESTORE_TICKS } from "./ghost.js"
import { X11CursorSource } from "./x11-cursor.js"
import { SettingsWindowHost } from "./settings-window.js"
import { applySettingsEdit, buildSettingsForm, isEditableField } from "../core/settings-form.js"
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

/**
 * The interval the source is ACTUALLY sampling at, as it reported.
 *
 * Not `settings.statsIntervalSeconds`, and the difference is load-bearing rather than pedantic: on Windows
 * `typeperf -si` takes whole seconds, so a legal fractional setting and the entire 0.5s hover fast-refresh
 * are declined outright. This value is what `core/load-average.ts` must count its 1/5/15-minute windows
 * against, because those windows are measured in SAMPLES.
 */
let adoptedIntervalSec = DEFAULTS.statsIntervalSeconds

/**
 * What the source adopted for the CONFIGURED interval, with no hover in play.
 *
 * The baseline the hover fast-refresh is judged against, and it is not `settings.statsIntervalSeconds`
 * for the reason {@link isHoverFastRefresh} gives at length: on Windows a fractional setting is declined
 * outright, so the setting and the cadence differ with no cursor anywhere near the widget.
 */
let baselineIntervalSec = DEFAULTS.statsIntervalSeconds

/**
 * The rolling CPU queue behind the uptime line's three averages, capped at 15 minutes of samples.
 *
 * In main rather than in the renderer because the cap and the window widths are counted in SAMPLES against
 * {@link adoptedIntervalSec} — a number only main knows, since only main gets `setIntervalSec`'s return
 * value. Pushed from `source.start`'s callback rather than from the repaint timer, because those are
 * different clocks: the repaint runs at `REPAINT_MS` regardless of what the source is doing, and averaging
 * a repaint schedule would describe the window rather than the machine.
 */
let cpuSamples: readonly number[] = []

/**
 * Whether the cursor is over the widget, as far as the stats cadence is concerned.
 *
 * Distinct from the ghost driver's own cursor tracking: this one is set from the renderer's pointer events
 * and only when `core/hover.ts` returned an interval to move to — so it is "a hover the app acted on the
 * cadence for" rather than "the cursor is nearby". Both gates matter: ghost mode without the modifier makes
 * an enter a no-op entirely, and a collapsed stats panel makes it a backdrop-only one.
 */
let hovering = false

/** The single live copy of settings. Every mutation goes through `applySettings`. */
let settings: AppSettings = DEFAULTS
let store: SettingsStore | null = null
let placer: WindowPlacer | null = null
let tray: AppTray | null = null
let mainWindow: BrowserWindow | null = null
let ghost: GhostDriver | null = null
let x11Cursor: X11CursorSource | null = null
let autoLaunch: AutoLaunch | null = null
let updateChecker: UpdateChecker | null = null
let settingsWindow: SettingsWindowHost | null = null

/**
 * The notice text, held until the renderer is listening.
 *
 * Same hazard as {@link rendererReady} guards for settings, and it is not theoretical here: the check is
 * dispatched from `ready-to-show` and answers up to five seconds later, so it can land at any point — and a
 * `webContents.send` on a channel with no listener is dropped with no error on either side. Holding the
 * text means the ordering question has one answer instead of two.
 */
let pendingUpdateText: string | null = null

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
  // Overwritten on the first repaint tick, before any send. `index.html` ships "up —" as the node's own
  // initial text, so this value never reaches the glass — but it must not be a plausible-looking line.
  uptimeText: "",
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
 * Build the telemetry source for this platform.
 *
 * All three exist now, so there is no "no source implemented" branch left and the `N/A` fallback is a
 * *per-metric* property rather than a per-platform one: every source emits {@link UNAVAILABLE} for a metric
 * its host cannot answer, and the renderer's existing `-1` path draws it.
 *
 * The interval is deliberately NOT passed to the constructors. Every source is constructed at its own default
 * and then asked, once, through {@link StatsSource.setIntervalSec} — because that is the call whose *return
 * value* says what was actually adopted, and a constructor cannot report a decline. The bug this replaces is
 * worth naming: this seam used to read `new Win32StatsSource({ intervalSec: 1, ... })` against a
 * `DEFAULTS.statsIntervalSeconds` of `2.0`, so the port sampled at twice the original's rate and the interval
 * setting had **no reader anywhere in the app**. `test/hover.test.ts` found it, by asserting the default.
 */
function createStatsSource(): StatsSource {
  if (IS_WIN) {
    return new Win32StatsSource({
      recycleMs: 30_000,
      log,
      // The parity read for the plug flag, and it is free. `PowerStatus.PowerLineStatus` in the C# and
      // `isOnBatteryPower()` here are both `GetSystemPowerStatus`'s `ACLineStatus` byte. Injected rather than
      // imported inside the telemetry module so that module still loads under plain `bun` — `probe-battery.ts`
      // depends on that, and running it without this reader is also how the CIM fallback gets exercised.
      readAcLine: () => !powerMonitor.isOnBatteryPower(),
    })
  }
  if (IS_MAC) return new DarwinStatsSource({ log })
  return new LinuxStatsSource({ log })
}

/**
 * Push the configured cadence at the source, and remember what it agreed to.
 *
 * Called on startup and from {@link applySettings}, and it takes the hover state into account rather than
 * blindly writing the configured value: a settings change while the cursor rests on the widget would
 * otherwise cancel the hover fast-refresh and leave nothing to restore it, because
 * {@link hoverLeave} is what puts the configured interval back and it will not fire again until the cursor
 * leaves and re-enters.
 *
 * The C# does clobber it — `ApplySettings` writes `_statsTimer.Interval` unconditionally — so this is a
 * divergence, and a deliberate one: it is invisible except in the case the original gets wrong.
 */
function applyStatsInterval(why: string): void {
  if (source === null) return
  const wanted = hovering ? HOVER_INTERVAL_SEC : settings.statsIntervalSeconds
  const adopted = source.setIntervalSec(wanted)
  // Before the early return, and only on the non-hover path: this is the value the load averages judge a
  // fast-refresh against, so it has to track a settings change that the source happens to adopt at the
  // cadence already running. A settings change made DURING a hover leaves it briefly stale, which is
  // harmless — the answer it gives while hovering is "yes, fast-refreshing", which is true either way, and
  // `hoverLeave` refreshes it on the way out.
  if (!hovering) baselineIntervalSec = adopted
  if (adopted === adoptedIntervalSec) return
  adoptedIntervalSec = adopted
  log("info", `telemetry: cadence now ${String(adopted)}s (asked ${String(wanted)}s, ${why})`)
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
  // After `applyWindowSettings`, because a cadence change can respawn children on Windows and there is no
  // reason to make the window's own redraw wait behind that.
  applyStatsInterval(why)
  // `RefreshControls(GetCurrentSettingsSnapshot())` — here rather than at the settings window's own edit
  // handler, because the tray changes settings too (clock type, ghost mode, stats, auto-contrast,
  // auto-launch, reset) and the C# refreshes the open window from all of those paths. Routing it through the
  // single mutation route is what makes "the window can go stale" unrepresentable rather than remembered.
  // A no-op when no window is open.
  settingsWindow?.push()
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
function sendGhost(state: {
  ratio?: number
  menuOpen?: boolean
  settingsOpen?: boolean
  reset?: boolean
}): void {
  if (!rendererReady || mainWindow === null || mainWindow.isDestroyed()) return
  mainWindow.webContents.send("ghost", state)
}

/**
 * Paint or clear the hover backdrop. A boolean, not a colour — `src/preload.ts` has that argument.
 *
 * No gate on `backdropAlwaysVisible` here: `core/hover.ts` already returns `null` for the leave that must
 * not clear, and the renderer's own fill function reads the setting too. Two readers of one setting, and
 * that is on purpose — this one decides *whether a message is sent* and that one decides *what a painted
 * backdrop looks like*. Folding them would make the always-visible case depend on a message arriving.
 */
function sendBackdrop(painted: boolean): void {
  if (!rendererReady || mainWindow === null || mainWindow.isDestroyed()) return
  mainWindow.webContents.send("backdrop", painted)
}

/** The three `GhostDriver` getters `core/hover.ts`'s rules read. No driver yet reads as "not enabled". */
function ghostHoverState(): GhostHoverState {
  return {
    enabled: settings.ghostModeEnabled,
    modifierHeld: ghost?.isModifierHeld ?? false,
    active: ghost?.isActive ?? false,
  }
}

/**
 * `_statsTimer != null && _statsTimer.IsEnabled`, which in the C# is the same fact as the panel being
 * visible — `SetStatsVisible` starts and stops the timer with it (:1389/:1408).
 *
 * So this reads `statsVisible` rather than `source !== null` alone, even though the port's source keeps
 * running while the panel is collapsed. Reading only the source would give a collapsed panel a hover
 * fast-refresh the original does not have, and the fast refresh exists to make *visible* numbers move.
 */
function statsRunning(): boolean {
  return source !== null && settings.statsVisible
}

/**
 * `Window_MouseEnter` / `Window_MouseLeave`, from the renderer's `pointerenter`/`pointerleave`.
 *
 * The rules and every asymmetry between the two edges live in `core/hover.ts`; this function is the wiring
 * and holds no policy. Three things about it are worth knowing:
 *
 *   - **`hovering = inside`, not `effect.intervalSec === HOVER_INTERVAL_SEC`.** Deriving the flag from the
 *     number looks tidier and is wrong: `statsIntervalSeconds` may legitimately BE 0.5, and a leave would
 *     then set `hovering` true. The effect's interval is read as a *whether*, and {@link applyStatsInterval}
 *     stays the single writer of the cadence — it is also what `applySettings` calls.
 *   - **`effect.fastRefreshFlag` is deliberately ignored.** The port derives that fact from what the source
 *     *accepted* rather than from the cursor, because on Windows `typeperf -si` declines 0.5s outright.
 *     `core/hover.ts`'s header carries the whole argument, and the C#'s own flag is asymmetric anyway.
 *   - A gated-out enter (ghost mode on, no modifier) reaches here and does nothing at all. That is the
 *     original's behaviour, not a dropped message.
 */
function onHover(inside: boolean): void {
  const effect = inside
    ? hoverEnter(ghostHoverState(), statsRunning())
    : hoverLeave(
        ghostHoverState(),
        statsRunning(),
        settings.backdropAlwaysVisible,
        settings.statsIntervalSeconds,
      )
  if (effect.backdrop !== null) sendBackdrop(effect.backdrop === "paint")
  if (effect.intervalSec !== null) {
    hovering = inside
    applyStatsInterval(inside ? "hover enter" : "hover leave")
  }
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
// Auto-launch and the update check
// ---------------------------------------------------------------------------------------------------

/**
 * `process.platform` narrowed to the three sinks, with linux as the fallback.
 *
 * The same shape {@link createStatsSource} uses, and for the same reason: an unknown platform gets the
 * POSIX path rather than a thrown error, because a freebsd host with an XDG desktop is far better served by
 * a `.desktop` file that might work than by an app that will not start.
 */
function autoLaunchPlatform(): AutoLaunchPlatform {
  if (process.platform === "win32") return "win32"
  if (process.platform === "darwin") return "darwin"
  return "linux"
}

/**
 * Register or unregister the login item to match a setting, and log what happened.
 *
 * Fire-and-forget from the caller's point of view -- `handleTrayAction` is synchronous and the C#'s
 * equivalent is a synchronous registry write, so making the tray wait on a spawned `reg.exe` would be a
 * behaviour the original does not have. The failure path is a log line rather than a revert: the setting is
 * the user's choice and it has already been persisted, and silently un-ticking the menu because a registry
 * write failed would hide the failure behind something that looks like the click not registering.
 */
function syncAutoLaunch(enabled: boolean): void {
  const service = autoLaunch
  if (service === null) return
  void (enabled ? service.enable() : service.disable()).then(
    (ok) => {
      if (!ok) log("error", `auto-launch: could not ${enabled ? "register" : "unregister"} ${service.describe()}`)
    },
    (error: unknown) => {
      log("error", `auto-launch: ${enabled ? "register" : "unregister"} threw — ${String(error)}`)
    },
  )
}

/** Push the notice down, or hold it until the renderer says `ready`. See {@link pendingUpdateText}. */
function sendUpdate(text: string): void {
  if (!rendererReady || mainWindow === null || mainWindow.isDestroyed()) {
    pendingUpdateText = text
    log("info", `update: notice held until the renderer is listening — "${text}"`)
    return
  }
  pendingUpdateText = null
  mainWindow.webContents.send("update", text)
  log("info", `update: notice shown — "${text}"`)
}

/**
 * `KickoffUpdateCheck` (`MainWindow.xaml.cs:1312-1334`): check once, and show a notice only if the release
 * is strictly newer than what is running.
 *
 * The C# posts this at `DispatcherPriority.ApplicationIdle` so the check never delays the first frame; the
 * port dispatches it from `ready-to-show`, after `win.show()`, which is the same intent through the event
 * this process actually has. Not awaited, and nothing waits on it: a 5-second network call on the startup
 * path would be 5 seconds of no clock.
 *
 * `settings.updateChecksEnabled` is read HERE rather than inside the checker, which is the C#'s own split
 * (`:207-210` constructs the service unconditionally and gates the kickoff) -- so a disabled check leaves a
 * live object whose `cancelInFlight` is still safe to call at teardown.
 */
function kickoffUpdateCheck(): void {
  const checker = updateChecker
  if (checker === null) return
  if (!settings.updateChecksEnabled) {
    log("info", "update: checks disabled by settings — not dispatching")
    return
  }
  void checker.check().then(
    (latestRelease) => {
      if (latestRelease === null) return
      const running = app.getVersion()
      if (!shouldOfferUpdate(running, latestRelease)) {
        log("info", `update: ${updateNoticeText(latestRelease)} is not newer than ${running}`)
        return
      }
      sendUpdate(updateNoticeText(latestRelease))
    },
    // Unreachable by contract -- `check()` catches everything and answers null -- and logged rather than
    // left to become an unhandled rejection if that contract is ever broken by an edit.
    (error: unknown) => {
      log("error", `update: check rejected — ${String(error)}`)
    },
  )
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
 *
 * **The login item is unregistered here, unconditionally, and that is `core/reset.ts`'s "the caller's job".**
 * `autoLaunchEnabled: false` is in `RESET_FIELDS`, so without this call a reset would leave the tick off and
 * the Run entry in place — an app that still starts at login with nothing in the UI saying so. Unconditional
 * rather than gated on the previous value, because `AutoLaunchService.Disable()` is unconditional in the C#
 * and `disable()` is a no-op when nothing is registered.
 */
function onResetToDefaults(): void {
  syncAutoLaunch(false)
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

// ---------------------------------------------------------------------------------------------------
// The settings window
// ---------------------------------------------------------------------------------------------------

/**
 * One control changed in the settings window.
 *
 * This function is `OpenSettings`' 47 `+=` handlers collapsed into one, and the collapse is only sound
 * because two things were separated first: `core/settings-form.ts` owns which fields exist and what values
 * they accept, and {@link applySettings} owns everything that happens after a field changes. What is left
 * here is the residue — the three edits whose consequence reaches outside this process, which the C# also
 * writes out longhand for the same reason.
 *
 * `applySettingsEdit` returning null is the boundary check. It is not defensive: the payload arrives from a
 * renderer, and every value on the wire is `unknown` because the DOM hands back strings — so a `"0.85"` that
 * must become `0.85`, an off-ladder radio, and a field that does not exist all arrive by the same route as a
 * legitimate change. Rejection re-pushes rather than staying silent, so the control snaps back to the truth.
 */
function onSettingsEdit(id: string, value: unknown): void {
  const result = applySettingsEdit(settings, { id, value })
  if (result === null) {
    // The two failures are worth telling apart: an unknown field means the renderer and `EDITABLE_FIELDS`
    // have diverged (a build problem), a rejected value means the payload was malformed (a wire problem).
    const why = isEditableField(id) ? "bad value for" : "unknown field"
    log("warn", `settings window: rejected — ${why} ${id} (${JSON.stringify(value) ?? "undefined"})`)
    settingsWindow?.push()
    return
  }

  applySettings(result.settings, `${id} (settings window)`)

  // Unticking the last visible metric row collapses the whole panel — `SetStatRowVisible`'s own behaviour,
  // and a surprise worth a line in the log because the master checkbox appears to change on its own. The
  // window already shows the truth: `applySettings` pushed the rebuilt form above.
  if (result.collapsed) log("info", "settings: last stats row hidden — panel collapsed")

  // NOT a `commitPlacement()` call, and the C# is explicit about why: `SetStatsVisible:1392-1404` calls
  // `UpdateLayout()` *before* clamping, because "ActualHeight is stale until layout runs". The port's layout
  // runs in the renderer, so the fresh height arrives on the `resize` channel — and `onResize` already
  // re-clamps with exactly this reason. Clamping here would clamp against the pre-growth size, which is the
  // stale-height defect that C# comment exists to prevent.
  if (result.reclamp) log("info", "settings: panel grew — re-clamp arrives with the renderer's resize")

  // The two edits with a consequence outside this process. Both mirror their tray counterparts: the setting
  // is persisted FIRST and the OS is told second, so a failed registry write leaves a tick that disagrees
  // with the OS rather than an OS that disagrees with nothing visible.
  if (id === "autoLaunchEnabled") syncAutoLaunch(result.settings.autoLaunchEnabled)
  // PERS-10, and `cancelInFlight`'s second caller — `before-quit`'s comment named this exact path as
  // unreachable-rather-than-missing. A check dispatched at startup can still be in flight when the user
  // unticks the box, and the notice it would deliver is one the user has just said they do not want.
  if (id === "updateChecksEnabled" && !result.settings.updateChecksEnabled) {
    updateChecker?.cancelInFlight()
  }
}

function handleTrayAction(action: TrayAction): void {
  const clockType = CLOCK_TYPE_ACTIONS[action]
  if (clockType !== undefined) {
    applySettings({ ...settings, clockType }, `clockType = ${clockType}`)
    return
  }
  switch (action) {
    case "open-settings":
      settingsWindow?.open()
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
        // behind the numbers — so a toggle today shows a panel of `N/A`s on macOS and Linux.
        `statsVisible = ${String(!settings.statsVisible)}`,
      )
      return
    case "toggle-auto-contrast":
      applySettings(
        { ...settings, autoContrastEnabled: !settings.autoContrastEnabled },
        `autoContrastEnabled = ${String(!settings.autoContrastEnabled)} (takes effect in Phase 8)`,
      )
      return
    case "toggle-auto-launch": {
      // Both halves now, and still two statements rather than one: the C# keeps `_autoLaunchEnabled` and
      // `AutoLaunchService` apart for the reason that survives here — the setting is persisted FIRST, so a
      // failed registry write leaves a tick that disagrees with the OS, which is visible and findable,
      // whereas registering without persisting would be an inconsistency nothing can see.
      const next = !settings.autoLaunchEnabled
      applySettings({ ...settings, autoLaunchEnabled: next }, `autoLaunchEnabled = ${String(next)}`)
      syncAutoLaunch(next)
      return
    }
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
    // A notice that answered before the renderer was listening. Unreachable on the ordinary path — `ready`
    // arrives before `ready-to-show`, which is what dispatches the check — and this is the flush that makes
    // the ordering not matter. After `pushSettings`, because the renderer's `onUpdate` handler lays the panel
    // out and needs settings in hand.
    if (pendingUpdateText !== null) sendUpdate(pendingUpdateText)
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
  // Validated at the boundary like the two above. A non-boolean here would be read as truthy or falsy by
  // `onHover`, so a malformed payload would land as a real enter or a real leave rather than be dropped.
  ipcMain.on("hover", (_event, payload: unknown) => {
    if (typeof payload !== "boolean") return
    onHover(payload)
  })
  // The settings window's three channels. `settings-ready` and not `ready`: `ipcMain.on` is per-channel and
  // not per-window, so a second window reusing the overlay's handshake name would land in the handler above
  // and set `rendererReady` about a renderer it is not. `preload-settings.ts` carries the same note.
  ipcMain.on("settings-ready", (event) => {
    settingsWindow?.markReady(event.sender)
  })
  ipcMain.on("settings-edit", (_event, payload: unknown) => {
    if (typeof payload !== "object" || payload === null) return
    const { id, value } = payload as { id?: unknown; value?: unknown }
    if (typeof id !== "string") return
    onSettingsEdit(id, value)
  })
  ipcMain.on("settings-close", () => {
    settingsWindow?.close()
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
  //
  // On Linux the cursor source is NOT `screen`: `screen.getCursorScreenPoint()` there returns the
  // position cached from the last mouse event over one of the app's own windows, so it does not move
  // while the pointer crosses the proximity halo (which is by definition outside the widget) and the
  // fade never runs. `X11CursorSource` reads `XQueryPointer` on the root window instead, which tracks
  // the real pointer, and falls back to `screen.getCursorScreenPoint()` if the X connection fails.
  // ISC-24.1. `XQueryPointer` is physical pixels; the driver compares against DIP bounds, so the
  // conversion divides by the primary display's scale factor — exact at 1.0 (the common Linux case),
  // and carrying the same mixed-scale caveat ISC-24 already records for the ratio itself.
  if (IS_LINUX) {
    const scale = screen.getPrimaryDisplay().scaleFactor
    x11Cursor = new X11CursorSource({
      fallback: () => screen.getCursorScreenPoint(),
      log,
      ...(scale === 1
        ? {}
        : { physicalToDip: (p) => ({ x: Math.round(p.x / scale), y: Math.round(p.y / scale) }) }),
    })
    x11Cursor.start()
  }
  ghost = new GhostDriver({
    window: win,
    cursor: x11Cursor ?? screen,
    // Target only. The renderer owns the interpolation — PERF-01, and the reason a busy main process
    // delays where the fade is going rather than how smoothly it gets there.
    onRatio: (ratio) => sendGhost({ ratio }),
    // Two consequences, both from the C#'s own `Restored` handler (`MainWindow.xaml.cs:245-251`): the
    // opacity snaps back, and the backdrop is cleared **unless** `backdropAlwaysVisible`. That second one
    // is the only path that clears it after a hover-then-ghost sequence — `Window_MouseLeave` returns early
    // while click-through is applied and leaves it painted, so without this the backdrop would be stuck on
    // until the next ordinary leave.
    onRestored: () => {
      sendGhost({ reset: true })
      if (!settings.backdropAlwaysVisible) sendBackdrop(false)
    },
    // Linux/X11 only: `screen.getCursorScreenPoint()` freezes at the last on-widget reading once
    // `setIgnoreMouseEvents(true)` is applied there, so the poll never sees the cursor leave and the
    // widget stays invisible with the tray toggle as the only cure. The watchdog forces a restore after
    // ~3 s of a frozen reading. Windows and macOS pass `undefined` and keep the pure poll — see
    // `main/ghost.ts`'s header. Filed as ISC-24.1.
    ...(IS_LINUX ? { staleCursorRestoreTicks: STALE_CURSOR_RESTORE_TICKS } : {}),
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

  // Before the tray, because `handleTrayAction`'s `open-settings` reaches for it — the tray builds its menu
  // at construction and Linux cannot rebuild on open, so an action firing against a null host would be a
  // dead menu item rather than a deferred one.
  settingsWindow = new SettingsWindowHost({
    dir: HERE,
    log,
    // `GetCurrentSettingsSnapshot()`. Rebuilt per push rather than held, so there is one copy of the current
    // state — `settings` — and the form is always a projection of it.
    //
    // `app.getLocale()` is the port's `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName`, sliced the
    // same way `renderer.ts`'s `uiLanguage()` slices `navigator.language`. Two different accessors for one
    // fact, and they agree because both resolve to Chromium's application locale — but read INSIDE this
    // closure rather than captured at construction, because `getLocale()` is documented as needing a ready
    // app and this host is built before the first push either way.
    buildForm: () => buildSettingsForm(settings, app.getLocale().slice(0, 2).toLowerCase()),
    // `OnRenderingTick`'s middle guard. Relayed exactly as the tray's menu pin is, and to the same place:
    // the renderer owns the fade, so main only reports that the window exists.
    onVisibilityChange: (open) => sendGhost({ settingsOpen: open }),
    parent: () => mainWindow,
  })

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

  // Both constructed unconditionally, and neither reads a setting at construction time. That is the C#'s
  // shape (`MainWindow.xaml.cs:202-211`): the service exists whether or not the feature is on, so every
  // later call site can be a plain method call rather than a null check plus a decision.
  const registeredExePath = autoLaunchExePath(autoLaunchPlatform(), process.execPath, process.env.APPIMAGE)
  autoLaunch = new AutoLaunch({
    platform: autoLaunchPlatform(),
    // `process.execPath` on Windows and macOS, which in a packaged app IS `FuzzyClock.exe` — the same shape
    // `Environment.ProcessPath` gives the C#. In a DEV run it is `node_modules/electron/dist/electron.exe`,
    // which would be a Run entry that launches a bare Electron with no app: `probe-autolaunch.ts` is what
    // exercises this path, under its own value name, and a dev toggle writing a useless entry is a real
    // (small) divergence recorded in the plan rather than papered over with an `isPackaged` guard that would
    // then make the tray toggle silently do nothing in development.
    //
    // On Linux it is `$APPIMAGE` when there is one, because inside a running AppImage `process.execPath` is
    // an ephemeral `/tmp/.mount_*` path — see `autoLaunchExePath`, which owns that decision and is where the
    // reasoning and the three guards live. The env read is here rather than in that module for the same
    // reason every other environment read is: the module stays drivable from `bun test`.
    exePath: registeredExePath,
    homeDir: homedir(),
    runner: processRunner,
    fs: fileSeam,
    log,
  })
  updateChecker = new UpdateChecker({
    version: app.getVersion(),
    // UPD-09's `#if DEBUG`, through the only signal Electron has. A dev run does not dispatch at all.
    enabled: app.isPackaged,
    // The platform `fetch`. Injected rather than imported inside the module so `update-check.ts` loads under
    // plain `bun` with no network — every arm of `test/update-check.test.ts` depends on that.
    fetchImpl: (url, init) => fetch(url, init),
    log,
  })
  // Both paths in the log, not just the resolved one. The AppImage fix rests on `$APPIMAGE` holding the
  // `.AppImage` file's own path, which is documented rather than measured here — printing the raw value next
  // to what was chosen means the next Linux run reads it back off an ordinary startup log instead of needing
  // a new instrument. `(unset)` on the two platforms that never consult it, which is also the reading.
  log(
    "info",
    `auto-launch: ${autoLaunch.describe()} — setting is ${String(settings.autoLaunchEnabled)}, ` +
      `registers ${registeredExePath} (execPath=${process.execPath}, ` +
      `APPIMAGE=${process.env.APPIMAGE ?? "(unset)"})`,
  )

  win.once("ready-to-show", () => {
    win.show()
    log("info", `window shown, transparent+topmost, paints will follow at ${String(REPAINT_MS)}ms`)
    process.stdout.write(`PROBE-READY pid=${String(process.pid)}\n`)
    // `DispatcherPriority.ApplicationIdle`'s counterpart: after the first frame is on screen, never before.
    kickoffUpdateCheck()
  })

  source = createStatsSource()
  log("info", `telemetry: ${source.describe()}`)
  source.start((sample) => {
    Object.assign(latest, sample)
    // `sample.cpu !== undefined`, NOT `latest.cpu`. Every source emits PARTIALS, and on Windows two
    // `typeperf` children emit separately — the scalar one carries cpu, the GPU one does not — so a push
    // keyed on the merged copy would enqueue the same CPU reading twice per interval and halve every
    // window's real span. `undefined` is the right test rather than a truthiness one: `0` is a legitimate
    // reading and `-1` is the sentinel, and `pushCpuSample` is the thing that drops the sentinel.
    if (sample.cpu === undefined) return
    cpuSamples = pushCpuSample(cpuSamples, sample.cpu, {
      intervalSeconds: adoptedIntervalSec,
      hoverFastRefresh: isHoverFastRefresh(adoptedIntervalSec, baselineIntervalSec),
      // The C#'s `StatsService.IsReady` gate, expressed better than the original could. It needed a
      // ~6-second timer flag because its counter reports `0f` while initialising, which is
      // indistinguishable by value from an idle machine; the port's sentinel says "no reading" outright,
      // so readiness IS "the reading is not the sentinel" and there is no window to guess at.
      ready: sample.cpu !== UNAVAILABLE,
    })
  })
  // The adopted interval, not the requested one. On Windows they differ whenever the user's setting is
  // fractional — `typeperf -si` takes whole seconds — and this is the value the load averages must be
  // counted against. See `core/hover.ts`.
  adoptedIntervalSec = source.setIntervalSec(settings.statsIntervalSeconds)
  baselineIntervalSec = adoptedIntervalSec
  if (adoptedIntervalSec !== settings.statsIntervalSeconds) {
    log(
      "warn",
      `telemetry: asked for ${String(settings.statsIntervalSeconds)}s, sampling at ` +
        `${String(adoptedIntervalSec)}s — the source declined`,
    )
  }

  repaintTimer = setInterval(() => {
    // `os.uptime()`, not `process.uptime()`. The harness used the process's own uptime, which shows
    // "up 2m" after an app restart where the WPF app shows "up 3d": `UpdateUptimeDisplay` reads
    // `Environment.TickCount64`, milliseconds since BOOT. `os.uptime()` is that same counter
    // (`GetTickCount64` on Windows), in seconds. One of Phase 6's 15 cells, paid early because it is a
    // wrong number on screen rather than a missing one.
    //
    // Composed here rather than in the renderer, and `procCount` is `null` rather than a number: the `Np`
    // field needs per-process cumulative CPU time, which Node does not expose and which neither of the two
    // Windows mechanisms this tree has already measured can deliver (§ Phase 6 of the port plan). `null`
    // drops the field; a `0` would be a count.
    latest.uptimeText = uptimeLine(
      formatUptime(Math.floor(osUptime())),
      cpuSamples,
      adoptedIntervalSec,
      null,
    )
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
  // The X11 cursor poll and its socket — Linux only, null everywhere else.
  x11Cursor?.stop()
  // Without this the `typeperf` children outlive the app: they are spawned by this process but nothing
  // reparents or reaps them on exit.
  source?.stop()
  // `_updateCts.Cancel()` in the C#'s shutdown tier. No longer the ONLY live caller of `cancelInFlight`:
  // Phase 6.5 built the second one this comment used to describe as unreachable — the settings window's
  // update-checks checkbox (PERS-10), in `onSettingsEdit`.
  updateChecker?.cancelInFlight()
  tray?.destroy()
  // `destroy()` and not `close()`, because this handler runs PAST the point a close can be refused: a
  // `close()` here would fire `close`/`closed` on a window during a quit that is already committed, and on
  // macOS an accessory app that leaves a second window alive at this point keeps the process up. Its own
  // `closed` handler is what would have pushed `settingsOpen: false`, and skipping that is deliberate —
  // there is no renderer left to receive it.
  settingsWindow?.destroy()
})
