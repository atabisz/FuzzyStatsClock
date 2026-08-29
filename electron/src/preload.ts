/**
 * Preload bridge.
 *
 * `contextIsolation` is on and `nodeIntegration` off, so the renderer has no
 * `require` and no `ipcRenderer` of its own. This is the entire surface between
 * them: main pushes settings and stats down, and the renderer reports what it is
 * the only half able to see — that it is listening, the size its content
 * measured, a completed paint, a pointer drag, and a right-click.
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
})
