/**
 * Font sizes, font families and text line heights, ported from `MainWindow.ApplyFontSize`
 * (:1555-1563), `FontSizeToLcdSize` (:1738-1744) and `SetTextStyle` (:1874-1912).
 *
 * ## The `(int)` casts are the interesting part
 *
 * `ApplyFontSize` derives three sizes from one, and every one of them goes through a C# `(int)` cast:
 *
 * ```csharp
 * QualifierText.FontSize = (int)(size * 0.65);
 * EmphasisText.FontSize  = (int)(size * 1.40);
 * DateText.FontSize      = (int)(size * 0.80);
 * ```
 *
 * `(int)` truncates toward zero, and the products are doubles, so this is not "round to the nearest
 * point". Two measured rows make the difference concrete:
 *
 *  - `24 * 1.40` is `33.599999999999994`, so the emphasis size at fontSize 24 is **33, not 34**. A port
 *    using `Math.round` is a point too big there.
 *  - `45 * 1.40` is `62.99999999999999` -- the exact product *is* 63 and the double lands just under it,
 *    so `(int)` gives **62**. This is the only shape in which the floating-point error changes the
 *    truncated result, and it is measured on the compiled C# rather than argued from IEEE-754: the probe
 *    emits 45 and 90 for exactly this reason. `Math.round` gives 63 here and is wrong.
 *
 * `40 * 0.65` is exactly `26`, incidentally -- an earlier note here claimed otherwise. The qualifier and
 * date factors never hit the case above at any reachable size; only `1.40` does.
 *
 * `Math.trunc` on the raw product is the only rule that gets all of them right, and
 * `text-metrics.test.ts` pins all eight rows from the probe.
 *
 * ## Line heights are measured, and then the measurement is reduced to a formula
 *
 * A WPF `TextBlock`'s height is a property of the font file, not of anything in this repository, and
 * the port has to know it because `MainWindow.xaml` is `SizeToContent="WidthAndHeight"` -- see
 * `layout.ts`. Measured with `Measure()`/`DesiredSize` on the real faces across 26 font sizes each
 * (`test/fixtures/wpf-layout.tsv`):
 *
 * ```
 * idealUnits = round(fontSize * lineSpacing * 300)     // an integer, exact on all 78 rows
 * height     = idealUnits / 300
 * ```
 *
 * where `lineSpacing` is the font's own `(ascent + descent) / unitsPerEm` and `1/300` is WPF's text
 * "ideal unit". The three constants below are those ratios as exact dyadic fractions over 2048, which
 * is why they are written as divisions rather than as decimals: `2724 / 2048` is exact in binary and
 * `1.330078125` typed by hand is one transcription slip away from being wrong in the 9th place.
 *
 * ## Where the agreement is exact and where it is one ulp
 *
 * Measured across all 78 rows rather than at a few points, because a formula that agrees with a table
 * at 4 places and diverges at the 5th is the failure mode a spot check passes. What came back:
 *
 *  - **Every** measured height is an exact multiple of 1/300. The quantisation is real, not a fit.
 *  - **Every** row's integer `idealUnits` agrees -- 78 of 78, exactly. That is the strong claim, and it
 *    is the one `lineHeightIdealUnits` exists to make assertable as an integer.
 *  - The final `/ 300` agrees bit for bit on **43** of 78 and is out by **exactly 1 ulp** on the other
 *    35 (worst absolute 2.84e-14 at Segoe UI Light 100, worst relative 2.17e-16). .NET reaches the same
 *    rational number by a different sequence of divisions, and 1/300 is not representable, so the last
 *    bit is a property of the division order rather than of the model. Nothing downstream can see it:
 *    the value feeds a window height that is then `Math.ceil`ed.
 *
 * So `lineHeight` is compared to the fixture within an ulp and `lineHeightIdealUnits` exactly. Claiming
 * the doubles matched would have been wrong, and stating it that way is cheaper than a test that has to
 * be loosened later for a reason nobody remembers.
 *
 * `fontSize = 64` is in the fixture for its own reason: it is the smallest reachable size where
 * `fontSize * 2724/2048 * 300` lands exactly on `.5`, so it is the only input where a half-to-even rule
 * and a half-away-from-zero rule could disagree. They do not -- the tie is at `25537.5` and both round
 * to the even `25538` -- so `Math.round` is safe here, and this note is the record that the question was
 * asked rather than assumed.
 *
 * **These heights describe WPF on Windows and nothing else.** On macOS and Linux "Segoe UI Light" is
 * absent, the browser falls back down `index.css`'s chain, and the real line height is whatever the
 * substituted face has. So the port uses these numbers to lay out its own SVG consistently, and the
 * renderer measures actual text width with `getComputedTextLength()` where a width decision matters
 * (the phrase-wrap threshold). Height parity with WPF is a Windows-only claim and is not asserted
 * elsewhere.
 */

import type { LcdSize } from "./digit-size.js"
import type { TextStyleName } from "./settings.js"

/** WPF's text "ideal unit": layout heights are whole multiples of 1/300 of a pixel. */
const IDEAL_UNITS_PER_PX = 300

/**
 * `(ascent + descent) / unitsPerEm` for the three faces `SetTextStyle` can select, as exact
 * fractions. Derived from the measured heights in `wpf-layout.tsv` and verified against all of them.
 */
export const LINE_SPACING = {
  "Segoe UI Light": 2724 / 2048,
  "Palatino Linotype": 2763 / 2048,
  Consolas: 2398 / 2048,
} as const

export type WpfFontName = keyof typeof LINE_SPACING

/**
 * `SetTextStyle`'s family selection (:1879-1881), verbatim: Literary is serif, Mono is Consolas, and
 * everything else -- Classic and Split -- is Segoe UI Light.
 */
export function fontNameFor(style: TextStyleName): WpfFontName {
  if (style === "Literary") return "Palatino Linotype"
  if (style === "Mono") return "Consolas"
  return "Segoe UI Light"
}

/**
 * The CSS `font-family` stack for a style.
 *
 * The first entry is the WPF face; the rest are the fallbacks macOS and Linux actually have. This is
 * the same reasoning `index.css` already applies to the default face -- a missing font falls back to
 * whatever the browser picks, which changes the measured width of every string, and a serif style that
 * silently renders sans-serif is a visible parity failure rather than a subtle one.
 */
export function fontStackFor(style: TextStyleName): string {
  switch (fontNameFor(style)) {
    case "Palatino Linotype":
      return '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif'
    case "Consolas":
      return 'Consolas, Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace'
    default:
      return '"Segoe UI Light", "Segoe UI", "Helvetica Neue", "DejaVu Sans", sans-serif'
  }
}

/**
 * A single-line `TextBlock`'s height in WPF ideal units -- a whole number of 1/300ths of a pixel.
 *
 * This is the integer WPF actually lays out in, and it agrees with all 78 measured rows exactly. Prefer
 * it when summing several lines: adding integers and dividing once at the end cannot accumulate the
 * per-line rounding that summing the divided values can.
 */
export function lineHeightIdealUnits(font: WpfFontName, fontSize: number): number {
  return Math.round(fontSize * LINE_SPACING[font] * IDEAL_UNITS_PER_PX)
}

/**
 * A WPF single-line `TextBlock`'s height in pixels for a face and size.
 *
 * Agrees with the measured value to within 1 ulp; see the header for which rows and why.
 */
export function lineHeight(font: WpfFontName, fontSize: number): number {
  return lineHeightIdealUnits(font, fontSize) / IDEAL_UNITS_PER_PX
}

/** The four text sizes `ApplyFontSize` sets, from the one the user chose. */
export interface DerivedFontSizes {
  readonly phrase: number
  readonly qualifier: number
  readonly emphasis: number
  readonly date: number
}

/** `ApplyFontSize` (:1555-1563). `Math.trunc` is C#'s `(int)`; see the header for why it matters. */
export function deriveFontSizes(fontSize: number): DerivedFontSizes {
  return {
    phrase: fontSize,
    qualifier: Math.trunc(fontSize * 0.65),
    emphasis: Math.trunc(fontSize * 1.4),
    date: Math.trunc(fontSize * 0.8),
  }
}

/**
 * `FontSizeToLcdSize` (:1738-1744), including its `_ => Large` arm.
 *
 * The C# switches on the exact four menu values and sends everything else to Large, so 40pt caps at
 * Large (64px segments) and there is no XLarge tier. A settings file holding 100 lands in the same
 * arm, which is why the default is `large` rather than an interpolation.
 */
export function fontSizeToLcdSize(fontSize: number): LcdSize {
  switch (fontSize) {
    case 16:
      return "small"
    case 24:
      return "medium"
    default:
      return "large"
  }
}

/** `StatsPanel.Width` from MainWindow.xaml:164, and `ApplyPhraseWrap`'s fallback when it is hidden. */
export const STATS_PANEL_WIDTH = 184

/**
 * `ApplyPhraseWrap`'s threshold (:1069-1071): the phrase wraps once it is wider than 110% of the
 * stats panel's width, whether the panel is on screen or not.
 *
 * Kept as a function of the width rather than as a constant because the C# reads
 * `StatsPanel.ActualWidth` when the panel is visible, and an `ActualWidth` is not necessarily the
 * declared 184 -- a panel laid out narrower than its content asks for reports what it got.
 */
export function wrapThreshold(panelWidth: number): number {
  return panelWidth * 1.1
}
