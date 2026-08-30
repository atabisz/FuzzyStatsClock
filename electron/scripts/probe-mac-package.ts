/**
 * Phase 7 — does the PACKAGED mac app actually install and run, or has it only ever been read?
 *
 * ## The gap this fills, stated exactly
 *
 * ISC-29.4 closed on `dist:mac` exit 0 plus an artefact inspection: the dmg's byte count, the icns
 * ladder measured image by image, `Info.plist` keys read back. Every one of those is a claim about a
 * FILE. Not one of them is a claim about a PROCESS. The Windows half of ISC-29 went further — silent
 * install, launch, uninstall — so the two platforms were carrying the same `[~]` on very different
 * evidence, and "the dmg is built" was one sentence away from being read as "the mac app works".
 *
 * ISC-29.4's own worst finding is the reason this exists. A `dist:linux` claim was taken off a BUILD
 * LOG for a step that never ran, and looking for the artefact is what caught it. This is the same move
 * one stage later: looking for the running process rather than the artefact that should produce it.
 *
 * ## What is real here
 *
 * The dmg in `release/`, mounted the way a user mounts it; the bundle copied off the image the way a
 * user drags it; that copy's own binary launched. No `dist/` from the working tree, no
 * `node_modules/electron`, no probe host — the executable under test is the one inside the bundle, so
 * what runs is the asar, the packaged Electron Framework and the `Info.plist` that was inspected.
 *
 * ## The seeded settings file is what makes one arm worth six
 *
 * `dateFormat: "ISO"` and `statsVisible: true` are both NON-default. So P6 passing means, in one
 * reading: the packaged app honoured `--user-data-dir`, found the file, parsed it, kept two fields that
 * differ from `DEFAULTS`, ran `core/date.ts`'s own formatter over the current date, and the renderer
 * put the result in the DOM. `formatDate("ISO", …)` is the only date format with no `Intl` in it, which
 * is why it is the one seeded: the expectation is computable here without this script and the app
 * having to agree about a locale.
 *
 * The phrase is graded as non-empty only. Classic English picks from candidate lists, so an exact
 * expectation would be a flake — the WPF suite already has one of those (the noon case).
 *
 * ## The control, and the arm that is deliberately NOT here
 *
 * `control` is the same installed bundle with `Contents/Resources/app.asar` renamed away: a package
 * that is present, launchable and broken. P9 requires the probe to catch it. Without that, P4-P6 could
 * not be distinguished from "CDP answers whatever you ask it".
 *
 * Measured, and it is not what was expected: the control **exits 1** rather than sitting on a modal
 * "unable to find application" dialog, so on this path aliveness discriminates too. Recorded because
 * the guess went the other way and because a probe that leaves a dialog on a borrowed desk would have
 * been a cost worth knowing about. Aliveness is still not graded on its own — P7 pairs it with a page
 * of ours having been served, since a hung app is alive and an app whose renderer died is alive.
 *
 * ## Both of this probe's own bugs, kept, because each one is a shape that reads as a broken app
 *
 * The first run came back 7/9 with P3 and P4 red while the same run's CDP target proved the bundle had
 * launched from the very path P3 called absent. Both were the instrument:
 *
 * - **P3 graded `existsSync` AFTER the `finally` that deletes the install tree.** An arm can be looking
 *   at the right path and the wrong moment. The existence checks are snapshotted before the runs now,
 *   which is also the only order in which they mean "installed".
 * - **P4 compared `tmpdir()`'s `/var/folders/…` against Chromium's `file:///private/var/folders/…`.**
 *   `/var` is a symlink into `/private` on macOS, so the two spellings are the same directory and the
 *   arm was red about nothing. `realpathSync` on our side, once, before the tree goes away.
 *
 * ## What this does not prove
 *
 * Not a login (ISC-29's remaining `[~]`), not `/Applications` — the bundle is copied to a scratch
 * directory instead, because an unsigned alpha put into Alex's `/Applications` is a thing left behind
 * on a borrowed host, and the destination directory is not what a launch depends on. Not Gatekeeper:
 * the dmg was built locally and carries no quarantine attribute, so nothing here says what a
 * downloaded copy would do. P8 is the residue arm and it is about Alex's home directory, not about a
 * clean machine.
 */

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { formatDate } from "../src/core/date.js"
import { DEFAULTS } from "../src/core/settings.js"
import { SETTINGS_FILENAME } from "../src/main/settings-store.js"
import { IS_MAC } from "../src/platform.js"
import { cleanElectronEnv } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const RELEASE = join(HERE, "..", "release")
const APP_ID = "org.tabisz.fuzzyclock"
const APP_SUPPORT = join(homedir(), "Library", "Application Support", "FuzzyClock")
const LAUNCH_AGENT = join(homedir(), "Library", "LaunchAgents", `${APP_ID}.plist`)
const CRASH_DIR = join(homedir(), "Library", "Logs", "DiagnosticReports")
/** Long enough for a cold first launch of a 200MB bundle off APFS, short enough to notice a hang. */
const TARGET_DEADLINE_MS = 45_000
const CDP_TIMEOUT_MS = 15_000
/** How long to let it run once the page is up, and how long SIGTERM gets before SIGKILL. */
const TERM_GRACE_MS = 10_000

interface Sh {
  code: number
  out: string
  err: string
}

function sh(cmd: string, args: string[]): Sh {
  const r = Bun.spawnSync([cmd, ...args])
  return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() }
}

/**
 * One key out of a plist, or null.
 *
 * `plutil -extract … raw` rather than `PlistBuddy`: PlistBuddy exits 0 and prints its error to stdout
 * when a key is missing, so a typo reads as a value. This exits 1.
 */
function plistKey(path: string, key: string): string | null {
  const r = sh("plutil", ["-extract", key, "raw", "-o", "-", path])
  return r.code === 0 ? r.out : null
}

interface Harvest {
  href?: string
  phraseFaceDisplay?: string | null
  phrase?: string | null
  date?: string | null
  statsDisplay?: string | null
}

interface Observed {
  label: string
  /** The CDP page target's URL, or null if none ever appeared. */
  targetUrl: string | null
  harvest: Harvest | null
  harvestError: string | null
  /** Was the process still running when the harvest finished? Printed, graded only in P7's pairing. */
  aliveAtHarvest: boolean
  exitedOnTerm: boolean
  exitCode: number | null
  needlessKill: boolean
  /** Whatever the app created in its own user-data directory. Evidence it got as far as Chromium. */
  profileEntries: string[]
  stdout: string
  stderr: string
}

const arms: { id: string; claim: string; pass: boolean; detail: string }[] = []

function eq(id: string, claim: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  arms.push({ id, claim, pass: a === e, detail: a === e ? a : `got ${a}, expected ${e}` })
}

// -----------------------------------------------------------------------------------------------
// CDP: find the page, run one expression. A second copy of `probe-display.ts`'s client, on purpose —
// extracting a shared helper would edit that probe, and an edited instrument's greens are void, so a
// refactor would cost a five-launch re-run of a passing probe to buy nothing this file needs.
// -----------------------------------------------------------------------------------------------

interface CdpTarget {
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

async function pageTarget(port: number, deadline: number): Promise<CdpTarget | null> {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`)
      const list = (await response.json()) as CdpTarget[]
      const page = list.find((t) => t.type === "page" && typeof t.webSocketDebuggerUrl === "string")
      if (page !== undefined) return page
    } catch {
      // Chromium binds the endpoint lazily; a refusal here is what "not up yet" looks like.
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}

function evaluate(wsUrl: string, expression: string): Promise<{ value?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl)
    let settled = false
    const finish = (outcome: { value?: unknown; error?: string }): void => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        // Already have the answer; a socket that never opened throws on close.
      }
      resolve(outcome)
    }
    const timer = setTimeout(() => finish({ error: `no CDP reply within ${String(CDP_TIMEOUT_MS)}ms` }), CDP_TIMEOUT_MS)
    ws.onopen = (): void => {
      ws.send(
        JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }),
      )
    }
    ws.onerror = (): void => {
      clearTimeout(timer)
      finish({ error: "the CDP websocket errored — a 403 here means --remote-allow-origins is missing" })
    }
    ws.onmessage = (event: MessageEvent): void => {
      let message: {
        id?: number
        result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } }
        error?: { message?: string }
      }
      try {
        message = JSON.parse(String(event.data)) as typeof message
      } catch (e) {
        clearTimeout(timer)
        finish({ error: `unparseable CDP frame: ${String(e)}` })
        return
      }
      if (message.id !== 1) return
      clearTimeout(timer)
      if (message.error !== undefined) {
        finish({ error: `CDP error: ${message.error.message ?? "(no message)"}` })
        return
      }
      if (message.result?.exceptionDetails !== undefined) {
        finish({ error: `page threw: ${message.result.exceptionDetails.text ?? "(no text)"}` })
        return
      }
      finish({ value: message.result?.result?.value })
    }
  })
}

/** Read the DOM the packaged renderer actually built. Ids are `src/renderer/index.html`'s own. */
const HARVEST = `(() => {
  const el = (id) => document.getElementById(id)
  const disp = (id) => { const e = el(id); return e === null ? null : e.getAttribute("display") }
  return {
    href: location.href,
    phraseFaceDisplay: disp("phraseFace"),
    phrase: el("phrase") === null ? null : el("phrase").textContent,
    date: el("date") === null ? null : el("date").textContent,
    statsDisplay: disp("stats"),
  }
})()`

// -----------------------------------------------------------------------------------------------
// One run of one bundle.
// -----------------------------------------------------------------------------------------------

async function runBundle(label: string, appPath: string, executable: string, port: number): Promise<Observed> {
  const profileDir = mkdtempSync(join(tmpdir(), `fc-macpkg-${label}-`))
  // NON-default on two fields, deliberately. See the header.
  writeFileSync(
    join(profileDir, SETTINGS_FILENAME),
    JSON.stringify({ ...DEFAULTS, dateFormat: "ISO", statsVisible: true }, null, 2),
    "utf8",
  )

  const binary = join(appPath, "Contents", "MacOS", executable)
  const proc = spawn(
    binary,
    [`--user-data-dir=${profileDir}`, `--remote-debugging-port=${String(port)}`, "--remote-allow-origins=*"],
    { env: cleanElectronEnv() },
  )
  const out: Observed = {
    label,
    targetUrl: null,
    harvest: null,
    harvestError: null,
    aliveAtHarvest: false,
    exitedOnTerm: false,
    exitCode: null,
    needlessKill: false,
    profileEntries: [],
    stdout: "",
    stderr: "",
  }
  proc.stdout.on("data", (c: Buffer) => {
    out.stdout += c.toString()
  })
  proc.stderr.on("data", (c: Buffer) => {
    out.stderr += c.toString()
  })

  const target = await pageTarget(port, Date.now() + TARGET_DEADLINE_MS)
  if (target !== null) {
    out.targetUrl = target.url
    const result = await evaluate(target.webSocketDebuggerUrl as string, HARVEST)
    if (result.error !== undefined) out.harvestError = result.error
    else out.harvest = result.value as Harvest
  }
  out.aliveAtHarvest = proc.exitCode === null && proc.signalCode === null
  try {
    out.profileEntries = readdirSync(profileDir).sort()
  } catch {
    out.profileEntries = []
  }

  // SIGTERM, then SIGKILL only if it will not go. A tray app that ignores SIGTERM is a finding, so the
  // difference between the two is recorded rather than smoothed over.
  const exited = await new Promise<boolean>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve(true)
      return
    }
    const timer = setTimeout(() => resolve(false), TERM_GRACE_MS)
    proc.once("exit", () => {
      clearTimeout(timer)
      resolve(true)
    })
    proc.kill("SIGTERM")
  })
  out.exitedOnTerm = exited
  out.exitCode = proc.exitCode
  if (!exited) {
    proc.kill("SIGKILL")
    out.needlessKill = true
    await new Promise((r) => setTimeout(r, 1_000))
  }
  rmSync(profileDir, { recursive: true, force: true })
  return out
}

// -----------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!IS_MAC) {
    console.error(
      `probe-mac-package: darwin only — there is no dmg to mount on ${process.platform}, so there is` +
        " nothing here to measure. Not a pass.",
    )
    process.exitCode = 1
    return
  }

  const dmgs = existsSync(RELEASE) ? readdirSync(RELEASE).filter((f) => f.endsWith(".dmg")).sort() : []
  if (dmgs.length !== 1) {
    console.error(
      `probe-mac-package: expected exactly one .dmg in ${RELEASE}, found ${String(dmgs.length)}` +
        ` [${dmgs.join(" ")}] — run \`bun run dist:mac\` first.`,
    )
    process.exitCode = 1
    return
  }
  const dmg = join(RELEASE, dmgs[0] as string)
  console.log(`probe-mac-package: ${dmgs[0] as string}, ${String(statSync(dmg).size)} bytes`)

  // Residue arms need a before as well as an after, and this is a borrowed host: if either of these is
  // already present the run must not "restore" over it.
  const supportBefore = existsSync(APP_SUPPORT)
  const agentBefore = existsSync(LAUNCH_AGENT)
  const startedAt = Date.now()
  const crashesBefore = new Set(existsSync(CRASH_DIR) ? readdirSync(CRASH_DIR) : [])

  const workDir = mkdtempSync(join(tmpdir(), "fc-macpkg-"))
  const mountPoint = join(workDir, "mnt")
  const installDir = join(workDir, "install")
  const controlDir = join(workDir, "control")

  // `-nobrowse` so no Finder window opens on a desk someone may be using; `-readonly` so the image
  // cannot be the thing this run modifies.
  const attach = sh("hdiutil", ["attach", dmg, "-mountpoint", mountPoint, "-nobrowse", "-readonly"])
  let imageEntries: string[] = []
  let imageApp = ""
  let bundleId: string | null = null
  let uiElement: string | null = null
  let shortVersion: string | null = null
  let iconFile: string | null = null
  let executable: string | null = null
  if (attach.code === 0) {
    imageEntries = readdirSync(mountPoint).filter((e) => !e.startsWith(".")).sort()
    imageApp = imageEntries.find((e) => e.endsWith(".app")) ?? ""
    if (imageApp !== "") {
      const plist = join(mountPoint, imageApp, "Contents", "Info.plist")
      bundleId = plistKey(plist, "CFBundleIdentifier")
      uiElement = plistKey(plist, "LSUIElement")
      shortVersion = plistKey(plist, "CFBundleShortVersionString")
      iconFile = plistKey(plist, "CFBundleIconFile")
      executable = plistKey(plist, "CFBundleExecutable")
      // What a user does with the window the dmg opens, minus the dragging.
      const copied = sh("ditto", [join(mountPoint, imageApp), join(installDir, imageApp)])
      if (copied.code !== 0) console.error(`probe-mac-package: ditto failed: ${copied.err}`)
    }
  } else {
    console.error(`probe-mac-package: hdiutil attach failed (${String(attach.code)}): ${attach.err}`)
  }
  const detach = sh("hdiutil", ["detach", mountPoint, "-quiet"])
  if (detach.code !== 0) console.error(`probe-mac-package: hdiutil detach failed: ${detach.err}`)

  const appPath = join(installDir, imageApp === "" ? "FuzzyClock.app" : imageApp)
  const exeName = executable ?? "FuzzyClock"
  const binary = join(appPath, "Contents", "MacOS", exeName)
  const asar = join(appPath, "Contents", "Resources", "app.asar")
  const icns = join(appPath, "Contents", "Resources", iconFile ?? "icon.icns")
  const fileOut = existsSync(binary) ? sh("file", ["-b", binary]).out : "(no executable)"

  // Snapshotted here rather than read at grading time. See the header: the `finally` below deletes this
  // tree, and the first version of this probe graded these three after it had.
  const installed = { binary: existsSync(binary), asar: existsSync(asar), icns: existsSync(icns) }
  // `/var` is a symlink into `/private` on macOS, so `tmpdir()` and Chromium spell the same directory
  // two different ways. Resolve ours once, while it still exists.
  const installReal = existsSync(installDir) ? realpathSync(installDir) : installDir

  let shipped: Observed | null = null
  let control: Observed | null = null
  let controlAsarGone = false
  try {
    if (existsSync(binary)) {
      shipped = await runBundle("shipped", appPath, exeName, 9411)

      // The control: the same installed bundle, cloned, with the app removed from it. `cp -Rc` asks APFS
      // for a clone rather than 200MB of copying.
      const cloned = sh("cp", ["-Rc", appPath, join(controlDir, imageApp)])
      if (cloned.code !== 0) {
        const dittoed = sh("ditto", [appPath, join(controlDir, imageApp)])
        if (dittoed.code !== 0) console.error(`probe-mac-package: control copy failed: ${dittoed.err}`)
      }
      const controlApp = join(controlDir, imageApp)
      const controlAsar = join(controlApp, "Contents", "Resources", "app.asar")
      if (existsSync(controlAsar)) renameSync(controlAsar, `${controlAsar}.disabled`)
      controlAsarGone = !existsSync(controlAsar)
      control = await runBundle("control", controlApp, exeName, 9412)
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }

  const isoToday = formatDate("ISO", new Date())
  const isoAtStart = formatDate("ISO", new Date(startedAt))
  const crashesAfter = existsSync(CRASH_DIR) ? readdirSync(CRASH_DIR) : []
  const newCrashes = crashesAfter.filter((f) => !crashesBefore.has(f) && /fuzzyclock|electron/i.test(f))

  const s = shipped
  const c = control

  eq("P1", "the dmg mounts read-only and holds the app beside an /Applications drop target",
    [attach.code, imageApp, imageEntries.includes("Applications"), detach.code],
    [0, "FuzzyClock.app", true, 0])

  eq("P2", "the bundle ON THE IMAGE is ours and declares itself an accessory app",
    [bundleId, uiElement, shortVersion, iconFile],
    [APP_ID, "true", "5.0.0-alpha.0", "icon.icns"])

  eq("P3", "installed by copying it off the image: native arm64 binary, asar and icns all present",
    [installed.binary, fileOut.includes("Mach-O"), fileOut.includes("arm64"), installed.asar, installed.icns],
    [true, true, true, true, true])

  eq("P4", "it launched from the copy and served a page out of its OWN asar — not a dev tree",
    [
      s?.targetUrl?.startsWith(`file://${installReal}`) ?? false,
      s?.targetUrl?.includes("/Contents/Resources/app.asar/dist/index.html") ?? false,
    ],
    [true, true])

  eq("P5", "the packaged renderer drew the clock: the phrase face is showing and has text",
    [s?.harvestError, s?.harvest?.phraseFaceDisplay, (s?.harvest?.phrase ?? "").length > 0],
    [null, "inline", true])

  // The six-in-one arm. `--user-data-dir` honoured, the file found, parsed, two non-default fields kept,
  // `core/date.ts` run over the current date, the result in the DOM. `isoAtStart` is the midnight case:
  // a run that straddles it should not read as a broken app.
  const dateOk = s?.harvest?.date === isoToday || s?.harvest?.date === isoAtStart
  eq("P6", "it read the SEEDED settings and formatted the date with our own core (ISO, non-default)",
    [dateOk, s?.harvest?.statsDisplay], [true, "inline"])

  eq("P7", "it was alive when harvested, went down on SIGTERM, and left no crash report",
    [s?.aliveAtHarvest, s?.exitedOnTerm, s?.needlessKill, newCrashes], [true, true, false, []])

  eq("P8", "a launch of the packaged app left NOTHING in Alex's home — no support dir, no LaunchAgent",
    [supportBefore, existsSync(APP_SUPPORT), agentBefore, existsSync(LAUNCH_AGENT)],
    [false, false, false, false])

  eq("P9", "control: with app.asar renamed away, no page of ours is ever served — the arms can fail",
    [controlAsarGone, c?.targetUrl === null || !(c?.targetUrl ?? "").includes("app.asar/dist/index.html"), c?.harvest],
    [true, true, null])

  const width = Math.max(...arms.map((a) => a.claim.length))
  for (const a of arms) console.log(`${a.pass ? "PASS" : "FAIL"}  ${a.id.padEnd(3)}  ${a.claim.padEnd(width)}  ${a.detail}`)

  const failed = arms.filter((a) => !a.pass)
  console.log(`\nprobe-mac-package: ${String(arms.length - failed.length)}/${String(arms.length)} arms passed on darwin`)
  console.log(`  image: [${imageEntries.join(" ")}]  executable=${exeName}  file=${fileOut}`)
  for (const run of [s, c]) {
    if (run === null || run === undefined) continue
    console.log(
      `  ${run.label.padEnd(7)} target=${run.targetUrl ?? "(none)"} alive=${String(run.aliveAtHarvest)}` +
        ` exitedOnTerm=${String(run.exitedOnTerm)} code=${String(run.exitCode)} killed=${String(run.needlessKill)}`,
    )
    console.log(`    profile: [${run.profileEntries.join(" ")}]`)
    if (run.harvest !== null) console.log(`    dom: ${JSON.stringify(run.harvest)}`)
    if (run.harvestError !== null) console.log(`    harvest error: ${run.harvestError}`)
    const tail = `${run.stdout}${run.stderr}`.trim().split(/\r?\n/).filter((l) => l !== "").slice(-4)
    for (const line of tail) console.log(`    log: ${line}`)
  }
  console.log(`  expected date: ${isoToday}${isoToday === isoAtStart ? "" : ` (or ${isoAtStart}, run straddled midnight)`}`)
  if (failed.length > 0) process.exitCode = 1
}

await main()
