/**
 * The Linux/X11 twin of `scripts/probe-pixels.ts` (ISC-10 / ISC-15 / ISC-16 Linux half; port plan task L5).
 *
 * Reuses `scripts/probe-pixels-app.cjs` UNCHANGED — it is already platform-neutral: an opaque magenta
 * backdrop, the real widget's `BrowserWindow` options on top at the `screen-saver` level painting
 * transparent, a stage where that same window paints opaque green, and back to transparent. The only
 * Windows-specific piece was the capture, `screengrab.ps1` (GDI `CopyFromScreen`); this driver swaps in
 * `screengrab-x11.cjs` (`desktopCapturer` screen source = the composited root image on X11) and keeps the
 * four-arm structure.
 *
 * ## The arms, and why X2 is the one that makes the rest evidence
 *
 *   - **X1 backdrop-only** — the capture path reads our own magenta back. Establishes what `rgb(255,0,255)`
 *     on the glass reads as through `desktopCapturer` on this display, rather than assuming it round-trips.
 *   - **X3 widget-transparent** — magenta is still visible where the transparent widget sits on top of the
 *     backdrop, i.e. the compositor honoured the window's alpha.
 *   - **X2 widget-opaque (the control)** — the SAME window with the SAME flags paints opaque green and the
 *     capture turns green. Without this, "still magenta" in X3 is indistinguishable from a widget window
 *     that never showed, landed off-screen, or lost the z-fight.
 *   - **X4 widget-transparent-again** — it comes back, which is also the fade's end state.
 *
 * Verdict: X1 is magenta-family and self-consistent; X2 is green-dominant AND far from X1's reading
 * (>120 euclidean); X3 and X4 match X1's measured reading (<=12 euclidean, every grid cell within 20).
 * X1's reading is the reference — `desktopCapturer` on this host lifts the black channel, so the magenta
 * is measured, not assumed to be literal `rgb(255,0,255)`.
 *
 * NOT covered here (still `[DEFERRED-VERIFY]` on Linux, and stated rather than skipped): click-through
 * into the window beneath (needs synthetic input + reading which window received it — no `xdotool` on the
 * validation host), and always-on-top over a native-fullscreen window.
 *
 * Run: `bun scripts/probe-pixels-x11.ts`  (Linux/X11, unlocked session with a compositor).
 */

import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const RECT = { x: 520, y: 360, w: 380, h: 240 }
const GRID = 8

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Arm {
  name: string
  pass: boolean
  detail: string
}
function push(list: Arm[], name: string, pass: boolean, detail: string): void {
  list.push({ name, pass, detail })
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`)
}

function electronBin(): string {
  const rel = readFileSync(join(import.meta.dirname, "..", "node_modules", "electron", "path.txt"), "utf8").trim()
  return join(import.meta.dirname, "..", "node_modules", "electron", "dist", rel)
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const k of ["ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE", "ELECTRON_ENABLE_LOGGING"]) delete env[k]
  return env
}

interface Grab {
  mean: [number, number, number]
  cells: ([number, number, number] | null)[]
}

function grab(rect: { x: number; y: number; w: number; h: number }, udd: string): Grab {
  // Electron KEEPS leading switches in `process.argv`, so switches go AFTER the positional args:
  // Electron still consumes `--user-data-dir` / `--no-sandbox` from anywhere on the line, and
  // screengrab-x11.cjs reads the *trailing run of integers*, so the switch tokens are ignored there.
  const r = spawnSync(
    electronBin(),
    [
      join(import.meta.dirname, "screengrab-x11.cjs"),
      String(rect.x),
      String(rect.y),
      String(rect.w),
      String(rect.h),
      String(GRID),
      "--no-sandbox",
      `--user-data-dir=${udd}`,
    ],
    { encoding: "utf8", env: cleanEnv() },
  )
  const line = r.stdout.split("\n").find((l) => l.startsWith("GRAB "))
  if (line === undefined) throw new Error(`screengrab-x11 produced no GRAB line:\n${r.stdout}\n${r.stderr}`)
  return JSON.parse(line.slice(5)) as Grab
}

const dist = (a: readonly number[], b: readonly number[]): number =>
  Math.round(Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0)))

/** Every non-null cell within `tol` (per channel) of `ref`; returns the count that are NOT. */
function cellsOff(g: Grab, ref: readonly number[], tol: number): number {
  return g.cells.filter((c) => c === null || !c.every((v, i) => Math.abs(v - (ref[i] ?? 0)) <= tol)).length
}

async function main(): Promise<void> {
  if (process.platform !== "linux") {
    console.error("probe-pixels-x11: Linux/X11 only")
    process.exit(2)
  }
  const udd = mkdtempSync(join(tmpdir(), "fc-pixels-"))
  const goPath = join(udd, "go")
  writeFileSync(goPath, "0")
  let go = 0
  const bump = (): void => {
    go += 1
    writeFileSync(goPath, String(go))
  }

  const child = spawn(
    electronBin(),
    [
      join(import.meta.dirname, "probe-pixels-app.cjs"),
      goPath,
      String(RECT.x),
      String(RECT.y),
      String(RECT.w),
      String(RECT.h),
      // switches AFTER the app args (see grab()): Electron still applies them, probe-pixels-app.cjs
      // only reads argv[2..6] so the trailing switch tokens are inert there.
      "--no-sandbox",
      `--user-data-dir=${udd}`,
    ],
    { env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] },
  )
  let out = ""
  child.stdout.on("data", (b: Buffer) => (out += b.toString()))
  child.stderr.on("data", (b: Buffer) => (out += b.toString()))

  const results: Arm[] = []
  let capturedRect = RECT

  try {
    const waitFor = async (needle: string, budgetMs: number): Promise<void> => {
      const t0 = Date.now()
      while (!out.includes(needle) && Date.now() - t0 < budgetMs) await sleep(100)
      if (!out.includes(needle)) throw new Error(`probe-pixels-app never printed ${needle}:\n${out}`)
    }

    await waitFor("PIXEL-BOUNDS", 25_000)
    const bl = out.split("\n").find((l) => l.startsWith("PIXEL-BOUNDS "))
    if (bl) {
      const b = JSON.parse(bl.slice("PIXEL-BOUNDS ".length)) as { widget: { x: number; y: number; width: number; height: number } }
      capturedRect = { x: b.widget.x, y: b.widget.y, w: b.widget.width, h: b.widget.height }
    }
    console.log(`grabbing rect ${JSON.stringify(capturedRect)}`)

    // Order MUST match probe-pixels-app.cjs's own stage sequence — this loop drives its counter file.
    const needles = [
      "PIXEL-STAGE backdrop-only",
      "PIXEL-STAGE widget-transparent\n",
      "PIXEL-STAGE widget-opaque",
      "PIXEL-STAGE widget-transparent-again",
    ]
    const grabs: Grab[] = []
    for (const needle of needles) {
      await waitFor(needle, 15_000)
      await sleep(800) // let the compositor present the new state
      grabs.push(grab(capturedRect, udd))
      bump()
    }
    await waitFor("PIXEL-DONE", 10_000)

    if (grabs.length !== 4) throw new Error(`expected 4 grabs, got ${grabs.length}`)
    const [bg, through, opaque, again] = grabs as [Grab, Grab, Grab, Grab]
    // X1 establishes what our magenta reads as through desktopCapturer on THIS display — not assumed to
    // round-trip. `desktopCapturer` here lifts the black channel, so the reference is measured, not literal.
    const ref = bg.mean
    const refIsMagentaFamily = bg.mean[0] > 180 && bg.mean[2] > 180 && bg.mean[0] > bg.mean[1] && bg.mean[2] > bg.mean[1]
    push(results, "X1 backdrop-only: capture reads our magenta backdrop", refIsMagentaFamily && cellsOff(bg, ref, 20) === 0,
      `mean=${JSON.stringify(bg.mean)} (reference) magenta-family=${String(refIsMagentaFamily)} cells-off=${cellsOff(bg, ref, 20)}/${bg.cells.length}`)

    // X2 CONTROL — the same window, same flags, painting opaque green. The capture MUST change to green,
    // otherwise "still magenta" in X3/X4 could be a window that never showed or lost the z-fight.
    const greenDominant = opaque.mean[1] > opaque.mean[0] && opaque.mean[1] > opaque.mean[2] && opaque.mean[1] > 120
    const movedFromRef = dist(opaque.mean, ref) > 120
    push(results, "X2 CONTROL: opaque widget covers the backdrop (capture turns green)", greenDominant && movedFromRef,
      `mean=${JSON.stringify(opaque.mean)} green-dominant=${String(greenDominant)} dist-from-X1=${dist(opaque.mean, ref)} (need >120)`)

    // X3 — the transparent widget on top, and the backdrop is STILL visible through it. Compared against
    // X1's measured reference, tight tolerance, every cell.
    push(results, "X3 backdrop visible THROUGH the transparent widget", dist(through.mean, ref) <= 12 && cellsOff(through, ref, 20) === 0,
      `mean=${JSON.stringify(through.mean)} dist-from-X1=${dist(through.mean, ref)} (need <=12) cells-off=${cellsOff(through, ref, 20)}/${through.cells.length}`)

    // X4 — transparent again after the opaque stage: it recovers, which is the fade's end state.
    push(results, "X4 transparent again — backdrop returns", dist(again.mean, ref) <= 12 && cellsOff(again, ref, 20) === 0,
      `mean=${JSON.stringify(again.mean)} dist-from-X1=${dist(again.mean, ref)} (need <=12) cells-off=${cellsOff(again, ref, 20)}/${again.cells.length}`)
  } finally {
    child.kill("SIGTERM")
    await sleep(800)
    child.kill("SIGKILL")
    rmSync(udd, { recursive: true, force: true })
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\nPIXELS (X11): ${results.length - failed.length}/${results.length} arms pass`)
  process.exit(failed.length === 0 ? 0 : 1)
}

await main()
