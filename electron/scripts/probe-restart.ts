/**
 * Position persistence across a real restart, on a real display, through the real settings file.
 *
 * ## The gap this closes, and the half it deliberately leaves open
 *
 * `.planning/research/ELECTRON-PORT-PLAN.md`'s manual item 3 is one sentence with two claims in it:
 * *"drag the widget, including across the monitor seam, then restart and confirm the position restores —
 * Phase 3's live half, covered against fakes only."* The **drag** needs a pointer: `onDragMove` moves the
 * window by `screen.getCursorScreenPoint()`'s delta, so exercising it means moving Alex's own cursor, and
 * the **seam** needs two monitors and that same cursor. Those stay manual.
 *
 * **The restart does not.** "The app wrote a position, then a fresh process read it back and put the window
 * there" is a claim about a file, a real `screen` module and two real launches — and `core/placement.ts` is
 * 100% covered against a *fake* screen, which is precisely the coverage that cannot see a wiring defect. So
 * this probe drives `drag-start`/`drag-end` over CDP (the anchor and the commit, with no cursor movement in
 * between), kills the app, and launches it again on the **same profile directory**.
 *
 * ## Three readings per launch, from three places that do not share a bug
 *
 *   1. **What main says it did** — `[main] info placement: restored to (x, y) on <key> via <source>`, off
 *      stdout, including its `-- CLAMPED back on-screen` suffix.
 *   2. **Where the OS window actually is** — `window.screenX/screenY` read in the renderer over CDP. This
 *      comes from Chromium, not from our code, so an arm pairing it with (1) is what makes either
 *      trustworthy: main asserting its own success is not evidence, and a position with no claim attached to
 *      it is not either.
 *   3. **What is on disk** — `settings.json` under the throwaway profile, parsed as JSON.
 *
 * A tolerance of {@link SCREEN_TOLERANCE_PX} is allowed between (1) and (2) and the delta is always printed:
 * `getBounds()` is in DIPs and `window.screenX` in CSS pixels, which are the same unit on every host here
 * but need not round identically on a fractionally-scaled display. Systematic disagreement would be a
 * finding, so it is reported rather than absorbed.
 *
 * ## P0 is an interlock, not an arm, and it exists because the default path reads Alex's live WPF file
 *
 * `SettingsStore.load()` falls back to `legacyWpfSettingsPath()` — `%LOCALAPPDATA%\FuzzyClock\settings.json`,
 * Alex's **real** v4.x configuration — whenever the profile has no file of its own. That is a read and not a
 * write, so it breaks no rule, but it would make every first-run reading here depend on his personal
 * settings; `settings-store.ts:96-101` records that exact failure happening once already in the unit tests.
 * So **no launch in this probe is a bare first run.** Every profile is seeded with a complete settings file,
 * and the `first-run` *branch* is reached the honest way instead — by seeding `lastActiveMonitor: ""` with no
 * stored positions, which is what `resolveStartPosition` reads as a first run (`core/placement.ts:211-219`).
 * P0 then requires every launch to have logged `loaded from own-file`, so a regression that reaches for the
 * legacy path turns this probe red instead of quietly measuring Alex's desk.
 *
 * ## What makes P4 discriminating
 *
 * The soft version of this probe writes a position, reads it back, and passes — while being unable to tell
 * "the commit saved where the window is" from "the commit echoed the settings it was handed". P3 breaks that
 * tie by seeding a position **99,999px off-screen**: the live window is then nowhere near the stored value,
 * the clamp must move it, and P4 requires the file to end up holding the *clamped* position. An echo fails
 * by about 99,000px in both axes, which is not a tolerance anyone can argue with.
 *
 * P6 is the other half of the same duty: it seeds a `lastActiveMonitor` no display can match, so `via key`
 * is shown to be a reading that discriminates rather than the only string this log line ever prints.
 *
 * ## P5 took three passes, and both failures are the same mistake in different clothes
 *
 * Deleting `restore()`'s `setPosition` call — the most obvious way for this feature to break — turned P1, P3b
 * and P6 red and **left P5 green**. With the restore neutered the window sat at Electron's own default, the
 * commit correctly saved *that*, and the restart then "restored" to a position the window was already at: three
 * readings agreeing, all on the same wrong number. So P5 gained a clause requiring the restored position to
 * differ from where this app puts a window with nothing stored.
 *
 * **That clause was still green under the same mutation**, because it took its baseline from launch 1's *log*
 * rather than from launch 1's *window* — and the log was the thing under suspicion. Main claimed (3188, 20) on
 * both launches while Chromium reported (1604, 566) on both, so the clause found a difference that existed only
 * in main's own words. It now compares Chromium's reading to Chromium's reading. Twice in one arm, the failure
 * was **using the claim as the baseline for checking the claim** — which is the whole reason reading (2) is in
 * this probe, and evidently not a lesson one paragraph in a header is enough to apply.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULTS, type AppSettings } from "../src/core/settings.js"
import { SETTINGS_FILENAME } from "../src/main/settings-store.js"
import { spawnElectron } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const MAIN = join(HERE, "..", "dist", "main.js")

const READY_TIMEOUT_MS = 25_000
const CDP_TIMEOUT_MS = 15_000
/** After `PROBE-READY`: the renderer's `resize` and main's re-clamp both follow it. */
const SETTLE_MS = 1_500
/** DIPs vs CSS pixels — see the header. Small enough that a real placement bug cannot hide under it. */
const SCREEN_TOLERANCE_PX = 2
/** Far outside any plausible desktop, in both axes, so the clamp has to do visible work. */
const OFFSCREEN = { left: 99_999, top: 99_999 }

interface CdpTarget {
  readonly type: string
  readonly webSocketDebuggerUrl?: string
}

/** What main said about placement, parsed out of its own log line. */
interface RestoreLog {
  readonly left: number
  readonly top: number
  readonly key: string
  readonly source: string
  readonly clamped: boolean
}

/** Where Chromium says the window is. */
interface ScreenPos {
  readonly x: number
  readonly y: number
}

interface Launch {
  readonly ok: boolean
  readonly why: string
  readonly stdout: string
  readonly ownFile: boolean
  readonly restore: RestoreLog | null
  /** Read after the drag commit, so it reflects any snap or clamp the commit applied. */
  readonly screen: ScreenPos | null
  /** Read before the drag commit. */
  readonly screenBefore: ScreenPos | null
}

// ---------------------------------------------------------------------------------------------------
// CDP. Same shape as `probe-display.ts` and `probe-settings-window.ts`: one expression, one socket.
// ---------------------------------------------------------------------------------------------------

async function pageTarget(port: number, deadline: number): Promise<CdpTarget | null> {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`)
      const list = (await response.json()) as CdpTarget[]
      const page = list.find((t) => t.type === "page" && typeof t.webSocketDebuggerUrl === "string")
      if (page !== undefined) return page
    } catch {
      // Chromium binds the endpoint lazily; a refusal here is normal.
    }
    await new Promise((r) => setTimeout(r, 200))
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
        // Already closing.
      }
      resolve(outcome)
    }
    const timer = setTimeout(() => finish({ error: "CDP evaluate timed out" }), CDP_TIMEOUT_MS)
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      )
    })
    ws.addEventListener("message", (event: MessageEvent) => {
      clearTimeout(timer)
      try {
        const message = JSON.parse(String(event.data)) as {
          result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } }
        }
        const details = message.result?.exceptionDetails
        if (details !== undefined) finish({ error: details.text ?? "renderer threw" })
        else finish({ value: message.result?.result?.value })
      } catch (err) {
        finish({ error: `unparseable CDP reply: ${String(err)}` })
      }
    })
    ws.addEventListener("error", () => finish({ error: "CDP socket error" }))
  })
}

/** `window.screenX/screenY` — Chromium's own view of where the OS put the window. */
const SCREEN_EXPR = "({ x: window.screenX, y: window.screenY })"

/**
 * The anchor and the commit, with **no** `dragMove` between them.
 *
 * `dragMove` is the one call that reads the cursor, so leaving it out is what makes this scriptable — and
 * it is also why manual item 3's drag half survives this probe. The commit still does its real work: it
 * reads `getBounds()`, snaps on the `"drag"` reason, clamps, `setPosition`s if either moved it, and saves.
 */
const DRAG_EXPR = "(window.fuzzyclock.dragStart(), window.fuzzyclock.dragEnd(), 'sent')"

// ---------------------------------------------------------------------------------------------------
// Parsing main's own words.
// ---------------------------------------------------------------------------------------------------

function parseRestore(stdout: string): RestoreLog | null {
  // `[main] info placement: restored to (12, 34) on <key> via key -- CLAMPED back on-screen`
  const match = /placement: restored to \((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\) on (.*?) via (\S+)(.*)$/m.exec(
    stdout,
  )
  if (match === null) return null
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    key: (match[3] as string).trim(),
    source: match[4] as string,
    clamped: /CLAMPED back on-screen/.test(match[5] as string),
  }
}

// ---------------------------------------------------------------------------------------------------
// A launch.
// ---------------------------------------------------------------------------------------------------

/**
 * Start the real app on `profileDir`, harvest, optionally commit a placement, harvest again, kill.
 *
 * The profile directory is the caller's, never a fresh one: reusing it across two calls is the entire
 * mechanism under test.
 */
async function launch(profileDir: string, port: number, drag: boolean): Promise<Launch> {
  const proc = spawnElectron(MAIN, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${String(port)}`,
    // Chromium 111+ answers an unlisted `Origin` with a 403 that reads exactly like "the app did not start".
    "--remote-allow-origins=*",
  ])
  let stdout = ""
  let stderr = ""
  proc.stdout.on("data", (c: Buffer) => {
    stdout += c.toString()
  })
  proc.stderr.on("data", (c: Buffer) => {
    stderr += c.toString()
  })

  const ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS)
    const check = setInterval(() => {
      if (/^PROBE-READY /m.test(stdout)) {
        clearInterval(check)
        clearTimeout(timer)
        resolve(true)
      }
    }, 100)
    proc.on("exit", () => {
      clearInterval(check)
      clearTimeout(timer)
      resolve(/^PROBE-READY /m.test(stdout))
    })
  })

  let screenBefore: ScreenPos | null = null
  let screen: ScreenPos | null = null
  let why = ""

  if (!ready) {
    why = `no PROBE-READY within ${String(READY_TIMEOUT_MS / 1000)}s${stderr === "" ? "" : ` — stderr: ${stderr.slice(0, 400)}`}`
  } else {
    await new Promise((r) => setTimeout(r, SETTLE_MS))
    const target = await pageTarget(port, Date.now() + CDP_TIMEOUT_MS)
    if (target === null) {
      why = `no CDP page target on port ${String(port)}`
    } else {
      const url = target.webSocketDebuggerUrl as string
      const first = await evaluate(url, SCREEN_EXPR)
      if (first.error !== undefined) why = `screen read failed: ${first.error}`
      else screenBefore = first.value as ScreenPos
      if (drag && why === "") {
        const sent = await evaluate(url, DRAG_EXPR)
        if (sent.error !== undefined) why = `drag failed: ${sent.error}`
        else {
          // The commit is synchronous in main, but the `setPosition` it may perform is an OS call and the
          // renderer's `window.screenX` is updated by the browser process. One frame of slack.
          await new Promise((r) => setTimeout(r, 500))
          const after = await evaluate(url, SCREEN_EXPR)
          if (after.error !== undefined) why = `post-drag screen read failed: ${after.error}`
          else screen = after.value as ScreenPos
        }
      } else if (why === "") {
        screen = screenBefore
      }
    }
  }

  proc.kill()
  await new Promise<void>((resolve) => {
    proc.on("exit", () => resolve())
    setTimeout(resolve, 3_000)
  })
  // The write is atomic (`settings-store.ts`'s tmp-then-rename), but the rename races the kill, and a
  // reader that wins that race sees the previous contents and blames the commit.
  await new Promise((r) => setTimeout(r, 400))

  return {
    ok: why === "",
    why,
    stdout,
    ownFile: /settings: loaded from own-file /.test(stdout),
    restore: parseRestore(stdout),
    screen,
    screenBefore,
  }
}

/** Chromium's children outlive the main process and hold the profile lock. */
function cleanup(dir: string): void {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      if (attempt === 6) console.log(`  note: could not remove ${dir} — left for the OS to reap`)
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Settings I/O on the throwaway profile.
// ---------------------------------------------------------------------------------------------------

function settingsPath(profileDir: string): string {
  return join(profileDir, SETTINGS_FILENAME)
}

function seed(profileDir: string, overrides: Partial<AppSettings>): void {
  const settings: AppSettings = { ...DEFAULTS, ...overrides }
  writeFileSync(settingsPath(profileDir), JSON.stringify(settings, null, 2), "utf8")
}

function readSettings(profileDir: string): AppSettings {
  return JSON.parse(readFileSync(settingsPath(profileDir), "utf8")) as AppSettings
}

// ---------------------------------------------------------------------------------------------------
// Arms.
// ---------------------------------------------------------------------------------------------------

let passed = 0
let failed = 0

function arm(id: string, claim: string, ok: boolean, detail: string): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}: ${claim}`)
  console.log(`        ${detail}`)
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= SCREEN_TOLERANCE_PX
}

function agrees(log: RestoreLog | null, pos: ScreenPos | null): boolean {
  return log !== null && pos !== null && near(log.left, pos.x) && near(log.top, pos.y)
}

function delta(log: RestoreLog | null, pos: ScreenPos | null): string {
  if (log === null || pos === null) return "one side missing"
  return `logged (${String(log.left)}, ${String(log.top)}) vs screenX/Y (${String(pos.x)}, ${String(pos.y)}) — delta (${String(pos.x - log.left)}, ${String(pos.y - log.top)})`
}

// ---------------------------------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------------------------------

if (!existsSync(MAIN)) {
  console.log(`  ${MAIN} is missing — run \`bun run build\` first.`)
  process.exit(1)
}

console.log("=== Position persistence across a real restart: three launches on ONE profile, plus a control ===")
console.log(`  platform: ${process.platform}`)
console.log("  Manual item 3's drag and seam halves are NOT covered — `dragMove` reads the real cursor.\n")

const profile = mkdtempSync(join(tmpdir(), "fc-restart-profile-"))
const controlProfile = mkdtempSync(join(tmpdir(), "fc-restart-control-"))

try {
  // -- Launch 1: the first-run branch, reached without a bare profile. ------------------------------
  //
  // `lastActiveMonitor: ""` with no stored positions is what `resolveStartPosition` reads as a first run,
  // and seeding a real file is what keeps `SettingsStore.load()` off Alex's live WPF settings.
  seed(profile, { monitorPositions: {}, lastActiveMonitor: "" })
  console.log("-- launch 1: seeded as a first run (no stored positions), then commit a placement")
  const one = await launch(profile, 9422, true)
  console.log(one.ok ? "   launched\n" : `   PROBLEM: ${one.why}\n`)

  arm(
    "P1",
    "the app takes the first-run branch and lands where it says it landed",
    one.ok && one.restore !== null && one.restore.source === "first-run" && agrees(one.restore, one.screenBefore),
    `source=${one.restore?.source ?? "no restore line"}, ${delta(one.restore, one.screenBefore)}`,
  )

  const afterOne = existsSync(settingsPath(profile)) ? readSettings(profile) : null
  const keys = afterOne === null ? [] : Object.keys(afterOne.monitorPositions)
  const committedKey = keys[0] ?? ""
  const committed = afterOne === null ? undefined : afterOne.monitorPositions[committedKey]
  arm(
    "P2",
    "the commit writes the LIVE window position to disk, under a key that resolves",
    afterOne !== null &&
      keys.length === 1 &&
      afterOne.lastActiveMonitor === committedKey &&
      committed !== undefined &&
      one.screen !== null &&
      near(committed.left, one.screen.x) &&
      near(committed.top, one.screen.y),
    `keys=${JSON.stringify(keys)}, lastActiveMonitor=${JSON.stringify(afterOne?.lastActiveMonitor ?? null)}, ` +
      `stored=${JSON.stringify(committed ?? null)}, post-drag screenX/Y=${JSON.stringify(one.screen)}`,
  )

  // -- Launch 2: the same profile, position moved 99,999px off-screen. ------------------------------
  const rewritten: AppSettings = {
    ...(afterOne ?? DEFAULTS),
    monitorPositions: { [committedKey]: OFFSCREEN },
    lastActiveMonitor: committedKey,
  }
  writeFileSync(settingsPath(profile), JSON.stringify(rewritten, null, 2), "utf8")
  const readBack = readSettings(profile).monitorPositions[committedKey]
  arm(
    "P3a",
    "the off-screen seed really is on disk before the launch that must correct it",
    readBack !== undefined && readBack.left === OFFSCREEN.left && readBack.top === OFFSCREEN.top,
    `read back from ${settingsPath(profile)}: ${JSON.stringify(readBack ?? null)}`,
  )

  console.log("\n-- launch 2: same profile, position seeded 99,999px off-screen, then commit")
  const two = await launch(profile, 9423, true)
  console.log(two.ok ? "   launched\n" : `   PROBLEM: ${two.why}\n`)

  arm(
    "P3b",
    "the clamp fires on REAL display geometry and says so, and the window is nowhere near the seed",
    two.ok &&
      two.restore !== null &&
      two.restore.clamped &&
      two.restore.source === "key" &&
      two.screenBefore !== null &&
      Math.abs(two.screenBefore.x - OFFSCREEN.left) > 1_000 &&
      Math.abs(two.screenBefore.y - OFFSCREEN.top) > 1_000 &&
      agrees(two.restore, two.screenBefore),
    `source=${two.restore?.source ?? "none"}, clamped=${String(two.restore?.clamped ?? false)}, ` +
      `${delta(two.restore, two.screenBefore)}`,
  )

  const afterTwo = readSettings(profile)
  const storedTwo = afterTwo.monitorPositions[afterTwo.lastActiveMonitor]
  arm(
    "P4",
    "the commit saves the CLAMPED position, not the settings it was handed — an echo would miss by ~99,000px",
    storedTwo !== undefined &&
      storedTwo.left !== OFFSCREEN.left &&
      storedTwo.top !== OFFSCREEN.top &&
      two.screen !== null &&
      near(storedTwo.left, two.screen.x) &&
      near(storedTwo.top, two.screen.y),
    `stored=${JSON.stringify(storedTwo ?? null)}, post-drag screenX/Y=${JSON.stringify(two.screen)}, ` +
      `seed was ${JSON.stringify(OFFSCREEN)}`,
  )

  // -- Launch 3: the restart. Nothing is touched between launch 2's exit and this. ------------------
  console.log("\n-- launch 3: THE RESTART — same profile, nothing edited, no drag")
  const three = await launch(profile, 9424, false)
  console.log(three.ok ? "   launched\n" : `   PROBLEM: ${three.why}\n`)

  // A position only a file read could have produced. Mutation 1 — deleting `restore()`'s `setPosition` — is
  // what put this clause here: with the restore neutered, the window sat at Electron's own default, the
  // commit dutifully saved *that*, and the restart then "restored" to a position it was already at. Every
  // other clause below passed. So an arm that only checks "the window is where the file says" cannot tell a
  // working restore from a restore that never ran, whenever the two coincide — and the fix is to require the
  // restored position to differ from where this app puts a window with nothing stored, which is launch 1's
  // own first-run reading rather than a number written in here.
  // `one.screenBefore` — Chromium's reading — and NOT `one.restore`, which is main's claim about the same
  // thing. Using the claim as the baseline for checking the claim is how the first fix to this arm failed:
  // under the mutation, main still *said* (3188, 20) while both windows really sat at (1604, 566), so the
  // comparison found a difference that existed only in the log.
  const firstRunPos = one.screenBefore
  const movedFromDefault =
    firstRunPos !== null &&
    three.screen !== null &&
    (!near(three.screen.x, firstRunPos.x) || !near(three.screen.y, firstRunPos.y))
  arm(
    "P5",
    "a fresh process restores the position the app itself wrote, to somewhere it would not have landed anyway",
    three.ok &&
      three.restore !== null &&
      three.restore.source === "key" &&
      !three.restore.clamped &&
      storedTwo !== undefined &&
      near(three.restore.left, storedTwo.left) &&
      near(three.restore.top, storedTwo.top) &&
      agrees(three.restore, three.screen) &&
      movedFromDefault,
    `source=${three.restore?.source ?? "none"}, clamped=${String(three.restore?.clamped ?? false)}, ` +
      `on disk=${JSON.stringify(storedTwo ?? null)}, ${delta(three.restore, three.screen)}; ` +
      `differs from the OBSERVED first-run position (${String(firstRunPos?.x ?? "?")}, ${String(firstRunPos?.y ?? "?")}): ${String(movedFromDefault)}` +
      (movedFromDefault ? "" : " — a restore that never ran would look identical to this"),
  )

  arm(
    "P0",
    "INTERLOCK: every launch read its OWN settings file, never Alex's live WPF one",
    one.ownFile && two.ownFile && three.ownFile,
    `own-file: launch 1 ${String(one.ownFile)}, launch 2 ${String(two.ownFile)}, launch 3 ${String(three.ownFile)}` +
      ` — a false here means the probe measured %LOCALAPPDATA%\\FuzzyClock\\settings.json`,
  )

  // -- Control: a key no display can match. --------------------------------------------------------
  //
  // Without this, `source === "key"` in P3b and P5 could be the only string this log line ever emits, and
  // both arms would be reading a constant.
  seed(controlProfile, {
    monitorPositions: { "no-such-display-9999x9999+7+7": { left: 40, top: 40 } },
    lastActiveMonitor: "no-such-display-9999x9999+7+7",
  })
  console.log("\n-- control: a lastActiveMonitor no display can match")
  const control = await launch(controlProfile, 9425, false)
  console.log(control.ok ? "   launched\n" : `   PROBLEM: ${control.why}\n`)

  arm(
    "P6",
    "CONTROL: an unmatchable key does NOT report `via key`, and the window still lands on a real display",
    control.ok &&
      control.restore !== null &&
      control.restore.source !== "key" &&
      control.restore.source !== "first-run" &&
      control.restore.key !== "" &&
      agrees(control.restore, control.screen),
    `source=${control.restore?.source ?? "none"} (expected geometry or primary), ` +
      `key it ended up on=${JSON.stringify(control.restore?.key ?? null)}, ${delta(control.restore, control.screen)}`,
  )
} finally {
  cleanup(profile)
  cleanup(controlProfile)
}

console.log(`\n=== ${String(passed)} passed / ${String(failed)} failed ===`)
console.log(
  "  Still manual in item 3: the drag itself (`dragMove` reads the real cursor) and the monitor seam\n" +
    "  (two displays and that same cursor). What is no longer manual is the restart, the live clamp, and\n" +
    "  that the commit saves where the window IS rather than what it was handed.",
)
process.exit(failed === 0 ? 0 : 1)
