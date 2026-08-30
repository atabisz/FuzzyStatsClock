/**
 * The IPC payload guards in `main.ts`, exercised against the real relay bodies in a real main process.
 *
 * ## The gap this closes
 *
 * `.planning/research/ELECTRON-PORT-PLAN.md`'s manual item 6 ends with "what is still owed here is the click
 * and **the relay bodies**". `test/ipc-channels.test.ts` closed the channel *names*; the click is the shell's
 * and stays manual. This closes the bodies — or the part of them that is a guard.
 *
 * Four `ipcMain.on` handlers validate their payload before using it, and each carries a comment saying why:
 * *"this is a process boundary and a malformed payload reaching arithmetic is a main-process exception, which
 * takes the whole app down rather than dropping one scroll."* **Nothing exercised any of them.** They cannot
 * be unit-tested — `main.ts` imports `electron`, so `bun test` cannot load it — and `probe:settings-window`
 * replaces the relays it drives with a recorder, so its 37 arms run past guards that are not there. There is
 * no `process.on("uncaughtException")` anywhere in `src/main/`, so the comments are literal rather than
 * cautious: an unguarded throw in a relay is an unhandled main-process exception.
 *
 * ## Why a renderer can put a malformed payload on the wire at all
 *
 * `preload.ts` forwards its argument unchanged — `resize(size) { ipcRenderer.send("resize", size) }` — and
 * TypeScript's parameter types do not exist at runtime. So `window.fuzzyclock.resize("banana")` evaluated over
 * CDP is a *real* string on the real `resize` channel, arriving at the real guard. No cursor, no tray, no
 * hardware: this is the same trick that made `probe:restart` possible, applied to types instead of position.
 *
 * That also makes the probe honest about the threat model. This is not "an attacker sends a bad message" — a
 * compromised renderer is a different problem with a different answer. It is the shape a **bug** takes: a
 * renderer computing `NaN` for a size, a wheel handler passing an event instead of a direction, a refactor
 * that changes an argument's type on one side of the bridge only. `ipcRenderer.send` is untyped at the seam
 * in exactly the way `ipcMain.on` is, which is the whole reason both files carry the guards.
 *
 * ## Three of the four channels are reachable; `settings-edit` is not, and that is the residual
 *
 * `resize`, `adjust-opacity` and `hover` are on the overlay's preload, so CDP reaches them. `settings-edit`
 * is on `preload-settings.ts`, and the only route to a settings window in the running app is
 * `tray?.popUp()` — the shell-owned menu. So its guard stays uncovered here. Stated rather than papered
 * over: `onSettingsEdit`'s own rejection path is separately covered in core by `applySettingsEdit`, but the
 * relay's `typeof id !== "string"` check in front of it is not.
 *
 * ## Two readings per arm, for the reason `probe:restart` learned the hard way
 *
 * Main's log line and the renderer's DOM are read separately and neither is used to check the other. Hover's
 * primary reading is the backdrop rect's `fill` attribute over CDP, **not** the cadence line in main's log,
 * and `core/hover.ts:19-21` is why: "enter paints the backdrop unconditionally and changes the interval only
 * when the panel is visible." The unconditional half is the better discriminator; the cadence line is
 * printed alongside as detail rather than graded.
 *
 * That choice turned out to be load-bearing on win32, and the reason is worth having in writing rather than
 * as a puzzling `false` in the output: `core/load-average.ts:103` records that `Win32StatsSource
 * .setIntervalSec(0.5)` **declines** the hover cadence and keeps sampling at the configured interval. So
 * `adopted` comes back as the 2.0s it already was, `applyStatsInterval` returns at its
 * `adopted === adoptedIntervalSec` check, and no line is printed. A probe that graded the cadence would read
 * that documented decline as a failed hover. **The cadence half of hover is therefore not covered here** —
 * on this platform it is not observable through this route at all.
 *
 * ## What makes B3 the arm that gives this file its teeth
 *
 * "The malformed payload had no effect" is also what a relay that drops *everything* looks like — a guard
 * inverted to `typeof payload === "number"` would pass every silence arm here. B3 is the discriminator: `NaN`
 * **is** a number, so it passes the relay's `typeof` check and is caught one level down by `onResize`, which
 * announces itself with `resize: refusing NaNxNaN`. B2 silent and B3 loud can only both be true if the relay
 * is deciding on the type rather than refusing everything.
 *
 * The same split runs through the opacity arms, one condition each: B4 (`"2"`) is the `typeof` half, B5
 * (`NaN`) is the `Number.isFinite` half. B5's guard is load-bearing in a way worth stating, because
 * `core/opacity-step.ts:51-53` says so itself — `stepOpacity` deliberately has **no** finiteness check, on
 * the grounds that "`validateSettings` rejects a non-finite opacity before it can reach here". That is true of
 * the load path and not of this one. `Math.sign(NaN)` is `NaN`, the clamp propagates it, `next === current` is
 * false, so `applySettings` would carry a NaN opacity into `setOpacity` **and into the file** — where
 * `JSON.stringify` writes it as `null`. So the relay guard is not standing between a bad wheel event and a
 * dropped scroll; it is standing between a bad wheel event and a corrupt settings file that outlives the
 * process. The mutation run measures whether that is what actually happens.
 *
 * ## Scoping a silence to the send that should not have produced it
 *
 * Every "no such line appeared" arm searches only the stdout written *after* its own send, by marking the
 * buffer's length first. A whole-buffer search would let an earlier arm's log satisfy or spoil a later one,
 * and both directions are wrong quietly.
 *
 * ## The profile is seeded, never bare
 *
 * `SettingsStore.load()` falls back to `legacyWpfSettingsPath()` — Alex's live `%LOCALAPPDATA%\FuzzyClock\
 * settings.json` — when a profile has no file of its own. So the profile is written before launch, and B0 is
 * a blocking interlock on `loaded from own-file`. Every reading here would otherwise depend on his personal
 * configuration, and the arms that compare against the seeded opacity would be comparing against his.
 *
 * The seed is also chosen to make the hover arms possible: `ghostModeEnabled: false`, because with ghost on
 * and no modifier held `hoverEnter` returns `NOTHING` and hovering is not an event at all.
 *
 * Run: `bun run probe:boundary`
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULTS, type AppSettings } from "../src/core/settings.js"
import { SETTINGS_FILENAME } from "../src/main/settings-store.js"
import { spawnElectron } from "./lib/electron-launch.js"

const HERE = import.meta.dirname
const MAIN = join(HERE, "..", "dist", "main.js")

const PORT = 9331
const READY_TIMEOUT_MS = 25_000
const CDP_TIMEOUT_MS = 15_000
/** After PROBE-READY, before the first send: the renderer's first paint and main's stats source starting. */
const SETTLE_MS = 1_500
/** After a send: main's handling is synchronous, but a `backdrop` push has to reach the DOM and back. */
const REACT_MS = 400

/** The seeded opacity. Mid-range on purpose, so a step in either direction is not a clamp. */
const SEED_OPACITY = 0.7

interface CdpTarget {
  readonly type: string
  readonly webSocketDebuggerUrl?: string
}

// ---------------------------------------------------------------------------------------------------
// CDP. One expression, one socket — the same shape as `probe-restart.ts` and `probe-display.ts`.
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

/**
 * The backdrop rect's fill, as the renderer last set it.
 *
 * `core/backdrop.ts` returns the literal `"transparent"` when it should not be painted and `#rrggbbaa`
 * when it should, so this is a two-state reading with no threshold to argue about. Read from the DOM by
 * Chromium, which is independent of anything main says about the same event.
 */
const BACKDROP_EXPR = `(document.getElementById("backdrop")?.getAttribute("fill") ?? "NO-ELEMENT")`

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
// The run.
// ---------------------------------------------------------------------------------------------------

const profileDir = mkdtempSync(join(tmpdir(), "fuzzyclock-boundary-"))
const settingsFile = join(profileDir, SETTINGS_FILENAME)

console.log("probe:boundary — the IPC payload guards, against the real relay bodies")
console.log(`  profile: ${profileDir}`)

const seeded: AppSettings = {
  ...DEFAULTS,
  // `hoverEnter` returns NOTHING with ghost enabled and no modifier held, so the hover arms need it off.
  ghostModeEnabled: false,
  // The OFF state has to be `"transparent"` for the backdrop reading to be two-state.
  backdropAlwaysVisible: false,
  // So a hover enter has a cadence to change (2.0s -> HOVER_INTERVAL_SEC), harvested as detail.
  statsVisible: true,
  statsIntervalSeconds: 2.0,
  opacity: SEED_OPACITY,
  // First-run placement: Electron's default spot, so nothing here depends on this host's monitor layout.
  lastActiveMonitor: "",
  monitorPositions: {},
}
writeFileSync(settingsFile, JSON.stringify(seeded, null, 2), "utf8")

const proc = spawnElectron(MAIN, [
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${String(PORT)}`,
  // Chromium 111+ answers an unlisted `Origin` with a 403 that reads exactly like "the app did not start".
  "--remote-allow-origins=*",
])

let stdout = ""
let stderr = ""
let exited = false
proc.stdout.on("data", (c: Buffer) => {
  stdout += c.toString()
})
proc.stderr.on("data", (c: Buffer) => {
  stderr += c.toString()
})
proc.on("exit", () => {
  exited = true
})

/** stdout written since `mark`. Scopes a silence arm to its own send. */
function since(mark: number): string {
  return stdout.slice(mark)
}

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

try {
  if (!ready) {
    console.log(
      `\n  ABORT: no PROBE-READY within ${String(READY_TIMEOUT_MS / 1000)}s${stderr === "" ? "" : ` — stderr: ${stderr.slice(0, 500)}`}`,
    )
    process.exit(1)
  }

  // ---- B0. The interlock. Blocking: everything below compares against the seed. ----
  const ownFile = /settings: loaded from own-file /.test(stdout)
  arm(
    "B0",
    "the app read the seeded profile and not Alex's live WPF settings",
    ownFile,
    `own-file: ${String(ownFile)}${ownFile ? "" : " — WPF IMPORT OR DEFAULTS; every arm below would be measuring the wrong file"}`,
  )
  if (!ownFile) process.exit(1)

  await new Promise((r) => setTimeout(r, SETTLE_MS))

  const target = await pageTarget(PORT, Date.now() + CDP_TIMEOUT_MS)
  if (target === null) {
    console.log(`\n  ABORT: no CDP page target on port ${String(PORT)}`)
    process.exit(1)
  }
  const ws = target.webSocketDebuggerUrl as string

  /** Evaluate, wait for main and the renderer to react, and hand back the stdout the send produced. */
  async function send(expression: string): Promise<{ error: string | undefined; log: string }> {
    const mark = stdout.length
    const result = await evaluate(ws, expression)
    await new Promise((r) => setTimeout(r, REACT_MS))
    return { error: result.error, log: since(mark) }
  }

  const baselineFill = (await evaluate(ws, BACKDROP_EXPR)).value
  if (baselineFill !== "transparent") {
    // Not an arm — a precondition. If the backdrop is already painted, B1's silence proves nothing.
    console.log(
      `\n  ABORT: backdrop starts at ${JSON.stringify(baselineFill)}, expected "transparent" — B1 could not discriminate`,
    )
    process.exit(1)
  }

  // ============ The malformed battery. Nothing valid is sent until after the liveness arm. ============

  // ---- B1. `hover` with a truthy string, which is the documented harm exactly. ----
  const b1 = await send(`(window.fuzzyclock.hover("yes"), "sent")`)
  const b1Fill = (await evaluate(ws, BACKDROP_EXPR)).value
  const b1Cadence = /telemetry: cadence now .*hover enter/.test(b1.log)
  arm(
    "B1",
    'hover("yes") was dropped — the string is truthy, so unguarded it would land as a real enter',
    b1.error === undefined && b1Fill === "transparent" && !b1Cadence,
    `backdrop fill=${JSON.stringify(b1Fill)} (want "transparent"), cadence line=${String(b1Cadence)} (want false)${b1.error === undefined ? "" : `, send error: ${b1.error}`}`,
  )

  // ---- B2. `resize` with strings: refused at the relay, so the deeper guard never announces itself. ----
  const b2 = await send(`(window.fuzzyclock.resize({ width: "banana", height: "banana" }), "sent")`)
  const b2Refused = /resize: refusing/.test(b2.log)
  arm(
    "B2",
    "resize({width,height} as strings) never reached onResize — silent drop at the relay",
    b2.error === undefined && !b2Refused,
    `"resize: refusing" in this send's output=${String(b2Refused)} (want false)${b2.error === undefined ? "" : `, send error: ${b2.error}`}`,
  )

  // ---- B3. The discriminator. NaN IS a number, so the relay must pass it and onResize must catch it. ----
  const b3 = await send(`(window.fuzzyclock.resize({ width: NaN, height: NaN }), "sent")`)
  const b3Refused = /resize: refusing NaNxNaN/.test(b3.log)
  arm(
    "B3",
    "resize({NaN,NaN}) DID reach onResize — so B2's silence is the typeof guard, not a blanket drop",
    b3.error === undefined && b3Refused,
    `"resize: refusing NaNxNaN"=${String(b3Refused)} (want true); without this arm an inverted guard would pass every silence above`,
  )

  // ---- B4. `adjust-opacity`, the `typeof` half. ----
  const b4 = await send(`(window.fuzzyclock.adjustOpacity("2"), "sent")`)
  const b4Wheel = /\(wheel\)/.test(b4.log)
  const b4Disk = (JSON.parse(readFileSync(settingsFile, "utf8")) as AppSettings).opacity
  arm(
    "B4",
    'adjustOpacity("2") changed nothing — the relay\'s typeof half',
    b4.error === undefined && !b4Wheel && b4Disk === SEED_OPACITY,
    `wheel log=${String(b4Wheel)} (want false), opacity on disk=${JSON.stringify(b4Disk)} (want ${String(SEED_OPACITY)})`,
  )

  // ---- B5. `adjust-opacity`, the `Number.isFinite` half — the one `stepOpacity` relies on. ----
  const b5 = await send(`(window.fuzzyclock.adjustOpacity(NaN), "sent")`)
  const b5Wheel = /\(wheel\)/.test(b5.log)
  const b5Disk = (JSON.parse(readFileSync(settingsFile, "utf8")) as AppSettings).opacity
  arm(
    "B5",
    "adjustOpacity(NaN) changed nothing — stepOpacity has no finiteness guard of its own, so this one is load-bearing",
    b5.error === undefined && !b5Wheel && b5Disk === SEED_OPACITY,
    `wheel log=${String(b5Wheel)} (want false), opacity on disk=${JSON.stringify(b5Disk)} (want ${String(SEED_OPACITY)}); a NaN through here persists as JSON null`,
  )

  // ---- B6. Liveness, before any valid traffic. The crash claim in the relays' own comments. ----
  const alive = await evaluate(ws, `"alive"`)
  arm(
    "B6",
    "the main process survived the whole malformed battery and the renderer still answers",
    !exited && proc.exitCode === null && alive.value === "alive",
    `exited=${String(exited)}, exitCode=${JSON.stringify(proc.exitCode)}, CDP reply=${JSON.stringify(alive.value)}${alive.error === undefined ? "" : ` (${alive.error})`}`,
  )

  // ============ Positive controls. Without these, every silence above is also what a dead channel looks like. ============

  // ---- B7. `hover(true)` — B1's control. ----
  const b7 = await send(`(window.fuzzyclock.hover(true), "sent")`)
  const b7Fill = (await evaluate(ws, BACKDROP_EXPR)).value
  const b7Cadence = /telemetry: cadence now .*hover enter/.test(b7.log)
  arm(
    "B7",
    "hover(true) DID paint the backdrop — so B1 measured a guard rather than a dead channel",
    b7.error === undefined && typeof b7Fill === "string" && b7Fill.startsWith("#"),
    `backdrop fill=${JSON.stringify(b7Fill)} (want #rrggbbaa), cadence line=${String(b7Cadence)} (detail, NOT graded — false is correct on win32: load-average.ts:103, Win32StatsSource declines a 0.5s hover cadence, so applyStatsInterval returns before logging)`,
  )

  // ---- B8. `adjustOpacity(-1)` — B4/B5's control, on the log AND on disk. ----
  const b8 = await send(`(window.fuzzyclock.adjustOpacity(-1), "sent")`)
  const b8Wheel = /opacity = .* \(wheel\)/.exec(b8.log)
  const b8Disk = (JSON.parse(readFileSync(settingsFile, "utf8")) as AppSettings).opacity
  arm(
    "B8",
    "adjustOpacity(-1) DID step the opacity and persist it — so B4/B5 measured a guard rather than a dead channel",
    b8.error === undefined && b8Wheel !== null && typeof b8Disk === "number" && b8Disk !== SEED_OPACITY,
    `log=${b8Wheel === null ? "none" : JSON.stringify(b8Wheel[0])}, opacity on disk=${JSON.stringify(b8Disk)} (was ${String(SEED_OPACITY)})`,
  )
} finally {
  proc.kill()
  await new Promise<void>((resolve) => {
    proc.on("exit", () => resolve())
    setTimeout(resolve, 3_000)
  })
  // The settings write is atomic (tmp-then-rename) but the rename races the kill.
  await new Promise((r) => setTimeout(r, 400))
  cleanup(profileDir)
}

console.log(`\n  ${String(passed)} passed / ${String(failed)} failed  (${process.platform})`)
process.exit(failed === 0 ? 0 : 1)
