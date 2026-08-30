/**
 * Preload bridge for the settings window.
 *
 * A second, separate bridge rather than a widened `preload.ts`, and the reason is not tidiness: that file's
 * surface is thirteen channels the overlay needs, and exposing them into a settings window would give a
 * plain form the ability to start a window drag, report a content size, or open the tray menu. The two
 * windows want disjoint capabilities, so they get disjoint bridges. `contextIsolation` is on and
 * `nodeIntegration` off here as well, so this is the entire surface.
 *
 * Both bridges expose `window.fuzzyclock`, which is safe because no renderer ever loads both — a preload is
 * per-`BrowserWindow` via `webPreferences.preload`. Keeping the name the same means `settings.ts` and
 * `renderer.ts` read the same way; giving each its own would suggest a page might see both.
 *
 * ## Three channels, and only one carries a payload upward
 *
 * Down: `form`, the whole `SettingsForm` from `core/settings-form.ts`. The form model rather than the raw
 * `AppSettings` because every gating and visibility rule this window obeys is a rule about the *original
 * WPF window*, and those rules belong in `core/` where `bun test` can reach them — not in a renderer that
 * only a running Electron can execute. So main builds the form and this window interprets it.
 *
 * Up: `ready()` and `close()` are bare notifications; `edit()` carries `{id, value}`. That payload is
 * validated in main by `applySettingsEdit`, which returns null for anything the window could not have
 * produced — the same boundary discipline `main.ts` already applies to `resize`, `adjust-opacity` and
 * `hover`, and for the same reason: a malformed payload reaching arithmetic or a settings write takes the
 * whole main process down with it.
 *
 * ## `ready` exists for the reason it exists in the overlay
 *
 * `webContents.send` into a renderer that has not yet run its `ipcRenderer.on` is silently dropped — no
 * error on either side. Main cannot push the form when the window is created, so this window registers its
 * listener and says `ready`, and main replies with the current form. Getting that order wrong is a
 * permanently empty settings window, which is exactly as hard to diagnose here as a blank clock was there.
 *
 * Built to CJS (`dist/preload-settings.cjs`) because Electron loads preload scripts as CommonJS whatever
 * the package `type` says. An ESM preload fails at load with a bare `require is not defined` and the window
 * then renders with no bridge and no obvious cause.
 */

import { contextBridge, ipcRenderer } from "electron"
import type { SettingsForm } from "./core/settings-form.js"

contextBridge.exposeInMainWorld("fuzzyclock", {
  /**
   * The whole form on every change, and once in reply to `ready()`.
   *
   * Whole rather than a diff, matching the overlay's `onSettings` and the C#'s `RefreshControls`: a diff
   * would need both halves to agree on what changed, which is a second copy of the form's shape on the
   * wire. `settings.ts` builds its DOM from the first one and updates in place from the rest, so the cost
   * of sending everything is a walk over ~35 controls, not a rebuild.
   */
  onForm(callback: (form: SettingsForm) => void): void {
    ipcRenderer.on("form", (_event, form: SettingsForm) => callback(form))
  },
  /**
   * Listeners are registered: main may now push the current form. See the header.
   *
   * `settings-ready`, NOT `ready` — `ipcMain.on` is global rather than per-window, and `ready` is already
   * the overlay's handshake (`main.ts:755`, where it sets `rendererReady` and pushes the overlay's
   * settings). Reusing the name would have this window's handshake flip a flag about a different renderer
   * and push a settings object at the wrong one. Checked rather than assumed, because both preloads would
   * have looked correct in isolation.
   */
  ready(): void {
    ipcRenderer.send("settings-ready")
  },
  /**
   * One control changed. Applied live — there is no OK/Apply button in the original and none here.
   *
   * `value` is `unknown` on purpose. The renderer reads DOM values, which are strings for every control
   * except a checkbox, and inventing a per-field type here would put a third copy of the settings shape on
   * the wire (after `AppSettings` and the form model). `applySettingsEdit` is the one place types are
   * restored, and it rejects rather than coerces.
   */
  edit(id: string, value: unknown): void {
    ipcRenderer.send("settings-edit", { id, value })
  },
  /**
   * Close the window.
   *
   * A channel rather than `window.close()`: main owns the single-window lifetime and needs to drop its
   * reference, and `SettingsWindow`'s C# close path is also main-side (`_settingsWindow = null` in the
   * `Closed` handler). Routing it through main keeps one owner of that state instead of two.
   */
  close(): void {
    ipcRenderer.send("settings-close")
  },
})
