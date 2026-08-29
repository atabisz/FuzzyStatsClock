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
  STATS_LABEL_WIDTH,
  STATS_ROW_COUNT,
  STATS_TRACK_WIDTH,
  STATS_VALUE_WIDTH,
  UPTIME_FONT_SIZE,
  WINDOW_PADDING,
  contentSize,
  lcdViewSize,
  nixieViewSize,
  statsLayout,
  statsPanelHeight,
  windowLayout,
  windowPixelSize,
  windowPlacement,
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
import { STATS_PANEL_WIDTH, lineHeight, type WpfFontName } from "../src/core/text-metrics.js"
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

/**
 * The probe writes a family name as a bare string; `lineHeight` takes the narrow union.
 *
 * Narrowing at the boundary rather than casting, so a fourth family appearing in the fixture -- which would
 * mean `SetTextStyle` gained a style -- fails here by name instead of resolving to a missing metrics entry.
 */
const asFamily = (s: string): WpfFontName => {
  if (s !== "Segoe UI Light" && s !== "Palatino Linotype" && s !== "Consolas") {
    throw new Error(`unexpected font family: ${s}`)
  }
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

/**
 * The four `lay-arrange` configurations, which are row 0's four mutually exclusive displays.
 *
 * Deliberately not `as const`: `test.each` rejects a readonly table, the same way `describe.each` does in
 * `wpf-fixture.test.ts`. Widening to `string[]` is what makes the per-config arms below type-check.
 */
const ARRANGE_CONFIGS: string[] = ["dial", "lcd", "phrase", "split"]

/** The five stat rows, in `StatsPanel`'s child order -- the probe's element-name prefixes. */
const STAT_PREFIXES = ["Cpu", "Gpu", "Mem", "Pag", "Batt"] as const

interface ArrangedBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * One arranged element's absolute box, from `lay-arrange`.
 *
 * Throws rather than returning undefined: every name asked for below is one the probe emits, so a miss is
 * a renamed element or a truncated capture, and both should fail here by name instead of as a comparison
 * against `undefined`.
 */
const arranged = (config: string, element: string): ArrangedBox => {
  const match = rows(fixture, "lay-arrange").filter(
    (row) => field(row, 0) === config && field(row, 1) === element,
  )
  const only = match[0]
  if (only === undefined || match.length !== 1) {
    throw new Error(`lay-arrange has ${match.length} rows for ${config}/${element}, expected 1`)
  }
  return { x: num(only, 2), y: num(only, 3), width: num(only, 4), height: num(only, 5) }
}

/** Which of row 0's four displays is visible in a given `lay-arrange` config. */
const FACE_ELEMENT: Readonly<Record<string, string>> = {
  dial: "DialCanvas",
  lcd: "LcdView",
  phrase: "PhraseText",
  split: "SplitPhrasePanel",
}

const faceElement = (config: string): string => {
  const element = FACE_ELEMENT[config]
  if (element === undefined) throw new Error(`no face element for config ${config}`)
  return element
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

  test("is the delegated sum, so the height and the row tops cannot drift apart", () => {
    // `statsPanelHeight()` used to compute its own total. The two literals above are the reason that was
    // safe to change and the reason it had to be checked: the refactor is only sound if the last child's
    // bottom IS the height, which is the one property a second copy of the arithmetic can silently lose.
    const panel = statsLayout()
    expect(panel.height).toBe(statsPanelHeight())
    expect(panel.uptimeTop + panel.uptimeHeight).toBe(panel.height)
    const lastRow = panel.rows[STATS_ROW_COUNT - 1]
    expect(lastRow).toBeDefined()
    if (lastRow === undefined) return
    expect(lastRow.top + lastRow.height + STATS_CHILD_GAP).toBe(panel.uptimeTop)
  })
})

describe("the stats panel's internal geometry, measured", () => {
  // Every arm here reads `lay-arrange` and subtracts the panel's own origin, so the numbers under test are
  // panel-local -- which is what `statsLayout()` returns and what the SVG's `<g id="stats">` transform
  // makes true of its children. Doing it in all four configs is deliberate: the panel's absolute x differs
  // in every one of them, so an accidental dependence on the absolute position fails on three of four.

  test.each(ARRANGE_CONFIGS)("%s: the five rows step by one row height plus its 2px margin", (config) => {
    const panel = arranged(config, "StatsPanel")
    const expected = statsLayout()
    for (const [index, prefix] of STAT_PREFIXES.entries()) {
      const row = arranged(config, `${prefix}Row`)
      const model = expected.rows[index]
      expect(model).toBeDefined()
      if (model === undefined) continue
      expect(row.y - panel.y).toBeCloseTo(model.top, 9)
      expect(row.height).toBeCloseTo(model.height, 9)
      expect(row.width).toBe(STATS_PANEL_WIDTH)
      // The row itself is the panel's full width -- it is a Grid in a StackPanel with an explicit panel
      // Width, so there is no centring question at this level.
      expect(row.x).toBe(panel.x)
    }
  })

  test.each(ARRANGE_CONFIGS)("%s: each bar track is centred in its row, not aligned to its top", (config) => {
    // `VerticalAlignment="Center"` on the 8px track inside a 15.96 row: the offset is 3.98, and it is the
    // one number in the panel that a top-aligned reading gets wrong by a visible amount.
    const panel = arranged(config, "StatsPanel")
    const expected = statsLayout()
    for (const [index, prefix] of STAT_PREFIXES.entries()) {
      const track = arranged(config, `${prefix}BarTrack`)
      const model = expected.rows[index]
      expect(model).toBeDefined()
      if (model === undefined) continue
      expect(track.y - panel.y).toBeCloseTo(model.barY, 9)
      expect(track.height).toBe(BAR_HEIGHT)
      expect(model.barY - model.top).toBeCloseTo((model.height - BAR_HEIGHT) / 2, 9)
    }
  })

  test.each(ARRANGE_CONFIGS)("%s: the three columns are 35 / 113 / 36 at panel-local 0 / 35 / 148", (config) => {
    // `STATS_TRACK_WIDTH` is the derived one -- 184 less the two literal columns -- so this is the arm that
    // makes the derivation a measurement rather than a plausible subtraction.
    const panel = arranged(config, "StatsPanel")
    expect(STATS_TRACK_WIDTH).toBe(113)
    for (const prefix of STAT_PREFIXES) {
      const label = arranged(config, `${prefix}Label`)
      const track = arranged(config, `${prefix}BarTrack`)
      expect(label.x - panel.x).toBe(0)
      expect(label.width).toBe(STATS_LABEL_WIDTH)
      expect(track.x - panel.x).toBe(STATS_LABEL_WIDTH)
      expect(track.width).toBe(STATS_TRACK_WIDTH)
    }
  })

  test.each(ARRANGE_CONFIGS)("%s: all five values share one right edge, including Batt's", (config) => {
    // The port paints all five with a single `text-anchor="end"` at panel-local 184. Four of them get there
    // from `TextAlignment="Right"` inside a 36-wide column and `BattText` from its own
    // `HorizontalAlignment="Right"`, which shrinks the box to the text instead -- 15.59 wide rather than 36.
    // Two different mechanisms, so "the same edge" is a measurement and not a restatement of the markup.
    const panel = arranged(config, "StatsPanel")
    const rightEdge = panel.x + STATS_PANEL_WIDTH
    for (const prefix of STAT_PREFIXES) {
      const value = arranged(config, `${prefix}Text`)
      expect(value.x + value.width).toBeCloseTo(rightEdge, 9)
    }
    const batt = arranged(config, "BattText")
    const cpu = arranged(config, "CpuText")
    expect(cpu.width).toBe(STATS_VALUE_WIDTH)
    expect(batt.width).toBeLessThan(STATS_VALUE_WIDTH)
    expect(batt.x).toBeGreaterThan(cpu.x)
  })

  test.each(ARRANGE_CONFIGS)("%s: the uptime line is the port's last child and is 11pt", (config) => {
    const panel = arranged(config, "StatsPanel")
    const uptime = arranged(config, "UptimeText")
    const expected = statsLayout()
    expect(uptime.y - panel.y).toBeCloseTo(expected.uptimeTop, 9)
    expect(uptime.height).toBeCloseTo(expected.uptimeHeight, 9)
    // `toBeCloseTo` and not `toBe`: the fixture's 14.630000000000003 is WPF's own accumulation of the same
    // `LineSpacing * FontSize`, and the last bit differs. Same couple-of-ulps class as the view sizes.
    expect(uptime.height).toBeCloseTo(lineHeight("Segoe UI Light", UPTIME_FONT_SIZE), 9)
    expect(uptime.width).toBe(STATS_PANEL_WIDTH)
  })

  test("the shipped panel is 123.06 and the port's is 106.43, and the 16.63 is TempsText", () => {
    // The divergence, measured on both sides rather than asserted on one. `TempsText` ships **Visible with
    // empty text** and an empty TextBlock still measures a full line, so WPF's panel carries a row the port
    // deliberately does not. Recorded here so the delta has a number attached to it and re-adding the row
    // is a one-line change with a known effect, rather than a rediscovery.
    for (const config of ARRANGE_CONFIGS) {
      expect(arranged(config, "StatsPanel").height).toBe(123.06)
    }
    expect(statsPanelHeight()).toBe(106.43)
    const temps = arranged("dial", "TempsText")
    expect(temps.height).toBeCloseTo(lineHeight("Segoe UI Light", UPTIME_FONT_SIZE), 9)
    expect(123.06 - 106.43).toBeCloseTo(STATS_CHILD_GAP + temps.height, 9)
  })

  test("an empty TextBlock measures a full line height and zero width", () => {
    // The fact the divergence rests on, isolated from the panel: `lay-emptytext` at both stats font sizes.
    // A reimplementation that skipped an empty row -- the reasonable thing to do -- would be 14.63 short.
    const empties = rows(fixture, "lay-emptytext").filter((row) => field(row, 1) === "<empty>")
    expect(empties).toHaveLength(2)
    for (const row of empties) {
      const fontSize = num(row, 0)
      expect(num(row, 2)).toBe(lineHeight("Segoe UI Light", fontSize))
      expect(num(row, 3)).toBe(0)
    }
    // A single space has the same height and a non-zero width, which is what makes the zero above a
    // statement about the text and not about the measurement having failed.
    const space = rows(fixture, "lay-emptytext").filter((row) => field(row, 1) === " ")
    expect(space).toHaveLength(2)
    for (const row of space) {
      expect(num(row, 2)).toBe(lineHeight("Segoe UI Light", num(row, 0)))
      expect(num(row, 3)).toBeGreaterThan(0)
    }
  })

  test("UpdateText costs nothing, which is why the panel has seven children and not eight", () => {
    // `Visibility="Collapsed"` in the markup: arranged at the panel's origin with a zero box. Asserted so
    // the count in the header -- eight children, seven of them measured -- is checkable.
    const panel = arranged("dial", "StatsPanel")
    const update = arranged("dial", "UpdateText")
    expect(update).toEqual({ x: panel.x, y: panel.y, width: 0, height: 0 })
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

describe("the date row participates in the width, which this module used to forget", () => {
  test("the dial config is 247.27 inner, and neither the face nor the panel produced that", () => {
    // The measurement that found the defect. An 80px face and a 184px panel, and the arranged inner width
    // is 247.27 -- so a `Math.max` over those two rows is short by 63.27 in the very configuration a user
    // gets by turning the stats panel on with a dial. The third row is `DateBorder`, which stretches.
    const grid = arranged("dial", "innerGrid")
    expect(grid.width).toBe(247.26666666666665)
    expect(grid.width).toBeGreaterThan(Math.max(DIAL_CANVAS_SIZE, STATS_PANEL_WIDTH))
    const dateText = arranged("dial", "DateText")
    expect(dateText.width).toBeCloseTo(grid.width, 9)
    // ...and the two rows that were known about are both narrower than it, so the max is genuinely over three.
    expect(arranged("dial", "DialCanvas").width).toBe(DIAL_CANVAS_SIZE)
    expect(arranged("dial", "StatsPanel").width).toBe(STATS_PANEL_WIDTH)
  })

  test("windowLayout folds the measured date width into innerWidth", () => {
    const base = settings({ clockType: "dial", showDate: true, statsVisible: true })
    // Same three inputs the arrangement had: an 80px dial, a visible panel, a 247.27 date.
    const wide = windowLayout(base, 0, 1, 247.26666666666665)
    expect(wide.innerWidth).toBe(247.26666666666665)
    expect(wide.width).toBe(247.26666666666665 + 2 * WINDOW_PADDING)
    // A narrow date changes nothing, because the panel is then the widest row.
    expect(windowLayout(base, 0, 1, 100).innerWidth).toBe(STATS_PANEL_WIDTH)
  })

  test("hiding the date drops its width as well as its height", () => {
    // `Collapsed` removes the element's box entirely, so a stale measured width must not keep the window
    // wide. Gated inside `windowLayout` rather than at the call site: the renderer holds the last width it
    // measured, and the tray toggle that hides the date does not clear it.
    const hidden = settings({ clockType: "dial", showDate: false, statsVisible: true })
    expect(windowLayout(hidden, 0, 1, 999).innerWidth).toBe(STATS_PANEL_WIDTH)
    expect(windowLayout(hidden, 0, 1, 999).dateBlock).toBe(0)
  })

  test("omitting the argument is what every earlier caller did, and is still 0", () => {
    // The parameter is fourth and defaults, so the 1536-row enumeration below and every test above are
    // statements about the face and stats rows alone. Pinned so that stays true rather than assumed.
    const base = settings({ clockType: "lcd", fontSize: 40, statsVisible: true })
    expect(windowLayout(base, 0, 1)).toEqual(windowLayout(base, 0, 1, 0))
  })

  test("the widest reachable date row is 422.24, so the widest window is not 366", () => {
    // 366 is the widest face-or-stats window. The date row can beat it, which is why a resize clamp cannot
    // be written against a constant and why the "widest is 366" claim is scoped in the module header.
    const dates = rows(fixture, "lay-date")
    const widest = dates.reduce((best, row) => Math.max(best, num(row, 5)), 0)
    expect(widest).toBe(422.24000000000001)
    const row = dates.find((candidate) => num(candidate, 5) === widest)
    expect(row).toBeDefined()
    if (row === undefined) return
    // Consolas, date size 32 -- the derived size at the largest menu font -- and the longest weekday and
    // month names of the three locales measured.
    expect([field(row, 0), num(row, 1), field(row, 2)]).toEqual(["Consolas", 32, "Long de"])
    const layout = windowLayout(settings({ clockType: "dial", showDate: true }), 0, 1, widest)
    // 422.24 + both paddings is 446.24, and `windowPixelSize` ceils -- so the window is 447 and not 446.
    // Written out because the fractional part is exactly the kind of thing a hand-carried number loses.
    expect(layout.width).toBeCloseTo(446.24000000000001, 9)
    expect(windowPixelSize(layout).width).toBe(447)
  })

  test("the widest family is not the tallest, so neither one alone is the worst case", () => {
    // Consolas is the widest of `SetTextStyle`'s three at equal size and has the SMALLEST line height of
    // the three. A clamp derived from the tallest family would under-reserve width, and vice versa.
    const atLargest = rows(fixture, "lay-date").filter((row) => num(row, 1) === 32)
    const widthOf = (family: string): number =>
      atLargest.filter((row) => field(row, 0) === family).reduce((best, row) => Math.max(best, num(row, 5)), 0)
    const heightOf = (family: string): number => {
      const row = atLargest.find((candidate) => field(candidate, 0) === family)
      if (row === undefined) throw new Error(`no lay-date rows for ${family}`)
      return num(row, 4)
    }
    expect(widthOf("Consolas")).toBeGreaterThan(widthOf("Segoe UI Light"))
    expect(widthOf("Consolas")).toBeGreaterThan(widthOf("Palatino Linotype"))
    expect(heightOf("Consolas")).toBeLessThan(heightOf("Segoe UI Light"))
    expect(heightOf("Consolas")).toBeLessThan(heightOf("Palatino Linotype"))
  })

  test("every lay-date height is the line height this repo computes for that family and size", () => {
    // 84 rows, and the height must not depend on the string -- which is the property that makes a line
    // height a usable constant at all, and the one `text-metrics.ts` is built on.
    const dates = rows(fixture, "lay-date")
    expect(dates).toHaveLength(84)
    for (const row of dates) {
      expect(num(row, 4)).toBeCloseTo(lineHeight(asFamily(field(row, 0)), num(row, 1)), 9)
    }
    // Height is independent of the string, which is the property that makes a line height a constant at
    // all. Checked separately, because the arm above would pass on a per-string table too.
    const heights = new Set(dates.filter((row) => field(row, 0) === "Consolas" && num(row, 1) === 32).map((row) => num(row, 4)))
    expect(heights.size).toBe(1)
  })

  test("Consolas is monospaced, which is the fixture's own control on the width column", () => {
    // `12/30/2026` and `2026-12-30` are both ten characters. Equal widths in Consolas and unequal in the
    // other two is a property of the font files, so it is evidence the widths were measured rather than
    // computed from a character count -- and it fails if the probe ever resolves a fallback face.
    const at = (family: string, label: string): number => {
      const row = rows(fixture, "lay-date").find(
        (candidate) =>
          field(candidate, 0) === family && num(candidate, 1) === 32 && field(candidate, 2) === label,
      )
      if (row === undefined) throw new Error(`no lay-date row for ${family}/${label}`)
      return num(row, 5)
    }
    expect(at("Consolas", "Numeric")).toBe(at("Consolas", "ISO"))
    expect(at("Segoe UI Light", "Numeric")).not.toBe(at("Segoe UI Light", "ISO"))
    expect(at("Palatino Linotype", "Numeric")).not.toBe(at("Palatino Linotype", "ISO"))
  })
})

describe("windowPlacement: where the three rows land", () => {
  /**
   * The arranged configuration rebuilt as a `WindowLayout`, so `windowPlacement` can be checked against the
   * absolute boxes the probe measured.
   *
   * Built from the measured row sizes rather than from `contentSize`, because the probe used the XAML's
   * *authored* font sizes -- `PhraseText` at 32, `DateText` at 26 -- and not a settings-derived set. That
   * makes this a test of the composition rules, which is what `windowPlacement` is, and leaves the
   * font-size derivation to the tests that already cover it.
   */
  const asLayout = (config: string) => {
    const grid = arranged(config, "innerGrid")
    const content = arranged(config, "ContentBorder")
    const date = arranged(config, "DateBorder")
    const stats = arranged(config, "StatsPanel")
    return {
      width: grid.width + 2 * WINDOW_PADDING,
      height: grid.height + 2 * WINDOW_PADDING,
      content: { width: faceWidth(config), height: content.height },
      dateBlock: ROW_GAP + date.height,
      statsBlock: ROW_GAP + stats.height,
      innerWidth: grid.width,
    }
  }

  /**
   * Row 0's *face* width, which is not `ContentBorder`'s.
   *
   * `ContentBorder` always stretches to the full inner width; the face inside it is what `contentSize`
   * returns. Two of the four faces stretch with it (`PhraseText` is `Stretch`, and the LCD happens to be
   * the widest row) and two do not, and it is the two that do not where the centring is visible.
   */
  const faceWidth = (config: string): number => arranged(config, faceElement(config)).width

  test.each(ARRANGE_CONFIGS)("%s: the face is centred, not left-aligned", (config) => {
    // The finding. `DialCanvas` has `Width="80"` and NO HorizontalAlignment -- the default is `Stretch`,
    // which reads as "left edge at 0" -- and WPF centres it anyway, because an explicit Width stops it
    // filling its slot and `ComputeAlignmentOffset` then takes the same branch as `Center`. The other three
    // declare `Center` outright, so all four are centred and only the reason differs.
    const placement = windowPlacement(asLayout(config))
    expect(placement.face.x).toBeCloseTo(arranged(config, faceElement(config)).x, 9)
    expect(placement.face.y).toBe(WINDOW_PADDING)
  })

  test("the dial's offset is 83.63 and not zero, which is the whole point", () => {
    // Stated as a bare number as well as a formula: the two differ by more than 80 pixels here, so a
    // left-aligned port would put an 80px dial hard against the padding with 167 of empty space beside it.
    const placement = windowPlacement(asLayout("dial"))
    expect(placement.face.x).toBeCloseTo(95.63333333333334, 9)
    expect(placement.face.x - WINDOW_PADDING).toBeCloseTo(83.63333333333334, 9)
  })

  test.each(ARRANGE_CONFIGS)("%s: the stats panel is centred too, by the same rule", (config) => {
    // `Width="184"`, no HorizontalAlignment. Under the widest LCD face the offset reaches 78.88, so this is
    // the second and larger consequence of the same WPF branch.
    const placement = windowPlacement(asLayout(config))
    expect(placement.stats.x).toBeCloseTo(arranged(config, "StatsPanel").x, 9)
    expect(placement.stats.y).toBeCloseTo(arranged(config, "StatsPanel").y, 9)
  })

  test("the LCD config's panel offset is 78.88, the largest the four configs reach", () => {
    const placement = windowPlacement(asLayout("lcd"))
    expect(placement.stats.x - WINDOW_PADDING).toBeCloseTo(78.88000000000002, 9)
  })

  test.each(ARRANGE_CONFIGS)("%s: centerX is the one anchor for all three centred things", (config) => {
    // Three different mechanisms landing on the same x, which is what lets the port use one `centerX` and
    // `text-anchor: middle` everywhere instead of a per-element rule:
    //   - `PhraseText` stretches and centres its text (`HorizontalAlignment=Stretch` + `TextAlignment=Center`),
    //   - `SplitPhrasePanel` centres its box and its children centre within it,
    //   - `DateText` centres its box, which is exactly as wide as its text.
    const layout = asLayout(config)
    const placement = windowPlacement(layout)
    const centreOf = (box: ArrangedBox): number => box.x + box.width / 2
    expect(placement.centerX).toBeCloseTo(centreOf(arranged(config, "DateText")), 9)
    expect(placement.centerX).toBeCloseTo(centreOf(arranged(config, "ContentBorder")), 9)
    if (config === "split") {
      expect(placement.centerX).toBeCloseTo(centreOf(arranged(config, "SplitPhrasePanel")), 9)
      expect(placement.centerX).toBeCloseTo(centreOf(arranged(config, "QualifierText")), 9)
      expect(placement.centerX).toBeCloseTo(centreOf(arranged(config, "EmphasisText")), 9)
    }
    if (config === "phrase") {
      expect(placement.centerX).toBeCloseTo(centreOf(arranged(config, "PhraseText")), 9)
    }
  })

  test("DateText is a centred box and not a stretched one, and under the LCD they differ", () => {
    // Worth its own arm because the two readings agree in three of the four configs. In `lcd` the date is
    // 247.27 inside a 341.76 row, so a stretched `DateText` would start at 12 and a centred one at 59.25 --
    // and since its own text is centred inside it either way, the port's `text-anchor: middle` at `centerX`
    // is right for both. The distinction matters for anything that ever paints the date's BOX.
    const date = arranged("lcd", "DateText")
    const border = arranged("lcd", "DateBorder")
    expect(border.x).toBe(WINDOW_PADDING)
    expect(date.x).toBeCloseTo(59.246666666666684, 9)
    expect(date.width).toBeLessThan(border.width)
    expect(date.x - border.x).toBeCloseTo((border.width - date.width) / 2, 9)
  })

  test.each(ARRANGE_CONFIGS)("%s: dateTop is the face's bottom plus the 8px gap", (config) => {
    const placement = windowPlacement(asLayout(config))
    expect(placement.dateTop).toBeCloseTo(arranged(config, "DateBorder").y, 9)
  })

  test.each(ARRANGE_CONFIGS)("%s: the composed window matches the arranged root exactly", (config) => {
    // The closing arm: the three rows and both paddings add up to the size WPF's `SizeToContent` produced.
    const layout = asLayout(config)
    const root = arranged(config, "root")
    expect(layout.width).toBeCloseTo(root.width, 9)
    expect(layout.height).toBeCloseTo(root.height, 9)
    expect(layout.height).toBeCloseTo(
      layout.content.height + layout.dateBlock + layout.statsBlock + 2 * WINDOW_PADDING,
      9,
    )
  })

  test("the placement is pure arithmetic on the layout, so it needs no measurement of its own", () => {
    // `windowPlacement` takes only a `WindowLayout`. Stated as a test because the alternative -- reading the
    // rendered elements back to place them -- is the loop the port has to avoid: the elements are placed in
    // order to be measured, and only the two text faces measure at all.
    const layout = windowLayout(settings({ clockType: "nixie", fontSize: 32, statsVisible: true }), 0)
    const placement = windowPlacement(layout)
    expect(placement.centerX).toBe(WINDOW_PADDING + layout.innerWidth / 2)
    expect(placement.face.x).toBe(WINDOW_PADDING + (layout.innerWidth - layout.content.width) / 2)
    expect(placement.face.y).toBe(WINDOW_PADDING)
    expect(placement.dateTop).toBe(WINDOW_PADDING + layout.content.height + ROW_GAP)
    expect(placement.stats.y).toBe(
      WINDOW_PADDING + layout.content.height + layout.dateBlock + ROW_GAP,
    )
  })

  test("a face wider than the panel gets a zero offset rather than a negative one", () => {
    // The centring is symmetric, so the widest row always lands at exactly the padding. Checked because a
    // sign error here is invisible at the default settings and pushes the face off-window at the extremes.
    const layout = windowLayout(settings({ clockType: "lcd", fontSize: 40, lcdStyle: "Silver" }), 0)
    expect(layout.content.width).toBe(layout.innerWidth)
    expect(windowPlacement(layout).face.x).toBe(WINDOW_PADDING)
    // ...and the panel, in that same window, is the one pushed inward.
    const withStats = windowLayout(
      settings({ clockType: "lcd", fontSize: 40, lcdStyle: "Silver", statsVisible: true }),
      0,
    )
    expect(windowPlacement(withStats).stats.x).toBeGreaterThan(WINDOW_PADDING)
    expect(windowPlacement(withStats).face.x).toBe(WINDOW_PADDING)
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

describe("a wrapped phrase is two lines tall", () => {
  const font = "Segoe UI Light"

  test("the second line adds exactly one line height, at every menu font size", () => {
    for (const fontSize of MENU_FONT_SIZES) {
      const s = settings({ clockType: "phrase", fontSize })
      const one = contentSize(s, 180, 1)
      const two = contentSize(s, 180, 2)
      expect(two.height - one.height).toBe(lineHeight(font, fontSize))
      // Width is the caller's measurement either way: the renderer measures the WIDER of the two lines
      // and passes that, so wrapping never widens the window here.
      expect(two.width).toBe(one.width)
    }
  })

  test("omitting the argument is the same as passing 1", () => {
    // The default is what keeps the 1536-combination sweep above meaningful -- it enumerates settings,
    // and the line count is not one.
    for (const clockType of CLOCK_TYPES) {
      const s = settings({ clockType })
      expect(contentSize(s, 200)).toEqual(contentSize(s, 200, 1))
      expect(windowLayout(s, 200)).toEqual(windowLayout(s, 200, 1))
    }
  })

  test("the three fixed faces ignore the line count entirely", () => {
    // `ApplyPhraseWrap`'s first guard is `_clockType != ClockType.Phrase`, so a line count reaching a
    // digit or dial face at all would be a renderer bug; this pins that it would at least be harmless.
    for (const clockType of ["dial", "lcd", "nixie"] as const) {
      const s = settings({ clockType })
      expect(contentSize(s, 0, 2)).toEqual(contentSize(s, 0, 1))
    }
  })

  test("Split ignores it too, because Split never wraps", () => {
    // The second of the three guards. Split's height is qualifier + emphasis and multiplying that by the
    // line count would double a face that cannot reach the wrap path.
    const s = settings({ clockType: "phrase", textStyle: "Split" })
    expect(contentSize(s, 200, 2)).toEqual(contentSize(s, 200, 1))
  })

  test("the window grows by the same amount, and only in height", () => {
    const s = settings({ clockType: "phrase", fontSize: 40, showDate: true, statsVisible: true })
    const one = windowLayout(s, 200, 1)
    const two = windowLayout(s, 200, 2)
    // `toBeCloseTo`, not `toBe`, and the reason is worth keeping: at the `contentSize` level the same
    // subtraction IS exact, because `2 * lh - lh` is a power-of-two multiply and cancels. Here the row
    // gaps, the stats panel and the padding are added to both sides first, so the difference comes back
    // 53.20333333333332 against a line height of 53.20333333333333. One ulp, from the addition -- not
    // from the line count, which is what this arm is actually about.
    expect(two.height - one.height).toBeCloseTo(lineHeight(font, 40), 10)
    expect(two.width).toBe(one.width)
    expect(two.dateBlock).toBe(one.dateBlock)
    expect(two.statsBlock).toBe(one.statsBlock)
  })

  test("wrapping does not create a new tallest window, and that is measured", () => {
    // I expected it to. It does not, and the reason is that the two settings are mutually exclusive:
    // wrapping needs a non-Split text style, and Split's own two rows are taller than two phrase lines at
    // the same font size -- `trunc(40*0.65)` + `trunc(40*1.4)` is 82 points of text against 80. So the
    // 299 in the module header survives as the overall maximum, and the wrap-reachable maximum is 298.
    //
    // Enumerated rather than reasoned about, because the line-spacing ratio differs per font and the
    // margin here is one pixel. Measured over the whole wrap-reachable subspace: 4 text styles x 4 font
    // sizes x date x stats, two-line where the style permits it.
    let tallestTwoLine = -1
    let tallestOverall = -1
    for (const textStyle of TEXT_STYLES)
      for (const fontSize of MENU_FONT_SIZES)
        for (const showDate of [true, false])
          for (const statsVisible of [true, false]) {
            const s = settings({ clockType: "phrase", textStyle, fontSize, showDate, statsVisible })
            const oneLine = windowPixelSize(windowLayout(s, 200, 1)).height
            tallestOverall = Math.max(tallestOverall, oneLine)
            if (textStyle === "Split") continue
            const twoLine = windowPixelSize(windowLayout(s, 200, 2)).height
            tallestTwoLine = Math.max(tallestTwoLine, twoLine)
            tallestOverall = Math.max(tallestOverall, twoLine)
          }
    expect(tallestTwoLine).toBe(298)
    expect(tallestOverall).toBe(299)
    // Still 38 past the Phase 3 shell's 260, so the resize requirement is untouched by any of this.
    expect(tallestTwoLine).toBeGreaterThan(260)
  })
})
