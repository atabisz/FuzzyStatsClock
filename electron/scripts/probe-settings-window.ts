/**
 * Phase 6.5 — ISC-32: the settings window, measured off a running Electron.
 *
 * ## What this exists to prove that `bun test` cannot
 *
 * `test/settings-form.test.ts` covers the form model exhaustively — every field, every gating rule, every
 * label, across all four clock types. What it cannot execute is the half that only exists inside a browser:
 * whether a real Chromium under the shipped CSP builds those controls at all, whether an edit gets back out
 * through the preload, and whether the window can be opened, refreshed, closed and reopened without the
 * app going down with it.
 *
 * That gap is where the port's real risks live, and two of them are silent by construction. A CSP refusal is
 * a console message and nothing else — the window still opens, still paints its background, and simply has
 * no controls in it. A missing preload is the same shape: `window.fuzzyclock` is undefined, `required()`
 * throws in the renderer, and main sees a window that loaded fine. Neither reaches stdout on its own, so
 * this probe collects renderer console output at warning level and up and grades an empty list.
 *
 * ## Why the host module is bundled rather than reimplemented
 *
 * `scripts/probe-fade-app.cjs` had to rebuild its main process, because what it measures is a main process
 * behaving badly. Here the subject IS `src/main/settings-window.ts`, so a reimplementation would grade a
 * copy. Instead the driver runs one `bun build … --format cjs --external electron` into its own temp
 * directory and the host `require`s that — the shipped module, bundled the way `build:main` bundles it, with
 * no new `package.json` script and nothing added to `src/`.
 *
 * The form is built here too, by the real `buildSettingsForm(DEFAULTS, "en")`, and handed over as JSON. So
 * the expectations below are DERIVED from the same form the window receives rather than hardcoded: the
 * control count, the tab labels and the row count are counted out of the model, which means adding a
 * setting cannot leave this probe asserting yesterday's shape.
 *
 * ## An isolated profile
 *
 * `--user-data-dir` points at a fresh temp directory. `SettingsWindowHost` touches no settings file — it is
 * the one main-process module that does not — but Chromium writes a profile regardless, and Alex's live WPF
 * file at `%LOCALAPPDATA%\FuzzyClock\settings.json` is never opened by anything here.
 *
 * ## What it does NOT prove
 *
 * Nothing about `main.ts`. The three `ipcMain.on` relays and the `onSettingsEdit` persistence path are the
 * app's, and the host reimplements the relays with a recorder in front — stated at length in its own header.
 * Nothing about macOS or Linux either: the trait arms below adapt to the platform (`parent` is expected
 * absent on darwin, by design) but only a run on those hosts is evidence, and this file reports which
 * platform it ran on so a green cannot be read as three.
 */

import { spawn } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ACCENT_PRESETS,
  SETTINGS_WINDOW_HEIGHT,
  SETTINGS_WINDOW_TITLE,
  SETTINGS_WINDOW_WIDTH,
  buildSettingsForm,
} from "../src/core/settings-form.js"
import type { FormControl, SettingsForm } from "../src/core/settings-form.js"
import { DEFAULTS } from "../src/core/settings.js"
import { IS_MAC } from "../src/platform.js"
import { electronBinaryPath, cleanElectronEnv } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const HOST_SCRIPT = join(HERE, "probe-settings-window-app.cjs")
const HOST_SOURCE = join(HERE, "..", "src", "main", "settings-window.ts")
const DIST = join(HERE, "..", "dist")

interface Arm {
  readonly id: string
  readonly claim: string
  readonly pass: boolean
  readonly detail: string
}

const arms: Arm[] = []

function arm(id: string, claim: string, pass: boolean, detail: string): void {
  arms.push({ id, claim, pass, detail })
}

/** `actual === expected`, with both printed. The default shape for everything below. */
function eq(id: string, claim: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  arm(id, claim, a === e, a === e ? a : `got ${a}, expected ${e}`)
}

// ---------------------------------------------------------------------------------------------------
// The form, and everything the DOM should contain if it was interpreted correctly
// ---------------------------------------------------------------------------------------------------

const form: SettingsForm = buildSettingsForm(DEFAULTS, "en")
const allControls: FormControl[] = form.tabs.flatMap((tab) => tab.rows.flatMap((row) => [...row.controls]))
const allRows = form.tabs.flatMap((tab) => tab.rows)

/** The kinds `settings.ts` gives an `#ctl-<id>`: exactly the ones with a single focusable input. */
const CTL_KINDS = new Set(["slider", "select", "checkbox"])
const expectedCtlIds = allControls
  .filter((control) => CTL_KINDS.has(control.kind))
  .map((control) => ("id" in control ? control.id : ""))

const expected = {
  tabLabels: form.tabs.map((tab) => tab.label),
  panelCount: form.tabs.length,
  ctlIds: expectedCtlIds,
  swatches: ACCENT_PRESETS.length,
  segmentGroups: allControls.filter((control) => control.kind === "segments").length,
  radios: allControls.reduce(
    (total, control) => total + (control.kind === "radios" ? control.options.length : 0),
    0,
  ),
  rows: allRows.length,
  hiddenRows: allRows.filter((row) => !row.visible).length,
}

// ---------------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------------

const workDir = mkdtempSync(join(tmpdir(), "fuzzyclock-probe-settings-"))
const profileDir = join(workDir, "profile")
const bundlePath = join(workDir, "settings-window-host.cjs")
const formPath = join(workDir, "form.json")

async function bundleHostModule(): Promise<void> {
  const built = Bun.spawnSync([
    "bun",
    "build",
    HOST_SOURCE,
    "--outfile",
    bundlePath,
    "--format",
    "cjs",
    "--target",
    "node",
    "--external",
    "electron",
  ])
  if (built.exitCode !== 0) {
    throw new Error(`bundling ${HOST_SOURCE} failed:\n${built.stderr.toString()}`)
  }
}

interface Observed {
  logs?: string[]
  visibility?: boolean[]
  edits?: { id?: string; value?: unknown }[]
  closes?: number
  consoleErrors?: string[]
  readyPanelCounts?: number[]
  windowAllClosed?: boolean
  arms?: Record<string, unknown>
  failure?: string | null
}

function runHost(distDir: string): Promise<Observed> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      electronBinaryPath(),
      [HOST_SCRIPT, bundlePath, distDir, formPath, `--user-data-dir=${profileDir}`],
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
    // A host that dies before printing is the failure mode `electron-launch.ts` was written about, so the
    // streams are kept and shown rather than discarded.
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`host did not finish in 60s\nstdout:\n${out}\nstderr:\n${err}`))
    }, 60_000)
    child.on("exit", (code) => {
      clearTimeout(timer)
      const line = out.split(/\r?\n/).find((l) => l.startsWith("PROBE_RESULT "))
      if (line === undefined) {
        reject(
          new Error(
            `host exited ${String(code)} with no PROBE_RESULT\nstdout:\n${out}\nstderr:\n${err}`,
          ),
        )
        return
      }
      resolve(JSON.parse(line.slice("PROBE_RESULT ".length)) as Observed)
    })
  })
}

function grade(observed: Observed): void {
  const a = (observed.arms ?? {}) as Record<string, Record<string, unknown>>
  const dom = (a.dom ?? {}) as Record<string, unknown>

  // ---- The window came up at all -----------------------------------------------------------------
  eq("W1", "open() reports isOpen", a.openIsOpen, true)
  eq("W2", "open() created exactly one window beside the overlay", a.windowCountAfterOpen, 2)

  // ---- The renderer built the real form ----------------------------------------------------------
  eq("R0", "the form arrived in REPLY to settings-ready (#panels was empty at the handshake)",
    observed.readyPanelCounts?.[0], 0)
  eq("R1", "no renderer console output at warning level or above (a CSP refusal lands here)",
    observed.consoleErrors, [])
  eq("R2", "one tab button per form tab, labelled from the model", dom.tabLabels, expected.tabLabels)
  eq("R3", "one panel per tab", dom.panelCount, expected.panelCount)
  eq("R4", "exactly one panel visible, and it is the first", [dom.visiblePanels, dom.selectedTab], [1, 0])
  eq("R5", "every slider/select/checkbox in the model has its #ctl- element, in order",
    dom.ctlIds, expected.ctlIds)
  eq("R6", "one swatch ring per accent preset, plus one colour input",
    [dom.swatches, dom.customColors], [expected.swatches, 1])
  eq("R7", "one segment group per segments control", dom.segmentGroups, expected.segmentGroups)
  eq("R8", "one radio input per radios option", dom.radios, expected.radios)
  eq("R9", "one row element per form row, with the model's invisible ones hidden",
    [dom.rows, dom.hiddenRows], [expected.rows, expected.hiddenRows])
  // The CSP arm's positive twin: `style-src 'self'` without `unsafe-inline` means an inline `style`
  // attribute would be REFUSED rather than absent, so zero of them is the interpreter obeying the policy
  // rather than a selector that found nothing — R6's swatches are the colours it would otherwise need one for.
  eq("R10", "no control uses an inline style attribute", dom.inlineStyleAttrs, 0)

  // ---- Interaction --------------------------------------------------------------------------------
  const tabSwitch = (a.tabSwitch ?? {}) as Record<string, unknown>
  eq("R11", "clicking tab 3 shows only panel 3 and marks the button selected",
    [tabSwitch.visibleIndex, tabSwitch.visibleCount, tabSwitch.selected], [2, 1, 2])
  eq("R12", "a checkbox click reaches main as an edit for its own field",
    observed.edits?.[0], { id: "statsVisible", value: !DEFAULTS.statsVisible })
  eq("R13", "a slider input event reaches main as a string value",
    observed.edits?.[1], { id: "opacity", value: "0.5" })
  eq("R14", "the slider readout tracked the thumb locally, without a round trip",
    a.sliderReadoutAfterLocalUpdate, "0.5")

  // ---- Refresh in place --------------------------------------------------------------------------
  const refresh = (a.refresh ?? {}) as Record<string, unknown>
  eq("R15", "a second push updates the existing element rather than rebuilding it",
    refresh.tagSurvived, true)
  eq("R16", "the pushed value and the pushed label both land", [refresh.value, refresh.readout], ["0.42", "42%"])
  eq("R17", "a row that went invisible collapsed",
    refresh.hiddenRows, ((refresh.hiddenRowsBefore as number) ?? -1) + 1)
  eq("R18", "the open tab survived the refresh", refresh.activeTabStillSelected, 2)

  // ---- The host module's own behaviour -----------------------------------------------------------
  const second = (a.secondOpen ?? {}) as Record<string, unknown>
  eq("H1", "a second open() focuses the same window instead of creating one",
    [second.windowCount, second.sameWindow], [2, true])
  eq("H2", "a second open() raises no second visibility edge", second.visibilityEdges, 1)
  const foreign = (a.foreignReady ?? {}) as Record<string, unknown>
  eq("H3", "settings-ready from another renderer is warned about and ignored",
    [foreign.warned, foreign.stillOpen], [true, true])

  // ---- Traits, read off the live window ----------------------------------------------------------
  const traits = (a.traits ?? {}) as Record<string, unknown>
  eq("H4", "the window is not resizable, maximizable or fullscreenable",
    [traits.resizable, traits.maximizable, traits.fullScreenable], [false, false, false])
  eq("H5", "it is visible", traits.visible, true)
  // The arm that turned an argued claim into a measured one, and it started red with the opposite expectation.
  //
  // `settings-window.ts`'s header argues from Win32 documentation that an owned window inherits its owner's
  // topmost-ness, which is why the port takes `parent` at all — it is the whole reason the settings window
  // appears ABOVE the always-on-top widget rather than under it. Nothing here requests always-on-top: the
  // constructor never passes it and `setAlwaysOnTop` is never called. So a `true` reading can only have come
  // from the owner relationship, and `isAlwaysOnTop()` on Windows reads `WS_EX_TOPMOST` off the live window
  // rather than a remembered flag. That is the propagation, measured.
  //
  // On darwin the port omits `parent` (the widget would drag the window around), so there is nothing to
  // inherit from and the expectation flips — which is the divergence the header names, showing up as data.
  //
  // Linux is a PREDICTION this arm has not yet graded on a host: X11 window-manager behaviour for
  // transient-for children is the WM's, not Chromium's. A red here on Linux is a finding about the port's
  // z-order on that platform, not a broken probe.
  eq(
    "H5b",
    IS_MAC
      ? "with no owner, nothing propagates: always-on-top is off"
      : "always-on-top was never requested and is on anyway — the owner propagated it",
    traits.alwaysOnTop,
    !IS_MAC,
  )
  eq("H6", "title and outer size are the model's constants",
    [traits.title, traits.outerWidth, traits.outerHeight],
    [SETTINGS_WINDOW_TITLE, SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT])
  eq(
    "H7",
    IS_MAC
      ? "on darwin the overlay is NOT the parent (the widget would drag it around)"
      : "the overlay is the parent, so the owner relationship keeps it above the topmost widget",
    traits.parentIsStandIn,
    !IS_MAC,
  )

  // ---- Close, and what survives it ---------------------------------------------------------------
  const afterClose = (a.afterClose ?? {}) as Record<string, unknown>
  eq("C1", "the Close button reached main on settings-close", afterClose.closeMessages, 1)
  eq("C2", "the window is gone and the pin fell", [afterClose.isOpen, afterClose.visibility], [false, [true, false]])
  eq("C3", "the overlay survived, and window-all-closed did NOT fire",
    [afterClose.standInAlive, afterClose.windowCount, afterClose.windowAllClosed], [true, 1, false])

  const reopen = (a.reopen ?? {}) as Record<string, unknown>
  eq("C4", "reopening builds a new renderer that handshakes again",
    [reopen.isNewWebContents, reopen.readyHandshakes], [true, 2])
  eq("C5", "the reopened window shows the CURRENT form, not the one it closed with", reopen.opacity, "0.42")

  const escape = (a.escape ?? {}) as Record<string, unknown>
  eq("C6", "Escape closes it too", [escape.closeMessages, escape.isOpen], [2, false])

  const destroy = (a.destroy ?? {}) as Record<string, unknown>
  eq("C7", "destroy() takes a live window down without a close message",
    [destroy.isOpen, destroy.destroyed, destroy.windowCount], [false, true, 1])

  eq("C8", "three opens and three closes produced six alternating pin edges",
    a.visibility, [true, false, true, false, true, false])
}

/**
 * The mutation control — `--control`, which runs the whole probe against a `dist/` missing one file.
 *
 * Algorithm rule 18: a self-authored probe that goes green on its first run has not shown it can go red, and
 * "37/37" then means "37 arms I wrote agreed with me". This run breaks the ONE thing whose absence is silent
 * at every other layer — `preload-settings.cjs` — and requires the probe to fail.
 *
 * That file is the right mutation because Electron does not complain about it: `loadFile` succeeds, the
 * window opens, `settings.css` applies, and `settings.js` runs and dies on `bridge.onForm` because
 * `window.fuzzyclock` was never injected. Main sees a window that loaded fine. If this run went green, R0,
 * R1 and R5 would all be measuring nothing.
 *
 * Only the CSS/HTML/JS/preload four are copied — the mutated tree is what `SettingsWindowHost.dir` points at,
 * and it needs exactly those.
 */
const MUTATED_FILES = ["settings.html", "settings.css", "settings.js", "preload-settings.cjs"]

function mutatedDist(): string {
  const dir = join(workDir, "dist-no-preload")
  mkdirSync(dir, { recursive: true })
  for (const name of MUTATED_FILES) {
    if (name === "preload-settings.cjs") continue
    copyFileSync(join(DIST, name), join(dir, name))
  }
  return dir
}

async function main(): Promise<void> {
  const control = process.argv.includes("--control")
  console.log(
    `probe-settings-window: platform ${process.platform}, profile ${profileDir}` +
      (control ? ", MUTATION CONTROL (dist/ with no preload-settings.cjs)" : ""),
  )
  await bundleHostModule()
  writeFileSync(formPath, JSON.stringify(form))
  console.log(
    `probe-settings-window: form has ${String(form.tabs.length)} tabs, ${String(expected.rows)} rows, ` +
      `${String(allControls.length)} controls (${String(expectedCtlIds.length)} with a #ctl- id)`,
  )

  const observed = await runHost(control ? mutatedDist() : DIST)
  if (observed.failure !== null && observed.failure !== undefined) {
    console.error(`probe-settings-window: the host threw:\n${observed.failure}`)
  }
  grade(observed)

  if (control) {
    const reds = arms.filter((a) => !a.pass)
    console.log(
      `\nprobe-settings-window: CONTROL — ${String(reds.length)}/${String(arms.length)} arms went red` +
        ` with the preload removed${reds.length > 0 ? ` (${reds.map((a) => a.id).join(", ")})` : ""}`,
    )
    if (reds.length === 0) {
      console.error("probe-settings-window: CONTROL FAILED — the probe cannot tell a broken window apart")
      process.exitCode = 1
    }
    return
  }

  const width = Math.max(...arms.map((a) => a.claim.length))
  for (const a of arms) {
    console.log(`${a.pass ? "PASS" : "FAIL"}  ${a.id.padEnd(3)}  ${a.claim.padEnd(width)}  ${a.detail}`)
  }
  const failed = arms.filter((a) => !a.pass)
  console.log(
    `\nprobe-settings-window: ${String(arms.length - failed.length)}/${String(arms.length)} arms passed` +
      ` on ${process.platform}`,
  )
  if (observed.logs !== undefined && observed.logs.length > 0) {
    console.log(`\nhost log:\n${observed.logs.map((l) => `  ${l}`).join("\n")}`)
  }
  if (failed.length > 0 || observed.failure) process.exitCode = 1
}

try {
  await main()
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
