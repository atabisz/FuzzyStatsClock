/**
 * The two real adapters behind `main/auto-launch.ts`'s injected seams: a process runner and a file sink.
 *
 * These lived in `main/main.ts` until Phase 7 needed to *probe* them. Extracted rather than duplicated, and
 * the reason is the whole point of the split: `scripts/probe-autolaunch.ts` drives a real `reg.exe` and a
 * real filesystem, and if it carried its own copy of these twelve lines it would be measuring the copy. A
 * probe that green-lights an adapter the app does not use is worse than no probe -- it reads as coverage.
 *
 * Nothing here imports `electron`, deliberately, so this module loads under plain `bun`. That is the only
 * property that makes the extraction useful; `main.ts` cannot be imported outside an Electron process.
 *
 * `main.ts` imports both and its wiring is unchanged. The doc comments moved with the code because they
 * record *why* each shape is what it is, and those reasons belong next to the implementation.
 */

import { execFile } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Fs, Runner } from "./auto-launch.js"

/**
 * `main/auto-launch.ts`'s process seam, over `execFile`.
 *
 * `execFile` rather than `spawn` + stream plumbing, and rather than `exec`: the argv array never reaches a
 * shell, so the exe path -- which contains spaces on a default Windows install (`C:\Program Files\...`) --
 * needs no quoting and cannot be re-split. Quoting it would put the quotes INTO the registry value, which
 * is a Run entry Windows cannot launch.
 *
 * A non-zero exit is NOT an error here. `reg delete` exits 1 for an absent value and `reg query` exits 1
 * for one that is not there, and both are ordinary answers rather than failures -- so the callback's error
 * is folded into a code and the module decides what it means. Rejecting would make `disable()` on an
 * already-disabled app throw, which is exactly the case the C#'s `throwOnMissingValue: false` exists for.
 */
export const processRunner: Runner = {
  run: (command, args) =>
    new Promise((resolve) => {
      execFile(command, [...args], { windowsHide: true }, (error, stdout, stderr) => {
        // `ExecFileException.code` is `number | string | undefined`: the exit code when the process ran and
        // failed, an errno string like `ENOENT` when it could not be spawned at all. Both mean "not 0" to
        // every caller, and 1 is the code `reg.exe` itself uses for the two absent-value cases.
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : 1
        resolve({ code, stdout, stderr })
      })
    }),
}

/**
 * The mac/linux file seam. Creates the parent directory, because neither
 * `~/Library/LaunchAgents` nor `~/.config/autostart` is guaranteed to exist on a fresh account.
 *
 * `readFile` answers `null` for a missing file rather than throwing, which is what makes `isEnabled()` a
 * presence test instead of a try/catch. `remove` uses `force: true` for the same reason `disable()` treats a
 * failed `reg delete` as success: unregistering something that was never registered is a no-op, not an error.
 */
export const fileSeam: Fs = {
  async writeFile(path, contents) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents, "utf8")
  },
  async readFile(path) {
    try {
      return await readFile(path, "utf8")
    } catch {
      return null
    }
  },
  async remove(path) {
    await rm(path, { force: true })
  },
}
