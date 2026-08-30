/**
 * Pure parsers for the Linux telemetry sources.
 *
 * Same contract as `typeperf.ts` and `darwin.ts` beside it — no spawning, no file reads, so the Linux path
 * is exercised from Windows. **The difference is the evidence class, and it is worth stating plainly: there
 * are no captured Linux fixtures.** The macOS parsers were written against four files taken off a real M1;
 * these were written from the documented `/proc` and `/sys` formats, and the sample text in
 * `test/linux-parse.test.ts` is hand-written rather than captured. That is a weaker footing, the test file
 * says so at the top, and the first Linux host available should capture the real thing.
 *
 * ## CPU is NOT parsed here, and that is a deviation from the plan
 *
 * The plan lists `/proc/stat` for Linux CPU. `os.cpus()` **is** `/proc/stat` — libuv reads exactly that file
 * — so `cpu-delta.ts` already covers it, tested, shared with macOS, with no parser and no spawn. Writing a
 * second reader for the same bytes would add a code path whose only distinguishing feature is being
 * untested on the platform it targets.
 *
 * One consequence, recorded rather than fixed: libuv folds `irq + softirq` into one bucket and **drops
 * `steal` and `guest` entirely**. On a VM with a noisy neighbour, stolen time is therefore in neither the
 * busy nor the idle term — it vanishes from the denominator, so the reported percentage is occupancy *of the
 * time the VM actually got*. That is arguably the more useful number and it is definitely not the same one
 * `top` shows. If a Linux user ever asks why the widget and `top` disagree under contention, this is why.
 *
 * ## Why `MemAvailable` and not `MemFree`
 *
 * Same trap as `os.freemem()` on macOS, one level up. `MemFree` excludes the page cache, so a healthy Linux
 * box reads 95%+ used at all times — the kernel is *supposed* to fill memory with cache. `MemAvailable` is
 * the kernel's own estimate of what a new allocation could get without swapping, which is the quantity a
 * user means by "free". It has been in `/proc/meminfo` since Linux 3.14 (2014); the fallback below exists
 * because a container's masked `/proc` can still omit it.
 */

import { UNAVAILABLE } from "../../../shared.js"

/**
 * One `Key:   12345 kB` line from `/proc/meminfo`, in bytes, or `undefined` if absent.
 *
 * **The `kB` suffix is mandatory**, and that is a deliberate tightening rather than strictness for its own
 * sake. All five keys this module reads carry it on every kernel; the unit-less lines in the same file
 * (`HugePages_Total: 0`) are ones nothing here asks for. Accepting a missing unit would mean guessing a
 * scale, and guessing wrong is a **1024x** error — a 16 GiB machine read as 15.9 MB, which the clamp then
 * renders as a memory row pinned at 100% rather than as a failure. Requiring the unit turns that same input
 * into `null`, and `null` is a `N/A`, which is true.
 *
 * The unit is kibibytes despite the lowercase `k`: 1024, not 1000.
 */
function meminfoBytes(output: string, key: string): number | undefined {
  const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB\\s*$`, "mi").exec(output)
  if (match?.[1] === undefined) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return value * 1024
}

/** The four `/proc/meminfo` figures this port uses, in bytes. */
export interface MemInfo {
  readonly totalBytes: number
  readonly availableBytes: number
  readonly swapTotalBytes: number
  readonly swapFreeBytes: number
}

/**
 * Parse `/proc/meminfo`, or `null` if `MemTotal` is missing (which means this is not `/proc/meminfo`).
 *
 * Swap is optional and absent swap fields become 0 — a kernel built without swap support omits the lines
 * entirely, and that is "no paging file", which {@link swapPercent} renders as `N/A`. `MemAvailable` falling
 * back to `MemFree` is the one lossy default here, and it is loud about it: on a kernel old enough or a
 * `/proc` masked enough to lack it, the memory row will read high, which is a visible symptom rather than a
 * silent one.
 */
export function parseMemInfo(output: string): MemInfo | null {
  const totalBytes = meminfoBytes(output, "MemTotal")
  if (totalBytes === undefined) return null
  const availableBytes = meminfoBytes(output, "MemAvailable") ?? meminfoBytes(output, "MemFree")
  if (availableBytes === undefined) return null
  return {
    totalBytes,
    availableBytes,
    swapTotalBytes: meminfoBytes(output, "SwapTotal") ?? 0,
    swapFreeBytes: meminfoBytes(output, "SwapFree") ?? 0,
  }
}

/** Memory occupancy: `(total - available) / total`. */
export function memoryPercent(info: MemInfo | null): number {
  if (info === null || info.totalBytes <= 0) return UNAVAILABLE
  const used = info.totalBytes - info.availableBytes
  return Math.min(100, Math.max(0, (used / info.totalBytes) * 100))
}

/**
 * Swap usage, or `UNAVAILABLE` when there is no swap.
 *
 * `N/A` and not 0%, for the same reason as macOS: a container or a zram-only host has no paging file at all,
 * and 0% would claim there is one and it is empty. This is the common case on Linux rather than an edge —
 * plenty of cloud images ship swapless.
 */
export function swapPercent(info: MemInfo | null): number {
  if (info === null || info.swapTotalBytes <= 0) return UNAVAILABLE
  const used = info.swapTotalBytes - info.swapFreeBytes
  return Math.min(100, Math.max(0, (used / info.swapTotalBytes) * 100))
}

/**
 * `/sys/class/drm/cardN/device/gpu_busy_percent` — the amdgpu utilisation file, globbed over `card0`, `card1`
 * and so on. (Written `cardN` rather than with the glob because `card*` followed by a slash closes this
 * comment, which is a lesson this file learned the hard way.)
 *
 * A bare integer and a trailing newline. Present on amdgpu and on some i915 kernels, absent on NVIDIA's
 * proprietary driver, which is what {@link parseNvidiaSmiPercent} is for.
 */
export function parseGpuBusyPercent(contents: string): number {
  const match = /^\s*(\d+)\s*$/.exec(contents)
  if (match?.[1] === undefined) return UNAVAILABLE
  const percent = Number(match[1])
  if (!Number.isFinite(percent)) return UNAVAILABLE
  return Math.min(100, Math.max(0, percent))
}

/**
 * `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits`.
 *
 * `nounits` is what makes this a bare number rather than `37 %`; the parser tolerates the unit anyway,
 * because the flag is easy to drop and the failure would be a permanent `N/A` on every NVIDIA box.
 *
 * **The first line only.** A multi-GPU host prints one line per device, and the widget has one GPU row.
 * Taking the first is a choice rather than a rule — `[N/A]` from a GPU that does not report utilisation
 * (older Teslas, and any GPU in vGPU mode) falls through to `UNAVAILABLE` rather than to the second card.
 */
export function parseNvidiaSmiPercent(output: string): number {
  const first = output.split("\n")[0]
  if (first === undefined) return UNAVAILABLE
  const match = /^\s*(\d+)\s*%?\s*$/.exec(first)
  if (match?.[1] === undefined) return UNAVAILABLE
  const percent = Number(match[1])
  if (!Number.isFinite(percent)) return UNAVAILABLE
  return Math.min(100, Math.max(0, percent))
}

/** `/sys/class/power_supply/BAT0/capacity` — a bare integer percentage. */
export function parseBatteryCapacity(contents: string): number {
  const match = /^\s*(\d+)\s*$/.exec(contents)
  if (match?.[1] === undefined) return UNAVAILABLE
  const percent = Number(match[1])
  if (!Number.isFinite(percent)) return UNAVAILABLE
  return Math.min(100, Math.max(0, percent))
}

/**
 * Whether the machine is on external power.
 *
 * `online` is `/sys/class/power_supply/AC*|ADP*|ACAD/online`, a literal `1` or `0`, and it is the
 * authoritative statement — the same call as taking macOS's plug state from `Now drawing from` rather than
 * from the battery's own word. `status` is `/sys/class/power_supply/BAT0/status` and is the fallback for a
 * machine that exposes no mains supply at all.
 *
 * `status` is only consulted when `online` is `null`. The mapping is deliberately not `=== "Charging"`:
 * `Not charging` is what a laptop holding a charge limit reports **while plugged in**, and `Full` is any
 * laptop left on mains overnight — testing for `Charging` calls both of those unplugged, which on a machine
 * whose charge limit sits near the alert threshold means a red battery bar on a charging laptop. So
 * `Discharging` is unplugged and every other *token* is plugged, erring away from a false alert.
 *
 * **A blank status is not a token.** It has to be handled separately, because `"" !== "discharging"` is true
 * and would report mains power from an empty read. That is reachable two ways: sysfs returning empty while
 * the supply is runtime-suspended, and a caller turning a read error into `""` rather than `null`. Caught by
 * the arm in `test/linux-parse.test.ts`, not by inspection.
 */
export function isPluggedIn(online: string | null, status: string | null): boolean {
  const mains = online?.trim() ?? ""
  // A blank `online` is treated as absent rather than as `0`, so it falls through to `status` instead of
  // answering "unplugged" from no evidence -- the same hole as the blank status below, in the other argument.
  if (mains !== "") return mains === "1"
  const token = status?.trim().toLowerCase() ?? ""
  if (token === "") return false
  return token !== "discharging"
}
