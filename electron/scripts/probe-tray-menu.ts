/**
 * Does Electron accept the tray menu we describe to it? (ISC-17)
 *
 * ## The gap this closes
 *
 * The menu's CONTENT is `src/core/tray-menu.ts`, and `test/tray-menu.test.ts` covers it thoroughly as data:
 * twelve items, the checkmark table, the labels. What no test in this repo touches is the twenty lines that
 * hand that data to Electron — `toMenuTemplate` and `AppTray` in `src/main/tray.ts`. They cannot be reached
 * by `bun test` at all, because that file imports `electron`, and `Menu`, `Tray` and `nativeImage` exist only
 * inside a real main process.
 *
 * That is the same shape as the two defects found earlier in this phase, and it is the shape worth naming:
 * the pure module is well tested and the adapter that hands its output to the platform is not. Here the
 * failure would be quiet in a specific way. Electron does not validate a menu template and report on it; it
 * builds what it can and ignores what it cannot. An item with a `type` it does not recognise, a `checked`
 * without the explicit `type: "checkbox"` that `toMenuTemplate:75-76` warns about, a submenu whose children
 * were passed through un-mapped by a one-sided refactor — each of those produces a menu that opens, looks
 * almost right, and is missing an entry or a tick. Nothing logs. The only detector in the current build is a
 * user noticing that Ghost Mode has no checkmark any more.
 *
 * ## Why this can be graded without a menu appearing on anyone's screen
 *
 * `AppTray.buildMenu()` is `private`, and TypeScript's `private` has no runtime existence. The harness is
 * `.cjs`, so it can ask the shipped class for the very `Menu` object it would pass to `popUpContextMenu` —
 * dispatch wrapper, pin listeners and all — and then read Electron's own `menu.items`. No native popup, no
 * input grab, no cursor, no hardware. The same lever as `probe:boundary`, where the types that vanish at
 * runtime were the preload's parameter annotations.
 *
 * Expectations are DERIVED from `buildTrayMenu(state)` in this file, never written out by hand, so adding a
 * menu item cannot leave a stale hardcoded census behind — the same discipline as `probe:settings-window`
 * deriving its DOM census from `buildSettingsForm`.
 *
 * ## What stays manual, and why
 *
 * Two things, both stated in `src/main/tray.ts`'s header as open questions:
 *
 *   - The icon appearing in the notification area and a physical click on it opening the menu. The click is
 *     delivered by the desktop shell.
 *   - Whether Electron emits `menu-will-show` / `menu-will-close` on the `tray.popUpContextMenu` path. That
 *     needs a real menu at a real cursor and a real dismissal. Everything DOWNSTREAM of the event is graded
 *     here — the listeners are on the real `Menu`, both transitions fire, each names its route, the watchdog
 *     arms and clears — and the third close route, an item being clicked, needs no Electron event and is
 *     driven end to end (T12).
 *
 * This probe therefore NARROWS ISC-17 rather than closing it, and reports which platform it ran on so a
 * green here cannot be read as three.
 *
 * ## Prerequisite
 *
 * `dist/icon.png`, since that is the path the app itself passes (`main.ts:965`). `bun run probe:tray-menu`
 * builds first; running this file directly assumes a built `dist/`, which is what the mutation runs want.
 */

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildTrayMenu } from "../src/core/tray-menu.js"
import type { TrayAction, TrayMenuItem, TrayMenuState } from "../src/core/tray-menu.js"
import { IS_LINUX } from "../src/platform.js"
import { electronBinaryPath, cleanElectronEnv } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const HOST_SCRIPT = join(HERE, "probe-tray-menu-app.cjs")
const HOST_SOURCE = join(HERE, "..", "src", "main", "tray.ts")
const DIST_ICON = join(HERE, "..", "dist", "icon.png")
const SOURCE_ICON = join(HERE, "..", "assets", "icon.png")

/**
 * `MENU_PIN_WATCHDOG_MS`, repeated as a literal on purpose.
 *
 * Importing it would mean importing `src/main/tray.ts`, which imports `electron` — unloadable outside a main
 * process, which is the whole reason this probe exists. Two independent copies is what makes T0 an assertion
 * rather than a tautology: a change to either one shows up as a red arm.
 */
const EXPECTED_WATCHDOG_MS = 30_000

/**
 * Two states with every field flipped, and a clock type that is neither first nor last in its submenu.
 *
 * `lcd` is third of four, so an adapter that ticked by position, ticked the first item, or ticked by object
 * identity would all read differently from ticking by state. Every boolean differs between A and B, so T14
 * cannot pass on a menu that ignored the refresh.
 */
const STATE_A: TrayMenuState = {
  ghostModeEnabled: true,
  statsVisible: false,
  autoContrastEnabled: true,
  autoLaunchEnabled: false,
  clockType: "lcd",
}

const STATE_B: TrayMenuState = {
  ghostModeEnabled: false,
  statsVisible: true,
  autoContrastEnabled: false,
  autoLaunchEnabled: true,
  clockType: "nixie",
}

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
// What a correctly-interpreted template looks like, derived from the core model
// ---------------------------------------------------------------------------------------------------

/** `TrayMenuItem["kind"]` -> the `type` Electron reports. A `command` becomes `normal`, not `command`. */
const TYPE_OF: Record<TrayMenuItem["kind"], string> = {
  separator: "separator",
  command: "normal",
  checkbox: "checkbox",
  submenu: "submenu",
}

interface SubCensus {
  labels: string[]
  types: string[]
  checked: boolean[]
}

interface Census extends SubCensus {
  enabled: boolean[]
  visible: boolean[]
  submenu: SubCensus | null
}

function subCensus(items: readonly TrayMenuItem[]): SubCensus {
  return {
    labels: items.map((item) => (item.kind === "separator" ? "" : item.label)),
    types: items.map((item) => TYPE_OF[item.kind]),
    checked: items.map((item) => (item.kind === "checkbox" ? item.checked : false)),
  }
}

function census(items: readonly TrayMenuItem[]): Census {
  const sub = items.find(
    (item): item is Extract<TrayMenuItem, { kind: "submenu" }> => item.kind === "submenu",
  )
  return {
    ...subCensus(items),
    // Nothing in `toMenuTemplate` sets either, so every item must arrive at Electron's defaults. An item
    // that came back disabled or invisible is a menu entry the user cannot reach and nothing else reports.
    enabled: items.map(() => true),
    visible: items.map(() => true),
    submenu: sub === undefined ? null : subCensus(sub.items),
  }
}

/** Depth-first, descending into a submenu where it sits. Must match `clickAll` in the harness exactly. */
function actionWalk(items: readonly TrayMenuItem[]): TrayAction[] {
  const out: TrayAction[] = []
  for (const item of items) {
    if (item.kind === "submenu") {
      out.push(...actionWalk(item.items))
      continue
    }
    if (item.kind === "separator") continue
    out.push(item.action)
  }
  return out
}

const modelA = buildTrayMenu(STATE_A)
const modelB = buildTrayMenu(STATE_B)
const expectedA = census(modelA)
const expectedB = census(modelB)
const expectedActions = actionWalk(modelA)

/** The one item whose click T12 drives, so the arm's expectation is derived rather than assumed to be item 0. */
const firstAction = expectedActions[0]

const PLATFORM_LOG = IS_LINUX
  ? "info: tray: linux -- context menu attached up front, refreshed on every state change"
  : "info: tray: win32/darwin -- menu rebuilt per open (ContextMenuStrip.Opening equivalent)"

// ---------------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------------

const workDir = mkdtempSync(join(tmpdir(), "fuzzyclock-probe-tray-"))
const profileDir = join(workDir, "profile")
const bundlePath = join(workDir, "tray-host.cjs")
const planPath = join(workDir, "plan.json")
const bogusIconPath = join(workDir, "not-an-icon.png")

function bundleHostModule(): void {
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
  actions?: string[]
  pinEdges?: boolean[]
  arms?: Record<string, unknown>
  failure?: string | null
}

function runHost(): Promise<Observed> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      electronBinaryPath(),
      [HOST_SCRIPT, bundlePath, planPath, `--user-data-dir=${profileDir}`],
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
      reject(new Error(`host did not finish in 45s\nstdout:\n${out}\nstderr:\n${err}`))
    }, 45_000)
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

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function grade(observed: Observed): void {
  const a = (observed.arms ?? {}) as Record<string, Record<string, unknown> | unknown>
  const pick = (key: string): Record<string, unknown> =>
    (a[key] ?? {}) as Record<string, unknown>

  // ---- The module under test is the shipped one ---------------------------------------------------
  eq("T0", "the bundle exports the real class, function and watchdog constant", a.exports, {
    appTray: "function",
    toMenuTemplate: "function",
    watchdogMs: EXPECTED_WATCHDOG_MS,
  })

  // ---- Electron interpreted the template ----------------------------------------------------------
  const censusA = pick("censusA")
  eq("T1", "Electron built one item per model item, none dropped",
    (censusA.labels as unknown[] | undefined)?.length, expectedA.labels.length)
  eq("T2", "every label, in the model's order", censusA.labels, expectedA.labels)
  eq("T3", "every item's type survived -- separator/normal/checkbox/submenu", censusA.types, expectedA.types)
  eq("T4", "every tick matches the state the menu was built from", censusA.checked, expectedA.checked)
  eq("T5", "the Clock Type submenu is a real Menu with the model's four checkboxes",
    censusA.submenu, expectedA.submenu)
  eq("T7", "no item arrived disabled or invisible",
    [censusA.enabled, censusA.visible], [expectedA.enabled, expectedA.visible])

  // ---- The click closures are bound to the items they were written for ----------------------------
  const walk = pick("walk")
  eq("T6", "clicking every actionable item dispatches the model's actions, in order",
    [walk.actions, walk.failures], [expectedActions, []])

  // ---- Construction, per platform ----------------------------------------------------------------
  const construct = pick("construct")
  eq("T8", `construction on ${process.platform}: ${IS_LINUX ? "menu attached up front, no click listeners" : "no menu built, one listener per click event"}`,
    [
      construct.buildsAtConstruct,
      construct.clickListeners,
      construct.rightClickListeners,
      (construct.logs as string[] | undefined)?.includes(PLATFORM_LOG),
    ],
    IS_LINUX ? [1, 0, 0, true] : [0, 1, 1, true])

  // ---- The icon, and the control that proves the check can fail -----------------------------------
  eq("T9", "the icon the app ships loads as a non-empty image, with no error logged",
    [a.iconEmpty, (construct.logs as string[] | undefined)?.filter((l) => l.startsWith("error:"))],
    [false, []])
  const bogus = pick("bogus")
  arm("T10", "CONTROL: an unreadable icon path is caught and named in an error line",
    bogus.empty === true &&
      (bogus.logs as string[] | undefined)?.some(
        (l) => l.startsWith("error:") && l.includes(bogusIconPath) && l.includes("empty image"),
      ) === true,
    JSON.stringify(bogus))

  // ---- The pin -----------------------------------------------------------------------------------
  eq("T11", "menu-will-show pins and arms the watchdog; menu-will-close releases and cancels it",
    [pick("pinOn"), pick("pinOff")],
    [
      { isMenuOpen: true, timerArmed: true, logs: ["info: tray: menu open (menu-will-show)"] },
      { isMenuOpen: false, timerArmed: false, logs: ["info: tray: menu closed (menu-will-close)"] },
    ])
  eq("T12", "an item click releases the pin with no Electron event, and still dispatches",
    pick("pinItemClick"),
    {
      isMenuOpen: false,
      timerArmed: false,
      logs: ["info: tray: menu closed (item clicked)"],
      actions: [firstAction],
    })
  // The trailing `true` with no `false` after it is T13's setup, and it is a real asymmetry rather than a
  // loose end in the probe: `destroy()` cancels the watchdog but never calls `setPin(false)`, so a tray
  // destroyed with the pin on leaves its consumer pinned and un-notified. Harmless where the only caller
  // is, `main.ts:1112` in the quit tier — `settingsWindow?.destroy()` on the next line skips its own
  // `closed` push for the same stated reason, that there is no renderer left to receive it. Asserted at
  // five rather than four so that if a second, non-quit `destroy()` caller ever appears, this arm is the
  // thing that has to be looked at.
  eq("T11b", "the pin's edges are exactly the transitions logged; destroy() deliberately emits none",
    observed.pinEdges, [true, false, true, false, true])

  // ---- Refresh -----------------------------------------------------------------------------------
  const refresh = pick("refresh")
  eq("T14", `setStateAndRefresh adopts the state and ${IS_LINUX ? "re-attaches a rebuilt menu" : "rebuilds nothing (the next open does)"}`,
    [refresh.state, refresh.buildsDuringRefresh], [STATE_B, IS_LINUX ? 1 : 0])
  eq("T14b", "the menu built after the refresh shows the NEW ticks", pick("censusB"), expectedB)

  // ---- Teardown ----------------------------------------------------------------------------------
  eq("T13", "destroy() takes a live tray down, cancels a pending watchdog, and is idempotent",
    pick("destroy"),
    {
      destroyedBefore: false,
      armedBefore: true,
      destroyedAfter: true,
      timerAfter: null,
      secondDestroyThrew: null,
    })
}

function main(): Promise<void> {
  console.log(
    `probe-tray-menu: platform ${process.platform}, model has ${String(modelA.length)} items and ` +
      `${String(expectedActions.length)} actions, profile ${profileDir}`,
  )
  bundleHostModule()
  writeFileSync(planPath, JSON.stringify({ states: [STATE_A, STATE_B], iconPath: DIST_ICON, bogusIconPath }))

  // Graded here rather than in the harness: a stale `dist/icon.png` is a copy-assets fault, and this is the
  // only arm that does not need Electron at all.
  const bothPresent = existsSync(DIST_ICON) && existsSync(SOURCE_ICON)
  arm("T9b", "dist/icon.png is byte-identical to assets/icon.png (a stale dist ships the wrong art)",
    bothPresent && sha256(DIST_ICON) === sha256(SOURCE_ICON),
    bothPresent
      ? `sha256 ${sha256(DIST_ICON).slice(0, 16)}...`
      : `missing: ${existsSync(DIST_ICON) ? SOURCE_ICON : DIST_ICON} -- run \`bun run build\``,
  )

  return runHost().then((observed) => {
    if (observed.failure !== null && observed.failure !== undefined) {
      console.error(`probe-tray-menu: the host threw:\n${observed.failure}`)
    }
    grade(observed)

    const width = Math.max(...arms.map((x) => x.claim.length))
    for (const x of arms) {
      console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.id.padEnd(4)}  ${x.claim.padEnd(width)}  ${x.detail}`)
    }
    const failed = arms.filter((x) => !x.pass)
    console.log(
      `\nprobe-tray-menu: ${String(arms.length - failed.length)}/${String(arms.length)} arms passed on ` +
        `${process.platform}`,
    )
    if (observed.logs !== undefined && observed.logs.length > 0) {
      console.log(`\ntray log:\n${observed.logs.map((l) => `  ${l}`).join("\n")}`)
    }
    if (failed.length > 0 || (observed.failure !== null && observed.failure !== undefined)) {
      process.exitCode = 1
    }
  })
}

try {
  await main()
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
