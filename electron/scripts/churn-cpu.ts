/**
 * One process, one saturated core, for a bounded time. The load half of `probe-fade.ts`.
 *
 * PERF-01's bar is "the fade stays smooth under a synthetic 25-50% CPU load", so the load has to be a
 * real one on a real scheduler. `probe-fade.ts` spawns several of these and measures what the machine
 * actually reached with `os.cpus()` rather than trusting the worker count -- 12 workers on 32 logical
 * cores is 37.5% NOMINAL, and turbo, SMT and whatever else the desk is doing all move the real figure.
 *
 * ## Three properties this file has on purpose
 *
 * **A hard self-terminating deadline, clamped to two minutes.** The driver kills these when a phase ends,
 * but a driver that crashes or is Ctrl-C'd must not leave twelve pegged cores behind on Alex's machine.
 * The deadline is the primary mechanism and the kill is the tidy one, not the other way round.
 *
 * **The result is printed.** An arithmetic loop whose output nobody reads is a loop a JIT is entitled to
 * delete, and a churn worker that has been optimised away still exits 0 -- which is exactly the shape of
 * failure `lib/electron-launch.ts` was written about: an instrument that fails silently will be believed.
 * Writing `x` at the end makes the work observable, so it cannot be elided.
 *
 * **The clock is read in batches, not per iteration.** `Date.now()` is a syscall on some platforms; a
 * deadline checked every iteration would spend a measurable fraction of the core on timekeeping rather
 * than on the load being generated.
 */

/** Two minutes. Not a tuning knob -- a ceiling on how wrong this can go if the driver dies. */
const MAX_SECONDS = 120

const requested = Number(process.argv[2] ?? 10)
const seconds = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_SECONDS) : 10
const deadline = Date.now() + seconds * 1000

let x = 0
while (Date.now() < deadline) {
  for (let i = 0; i < 2_000_000; i++) x = (x + Math.sqrt(i)) % 1e9
}

process.stdout.write(`CHURN-DONE ${x.toFixed(3)}\n`)
