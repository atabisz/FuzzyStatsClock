/**
 * Probe: does the Windows battery reading actually arrive, through a real `spawn`?
 *
 * Run: `bun scripts/probe-battery.ts` from `electron/`. No Electron needed — the telemetry source imports
 * nothing from it, which is the point of the seam. The AC-line reader that `main.ts` injects from
 * `powerMonitor` is therefore *absent* here, so this run also exercises the `BatteryStatus` fallback path.
 *
 * ## Why this cannot be a unit test
 *
 * `test/powershell-parse.test.ts` covers the line format completely, and it would pass identically against a
 * child that never emitted a line at all. Two failure modes live strictly outside it, and both are the kind
 * that work in a shell and break under `spawn`:
 *
 *   - **Argument quoting.** The script is one argv element containing single quotes, `$` sigils and braces.
 *     It was written after a harness of mine lost its double quotes passing PowerShell to PowerShell and
 *     "measured" a query whose output formatting had failed. Node's own quoting is a different code path.
 *   - **Pipe buffering.** PowerShell's stdout is not line-buffered when it is a pipe. A reading that arrives
 *     in a 60-second-late batch is worse than a missing one, and the `[Console]::Out.Flush()` that prevents
 *     it is unverifiable without a real pipe on the other end.
 *
 * ## Arms
 *
 * B1 arrival    — a battery sample reaches `onSample` within one interval plus the measured 1.4s startup.
 *                 Discriminating because the whole mechanism has to work end to end: spawn, quote, query,
 *                 flush, line-reassemble, parse, emit.
 * B2 plausible  — the percentage is 0-100 **or** exactly `-1`, and `-1` is reported rather than scored, since
 *                 a desktop has no battery and that is a correct answer, not a failure. The negative control
 *                 is the one that matters: a reading of `2` on a machine reporting `BatteryStatus=2` would be
 *                 the field-shift defect, so a percentage that equals the status code is called out.
 * B3 cadence    — the second sample arrives about one interval after the first, from ARRIVAL times. Unlike
 *                 `probe-typeperf.ts`'s A2 this is legitimate here: the child sleeps between reads, so its
 *                 own emission times are the quantity under test and there is no 40KB header to skew them.
 * B4 coupling   — drives `handleBatteryLine` directly with the sentinel cases, asserting that an unreadable
 *                 percentage forces `pluggedIn: false`. That is the C# coupling from `StatsService.cs:70-90`,
 *                 and this arm is here rather than only in the unit test because it is the one place the
 *                 *wired* path is checked instead of the parser in isolation.
 * B5 teardown   — no `powershell.exe` bearing this probe's script survives `stop()`. A probe that leaks a
 *                 1-per-minute WMI poller per run is a probe that should not be run twice.
 */

import { spawnSync } from "node:child_process"
import { UNAVAILABLE, type StatsSample } from "../src/shared.js"
import { Win32StatsSource, batteryScript } from "../src/main/telemetry/win32.js"

type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE"
const results: { arm: string; verdict: Verdict; evidence: string }[] = []

function record(arm: string, verdict: Verdict, evidence: string): void {
  results.push({ arm, verdict, evidence })
  const mark = verdict === "PASS" ? "PASS" : verdict === "FAIL" ? "FAIL" : "INCO"
  console.log(`  [${mark}] ${arm} — ${evidence}`)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * How many `powershell.exe` processes are running our battery loop right now.
 *
 * Matched on a distinctive fragment of the script rather than on the image name: this host runs plenty of
 * unrelated PowerShell, and counting those would be wrong.
 *
 * **The pattern is assembled by concatenation, and that is load-bearing.** Written as the literal
 * `'*batt none*'` this query counts ITSELF — its own command line contains the fragment it is searching
 * command lines for, so it returned 1 on a run where nothing was leaked and the arm passed for the wrong
 * reason. Split across a `+`, the contiguous substring never appears in this process's own command line.
 */
function batteryChildCount(): number {
  const out = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$pat = '*batt' + ' none*'; " +
        "@(Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | " +
        "Where-Object { $_.CommandLine -like $pat }).Count",
    ],
    { encoding: "utf8", windowsHide: true },
  )
  return Number.parseInt((out.stdout || "").trim(), 10)
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    console.log(`This probe is Windows-only; platform is ${process.platform}. Nothing measured.`)
    process.exit(0)
  }

  const INTERVAL_SEC = 2
  console.log(`\nprobe-battery: ${String(INTERVAL_SEC)}s battery interval, no injected AC reader\n`)
  console.log(`script: powershell.exe -NoProfile -NonInteractive -Command ${batteryScript(INTERVAL_SEC)}\n`)

  const before = batteryChildCount()
  const samples: { at: number; battery: number; pluggedIn: boolean }[] = []
  const logs: string[] = []

  const source = new Win32StatsSource({
    intervalSec: 1,
    // 0 disables the GPU recycle. This probe is about the battery, and a recycle mid-run would put two more
    // typeperf spawns into the window for no reason.
    recycleMs: 0,
    batteryIntervalSec: INTERVAL_SEC,
    log: (level, message) => {
      logs.push(`${level}: ${message}`)
      if (level !== "info") console.log(`       ${level}: ${message}`)
    },
  })

  const startedAt = performance.now()
  source.start((sample: Partial<StatsSample>) => {
    // Only battery-bearing samples. The scalar children emit cpu/mem/pag on their own cadence and would
    // otherwise flood this.
    if (sample.battery === undefined) return
    samples.push({ at: performance.now() - startedAt, battery: sample.battery, pluggedIn: sample.pluggedIn ?? false })
  })

  // Startup was measured at ~1.4s to first line; two intervals past that leaves room for a slow WMI
  // handshake without making a hang look like a pass.
  await sleep(1_500 + INTERVAL_SEC * 2_500)

  // ── B1 arrival ─────────────────────────────────────────────────────────────
  // The give-up path emits `{battery: -1, pluggedIn: false}` deliberately, so that it is `N/A` on screen rather
  // than a stale number. That emission is indistinguishable BY VALUE from a genuine `batt none`, and on the
  // first run of this probe it made B1 pass against a child that had died four times without ever reporting.
  // The source says out loud when it gives up, so the log is what discriminates -- not the sample.
  const gaveUp = logs.some((l) => l.includes("giving up"))
  if (gaveUp) {
    record(
      "B1 arrival",
      "FAIL",
      `the battery child never produced a line — it exited and was restarted to exhaustion. ` +
        `The one sample seen is the give-up sentinel, not a reading. Logs: ${logs.filter((l) => !l.startsWith("info")).join(" | ")}`,
    )
  } else if (samples.length === 0) {
    record(
      "B1 arrival",
      "FAIL",
      `no battery sample in ${((performance.now() - startedAt) / 1000).toFixed(1)}s — ` +
        `spawn, quoting or flushing is broken. Logs: ${logs.join(" | ") || "(none)"}`,
    )
  } else {
    const first = samples[0]
    record(
      "B1 arrival",
      "PASS",
      `first battery sample at ${(first?.at ?? 0).toFixed(0)}ms: ` +
        `battery=${String(first?.battery)} pluggedIn=${String(first?.pluggedIn)} ` +
        `(${String(samples.length)} total)`,
    )
  }

  // ── B2 plausible ───────────────────────────────────────────────────────────
  const pct = samples[0]?.battery
  if (pct === undefined) {
    record("B2 plausible", "INCONCLUSIVE", "no sample to judge")
  } else if (pct === UNAVAILABLE) {
    record(
      "B2 plausible",
      "INCONCLUSIVE",
      "reported -1. On a machine with no battery that is the CORRECT answer and the row draws `N/A`; " +
        "on a laptop it means the query failed. This host is a laptop, so treat it as a failure to read",
    )
  } else if (pct < 0 || pct > 100) {
    record("B2 plausible", "FAIL", `percentage ${String(pct)} is outside 0-100`)
  } else {
    // The negative control: the field-shift defect reads the STATUS code as the percentage. Status 2 is what
    // this host reports, so a percentage of exactly 2 is the specific wrong number to be suspicious of.
    const suspicious = pct === 2 || pct === 1
    record(
      "B2 plausible",
      suspicious ? "INCONCLUSIVE" : "PASS",
      suspicious
        ? `percentage ${String(pct)} equals a plausible BatteryStatus code — cannot distinguish a real ` +
            `${String(pct)}% battery from the field-shift defect. Re-run at a different charge level`
        : `percentage ${String(pct)}% is in range and is not a BatteryStatus code, so the fields did not shift`,
    )
  }

  // ── B3 cadence ─────────────────────────────────────────────────────────────
  if (samples.length < 2) {
    record(
      "B3 cadence",
      "INCONCLUSIVE",
      `only ${String(samples.length)} sample(s) — one reading proves the spawn works but not that the ` +
        `loop continues, which is the half that a missing Flush() breaks`,
    )
  } else {
    const gaps = samples.slice(1).map((s, i) => s.at - (samples[i]?.at ?? 0))
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const target = INTERVAL_SEC * 1_000
    // Generous: the gap is `Start-Sleep` plus a 23.7ms query plus scheduling. Buffering, the failure this
    // arm exists for, does not produce a near-miss — it produces one batched arrival or none.
    const ok = mean > target * 0.7 && mean < target * 1.6
    record(
      "B3 cadence",
      ok ? "PASS" : "FAIL",
      `mean gap ${mean.toFixed(0)}ms against a ${String(target)}ms target ` +
        `(gaps: ${gaps.map((g) => g.toFixed(0)).join(", ")}ms) — the loop keeps emitting, so stdout is flushed`,
    )
  }

  // ── B4 coupling ────────────────────────────────────────────────────────────
  const driven: { battery: number; pluggedIn: boolean }[] = []
  const probe = new Win32StatsSource({ batteryIntervalSec: 60, readAcLine: () => true })
  // `start` is not called: this arm drives the reading path directly, so no children are spawned and nothing
  // needs tearing down. `handleBatteryLine` is public for exactly this.
  ;(probe as unknown as { onSample: (s: Partial<StatsSample>) => void }).onSample = (s) => {
    driven.push({ battery: s.battery ?? Number.NaN, pluggedIn: s.pluggedIn ?? false })
  }
  probe.handleBatteryLine("batt 55 2")
  probe.handleBatteryLine("batt none")
  probe.handleBatteryLine("batt -1 2")

  const live = driven[0]
  const none = driven[1]
  const nullPct = driven[2]
  const coupled =
    live?.battery === 55 &&
    live.pluggedIn === true &&
    none?.battery === UNAVAILABLE &&
    none.pluggedIn === false &&
    nullPct?.battery === UNAVAILABLE &&
    nullPct.pluggedIn === false
  record(
    "B4 coupling",
    coupled ? "PASS" : "FAIL",
    coupled
      ? "with readAcLine forced TRUE: a live 55% reads pluggedIn=true, while `none` and a NULL percentage " +
          "both force pluggedIn=false — the C# NoSystemBattery coupling holds through the wired path, and " +
          "the injected reader is genuinely overridden rather than merely absent"
      : `expected [55/true, -1/false, -1/false], got ${JSON.stringify(driven)}`,
  )

  // ── B5 teardown ────────────────────────────────────────────────────────────
  source.stop()
  await sleep(500)
  const after = batteryChildCount()
  record(
    "B5 teardown",
    after <= before ? "PASS" : "FAIL",
    `battery-loop powershell processes: ${String(before)} before, ${String(after)} after stop() — ` +
      `${after <= before ? "nothing leaked" : "LEAKED, and each survivor polls WMI forever"}`,
  )

  // ── Summary ────────────────────────────────────────────────────────────────
  const pass = results.filter((r) => r.verdict === "PASS").length
  const fail = results.filter((r) => r.verdict === "FAIL").length
  const inco = results.filter((r) => r.verdict === "INCONCLUSIVE").length
  console.log(`\n${String(pass)} passed / ${String(fail)} failed / ${String(inco)} inconclusive (of ${String(results.length)} arms)`)
  console.log("\nThe Windows battery cell needs B1+B2+B3+B4 to pass. An INCONCLUSIVE arm does not close it.")
  console.log("B2 is inconclusive by construction at 1-2% charge and on any machine with no battery.")

  process.exit(fail > 0 ? 1 : 0)
}

void main()
