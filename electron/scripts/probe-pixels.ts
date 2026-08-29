/**
 * Does a `transparent: true` window actually composite? The first probe in this repo that reads a pixel.
 *
 * ## Why this exists, which is a probe passing for the wrong reason
 *
 * `probe-shell.ts`'s S2 checks six Win32 style bits on the live window, and one of them -- `WS_EX_LAYERED` --
 * was labelled as following from `transparent: true`. Phase 5 removed `main.ts`'s `setOpacity()` call (it is
 * `@platform win32,darwin` and does nothing on Linux, so the opacity product moved to the renderer), and S2
 * went red. Measured, with a four-stage scratch probe on this host:
 *
 *   | window state                                    | layered | transparent_ex |
 *   | `transparent: true`, nothing called             | false   | false          |
 *   | after `setIgnoreMouseEvents(false)`             | false   | false          |
 *   | after `setIgnoreMouseEvents(true)`              | true    | true           |
 *   | after `setOpacity(0.9)`                         | true    | false          |
 *
 * So `WS_EX_LAYERED` was never a consequence of `transparent: true` on this Electron build. It was there
 * because something called `setOpacity`, and S2's green had been reading the right bit off the wrong cause
 * for two phases. Correcting the arm's expectation to match that is right -- but doing it on the strength of
 * the table alone would be rationalising a red gate, because the table cannot distinguish "the bit is
 * irrelevant" from "the bit was load-bearing and the widget is now an opaque box". Nothing else in this repo
 * can either: every arm reads a decision, never an appearance (`probe-display.ts:64` says so).
 *
 * This closes that. See `probe-pixels-app.cjs` for the two-window stack and `screengrab.ps1` for the capture.
 *
 * ## What it does NOT cover
 *
 * The subject is the PLATFORM's handling of a transparent window with the real widget's flags -- not the
 * widget's own drawing. It paints flat colours on purpose: a probe that rendered the clock would be asking
 * two questions and would fail for whichever reason it liked. Nothing here is a WPF comparison, nothing here
 * covers macOS or Linux (`CopyFromScreen` is Windows-only), and nothing here sees the fade -- that is
 * `probe-fade.ts`.
 */

import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnElectron } from "./lib/electron-launch.js"
import { sessionLockState } from "./lib/session-lock.js"

const HERE = import.meta.dirname
const HOST = join(HERE, "probe-pixels-app.cjs")
const SCREENGRAB = join(HERE, "screengrab.ps1")

/**
 * Where the stack is ASKED to go. Small, and away from the taskbar and any corner a notification uses.
 *
 * Mutable, because the host reports the bounds its windows actually landed on and the grab follows those. The
 * first run of this probe grabbed the requested rect and read a uniform near-black at every stage -- which it
 * dutifully reported as "the widget is painting a box", when what it had photographed was Alex's wallpaper.
 */
const RECT = { x: 300, y: 300, w: 200, h: 160 }

/** `#ff00ff` and `#00c800`, mirrored from the host. Both are asserted, so a drift here fails loudly. */
const BACKDROP = { r: 255, g: 0, b: 255 }
const CONTROL = { r: 0, g: 200, b: 0 }

/**
 * How far a captured mean may sit from the colour that was asked for.
 *
 * 12 per channel out of 255, and it is a tolerance for the CAPTURE PATH rather than for the answer: DWM,
 * the display's colour profile and any night-light or HDR mapping all sit between a `#ff00ff` fill and what
 * `CopyFromScreen` reads back. It is nowhere near wide enough to confuse the two colours in play -- magenta
 * and this green differ by 255 in the blue channel -- so a verdict never rests on the tolerance's edge.
 */
const COLOUR_TOLERANCE = 12

interface Grab {
  meanR: number
  meanG: number
  meanB: number
  cells: string[]
}

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string; blocking: boolean }[] = []

function record(
  name: string,
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE",
  detail: string,
  blocking = false,
): void {
  results.push({ name, verdict, detail, blocking })
  console.log(`  → ${verdict}${blocking ? " (blocking)" : ""}: ${detail}\n`)
}

function grab(): Grab | null {
  const run = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SCREENGRAB,
      "-X",
      String(RECT.x),
      "-Y",
      String(RECT.y),
      "-W",
      String(RECT.w),
      "-H",
      String(RECT.h),
    ],
    { encoding: "utf8" },
  )
  const line = run.stdout.split("\n").find((l) => l.startsWith("PROBE-SCREENGRAB "))
  if (line === undefined) {
    console.log(`  screengrab produced no marker. stdout=${run.stdout.slice(0, 300)} stderr=${run.stderr.slice(0, 300)}`)
    return null
  }
  return JSON.parse(line.slice("PROBE-SCREENGRAB ".length)) as Grab
}

/** Distance from a grab's mean to a colour, as the largest single-channel error. */
function distance(g: Grab, to: { r: number; g: number; b: number }): number {
  return Math.max(Math.abs(g.meanR - to.r), Math.abs(g.meanG - to.g), Math.abs(g.meanB - to.b))
}

/** How many of the 64 sampled cells are within tolerance of a colour, as its hex string. */
function uniformity(g: Grab, to: { r: number; g: number; b: number }): number {
  return g.cells.filter((hex) => {
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const gg = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    return (
      Math.abs(r - to.r) <= COLOUR_TOLERANCE &&
      Math.abs(gg - to.g) <= COLOUR_TOLERANCE &&
      Math.abs(b - to.b) <= COLOUR_TOLERANCE
    )
  }).length
}

function describe(g: Grab): string {
  return `mean rgb(${g.meanR.toFixed(0)}, ${g.meanG.toFixed(0)}, ${g.meanB.toFixed(0)})`
}

// ---------------------------------------------------------------------------------------------------

console.log("=== transparency pixel probe ===")

// The lock gate, FIRST and before anything is spawned. See `lib/session-lock.ts` for the run this exists
// because of: locked, every stage read the same near-black, and the probe called it a broken widget.
const lock = sessionLockState()
if (lock.locked) {
  console.log(`  ${lock.detail}`)
  console.log(
    `\n  → INCONCLUSIVE: the workstation is LOCKED, so CopyFromScreen reads black and every arm here would ` +
      `\n    compare one black rectangle against another. Nothing was launched and nothing was measured.` +
      `\n    Unlock the screen and re-run \`bun run probe:pixels\`. Exiting 0: a probe that could not look is ` +
      `\n    not a probe that saw a defect.`,
  )
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), "fc-pixel-"))
const goPath = join(dir, "go.txt")
writeFileSync(goPath, "0", "utf8")
let goCount = 0

console.log(`  ${lock.detail}`)
console.log(`  rect ${String(RECT.x)},${String(RECT.y)} ${String(RECT.w)}x${String(RECT.h)}`)
console.log(`  backdrop #ff00ff, control fill #00c800, tolerance ±${String(COLOUR_TOLERANCE)}/channel\n`)

const host = spawnElectron(HOST, [
  goPath,
  String(RECT.x),
  String(RECT.y),
  String(RECT.w),
  String(RECT.h),
])
const grabs = new Map<string, Grab>()
let stdout = ""
let stderr = ""

host.stderr.on("data", (chunk: Buffer) => {
  stderr += chunk.toString()
})
host.stdout.on("data", (chunk: Buffer) => {
  stdout += chunk.toString()
  const lines = stdout.split("\n")
  stdout = lines.pop() ?? ""
  for (const line of lines) {
    if (line.startsWith("PIXEL-BOUNDS ")) {
      const b = JSON.parse(line.slice("PIXEL-BOUNDS ".length)) as {
        widget: { x: number; y: number; width: number; height: number }
        backdrop: { x: number; y: number; width: number; height: number }
        scale: number
      }
      console.log(
        `  windows landed at ${String(b.widget.x)},${String(b.widget.y)} ` +
          `${String(b.widget.width)}x${String(b.widget.height)} on a ${b.scale.toFixed(2)} scale display` +
          (b.widget.x === RECT.x && b.widget.y === RECT.y ? "" : "  (NOT where they were asked to go)"),
      )
      // Inset by 12 DIP on every side. The window's own outer pixels are where a shadow, a rounded corner or
      // a one-pixel rect rounding lands, and a uniformity check over 64 cells has no tolerance for those.
      const inset = 12
      RECT.x = b.widget.x + inset
      RECT.y = b.widget.y + inset
      RECT.w = Math.max(8, b.widget.width - inset * 2)
      RECT.h = Math.max(8, b.widget.height - inset * 2)
      // The physical pixels `CopyFromScreen` addresses are DIP times the scale factor, and PowerShell is not
      // per-monitor DPI aware -- so at anything but 1.00 the grab must be scaled or it photographs the wrong
      // place. Applied rather than asserted, so the probe works on a scaled display instead of failing on one.
      if (b.scale !== 1) {
        RECT.x = Math.round(RECT.x * b.scale)
        RECT.y = Math.round(RECT.y * b.scale)
        RECT.w = Math.round(RECT.w * b.scale)
        RECT.h = Math.round(RECT.h * b.scale)
      }
      console.log(`  grabbing ${String(RECT.x)},${String(RECT.y)} ${String(RECT.w)}x${String(RECT.h)}\n`)
      continue
    }
    const stage = /^PIXEL-STAGE (\S+)$/.exec(line.trimEnd())
    if (stage === null) continue
    const name = stage[1] as string
    // 500 ms before the grab: a `show()` and a `loadURL` both return before DWM has presented the frame, and
    // a capture that races the presentation reads the PREVIOUS stage -- which for stage 2 is the backdrop,
    // i.e. the exact false green this probe exists to prevent.
    setTimeout(() => {
      const g = grab()
      if (g !== null) {
        grabs.set(name, g)
        console.log(`--- ${name}: ${describe(g)}`)
      }
      goCount += 1
      writeFileSync(goPath, String(goCount), "utf8")
    }, 500)
  }
})

await new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, 60_000)
  host.on("exit", () => {
    clearTimeout(timer)
    resolve()
  })
})
host.kill()
rmSync(dir, { recursive: true, force: true })
if (stderr.trim() !== "") console.log(`  host stderr: ${stderr.slice(0, 600)}\n`)

const backdropOnly = grabs.get("backdrop-only")
const transparent = grabs.get("widget-transparent")
const opaque = grabs.get("widget-opaque")
const again = grabs.get("widget-transparent-again")

// ───────────────────────────────────────────────────────────────────────────────
// X1 — the instrument reads a known colour. Everything below is a comparison, so this is the units.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== X1: the capture path reads the backdrop's own colour ===")
if (backdropOnly === undefined) {
  record("X1 capture reads magenta", "FAIL", "no backdrop-only grab -- see the host stderr above", true)
} else {
  const d = distance(backdropOnly, BACKDROP)
  const u = uniformity(backdropOnly, BACKDROP)
  record(
    "X1 capture reads magenta",
    d <= COLOUR_TOLERANCE && u === backdropOnly.cells.length ? "PASS" : "FAIL",
    `${describe(backdropOnly)}, worst channel off by ${d.toFixed(1)}, ` +
      `${String(u)}/${String(backdropOnly.cells.length)} cells within tolerance`,
    true,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// X2 — the control, FIRST, because it is what licenses X3. Reported before the claim on purpose.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== X2: the widget window is really in front (the control for X3) ===")
if (opaque === undefined || backdropOnly === undefined) {
  record("X2 opaque fill wins the z-fight", "FAIL", "no widget-opaque grab", true)
} else {
  const d = distance(opaque, CONTROL)
  const u = uniformity(opaque, CONTROL)
  const ok = d <= COLOUR_TOLERANCE && u === opaque.cells.length
  record(
    "X2 opaque fill wins the z-fight",
    ok ? "PASS" : "FAIL",
    `${describe(opaque)} against the requested rgb(0, 200, 0) — worst channel off by ${d.toFixed(1)}, ` +
      `${String(u)}/${String(opaque.cells.length)} cells green. ` +
      (ok
        ? `so the same window, with the same flags, does cover the backdrop when it paints — which is what ` +
          `makes X3's magenta mean transparency rather than a window that never showed`
        : `so this probe never photographed the widget window at all, and X3 below is VOID`),
    true,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// X3 — THE CLAIM: transparency composites without WS_EX_LAYERED.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== X3: a transparent window with no setOpacity call still composites ===")
if (transparent === undefined) {
  record("X3 transparency honoured", "FAIL", "no widget-transparent grab", true)
} else {
  const d = distance(transparent, BACKDROP)
  const u = uniformity(transparent, BACKDROP)
  const ok = d <= COLOUR_TOLERANCE && u === transparent.cells.length
  record(
    "X3 transparency honoured",
    ok ? "PASS" : "FAIL",
    `${describe(transparent)} — the backdrop is fully visible through the widget window ` +
      `(${String(u)}/${String(transparent.cells.length)} cells still magenta, worst channel off by ` +
      `${d.toFixed(1)}). ` +
      (ok
        ? `WS_EX_LAYERED is absent in this state and the alpha is honoured anyway: modern Chromium composites ` +
          `translucent windows through DirectComposition, not the legacy layered-window path`
        : `THE WIDGET IS PAINTING A BOX — removing main's setOpacity call broke transparency, and no other ` +
          `gate in this repo can see it`),
    true,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// X4 — and it survives a repaint, which is the state the fade returns to.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== X4: still transparent after painting opaque and going back ===")
if (again === undefined) {
  record("X4 transparency recovers", "INCONCLUSIVE", "no widget-transparent-again grab")
} else {
  const d = distance(again, BACKDROP)
  record(
    "X4 transparency recovers",
    d <= COLOUR_TOLERANCE ? "PASS" : "FAIL",
    `${describe(again)} after a full-opaque paint and back — worst channel off by ${d.toFixed(1)}. ` +
      `The fade's own end state is this one, so a one-way transition would show up here`,
  )
}

console.log("=== summary ===")
for (const r of results) console.log(`  ${r.verdict.padEnd(13)} ${r.blocking ? "*" : " "} ${r.name}`)
const blocking = results.filter((r) => r.blocking)
const failed = blocking.filter((r) => r.verdict !== "PASS")
console.log(
  `\n  ${String(blocking.length - failed.length)}/${String(blocking.length)} blocking arms pass. ` +
    `Bound to Windows and this display: CopyFromScreen is Win32, and the macOS and Linux equivalents of ` +
    `every arm here are unmeasured.`,
)
process.exit(failed.length === 0 ? 0 : 1)
