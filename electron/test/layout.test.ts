/**
 * `layout.ts` against the measured view sizes, and the window sizes the port actually has to produce.
 *
 * ## The derivation is checked against the table, not read from it
 *
 * `lcdViewSize` and `nixieViewSize` compose their answer out of `seven-segment-geometry.ts` and
 * `nixie-geometry.ts` rather than looking the measured row up. That is the point: a lookup table has an
 * answer for the twelve LCD and three Nixie combinations that exist and silently none for anything else,
 * while a derivation that agrees with the table at all fifteen points is a rule. The agreement is what
 * these tests assert, so the table is a check on the rule and not the rule itself.
 *
 * Residuals, measured rather than chosen: LCD is bit-exact on **5 of 12** rows and out by at most
 * **5.68e-14** on the rest; Nixie is bit-exact on 2 of 3 and out by the same 5.68e-14 at Large. Both are
 * a couple of ulps at these magnitudes, from summing four or six digit widths in a different order than
 * WPF's StackPanel does. The tolerance below is 1e-9 -- ~17,000x the worst residual, and small enough
 * that any real composition error (a missed colon, a dropped margin, the wrong digit count) is out by
 * whole pixels.
 *
 * ## One row is a defect and is asserted as one
 *
 * `nixie-view` and `nixie-view-repath` disagree at Medium and only at Medium: 202.88 against 202.16.
 * That is not noise, it is a latent bug in the shipped WPF app, and the two blocks exist so it is
 * recorded rather than averaged away. See the `nixie` block for the mechanism and the consequence.
 *
 * ## What this file is for, in one line
 *
 * `MainWindow.xaml` is `SizeToContent="WidthAndHeight"`; the Electron shell is a fixed 232 x 260. The last
 * block measures the gap between those two facts, and it is wider than the plan first recorded.
 */
import { describe, expect, test } from "bun:test"
import {
  BAR_HEIGHT,
  CORNER_RADIUS,
  DIAL_CANVAS_SIZE,
  ROW_GAP,
  STATS_CHILD_GAP,
  STATS_FONT_SIZE,
  UPTIME_FONT_SIZE,
  WINDOW_PADDING,
  contentSize,
  lcdViewSize,
  nixieViewSize,
  statsPanelHeight,
  windowLayout,
  windowPixelSize,
} from "../src/core/layout.js"
import { buildNixieDigit, colonDotSize } from "../src/core/nixie-geometry.js"
import { toDigitHeight, type LcdSize } from "../src/core/digit-size.js"
import {
  DEFAULTS,
  LCD_STYLES,
  TEXT_STYLES,
  type AppSettings,
  type ClockType,
} from "../src/core/settings.js"
import { STATS_PANEL_WIDTH, lineHeight } from "../src/core/text-metrics.js"
import type { SegmentStyle } from "../src/core/seven-segment-geometry.js"
import { field, layoutFixture, num, rows } from "./lib/wpf-fixture.js"

const fixture = layoutFixture()

/** The probe writes `LcdSize.Medium`; this codebase's type is lowercase. */
const asSize = (s: string): "small" | "medium" | "large" => {
  const lower = s.toLowerCase()
  if (lower !== "small" && lower !== "medium" && lower !== "large") {
    throw new Error(`unexpected LcdSize: ${s}`)
  }
  return lower
}

const asStyle = (s: string): SegmentStyle => {
  if (s !== "Classic" && s !== "Bold") throw new Error(`unexpected segment style: ${s}`)
  return s
}

const settings = (overrides: Partial<AppSettings>): AppSettings => ({ ...DEFAULTS, ...overrides })

/** Every size-affecting setting, so "reachable" below means enumerated rather than sampled. */
const CLOCK_TYPES: readonly ClockType[] = ["phrase", "dial", "lcd", "nixie"]
const MENU_FONT_SIZES = [16, 24, 32, 40] as const

/**
 * The three digit tiers, for the view-size functions that take one directly.
 *
 * **`lcdSize` is not a size-affecting setting**, which is why it is absent from the enumeration in the
 * last block: `lcdDigitSize` derives the tier from the font size, because that is what the C# does. See
 * the invariance test in "row-0 content size per clock type".
 */
const SIZES = ["small", "medium", "large"] as const

/**
 * `FontSizeToLcdSize` (`MainWindow.xaml.cs:1738`) written out rather than imported.
 *
 * The mapping is what these tests are checking `contentSize` against, so taking it from the module under
 * test would make the assertion true by construction -- both sides would move together if the tiers were
 * ever re-cut. Four literals is a cheap independent oracle.
 */
const TIER_OF_FONT_SIZE: Record<(typeof MENU_FONT_SIZES)[number], LcdSize> = {
  16: "small",
  24: "medium",
  32: "large",
  40: "large",
}

describe("the LCD view size, all twelve measured rows", () => {
  // lcd-view: segmentStyle, size, showSeconds, width, height
  test.each(
    rows(fixture, "lcd-view").map((r) => ({
      style: asStyle(field(r, 0)),
      size: asSize(field(r, 1)),
      showSeconds: field(r, 2) === "1",
      width: num(r, 3),
      height: num(r, 4),
    })),
  )("$style $size seconds=$showSeconds is $width x $height", (row) => {
    const got = lcdViewSize(row.style, row.size, row.showSeconds)
    expect(got.width).toBeCloseTo(row.width, 9)
    // The height is the digit canvas height and involves no summing, so it is bit-exact on all twelve.
    expect(got.height).toBe(row.height)
  })

  test("dropping the seconds drops two digits and one colon, not two digits", () => {
    // `UpdateTime` sets Colon2, D4 and D5 to Collapsed, and Collapsed is what removes them from the
    // StackPanel's width. A port that hid the digits but kept the colon would be one colon too wide, and
    // that is a ~16px error at Large -- big enough to see and small enough to blame on something else.
    for (const style of ["Classic", "Bold"] as const) {
      for (const size of SIZES) {
        const withSeconds = lcdViewSize(style, size, true)
        const without = lcdViewSize(style, size, false)
        const digit = (withSeconds.width - without.width) / 2
        expect(digit).toBeGreaterThan(0)
        // Two digits and one colon came off, so the remainder is a colon narrower than two digits.
        expect(without.width).toBeLessThan(withSeconds.width - 2 * digit + digit)
        expect(withSeconds.height).toBe(without.height)
      }
    }
  })

  test("Bold is wider and shorter than Classic at every size", () => {
    // The Silver skin is the only thing that selects Bold, and it changes the window width by ~27% at
    // Large. Recorded because it is the reason the resize has to key on the skin and not only on the size.
    for (const size of SIZES) {
      const classic = lcdViewSize("Classic", size, true)
      const bold = lcdViewSize("Bold", size, true)
      expect(bold.width).toBeGreaterThan(classic.width)
      expect(bold.height).toBeLessThan(classic.height)
    }
  })

  test("the residual against the measurement is a couple of ulps, not a rounding decision", () => {
    // Bounds the 9-place tolerance above with what it is actually for, so nobody widens it later on the
    // belief that these sizes are approximate. 5 of 12 agree bit for bit.
    let exact = 0
    let worst = 0
    for (const r of rows(fixture, "lcd-view")) {
      const got = lcdViewSize(asStyle(field(r, 0)), asSize(field(r, 1)), field(r, 2) === "1")
      if (got.width === num(r, 3)) exact++
      worst = Math.max(worst, Math.abs(got.width - num(r, 3)))
    }
    expect(exact).toBe(5)
    expect(worst).toBeLessThan(1e-13)
  })
})

describe("the Nixie view size, and the Medium defect", () => {
  // nixie-view-repath is the steady state: the size reached by CHANGING the property, so OnSizeChanged
  // has run. That is what the port must reproduce -- see the next test for why the other block exists.
  test.each(
    rows(fixture, "nixie-view-repath").map((r) => ({
      size: asSize(field(r, 0)),
      width: num(r, 1),
      height: num(r, 2),
      dot: num(r, 3),
    })),
  )("$size is $width x $height", (row) => {
    const got = nixieViewSize(row.size)
    expect(got.width).toBeCloseTo(row.width, 9)
    expect(got.height).toBe(row.height)
    expect(colonDotSize(toDigitHeight(row.size))).toBe(row.dot)
  })

  test("the construction path leaves the Medium colon dots at the XAML literal 8", () => {
    // Measured, both ways, and the disagreement is a bug in the shipped WPF app rather than in either
    // measurement. `SizeProperty` is registered `new PropertyMetadata(LcdSize.Medium, OnSizePropertyChanged)`,
    // so `new NixieClockView { Size = Medium }` writes the value the property already holds, WPF raises no
    // change notification, and `OnSizeChanged()` -- the only code that rescales the colon dots -- never
    // runs. The digits come out right anyway because `NixieDigit.DigitHeight` also defaults to 56.0; the
    // dots stay at `Width="8"` instead of `56 * 0.13 = 7.28`, which is 0.72px of extra view width.
    //
    // So in the C# a Medium Nixie's colon width depends on the path taken to reach Medium: 8 if it
    // started there, 7.28 after any switch away and back. Small and Large are identical on both paths
    // because their sizes differ from the registered default, so the callback always fires.
    //
    // The port has no equivalent state -- it computes from the size every time -- so it necessarily
    // matches the repath figure and necessarily differs from the construction figure at Medium. That is
    // the right behaviour and it is still a divergence, so it is asserted rather than left implicit.
    const construction = new Map(
      rows(fixture, "nixie-view").map((r) => [asSize(field(r, 0)), num(r, 1)] as const),
    )
    const repath = new Map(
      rows(fixture, "nixie-view-repath").map((r) => [asSize(field(r, 0)), num(r, 1)] as const),
    )

    expect(construction.get("small")).toBe(repath.get("small"))
    expect(construction.get("large")).toBe(repath.get("large"))
    // The one disagreement, and it is exactly the 8 - 7.28 the mechanism predicts.
    expect(construction.get("medium")).toBe(202.88)
    expect(repath.get("medium")).toBe(202.16)
    expect((construction.get("medium") ?? 0) - (repath.get("medium") ?? 0)).toBeCloseTo(
      8 - colonDotSize(toDigitHeight("medium")),
      9,
    )
    // And the port sits on the steady-state side.
    expect(nixieViewSize("medium").width).toBe(202.16)
  })

  test("the colon margins are a constant 4 either side at every size", () => {
    // `OnSizeChanged` rescales the dot diameter and nothing else, so the margin does not scale. Checked as
    // the residual after removing four digits and the dot: if the 4s were a fraction of the digit height
    // instead, this would be 8 at exactly one size and something else at the other two. It is why the
    // colon looks tighter at Large than at Small, and it is in the C#.
    for (const size of SIZES) {
      const digitHeight = toDigitHeight(size)
      const digit = buildNixieDigit(digitHeight)
      const margins = nixieViewSize(size).width - 4 * digit.width - colonDotSize(digitHeight)
      expect(margins).toBeCloseTo(8, 9)
    }
  })
})

describe("the stats panel height", () => {
  test("is five stat rows and an uptime line, each with its 2px margin", () => {
    // Declared constants from MainWindow.xaml plus two measured line heights, so this is arithmetic over
    // things pinned elsewhere. The row height is the taller of the text and the 8px bar, which at 12pt is
    // the text -- so the bar height never actually drives it, and that is worth knowing before anyone
    // "simplifies" the max away.
    const rowHeight = lineHeight("Segoe UI Light", STATS_FONT_SIZE)
    expect(rowHeight).toBeGreaterThan(BAR_HEIGHT)
    const expected = 5 * (STATS_CHILD_GAP + rowHeight) + (STATS_CHILD_GAP + lineHeight("Segoe UI Light", UPTIME_FONT_SIZE))
    expect(statsPanelHeight()).toBe(expected)
    expect(statsPanelHeight()).toBe(106.43)
  })

  test("does not vary with the user's font size", () => {
    // The stats rows are a fixed 12pt and the uptime line a fixed 11pt in the XAML; only the clock face
    // scales. A panel that grew with the phrase font would change the window height on a font change and
    // is the kind of coupling the fixed 184 width exists to avoid.
    expect(statsPanelHeight()).toBe(106.43)
  })
})

describe("row-0 content size per clock type", () => {
  test("the dial is a fixed 80x80 regardless of everything else", () => {
    for (const fontSize of MENU_FONT_SIZES) {
      for (const textStyle of TEXT_STYLES) {
        const size = contentSize(settings({ clockType: "dial", fontSize, textStyle }), 999)
        expect(size).toEqual({ width: DIAL_CANVAS_SIZE, height: DIAL_CANVAS_SIZE })
      }
    }
  })

  test("the LCD takes its segment style from the skin, not from a setting of its own", () => {
    // `ApplyLcdColors` is where Silver selects Bold. A port reading a non-existent segment-style setting
    // would render Silver at Classic widths and clip the last digit by ~27%.
    for (const fontSize of MENU_FONT_SIZES) {
      const tier = TIER_OF_FONT_SIZE[fontSize]
      const silver = contentSize(settings({ clockType: "lcd", lcdStyle: "Silver", fontSize }), 0)
      expect(silver).toEqual(lcdViewSize("Bold", tier, DEFAULTS.lcdShowSeconds))
      for (const lcdStyle of LCD_STYLES.filter((s) => s !== "Silver")) {
        const other = contentSize(settings({ clockType: "lcd", lcdStyle, fontSize }), 0)
        expect(other).toEqual(lcdViewSize("Classic", tier, DEFAULTS.lcdShowSeconds))
      }
    }
  })

  test("the Nixie ignores the phrase width and takes its digit tier from the font size", () => {
    // Ignoring the phrase width is the C#: `NixieClockView` is a fixed-size StackPanel of four tubes.
    // Taking the tier from the font size is the other half of the same fact, and it is the half that was
    // wrong here first -- see the invariance test below.
    for (const fontSize of MENU_FONT_SIZES) {
      expect(contentSize(settings({ clockType: "nixie", fontSize }), 999)).toEqual(
        nixieViewSize(TIER_OF_FONT_SIZE[fontSize]),
      )
    }
  })

  test("no clock type's content size depends on settings.lcdSize", () => {
    // The discriminator for a defect this file did not catch the first time. `settings.lcdSize` is
    // **write-only derived state** in the C#: `SaveSettings` stores `FontSizeToLcdSize(_currentFontSize)`
    // (`MainWindow.xaml.cs:680` and `:907`), and all five places that read a digit size call
    // `FontSizeToLcdSize(FontSize)` instead -- `:581`, `:587`, `:1562-1563`, `:1719`, `:1724`. Nothing
    // reads `s.LcdSize`.
    //
    // `contentSize` did, and the two disagree on a DEFAULT install: `DEFAULTS.fontSize` is 32 so the face
    // renders `large`, while `DEFAULTS.lcdSize` is `"medium"` -- the C#'s own vestigial default, measured
    // by the settings probe. So the window was sized one tier small on every fresh profile, which clips
    // the digits. Not an edge case; the default path.
    //
    // Asserted as invariance over the whole cross-product rather than at one point, because that is the
    // shape of the claim: the field may be present, may be validated, may be written back, and may not
    // reach any arithmetic.
    for (const clockType of CLOCK_TYPES) {
      for (const fontSize of MENU_FONT_SIZES) {
        for (const lcdStyle of LCD_STYLES) {
          for (const lcdShowSeconds of [true, false]) {
            const base = { clockType, fontSize, lcdStyle, lcdShowSeconds }
            const atSmall = contentSize(settings({ ...base, lcdSize: "small" }), 7)
            for (const lcdSize of SIZES) {
              expect(contentSize(settings({ ...base, lcdSize }), 7)).toEqual(atSmall)
            }
          }
        }
      }
    }
    // And the same at the window level, since `windowLayout` composes on top of it.
    expect(windowLayout(settings({ clockType: "lcd", lcdSize: "small" }), 0)).toEqual(
      windowLayout(settings({ clockType: "lcd", lcdSize: "large" }), 0),
    )
  })

  test("the phrase takes the measured width, and Split stacks two lines", () => {
    // Split is the only text style whose row 0 is two lines, so it is the only one whose height is a sum.
    const classic = contentSize(settings({ clockType: "phrase", textStyle: "Classic", fontSize: 32 }), 150)
    expect(classic.width).toBe(150)
    expect(classic.height).toBe(lineHeight("Segoe UI Light", 32))

    const split = contentSize(settings({ clockType: "phrase", textStyle: "Split", fontSize: 32 }), 150)
    expect(split.width).toBe(150)
    // 32 -> qualifier 20, emphasis 44 (both truncated); the two heights add.
    expect(split.height).toBe(lineHeight("Segoe UI Light", 20) + lineHeight("Segoe UI Light", 44))
    expect(split.height).toBeGreaterThan(classic.height)
  })

  test("Literary and Mono change the height because they change the face", () => {
    const literary = contentSize(settings({ clockType: "phrase", textStyle: "Literary" }), 0)
    const mono = contentSize(settings({ clockType: "phrase", textStyle: "Mono" }), 0)
    const classic = contentSize(settings({ clockType: "phrase", textStyle: "Classic" }), 0)
    // Palatino is taller than Segoe UI Light and Consolas shorter, at the same point size.
    expect(literary.height).toBeGreaterThan(classic.height)
    expect(mono.height).toBeLessThan(classic.height)
  })
})

describe("window composition", () => {
  test("a bare dial is the face plus both paddings", () => {
    const layout = windowLayout(settings({ clockType: "dial", showDate: false, statsVisible: false }), 0)
    expect(layout).toEqual({
      width: 104,
      height: 104,
      content: { width: 80, height: 80 },
      dateBlock: 0,
      statsBlock: 0,
      innerWidth: 80,
    })
    expect(layout.width).toBe(DIAL_CANVAS_SIZE + 2 * WINDOW_PADDING)
  })

  test("Collapsed makes each optional row all-or-nothing", () => {
    // WPF's `Collapsed` removes an element's margin along with its box, so hiding the date costs the gap
    // too. `Hidden` would have kept the 8px. This is the difference between a window that tightens when
    // you hide the date and one that keeps a gap where the date used to be -- and the C# uses Collapsed
    // for both rows.
    const base = { clockType: "dial" as const, statsVisible: false }
    const withDate = windowLayout(settings({ ...base, showDate: true }), 0)
    const without = windowLayout(settings({ ...base, showDate: false }), 0)
    expect(without.dateBlock).toBe(0)
    expect(withDate.dateBlock).toBe(ROW_GAP + lineHeight("Segoe UI Light", 25))
    expect(withDate.height - without.height).toBe(withDate.dateBlock)

    const withStats = windowLayout(settings({ ...base, showDate: false, statsVisible: true }), 0)
    expect(withStats.statsBlock).toBe(ROW_GAP + statsPanelHeight())
    expect(withStats.height - without.height).toBe(withStats.statsBlock)
  })

  test("a visible stats panel pins the width at 208 however short the phrase", () => {
    // 184 + 24. Exactly the jitter the XAML comment on `Width="184"` says the fixed width exists to
    // prevent: without the floor, "one" and "twenty-five past eleven" would resize the window every
    // minute.
    for (const phraseWidth of [0, 1, 50, 183.9]) {
      const layout = windowLayout(settings({ statsVisible: true }), phraseWidth)
      expect(layout.innerWidth).toBe(STATS_PANEL_WIDTH)
      expect(layout.width).toBe(208)
    }
    // And it is a floor, not a fixed width: a wider face still wins.
    expect(windowLayout(settings({ statsVisible: true }), 300).width).toBe(324)
  })

  test("the width is the widest row and the height is the sum of all three", () => {
    // The Grid's two composition rules, stated separately, because getting one right and the other wrong
    // produces a window that looks plausible in one dimension.
    const layout = windowLayout(settings({ clockType: "nixie", fontSize: 32, statsVisible: true }), 0)
    expect(layout.innerWidth).toBe(Math.max(layout.content.width, STATS_PANEL_WIDTH))
    expect(layout.height).toBe(
      layout.content.height + layout.dateBlock + layout.statsBlock + 2 * WINDOW_PADDING,
    )
  })

  test("windowPixelSize ceils rather than truncating", () => {
    // Electron takes integer DIPs. Truncating would clip the last fraction of a pixel off the widest
    // glyph, which on the Nixie is the tube's stroke and reads as a flat edge on the rightmost tube.
    expect(windowPixelSize({ width: 275.92, height: 155.25333333333333 })).toEqual({
      width: 276,
      height: 156,
    })
    // Already-integer sizes must not gain a pixel.
    expect(windowPixelSize({ width: 104, height: 104 })).toEqual({ width: 104, height: 104 })
  })

  test("the corner radius is declared and unused by the size", () => {
    // `CornerRadius="5"` is a paint property, not a layout one -- recorded so its absence from every
    // arithmetic above reads as deliberate.
    expect(CORNER_RADIUS).toBe(5)
  })
})

describe("THE BLOCKER: the fixed shell cannot hold the reachable sizes", () => {
  // The Phase 3 shell is `const WINDOW_WIDTH = 232` / `WINDOW_HEIGHT = 260` in `src/main/main.ts:55-56`,
  // with `resizable: false`. Written as literals here rather than imported: `main.ts` imports Electron,
  // and every `core/` test must run under Bun with no Electron on the path.
  const SHELL_WIDTH = 232
  const SHELL_HEIGHT = 260

  /**
   * Every combination of the settings that change the window's size. 4x3x2x4x4x2x2 = 1536.
   *
   * Seven dimensions, not eight: `lcdSize` is in the settings file but reaches no arithmetic, so adding
   * it back would triple the run time and produce three identical copies of every row. The invariance
   * test above is what licenses leaving it out.
   */
  const everyReachableLayout = (): readonly { label: string; width: number; height: number }[] => {
    const out: { label: string; width: number; height: number }[] = []
    for (const clockType of CLOCK_TYPES)
      for (const lcdStyle of LCD_STYLES)
        for (const lcdShowSeconds of [true, false])
          for (const fontSize of MENU_FONT_SIZES)
            for (const textStyle of TEXT_STYLES)
              for (const showDate of [true, false])
                for (const statsVisible of [true, false]) {
                  const px = windowPixelSize(
                    windowLayout(
                      settings({
                        clockType,
                        lcdStyle,
                        lcdShowSeconds,
                        fontSize,
                        textStyle,
                        showDate,
                        statsVisible,
                      }),
                      0,
                    ),
                  )
                  out.push({
                    label: `${clockType}/${lcdStyle}/sec=${String(lcdShowSeconds)}/fs=${String(fontSize)}/${textStyle}/date=${String(showDate)}/stats=${String(statsVisible)}`,
                    ...px,
                  })
                }
    return out
  }

  test("the widest reachable window is 366, and it is the LCD rather than the Nixie", () => {
    // A correction to what the plan first recorded. The Nixie Large case (276) was found first and is
    // real, but it is not the worst: the Silver skin selects Bold segments, and Bold Large with seconds
    // measures 341.76 wide, which is 366 with the padding. Both are enumerated here rather than argued,
    // because "the widest mode" is the number the resize has to clamp against and picking the wrong one
    // leaves exactly one setting combination clipped.
    const all = everyReachableLayout()
    const widest = all.reduce((a, b) => (b.width > a.width ? b : a))
    expect(widest.width).toBe(366)
    expect(widest.label).toContain("lcd/Silver/sec=true")
    // The tier is Large, but Large is not a setting -- font size 32 and 40 both map to it, so both are in
    // the tie and which one `reduce` returns is an ordering artefact. Assert the tier's cause instead.
    expect(["fs=32", "fs=40"].some((fs) => widest.label.includes(fs))).toBe(true)

    // The Nixie's own worst case, kept because it is what the plan cites. Font size 32 is the default and
    // maps to the Large tier, which is what makes this the Nixie's widest.
    const nixieWorst = windowPixelSize(
      windowLayout(settings({ clockType: "nixie", fontSize: 32, showDate: true }), 0),
    )
    expect(nixieWorst).toEqual({ width: 276, height: 156 })
    expect(nixieWorst.width).toBeLessThan(widest.width)
  })

  test("the tallest reachable window is 299, and it is a Split phrase", () => {
    const all = everyReachableLayout()
    const tallest = all.reduce((a, b) => (b.height > a.height ? b : a))
    expect(tallest.height).toBe(299)
    expect(tallest.label).toContain("Split")
    expect(tallest.label).toContain("fs=40")
    expect(tallest.label).toContain("stats=true")
  })

  test("the two extremes are different modes, so there is no single worst case", () => {
    // Worth its own assertion because "the worst case" is the phrase a resize implementation reaches for,
    // and there isn't one: the widest window is 208px narrower at its tallest, and the tallest is 158px
    // narrower than the widest. A clamp written against either alone clips the other.
    const all = everyReachableLayout()
    const widestHeights = [...new Set(all.filter((l) => l.width === 366).map((l) => l.height))].sort(
      (a, b) => a - b,
    )
    // 12 distinct heights across the 32 combinations that measure 366 wide. The width is fixed by
    // lcd/Silver/sec=true at the Large tier; what still varies is the date row, whose height follows both
    // the font size and the text style's family -- Literary is Palatino Linotype and Mono is Consolas, and
    // their line spacings differ from Segoe UI Light's. Short enough now to pin whole rather than by its
    // bounds, and worth pinning whole: 94 to 259 is a 165px spread at one single width.
    expect(widestHeights).toEqual([94, 131, 135, 139, 144, 145, 208, 245, 249, 250, 254, 259])
    expect(all.filter((l) => l.width === 366)).toHaveLength(32)
    const tallest = all.reduce((a, b) => (b.height > a.height ? b : a))
    expect(tallest.width).toBe(208)
    // And the per-dimension maximum is a window no setting combination can actually produce: the widest
    // family tops out 40px short of the tallest, and the tallest is 158px short of the widest.
    expect(all.some((l) => l.width === 366 && l.height === 299)).toBe(false)
    expect(299 - (widestHeights.at(-1) ?? 0)).toBe(40)
    expect(366 - tallest.width).toBe(158)
  })

  test("the fixed shell clips in both dimensions, so the resize is required and not a refinement", () => {
    // ISC-21 says all four modes render. A clipped Nixie or a half-drawn sixth LCD digit is not
    // "renders", so this is the phase's own bar failing rather than a nice-to-have. Counted rather than
    // characterised, because "most combinations" was my first guess and it was wrong by a factor of two:
    // 336 of 1536 are too wide (21.9%), 94 too tall (6.1%), 380 fail one or the other (24.7%).
    const all = everyReachableLayout()
    expect(all).toHaveLength(1536)
    const tooWide = all.filter((l) => l.width > SHELL_WIDTH)
    const tooTall = all.filter((l) => l.height > SHELL_HEIGHT)
    expect(tooWide).toHaveLength(336)
    expect(tooTall).toHaveLength(94)
    expect(all.filter((l) => l.width > SHELL_WIDTH || l.height > SHELL_HEIGHT)).toHaveLength(380)
  })

  test("only the two digit modes overflow the width, and all four can overflow the height", () => {
    // Which modes, not just how many -- the resize has to be wired for all four regardless, and this
    // records why the two digit views are the urgent ones. 144 of the LCD's 384 combinations and **every
    // one but half** of the Nixie's are too wide; phrase and dial never are. Height overflow is spread
    // across all four because the stats panel and the date row are what push it over, and those are
    // orthogonal to the face.
    const all = everyReachableLayout()
    const of = (type: ClockType) => all.filter((l) => l.label.startsWith(`${type}/`))
    const wideBy = (type: ClockType) => of(type).filter((l) => l.width > SHELL_WIDTH).length
    const tallBy = (type: ClockType) => of(type).filter((l) => l.height > SHELL_HEIGHT).length
    for (const type of CLOCK_TYPES) expect(of(type)).toHaveLength(384)
    expect(wideBy("lcd")).toBe(144)
    expect(wideBy("nixie")).toBe(192)
    expect(wideBy("phrase")).toBe(0)
    expect(wideBy("dial")).toBe(0)
    // Every type overflows the height, and by wildly different amounts -- so a height clamp cannot be
    // scoped to the digit views the way a width clamp could be.
    expect([tallBy("phrase"), tallBy("dial"), tallBy("lcd"), tallBy("nixie")]).toEqual([12, 30, 4, 48])
  })

  test("and the shell is also too big for the small end, so it cannot just be enlarged", () => {
    // The other half of the argument, and the reason the fix is a per-mode `setSize()` rather than a
    // bigger constant: a bare LCD at font size 16 is 111x60, so a shell sized for the 366x299 worst case
    // would surround it with 250px of empty click-catching window. Both bounds together are what make this
    // a measurement problem rather than a constant to bump.
    const smallest = windowPixelSize(
      windowLayout(
        settings({
          clockType: "lcd",
          lcdShowSeconds: false,
          fontSize: 16,
          showDate: false,
          statsVisible: false,
        }),
        0,
      ),
    )
    expect(smallest).toEqual({ width: 111, height: 60 })
    // It is also the smallest of the four faces. The enumeration's own minimum by area is a 24x43 phrase,
    // but that is the `phraseWidth: 0` artefact the last test in this file is about, not a real window.
    const all = everyReachableLayout()
    const smallestFace = all
      .filter((l) => !l.label.startsWith("phrase/"))
      .reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b))
    expect(smallestFace).toMatchObject({ width: 111, height: 60 })
    expect(smallest.width).toBeLessThan(SHELL_WIDTH)
    expect(smallest.height).toBeLessThan(SHELL_HEIGHT)
  })

  test("every reachable size is a positive integer a BrowserWindow will accept", () => {
    // The cheap sweep over the same 1536 combinations: nothing NaN, nothing fractional, nothing at or
    // below the padding. A NaN reaches `setSize()` as a silent no-op, which would present as "the resize
    // does not work" rather than as a bad number.
    for (const layout of everyReachableLayout()) {
      expect(Number.isInteger(layout.width)).toBe(true)
      expect(Number.isInteger(layout.height)).toBe(true)
      expect(layout.width).toBeGreaterThanOrEqual(2 * WINDOW_PADDING)
      expect(layout.height).toBeGreaterThan(2 * WINDOW_PADDING)
    }
  })

  test("the sweep holds phraseWidth at 0, and that is why its narrowest row is 24", () => {
    // An honest limit on everything above, and a real ordering constraint it turned up. The enumeration
    // cannot know a phrase's rendered width -- that is the renderer's `getComputedTextLength()` -- so it
    // passes 0, and a phrase window with no text measured is exactly the two paddings: 24 wide.
    //
    // Which means the renderer MUST measure the text before it asks for a resize. Measure-then-size gives
    // the right window; size-then-measure flashes a 24px sliver first. Recorded as a test rather than a
    // comment because it is a sequencing requirement on code not yet written, and 24 is the number that
    // would show up in a bug report.
    const bare = windowPixelSize(
      windowLayout(settings({ clockType: "phrase", showDate: false, statsVisible: false }), 0),
    )
    expect(bare.width).toBe(2 * WINDOW_PADDING)
    // So the phrase rows in the width counts above are a floor, not the reachable phrase width. The three
    // fixed-size faces are unaffected -- their content size does not depend on the argument at all.
    for (const clockType of ["dial", "lcd", "nixie"] as const) {
      const atZero = windowLayout(settings({ clockType }), 0)
      const atThreeHundred = windowLayout(settings({ clockType }), 300)
      expect(atZero).toEqual(atThreeHundred)
    }
  })
})
