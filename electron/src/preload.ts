/**
 * Preload bridge.
 *
 * `contextIsolation` is on and `nodeIntegration` off, so the renderer has no
 * `require` and no `ipcRenderer` of its own. This is the entire surface between
 * them, and it is deliberately one-way-plus-ack: main pushes stats down, the
 * renderer acknowledges a completed paint. Nothing else crosses.
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
})
