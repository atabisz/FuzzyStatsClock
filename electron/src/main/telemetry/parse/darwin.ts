/**
 * Pure parsers for the four macOS telemetry commands.
 *
 * Same contract as `typeperf.ts` beside it: nothing here spawns a process or reads a file, so the whole
 * macOS path is exercised on Windows against `test/fixtures/macos-*.txt` — captures taken on a real M1 on
 * 2026-08-28 and irreplaceable from this machine. Acquisition is the only part that needs a Mac.
 *
 * The four commands, and why each one rather than the obvious alternative:
 *
 * | Metric | Command | Not this |
 * |---|---|---|
 * | mem | `vm_stat` | `os.freemem()` — see below, it is wrong by ~68 points |
 * | pag | `sysctl vm.swapusage` | `vm_stat`'s Swapins/Swapouts, which are lifetime counts |
 * | gpu | `ioreg -r -c AGXAccelerator -l` | `powermetrics`, which demands root |
 * | batt | `pmset -g batt` | `system_profiler`, ~1s and JSON |
 *
 * CPU is not in the table: it comes from `cpu-delta.ts` in-process, with no command at all.
 *
 * ## `os.freemem()` is not the memory reading
 *
 * On darwin `os.freemem()` is the Mach `free_count` — pages on the free list and nothing else. On the
 * captured snapshot that is 4,269 of 524,288 pages, so an occupancy computed from it reads **99.2% used** on
 * a machine that is genuinely at 69%. The gap is `inactive` and `speculative`: macOS keeps those pages
 * populated on purpose and hands them over on demand, so they are available without being free. A port that
 * used `os.freemem()` would have a memory row pinned near 100% on every Mac, forever, and it would look
 * exactly like a memory leak in the widget.
 *
 * ## The page size is in the output, and it is not 4096
 *
 * `vm_stat`'s header carries it, and on Apple silicon it is **16384**. Nothing else in the output states it.
 * A parser with a hardcoded 4096 is out by a factor of four — and because it is a *scale* error it survives
 * every sanity check that looks at whether the number is a plausible percentage, since the ratio it feeds
 * cancels the page size out. Which is the trap: the page size only matters for the byte figures, so the one
 * place it is needed is the one place nobody checks.
 */

import { UNAVAILABLE } from "../../../shared.js"

/**
 * The `vm_stat` fields this port uses, in pages.
 *
 * A subset on purpose. `vm_stat` emits 22 lines and 17 of them are lifetime counters (faults, pageins,
 * compressions) that describe history rather than current state.
 */
export interface VmStat {
  readonly pageSizeBytes: number
  readonly free: number
  readonly active: number
  readonly inactive: number
  readonly speculative: number
  readonly wired: number
  /**
   * `Pages occupied by compressor` — the compressor's **physical footprint**.
   *
   * Not `Pages stored in compressor`, which is the logical size of what it holds: 450,232 against 165,245
   * on the capture, a 2.7x difference. The stored figure is how much memory the compressor saved; the
   * occupied figure is how much it is using. Only the second is resident — and using the first on the
   * captured snapshot gives **123.5%**, an impossible occupancy, which the clamp below would then hide as a
   * memory row pinned at 100%. Measured, in `test/darwin-parse.test.ts`.
   */
  readonly compressorOccupied: number
}

/** One `Pages …: N.` line, or `undefined` if that label is absent. */
function pageValue(output: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`^${escaped}:\\s+(\\d+)\\.?\\s*$`, "m").exec(output)
  if (match?.[1] === undefined) return undefined
  return Number(match[1])
}

/**
 * Parse `vm_stat`, or `null` if the output is not `vm_stat` output.
 *
 * `null` rather than a partly-filled struct: every field here is load-bearing in the occupancy sum, so a
 * missing one is a different reading rather than a slightly worse one. The caller turns `null` into
 * `UNAVAILABLE` and the row shows `N/A`.
 */
export function parseVmStat(output: string): VmStat | null {
  const pageSize = /page size of (\d+) bytes/.exec(output)
  if (pageSize?.[1] === undefined) return null

  const free = pageValue(output, "Pages free")
  const active = pageValue(output, "Pages active")
  const inactive = pageValue(output, "Pages inactive")
  const speculative = pageValue(output, "Pages speculative")
  const wired = pageValue(output, "Pages wired down")
  const compressorOccupied = pageValue(output, "Pages occupied by compressor")

  if (
    free === undefined ||
    active === undefined ||
    inactive === undefined ||
    speculative === undefined ||
    wired === undefined ||
    compressorOccupied === undefined
  ) {
    return null
  }

  return {
    pageSizeBytes: Number(pageSize[1]),
    free,
    active,
    inactive,
    speculative,
    wired,
    compressorOccupied,
  }
}

/**
 * Bytes macOS is actually holding: `active + wired + compressor footprint`.
 *
 * This is the same set Activity Monitor's "Memory Used" reports, and it deliberately excludes `inactive`
 * and `speculative` — pages with content in them that the kernel will surrender without paging anything
 * out. Counting those is how you get a Mac that reads 95% used at idle.
 */
export function usedBytes(stat: VmStat): number {
  return (stat.active + stat.wired + stat.compressorOccupied) * stat.pageSizeBytes
}

/**
 * Memory occupancy as a percentage of installed RAM.
 *
 * `totalBytes` comes from `os.totalmem()` and NOT from summing `vm_stat`'s page counts. The sum is short:
 * on the capture it is 488,319 pages against the 524,288 an 8 GiB machine has, because the kernel's own
 * wired allocations are not in any of the printed buckets. Using the sum as the denominator would report
 * 74.2% where the true figure is 69.1% — a 5-point inflation that tracks how much kernel memory is in use,
 * so it grows under exactly the load a user would be checking the row to understand.
 */
export function memoryPercent(stat: VmStat | null, totalBytes: number): number {
  if (stat === null || totalBytes <= 0) return UNAVAILABLE
  const percent = (usedBytes(stat) / totalBytes) * 100
  return Math.min(100, Math.max(0, percent))
}

/** `sysctl vm.swapusage`'s three figures, in bytes. */
export interface SwapUsage {
  readonly totalBytes: number
  readonly usedBytes: number
}

/** `1024.00M` → bytes. The suffix is mandatory in this output; the unit letter is what carries the scale. */
function swapBytes(value: string, unit: string): number | undefined {
  const scale = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[unit.toUpperCase()]
  if (scale === undefined) return undefined
  const amount = Number(value)
  return Number.isFinite(amount) ? amount * scale : undefined
}

/**
 * Parse `sysctl vm.swapusage`.
 *
 * The line ends in a bare `(encrypted)` token with no key and no `=`, which is why this reads named fields
 * out of the line rather than splitting on whitespace and taking positions. It is also why `free` is not
 * parsed: it is not needed, and the fewer positional assumptions the better.
 */
export function parseSwapUsage(output: string): SwapUsage | null {
  const total = /total\s*=\s*([\d.]+)([KMGT])/i.exec(output)
  const used = /used\s*=\s*([\d.]+)([KMGT])/i.exec(output)
  if (total?.[1] === undefined || total[2] === undefined) return null
  if (used?.[1] === undefined || used[2] === undefined) return null

  const totalBytes = swapBytes(total[1], total[2])
  const usedBytes = swapBytes(used[1], used[2])
  if (totalBytes === undefined || usedBytes === undefined) return null
  return { totalBytes, usedBytes }
}

/**
 * Swap usage as a percentage, matching what `\Paging File(_Total)\% Usage` means on Windows.
 *
 * **A zero-sized swap is `UNAVAILABLE`, not 0%.** macOS can have no swap file yet at boot and a Linux box
 * or container often has none at all. 0% would claim "there is a paging file and it is empty"; `N/A` says
 * "there is no paging file", which is the true statement and the one the row already has a rendering for.
 */
export function swapPercent(usage: SwapUsage | null): number {
  if (usage === null || usage.totalBytes <= 0) return UNAVAILABLE
  const percent = (usage.usedBytes / usage.totalBytes) * 100
  return Math.min(100, Math.max(0, percent))
}

/**
 * GPU utilisation from `ioreg -r -c AGXAccelerator -l`, or `UNAVAILABLE`.
 *
 * `Device Utilization %` is the whole-GPU figure; `Renderer` and `Tiler` are its two halves and are lower
 * (25 and 26 against 26 on the capture, so they are close enough to be indistinguishable in a spot check
 * and wrong under load). The key is read by name out of the `PerformanceStatistics` dictionary rather than
 * by position, because that dictionary's member order is not contractual.
 *
 * **`UNAVAILABLE` is the expected result on an Intel Mac**, which has no `AGXAccelerator` class at all —
 * this is an undocumented IOKit path on Apple's own driver, so the fallback is load-bearing rather than
 * defensive. It is also why the GPU row's `N/A` state must survive: this is a source that can simply be
 * absent on a supported platform.
 */
export function parseIoregGpuPercent(output: string): number {
  const match = /"Device Utilization %"\s*=\s*(\d+)/.exec(output)
  if (match?.[1] === undefined) return UNAVAILABLE
  const percent = Number(match[1])
  if (!Number.isFinite(percent)) return UNAVAILABLE
  return Math.min(100, Math.max(0, percent))
}

/** What `pmset -g batt` says, in the port's terms. */
export interface BatteryReading {
  /** 0-100, or `UNAVAILABLE` when there is no internal battery. */
  readonly percent: number
  readonly pluggedIn: boolean
}

/**
 * Parse `pmset -g batt`.
 *
 * Two independent facts on two lines, and they must come from their own line each:
 *
 *   - **`Now drawing from 'AC Power'`** is the plug. Not the `charged` / `discharging` token on the battery
 *     line — a full battery on AC says `charged`, a full battery on AC that the OS is deliberately holding
 *     at 80% also says `charged`, and a laptop on AC under heavy load can say `discharging` while plugged
 *     in. The drawing-from line is the only unambiguous statement of where power is coming from.
 *   - **`100%;`** on the `-InternalBattery-0` line is the charge. Read as "digits immediately followed by a
 *     semicolon", which is what excludes the `0:00 remaining` field two tokens later. That field is
 *     meaningless while charged and a parser that reaches for the last number on the line gets `0`.
 *
 * A desktop Mac prints the drawing-from line and no battery line, so `percent` is `UNAVAILABLE` while
 * `pluggedIn` is still true and correct.
 */
export function parsePmsetBattery(output: string): BatteryReading {
  const pluggedIn = /Now drawing from ['"]AC Power['"]/i.test(output)
  const match = /InternalBattery[^\n]*?\s(\d{1,3})%;/i.exec(output)
  if (match?.[1] === undefined) return { percent: UNAVAILABLE, pluggedIn }
  const percent = Number(match[1])
  if (!Number.isFinite(percent)) return { percent: UNAVAILABLE, pluggedIn }
  return { percent: Math.min(100, Math.max(0, percent)), pluggedIn }
}
