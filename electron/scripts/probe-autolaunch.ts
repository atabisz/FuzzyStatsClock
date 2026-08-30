/**
 * ISC-30 — does the login-item registration actually land, read back through someone else's reader?
 *
 * `test/auto-launch.test.ts` drives `main/auto-launch.ts` against fakes and pins the *command and the file
 * contents*. This drives the same class against a **real `reg.exe`, a real filesystem and the production
 * adapters in `main/seams.ts`**, and reads every result back through a reader the module does not own. The
 * two halves answer different questions and neither answers the third:
 *
 *   - The unit test cannot prove `reg.exe` accepts this argv, or that a path with spaces survives it.
 *   - This probe cannot prove the value name is `FuzzyClock` (see the interlock below — it deliberately
 *     writes a different name), so that arm stays in the unit test where it belongs.
 *   - **Neither proves the app starts at login.** That is a manual arm: install, tick the box, reboot, look.
 *     Recorded as such in the port plan rather than papered over with a green here.
 *
 * ## The interlock, and why this file has one at all
 *
 * Alex's live `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` already holds a `FuzzyClock` value
 * pointing at the WPF Release build. That entry is his, it is the thing v5 will eventually replace, and no
 * probe may write it — a probe that clobbers the machine it measures is not an instrument.
 *
 * So {@link guardedRunner} wraps the production runner and rewrites the one argv element that equals
 * {@link WIN_RUN_VALUE} into a probe-scoped name. Everything else about the call — the verb, the key, the
 * type, the argv array shape, the unquoted path — reaches `reg.exe` exactly as the app would send it.
 *
 * The guard **fails closed, and A1 proves it does**, which is the whole reason it is asserted before
 * anything is written. Three ways it refuses:
 *
 *   1. a command that is not `reg`, or a key that is not the Run key
 *   2. a call with **no `/v`** — that names the whole key, and `reg delete` on the whole key would take
 *      every startup entry on the machine with it
 *   3. anything other than **exactly one** `FuzzyClock` argv element, or a `/v` that does not name it
 *
 * A guard nobody tested is the most likely thing here to be wrong, which is why it gets the first arm and a
 * negative control in both directions.
 *
 * ## Two readers, and the second one is the parity arm
 *
 * `reg query` gives the type and data as text. PowerShell's
 * `[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(...).GetValue(name)` is **the same .NET API
 * `AutoLaunchService.cs` reads with** — so an agreement there is cross-implementation parity: what this
 * port's `reg add` writes is what the C#'s reader sees, in kind as well as value. Both are read-only.
 *
 * ## The mac and linux sinks
 *
 * A9 runs those two for real against a temp HOME on this Windows box, through the production `fileSeam`.
 * That is not a substitute for the platform: it proves the file lands at the computed path with the exact
 * expected bytes, that the parent directory gets created (a fresh account has neither
 * `~/Library/LaunchAgents` nor `~/.config/autostart`), that presence is what `isEnabled()` reads, and that
 * **not one process is spawned** — a `launchctl load` would start a second copy the moment the box is
 * ticked.
 *
 * Whether launchd and GNOME then honour the file needs a real host. **The darwin half of that is now
 * closed** — `scripts/probe-launchd.ts` runs the same class against real `launchd` on a real macOS arm64
 * session (9/9 on 2026-08-30): `plutil` validates the plist, `launchctl bootstrap` registers it, and
 * `RunAtLoad` demonstrably spawns the program named in it, with a no-`RunAtLoad` twin as the control that
 * says the spawn is not just bootstrap's side effect. **The linux half stays open** — no host here has had
 * GNOME read the `.desktop` file.
 *
 *     bun run probe:autolaunch
 */

import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  AutoLaunch,
  WIN_RUN_KEY,
  WIN_RUN_VALUE,
  darwinPlist,
  darwinPlistPath,
  linuxDesktopEntry,
  linuxDesktopPath,
  type Runner,
} from "../src/main/auto-launch.js"
import { fileSeam, processRunner } from "../src/main/seams.js"

/**
 * The value name this probe writes. Scoped by pid so two runs cannot fight, and constrained to
 * `[A-Za-z0-9-]` because it is interpolated into a PowerShell literal further down — asserted rather than
 * assumed, since a name is the one thing here that is computed.
 */
const PROBE_VALUE = `FuzzyClockProbe-${String(process.pid)}`
if (!/^[A-Za-z0-9-]+$/.test(PROBE_VALUE)) throw new Error(`unsafe probe value name: ${PROBE_VALUE}`)
if (PROBE_VALUE === WIN_RUN_VALUE) throw new Error("the probe value name collides with the real one")

/**
 * A path with a space, and a second with a space *and* parentheses.
 *
 * Neither needs to exist — the registry stores a string. They are chosen for what they would break: a
 * default Windows install puts the app under `C:\Program Files\`, and `(x86)` is meaningful to `cmd.exe`,
 * so if any part of this path ever went through a shell instead of an argv array these two would be the
 * arms that noticed.
 */
const PROBE_EXE = "C:\\Program Files\\FuzzyClock\\FuzzyClock.exe"
const PROBE_EXE_UPGRADED = "C:\\Program Files (x86)\\FuzzyClock\\FuzzyClock.exe"

const results: { name: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "INCONCLUSIVE", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  → ${verdict}: ${detail}\n`)
}

/** Direct `execFile`, for the read-back only. Never routed through the module under test. */
function sh(command: string, args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, [...args], { windowsHide: true }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === "number" ? error.code : 1
      resolve({ code, stdout, stderr })
    })
  })
}

/** A runner that must never be reached. Any call is the arm failing, not an error to swallow. */
const deadRunner: Runner = {
  run: (command, args) => {
    throw new Error(`a process was spawned when none should be: ${command} ${args.join(" ")}`)
  },
}

/** Records argv without executing. Used to inspect what the guard would have sent. */
function recordingRunner(): { runner: Runner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run: (command, args) => {
        calls.push([command, ...args])
        return Promise.resolve({ code: 0, stdout: "", stderr: "" })
      },
    },
  }
}

/** See the header. Rewrites the value name, refuses anything it does not recognise. */
function guardedRunner(inner: Runner, probeValue: string): { runner: Runner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run: (command, args) => {
        if (command !== "reg") throw new Error(`interlock: refusing to run '${command}' — only reg.exe`)
        if (args[1] !== WIN_RUN_KEY) throw new Error(`interlock: refusing a call against key '${String(args[1])}'`)
        const vIndex = args.indexOf("/v")
        if (vIndex < 0 || args[vIndex + 1] === undefined) {
          // The dangerous shape. Without `/v` a `reg delete` takes the entire Run key.
          throw new Error("interlock: no /v — this call names the WHOLE Run key, not one value")
        }
        const hits = args.filter((a) => a === WIN_RUN_VALUE).length
        if (hits !== 1) throw new Error(`interlock: expected exactly one '${WIN_RUN_VALUE}' argv element, saw ${String(hits)}`)
        if (args[vIndex + 1] !== WIN_RUN_VALUE) throw new Error("interlock: /v does not name the module's constant")
        const rewritten = args.map((a) => (a === WIN_RUN_VALUE ? probeValue : a))
        if (rewritten.includes(WIN_RUN_VALUE)) throw new Error("interlock: the real value name survived the rewrite")
        calls.push([command, ...rewritten])
        return inner.run(command, rewritten)
      },
    },
  }
}

/** `reg query <key> /v <name>` parsed for type and data. `null` when the value is not there. */
async function regRead(name: string): Promise<{ type: string; data: string } | null> {
  const { code, stdout } = await sh("reg", ["query", WIN_RUN_KEY, "/v", name])
  if (code !== 0) return null
  for (const line of stdout.split(/\r?\n/)) {
    // `    NAME    REG_SZ    DATA` — four-space separators, and the type marker is the reliable split point
    // because DATA can contain runs of spaces and NAME can contain single ones.
    const m = /^\s+(.*?)\s{4}(REG_[A-Z_]+)\s{4}(.*)$/.exec(line)
    if (m !== null && m[1] === name) return { type: m[2] as string, data: m[3] as string }
  }
  return null
}

/** Every value name under the Run key. The before/after census that proves nothing else moved. */
async function regCensus(): Promise<string[] | null> {
  const { code, stdout } = await sh("reg", ["query", WIN_RUN_KEY])
  if (code !== 0) return null
  const names: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s+(.*?)\s{4}(REG_[A-Z_]+)\s{4}(.*)$/.exec(line)
    if (m !== null) names.push(m[1] as string)
  }
  return names.sort()
}

/**
 * The same read the C# does: `Registry.CurrentUser.OpenSubKey(...).GetValue(name)`, plus `GetValueKind`.
 *
 * Read-only by construction — `OpenSubKey` with no `writable` argument cannot write. The name is safe to
 * interpolate: it is either the module's own literal or `PROBE_VALUE`, both checked above.
 */
async function dotNetRead(name: string): Promise<{ kind: string; data: string } | null> {
  const script =
    `$ErrorActionPreference='Stop';` +
    `$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run');` +
    `if($null -eq $k){Write-Output 'NOKEY';exit 0};` +
    `$v=$k.GetValue('${name}',$null);` +
    `if($null -eq $v){Write-Output 'ABSENT';exit 0};` +
    `Write-Output ('KIND=' + $k.GetValueKind('${name}'));` +
    `Write-Output ('DATA=' + $v)`
  const { code, stdout } = await sh("powershell", ["-NoProfile", "-NonInteractive", "-Command", script])
  if (code !== 0) return null
  const kind = /^KIND=(.*)$/m.exec(stdout)
  const data = /^DATA=(.*)$/m.exec(stdout)
  if (kind === null || data === null) return null
  return { kind: (kind[1] as string).trim(), data: (data[1] as string).trimEnd() }
}

function winService(runner: Runner): AutoLaunch {
  return new AutoLaunch({ platform: "win32", exePath: PROBE_EXE, homeDir: "unused", runner, fs: fileSeam })
}

const IS_WIN = process.platform === "win32"

// ───────────────────────────────────────────────────────────────────────────────
// A1 — the interlock, before anything is written. Both directions.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A1: the interlock refuses every unsafe shape, and passes the safe one ===")
{
  const refusals: string[] = []
  const attempt = async (label: string, call: () => Promise<unknown>): Promise<void> => {
    try {
      await call()
      refusals.push(`${label}: NOT REFUSED`)
    } catch (error) {
      refusals.push(`${label}: refused — ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  // Inner is `deadRunner`: if the guard lets any of these through, the failure is loud rather than a write.
  const g = guardedRunner(deadRunner, PROBE_VALUE).runner
  await attempt("a delete with no /v", () => g.run("reg", ["delete", WIN_RUN_KEY, "/f"]))
  await attempt("a query of the whole key", () => g.run("reg", ["query", WIN_RUN_KEY]))
  await attempt("another executable", () => g.run("schtasks", ["/Create", "/TN", "x"]))
  await attempt("another registry key", () => g.run("reg", ["add", "HKCU\\SOFTWARE\\Elsewhere", "/v", WIN_RUN_VALUE, "/f"]))
  await attempt("a /v naming something else", () => g.run("reg", ["add", WIN_RUN_KEY, "/v", "OneDrive", "/f"]))
  for (const line of refusals) console.log(`    ${line}`)

  // The positive control: a real `enable()` argv is rewritten and passed on. Without this the five arms
  // above pass against a guard that simply refuses everything, which would be a probe measuring nothing.
  const rec = recordingRunner()
  await winService(guardedRunner(rec.runner, PROBE_VALUE).runner).enable()
  const sent = rec.calls[0] ?? []
  console.log(`    a real enable() reached the runner as: ${sent.join(" ")}`)

  const allRefused = refusals.every((r) => r.includes("refused —"))
  const rewritten = sent.includes(PROBE_VALUE) && !sent.includes(WIN_RUN_VALUE) && sent.includes(PROBE_EXE)
  if (allRefused && rewritten) {
    record(
      "A1 interlock",
      "PASS",
      `all 5 unsafe shapes refused before reaching a runner, and a real enable() passed through with ` +
        `'${WIN_RUN_VALUE}' rewritten to '${PROBE_VALUE}' and the path untouched — so Alex's live entry is ` +
        `unreachable from every arm below`,
    )
  } else {
    record(
      "A1 interlock",
      "FAIL",
      allRefused
        ? `the guard refuses correctly but mangled a legitimate call: ${sent.join(" ")}`
        : `an unsafe shape was NOT refused — see the list above. Nothing further will be written`,
    )
    console.log("=== summary ===")
    for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.name}`)
    console.log("\nABORTED before any write: the interlock is the precondition for every other arm.")
    process.exit(1)
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A2 — Alex's real entry, read-only: the positive control for isEnabled().
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A2: isEnabled() against the REAL FuzzyClock entry the WPF app wrote ===")
const censusBefore = IS_WIN ? await regCensus() : null
const alexEntryBefore = IS_WIN ? await regRead(WIN_RUN_VALUE) : null
if (!IS_WIN) {
  record("A2 real-entry positive control", "INCONCLUSIVE", `not Windows (${process.platform})`)
} else if (alexEntryBefore === null) {
  // Not a failure: another machine, or the WPF app was never told to auto-launch. The arm is only
  // meaningful when the entry exists, and saying so beats a green that measured an absence.
  record(
    "A2 real-entry positive control",
    "INCONCLUSIVE",
    `no '${WIN_RUN_VALUE}' value under the Run key on this host, so there is no C#-written entry to read ` +
      `back. isEnabled()'s positive path is unproven here`,
  )
} else {
  // The real runner, unwrapped — `isEnabled()` only ever runs `reg query`, so this is a read.
  const enabled = await winService(processRunner).isEnabled()
  const viaDotNet = await dotNetRead(WIN_RUN_VALUE)
  console.log(
    `    reg query : ${alexEntryBefore.type}  ${alexEntryBefore.data}\n` +
      `    .NET      : ${viaDotNet === null ? "unreadable" : `${viaDotNet.kind}  ${viaDotNet.data}`}\n` +
      `    isEnabled(): ${String(enabled)}`,
  )
  if (enabled) {
    record(
      "A2 real-entry positive control",
      "PASS",
      `isEnabled() reads true against an entry this port did not write — the WPF app's own ` +
        `Registry.SetValue output, ${alexEntryBefore.type}, pointing at ${alexEntryBefore.data}. Our reader ` +
        `and the C#'s writer agree, which is the parity claim ISC-30 needs and the reason the value name is ` +
        `a constant rather than a product-name lookup`,
    )
  } else {
    record(
      "A2 real-entry positive control",
      "FAIL",
      `the value exists (${alexEntryBefore.type} = ${alexEntryBefore.data}) but isEnabled() said false — ` +
        `the tray tick would read unticked on a machine that does auto-launch`,
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A3-A7 — the write/read-back cycle, under the probe-scoped name. Cleaned up in `finally`.
// ───────────────────────────────────────────────────────────────────────────────
if (!IS_WIN) {
  record("A3 negative control", "INCONCLUSIVE", `not Windows (${process.platform})`)
  record("A4 enable + read-back", "INCONCLUSIVE", `not Windows (${process.platform})`)
  record("A5 idempotency", "INCONCLUSIVE", `not Windows (${process.platform})`)
  record("A6 path correction", "INCONCLUSIVE", `not Windows (${process.platform})`)
  record("A7 disable is a no-op twice", "INCONCLUSIVE", `not Windows (${process.platform})`)
} else {
  const guard = guardedRunner(processRunner, PROBE_VALUE)
  const service = winService(guard.runner)
  try {
    console.log("=== A3: the negative control — isEnabled() is false before anything is written ===")
    {
      const before = await service.isEnabled()
      const read = await regRead(PROBE_VALUE)
      console.log(`    isEnabled(): ${String(before)}   reg query: ${read === null ? "absent" : read.data}`)
      // Without this arm A4 cannot distinguish "enable() wrote it" from "it was already there", and the
      // starting state is not clean if a previous run died between write and cleanup.
      record(
        `A3 negative control`,
        !before && read === null ? "PASS" : "FAIL",
        !before && read === null
          ? `'${PROBE_VALUE}' is absent and isEnabled() reports false, so A4 measures a write rather than a ` +
              `pre-existing entry`
          : `the probe value already exists (${read === null ? "isEnabled true, query absent" : read.data}) — ` +
              `a previous run left it behind, and every arm below would be reading stale state`,
      )
    }

    console.log("=== A4: enable() writes a REG_SZ both readers see, unquoted, spaces intact ===")
    {
      // The index is taken BEFORE the call, because `isEnabled()` below appends a `reg query` and
      // `calls.at(-1)` would then print that instead of the write — a log line that reads plausibly and
      // shows the wrong command.
      const writeIndex = guard.calls.length
      const ok = await service.enable()
      const viaReg = await regRead(PROBE_VALUE)
      const viaDotNet = await dotNetRead(PROBE_VALUE)
      const enabled = await service.isEnabled()
      console.log(
        `    enable()   : ${String(ok)}\n` +
          `    argv sent  : ${(guard.calls[writeIndex] ?? []).join(" ")}\n` +
          `    reg query  : ${viaReg === null ? "ABSENT" : `${viaReg.type}  [${viaReg.data}]`}\n` +
          `    .NET       : ${viaDotNet === null ? "unreadable" : `${viaDotNet.kind}  [${viaDotNet.data}]`}\n` +
          `    isEnabled(): ${String(enabled)}`,
      )
      const problems: string[] = []
      if (!ok) problems.push("enable() returned false")
      if (viaReg === null) problems.push("reg query cannot see the value")
      else {
        if (viaReg.type !== "REG_SZ") problems.push(`type is ${viaReg.type}, not REG_SZ`)
        // The defect this arm exists for: quoting the path produces an entry that exists, reads back fine to
        // a careless eye, and launches nothing at login.
        if (viaReg.data.includes('"')) problems.push(`the data contains a quote: [${viaReg.data}]`)
        if (viaReg.data !== PROBE_EXE) problems.push(`data is [${viaReg.data}], not [${PROBE_EXE}]`)
      }
      if (viaDotNet === null) problems.push(".NET could not read it back")
      else {
        // `RegistryValueKind.String` is what `SetValue(string, string)` writes. Anything else — ExpandString
        // in particular — is a different kind of value wearing the same data.
        if (viaDotNet.kind !== "String") problems.push(`.NET kind is ${viaDotNet.kind}, not String`)
        if (viaDotNet.data !== PROBE_EXE) problems.push(`.NET data is [${viaDotNet.data}]`)
      }
      if (!enabled) problems.push("isEnabled() still reports false")
      record(
        "A4 enable + read-back",
        problems.length === 0 ? "PASS" : "FAIL",
        problems.length === 0
          ? `reg.exe accepted the argv array and both readers return exactly [${PROBE_EXE}] — a spaced path, ` +
              `no quotes, REG_SZ to reg query and RegistryValueKind.String to the .NET API the C# uses`
          : problems.join("; "),
      )
    }

    console.log("=== A5: enable() twice is one entry, not two ===")
    {
      await service.enable()
      const census = await regCensus()
      const hits = (census ?? []).filter((n) => n === PROBE_VALUE).length
      console.log(`    '${PROBE_VALUE}' appears ${String(hits)}× among ${String((census ?? []).length)} Run values`)
      record(
        "A5 idempotency",
        hits === 1 ? "PASS" : "FAIL",
        hits === 1
          ? `two enable() calls against a live Run key have produced exactly one value — /f overwrites, ` +
              `which is what an upgrade needs and what SetValue does`
          : `${String(hits)} entries after repeated enable() calls`,
      )
    }

    console.log("=== A6: re-enabling with a new path CORRECTS the entry ===")
    {
      // The upgrade case the module's own doc names: the install path changes and a stale path is an
      // autostart entry that launches nothing. `(x86)` in the new path is the shell-injection canary.
      const upgraded = new AutoLaunch({
        platform: "win32",
        exePath: PROBE_EXE_UPGRADED,
        homeDir: "unused",
        runner: guard.runner,
        fs: fileSeam,
      })
      await upgraded.enable()
      const viaReg = await regRead(PROBE_VALUE)
      const viaDotNet = await dotNetRead(PROBE_VALUE)
      console.log(
        `    reg query : ${viaReg === null ? "ABSENT" : `[${viaReg.data}]`}\n` +
          `    .NET      : ${viaDotNet === null ? "unreadable" : `[${viaDotNet.data}]`}`,
      )
      const ok = viaReg?.data === PROBE_EXE_UPGRADED && viaDotNet?.data === PROBE_EXE_UPGRADED
      record(
        "A6 path correction",
        ok ? "PASS" : "FAIL",
        ok
          ? `the entry now reads [${PROBE_EXE_UPGRADED}] — parentheses and space intact, so nothing on this ` +
              `path went through a shell, and an upgrade repoints the login item rather than stranding it`
          : `expected [${PROBE_EXE_UPGRADED}], reg query gave [${String(viaReg?.data)}] and .NET gave ` +
              `[${String(viaDotNet?.data)}]`,
      )
    }

    console.log("=== A7: disable() removes it, and a second disable() is a no-op that still reports true ===")
    {
      const first = await service.disable()
      const afterFirst = await regRead(PROBE_VALUE)
      const second = await service.disable()
      const afterSecond = await regRead(PROBE_VALUE)
      const enabled = await service.isEnabled()
      console.log(
        `    disable() #1: ${String(first)}   value: ${afterFirst === null ? "gone" : afterFirst.data}\n` +
          `    disable() #2: ${String(second)}   value: ${afterSecond === null ? "gone" : afterSecond.data}\n` +
          `    isEnabled(): ${String(enabled)}`,
      )
      const ok = first && afterFirst === null && second && afterSecond === null && !enabled
      record(
        "A7 disable is a no-op twice",
        ok ? "PASS" : "FAIL",
        ok
          ? `the value is gone and the second call still answers true — reg delete exits 1 for an absent ` +
              `value and this is the contract the C#'s throwOnMissingValue:false gives, proven against the ` +
              `real exit code rather than a scripted one`
          : `#1 ${String(first)}/${afterFirst === null ? "gone" : "present"}, #2 ${String(second)}/` +
              `${afterSecond === null ? "gone" : "present"}, isEnabled ${String(enabled)}`,
      )
    }
  } finally {
    // Belt and braces. Every arm above should have removed it, but an exception between A4 and A7 would
    // otherwise leave a probe value in a live Run key.
    await sh("reg", ["delete", WIN_RUN_KEY, "/v", PROBE_VALUE, "/f"])
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// A8 — the constraint itself: Alex's registry is exactly as it was found.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A8: the machine is unchanged — census and Alex's entry byte-identical ===")
if (!IS_WIN || censusBefore === null) {
  record("A8 no collateral change", "INCONCLUSIVE", `not Windows, or the Run key could not be enumerated`)
} else {
  const censusAfter = await regCensus()
  const alexEntryAfter = await regRead(WIN_RUN_VALUE)
  const sameCensus = JSON.stringify(censusBefore) === JSON.stringify(censusAfter)
  const sameEntry = JSON.stringify(alexEntryBefore) === JSON.stringify(alexEntryAfter)
  console.log(
    `    before: ${censusBefore.join(", ")}\n` +
      `    after : ${(censusAfter ?? []).join(", ")}\n` +
      `    ${WIN_RUN_VALUE}: ${alexEntryBefore === null ? "absent" : alexEntryBefore.data} → ` +
      `${alexEntryAfter === null ? "absent" : alexEntryAfter.data}`,
  )
  record(
    "A8 no collateral change",
    sameCensus && sameEntry ? "PASS" : "FAIL",
    sameCensus && sameEntry
      ? `the same ${String(censusBefore.length)} value names, and '${WIN_RUN_VALUE}' identical in type and ` +
          `data — the probe added one value and removed it, and touched nothing of Alex's`
      : `the Run key changed: census ${sameCensus ? "same" : "DIFFERENT"}, ${WIN_RUN_VALUE} ` +
          `${sameEntry ? "same" : "DIFFERENT"}. This is the one arm in this file that must never fail`,
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// A9 — the mac and linux sinks, real filesystem, real fileSeam, zero processes.
// ───────────────────────────────────────────────────────────────────────────────
console.log("=== A9: the darwin and linux sinks against a real temp HOME ===")
{
  const home = await mkdtemp(join(tmpdir(), "fc-autolaunch-"))
  try {
    const cases = [
      {
        platform: "darwin" as const,
        path: darwinPlistPath(home),
        expected: darwinPlist(PROBE_EXE),
        // `RunAtLoad` is the login trigger; `KeepAlive` absent is what keeps the tray's Quit meaningful.
        must: ["<key>RunAtLoad</key>", "<true/>", PROBE_EXE],
        mustNot: ["KeepAlive"],
      },
      {
        platform: "linux" as const,
        path: linuxDesktopPath(home),
        expected: linuxDesktopEntry(PROBE_EXE),
        must: ["Type=Application", `Exec=${PROBE_EXE}`, "X-GNOME-Autostart-enabled=true"],
        mustNot: ["NoDisplay=true"],
      },
    ]
    const problems: string[] = []
    for (const c of cases) {
      // `deadRunner`: ticking the box must not spawn `launchctl load` or anything else. A file is written,
      // the app starts at the NEXT login, and nothing starts a second copy now.
      const service = new AutoLaunch({
        platform: c.platform,
        exePath: PROBE_EXE,
        homeDir: home,
        runner: deadRunner,
        fs: fileSeam,
      })
      const before = await service.isEnabled()
      await service.enable()
      // The parent directory did not exist a moment ago — a fresh account has neither of these, and this is
      // `fileSeam`'s recursive mkdir being exercised for real rather than against a Map.
      const written = await readFile(c.path, "utf8")
      const enabled = await service.isEnabled()
      await service.disable()
      const afterDisable = await service.isEnabled()
      const secondDisable = await service.disable()
      console.log(
        `    ${c.platform}: ${c.path}\n` +
          `      isEnabled before/after/removed: ${String(before)}/${String(enabled)}/${String(afterDisable)}` +
          `   bytes: ${String(written.length)}   second disable(): ${String(secondDisable)}`,
      )
      if (before) problems.push(`${c.platform}: isEnabled() true before enable()`)
      if (written !== c.expected) problems.push(`${c.platform}: file contents differ from the module's generator`)
      for (const needle of c.must) if (!written.includes(needle)) problems.push(`${c.platform}: missing ${needle}`)
      for (const needle of c.mustNot) if (written.includes(needle)) problems.push(`${c.platform}: contains ${needle}`)
      if (!enabled) problems.push(`${c.platform}: isEnabled() false with the file present`)
      if (afterDisable) problems.push(`${c.platform}: isEnabled() true after disable()`)
      if (!secondDisable) problems.push(`${c.platform}: a second disable() reported failure`)
    }
    record(
      "A9 darwin + linux sinks",
      problems.length === 0 ? "PASS" : "FAIL",
      problems.length === 0
        ? `both sinks write, read back and remove through the production fileSeam on a real filesystem, ` +
            `creating a parent directory that did not exist, with RunAtLoad present, KeepAlive absent, and ` +
            `NOT ONE process spawned. What this cannot show: whether launchd and GNOME honour the files — ` +
            `that needs a real host and stays open`
        : problems.join("; "),
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

console.log("=== summary ===")
for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.name}`)
const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE").length
console.log(`\n${String(passed)} passed / ${String(failed)} failed / ${String(inconclusive)} inconclusive`)
console.log(
  "\nStill unproven by anything in this file, and named rather than implied:\n" +
    "  - that the app actually launches at login. Install, tick the box, reboot, look. Windows only\n" +
    "    on this host; the mac and linux halves need their own hosts.\n" +
    "  - that the value name is `FuzzyClock`. Deliberately not written here — `test/auto-launch.test.ts`\n" +
    "    pins it, and this probe writes a scoped name precisely so it cannot touch Alex's live entry.",
)
process.exit(failed > 0 ? 1 : 0)
