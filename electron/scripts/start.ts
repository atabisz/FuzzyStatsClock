/**
 * Run the built app as a real Electron app, from any shell.
 *
 * `electron dist/main.js` is the obvious `start` script and it is broken in the shell
 * this repo is developed in. VSCode exports **`ELECTRON_RUN_AS_NODE=1`** into terminal
 * and task environments, so the binary launches as plain Node, `import("electron")`
 * yields a path string instead of the API, and the run dies inside
 * `node:internal/modules/esm/translators` under a `Node.js v20.18.3` banner. No window,
 * no renderer — and if the output is being piped anywhere, no visible reason either.
 *
 * That is the same variable the probes already defend against, which is why this file
 * is four lines of glue over `spawnElectron` rather than its own `delete env[...]`:
 * one place strips it, and `probe-cost`, `probe-displays` and this share it. The lesson
 * it comes from is written up at the top of `lib/electron-launch.ts` — an instrument
 * that fails silently under a variable you did not set will be believed.
 *
 * Output is forwarded rather than inherited because `spawnElectron` pipes stdio on
 * purpose: a discarded stream is what let the crash above pass for a clean exit.
 */

import { join } from "node:path"
import { spawnElectron } from "./lib/electron-launch.js"

const child = spawnElectron(join(import.meta.dirname, "..", "dist", "main.js"))

child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)

// Ctrl-C reaches this process, not the child: forward it so `before-quit` runs and the
// two `typeperf` children are reaped instead of outliving the terminal.
process.on("SIGINT", () => child.kill())

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === null ? 1 : 0)
})
