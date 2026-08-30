/**
 * `parse/darwin.ts` against the four captured macOS fixtures.
 *
 * The captures are the whole point of this file: they were taken on an Apple M1 (macOS 26.6.2 arm64) on
 * 2026-08-28 through a host this machine cannot reach, and they are what make the macOS telemetry path
 * testable from Windows. Every number asserted below is derived from those bytes, not from documentation
 * about what `vm_stat` prints.
 *
 * ## Three arms exist to measure a WRONG reading rather than a right one
 *
 * The memory percentage has four plausible implementations and they differ by tens of points on the same
 * snapshot, so "69.1% looks reasonable" is not evidence. Measured here, all from the one capture:
 *
 * | Reading | Result |
 * |---|---|
 * | `active + wired + compressor footprint`, over `os.totalmem()` | **69.14%** ← the port |
 * | the same, over the sum of `vm_stat`'s own buckets | 74.23% |
 * | `+ inactive + speculative` | 92.33% |
 * | `os.freemem()`-style, free pages only | 99.19% |
 * | `Pages stored in compressor` instead of the footprint | **123.50%** — impossible |
 *
 * The last one is the useful one: it does not merely read high, it exceeds 100%, which the clamp then hides
 * as a row pinned at 100%. A "sanity-check the output is a percentage" test passes it.
 *
 * ## What these fixtures cannot settle
 *
 * That the commands exist, exit 0, and cost what the plan assumes on a live Mac. That is acquisition, it
 * needs a Mac, and it is the `darwin.ts` source's evidence rather than the parser's.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  memoryPercent,
  parseIoregGpuPercent,
  parsePmsetBattery,
  parseSwapUsage,
  parseVmStat,
  swapPercent,
  usedBytes,
} from "../src/main/telemetry/parse/darwin.js"
import { UNAVAILABLE } from "../src/shared.js"

const FIXTURES = join(import.meta.dirname, "fixtures")
const read = (name: string): string => readFileSync(join(FIXTURES, name), "utf8")

const VM_STAT = read("macos-vm_stat.txt")
const SWAPUSAGE = read("macos-vm-swapusage.txt")
const IOREG = read("macos-ioreg-agxaccelerator.txt")
const PMSET_AC = read("macos-pmset-batt-ac-charged.txt")

/** The capture's host: 8 GiB. `os.totalmem()`'s value there, which the parser takes as its denominator. */
const TOTAL_8GIB = 8 * 1024 ** 3

describe("the fixtures are still what the parsers were written against", () => {
  test("the macOS captures are LF, not CRLF", () => {
    // `.gitattributes` marks `macos-*.txt` as `-text` precisely so the repo-wide `eol=crlf` policy does not
    // rewrite output `vm_stat` never emits. A checkout that lost this would still parse — every regex here
    // is `\s`-tolerant — so nothing else in this file would notice.
    for (const [name, text] of [
      ["vm_stat", VM_STAT],
      ["swapusage", SWAPUSAGE],
      ["pmset", PMSET_AC],
      ["ioreg", IOREG],
    ] as const) {
      expect(text.includes("\r"), `${name} must stay LF`).toBe(false)
    }
  })

  test("the pmset capture still contains its literal TAB", () => {
    // `pmset`'s own delimiter between the battery id and the percentage, and the byte a whitespace-split
    // parser gets wrong. The percentage regex below reads across it, which is only a meaningful claim while
    // the TAB is actually there.
    expect(PMSET_AC).toContain("\t")
    expect(/\(id=\d+\)\t/.test(PMSET_AC)).toBe(true)
  })
})

describe("vm_stat", () => {
  test("the page size comes out of the output and is 16384", () => {
    // The header line is the only place it appears. A hardcoded 4096 is out by 4x on every Apple-silicon
    // Mac — and invisible in the percentage, because the page size cancels out of the ratio. It only shows
    // up in `usedBytes`, which is why that function is exported and asserted separately.
    const stat = parseVmStat(VM_STAT)
    expect(stat).not.toBeNull()
    expect(stat?.pageSizeBytes).toBe(16384)
    expect(stat?.pageSizeBytes).not.toBe(4096)
  })

  test("the six page counts are read by label", () => {
    const stat = parseVmStat(VM_STAT)
    expect(stat).toEqual({
      pageSizeBytes: 16384,
      free: 4269,
      active: 122055,
      inactive: 120134,
      speculative: 1427,
      wired: 75189,
      compressorOccupied: 165245,
    })
  })

  test("it takes the compressor's FOOTPRINT, and the other field gives an impossible 123.5%", () => {
    // The strongest discriminator in this file. `Pages stored in compressor` is 450,232 and
    // `Pages occupied by compressor` is 165,245 — both are "compressor" lines, both are plausible reads of
    // the same idea, and one of them produces a percentage that cannot exist.
    const stat = parseVmStat(VM_STAT)
    expect(stat?.compressorOccupied).toBe(165245)
    expect(VM_STAT).toContain("Pages stored in compressor:                   450232.")

    const wrong = ((122055 + 75189 + 450232) * 16384 * 100) / TOTAL_8GIB
    expect(wrong).toBeCloseTo(123.496, 3)
    expect(wrong).toBeGreaterThan(100)
    // And the clamp would turn that into a 100% row rather than an obvious failure.
    expect(memoryPercent(stat, TOTAL_8GIB)).toBeLessThan(100)
  })

  test("usedBytes is the byte figure, which is where the page size matters", () => {
    const stat = parseVmStat(VM_STAT)
    expect(stat).not.toBeNull()
    if (stat === null) return
    expect(usedBytes(stat)).toBe((122055 + 75189 + 165245) * 16384)
    expect(usedBytes(stat)).toBe(5_939_019_776)
    // With a 4K page assumption the same snapshot reads 1.48 GiB used on an 8 GiB machine.
    expect(usedBytes({ ...stat, pageSizeBytes: 4096 })).toBe(1_484_754_944)
  })

  test("the occupancy is 69.14% of installed RAM", () => {
    expect(memoryPercent(parseVmStat(VM_STAT), TOTAL_8GIB)).toBeCloseTo(69.1393, 4)
  })

  test("the DENOMINATOR is os.totalmem() and not the sum of the buckets, which reads 74.23%", () => {
    // `vm_stat`'s printed buckets sum to 488,319 pages where an 8 GiB machine has 524,288 — the kernel's own
    // wired allocations are in none of them. Using the sum inflates the reading by 5 points, and it inflates
    // it *more* the busier the kernel is, which is when someone is looking at the row.
    const stat = parseVmStat(VM_STAT)
    expect(stat).not.toBeNull()
    if (stat === null) return
    const sumPages =
      stat.free + stat.active + stat.inactive + stat.speculative + stat.wired + stat.compressorOccupied
    expect(sumPages).toBe(488319)
    expect(TOTAL_8GIB / stat.pageSizeBytes).toBe(524288)
    expect(memoryPercent(stat, sumPages * stat.pageSizeBytes)).toBeCloseTo(74.232, 3)
  })

  test("inactive and speculative are EXCLUDED, and including them reads 92.33%", () => {
    // macOS keeps those pages populated on purpose and surrenders them on demand. Counting them is the
    // difference between a Mac that reads 69% at this load and one that reads 92% at the same load.
    const stat = parseVmStat(VM_STAT)
    expect(stat).not.toBeNull()
    if (stat === null) return
    const including = (((122055 + 75189 + 165245 + 120134 + 1427) * 16384) / TOTAL_8GIB) * 100
    expect(including).toBeCloseTo(92.325, 3)
    expect(memoryPercent(stat, TOTAL_8GIB)).toBeLessThan(including - 20)
  })

  test("os.freemem()'s free pages alone would read 99.19% used", () => {
    // The reading the port would have had for free, and the reason `vm_stat` is spawned at all. 4,269 free
    // pages out of 524,288 — a memory row pinned near 100% on every Mac, forever, looking exactly like a
    // leak in the widget.
    const freeOnly = ((TOTAL_8GIB - 4269 * 16384) / TOTAL_8GIB) * 100
    expect(freeOnly).toBeCloseTo(99.1858, 4)
    expect(freeOnly - 69.1393).toBeGreaterThan(30)
  })

  test("is clamped to 0-100 and returns UNAVAILABLE rather than dividing by zero", () => {
    const stat = parseVmStat(VM_STAT)
    expect(memoryPercent(stat, 0)).toBe(UNAVAILABLE)
    expect(memoryPercent(stat, -1)).toBe(UNAVAILABLE)
    expect(memoryPercent(null, TOTAL_8GIB)).toBe(UNAVAILABLE)
    // A denominator smaller than the used figure is reachable if `os.totalmem()` and `vm_stat` ever
    // disagree about the machine; 100 is the honest ceiling and NaN is not an option.
    expect(memoryPercent(stat, 1024)).toBe(100)
  })

  test("returns null on output that is not vm_stat, and on vm_stat missing a needed line", () => {
    // `null` rather than a partial struct: every field is load-bearing in the sum, so a missing one is a
    // different reading and not a slightly worse one.
    expect(parseVmStat("")).toBeNull()
    expect(parseVmStat("command not found")).toBeNull()
    expect(parseVmStat(SWAPUSAGE)).toBeNull()
    // The header alone is not enough.
    expect(parseVmStat("Mach Virtual Memory Statistics: (page size of 16384 bytes)")).toBeNull()
    // And one line removed from a real capture is caught, rather than defaulting to zero pages.
    const withoutWired = VM_STAT.split("\n")
      .filter((line) => !line.startsWith("Pages wired down:"))
      .join("\n")
    expect(parseVmStat(withoutWired)).toBeNull()
  })
})

describe("sysctl vm.swapusage", () => {
  test("parses the M-suffixed figures into bytes", () => {
    expect(parseSwapUsage(SWAPUSAGE)).toEqual({
      totalBytes: 1024 * 1024 ** 2,
      usedBytes: 413.44 * 1024 ** 2,
    })
  })

  test("is 40.375% on the capture", () => {
    expect(swapPercent(parseSwapUsage(SWAPUSAGE))).toBeCloseTo(40.375, 9)
  })

  test("reads the fields by NAME, so the trailing (encrypted) token cannot shift a column", () => {
    // The line ends in a bare token with no `=`, which is why this is not a whitespace split. Asserted by
    // checking the token is really there and that `free` — the field between `used` and the token — is not
    // what got parsed as `used`.
    expect(SWAPUSAGE).toContain("(encrypted)")
    const usage = parseSwapUsage(SWAPUSAGE)
    expect(usage?.usedBytes).toBe(413.44 * 1024 ** 2)
    expect(usage?.usedBytes).not.toBe(610.56 * 1024 ** 2)
  })

  test("handles the other unit suffixes and a reordered line", () => {
    // Reachable: the units scale with the swap file, and `sysctl` output order is not something to depend on.
    expect(parseSwapUsage("vm.swapusage: total = 2.00G  used = 1.00G  free = 1.00G")).toEqual({
      totalBytes: 2 * 1024 ** 3,
      usedBytes: 1024 ** 3,
    })
    expect(parseSwapUsage("vm.swapusage: used = 512.00K  total = 2048.00K  free = 1536.00K")).toEqual({
      totalBytes: 2048 * 1024,
      usedBytes: 512 * 1024,
    })
    expect(swapPercent(parseSwapUsage("vm.swapusage: total = 2.00G  used = 1.00G"))).toBe(50)
  })

  test("a zero-sized swap is UNAVAILABLE and not 0%", () => {
    // A Mac at boot may have no swap file, and a container usually has none at all. 0% claims there is a
    // paging file and it is empty; `N/A` says there is no paging file, which is the true statement and the one
    // the stat row already renders.
    expect(swapPercent(parseSwapUsage("vm.swapusage: total = 0.00M  used = 0.00M  free = 0.00M"))).toBe(
      UNAVAILABLE,
    )
    expect(swapPercent(null)).toBe(UNAVAILABLE)
  })

  test("returns null on unparseable output rather than guessing zero", () => {
    expect(parseSwapUsage("")).toBeNull()
    expect(parseSwapUsage("vm.swapusage: total = 1024.00  used = 413.44")).toBeNull()
    expect(parseSwapUsage(VM_STAT)).toBeNull()
  })
})

describe("ioreg GPU utilisation", () => {
  test("reads Device Utilization % from the capture", () => {
    expect(parseIoregGpuPercent(IOREG)).toBe(26)
  })

  test("takes Device and not Renderer or Tiler, which are close enough to pass a spot check", () => {
    // 26, 25 and 26 on this capture — indistinguishable by eye and divergent under load, since Renderer and
    // Tiler are the two halves of the pipeline and either can be the bottleneck.
    expect(IOREG).toContain('"Renderer Utilization %"=25')
    expect(IOREG).toContain('"Tiler Utilization %"=26')
    expect(parseIoregGpuPercent('{"Renderer Utilization %"=25,"Tiler Utilization %"=99}')).toBe(UNAVAILABLE)
  })

  test("reads by key name, not by position in the dictionary", () => {
    // `PerformanceStatistics` member order is not contractual. On the capture `Device Utilization %` is the
    // 8th of 11 members; a positional read is one driver update from reporting `SplitSceneCount`.
    const reordered = '{"Device Utilization %"=77,"Alloc system memory"=1355612160}'
    expect(parseIoregGpuPercent(reordered)).toBe(77)
    expect(parseIoregGpuPercent('{"Device Utilization %" = 42}')).toBe(42)
  })

  test("is UNAVAILABLE on an Intel Mac, which has no AGXAccelerator at all", () => {
    // The expected result on a supported platform, not an error path. This is an undocumented IOKit path on
    // Apple's own driver class, so the `-1` fallback is load-bearing and the GPU row's `N/A` has to survive.
    expect(parseIoregGpuPercent("")).toBe(UNAVAILABLE)
    expect(parseIoregGpuPercent("+-o AppleIntelFramebuffer  <class IOFramebuffer>")).toBe(UNAVAILABLE)
    expect(parseIoregGpuPercent('"Device Utilization %"=')).toBe(UNAVAILABLE)
  })

  test("clamps rather than trusting the driver's number", () => {
    expect(parseIoregGpuPercent('"Device Utilization %"=100')).toBe(100)
    expect(parseIoregGpuPercent('"Device Utilization %"=250')).toBe(100)
    expect(parseIoregGpuPercent('"Device Utilization %"=0')).toBe(0)
  })
})

describe("pmset -g batt", () => {
  test("reads 100% and plugged-in from the AC capture", () => {
    expect(parsePmsetBattery(PMSET_AC)).toEqual({ percent: 100, pluggedIn: true })
  })

  test("does NOT read the 0:00 remaining field as the charge", () => {
    // The trap the capture exists for. `0:00 remaining` is meaningless while charged, and a parser that
    // reaches for the last number on the line reports a battery at 0% on a fully charged laptop — which then
    // trips the low-battery alert and paints the bar red.
    expect(PMSET_AC).toContain("0:00 remaining")
    expect(parsePmsetBattery(PMSET_AC).percent).toBe(100)
    expect(parsePmsetBattery(PMSET_AC).percent).not.toBe(0)
  })

  test("takes the plug from the drawing-from line, not from the charged/discharging token", () => {
    // Three states that all say the same thing about power and different things about the battery. A laptop
    // on AC under load can read `discharging` while plugged in, and a machine holding an 80% charge limit
    // reads `charged` at 80.
    const onBattery =
      "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=35061859)\t62%; discharging; 3:41 remaining present: true"
    expect(parsePmsetBattery(onBattery)).toEqual({ percent: 62, pluggedIn: false })

    const acDischarging =
      "Now drawing from 'AC Power'\n -InternalBattery-0 (id=35061859)\t97%; discharging; 2:10 remaining present: true"
    expect(parsePmsetBattery(acDischarging)).toEqual({ percent: 97, pluggedIn: true })

    const heldAt80 =
      "Now drawing from 'AC Power'\n -InternalBattery-0 (id=35061859)\t80%; charged; 0:00 remaining present: true"
    expect(parsePmsetBattery(heldAt80)).toEqual({ percent: 80, pluggedIn: true })
  })

  test("a desktop Mac is UNAVAILABLE percent and still correctly plugged in", () => {
    // `pmset -g batt` on a Mac mini prints the drawing-from line and nothing else. Both halves matter: the
    // battery row must read `N/A`, and the plug state is still a fact the low-battery machine consumes.
    expect(parsePmsetBattery("Now drawing from 'AC Power'\n")).toEqual({
      percent: UNAVAILABLE,
      pluggedIn: true,
    })
  })

  test("empty or unrelated output is UNAVAILABLE and not plugged in", () => {
    expect(parsePmsetBattery("")).toEqual({ percent: UNAVAILABLE, pluggedIn: false })
    expect(parsePmsetBattery(VM_STAT)).toEqual({ percent: UNAVAILABLE, pluggedIn: false })
  })

  test("handles one and two digit charges, and clamps three", () => {
    const at = (text: string): string =>
      `Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t${text}; discharging; 0:12 remaining present: true`
    expect(parsePmsetBattery(at("5%")).percent).toBe(5)
    expect(parsePmsetBattery(at("0%")).percent).toBe(0)
    expect(parsePmsetBattery(at("19%")).percent).toBe(19)
    expect(parsePmsetBattery(at("100%")).percent).toBe(100)
  })
})
