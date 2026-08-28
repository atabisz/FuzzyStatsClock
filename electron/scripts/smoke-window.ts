/**
 * Launch the built app, watch its stdout for 12s, report whether it actually drew.
 *
 * A separate script from `probe-cost.ts` because the two answer different questions
 * and conflating them is how a broken launch gets read as a cheap one: this asks
 * "does the workload run at all", the probe asks "what does it cost". The probe
 * treats a run with no paints as INCONCLUSIVE rather than PASS, and this is how that
 * condition gets diagnosed.
 *
 * Goes through `spawnElectron` for the reason written up in `lib/electron-launch.ts`:
 * launched any other way from a VSCode terminal, `electron.exe` runs this as plain
 * Node, `app` is undefined, and the crash exits 0.
 */

import { join } from "node:path"
import { spawnElectron } from "./lib/electron-launch.js"

const WATCH_MS = 12_000

const child = spawnElectron(join(import.meta.dirname, "..", "dist", "main.js"))

let out = ""
let err = ""
child.stdout.on("data", (chunk: Buffer) => {
  out += chunk.toString()
  process.stdout.write(chunk)
})
child.stderr.on("data", (chunk: Buffer) => {
  err += chunk.toString()
  process.stderr.write(chunk)
})

const exited = new Promise<number | null>((resolve) => {
  child.once("exit", (code) => resolve(code))
})

const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), WATCH_MS))
const result = await Promise.race([exited, timeout])

if (result !== "timeout") {
  console.log(`\n--- app exited early with code ${String(result)} — it should still be running ---`)
}

const paints = [...out.matchAll(/^PROBE-PAINTS (\d+)$/gm)].map((m) => Number(m[1]))
const lastPaints = paints.at(-1) ?? 0
const ready = /^PROBE-READY pid=(\d+)$/m.exec(out)

child.kill()

console.log("\n=== smoke ===")
console.log(`ready line     : ${ready === null ? "MISSING" : `pid ${ready[1] ?? "?"}`}`)
console.log(`paint reports  : [${paints.join(", ")}]`)
console.log(`paints         : ${String(lastPaints)}`)
console.log(`stderr bytes   : ${String(err.length)}`)

// A window that showed but never painted is the failure mode worth naming: it looks
// identical to a working app in every CPU measurement, and it is what a missing
// dist/index.html or a broken preload produces.
if (ready === null) {
  console.log("VERDICT: FAIL — no PROBE-READY, the window never reached ready-to-show")
  process.exit(1)
}
if (lastPaints === 0) {
  console.log("VERDICT: FAIL — window shown but zero paints; renderer or preload is not running")
  process.exit(1)
}
console.log("VERDICT: PASS — window shown and the renderer is painting")
process.exit(0)
