/**
 * Launch the local Electron binary from a probe, with the environment repaired.
 *
 * ## The trap this exists for, measured
 *
 * VSCode exports **`ELECTRON_RUN_AS_NODE=1`** into terminal and task environments,
 * and every shell descended from the editor inherits it. Any `electron.exe` started
 * from such a shell therefore runs as **plain Node**: `require("electron")` returns
 * the *path string* instead of the API, so `app` is `undefined` and the script dies
 * with `TypeError: Cannot read properties of undefined (reading 'whenReady')`, under
 * a `Node.js v20.18.3` banner. No window, no renderer, no GPU process.
 *
 * That cost a whole diagnostic detour. A churn helper launched this way appeared to
 * start — exit code 0 when its output was discarded — while doing nothing, and the
 * `Get-Process electron` query used to confirm it picked up unrelated Electron
 * processes belonging to the editor. The conclusion drawn was that this host does not
 * register new GPU engine instances for a new process. It was wrong: with the variable
 * scrubbed, a launch adds a new `pid_<N>_..._engtype_3D` instance every time.
 *
 * The lesson generalises past that one probe, which is why this is a shared helper
 * rather than an inline `delete`: **an instrument that fails silently under a variable
 * you did not set will be believed.** Anything measuring the real app — startup cost,
 * RSS, display enumeration, packaged size — is exposed to the same variable, and would
 * measure a Node process while reporting on an Electron one.
 *
 * ## The second trap, and why `windowsHide` is NOT set here
 *
 * This helper used to pass `windowsHide: true`. On Windows that sets
 * `STARTF_USESHOWWINDOW` with `wShowWindow = SW_HIDE` in the child's `STARTUPINFO`, and
 * a process's **first** `ShowWindow` call consumes that startup show state instead of its
 * own argument. So the first window an Electron probe host shows stays hidden — and
 * `BrowserWindow.isVisible()` agrees, which is the part that makes it a silent failure
 * rather than a visible one. Measured on this host, `#ff00ff` window at 300,300 read back
 * through `screengrab.ps1`:
 *
 *   | launcher              | `show()` calls | `isVisible()` | capture      |
 *   | `windowsHide: true`   | 1              | false         | rgb(12,12,12) |
 *   | `windowsHide: true`   | 2              | true          | rgb(255,0,255) |
 *   | `windowsHide: false`  | 1              | true          | rgb(255,0,255) |
 *
 * `rgb(12,12,12)` is `#0C0C0C`, the Windows console default background: the capture was
 * photographing the terminal the probe was launched from. `probe-pixels.ts` reported that
 * as "THE WIDGET IS PAINTING A BOX" on three of four arms — a conclusion about Chromium
 * drawn from a flag on the launcher — and its own X1 control is what caught it.
 *
 * Nothing is lost by dropping it: `electron.exe`'s PE subsystem is **2 (GUI)**, measured
 * from its own header, so no console window is ever created for it and there was never
 * anything for `windowsHide` to hide. A helper spawning a *console* binary still wants the
 * flag — every `spawn("typeperf", …)` and `spawn("powershell", …)` in `scripts/` keeps it.
 *
 * The real app is not affected and that was measured too, rather than assumed:
 * `dist/main.js` launched with `windowsHide: true` shows its window (`Chrome_WidgetWin_1
 * 'FuzzyClock'`, `visible=True`), because something earlier in its startup — it has a tray,
 * which a probe host does not — consumes the startup show state before `win.show()` runs.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Environment variables that must not reach an Electron child.
 *
 * `ELECTRON_RUN_AS_NODE` turns it into Node. `ELECTRON_NO_ATTACH_CONSOLE` and
 * `ELECTRON_ENABLE_LOGGING` do not break a run but do change what it prints, which is
 * enough to make one machine's probe output differ from another's for no real reason.
 */
const STRIPPED = ["ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE", "ELECTRON_ENABLE_LOGGING"]

/** `process.env` minus the variables that would change what Electron *is*. */
export function cleanElectronEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const key of STRIPPED) delete env[key]
  return env
}

/**
 * Absolute path to the installed Electron executable.
 *
 * Read from the package's own `path.txt` rather than assembled per platform: that file
 * is what the `electron` module itself resolves, so it stays correct on Windows
 * (`electron.exe`), macOS (`Electron.app/Contents/MacOS/Electron`) and Linux
 * (`electron`) without this file knowing the difference. Importing the module for its
 * default export would be the other way, but under TypeScript that export is typed as
 * the Electron *API* namespace, not the string it actually is in a Node process.
 */
export function electronBinaryPath(): string {
  const pkgDir = join(import.meta.dirname, "..", "..", "node_modules", "electron")
  const relative = readFileSync(join(pkgDir, "path.txt"), "utf8").trim()
  return join(pkgDir, "dist", relative)
}

/**
 * Spawn an Electron script as a real Electron app.
 *
 * `stdio` is piped rather than ignored on purpose. Discarding it is what let the
 * `ELECTRON_RUN_AS_NODE` crash pass for a successful launch — the process exited 0
 * having printed a stack trace nobody read.
 *
 * `windowsHide` is deliberately absent — see the header's second section for the
 * measurement. Leaving it out is what lets a host's first `show()` actually show.
 */
export function spawnElectron(
  scriptPath: string,
  args: string[] = [],
): ChildProcessWithoutNullStreams {
  return spawn(electronBinaryPath(), [scriptPath, ...args], {
    env: cleanElectronEnv(),
  }) as ChildProcessWithoutNullStreams
}
