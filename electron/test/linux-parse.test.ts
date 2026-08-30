/**
 * `parse/linux.ts`.
 *
 * ## THE SAMPLE TEXT IN THIS FILE IS SYNTHETIC. IT IS NOT A CAPTURE.
 *
 * Stated first because it is the most important thing about this file, and because the macOS sibling
 * (`darwin-parse.test.ts`) reads real captures off a real M1 and the two files otherwise look identical. No
 * Linux host is reachable from this machine, so every `/proc` and `/sys` sample below was hand-written from
 * the documented formats — `proc(5)`, the amdgpu sysfs ABI, and `nvidia-smi --help-query-gpu`.
 *
 * What that costs, precisely: these arms prove the parsers do what I believe the formats are. They cannot
 * prove I believe the right thing. A field renamed, a unit I have wrong, a line that only appears on some
 * kernels — none of that is detectable here. The percentages below are therefore *arithmetic* evidence, not
 * *format* evidence, and the first Linux host available should replace the constants with a capture in
 * `test/fixtures/` and delete the tripwire arm immediately below.
 *
 * The one thing that IS measured on a real host is the Linux CPU reading, because it does not come from a
 * parser: `os.cpus()` is `/proc/stat`, so `cpu-delta.ts` covers it and its arms run against this machine's
 * real counters. See that file's header for what that does and does not transfer.
 */
import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  isPluggedIn,
  memoryPercent,
  parseBatteryCapacity,
  parseGpuBusyPercent,
  parseMemInfo,
  parseNvidiaSmiPercent,
  swapPercent,
} from "../src/main/telemetry/parse/linux.js"
import { UNAVAILABLE } from "../src/shared.js"

/**
 * A 16 GiB laptop under moderate load, hand-written. Includes `SwapCached` and the unit-less `HugePages_*`
 * lines on purpose: both are near-misses for the keys being read.
 */
const MEMINFO = `MemTotal:       16316456 kB
MemFree:          281612 kB
MemAvailable:    9605928 kB
Buffers:          317308 kB
Cached:          8021404 kB
SwapCached:        12288 kB
Active:          6221304 kB
Inactive:        7104916 kB
SwapTotal:       2097148 kB
SwapFree:        1240576 kB
Dirty:               392 kB
Writeback:             0 kB
Shmem:            412672 kB
HugePages_Total:       0
HugePages_Free:        0
Hugepagesize:       2048 kB
`

/** The same host with no swap configured, which is the default on plenty of cloud images. */
const MEMINFO_NO_SWAP = `MemTotal:       16316456 kB
MemFree:          281612 kB
MemAvailable:    9605928 kB
Cached:          8021404 kB
`

describe("the honest label on this file", () => {
  test("no captured Linux fixture exists yet — this arm FAILS ON PURPOSE once one does", () => {
    // A tripwire, not a preference. The moment a real capture lands, this file's synthetic constants become
    // the weaker of two available evidence sources and should be replaced rather than sitting beside it
    // looking equally authoritative. Failing here is the reminder.
    const fixtures = join(import.meta.dirname, "fixtures")
    for (const name of ["linux-meminfo.txt", "linux-proc-stat.txt", "linux-power-supply.txt"]) {
      expect(existsSync(join(fixtures, name)), `${name} exists — switch this test to the capture`).toBe(false)
    }
  })
})

describe("/proc/meminfo", () => {
  test("reads the four figures into bytes", () => {
    expect(parseMemInfo(MEMINFO)).toEqual({
      totalBytes: 16_708_050_944,
      availableBytes: 9_836_470_272,
      swapTotalBytes: 2_147_479_552,
      swapFreeBytes: 1_270_349_824,
    })
  })

  test("kB is 1024, and the reason to assert bytes at all is that the RATIO hides the error", () => {
    // The same trap as macOS's page size, one file over. A decimal-kB parser reads 16,316,456,000 bytes —
    // 392 MB and half a GiB of display short — and yet reports *the identical percentage*, because the scale
    // cancels out of used/total. Measured both ways here so the byte assertion above is not mistaken for
    // ceremony.
    const info = parseMemInfo(MEMINFO)
    expect(info?.totalBytes).toBe(16_316_456 * 1024)
    expect(info?.totalBytes).not.toBe(16_316_456 * 1000)
    expect(16_708_050_944 - 16_316_456_000).toBe(391_594_944)
    const decimalPercent = ((16_316_456_000 - 9_605_928_000) / 16_316_456_000) * 100
    expect(decimalPercent).toBeCloseTo(memoryPercent(info), 9)
  })

  test("occupancy is 41.1274% on this sample", () => {
    expect(memoryPercent(parseMemInfo(MEMINFO))).toBeCloseTo(41.1274, 4)
  })

  test("MemFree instead of MemAvailable reads 98.27% — 57 points wrong", () => {
    // The reading that matters most here, and the one a port gets for free from `os.freemem()`. `MemFree` is
    // 281,612 kB because Linux has put 8 GB into the page cache on purpose. A widget built on it shows a
    // memory row pinned in the high 90s on every healthy Linux box, permanently, and it looks like the
    // machine is about to swap.
    const freeOnly = ((16_708_050_944 - 281_612 * 1024) / 16_708_050_944) * 100
    expect(freeOnly).toBeCloseTo(98.2741, 4)
    expect(freeOnly - 41.1274).toBeGreaterThan(57)
  })

  test("free+buffers+cached — the pre-3.14 free(1) heuristic — reads 47.17%, 6 points wrong", () => {
    // The subtler wrong answer, and the more dangerous one because it *looks* right. It is what `free -m`
    // computed before `MemAvailable` existed, and it overstates availability by counting cache the kernel
    // cannot actually release (mapped pages, dirty pages, the low-watermark reserve). 6 points is close
    // enough that no spot check catches it.
    const heuristic = ((16_316_456 - (281_612 + 317_308 + 8_021_404)) / 16_316_456) * 100
    expect(heuristic).toBeCloseTo(47.1679, 4)
    expect(heuristic).not.toBeCloseTo(41.1274, 1)
  })

  test("falls back to MemFree when MemAvailable is absent, and the row then reads 98%", () => {
    // Reachable on a masked `/proc` in a container. The fallback is stated with its consequence rather than
    // as a safety net: it does not degrade the reading slightly, it produces the wrong answer above. It is
    // still the right fallback — a visibly-high row beats a `N/A` on a metric the machine does have — but
    // "it falls back gracefully" would be a false description.
    const withoutAvailable = MEMINFO.split("\n")
      .filter((line) => !line.startsWith("MemAvailable:"))
      .join("\n")
    const info = parseMemInfo(withoutAvailable)
    expect(info?.availableBytes).toBe(281_612 * 1024)
    expect(memoryPercent(info)).toBeCloseTo(98.2741, 4)
  })

  test("the keys are line-anchored, so SwapCached is not read as a swap figure", () => {
    // `SwapCached: 12288 kB` sits between the Mem and Swap blocks and is a prefix match for neither key
    // being read — but an unanchored `/Swap\w*:\s+(\d+)/` finds it first, and 12,288 kB of swap on a machine
    // with 2 GB would read as 99.4% paging use.
    const info = parseMemInfo(MEMINFO)
    expect(MEMINFO).toContain("SwapCached:        12288 kB")
    const cached = 12_288 * 1024
    expect(info?.swapTotalBytes).not.toBe(cached)
    expect(info?.swapFreeBytes).not.toBe(cached)
    expect(info?.totalBytes).not.toBe(cached)
    expect(info?.availableBytes).not.toBe(cached)
  })

  test("a missing kB unit is null, not a 1024x guess", () => {
    // The tightening this parser makes deliberately. Guessing bytes on a unit-less `MemTotal` turns 16 GiB
    // into 15.9 MB, which the clamp shows as a 100% row — a plausible-looking lie. `null` shows `N/A`.
    expect(parseMemInfo("MemTotal:       16316456\nMemAvailable:    9605928\n")).toBeNull()
    expect(parseMemInfo("MemTotal:       16316456 kB\nMemAvailable:    9605928\n")).toBeNull()
    // And the unit-less lines that really are in the file are ones nothing asks for.
    expect(MEMINFO).toContain("HugePages_Total:       0")
    expect(parseMemInfo(MEMINFO)).not.toBeNull()
  })

  test("returns null on output that is not /proc/meminfo", () => {
    expect(parseMemInfo("")).toBeNull()
    expect(parseMemInfo("cat: /proc/meminfo: No such file or directory")).toBeNull()
    // MemTotal alone is not enough: no available figure means no reading.
    expect(parseMemInfo("MemTotal:       16316456 kB\n")).toBeNull()
  })

  test("memoryPercent is clamped and returns UNAVAILABLE rather than dividing by zero", () => {
    expect(memoryPercent(null)).toBe(UNAVAILABLE)
    expect(memoryPercent({ totalBytes: 0, availableBytes: 0, swapTotalBytes: 0, swapFreeBytes: 0 })).toBe(
      UNAVAILABLE,
    )
    // Available above total is reachable: the two lines are sampled at different instants by the kernel.
    expect(
      memoryPercent({ totalBytes: 1000, availableBytes: 1200, swapTotalBytes: 0, swapFreeBytes: 0 }),
    ).toBe(0)
    expect(memoryPercent({ totalBytes: 1000, availableBytes: -50, swapTotalBytes: 0, swapFreeBytes: 0 })).toBe(
      100,
    )
  })
})

describe("swap, from the same file", () => {
  test("is 40.8446% on this sample", () => {
    expect(swapPercent(parseMemInfo(MEMINFO))).toBeCloseTo(40.8446, 4)
  })

  test("no swap lines at all is UNAVAILABLE, not 0%", () => {
    // The common case on Linux rather than an edge — swapless cloud images, containers, zram-only installs.
    // The swap fields default to 0, and 0 total is what makes this `N/A`: 0% would claim there is a paging
    // file and it is empty.
    const info = parseMemInfo(MEMINFO_NO_SWAP)
    expect(info?.swapTotalBytes).toBe(0)
    expect(swapPercent(info)).toBe(UNAVAILABLE)
    // And the memory row still works on the same input, which is the point of not returning null.
    expect(memoryPercent(info)).toBeCloseTo(41.1274, 4)
  })

  test("an explicit zero-sized swap is also UNAVAILABLE", () => {
    // Distinct input, same answer: the lines are present and say zero, which some kernels do.
    const zeroed = "MemTotal:       16316456 kB\nMemAvailable:    9605928 kB\nSwapTotal:             0 kB\nSwapFree:              0 kB\n"
    expect(swapPercent(parseMemInfo(zeroed))).toBe(UNAVAILABLE)
    expect(swapPercent(null)).toBe(UNAVAILABLE)
  })

  test("a full and an untouched swap are 100 and 0", () => {
    const at = (freeKb: number): string =>
      `MemTotal:       16316456 kB\nMemAvailable:    9605928 kB\nSwapTotal:       2097148 kB\nSwapFree:        ${freeKb} kB\n`
    expect(swapPercent(parseMemInfo(at(0)))).toBe(100)
    expect(swapPercent(parseMemInfo(at(2097148)))).toBe(0)
    // SwapFree above SwapTotal, same different-instants argument as memory.
    expect(swapPercent(parseMemInfo(at(3000000)))).toBe(0)
  })
})

describe("/sys/class/drm/card*/device/gpu_busy_percent", () => {
  test("reads the bare integer, trailing newline and all", () => {
    expect(parseGpuBusyPercent("37\n")).toBe(37)
    expect(parseGpuBusyPercent("0\n")).toBe(0)
    expect(parseGpuBusyPercent("100\n")).toBe(100)
    expect(parseGpuBusyPercent("  37  ")).toBe(37)
  })

  test("an empty read is UNAVAILABLE, which is what a powered-down GPU gives", () => {
    // Reachable and not hypothetical: the file exists whenever amdgpu is loaded, and reads empty or errors
    // while the card is runtime-suspended. A parser treating empty as 0 would report an idle GPU, which is
    // *almost* true and hides that the source stopped working.
    expect(parseGpuBusyPercent("")).toBe(UNAVAILABLE)
    expect(parseGpuBusyPercent("\n")).toBe(UNAVAILABLE)
  })

  test("non-numeric content is UNAVAILABLE rather than NaN", () => {
    expect(parseGpuBusyPercent("N/A")).toBe(UNAVAILABLE)
    expect(parseGpuBusyPercent("unknown")).toBe(UNAVAILABLE)
    // Not a single-value file, so this is not gpu_busy_percent and must not be read as its first number.
    expect(parseGpuBusyPercent("37\n42\n")).toBe(UNAVAILABLE)
  })

  test("clamps a driver that reports out of range", () => {
    expect(parseGpuBusyPercent("250\n")).toBe(100)
  })
})

describe("nvidia-smi --query-gpu=utilization.gpu", () => {
  test("reads the nounits form and tolerates the unit anyway", () => {
    // `nounits` is what makes it bare. The unit is tolerated because dropping that flag is an easy edit and
    // the symptom would be a permanent `N/A` on every NVIDIA machine.
    expect(parseNvidiaSmiPercent("37\n")).toBe(37)
    expect(parseNvidiaSmiPercent("37 %\n")).toBe(37)
    expect(parseNvidiaSmiPercent("0\n")).toBe(0)
  })

  test("takes the FIRST line on a multi-GPU host and ignores the rest", () => {
    // One GPU row in the widget, several cards in the machine. Taking the first is a choice; the arm pins it
    // so a later change to "the busiest" or "the mean" is a visible decision rather than a drift.
    expect(parseNvidiaSmiPercent("12\n98\n4\n")).toBe(12)
    expect(parseNvidiaSmiPercent("12\n98\n4\n")).not.toBe(98)
  })

  test("[N/A] is UNAVAILABLE and does NOT fall through to the second card", () => {
    // A vGPU-mode card, and older Teslas, report `[N/A]` for utilisation. Falling through would put GPU 1's
    // load in a row the user reads as the machine's GPU.
    expect(parseNvidiaSmiPercent("[N/A]\n88\n")).toBe(UNAVAILABLE)
    expect(parseNvidiaSmiPercent("[Not Supported]\n")).toBe(UNAVAILABLE)
  })

  test("the no-driver and no-device messages are UNAVAILABLE", () => {
    // Both are the expected output on a supported platform — an AMD or Intel box that has `nvidia-smi`
    // installed from a package, and a container without device passthrough.
    expect(parseNvidiaSmiPercent("No devices were found\n")).toBe(UNAVAILABLE)
    expect(
      parseNvidiaSmiPercent("NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.\n"),
    ).toBe(UNAVAILABLE)
    expect(parseNvidiaSmiPercent("")).toBe(UNAVAILABLE)
  })

  test("clamps", () => {
    expect(parseNvidiaSmiPercent("100\n")).toBe(100)
    expect(parseNvidiaSmiPercent("120\n")).toBe(100)
  })
})

describe("/sys/class/power_supply/BAT0/capacity", () => {
  test("reads one, two and three digit charges", () => {
    expect(parseBatteryCapacity("87\n")).toBe(87)
    expect(parseBatteryCapacity("5\n")).toBe(5)
    expect(parseBatteryCapacity("100\n")).toBe(100)
  })

  test("zero is a READING, not an absence", () => {
    // The distinction the alert depends on. 0% is a real battery about to die and must fire the low-battery
    // path; `N/A` is no battery and must not. A parser folding falsy-zero into UNAVAILABLE silences the one
    // reading the feature exists for.
    expect(parseBatteryCapacity("0\n")).toBe(0)
    expect(parseBatteryCapacity("0\n")).not.toBe(UNAVAILABLE)
  })

  test("a desktop with no BAT* directory is UNAVAILABLE", () => {
    // The caller reads nothing and passes nothing; both shapes land here.
    expect(parseBatteryCapacity("")).toBe(UNAVAILABLE)
    expect(parseBatteryCapacity("\n")).toBe(UNAVAILABLE)
    expect(parseBatteryCapacity("Unknown")).toBe(UNAVAILABLE)
  })

  test("clamps a firmware over-report", () => {
    // Same class as `Win32_Battery.EstimatedChargeRemaining` returning 101 — firmware does this.
    expect(parseBatteryCapacity("105\n")).toBe(100)
  })
})

describe("the plug state", () => {
  test("the AC adapter's online file is authoritative", () => {
    expect(isPluggedIn("1\n", null)).toBe(true)
    expect(isPluggedIn("0\n", null)).toBe(false)
    expect(isPluggedIn("1", "Discharging")).toBe(true)
    expect(isPluggedIn("0", "Charging")).toBe(false)
  })

  test("online WINS over a disagreeing status, in both directions", () => {
    // They disagree routinely rather than exceptionally: a plugged-in laptop drawing more than the charger
    // supplies reports `Discharging` while `online` is 1, and a battery finishing its top-up can report
    // `Charging` for a beat after the cable comes out. `online` is the statement about the cable, which is
    // the question being asked. Same reasoning as taking macOS's plug from `Now drawing from`.
    expect(isPluggedIn("1", "Discharging")).toBe(true)
    expect(isPluggedIn("0", "Full")).toBe(false)
  })

  test("Full and Not charging mean PLUGGED IN, which `status === Charging` gets backwards", () => {
    // The discriminating arm for the fallback. `Not charging` is what a ThinkPad holding an 80% charge limit
    // reports *while on mains*, and `Full` is any laptop left plugged in overnight. An implementation
    // testing for `Charging` calls both of those unplugged — and on a machine whose limit sits at or below
    // the alert threshold, that is a red battery bar and a low-power warning on a laptop sitting on a
    // charger.
    expect(isPluggedIn(null, "Full")).toBe(true)
    expect(isPluggedIn(null, "Not charging")).toBe(true)
    expect(isPluggedIn(null, "Charging")).toBe(true)
    expect(isPluggedIn(null, "Discharging")).toBe(false)
    // Unknown appears on some firmware mid-transition; treating it as plugged errs away from a false alert.
    expect(isPluggedIn(null, "Unknown")).toBe(true)
  })

  test("the fallback tolerates whitespace and case", () => {
    expect(isPluggedIn(null, "Discharging\n")).toBe(false)
    expect(isPluggedIn(null, "  discharging  ")).toBe(false)
    expect(isPluggedIn(null, "DISCHARGING")).toBe(false)
  })

  test("nothing readable at all is not plugged in", () => {
    // Both files absent means no power-supply class, which is a VM or a container. `false` is the reading
    // that keeps the battery row honest: there is no evidence of mains, and the percentage will be `N/A`
    // anyway, so the alert cannot fire on it.
    expect(isPluggedIn(null, null)).toBe(false)
  })

  test("a BLANK status is not a token, which `!== Discharging` alone gets wrong", () => {
    // This arm found a real defect rather than confirming one. `"" !== "discharging"` is true, so the
    // straightforward fallback reported *mains power* from an empty read — and the row would then never
    // alert, on a laptop running on battery. Reachable twice over: sysfs reads empty while the supply is
    // runtime-suspended, and a caller catching a read error into `""` instead of `null`.
    expect(isPluggedIn(null, "")).toBe(false)
    expect(isPluggedIn(null, "   ")).toBe(false)
    expect(isPluggedIn(null, "\n")).toBe(false)
    // The positive control: a real token in the same position still answers.
    expect(isPluggedIn(null, "Full")).toBe(true)
  })

  test("a BLANK online falls through to status rather than answering unplugged", () => {
    // The same hole in the other argument, and the safe-looking direction is still wrong: `"" === "1"` is
    // false, so a blank read would assert "on battery" from no evidence and discard a status file that knows
    // the answer. Treating blank as absent is what makes the two arguments consistent.
    expect(isPluggedIn("", "Full")).toBe(true)
    expect(isPluggedIn("  ", "Charging")).toBe(true)
    expect(isPluggedIn("", "Discharging")).toBe(false)
    // With neither readable there is genuinely nothing to go on.
    expect(isPluggedIn("", "")).toBe(false)
    expect(isPluggedIn("", null)).toBe(false)
  })
})
