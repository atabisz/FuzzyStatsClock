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
 * (`resizable: false`). Enumerating all **1536** reachable combinations of the seven settings that change
 * the size puts **336 of them over 232 wide**, **94 over 260 tall** and **380 over one or the other** --
 * so 24.7% of the settings space is clipped by the shell as built, and a clipped clock is not "renders"
 * under ISC-21. A per-mode resize is what the phase requires, not a refinement of it.
 *
 * Seven settings and not eight: `lcdSize` is in the file but is not one of them. See `lcdDigitSize` below.
 *
 * The two extremes are different modes, so no single combination is "the worst case". The **widest is
 * 366**, and it is the LCD rather than the Nixie: `lcd/Silver/sec=true` at font size 32 or 40 measures
 * 341.76 across, because Silver selects Bold segments -- 94 to 259 tall depending on the two optional
 * rows and the date row's own font. The Nixie
 * Large case (276) was found first and is real, but it is not the widest, which is why the number here
 * comes from the enumeration in `test/layout.test.ts` rather than from the mode that happened to be
 * measured first. The **tallest is 299** (`phrase/Split/fs=40/date=true/stats=true`), at 208 wide -- and
 * it survives the wrap path, which was not obvious: a two-line phrase reaches 298 and no further, because
 * wrapping needs a non-Split style and Split's own two rows are the taller pair. And
 * the smallest reachable digit face is **111 x 60** (a bare LCD at font size 16), so the shell cannot
 * simply be enlarged either: a window sized for both maxima would surround that one with 250px of empty,
 * click-catching surface.
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
 *
 * ## The date row is one of the three rows the width is the max of, and this module used to forget it
 *
 * Measured, `lay-arrange` in `wpf-layout.tsv`: the `dial` config -- an 80px face and a visible 184px
 * stats panel -- arranges **247.27** wide. Neither of the two rows this module knew about produced that
 * number; the third one did. `DateBorder` has no `Width` and the default `HorizontalAlignment`, so it
 * stretches, its desired width is `DateText`'s, and the `Grid`'s single implicit column is the max over
 * all three rows. Reading the markup gives two rows, and two rows is a clipped date.
 *
 * So `windowLayout` takes a **`dateWidth`**, measured by the renderer exactly as `phraseWidth` is. It
 * defaults to 0, which is the same shape `phraseLines` uses and keeps the settings-space enumeration in
 * `test/layout.test.ts` a statement about the face and stats rows alone -- **which is why the 366 above
 * is scoped to those two rows and is not the widest reachable window.** The widest date row measured is
 * **422.24**: Consolas at date size 32 rendering `"Donnerstag, September 30"`, the longest string
 * `dddd, MMMM d` can produce in the widest of `SetTextStyle`'s three families. That is a 446-wide
 * window, and the reason a resize clamp cannot be written against a constant.
 *
 * ## Stretch with an explicit Width is CENTRED, not left-aligned
 *
 * `DialCanvas` is `Width="80"` and `StatsPanel` is `Width="184"`, and neither declares a
 * `HorizontalAlignment`. The default is `Stretch`, which reads as "left edge at 0" -- but
 * `FrameworkElement.ComputeAlignmentOffset` sends `Stretch` down the **same branch as `Center`** once an
 * explicit `Width` has stopped the element filling its slot. Both are therefore centred in a wider row.
 * Measured rather than argued from the framework source, because the consequence is large and silent: at
 * the `dial` config above the canvas sits at x=95.63 rather than 12, and under the widest LCD face the
 * stats panel sits at x=90.88 rather than 12. `windowPlacement` below is where that lands.
 *
 * ## `statsPanelHeight()` is the PORT's panel, and it is 16.63 shorter than WPF's
 *
 * `StatsPanel` has eight children, not six: the five rows, `UptimeText`, `TempsText` and `UpdateText`.
 * `UpdateText` ships `Collapsed` and costs nothing **until the update check finds a newer release, which
 * Phase 7 made reachable** -- `statsLayout`'s `updateVisible` parameter is that state, and the panel is
 * 16.63 taller while the notice is up. **`TempsText` ships `Visible` with empty text**, and
 * an empty WPF `TextBlock` measures a full line height with zero width -- 14.63 at font size 11,
 * measured in `lay-emptytext`. So the shipped panel is **123.06** tall and the port's six-child one is
 * **106.43**, both measured, and the 16.63 difference is the temps row the port dropped by decision. It
 * is recorded here rather than corrected because re-adding the row is one line if the divergence ever
 * matters, and silently padding the height would make the port neither faithful nor self-consistent.
 */

import { buildNixieDigit, nixieColonPanel } from "./nixie-geometry.js"
import { buildSevenSegmentDigit, type SegmentStyle } from "./seven-segment-geometry.js"
import type { LcdSize } from "./digit-size.js"
import { toDigitHeight, toSegmentHeight } from "./digit-size.js"
import {
  STATS_PANEL_WIDTH,
  deriveFontSizes,
  fontNameFor,
  fontSizeToLcdSize,
  lineHeight,
} from "./text-metrics.js"
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

/** The five stat rows, in `StatsPanel`'s child order. */
export const STATS_ROW_COUNT = 5

/** `ColumnDefinition Width="35"` -- the label column on every stat row. */
export const STATS_LABEL_WIDTH = 35

/** `ColumnDefinition Width="36"` -- the value column. `TextAlignment="Right"` inside it. */
export const STATS_VALUE_WIDTH = 36

/**
 * The `Width="*"` middle column: the bar track.
 *
 * Derived rather than written as 113, because it is the one of the three that is not a literal in the
 * markup -- it is whatever the panel's 184 leaves over. `renderer.ts` held its own `TRACK_WIDTH = 113`,
 * which is the same number arrived at by hand and the place a changed panel width would go unnoticed.
 */
export const STATS_TRACK_WIDTH = STATS_PANEL_WIDTH - STATS_LABEL_WIDTH - STATS_VALUE_WIDTH

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Point {
  readonly x: number
  readonly y: number
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
  // The panel's width comes from `nixieColonPanel` rather than being written out again here: the renderer
  // needs the same number to place the dots, and two copies of `4 + dot + 4` is where the window width and
  // the painted colon drift apart by 8px without either one looking wrong on its own.
  const panel = nixieColonPanel(digitHeight, digit.height)
  return { width: 4 * digit.width + panel.width, height: digit.height }
}

/** One stat row's box inside the panel, and where its 8px bar sits in that box. */
export interface StatsRowLayout {
  /** Panel-local top of the row, past its own 2px margin. */
  readonly top: number
  readonly height: number
  /** Panel-local top of the track and bar. `VerticalAlignment="Center"` inside the row. */
  readonly barY: number
  /** False when this row is `Collapsed`: zero height, no margin, and nothing to paint. */
  readonly visible: boolean
}

export interface StatsLayout {
  /** Five rows, in CPU/GPU/MEM/PAG/BATT order. */
  readonly rows: readonly StatsRowLayout[]
  readonly uptimeTop: number
  readonly uptimeHeight: number
  /** The update notice's top, valid whether or not it is shown -- see {@link statsLayout}. */
  readonly updateTop: number
  /** Zero unless a newer release was found. The notice is not a setting. */
  readonly updateHeight: number
  /** The panel's own height -- the last VISIBLE child's bottom, by construction. */
  readonly height: number
}

/**
 * Which of the panel's six children are shown. `SetStatRowVisible` / `SetUptimeRowVisible`'s inputs.
 *
 * A record rather than five booleans so `statsLayout` cannot be called with two of them transposed --
 * `cpuVisible` and `gpuVisible` are the same type and adjacent in `AppSettings`, and a swap there is a
 * bug that produces a correctly-sized panel with the wrong rows in it.
 */
export interface StatsVisibility {
  readonly cpu: boolean
  readonly gpu: boolean
  readonly mem: boolean
  readonly pag: boolean
  readonly batt: boolean
  readonly uptime: boolean
}

/** The five rows in `StatsPanel`'s child order, which is the order `StatsLayout.rows` is in. */
export const STATS_ROW_KEYS = ["cpu", "gpu", "mem", "pag", "batt"] as const

export type StatsRowKey = (typeof STATS_ROW_KEYS)[number]

/** Every child shown -- the shipped default, and what `statsLayout()` assumes when asked for nothing. */
export const ALL_STATS_VISIBLE: StatsVisibility = {
  cpu: true,
  gpu: true,
  mem: true,
  pag: true,
  batt: true,
  uptime: true,
}

/**
 * The stats panel's internal geometry: a vertical `StackPanel`, so each child starts where the last
 * ended, past its own `Margin="0,2,0,0"`.
 *
 * A row's height is `Math.max(lineHeight(12), BAR_HEIGHT)` and not just the line height: the row is a
 * `Grid` whose tallest child decides, and the 8px track would win if the label were ever smaller than
 * it. At font size 12 the text is 15.96 and the max is a no-op -- which is exactly why it is written
 * rather than assumed, since the number that makes it matter is a per-row font size.
 *
 * Measured against `lay-arrange`: row tops step by 17.96, and each bar track sits 3.98 below its row's
 * top -- `(15.96 - 8) / 2`.
 *
 * ## What a hidden child does, and why the fixture cannot say
 *
 * `SetStatRowVisible` writes `Collapsed`, which per this module's header removes the margin along with
 * the box -- so a hidden row costs **zero, not two**, and the row below it moves up by the full 17.96
 * rather than by 15.96. **`wpf-layout.tsv` has no arrange data for a hidden row**: every `lay-arrange`
 * config was captured with all five shown, so this is the `Collapsed` rule applied consistently with
 * the date row rather than a measurement, and it is the one part of this function a fixture does not
 * hold. The all-visible case IS measured, and that is what pins the rule's zero point.
 *
 * A hidden row still gets an entry, with `visible: false` and `height: 0`, rather than being filtered
 * out. The renderer indexes rows by position to reach five fixed element ids, and a compacted array
 * would silently shift `batt`'s geometry onto `pag`'s elements the moment one row was hidden.
 *
 * ## The update notice is a SEPARATE parameter, and that is a decision rather than a signature accident
 *
 * `updateVisible` is not in {@link StatsVisibility} and does not appear in {@link ALL_STATS_VISIBLE},
 * because it is **not a setting**. The six flags are persisted user choices; `UpdateText`'s visibility is
 * a *result* -- it flips only when the GitHub check finds a strictly-newer release
 * (`MainWindow.xaml.cs:1339-1340`), and no settings key controls it. `updateChecksEnabled` gates whether
 * the check runs, which is a different fact: checks on and no newer release is the common case, and it
 * shows nothing.
 *
 * Putting it in `StatsVisibility` would have forced a choice between two wrong things: `update: true` in
 * `ALL_STATS_VISIBLE` changes the shipped panel height from 106.43 to 123.06 and makes every existing
 * measured expectation wrong, and `update: false` in a constant named "all visible" is a lie the next
 * reader has to discover. Keeping it out costs one parameter and keeps both honest.
 *
 * **The height it contributes is measured, not the C#'s estimate.** `MainWindow.xaml.cs:1343`'s comment
 * says showing the line "increases window height by ~13px"; at `FontSize="11"` in Segoe UI Light the line
 * measures **14.63** and its `Margin="0,2,0,0"` adds 2, so the real figure is **16.63** -- the same number
 * as the temps row this port dropped, which is what makes the coincidence worth stating rather than
 * trusting. The comment was an estimate someone wrote; `lineHeight` is a measurement.
 */
export function statsLayout(
  visible: StatsVisibility = ALL_STATS_VISIBLE,
  updateVisible = false,
): StatsLayout {
  const rowHeight = Math.max(lineHeight("Segoe UI Light", STATS_FONT_SIZE), BAR_HEIGHT)
  const rows: StatsRowLayout[] = []
  let top = 0
  for (const key of STATS_ROW_KEYS) {
    if (!visible[key]) {
      // Zero-height at the current cursor. `barY` is `top` rather than a centred offset because there is
      // no box to centre in; nothing reads it while `visible` is false, and a NaN or a negative would be
      // worse than a coordinate that is merely unused.
      rows.push({ top, height: 0, barY: top, visible: false })
      continue
    }
    top += STATS_CHILD_GAP
    rows.push({ top, height: rowHeight, barY: top + (rowHeight - BAR_HEIGHT) / 2, visible: true })
    top += rowHeight
  }
  const uptimeHeight = visible.uptime ? lineHeight("Segoe UI Light", UPTIME_FONT_SIZE) : 0
  const uptimeTop = visible.uptime ? top + STATS_CHILD_GAP : top
  // The same `Collapsed` rule the uptime line above gets, applied to the panel's last child. A hidden
  // notice sits AT the cursor with zero height -- the renderer writes its `y` unconditionally, exactly as
  // it does for a hidden uptime line, so the coordinate has to be the StackPanel's real one rather than a
  // placeholder that would place the text somewhere visible the moment it was unhidden.
  const updateHeight = updateVisible ? lineHeight("Segoe UI Light", UPTIME_FONT_SIZE) : 0
  const updateTop = updateVisible ? uptimeTop + uptimeHeight + STATS_CHILD_GAP : uptimeTop + uptimeHeight
  return { rows, uptimeTop, uptimeHeight, updateTop, updateHeight, height: updateTop + updateHeight }
}

/**
 * The stats panel's height: its visible children, each with its 2px top margin.
 *
 * Delegates rather than computing its own sum, so the height and the row tops cannot drift -- the whole
 * point of `statsLayout` is that the last child's bottom IS the height.
 *
 * **Zero is reachable**, and it is a real state rather than a guard to add: `SetStatRowVisible`'s
 * auto-collapse is one-way, so hiding all five rows collapses the panel but re-showing it from the tray
 * leaves every child hidden. WPF gives that panel height 0 and still applies its `Margin="0,8,0,0"`, so
 * `windowLayout` below adds `ROW_GAP` to nothing -- the widget keeps an 8px gap under the date and shows
 * an empty panel, which is what the original does.
 */
export function statsPanelHeight(visible: StatsVisibility = ALL_STATS_VISIBLE, updateVisible = false): number {
  return statsLayout(visible, updateVisible).height
}

/** `AppSettings`' six flags in the shape `statsLayout` takes. */
export function statsVisibility(settings: AppSettings): StatsVisibility {
  return {
    cpu: settings.cpuVisible,
    gpu: settings.gpuVisible,
    mem: settings.memVisible,
    pag: settings.pagVisible,
    batt: settings.batteryVisible,
    uptime: settings.uptimeVisible,
  }
}

/**
 * The digit size the two seven-segment/tube views actually render at.
 *
 * **`settings.lcdSize` is not it, and reading it was a defect.** In the C# that field is *write-only*
 * derived state: `SaveSettings` stores `LcdSize = FontSizeToLcdSize(_currentFontSize)`
 * (`MainWindow.xaml.cs:680` and `:907`), and every one of the five places that reads a digit size reads
 * `FontSizeToLcdSize(FontSize)` instead -- `:581` and `:587` on load, `:1562-1563` in `ApplyFontSize`,
 * `:1719` and `:1724` in `SetClockType`. Nothing anywhere reads `s.LcdSize`.
 *
 * The two disagree on a **default install**, which is what makes this worth a named function rather than
 * an inline call: `DEFAULTS.fontSize` is 32, so the face renders `large`, while `DEFAULTS.lcdSize` is
 * `"medium"` -- the C#'s own vestigial default, measured by the settings probe. Sizing the window from
 * the field while the face is built from the font size clips the digits on every fresh profile.
 *
 * So the field is kept in `AppSettings` (it is in the file, and `settings-import.ts` decodes its
 * ordinal), it is still written on save, and no size calculation may consult it.
 */
export function lcdDigitSize(settings: AppSettings): LcdSize {
  return fontSizeToLcdSize(settings.fontSize)
}

/**
 * The row-0 content size for a clock type.
 *
 * `phraseWidth` is the only input this cannot compute: a string's rendered width depends on the font the
 * platform actually resolved, so the renderer measures it with `getComputedTextLength()` and passes it
 * in. Passing `0` gives the size of everything else, which is what the stats-panel width floor makes
 * useful even before any text exists.
 *
 * `phraseLines` is 2 when `ApplyPhraseWrap` split the phrase, and 1 otherwise. It has to be a parameter
 * for the same reason `phraseWidth` does -- the split decision is made against a *measured* width, so
 * nothing here can derive it -- and it defaults to 1 so every non-phrase caller and the settings-space
 * enumeration are unaffected. Omitting it was a clipping bug rather than a simplification: a wrapped
 * phrase is two lines tall in a window sized for one, and `SizeToContent` grows the WPF window for it.
 */
export function contentSize(settings: AppSettings, phraseWidth: number, phraseLines = 1): Size {
  const sizes = deriveFontSizes(settings.fontSize)
  const font = fontNameFor(settings.textStyle)

  switch (settings.clockType) {
    case "dial":
      return { width: DIAL_CANVAS_SIZE, height: DIAL_CANVAS_SIZE }
    case "lcd": {
      // `ApplyLcdColors` picks the segment style from the LCD skin, not from a setting of its own.
      const style: SegmentStyle = settings.lcdStyle === "Silver" ? "Bold" : "Classic"
      return lcdViewSize(style, lcdDigitSize(settings), settings.lcdShowSeconds)
    }
    case "nixie":
      return nixieViewSize(lcdDigitSize(settings))
    default:
      if (settings.textStyle === "Split") {
        // A vertical StackPanel: the qualifier above the emphasis, so the heights add. Split never
        // wraps -- it is the second of `ApplyPhraseWrap`'s three guards -- so `phraseLines` is ignored
        // here rather than multiplied in, and that is the C#'s behaviour and not an approximation.
        return {
          width: phraseWidth,
          height: lineHeight(font, sizes.qualifier) + lineHeight(font, sizes.emphasis),
        }
      }
      return { width: phraseWidth, height: phraseLines * lineHeight(font, sizes.phrase) }
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
 *
 * `dateWidth` is the third row's measured text width and defaults to 0. It is gated on `showDate` here
 * rather than at the call site so a caller cannot pin the window wide with a stale measurement after the
 * date has been hidden -- `Collapsed` takes the row out of the width as well as out of the height.
 */
export function windowLayout(
  settings: AppSettings,
  phraseWidth: number,
  phraseLines = 1,
  dateWidth = 0,
  updateVisible = false,
): WindowLayout {
  const content = contentSize(settings, phraseWidth, phraseLines)
  const sizes = deriveFontSizes(settings.fontSize)
  const font = fontNameFor(settings.textStyle)

  const dateBlock = settings.showDate ? ROW_GAP + lineHeight(font, sizes.date) : 0
  // Per-row visibility reaches the WINDOW size, not just the panel's internals: hiding GPU and PAG makes
  // the widget 35.92 shorter, and a window sized for six children with four in it leaves a dead strip
  // below the panel that still catches clicks.
  // `updateVisible` reaches the window through here and NOT through a settings flag, which is the whole
  // reason it is a parameter: the notice makes the widget 16.63 taller the instant the check comes back,
  // and `MainWindow.xaml.cs:1343-1355` re-clamps the position for exactly that reason. In this port the
  // re-clamp is not a special case -- the renderer's measure-then-resize cycle sends the taller size and
  // main's `onResize` already calls `commitPlacement`, so a notice arriving at a widget sitting on the
  // bottom edge of the work area moves it up through the path a display change uses.
  const statsBlock = settings.statsVisible
    ? ROW_GAP + statsPanelHeight(statsVisibility(settings), updateVisible)
    : 0

  const innerWidth = Math.max(
    content.width,
    settings.showDate ? dateWidth : 0,
    settings.statsVisible ? STATS_PANEL_WIDTH : 0,
  )

  return {
    width: innerWidth + 2 * WINDOW_PADDING,
    height: content.height + dateBlock + statsBlock + 2 * WINDOW_PADDING,
    content,
    dateBlock,
    statsBlock,
    innerWidth,
  }
}

/** Where each row lands inside the window, in the SVG's own coordinates. */
export interface WindowPlacement {
  /** Row 0's top-left: the face container's `transform`. */
  readonly face: Point
  /**
   * The horizontal centre of the padded area -- the anchor for everything `TextAlignment="Center"`.
   *
   * One number for all three centred things, because the Grid's single column is the full inner width and
   * every one of them is centred in it: the phrase (stretched, text centred), Split's panel (centred, and
   * its children centred within it) and the date box (stretched, text centred).
   */
  readonly centerX: number
  /** Row 1's baseline box top, valid only when `dateBlock > 0`. */
  readonly dateTop: number
  /** Row 2's top-left: the stats panel's own origin, which every `statsLayout()` row is relative to. */
  readonly stats: Point
}

/**
 * Where the three rows sit, given the layout they compose.
 *
 * The face and the stats panel are **centred**, not left-aligned, and that is the measured surprise this
 * function exists to carry -- see the module header. Both have an explicit `Width` and no
 * `HorizontalAlignment`, and WPF centres a `Stretch` element that has stopped filling its slot.
 *
 * Row 0's centring uses `content.width`, so it is a no-op for the two faces that stretch (phrase and
 * Split fill the column) and real for the three fixed-size ones. Writing it unconditionally is what makes
 * it one rule rather than a per-face table.
 */
export function windowPlacement(layout: WindowLayout): WindowPlacement {
  return {
    face: {
      x: WINDOW_PADDING + (layout.innerWidth - layout.content.width) / 2,
      y: WINDOW_PADDING,
    },
    centerX: WINDOW_PADDING + layout.innerWidth / 2,
    dateTop: WINDOW_PADDING + layout.content.height + ROW_GAP,
    stats: {
      x: WINDOW_PADDING + (layout.innerWidth - STATS_PANEL_WIDTH) / 2,
      y: WINDOW_PADDING + layout.content.height + layout.dateBlock + ROW_GAP,
    },
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
