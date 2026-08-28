/**
 * Probe: do the `typeperf` children stream parseable counters, and does recycling
 * the GPU child recover the instance set?
 *
 * Run: `bun scripts/probe-typeperf.ts` from `electron/`. No Electron needed — the
 * telemetry source imports nothing from it, which is the point of the seam.
 *
 * This probe answers ISC-4 and ISC-5 and nothing else. It does NOT measure the cost
 * of the port (that is ISC-6, a separate probe against the WPF baseline) — a
 * streaming child working says nothing about what it costs.
 *
 * ## Arms, and what makes each one discriminating
 *
 * A1 layout   — cpu/mem/pag each bind to a *real* distinct column and ≥1 GPU column
 *               exists. The first version of this arm passed a run where CPU was
 *               missing, because it tested `new Set([-1, 0, 1]).size === 3` and
 *               `-1` is the no-column sentinel. Now the sentinel is rejected
 *               explicitly, and a reordered synthetic header is the counter-case: a
 *               classifier returning fixed indices passes the presence test and
 *               fails the reorder.
 * A2 cadence  — mean interval between samples in a QUIET window, from `typeperf`'s
 *               OWN timestamps. Arrival times are unusable: the GPU header alone
 *               arrives in ~360 chunks starting at 2 bytes, so a perfectly-cadenced
 *               1s stream reads as [1395, 665, 1027, 2619, 0, 449, 1026]ms of
 *               arrival jitter. That was this probe's first false negative.
 * A2b degrade — cadence under deliberate 32-core saturation, and recovery after.
 *               The second false negative: a 4682ms gap measured *while this probe
 *               pinned every core* was scored against a 1000±100ms bound. Starving
 *               the sampler and then failing it for being late tests nothing. What
 *               is worth asserting is that it recovers.
 * A3 CPU      — PDH's `\Processor(_Total)\% Processor Time` against a CPU figure
 *               derived independently from `os.cpus()` jiffy deltas over the same
 *               window. Two mechanisms, one quantity: a wrong column, a stale
 *               column, or a constant all disagree with the cross-read, and none is
 *               caught by "the number is nonzero".
 *
 *               Deliberately measured under AMBIENT load, not saturation. The third
 *               false negative: comparing a 3-sample PDH mean against jiffies over a
 *               hand-bracketed 4.5s window that included the 32-process ramp-up gave
 *               63.95% vs 86.34% and failed on window alignment, not on disagreement.
 *               Saturation is also the weaker test — 100% vs 100% has the same
 *               no-power problem as agreeing at zero, whereas ambient load here swings
 *               14-55% and a stuck reading cannot track it. Both endpoints are now
 *               latched immediately after a sample arrives, so the two windows share
 *               boundaries instead of approximately overlapping.
 * A4 GPU      — the summed 3D value against `nvidia-smi`. INCONCLUSIVE at idle by
 *               design: agreement at 0% vs 0% has no power, and a source stuck at
 *               zero passes it.
 * A5 binding  — of the 3D instances created *while the GPU child was already
 *               running*, how many it is blind to. The churn is caused, not awaited:
 *               A5's first run was INCONCLUSIVE because it waited 12s for churn that
 *               never came.
 *
 *               The arm takes THREE sets, not two, and that is the correction that
 *               matters. Comparing the child's bound set against what is live now is
 *               not a measurement of churn: the GPU child bound 319 of 354 already-
 *               existing instances in one run, so bound-vs-live is non-zero before
 *               anything is launched. An earlier A5 "pass" was that artefact,
 *               credited to a notepad launch which had not yet happened. So
 *               `liveBefore` is captured too, the churn is scored as a positive
 *               control (`liveAfter - liveBefore`), and the defect is read only from
 *               instances that control proves are new.
 *
 *               Churn source: an Electron window with an animating canvas. Three
 *               cheaper sources were tried and rejected — see `churn-gpu.cjs` — and
 *               the launch goes through `spawnElectron` because
 *               `ELECTRON_RUN_AS_NODE=1` in a VSCode-descended shell silently turns
 *               it into a Node process that renders nothing.
 * A6 recycle  — after a forced recycle the new GPU child covers those previously
 *               blind instances, and the scalar stream never gaps across the swap.
 * A7 header   — the silent-drop guard. `typeperf` omits a requested counter with
 *               empty stderr and exit code 0 — ~21% of all-four spawns (3/14). It is
 *               NOT confined to big batches: a run of this probe caught the
 *               three-counter scalar child dropping `cpu`, which refutes the
 *               wildcard-perturbs-the-batch hypothesis that scalars-only 0/8
 *               supported. Reports retries actually taken; cannot be forced on
 *               demand, so it observes rather than gates. When it reports a retry,
 *               that run is evidence the guard works end to end — A1's live sample
 *               came from the re-spawned child.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { cpus } from "node:os"
import { join } from "node:path"
import { IS_WIN } from "../src/platform.js"
import { spawnElectron } from "./lib/electron-launch.js"
import { NO_COLUMN } from "../src/main/telemetry/parse/typeperf.js"
import { UNAVAILABLE } from "../src/shared.js"
import {
  classifyColumns,
  parse3dEngineInstances,
  parseHeaderPaths,
  stampDeltaMs,
  type ReducedSample,
} from "../src/main/telemetry/parse/typeperf.js"
import { Win32StatsSource } from "../src/main/telemetry/win32.js"

const QUIET_SAMPLES = 8
const CROSS_SAMPLES = 10
const LOAD_MS = 4_000
/**
 * How long the churn window lives. Must outlast A5's settle plus A6's recycle wait: if
 * it exits first, its instance vanishes and A6 fails for the wrong reason — the recycle
 * would be asked to pick up something no longer there.
 */
const CHURN_SEC = 60

type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE"
const results: { arm: string; verdict: Verdict; evidence: string }[] = []

function record(arm: string, verdict: Verdict, evidence: string): void {
  results.push({ arm, verdict, evidence })
  const mark = verdict === "PASS" ? "PASS" : verdict === "FAIL" ? "FAIL" : "INCO"
  console.log(`  [${mark}] ${arm} — ${evidence}`)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Resolvers waiting on the next emitted sample.
 *
 * A3 needs its two `os.cpus()` readings latched immediately after a sample lands, so
 * the jiffy window and the PDH window share endpoints. Polling `reduced.length` in a
 * 200ms sleep loop would put up to 200ms of unaccounted drift at each end — small,
 * but it is the whole reason A3's first two attempts disagreed.
 */
const sampleWaiters: (() => void)[] = []
function waitForSample(): Promise<void> {
  return new Promise((resolve) => sampleWaiters.push(resolve))
}

/** Mean and worst gap between consecutive typeperf stamps in a slice. */
function cadence(slice: ReducedSample[]): { gaps: number[]; mean: number; worst: number } {
  const stamps = slice.map((r) => r.stampMs).filter((v): v is number => v !== null)
  const gaps = stamps.slice(1).map((s, i) => stampDeltaMs(stamps[i] ?? s, s))
  const mean = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : NaN
  const worst = gaps.length > 0 ? Math.max(...gaps) : NaN
  return { gaps, mean, worst }
}

/** 3D-engine instances PDH would resolve right now. */
function enumerateInstancesNow(): string[] {
  const out = spawnSync("typeperf", ["-qx", "\\GPU Engine"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (out.error || typeof out.stdout !== "string") return []
  return parse3dEngineInstances(out.stdout)
}

function nvidiaSmiGpuPercent(): number | null {
  const out = spawnSync(
    "nvidia-smi",
    ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
    { encoding: "utf8", windowsHide: true },
  )
  if (out.error || out.status !== 0 || typeof out.stdout !== "string") return null
  const value = Number.parseFloat(out.stdout.trim().split(/\r?\n/)[0] ?? "")
  return Number.isFinite(value) ? value : null
}

/**
 * Busy/total jiffies across all cores — the independent CPU mechanism for A3.
 *
 * `os.cpus()[].times` is read by libuv straight from the kernel, with no PDH, no
 * child process and no counter path involved.
 */
function cpuJiffies(): { busy: number; total: number } {
  let busy = 0
  let total = 0
  for (const core of cpus()) {
    const t = core.times
    busy += t.user + t.nice + t.sys + t.irq
    total += t.user + t.nice + t.sys + t.irq + t.idle
  }
  return { busy, total }
}

/** Saturate every core for `ms` so A3's signal clears the ambient swing. */
function startLoad(ms: number): ChildProcess[] {
  const code = `const end=Date.now()+${ms};let s=0;while(Date.now()<end)s+=Math.sqrt(s+1);`
  return Array.from({ length: cpus().length }, () =>
    spawn(process.execPath, ["-e", code], { stdio: "ignore", windowsHide: true }),
  )
}

async function main(): Promise<void> {
  console.log("probe-typeperf — ISC-4 (streaming children) and ISC-5 (GPU instance recycle)")
  console.log(`host: ${process.platform}, ${cpus().length} logical cores\n`)

  if (!IS_WIN) {
    console.log("Not Windows. This probe measures the Windows source and cannot run here.")
    console.log("Verdict: INCONCLUSIVE (wrong host) — not a pass.")
    process.exit(2)
  }

  const reduced: ReducedSample[] = []
  const source = new Win32StatsSource({
    intervalSec: 1,
    recycleMs: 0, // manual only — a timer firing mid-probe would confound A5/A6
    log: (level, message) => console.log(`       [${level}] ${message}`),
    onReduced: (r) => {
      reduced.push(r)
      while (sampleWaiters.length > 0) sampleWaiters.pop()?.()
    },
  })
  source.start(() => {})

  // ── A1: column classification, with its own counter-case ───────────────────
  console.log("A1 layout")
  for (let i = 0; i < 120 && reduced.length === 0; i++) await sleep(250)

  const bound = source.boundInstances()
  const first = reduced[0]

  // Counter-case: reorder a synthetic header. Indices must follow the paths.
  const headerA =
    '"(PDH-CSV 4.0)","\\\\HOST\\Processor(_Total)\\% Processor Time",' +
    '"\\\\HOST\\Memory\\% Committed Bytes In Use","\\\\HOST\\Paging File(_Total)\\% Usage",' +
    '"\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage"'
  const headerB =
    '"(PDH-CSV 4.0)","\\\\HOST\\GPU Engine(pid_1_engtype_3D)\\Utilization Percentage",' +
    '"\\\\HOST\\Paging File(_Total)\\% Usage","\\\\HOST\\Memory\\% Committed Bytes In Use",' +
    '"\\\\HOST\\Processor(_Total)\\% Processor Time"'
  const layoutA = classifyColumns(parseHeaderPaths(headerA))
  const layoutB = classifyColumns(parseHeaderPaths(headerB))
  const counterCaseOk =
    layoutA.cpu === 0 && layoutB.cpu === 3 && layoutA.gpu[0] === 3 && layoutB.gpu[0] === 0
  // Reject the no-column sentinel explicitly. `new Set([-1, 0, 1]).size === 3` is
  // what let a run with no CPU counter pass this arm the first time.
  const realColumns = [layoutA.cpu, layoutA.mem, layoutA.pag]
  const allPresent = realColumns.every((c) => c !== NO_COLUMN)
  const allDistinct = new Set(realColumns).size === realColumns.length
  const liveMetricsPresent =
    first !== undefined && first.cpu !== UNAVAILABLE && first.mem !== UNAVAILABLE

  record(
    "A1 layout",
    liveMetricsPresent && bound.length > 0 && counterCaseOk && allPresent && allDistinct
      ? "PASS"
      : "FAIL",
    `first live sample cpu=${first?.cpu.toFixed(2)} mem=${first?.mem.toFixed(2)} ` +
      `pag=${first?.pag.toFixed(2)}, bound 3D instances=${bound.length}; counter-case reorder ` +
      `moved cpu ${layoutA.cpu}→${layoutB.cpu} and gpu ${String(layoutA.gpu[0])}→` +
      `${String(layoutB.gpu[0])} (ok=${counterCaseOk}); columns present=${allPresent} ` +
      `distinct=${allDistinct}`,
  )

  // ── A2: cadence in a QUIET window ──────────────────────────────────────────
  console.log("\nA2 cadence (quiet window)")
  while (reduced.length < QUIET_SAMPLES) await sleep(200)
  const quiet = cadence(reduced.slice(0, QUIET_SAMPLES))
  record(
    "A2 cadence",
    quiet.gaps.length >= QUIET_SAMPLES - 1 && quiet.mean >= 900 && quiet.mean <= 1_100
      ? "PASS"
      : "FAIL",
    `${QUIET_SAMPLES} samples, mean gap ${quiet.mean.toFixed(0)}ms (target 1000±100), ` +
      `worst ${quiet.worst}ms, gaps=[${quiet.gaps.join(", ")}]ms`,
  )

  // ── A3: CPU cross-read under ambient load, endpoints latched to samples ────
  console.log("\nA3 CPU cross-read (ambient load, latched endpoints)")
  await waitForSample()
  const jiffiesBefore = cpuJiffies()
  const crossFrom = reduced.length
  for (let i = 0; i < CROSS_SAMPLES; i++) await waitForSample()
  const jiffiesAfter = cpuJiffies()
  const crossTo = reduced.length

  const busyDelta = jiffiesAfter.busy - jiffiesBefore.busy
  const totalDelta = jiffiesAfter.total - jiffiesBefore.total
  const crossReadCpu = totalDelta > 0 ? (busyDelta / totalDelta) * 100 : NaN

  const pdhWindow = reduced
    .slice(crossFrom, crossTo)
    .map((r) => r.cpu)
    .filter((v) => v !== UNAVAILABLE)
  const pdhMean =
    pdhWindow.length > 0 ? pdhWindow.reduce((a, b) => a + b, 0) / pdhWindow.length : NaN
  const cpuDelta = Math.abs(pdhMean - crossReadCpu)
  const pdhSpread = pdhWindow.length > 0 ? Math.max(...pdhWindow) - Math.min(...pdhWindow) : NaN

  record(
    "A3 CPU cross-read",
    pdhWindow.length >= CROSS_SAMPLES - 1 &&
      Number.isFinite(crossReadCpu) &&
      cpuDelta <= 8 &&
      pdhSpread > 2
      ? "PASS"
      : "FAIL",
    `over one shared window of ${pdhWindow.length} samples: PDH mean ${pdhMean.toFixed(2)}% vs ` +
      `os.cpus() jiffies ${crossReadCpu.toFixed(2)}% — |delta| ${cpuDelta.toFixed(2)}, ` +
      `tolerance 8; PDH spread ${pdhSpread.toFixed(1)} points across ` +
      `[${pdhWindow.map((v) => v.toFixed(1)).join(", ")}] (a spread >2 rules out a constant, ` +
      `which agreeing on a mean alone would not)`,
  )

  // ── A2b: cadence under deliberate saturation, and recovery after ───────────
  console.log("\nA2b cadence under saturation")
  const loadFrom = reduced.length
  const load = startLoad(LOAD_MS)
  await sleep(LOAD_MS + 500)
  const under = cadence(reduced.slice(loadFrom))

  // Wait for the burners to actually be gone before timing recovery. `kill()` only
  // sends the signal, so the previous version opened the recovery window while 32
  // processes were still tearing down and then scored the teardown transient as
  // recovery — measured mean 1280ms / worst 2082ms, failing a bound the same code
  // clears at 1009ms once the machine is quiet. The thing being recovered from has to
  // be over before recovery can be the thing measured.
  await Promise.all(
    load.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve()
          child.once("exit", () => resolve())
          child.kill()
        }),
    ),
  )
  // Then discard one whole sample: the sample straddling the release is part load and
  // part idle, and its stamp gap belongs to neither regime.
  await waitForSample()

  const recoverFrom = reduced.length
  for (let i = 0; i < 5; i++) await waitForSample()
  const after = cadence(reduced.slice(recoverFrom))
  record(
    "A2b cadence recovery",
    Number.isFinite(after.mean) && after.mean >= 900 && after.mean <= 1_200 ? "PASS" : "FAIL",
    `under ${cpus().length}-core saturation mean ${under.mean.toFixed(0)}ms / worst ` +
      `${under.worst}ms (degradation is expected and deliberately not scored — starving the ` +
      `sampler then failing it for being late tests nothing); after load released mean ` +
      `${after.mean.toFixed(0)}ms / worst ${after.worst}ms — recovery is what is asserted`,
  )

  const last = reduced[reduced.length - 1]
  console.log(
    `\n       last sample: cpu=${last?.cpu.toFixed(2)} mem=${last?.mem.toFixed(2)} ` +
      `pag=${last?.pag.toFixed(2)} gpu=${last?.gpu.toFixed(2)} ` +
      `gpuColumnsLive=${String(last?.gpuColumnsLive)}`,
  )

  // ── A4: GPU cross-read ─────────────────────────────────────────────────────
  console.log("\nA4 GPU cross-read")
  const smi = nvidiaSmiGpuPercent()
  const ourGpu = last?.gpu ?? UNAVAILABLE
  if (smi === null) {
    record("A4 GPU cross-read", "INCONCLUSIVE", "nvidia-smi unavailable — no independent reading")
  } else if (smi <= 1 && ourGpu <= 1) {
    record(
      "A4 GPU cross-read",
      "INCONCLUSIVE",
      `both idle (ours ${ourGpu.toFixed(2)}% vs nvidia-smi ${smi}%) — agreement at zero is ` +
        `not evidence; a source stuck at zero passes this too`,
    )
  } else {
    record(
      "A4 GPU cross-read",
      Math.abs(ourGpu - smi) <= 25 ? "PASS" : "FAIL",
      `ours ${ourGpu.toFixed(2)}% vs nvidia-smi ${smi}% (|delta| ` +
        `${Math.abs(ourGpu - smi).toFixed(2)}, tolerance 25 — summed-and-clamped engine ` +
        `utilisation is not the statistic nvidia-smi reports)`,
    )
  }

  // ── A5: spawn-time binding, with churn this probe causes ───────────────────
  console.log("\nA5 spawn-time binding")
  const boundBefore = new Set(source.boundInstances())
  // The live set BEFORE the churn, which the first version of this arm did not take.
  // Without it the only available comparison is bound-vs-live, and that difference is
  // already non-zero at spawn — the GPU child bound 319 of 354 existing instances in
  // one run — so any churn source at all "passes". An earlier A5 pass was exactly that
  // artefact, credited to a notepad launch that had not even happened yet.
  const liveBefore = new Set(enumerateInstancesNow())

  const churn = spawnElectron(join(import.meta.dirname, "churn-gpu.cjs"), [String(CHURN_SEC)])
  const churnErrors: string[] = []
  churn.stdout.on("data", () => {})
  churn.stderr.setEncoding("utf8")
  churn.stderr.on("data", (chunk: string) => churnErrors.push(chunk))
  console.log(`       launched an Electron window pid=${String(churn.pid)} to force GPU churn`)
  await sleep(10_000)

  const liveAfter = enumerateInstancesNow()
  // Positive control: did the churn source actually create instances? If not, nothing
  // downstream means anything, and the arm says so instead of reading the pre-existing
  // bound-vs-live gap as a result.
  const churned = liveAfter.filter((name) => !liveBefore.has(name))
  // The defect proper: of the instances that came into existence while the GPU child
  // was already running, how many is it blind to?
  const blind = churned.filter((name) => !boundBefore.has(name))
  const vanished = [...liveBefore].filter((name) => !liveAfter.includes(name))
  // Kept for A6, which needs the set the recycle is expected to pick up.
  const appeared = blind

  if (churned.length === 0) {
    record(
      "A5 spawn-time binding",
      "INCONCLUSIVE",
      `the churn source created no 3D instance (live ${liveBefore.size}→${liveAfter.length}, ` +
        `vanished ${vanished.length}), so the defect had no chance to show` +
        (churnErrors.length > 0 ? ` — churn stderr: ${churnErrors.join("").trim().slice(0, 200)}` : ""),
    )
  } else {
    record(
      "A5 spawn-time binding",
      blind.length === churned.length ? "PASS" : "FAIL",
      `the churn created ${churned.length} new 3D instance(s) and the running GPU child is ` +
        `blind to ${blind.length} of them (bound ${boundBefore.size} at spawn, live ` +
        `${liveBefore.size}→${liveAfter.length}, vanished ${vanished.length}); e.g. ${churned[0]}`,
    )
  }

  // ── A6: recycle recovers, without gapping the scalar stream ────────────────
  console.log("\nA6 recycle")
  const beforeRecycle = reduced.length
  source.recycle()

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await sleep(200)
    if (reduced.length >= beforeRecycle + 4) {
      const nowBound = source.boundInstances()
      if (appeared.length === 0 || appeared.some((n) => nowBound.includes(n))) break
    }
  }

  const afterBound = new Set(source.boundInstances())
  const recovered = appeared.filter((name) => afterBound.has(name))
  const across = cadence(reduced.slice(Math.max(0, beforeRecycle - 1)))
  const samplesAcross = reduced.length - beforeRecycle

  if (appeared.length === 0) {
    record(
      "A6 recycle",
      "INCONCLUSIVE",
      `swap looked clean (${samplesAcross} samples after recycle, worst stamp gap ` +
        `${across.worst}ms) but with nothing appeared in A5 there is no recovery to demonstrate`,
    )
  } else {
    record(
      "A6 recycle",
      recovered.length > 0 && across.worst <= 2_500 ? "PASS" : "FAIL",
      `recovered ${recovered.length}/${appeared.length} previously-blind instances; bound ` +
        `${boundBefore.size}→${afterBound.size}; ${samplesAcross} scalar samples across the swap, ` +
        `worst stamp gap ${across.worst}ms (a sequential kill-then-spawn would show ~3000ms)`,
    )
  }

  // ── A7: the silent-drop guard, observed ────────────────────────────────────
  console.log("\nA7 header validation")
  record(
    "A7 header validation",
    "INCONCLUSIVE",
    `${source.headerRetries} header retry/retries across ${source.spawnCount} spawns this run. ` +
      `The drop is ~21% per all-four spawn (3/14), cannot be forced on demand, and is not ` +
      `confined to large batches — a run caught the 3-counter scalar child dropping cpu, which ` +
      `refutes the wildcard-perturbs-the-batch hypothesis. So the retry guard is the fix and ` +
      `the split is not; this observes the guard rather than gating on it`,
  )

  source.stop()

  // Clean up only the process this probe started. A probe that leaves windows on the
  // desktop is a probe that gets run once.
  if (churn.pid !== undefined) {
    // /T as well as /F: Electron is a process tree — the GPU process that owns the 3D
    // engine instance is a *child*, so killing the main process alone can orphan it.
    spawnSync("taskkill", ["/PID", String(churn.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    })
    console.log(`       churn process tree pid=${churn.pid} closed`)
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const pass = results.filter((r) => r.verdict === "PASS").length
  const fail = results.filter((r) => r.verdict === "FAIL").length
  const inco = results.filter((r) => r.verdict === "INCONCLUSIVE").length
  console.log(`\n${pass} passed / ${fail} failed / ${inco} inconclusive (of ${results.length} arms)`)
  console.log("\nISC-4 needs A1+A2+A2b+A3 to pass. ISC-5 needs A5+A6 to pass.")
  console.log("An INCONCLUSIVE arm does not close its claim.")

  process.exit(fail > 0 ? 1 : 0)
}

void main()
