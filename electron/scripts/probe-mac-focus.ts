/**
 * Phase 6.5 — does the settings window take keyboard focus on macOS, where this app is an accessory?
 *
 * ## The claim this started as, and why it needed a host rather than an argument
 *
 * `hideFromAppSwitcher()` calls `app.dock.hide()`, which puts the process under the accessory activation
 * policy — no Dock tile, no Cmd-Tab entry. `settings-window.ts` carried an `app.focus({ steal: true })` and a
 * docblock reasoning from that policy: an accessory app does not become the active application merely because
 * one of its windows is shown, and an app that is not active has no key window, so the settings window could
 * sit in front of everything while the keystrokes kept going to whatever the user was last typing in.
 *
 * That was never watched — it was marked UNVERIFIED in the source. The plan's phrasing for whoever got a mac
 * was "open the window, type, and see where the characters land", which is a transcript, not an instrument.
 * This is the instrument, and the substitution it makes is `win.isFocused()`: on macOS that is the window's
 * key status, and key status is what decides where typed characters go. A window that is visible and never
 * key IS the described failure, with nobody typing.
 *
 * ## What it found, and why the call is gone
 *
 * `win.show()` is `makeKeyAndOrderFront`, which activates the app on its own. Measured on macOS 26.6.2 /
 * Electron 33.4.11, from a genuinely deactivated accessory app, the settings window takes key focus on both
 * of the module's paths with no `app.focus` anywhere (F2, F3). The premise — shown does not mean active — does
 * not hold for `show()`, so the call was redundant.
 *
 * Then the controls found the half no amount of reading would have. Cut `show()` back to
 * `orderFrontRegardless` and put the deleted call back, and it activates the app but the key window becomes
 * the OVERLAY — a click-through widget with nothing to type into (F5). On the one path where it could have
 * mattered it aimed at the wrong window. Redundant where it fired, wrong where it would have been needed.
 *
 * So F2 and F3 pin a measurement rather than a wish, and that is deliberate: they are the arms that go red the
 * day `show()` stops carrying this, which is the day something has to replace what was deleted. An arm
 * asserting the behaviour we want, with controls proving it can fail, is worth more than a line of code kept
 * because nobody measured it.
 *
 * ## Three modes, because a single green here would prove nothing
 *
 * - `shipped` — the module as it stands. F1-F3, including `app.focus` call count zero, which is the arm
 *   standing guard against the deleted line coming back unmeasured.
 * - `no-activate` — `BrowserWindow.prototype.show` swapped for `showInactive`, i.e. `orderFrontRegardless`
 *   instead of `makeKeyAndOrderFront`. This is the Rule 18 control: it manufactures the visible-but-never-key
 *   failure, and F4 requires the probe to catch it. Without it, F2 and F3 could not distinguish "the window
 *   took focus" from "isFocused() always reads true here". It also shows nothing ELSE in the module activates
 *   the app — no window of ours takes key in this mode at all.
 * - `with-focus` — `no-activate` plus the deleted `app.focus({ steal: true })`, restored in the position it
 *   held. This is what keeps the reason for the deletion reproducible from the repo rather than surviving as
 *   a claim in a changelog. F5 is the finding; F6 is its honest limit — on the create-or-focus path the
 *   restored call DOES make the window key, so the one condition where it did anything is a condition the
 *   shipped `show()` never creates.
 *
 * ## Scope
 *
 * darwin only, and it exits non-zero rather than pretending on anything else — a probe for a
 * platform-conditional question has nothing to say on the platforms that do not raise it.
 */

import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildSettingsForm } from "../src/core/settings-form.js"
import { DEFAULTS } from "../src/core/settings.js"
import { IS_MAC } from "../src/platform.js"
import { cleanElectronEnv, electronBinaryPath } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const HOST_SCRIPT = join(HERE, "probe-mac-focus-app.cjs")
const DIST = join(HERE, "..", "dist")

type Mode = "shipped" | "no-activate" | "with-focus"

interface Phase {
  deactivated?: boolean
  deactivateSamples?: number
  samples?: number
  visible?: boolean
  everFocused?: boolean
  focusedAtEnd?: boolean
  overlayEverFocused?: boolean
}

interface Observed {
  mode?: string
  logs?: string[]
  dockVisible?: boolean | null
  focusPatched?: boolean
  showPatched?: boolean
  focusCalls?: number
  phases?: Record<string, Phase>
  focusEvents?: string[]
  failure?: string | null
}

/**
 * Whatever the user had in front, so it can be put back. `lsappinfo` rather than System Events: reading the
 * frontmost app through UI scripting would prompt for an Accessibility grant on a borrowed host, and a probe
 * that leaves a permission dialog behind has cost more than it measured.
 *
 * Best-effort by design — `null` means the restore is skipped and said so, not that the run is invalid.
 */
function frontmostApp(): string | null {
  const front = Bun.spawnSync(["lsappinfo", "front"])
  if (front.exitCode !== 0) return null
  const info = Bun.spawnSync(["lsappinfo", "info", "-only", "name", front.stdout.toString().trim()])
  if (info.exitCode !== 0) return null
  return /="([^"]+)"/.exec(info.stdout.toString())?.[1] ?? null
}

const arms: { id: string; claim: string; pass: boolean; detail: string }[] = []

function eq(id: string, claim: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  arms.push({ id, claim, pass: a === e, detail: a === e ? a : `got ${a}, expected ${e}` })
}

const workDir = mkdtempSync(join(tmpdir(), "fuzzyclock-probe-macfocus-"))
const hostBundle = join(workDir, "settings-window-host.cjs")
const platformBundle = join(workDir, "platform.cjs")
const formPath = join(workDir, "form.json")

function bundle(source: string, outfile: string): void {
  const built = Bun.spawnSync([
    "bun",
    "build",
    join(HERE, "..", source),
    "--outfile",
    outfile,
    "--format",
    "cjs",
    "--target",
    "node",
    "--external",
    "electron",
  ])
  if (built.exitCode !== 0) throw new Error(`bundling ${source} failed:\n${built.stderr.toString()}`)
}

function runHost(mode: Mode): Promise<Observed> {
  return new Promise((resolve, reject) => {
    // A fresh profile per run, so no run can inherit window state from another.
    const profileDir = join(workDir, `profile-${mode}`)
    const child = spawn(
      electronBinaryPath(),
      [HOST_SCRIPT, hostBundle, platformBundle, DIST, formPath, mode, `--user-data-dir=${profileDir}`],
      { env: cleanElectronEnv() },
    )
    let out = ""
    let err = ""
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString()
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${mode} run did not finish in 120s\nstdout:\n${out}\nstderr:\n${err}`))
    }, 120_000)
    child.on("exit", (code) => {
      clearTimeout(timer)
      const line = out.split(/\r?\n/).find((l) => l.startsWith("PROBE_RESULT "))
      if (line === undefined) {
        reject(new Error(`${mode} run exited ${String(code)} with no PROBE_RESULT\nstdout:\n${out}\nstderr:\n${err}`))
        return
      }
      resolve(JSON.parse(line.slice("PROBE_RESULT ".length)) as Observed)
    })
  })
}

const EMPTY: Phase = {}

async function main(): Promise<void> {
  if (!IS_MAC) {
    console.error(
      `probe-mac-focus: darwin only — the branch under test is skipped on ${process.platform}, so there is` +
        " nothing here to measure. Not a pass.",
    )
    process.exitCode = 1
    return
  }

  bundle(join("src", "main", "settings-window.ts"), hostBundle)
  bundle(join("src", "platform.ts"), platformBundle)
  writeFileSync(formPath, JSON.stringify(buildSettingsForm(DEFAULTS, "en")))

  // Every phase hands focus to Finder, so whatever the user was in front of goes back afterwards.
  const wasFrontmost = frontmostApp()
  console.log(
    `probe-mac-focus: frontmost app before the run: ${wasFrontmost ?? "unreadable — restore will be skipped"}`,
  )

  // Sequential, not parallel: two accessory apps racing to activate would make every reading unattributable.
  const runs: Partial<Record<Mode, Observed>> = {}
  try {
    for (const mode of ["shipped", "no-activate", "with-focus"] as const) runs[mode] = await runHost(mode)
  } finally {
    if (wasFrontmost !== null) {
      const restored = Bun.spawnSync(["open", "-a", wasFrontmost])
      console.log(`probe-mac-focus: restored ${wasFrontmost} to the front (exit ${String(restored.exitCode)})`)
    }
  }

  const shipped = runs.shipped ?? {}
  const noActivate = runs["no-activate"] ?? {}
  const withFocus = runs["with-focus"] ?? {}
  const p = (run: Observed, name: "first" | "second"): Phase => run.phases?.[name] ?? EMPTY

  for (const [label, run] of Object.entries(runs)) {
    if (run?.failure) console.error(`probe-mac-focus: the ${label} host threw:\n${run.failure}`)
  }

  eq("F0", "the accessory policy applied in all three runs (dock hidden)",
    [shipped.dockVisible, noActivate.dockVisible, withFocus.dockVisible], [false, false, false])
  // Without this the focus arms are unattributable rather than wrong, and that is not a distinction to leave
  // to the reader: a freshly launched app is already active, and the first version of this probe graded
  // against exactly that state and read the shipped call redundant for the wrong reason.
  eq("F0b", "all six phases reached 'not the active app' before acting — what makes the rest comparable",
    [shipped, noActivate, withFocus].flatMap((r) => [p(r, "first").deactivated, p(r, "second").deactivated]),
    [true, true, true, true, true, true])

  eq("F1", "shipped, cold open: the window is visible", p(shipped, "first").visible, true)
  eq("F2", "shipped, cold open: show() alone took key focus, with app.focus never called",
    [p(shipped, "first").everFocused, shipped.focusCalls], [true, 0])
  eq("F3", "shipped, create-or-focus (a second tray click): key focus there too, still no app.focus",
    [p(shipped, "second").everFocused, shipped.focusCalls], [true, 0])

  eq("F4", "control: show()→showInactive and NO window of ours ever takes key, on either path",
    [noActivate.showPatched, p(noActivate, "first").visible, p(noActivate, "second").visible,
      p(noActivate, "first").everFocused, p(noActivate, "second").everFocused,
      p(noActivate, "first").overlayEverFocused, noActivate.focusCalls],
    [true, true, true, false, false, false, 0])

  // The deleted line, restored under the only condition where it could have mattered. It activates the app —
  // and the key window becomes the OVERLAY, a click-through widget with nothing to type into. This is the arm
  // that says the call was not merely redundant but aimed at the wrong window.
  eq("F5", "with-focus, cold open: the restored app.focus keys the OVERLAY, not the settings window",
    [withFocus.focusPatched, withFocus.focusCalls, p(withFocus, "first").everFocused,
      p(withFocus, "first").overlayEverFocused],
    [true, 2, false, true])
  // The limit, stated as an arm rather than left for someone to find. Compare against F4's `second`: the
  // difference between the two modes on this path is only `app.focus`, so it IS doing something here — pairing
  // with `win.focus()`, which Electron documents as possibly not activating an inactive app. That condition
  // needs `show()` to have stopped taking key, which is a thing the shipped module never does.
  eq("F6", "with-focus, create-or-focus: here the restored call DOES key the window — its only real effect",
    p(withFocus, "second").everFocused, true)

  const width = Math.max(...arms.map((a) => a.claim.length))
  for (const a of arms) console.log(`${a.pass ? "PASS" : "FAIL"}  ${a.id.padEnd(3)}  ${a.claim.padEnd(width)}  ${a.detail}`)

  const failed = arms.filter((a) => !a.pass)
  console.log(`\nprobe-mac-focus: ${String(arms.length - failed.length)}/${String(arms.length)} arms passed on darwin`)
  for (const [label, run] of Object.entries(runs)) {
    console.log(`  ${label}: app.focus calls=${String(run?.focusCalls)} events=[${(run?.focusEvents ?? []).join(" ")}]`)
    for (const name of ["first", "second"] as const) {
      const ph = p(run ?? {}, name)
      console.log(
        `    ${name.padEnd(6)} deactivated=${String(ph.deactivated)} (${String(ph.deactivateSamples)} samples)` +
          ` visible=${String(ph.visible)} everFocused=${String(ph.everFocused)}` +
          ` atEnd=${String(ph.focusedAtEnd)} overlayFocused=${String(ph.overlayEverFocused)}`,
      )
    }
  }
  if (failed.length > 0 || Object.values(runs).some((r) => r?.failure)) process.exitCode = 1
}

try {
  await main()
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
