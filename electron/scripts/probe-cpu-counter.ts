/**
 * ISC-29.6 — how often does the HOST's per-core tick counter go backwards, and what does that cost
 * `cpu-delta.ts`?
 *
 * This exists because a test told us something we did not know. `cpu-delta.test.ts` used to assert that two
 * real `os.cpus()` snapshots 60ms apart cannot yield `UNAVAILABLE`, on the reasoning that "60ms is several
 * ticks, so the counters must have moved". It failed one full-suite run in four. The ticks do move — the
 * *summed* delta was never zero in 400 trials, minimum 1262ms — and the real cause was the module's
 * **backwards** guard, firing for a reason its docblock had not listed: on Windows a per-core `idle` counter
 * regresses between two ordinary reads, by as much as -312ms, on an idle desktop with no sleep and no core
 * going offline. **The rate is run-to-run variable, so this file reports it and no document should quote a
 * fixed figure for it** — four runs here read 6.3%, 11.2%, 16.4% and 4.5%, the last of them AFTER the band
 * had been written down as "6-16%", which is the whole argument for reporting rather than asserting.
 *
 * ## Why this is a script and not three numbers in a document
 *
 * Two reasons, and the second is the one that earned the file.
 *
 * The first: the finding was made with a throwaway probe, and a throwaway means the next person re-derives
 * it. It is also the wrong instrument — it re-read `os.cpus()` itself, so it characterised Node's API rather
 * than the code we ship. This imports {@link readCpuSnapshot} and {@link cpuBusyPercent} from
 * `src/main/telemetry/cpu-delta.js`, so what it measures is the production function's own `UNAVAILABLE` rate.
 *
 * The second: **`cpu-delta.ts` never runs on Windows.** It is the macOS/Linux CPU source — Windows takes CPU
 * from `\Processor(_Total)\% Processor Time` off the `typeperf` child that is already running for memory. So
 * the host where the regression was found is the one host where it cannot reach a user, and the hosts where
 * it *would* reach a user are the two this port has least access to. **Both have since answered, and this
 * file is why it took one command each rather than a rewrite**: macOS arm64 at 0 of 600 under both runtimes,
 * and Ubuntu 24.04 x86_64 at 0 of 600 on 2026-08-30. The line above this one used to say Linux "has not been
 * measured at all"; it is retracted rather than deleted, because a permanent probe justified by a gap should
 * show what happened when the gap closed.
 *
 * A 4-16% per-sample `UNAVAILABLE` rate on a platform that uses this module is not cosmetic: `stats-rows.ts`
 * renders `UNAVAILABLE` as `N/A`, and the sampler runs about once a second, so the CPU row would blink to
 * `N/A` several times a minute — and because the regressions cluster (see A4), in visible bursts rather
 * than as isolated frames.
 *
 * ## What is blocking and what is a reading
 *
 * The kernel's counter is not ours to fix, so the regression rate is **reported, not asserted** — an arm that
 * failed because Windows regressed would be a permanently red gate about someone else's code. The blocking
 * arms are all about our own function and the strategy the test depends on:
 *
 *   A1  The counters advance at all. Rules out the tick-granularity explanation on this host, which is what
 *       the original throwaway probe was for, and is the thing that makes A3's rate meaningful rather than
 *       an artefact of a stopped clock.
 *   A2  **Reading, not a verdict.** The per-core regression rate, the worst single regression, and which
 *       bucket moved. Always PASS; the number is the point.
 *   A3  Every reading the production function does return is in `[0, 100]`. A regression must produce
 *       `UNAVAILABLE`, never a plausible-looking percentage — the failure this guards is a counter reset
 *       being laundered into "100% busy", which is worse than `N/A` because nothing downstream can tell.
 *   A4  The retry strategy `cpu-delta.test.ts` relies on converges, **with margin**. It reads the bound out
 *       of the test file and grades it against the worst run of consecutive `UNAVAILABLE`s observed here,
 *       demanding 2x of clear air rather than merely "larger". This arm is why the bound is 40: it also
 *       reports the run-length histogram, which is what showed the regressions CLUSTER, which is what
 *       falsified the independence assumption the original bound of 10 was derived from.
 *
 *     bun run probe:cpu-counter          # any platform; 600 pairs, ~40s
 *     bun run probe:cpu-counter 200      # fewer pairs when a quick reading will do
 */

import os from "node:os"
import { cpuBusyPercent, readCpuSnapshot, type CpuSnapshot, type CpuTimes } from "../src/main/telemetry/cpu-delta.js"
import { UNAVAILABLE } from "../src/shared.js"

/** Matches the sample gap `cpu-delta.test.ts` uses, so the rate this reports is the rate that bit the suite. */
const GAP_MS = 60

/**
 * The retry bound A4 grades, **read out of the test file rather than copied into this one.**
 *
 * A duplicated literal is the drift this probe exists to prevent: the bound was already raised once on
 * evidence from here, and a second copy would let the test and its own tripwire disagree silently. If the
 * declaration is ever renamed this throws at startup, which is the correct outcome — a probe that cannot
 * find the thing it grades must not report PASS.
 */
const TEST_FILE = new URL("../test/cpu-delta.test.ts", import.meta.url)
const testSource = await Bun.file(TEST_FILE).text()
const boundMatch = /const ATTEMPTS = (\d+)/.exec(testSource)
if (boundMatch?.[1] === undefined) {
  throw new Error(
    "could not find `const ATTEMPTS = <n>` in test/cpu-delta.test.ts -- A4 grades that bound and cannot " +
      "grade a bound it did not read. Rename fixed here, or the arm is meaningless.",
  )
}
const TEST_ATTEMPT_BOUND = Number(boundMatch[1])
/**
 * How much clear air A4 demands between the worst run measured and the test's bound.
 *
 * Not 1x. A bound merely larger than the worst run ever seen is what 10-vs-7 looked like, and that reads
 * PASS while being one busier host away from intermittent. The regressions cluster with a tail that decays
 * slower than geometric, so the only honest guard is a margin requirement on the empirical maximum.
 */
const REQUIRED_MARGIN = 2

const requested = Number(process.argv[2] ?? "600")
const TRIALS = Number.isInteger(requested) && requested > 0 ? requested : 600

const results: { name: string; verdict: "PASS" | "FAIL" | "READING"; detail: string }[] = []
function record(name: string, verdict: "PASS" | "FAIL" | "READING", detail: string): void {
  results.push({ name, verdict, detail })
  console.log(`  [${verdict}] ${name} -- ${detail}`)
}

const bucketsOf = (t: CpuTimes): readonly [number, number, number, number, number] => [t.user, t.nice, t.sys, t.idle, t.irq]
const totalOf = (t: CpuTimes): number => bucketsOf(t).reduce((a, b) => a + b, 0)

/** Burn one core for `GAP_MS`, the same way the test does, so the two measure the same thing. */
function burn(): void {
  const deadline = performance.now() + GAP_MS
  let sink = 0
  while (performance.now() < deadline) sink += Math.sqrt(sink + 1)
  if (sink < 0) throw new Error("unreachable, and here so the loop cannot be optimised away")
}

const BUCKET_NAMES = ["user", "nice", "sys", "idle", "irq"] as const

let summedDeltaZero = 0
let minSummedDelta = Number.POSITIVE_INFINITY
let coreCountChanged = 0
let regressedPairs = 0
let worstRegression = 0
let worstCore = -1
const regressedBuckets = new Set<string>()
let unavailable = 0
let outOfRange = 0
let longestUnavailableRun = 0
let currentRun = 0
/** Run length → how many runs of exactly that length. The thing that says whether samples are independent. */
const runLengths = new Map<number, number>()
const percentages: number[] = []

function closeRun(): void {
  if (currentRun > 0) runLengths.set(currentRun, (runLengths.get(currentRun) ?? 0) + 1)
  currentRun = 0
}

const runtime = typeof Bun === "undefined" ? `node ${process.version}` : `bun ${Bun.version}`
console.log(`probe:cpu-counter -- ${TRIALS} pairs ${String(GAP_MS)}ms apart on ${process.platform}/${process.arch}`)
console.log(`  runtime : ${runtime}`)
console.log(`  cores   : ${String(os.cpus().length)} logical`)
console.log(`  module  : src/main/telemetry/cpu-delta.ts (the production one)\n`)

for (let trial = 0; trial < TRIALS; trial++) {
  const before: CpuSnapshot = readCpuSnapshot()
  burn()
  const after: CpuSnapshot = readCpuSnapshot()

  if (before.length !== after.length) {
    coreCountChanged += 1
  } else {
    let summed = 0
    let regressed = false
    for (const [index, b] of before.entries()) {
      const a = after[index]
      if (a === undefined) continue
      const delta = totalOf(a) - totalOf(b)
      summed += delta
      for (const [k, name] of BUCKET_NAMES.entries()) {
        const moved = (bucketsOf(a)[k] ?? 0) - (bucketsOf(b)[k] ?? 0)
        if (moved < 0) {
          regressed = true
          regressedBuckets.add(name)
          if (moved < worstRegression) {
            worstRegression = moved
            worstCore = index
          }
        }
      }
    }
    if (regressed) regressedPairs += 1
    if (summed === 0) summedDeltaZero += 1
    if (summed < minSummedDelta) minSummedDelta = summed
  }

  const busy = cpuBusyPercent(before, after)
  if (busy === UNAVAILABLE) {
    unavailable += 1
    currentRun += 1
    if (currentRun > longestUnavailableRun) longestUnavailableRun = currentRun
  } else {
    closeRun()
    percentages.push(busy)
    if (busy < 0 || busy > 100) outOfRange += 1
  }
}
closeRun()

const pct = (n: number): string => `${((n / TRIALS) * 100).toFixed(1)}%`

// ── A1 — the counters advance, so a rate below means regression and not a stopped clock ──────────────
record(
  "A1 the summed tick delta is always positive",
  summedDeltaZero === 0 && coreCountChanged === 0 && minSummedDelta > 0 ? "PASS" : "FAIL",
  `zero-delta pairs=${String(summedDeltaZero)}, core-count changes=${String(coreCountChanged)}, ` +
    `min summed delta=${Number.isFinite(minSummedDelta) ? String(minSummedDelta) : "n/a"}ms over ${String(TRIALS)} pairs ` +
    `-- rules out tick granularity as the explanation for any UNAVAILABLE below`,
)

// ── A2 — the host characterisation. A reading, because this is the kernel's counter and not ours ─────
record(
  "A2 per-core regression rate (READING -- the kernel's behaviour, not a verdict)",
  "READING",
  regressedPairs === 0
    ? `no core's counters went backwards in ${String(TRIALS)} pairs -- this host does not exhibit it`
    : `${String(regressedPairs)}/${String(TRIALS)} pairs (${pct(regressedPairs)}) had a core go backwards; ` +
      `worst ${String(worstRegression)}ms on core ${String(worstCore)}; buckets=[${[...regressedBuckets].sort().join(", ")}]`,
)

// ── A3 — a regression must become UNAVAILABLE, never a plausible number ──────────────────────────────
record(
  "A3 every returned reading is a real percentage in [0,100]",
  outOfRange === 0 && percentages.length > 0 ? "PASS" : "FAIL",
  `${String(percentages.length)}/${String(TRIALS)} pairs returned a percentage, ${String(outOfRange)} out of range; ` +
    `UNAVAILABLE ${String(unavailable)}/${String(TRIALS)} (${pct(unavailable)})` +
    (regressedPairs === unavailable ? " -- exactly the regressed pairs, so the guard is the only cause" : ""),
)

// ── A4 — the test's retry bound still holds on this host, and the runs are NOT independent ───────────
//
// The detail here reports the run-length histogram rather than a p^10 exhaustion probability, and the
// reason is that this arm measured the assumption behind that probability and found it false. Treating
// each sample as an independent coin flip at the observed rate, a run of 4 should turn up about once
// every few thousand pairs; it turned up inside 600. So the regressions CLUSTER -- which stands to
// reason, since whatever power-state or accounting transition makes a core's idle tick regress does not
// resolve inside 60ms -- and any analytic bound built on independence understates the tail. The margin
// between the observed longest run and the test's bound is the honest evidence, so that is what prints.
const observedRunSummary = [...runLengths.entries()]
  .sort(([a], [b]) => a - b)
  .map(([len, count]) => `${String(len)}x${String(count)}`)
  .join(" ")
const p = unavailable / TRIALS
/** Runs of exactly this length expected in TRIALS pairs IF samples were independent. They are not; that is the point. */
const expectedIfIndependent = TRIALS * Math.pow(p, longestUnavailableRun) * Math.pow(1 - p, 2)
const margin = TEST_ATTEMPT_BOUND / Math.max(1, longestUnavailableRun)
record(
  `A4 cpu-delta.test.ts's bound of ${String(TEST_ATTEMPT_BOUND)} (read from the file) clears the worst ` +
    `measured run by ${String(REQUIRED_MARGIN)}x`,
  margin >= REQUIRED_MARGIN ? "PASS" : "FAIL",
  `longest consecutive run=${String(longestUnavailableRun)} vs bound ${String(TEST_ATTEMPT_BOUND)} ` +
    `(margin ${margin.toFixed(1)}x, need ${String(REQUIRED_MARGIN)}x); ` +
    `run lengths seen: ${observedRunSummary === "" ? "none" : observedRunSummary}` +
    (longestUnavailableRun >= 2
      ? `; that longest run would be expected ${expectedIfIndependent.toExponential(1)} times in ` +
        `${String(TRIALS)} pairs if samples were independent, so THEY ARE NOT -- regressions cluster, and ` +
        `no independence-based exhaustion probability should be quoted for this bound`
      : ""),
)

const passed = results.filter((r) => r.verdict === "PASS").length
const failed = results.filter((r) => r.verdict === "FAIL").length
const readings = results.filter((r) => r.verdict === "READING").length
console.log(`\n${String(passed)} passed / ${String(failed)} failed / ${String(readings)} reading`)
console.log(
  "\nWhat this buys: the production cpuBusyPercent's UNAVAILABLE rate ON THIS HOST, with the cause\n" +
    "separated -- A1 rules out tick granularity, so whatever A2 reports is the backwards guard firing.\n" +
    "\n" +
    "Measured so far: Windows x64 regresses in the idle bucket only, worst -312ms, AT A RATE THAT VARIES\n" +
    "RUN TO RUN -- 6.3%, 11.2%, 16.4% and 4.5% across four runs. Real node v24.20.0 shows it too, and THAT\n" +
    "is the discriminator (kernel, not runtime); the gap between any two individual figures is not evidence\n" +
    "of anything. macOS arm64, 0 of 600 under both runtimes. Ubuntu 24.04 x86_64, 0 of 600 (2026-08-30).\n" +
    "So BOTH platforms that actually use this module read clean, and the defect is confined to the one\n" +
    "host where the module never runs. This file stays permanent anyway: the fourth run came in at 4.5%,\n" +
    "UNDER a floor three runs had already established, so the band itself is not a property any document\n" +
    "can hold on another host's behalf -- or on this one's.\n" +
    "\n" +
    "What it does NOT buy: that a user sees N/A. This samples as fast as it can; the app samples about\n" +
    "once a second, and whether a 1s gap regresses at the same rate as a 60ms one is not measured here.",
)
process.exit(failed > 0 ? 1 : 0)
