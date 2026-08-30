/**
 * The X11 twin of `scripts/winflags.ps1`'s Alt-Tab arm (ISC-16 / ISC-15, Linux half; port plan task L4).
 *
 * `winflags.ps1` proves "the overlay is not in the Alt-Tab switcher" the only way that claim can be
 * evidence: it computes the shell's *eligibility rule* over **every** visible window on the display and
 * reports two numbers -- how many windows are eligible in total, and whether ours is one of them. Without
 * the denominator, "our window is not in the switcher" and "this enumerator found nothing" are the same
 * zero, and a broken probe reads as a pass. This file is that arm for X11 / EWMH.
 *
 * ## The eligibility rule
 *
 * There is no single spec for "what Alt-Tab shows", but every EWMH task switcher (GNOME Shell, the
 * Mutter/Metacity Alt-Tab, KWin, xfwm4) converges on the same predicate, and it is the one
 * `_NET_CLIENT_LIST` consumers are expected to filter by:
 *
 *   - the window is **managed and not withdrawn** -- it appears in `_NET_CLIENT_LIST` and its `WM_STATE`
 *     is `Normal` (1) or `Iconic` (3), not `Withdrawn` (0);
 *   - it has a **human title** -- `_NET_WM_NAME` or `WM_NAME` is a non-empty string;
 *   - its `_NET_WM_WINDOW_TYPE` is **not** one of the chrome types a switcher skips:
 *     `_TOOLBAR`, `_DOCK`, `_DESKTOP`, `_SPLASH`, `_MENU`, `_DROPDOWN_MENU`, `_POPUP_MENU`,
 *     `_TOOLTIP`, `_NOTIFICATION`, `_COMBO`, `_DND`, `_UTILITY`;
 *   - its `_NET_WM_STATE` does **not** contain `_NET_WM_STATE_SKIP_TASKBAR`.
 *
 * The overlay sets `type: "toolbar"` and Chromium additionally adds `_NET_WM_STATE_SKIP_TASKBAR` /
 * `_SKIP_PAGER`, so it fails the predicate on two independent counts. This probe checks the *result*, not
 * the source -- it reads the atoms back off the live X server via `xprop`, exactly as `winflags.ps1`
 * reads `GWL_EXSTYLE` back via `GetWindowLong` rather than trusting the `BrowserWindow` constructor.
 *
 * ## Discriminating power (claim 18)
 *
 *   - **positive control / denominator:** `ALT_TAB_TOTAL` is the count of *other* windows that pass the
 *     predicate on this display. The run fails if it is 0, because that means the enumerator is broken and
 *     any absence it reports is meaningless.
 *   - **subject found:** the run fails if it cannot locate the overlay's own window by `_NET_WM_PID` /
 *     `WM_CLASS`, because "not in the eligible set" is only evidence once we know the window is on the
 *     display at all.
 *   - the verdict is `ours ∉ eligible  AND  total > 0  AND  subject located`.
 *
 * Run: `bun scripts/altflags-x11.ts`  (Linux/X11 only; needs `wmctrl` or a compositor exporting
 * `_NET_CLIENT_LIST`, `xprop`, and a running X server).
 */

import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const APPIMAGE = join(import.meta.dirname, "..", "release", "FuzzyClock-5.0.0-alpha.0.AppImage")

const CHROME_TYPES = new Set([
  "_NET_WM_WINDOW_TYPE_TOOLBAR",
  "_NET_WM_WINDOW_TYPE_DOCK",
  "_NET_WM_WINDOW_TYPE_DESKTOP",
  "_NET_WM_WINDOW_TYPE_SPLASH",
  "_NET_WM_WINDOW_TYPE_MENU",
  "_NET_WM_WINDOW_TYPE_DROPDOWN_MENU",
  "_NET_WM_WINDOW_TYPE_POPUP_MENU",
  "_NET_WM_WINDOW_TYPE_TOOLTIP",
  "_NET_WM_WINDOW_TYPE_NOTIFICATION",
  "_NET_WM_WINDOW_TYPE_COMBO",
  "_NET_WM_WINDOW_TYPE_DND",
  "_NET_WM_WINDOW_TYPE_UTILITY",
])

interface WinInfo {
  id: string
  pid: number | null
  name: string
  wmState: string
  types: string[]
  states: string[]
  wmClass: string
  eligible: boolean
  reasons: string[]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function xprop(id: string, ...props: string[]): string {
  const r = spawnSync("xprop", ["-id", id, ...props], { encoding: "utf8" })
  return r.status === 0 ? r.stdout : ""
}

function atomList(block: string, key: string): string[] {
  const line = block.split("\n").find((l) => l.startsWith(`${key}(`))
  if (line === undefined) return []
  const rhs = line.slice(line.indexOf("=") + 1)
  return rhs
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter((s) => s.length > 0)
}

function firstString(block: string, keys: string[]): string {
  for (const key of keys) {
    const line = block.split("\n").find((l) => l.startsWith(`${key}(`))
    if (line === undefined) continue
    const m = /=\s*"(.*)"\s*$/.exec(line)
    if (m && m[1] !== undefined) return m[1]
  }
  return ""
}

function classify(id: string): WinInfo {
  const block = xprop(
    id,
    "_NET_WM_PID",
    "_NET_WM_WINDOW_TYPE",
    "_NET_WM_STATE",
    "WM_STATE",
    "_NET_WM_NAME",
    "WM_NAME",
    "WM_CLASS",
  )
  const pidLine = block.split("\n").find((l) => l.startsWith("_NET_WM_PID("))
  const pid = pidLine ? Number.parseInt(pidLine.slice(pidLine.indexOf("=") + 1).trim(), 10) : null
  const name = firstString(block, ["_NET_WM_NAME", "WM_NAME"])
  const types = atomList(block, "_NET_WM_WINDOW_TYPE")
  const states = atomList(block, "_NET_WM_STATE")
  const wmClass = atomList(block, "WM_CLASS").join(",")
  const wmStateLine = block.split("\n").find((l) => l.includes("window state:")) ?? ""
  const wmState = /window state:\s*(\w+)/.exec(wmStateLine)?.[1] ?? (block.includes("WM_STATE(") ? "?" : "none")

  const reasons: string[] = []
  if (wmState === "Withdrawn" || wmState === "none") reasons.push(`WM_STATE=${wmState}`)
  if (name.length === 0) reasons.push("no title")
  for (const t of types) if (CHROME_TYPES.has(t)) reasons.push(`type ${t}`)
  if (states.includes("_NET_WM_STATE_SKIP_TASKBAR")) reasons.push("SKIP_TASKBAR")
  return { id, pid, name, wmState, types, states, wmClass, eligible: reasons.length === 0, reasons }
}

interface Overlay {
  pid: number
  log: () => string
  kill: () => Promise<void>
}

async function launchOverlay(): Promise<Overlay> {
  const udd = mkdtempSync(join(tmpdir(), "fc-altflags-"))
  const env = { ...process.env }
  for (const k of ["ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE", "ELECTRON_ENABLE_LOGGING"]) delete env[k]
  const child = spawn(APPIMAGE, ["--no-sandbox", `--user-data-dir=${udd}`], { env, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  child.stdout.on("data", (b: Buffer) => (out += b.toString()))
  child.stderr.on("data", (b: Buffer) => (out += b.toString()))

  const started = Date.now()
  while (!out.includes("PROBE-READY") && Date.now() - started < 25_000) await sleep(250)
  if (!out.includes("PROBE-READY")) {
    child.kill("SIGKILL")
    rmSync(udd, { recursive: true, force: true })
    throw new Error(`overlay never printed PROBE-READY within 25s:\n${out}`)
  }
  // one more repaint tick so the window is mapped and the WM has applied _NET_WM_STATE
  await sleep(1500)
  return {
    pid: child.pid ?? -1,
    log: () => out,
    kill: async () => {
      child.kill("SIGTERM")
      await sleep(1200)
      child.kill("SIGKILL")
      rmSync(udd, { recursive: true, force: true })
    },
  }
}

async function main(): Promise<void> {
  if (process.platform !== "linux") {
    console.error("altflags-x11: Linux/X11 only")
    process.exit(2)
  }
  const overlay = await launchOverlay()
  let failed = true
  try {
    const rootBlock = spawnSync("xprop", ["-root", "_NET_CLIENT_LIST"], { encoding: "utf8" }).stdout
    const ids = (rootBlock.match(/0x[0-9a-fA-F]+/g) ?? []).map((h) => "0x" + h.slice(2).padStart(8, "0").toLowerCase())
    if (ids.length === 0) {
      console.error("altflags-x11: _NET_CLIENT_LIST empty — broken enumerator, no verdict")
      return
    }
    const wins = ids.map(classify)
    const ours = wins.filter((w) => w.pid === overlay.pid || w.wmClass.split(",").includes("fuzzyclock"))
    const others = wins.filter((w) => !ours.includes(w))
    const eligibleOthers = others.filter((w) => w.eligible)
    const oursEligible = ours.filter((w) => w.eligible)

    console.log(`\nALT_TAB_TOTAL (eligible windows, ours excluded) = ${eligibleOthers.length}`)
    console.log("eligible windows on this display:")
    for (const w of eligibleOthers) {
      console.log(`  ${w.id}  pid=${String(w.pid)}  [${w.wmClass}]  "${w.name.slice(0, 58)}"`)
    }
    console.log("\nour overlay window(s):")
    if (ours.length === 0) console.log("  (none found — subject not located)")
    for (const w of ours) {
      console.log(
        `  ${w.id}  pid=${String(w.pid)}  [${w.wmClass}]  "${w.name}"\n` +
          `      types=[${w.types.join(",")}]  states=[${w.states.join(",")}]\n` +
          `      eligible=${String(w.eligible)}  excluded-because=[${w.reasons.join("; ")}]`,
      )
    }

    const subjectFound = ours.length > 0
    const denominatorOk = eligibleOthers.length > 0
    const oursExcluded = oursEligible.length === 0
    console.log("\n--- verdict ---")
    console.log(`subject located          : ${subjectFound ? "PASS" : "FAIL"}`)
    console.log(`denominator (total > 0)  : ${denominatorOk ? `PASS (${eligibleOthers.length})` : "FAIL (0)"}`)
    console.log(`overlay excluded         : ${oursExcluded ? "PASS" : "FAIL"}`)
    failed = !(subjectFound && denominatorOk && oursExcluded)
    console.log(`\nALT-TAB EXCLUSION: ${failed ? "FAIL" : "PASS"}`)
  } finally {
    await overlay.kill()
  }
  process.exit(failed ? 1 : 0)
}

await main()
