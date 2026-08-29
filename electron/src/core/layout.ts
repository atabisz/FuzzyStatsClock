/**
 * The window's size, composed the way WPF composes it.
 *
 * ## Why this module has to exist at all
 *
 * `MainWindow.xaml:14` is **`SizeToContent="WidthAndHeight"`** and all three of its rows are
 * `Height="Auto"`. The WPF window has no size of its own: it is whatever its content measures, and it
 * re-measures on every change of clock type, font size, text style, date visibility and stats
 * visibility. SVG has no layout engine, so nothing computes that for the port -- it has to be computed
 * here and handed to `win.setSize()`.
 *
 * This was found by measurement, not by reading. The Phase 3 shell is a fixed **232 x 260**
 * (`resizable: false`). Enumerating all **4608** reachable combinations of the eight settings that change
 * the size puts **704 of them over 232 wide**, **214 over 260 tall** and **850 over one or the other** --
 * so 18.4% of the settings space is clipped by the shell as built, and a clipped clock is not "renders"
 * under ISC-21. A per-mode resize is what the phase requires, not a refinement of it.
 *
 * The two extremes are different modes, so no single combination is "the worst case". The **widest is
 * 366**, and it is the LCD rather than the Nixie: `lcd/Silver/large/sec=true` measures 341.76 across,
 * because Silver selects Bold segments -- 94 to 259 tall depending on the two optional rows and the date
 * row's own font. The Nixie
 * Large case (276) was found first and is real, but it is not the widest, which is why the number here
 * comes from the enumeration in `test/layout.test.ts` rather than from the mode that happened to be
 * measured first. The **tallest is 299** (`phrase/Split/fs=40/date=true/stats=true`), at 208 wide. And
 * the smallest reachable is **111 x 60** (a bare small LCD), so the shell cannot simply be enlarged
 * either: a window sized for both maxima would surround that one with 250px of empty, click-catching
 * surface.
 *
 * ## Which numbers here are measured and which are declared
 *
 * Split deliberately, because the distinction is what the numbers are worth:
 *
 *  - **Measured** (`test/fixtures/wpf-layout.tsv`, from the real controls and the real font files):
 *    text line heights via `text-metrics.ts`, and the two clock views' `DesiredSize`. Neither is
 *    derivable from this repository -- a line height lives in a font file, and a view size is the sum of
 *    eight digit widths plus a margined colon panel.
 *  - **Declared** (read straight off `MainWindow.xaml`): padding 12, the two 8px row gaps, the 2px
 *    top margin on each stats child, the 184px panel width, the 8px bar height and the dial's 80x80.
 *    These are literals in the markup, and a probe measuring them would only be measuring my ability to
 *    copy a number.
 *
 * The view-size functions below are *derived* from `seven-segment-geometry.ts` and `nixie-geometry.ts`
 * rather than reading the measured table, and then checked against it. That is deliberate: a lookup
 * table covers the twelve LCD and three Nixie combinations that exist today and silently has no answer
 * for anything else, while a derivation that agrees with the table at all fifteen points is a rule. The
 * agreement is the test.
 *
 * ## What `Collapsed` means for a gap
 *
 * WPF's `Collapsed` removes an element's margin along with its box, so a hidden date row costs zero and
 * not eight pixels. Both optional rows are therefore all-or-nothing here: gap and content together, or
 * neither. `Hidden` would have kept the space -- the C# uses `Collapsed` for both, and this is the
 * difference between a window that tightens when you hide the date and one that keeps a gap where the
 * date used to be.
 */

import { buildNixieDigit, colonDotSize } from "./nixie-geometry.js"
import { buildSevenSegmentDigit, type SegmentStyle } from "./seven-segment-geometry.js"
import type { LcdSize } from "./digit-size.js"
import { toDigitHeight, toSegmentHeight } from "./digit-size.js"
import { STATS_PANEL_WIDTH, deriveFontSizes, fontNameFor, lineHeight } from "./text-metrics.js"
import type { AppSettings } from "./settings.js"

/** `Border Padding="12"` on the main container. */
export const WINDOW_PADDING = 12

/** `Margin="0,8,0,0"` on the date row and on the stats panel. */
export const ROW_GAP = 8

/** `Margin="0,2,0,0"` on every child of `StatsPanel`. */
export const STATS_CHILD_GAP = 2

/** `Height="8"` on the bar tracks. */
export const BAR_HEIGHT = 8

/** The five stat rows' label and value size, and the uptime line's. */
export const STATS_FONT_SIZE = 12
export const UPTIME_FONT_SIZE = 11

/** `CornerRadius="5"` on the black background border. */
export const CORNER_RADIUS = 5

/** `DialCanvas` is a fixed 80x80. */
export const DIAL_CANVAS_SIZE = 80

export interface Size {
  readonly width: number
  readonly height: number
}

/**
 * The LCD view's size: `LcdClockView` is a horizontal `StackPanel` of `D0 D1 : D2 D3 : D4 D5`.
 *
 * `UpdateTime` collapses `Colon2`, `D4` and `D5` when seconds are off, and `Collapsed` is what takes
 * them out of the StackPanel's width -- so the no-seconds width is four digits and one colon, not six
 * and two with something painted over it.
 */
export function lcdViewSize(style: SegmentStyle, size: LcdSize, showSeconds: boolean): Size {
  const digit = buildSevenSegmentDigit(style, toSegmentHeight(size))
  const digits = showSeconds ? 6 : 4
  const colons = showSeconds ? 2 : 1
  return {
    width: digits * digit.digitWidth + colons * digit.colonWidth,
    height: digit.canvasHeight,
  }
}

/**
 * The Nixie view's size: `NixieClockView` is `D0 D1 [ColonPanel] D2 D3`.
 *
 * The colon panel is two ellipses with `Margin="4,0,4,6"` and `Margin="4,0,4,0"`, so it contributes
 * `4 + dot + 4` to the width. **The margins do not scale** -- `OnSizeChanged` rescales only the dot
 * diameter, so the gap either side of the colon is a constant 4 at every size. That is in the C#, and
 * it is why the colon looks tighter at Large than at Small.
 */
export function nixieViewSize(size: LcdSize): Size {
  const digitHeight = toDigitHeight(size)
  const digit = buildNixieDigit(digitHeight)
  const colonPanelWidth = 4 + colonDotSize(digitHeight) + 4
  return { width: 4 * digit.width + colonPanelWidth, height: digit.height }
}

/** The stats panel's height: five rows and the uptime line, each with its 2px top margin. */
export function statsPanelHeight(): number {
  const rowHeight = Math.max(lineHeight("Segoe UI Light", STATS_FONT_SIZE), BAR_HEIGHT)
  const uptimeHeight = lineHeight("Segoe UI Light", UPTIME_FONT_SIZE)
  return 5 * (STATS_CHILD_GAP + rowHeight) + (STATS_CHILD_GAP + uptimeHeight)
}

/**
 * The row-0 content size for a clock type.
 *
 * `phraseWidth` is the only input this cannot compute: a string's rendered width depends on the font the
 * platform actually resolved, so the renderer measures it with `getComputedTextLength()` and passes it
 * in. Passing `0` gives the size of everything else, which is what the stats-panel width floor makes
 * useful even before any text exists.
 */
export function contentSize(settings: AppSettings, phraseWidth: number): Size {
  const sizes = deriveFontSizes(settings.fontSize)
  const font = fontNameFor(settings.textStyle)

  switch (settings.clockType) {
    case "dial":
      return { width: DIAL_CANVAS_SIZE, height: DIAL_CANVAS_SIZE }
    case "lcd": {
      // `ApplyLcdColors` picks the segment style from the LCD skin, not from a setting of its own.
      const style: SegmentStyle = settings.lcdStyle === "Silver" ? "Bold" : "Classic"
      return lcdViewSize(style, settings.lcdSize, settings.lcdShowSeconds)
    }
    case "nixie":
      return nixieViewSize(settings.lcdSize)
    default:
      if (settings.textStyle === "Split") {
        // A vertical StackPanel: the qualifier above the emphasis, so the heights add.
        return {
          width: phraseWidth,
          height: lineHeight(font, sizes.qualifier) + lineHeight(font, sizes.emphasis),
        }
      }
      return { width: phraseWidth, height: lineHeight(font, sizes.phrase) }
  }
}

export interface WindowLayout extends Size {
  /** Row 0's box, for positioning the face inside the padded area. */
  readonly content: Size
  /** Row 1's height including its gap, or 0 when the date is hidden. */
  readonly dateBlock: number
  /** Row 2's height including its gap, or 0 when stats are hidden. */
  readonly statsBlock: number
  /** The inner width the rows share: the window less both paddings. */
  readonly innerWidth: number
}

/**
 * The whole window, composed as the three-row `Grid` inside the padded `Border`.
 *
 * The width is the widest row, which is why a visible stats panel pins it at 184 + 24 = **208** no
 * matter how short the phrase is -- exactly the jitter the XAML comment on `Width="184"` says the fixed
 * width exists to prevent.
 */
export function windowLayout(settings: AppSettings, phraseWidth: number): WindowLayout {
  const content = contentSize(settings, phraseWidth)
  const sizes = deriveFontSizes(settings.fontSize)
  const font = fontNameFor(settings.textStyle)

  const dateBlock = settings.showDate ? ROW_GAP + lineHeight(font, sizes.date) : 0
  const statsBlock = settings.statsVisible ? ROW_GAP + statsPanelHeight() : 0

  const innerWidth = Math.max(content.width, settings.statsVisible ? STATS_PANEL_WIDTH : 0)

  return {
    width: innerWidth + 2 * WINDOW_PADDING,
    height: content.height + dateBlock + statsBlock + 2 * WINDOW_PADDING,
    content,
    dateBlock,
    statsBlock,
    innerWidth,
  }
}

/**
 * The integer size to hand `BrowserWindow.setSize()`.
 *
 * `Math.ceil`, because Electron takes integer DIPs and truncating would clip the last fraction of a
 * pixel off the widest glyph -- which on the Nixie is the tube's stroke, and reads as a flat edge on the
 * rightmost tube rather than as a rounding error.
 */
export function windowPixelSize(layout: Size): { width: number; height: number } {
  return { width: Math.ceil(layout.width), height: Math.ceil(layout.height) }
}
