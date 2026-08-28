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
 */
export function spawnElectron(
  scriptPath: string,
  args: string[] = [],
): ChildProcessWithoutNullStreams {
  return spawn(electronBinaryPath(), [scriptPath, ...args], {
    env: cleanElectronEnv(),
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams
}
