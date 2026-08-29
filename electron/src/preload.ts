/**
 * Preload bridge.
 *
 * `contextIsolation` is on and `nodeIntegration` off, so the renderer has no
 * `require` and no `ipcRenderer` of its own. This is the entire surface between
 * them: main pushes stats down, and the renderer reports three things it is the
 * only half able to see — a completed paint, a pointer drag, and a right-click.
 *
 * Every channel is `send`, never `invoke`, and carries no coordinates. The drag
 * calls are bare notifications: main reads the cursor itself with
 * `screen.getCursorScreenPoint()`, because the renderer's `MouseEvent.screenX/Y`
 * live in a per-display coordinate space and this desk has a display at negative x.
 * Passing them would put the coordinate-space bug on the wire.
 *
 * Built to CJS (`dist/preload.cjs`) because Electron loads preload scripts as
 * CommonJS regardless of the package `type` — an ESM preload fails at load with a
 * bare `require is not defined`, and the window then renders with no bridge and no
 * obvious cause.
 */

import { contextBridge, ipcRenderer } from "electron"
import type { StatsSample } from "./shared.js"

contextBridge.exposeInMainWorld("fuzzyclock", {
  onStats(callback: (sample: StatsSample) => void): void {
    ipcRenderer.on("stats", (_event, sample: StatsSample) => callback(sample))
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
