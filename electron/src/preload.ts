/**
 * Preload bridge.
 *
 * `contextIsolation` is on and `nodeIntegration` off, so the renderer has no
 * `require` and no `ipcRenderer` of its own. This is the entire surface between
 * them: main pushes settings, stats and the ghost proximity ratio down, and the
 * renderer reports what it is the only half able to see — that it is listening,
 * the size its content measured, a completed paint, a pointer drag, and a
 * right-click.
 *
 * Every channel is `send`, never `invoke`, and only one carries a payload upward.
 * The drag calls are bare notifications: main reads the cursor itself with
 * `screen.getCursorScreenPoint()`, because the renderer's `MouseEvent.screenX/Y`
 * live in a per-display coordinate space and this desk has a display at negative x.
 * Passing them would put the coordinate-space bug on the wire.
 *
 * `resize` is the exception, and it is safe for the reason the drag calls are not:
 * a content size is a pair of lengths in the renderer's own CSS pixels, with no
 * origin in it and so no coordinate space to be wrong about.
 *
 * ## `ready` exists because a `send` into a renderer with no listener is dropped
 *
 * Main cannot push the settings the moment the window is created — `webContents.send`
 * before the renderer has run `ipcRenderer.on("settings", …)` goes nowhere, with no
 * error on either side. The renderer registers its listeners and then says `ready`,
 * and main replies with the current settings. Everything the renderer draws depends
 * on that reply, so getting the order wrong is a permanently blank clock.
 *
 * Built to CJS (`dist/preload.cjs`) because Electron loads preload scripts as
 * CommonJS regardless of the package `type` — an ESM preload fails at load with a
 * bare `require is not defined`, and the window then renders with no bridge and no
 * obvious cause.
 */

import { contextBridge, ipcRenderer } from "electron"
import type { StatsSample } from "./shared.js"
import type { AppSettings } from "./core/settings.js"

contextBridge.exposeInMainWorld("fuzzyclock", {
  /**
   * The whole settings object on every change, and once in reply to `ready()`.
   *
   * Whole rather than a diff: `ApplySettings` in the C# also re-pushes everything
   * to every control, and a diff would need both halves to agree on what changed
   * — which is a second copy of the settings shape living on the wire.
   */
  onSettings(callback: (settings: AppSettings) => void): void {
    ipcRenderer.on("settings", (_event, settings: AppSettings) => callback(settings))
  },
  onStats(callback: (sample: StatsSample) => void): void {
    ipcRenderer.on("stats", (_event, sample: StatsSample) => callback(sample))
  },
  /**
   * Whether the hover backdrop should be painted right now.
   *
   * A boolean rather than a colour: the alpha comes from `backdropOpacityPercent`, which the renderer
   * already holds from the settings push, and sending a computed fill would put the same number on the
   * wire twice with no way to tell which copy is stale. `core/backdrop.ts` turns this plus the settings
   * into the fill.
   *
   * Main decides it rather than the renderer, because the decision reads `ghostModeEnabled`, the modifier
   * key and whether ghost mode is mid-fade — three pieces of state that only exist up there
   * (`core/hover.ts`). This channel is also how the ghost `Restored` edge clears the paint.
   */
  onBackdrop(callback: (painted: boolean) => void): void {
    ipcRenderer.on("backdrop", (_event, painted: boolean) => callback(painted))
  },
  /**
   * The ghost sampler's proximity ratio, and the pins that suppress acting on it.
   *
   * One channel for both because they are consumed by the same frame: `ratio` is
   * where the fade is heading and `menuOpen` is whether it may be painted, and the
   * C#'s pump reads them in that order within one tick. Sending them separately
   * would let a pin arrive between the target and the frame that uses it.
   *
   * Main sends this only when something changed — the sampler runs at 30 Hz and is
   * silent at steady state (D-08), so this channel is quiet whenever the cursor is
   * parked away from the widget. The interpolation runs renderer-side on `rAF`,
   * which is the whole point of PERF-01: a busy main process delays the target,
   * never the animation.
   */
  onGhost(callback: (state: { ratio?: number; menuOpen?: boolean; reset?: boolean }) => void): void {
    ipcRenderer.on("ghost", (_event, state: { ratio?: number; menuOpen?: boolean; reset?: boolean }) =>
      callback(state),
    )
  },
  /** Listeners are registered: main may now push the current settings. See the header. */
  ready(): void {
    ipcRenderer.send("ready")
  },
  /**
   * The size the content measured. Main resizes the window and re-clamps the placement.
   *
   * The renderer is the only half that can know this: WPF's window is
   * `SizeToContent="WidthAndHeight"` and there is no equivalent in Electron, so the
   * measurement has to happen where the text is and travel back up.
   */
  resize(size: { width: number; height: number }): void {
    ipcRenderer.send("resize", size)
  },
  /** Acknowledge that a repaint completed. Consumed by the ISC-6 paint counter. */
  painted(): void {
    ipcRenderer.send("painted")
  },
  /** Pointer went down on the widget: main records the drag anchor. */
  dragStart(): void {
    ipcRenderer.send("drag-start")
  },
  /** Pointer moved while held: main moves the window to follow the cursor. */
  dragMove(): void {
    ipcRenderer.send("drag-move")
  },
  /** Pointer released: main snaps, clamps and saves. */
  dragEnd(): void {
    ipcRenderer.send("drag-end")
  },
  /** Right-click on the widget (RMB-01): main opens the tray menu if the gate allows it. */
  contextMenu(): void {
    ipcRenderer.send("context-menu")
  },
  /**
   * One wheel notch on the widget. `direction` is +1 brighter, -1 dimmer — never a raw `deltaY`.
   *
   * A direction rather than the delta because main owns the setting and the clamp, and because the two
   * halves disagree about which sign means "up": `core/opacity-step.ts` has the measurement. Main replies
   * by pushing the whole settings object back down, so the renderer never holds an opacity of its own.
   */
  adjustOpacity(direction: number): void {
    ipcRenderer.send("adjust-opacity", direction)
  },
  /**
   * The cursor entered or left the widget. One channel carrying a sign, like `adjustOpacity`.
   *
   * Two things hang off it in the C# (`Window_MouseEnter`/`Window_MouseLeave`, MainWindow.xaml.cs:1456-1496):
   * the backdrop paint, which comes back down through `onBackdrop`, and the stats fast-refresh, which is
   * main's own timer to move. Neither is decidable here.
   */
  hover(inside: boolean): void {
    ipcRenderer.send("hover", inside)
  },
})
