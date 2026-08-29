/**
 * Phase 3 — ISC-15, ISC-16, ISC-17, ISC-19: the shell, measured off a RUNNING app.
 *
 * ## Why this launches the real `dist/main.js` and reads Win32 style bits back
 *
 * ISC-15's bar is "the overlay window carries the proven flag set, **read back off a live window**",
 * and it says so because the alternative is worthless. Asserting `frame: false, transparent: true,
 * skipTaskbar: true, type: "toolbar"` from the source proves the constructor was CALLED, not that
 * Windows honoured it -- and Chromium silently drops window traits in real conditions (a compositor
 * that refuses layered windows, a `type` it does not recognise, a `setAlwaysOnTop` level that quietly
 * degrades). `garry-desktop` established this discipline for the same reason and its own probe reads
 * `GWL_EXSTYLE`/`GWL_STYLE` off the desktop rather than the repo.
 *
 * ## The arm that makes ISC-16 an actual claim
 *
 * "The overlay is not in Alt-Tab" is an ABSENCE, and an absence proven by an enumerator that found
 * nothing is not proven at all (Algorithm rule 18). `winflags.ps1` therefore computes the shell's
 * documented eligibility rule over EVERY visible window on the desktop and reports two numbers:
 * `altTabTotal` (the positive control -- there must be real Alt-Tab windows, or the probe is blind) and
 * `altTabOurs`, which must be 0.
 *
 * ## An isolated profile, and one file that is never written
 *
 * The app is launched with `--user-data-dir` pointing at a fresh temp directory, so the probe neither
 * reads nor perturbs the dev profile, and the settings file it produces is its own. Alex's live WPF file
 * at `%LOCALAPPDATA%\FuzzyClock\settings.json` IS read -- by the app's own import path, which is the
 * point of arm S6 -- and is never written by anything here.
 *
 * ## What this does NOT prove
 *
 * Drag-to-move (ISC-20) is not exercised: synthesising a drag needs `SendInput`, which moves the real
 * cursor on the real desk, and the geometry it would test is already covered against the recorded C#
 * `Clamp` in `test/window-placement.test.ts`. The gap is that no probe has yet seen the window move
 * under a human hand -- stated rather than papered over, and it is the one Phase 3 arm left for Alex.
 *
 * The style bits are Windows-only. On macOS and Linux every flag arm reports INCONCLUSIVE with the
 * reason, which is ISC-10's carried debt (no host), not a pass.
 */

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULTS } from "../src/core/settings.js"
import { SETTINGS_FILENAME, legacyWpfSettingsPath } from "../src/main/settings-store.js"
import { spawnElectron } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const MAIN = join(HERE, "..", "dist", "main.js")
const FLAGS_PS1 = join(HERE, "winflags.ps1")
const IS_WIN = process.platform === "win32"

/** The constructor's own numbers. A mismatch here is a real defect, not a rounding question. */
const WINDOW_WIDTH = 232
const WINDOW_HEIGHT = 260

const READY_TIMEOUT_MS = 25_000

interface WindowFlags {
  pid: number
  title: string
  toolwindow: boolean
  topmost: boolean
  layered: boolean
  transparent_ex: boolean
  has_caption: boolean
  has_thickframe: boolean
  appwindow: boolean
  altTabEligible: boolean
  x: number
  y: number
  width: number
  height: number
}
interface FlagReport {
  targets: number[]
  altTabTotal: number
  altTabOurs: number
  windows: WindowFlags[]
}

// ---------------------------------------------------------------------------------------------------
// Arms. Blocking-vs-diagnostic split and the exit-code rule are `probe-displays.ts`'s, unchanged: the
// code follows the BLOCKING arms alone, so a host that cannot answer a platform question is not a
// permanent red.
// ---------------------------------------------------------------------------------------------------

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

interface Run {
  pid: number | null
  stdout: string
  stderr: string
  exitCode: number | null
  flags: FlagReport | null
  profileDir: string
}

/** `powershell -File`, and the JSON comes back on a marked line. */
function readFlags(pids: number[]): Promise<FlagReport | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", FLAGS_PS1, "-Pids", pids.join(",")],
      { windowsHide: true },
    )
    let out = ""
    let err = ""
    proc.stdout.on("data", (c: Buffer) => {
      out += c.toString()
    })
    proc.stderr.on("data", (c: Buffer) => {
      err += c.toString()
    })
    proc.on("exit", () => {
      const match = /^PROBE-WINFLAGS (.+)$/m.exec(out)
      if (match === null) {
        console.log(`    winflags produced no marker line.\n      stdout: ${out.slice(0, 300) || "(empty)"}`)
        console.log(`      stderr: ${err.slice(0, 500) || "(empty)"}`)
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(match[1] as string) as FlagReport)
      } catch (e) {
        console.log(`    unparseable winflags payload: ${String(e)}`)
        resolve(null)
      }
    })
    proc.on("error", (e) => {
      console.log(`    powershell failed to start: ${String(e)}`)
      resolve(null)
    })
  })
}

/**
 * Launch the real app into a throwaway profile, wait for `PROBE-READY`, read the flags, quit.
 *
 * The flags are read while the app is still up -- there is no other moment when they exist -- and the
 * process is killed rather than asked to quit: `app.quit()` needs a tray click or an IPC channel this
 * probe does not have, and `before-quit` only reaps the telemetry children, which die with the parent.
 */
async function run(): Promise<Run> {
  const profileDir = mkdtempSync(join(tmpdir(), "fc-shell-profile-"))
  const proc = spawnElectron(MAIN, [`--user-data-dir=${profileDir}`])
  const result: Run = { pid: proc.pid ?? null, stdout: "", stderr: "", exitCode: null, flags: null, profileDir }

  proc.stdout.on("data", (c: Buffer) => {
    result.stdout += c.toString()
  })
  proc.stderr.on("data", (c: Buffer) => {
    result.stderr += c.toString()
  })

  const ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS)
    const check = setInterval(() => {
      if (/^PROBE-READY /m.test(result.stdout)) {
        clearInterval(check)
        clearTimeout(timer)
        resolve(true)
      }
    }, 100)
    proc.on("exit", () => {
      clearInterval(check)
      clearTimeout(timer)
      resolve(/^PROBE-READY /m.test(result.stdout))
    })
  })

  if (ready && IS_WIN && result.pid !== null) {
    // A moment for the window to be mapped and for `ready-to-show` -> `show()` to have taken effect.
    // `PROBE-READY` is printed inside that handler, so the show has been *requested*; the style bits are
    // read from the desktop, which is one message pump behind.
    await new Promise((r) => setTimeout(r, 1_500))
    result.flags = await readFlags([result.pid])
  }

  // Waiting for the paint counter is what makes S7 discriminating: `PROBE-PAINTS` is on a 5s interval.
  if (ready) await new Promise((r) => setTimeout(r, 5_500))

  proc.kill()
  await new Promise<void>((resolve) => {
    proc.on("exit", (code) => {
      result.exitCode = code
      resolve()
    })
    setTimeout(resolve, 3_000)
  })
  return result
}

console.log("=== launching the real app into a throwaway profile ===")
if (!existsSync(MAIN)) {
  console.log(`  ${MAIN} is missing -- run \`bun run build\` first.`)
  process.exit(1)
}

const r = await run()
console.log(`  pid ${String(r.pid)}, profile ${r.profileDir}`)
for (const line of r.stdout.split("\n").filter((l) => l.trim() !== "")) console.log(`    ${line}`)
if (r.stderr.trim() !== "") console.log(`  stderr: ${r.stderr.slice(0, 600)}`)

const readyLine = /^PROBE-READY pid=(\d+)$/m.exec(r.stdout)
// `on (.+?)` rather than `(\S+)`: the key itself has no spaces, but the no-display case logs the
// literal "no display", and a `\S+` here would silently fail to match exactly the run worth reading.
const restoredLine = /^\[main] info placement: restored to \((-?[\d.]+), (-?[\d.]+)\) on (.+?) via (\S+)(.*)$/m.exec(
  r.stdout,
)
const loadedLine = /^\[main] info settings: loaded from (\S+) \((.+)\)$/m.exec(r.stdout)
const paintsLines = [...r.stdout.matchAll(/^PROBE-PAINTS (\d+)$/gm)].map((m) => Number(m[1]))
const ours = r.flags?.windows ?? []

// ───────────────────────────────────────────────────────────────────────────────
// S1 — the app starts and shows a window. The denominator for everything below.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S1: the packaged main process starts and reaches ready-to-show ===")
if (readyLine === null) {
  record(
    "S1 app starts",
    "FAIL",
    `no PROBE-READY within ${String(READY_TIMEOUT_MS / 1000)}s -- see the output above. An Electron ` +
      `started with ELECTRON_RUN_AS_NODE set exits 0 with a stack trace, which is why stdio is printed`,
    true,
  )
} else {
  record("S1 app starts", "PASS", `PROBE-READY from pid ${String(readyLine[1])}, window shown`, true)
}

// ───────────────────────────────────────────────────────────────────────────────
// S2 — ISC-15: the flag set, off the live window.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S2 (ISC-15): the live window's Win32 style bits ===")
if (!IS_WIN) {
  record(
    "S2 window flags",
    "INCONCLUSIVE",
    `${process.platform} has no GWL_EXSTYLE. The macOS equivalents (accessory activation policy, ` +
      `visible-on-all-workspaces) and the Linux ones need their own host -- ISC-10's carried debt`,
  )
} else if (r.flags === null) {
  record("S2 window flags", "INCONCLUSIVE", "the flag reader produced nothing -- see above", true)
} else if (ours.length !== 1) {
  record(
    "S2 window flags",
    "FAIL",
    `expected exactly 1 visible window for pid ${String(r.pid)}, found ${String(ours.length)}` +
      (ours.length > 1 ? `: ${ours.map((w) => JSON.stringify(w.title)).join(", ")}` : ""),
    true,
  )
} else {
  const w = ours[0] as WindowFlags
  console.log(
    `    title ${JSON.stringify(w.title)}  rect ${String(w.x)},${String(w.y)} ` +
      `${String(w.width)}x${String(w.height)}`,
  )
  // Each expectation names the option that should have produced it, so a red says WHICH line to look at.
  const expected: { flag: keyof WindowFlags; want: boolean; from: string }[] = [
    { flag: "toolwindow", want: true, from: 'type: "toolbar" + skipTaskbar: true' },
    { flag: "topmost", want: true, from: 'setAlwaysOnTop(true, "screen-saver")' },
    { flag: "layered", want: true, from: "transparent: true" },
    { flag: "has_caption", want: false, from: "frame: false" },
    { flag: "has_thickframe", want: false, from: "frame: false + resizable: false" },
    { flag: "appwindow", want: false, from: "nothing sets it -- it would force us INTO Alt-Tab" },
  ]
  const bad = expected.filter((e) => w[e.flag] !== e.want)
  for (const e of expected) {
    console.log(`    ${String(w[e.flag] === e.want ? "ok  " : "BAD ")} ${e.flag}=${String(w[e.flag])}  (${e.from})`)
  }
  if (bad.length > 0) {
    record(
      "S2 window flags",
      "FAIL",
      `${String(bad.length)} of ${String(expected.length)} style bits are wrong: ` +
        bad.map((e) => `${e.flag} is ${String(w[e.flag])}, want ${String(e.want)} (${e.from})`).join("; "),
      true,
    )
  } else {
    record(
      "S2 window flags",
      "PASS",
      `all ${String(expected.length)} style bits read off the live window as required: toolwindow, ` +
        `topmost and layered set; caption, thickframe and appwindow clear`,
      true,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// S3 — ISC-16: not in Alt-Tab, with a positive control.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S3 (ISC-16): the overlay is absent from Alt-Tab, and the enumerator can see ===")
if (!IS_WIN) {
  record("S3 alt-tab absence", "INCONCLUSIVE", `no Alt-Tab on ${process.platform}; Cmd-Tab needs a macOS host`)
} else if (r.flags === null) {
  record("S3 alt-tab absence", "INCONCLUSIVE", "no flag report", true)
} else if (r.flags.altTabTotal === 0) {
  record(
    "S3 alt-tab absence",
    "INCONCLUSIVE",
    `altTabOurs=0 but altTabTotal=0 as well, so the enumerator found no Alt-Tab windows AT ALL. ` +
      `The zero is not evidence -- an empty desktop and a broken enumerator give the same answer`,
    true,
  )
} else if (r.flags.altTabOurs !== 0) {
  record(
    "S3 alt-tab absence",
    "FAIL",
    `${String(r.flags.altTabOurs)} of our windows are Alt-Tab eligible out of ` +
      `${String(r.flags.altTabTotal)} on the desktop`,
    true,
  )
} else {
  record(
    "S3 alt-tab absence",
    "PASS",
    `0 of our windows are Alt-Tab eligible while ${String(r.flags.altTabTotal)} other windows ARE -- ` +
      `the control that makes the absence discriminating`,
    true,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// S4 — the window is the size the constructor asked for, and where placement put it.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S4 (ISC-19): the live rect matches what placement decided ===")
if (!IS_WIN || ours.length !== 1 || restoredLine === null) {
  record(
    "S4 live rect",
    "INCONCLUSIVE",
    !IS_WIN
      ? `GetWindowRect is Windows-only`
      : restoredLine === null
        ? "no placement line in the app's own log"
        : "no single window to measure",
  )
} else {
  const w = ours[0] as WindowFlags
  const wantX = Math.round(Number(restoredLine[1]))
  const wantY = Math.round(Number(restoredLine[2]))
  const sized = w.width === WINDOW_WIDTH && w.height === WINDOW_HEIGHT
  const placed = w.x === wantX && w.y === wantY
  if (sized && placed) {
    // The source is named in the verdict on purpose. `via key` means a saved position was found and
    // honoured; anything else means this run agreed with placement about a position placement CHOSE,
    // which is a weaker claim than "the saved position survived a restart" and must not be read as it.
    const source = String(restoredLine[4])
    record(
      "S4 live rect",
      "PASS",
      `live rect ${String(w.x)},${String(w.y)} ${String(w.width)}x${String(w.height)} equals the ` +
        `placement decision (${String(wantX)}, ${String(wantY)}) via ${source} on ` +
        `${String(restoredLine[3])}` +
        (source === "key"
          ? ""
          : ` -- NOTE: source is "${source}", not "key", so this run did NOT exercise restoring a ` +
            `saved position. Covered against recorded C# values in test/window-placement.test.ts; ` +
            `unexercised live`),
    )
  } else {
    record(
      "S4 live rect",
      "FAIL",
      `live rect ${String(w.x)},${String(w.y)} ${String(w.width)}x${String(w.height)} vs expected ` +
        `${String(wantX)},${String(wantY)} ${String(WINDOW_WIDTH)}x${String(WINDOW_HEIGHT)}. ` +
        `GetWindowRect is in PHYSICAL PIXELS and Electron's setPosition is in DIPs, so a display at a ` +
        `scale factor other than 1.00 makes these disagree legitimately -- check the scale before ` +
        `reading this as a placement bug`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// S5 — ISC-17: settings survive the round trip through a real app start.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S5 (ISC-17): the app loads settings, into ITS OWN profile, and writes its own file ===")
{
  const written = join(r.profileDir, SETTINGS_FILENAME)
  const expectedFields = Object.keys(DEFAULTS).length
  if (loadedLine === null) {
    record("S5 settings round trip", "FAIL", "no `settings: loaded from` line -- the store never ran", true)
  } else if (!(loadedLine[2] as string).startsWith(r.profileDir)) {
    // The isolation claim, checked rather than trusted. `--user-data-dir` is a Chromium switch and
    // nothing in this repo owns it, so if a future Electron stops honouring it this arm says so --
    // instead of the probe quietly measuring, and writing to, the dev profile.
    record(
      "S5 settings round trip",
      "FAIL",
      `the app read settings from ${String(loadedLine[2])}, which is NOT inside the throwaway profile ` +
        `${r.profileDir} -- --user-data-dir was not honoured and this run touched the real profile`,
      true,
    )
  } else if (!existsSync(written)) {
    // Not a failure by itself: `main.ts` writes on startup only when there was an import, a clamp, or a
    // non-`key` source. All three false means there was nothing to commit.
    record(
      "S5 settings round trip",
      "INCONCLUSIVE",
      `loaded from ${String(loadedLine[1])} in the right directory, but no file at ${written}. Correct ` +
        `only if the run had nothing to commit: no import, an exact key match and no clamp`,
    )
  } else {
    try {
      const parsed = JSON.parse(readFileSync(written, "utf8")) as Record<string, unknown>
      const fields = Object.keys(parsed).length
      record(
        "S5 settings round trip",
        fields === expectedFields ? "PASS" : "FAIL",
        `loaded from ${String(loadedLine[1])} inside its own profile; wrote ${String(fields)} fields ` +
          `(expected ${String(expectedFields)}, counted off DEFAULTS rather than hardcoded), ` +
          `lastActiveMonitor=${JSON.stringify(parsed["lastActiveMonitor"])}`,
        true,
      )
    } catch (e) {
      record("S5 settings round trip", "FAIL", `the file it wrote is unparseable: ${String(e)}`, true)
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// S6 — ISC-18, live: the import ran against the real WPF file.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S6 (ISC-18): the WPF import, against Alex's actual settings file ===")
{
  const importLine = /^\[main] info settings: imported from (.+?) -- (.+)$/m.exec(r.stdout)
  // The app's own resolver, not a second copy of the path. A probe that hardcoded
  // `%LOCALAPPDATA%\FuzzyClock\settings.json` would keep passing after the resolver moved.
  const wpfPath = legacyWpfSettingsPath()
  if (wpfPath === null || !existsSync(wpfPath)) {
    record(
      "S6 live wpf import",
      "INCONCLUSIVE",
      `no WPF file at ${wpfPath ?? "(resolver returned null: not win32, or LOCALAPPDATA unset)"} -- ` +
        `the unit tests cover the translation ` +
        `against an embedded copy, but nothing here exercises it against the real one`,
    )
  } else if (importLine === null) {
    record(
      "S6 live wpf import",
      "FAIL",
      `${wpfPath} exists and the profile was empty, so the import should have run and logged`,
    )
  } else {
    record("S6 live wpf import", "PASS", `imported from the live file: ${String(importLine[2])}`)
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// S7 — the renderer really painted. Guards the failure that looks like success.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S7: the renderer painted, so a blank window cannot pass as a working one ===")
if (paintsLines.length === 0) {
  record("S7 renderer paints", "INCONCLUSIVE", "no PROBE-PAINTS line -- the run may have been too short")
} else {
  const last = paintsLines[paintsLines.length - 1] as number
  if (last === 0) {
    record(
      "S7 renderer paints",
      "FAIL",
      `0 paints after ${String(paintsLines.length * 5)}s. A transparent window with nothing in it is ` +
        `visually identical to a working overlay on a dark desktop -- this is the arm that caught ` +
        `dist/dist/index.html`,
      true,
    )
  } else {
    record("S7 renderer paints", "PASS", `${String(last)} paints reported (${paintsLines.join(", ")})`, true)
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// S8 — the click-through bit is CLEAR, which is Phase 5's starting state.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== S8 (Phase 5 pre-state): WS_EX_TRANSPARENT is clear while ghost mode is unwired ===")
if (!IS_WIN || ours.length !== 1) {
  record("S8 click-through clear", "INCONCLUSIVE", "no single Windows window to read")
} else {
  const w = ours[0] as WindowFlags
  record(
    "S8 click-through clear",
    w.transparent_ex ? "FAIL" : "PASS",
    w.transparent_ex
      ? `WS_EX_TRANSPARENT is SET with no ghost mode wired -- the widget would already be swallowing ` +
        `clicks it should receive, and RMB-03 would be unreachable`
      : `WS_EX_TRANSPARENT clear, so the widget receives its own clicks. Phase 5 sets it via ` +
        `setIgnoreMouseEvents and this becomes the before-half of ISC-24`,
  )
}

// Cleanup, and it is NOT allowed to fail the run. Measured: a bare `rmSync` here threw EBUSY on a run
// where all eight arms had already passed. `proc.kill()` reaps the main process, but Chromium's GPU and
// renderer children outlive it by a moment and hold the profile's lock file open -- so the probe reported
// eight greens and then exited 1 for a reason that has nothing to do with the shell. Retry, then say what
// was left behind: a stray temp profile is litter, not a finding.
for (let attempt = 1; ; attempt++) {
  try {
    rmSync(r.profileDir, { recursive: true, force: true })
    break
  } catch (e) {
    if (attempt >= 6) {
      console.log(`  note: could not remove ${r.profileDir} (${String(e)}) -- left for the OS to reap`)
      break
    }
    await new Promise((res) => setTimeout(res, 500))
  }
}

console.log("=== summary ===")
for (const x of results) {
  console.log(`${x.verdict.padEnd(13)} ${x.blocking ? "[blocking] " : "[diagnostic]"} ${x.name}`)
}
const passed = results.filter((x) => x.verdict === "PASS").length
const failed = results.filter((x) => x.verdict === "FAIL").length
const inconclusive = results.filter((x) => x.verdict === "INCONCLUSIVE").length
const blockingBad = results.filter((x) => x.blocking && x.verdict !== "PASS")
console.log(
  `\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive` +
    ` -- ${String(blockingBad.length)} blocking`,
)
console.log(
  "\nBound: one launch on this host, this desk, at scale 1.00. NOT proven: drag-to-move under a human\n" +
    "hand (ISC-20's live half), the macOS and Linux equivalents of every flag arm, or behaviour over a\n" +
    "monitor unplug -- the last is covered against a fake screen in test/window-placement.test.ts and\n" +
    "has never been seen on real hardware.",
)
process.exit(blockingBad.length > 0 ? 1 : 0)
