/**
 * What to display, decided without touching the DOM.
 *
 * ## Why this module exists rather than the renderer just doing it
 *
 * There is no DOM test library in this project -- `electron/package.json`'s devDependencies are
 * `@types/bun`, `@types/node`, `electron`, `electron-builder` and `typescript`, and nothing else. So a
 * renderer that decided *and* painted in the same function would have its decisions provable only by
 * launching the app. Everything here is therefore a pure function over `(now, settings)` returning data,
 * the faces in `src/renderer/faces/` do nothing but write that data into elements, and the painting is
 * proven separately by `scripts/probe-display.ts` reading the live DOM back over CDP.
 *
 * The split is not cosmetic. Face selection, the wrap decision, the LCD slot mapping, the colon phase and
 * the Nixie's 12-hour rule are all places the C# does something a reimplementation would get wrong by
 * being reasonable, and each of them is a table of values a test can pin exactly.
 *
 * ## One WPF behaviour is reproduced as a divergence rather than as parity
 *
 * `SetTextStyle` (`MainWindow.xaml.cs:1893-1899`) guards its visibility block with
 * `if (_clockType != ClockType.Dial)` only. So changing the text style while the LCD or Nixie face is
 * showing makes a phrase element `Visible` **without** collapsing the digit view -- two faces painted over
 * each other until the next `SetClockType`. `wpfVisibleFaces` records that; `activeFace` is the port's
 * rule and returns exactly one. See those two functions.
 */

import { computeSplit } from "./phrase-wrap.js"
import { formatLcdTime } from "./lcd-time-format.js"
import { hourAngleDegrees, minuteAngleDegrees } from "./dial.js"
import { STATS_PANEL_WIDTH, wrapThreshold } from "./text-metrics.js"
import type { AppSettings, ClockType, TextStyleName } from "./settings.js"

/**
 * The five mutually-exclusive display areas.
 *
 * Five and not four, because `ClockType.Phrase` has two: `PhraseText` for the inline styles and
 * `SplitPhrasePanel` for Split. The C# treats them as separate elements with separate visibilities and so
 * does this.
 */
export type Face = "phrase" | "split" | "dial" | "lcd" | "nixie"

export const FACES: readonly Face[] = ["phrase", "split", "dial", "lcd", "nixie"]

/** The `<g>` id each face lives in. Must agree with `index.html`; `renderer-ids.test.ts` asserts it. */
export const FACE_CONTAINER_IDS: Readonly<Record<Face, string>> = {
  phrase: "phraseFace",
  split: "splitFace",
  dial: "dialFace",
  lcd: "lcdFace",
  nixie: "nixieFace",
}

/**
 * The one face the port shows, from `SetClockType` (`MainWindow.xaml.cs:1698-1734`).
 *
 * `SetClockType` collapses all five and then makes exactly one visible, so this is the state the app
 * settles into after any clock-type change -- and the state the port holds at all times.
 */
export function activeFace(settings: AppSettings): Face {
  switch (settings.clockType) {
    case "dial":
      return "dial"
    case "lcd":
      return "lcd"
    case "nixie":
      return "nixie"
    default:
      return settings.textStyle === "Split" ? "split" : "phrase"
  }
}

/**
 * What WPF actually has visible after a `SetTextStyle` call, which is not always one thing.
 *
 * The guard at `:1895` is `if (_clockType != ClockType.Dial)`, so with the LCD or Nixie face showing, a
 * text-style change turns a phrase element on and leaves the digit view on too. The user sees the clock
 * with a phrase drawn over it, and it persists until something calls `SetClockType` again.
 *
 * Recorded here, asserted in the tests, and **deliberately not reproduced**: `activeFace` is the port's
 * rule. A faithful port of this would be a faithful port of a bug, and the port's own structure -- one
 * function returning one face -- cannot express it anyway. Writing it down is what makes that a decision
 * rather than a gap.
 */
export function wpfVisibleFaces(clockType: ClockType, textStyle: TextStyleName): readonly Face[] {
  // Dial is the only guarded case: the block does not run, so the dial stays alone.
  if (clockType === "dial") return ["dial"]
  const phraseSide: Face = textStyle === "Split" ? "split" : "phrase"
  if (clockType === "lcd") return [phraseSide, "lcd"]
  if (clockType === "nixie") return [phraseSide, "nixie"]
  return [phraseSide]
}

/** What `phraseLines` needs to know that is not in `AppSettings`. */
export interface PhraseLinesContext {
  readonly settings: AppSettings
  /**
   * The phrase's rendered width on one line, from `getComputedTextLength()`.
   *
   * The C# measures `PhraseText.ActualWidth` after a layout pass and compares it to the threshold, so the
   * decision genuinely needs a measurement -- there is no way to derive it, because it depends on which
   * font the platform resolved.
   */
  readonly measuredWidth: number
  /** The locale the engine settled on, for the `en-` test below. */
  readonly resolvedLocale: string
  /** `StatsPanel.ActualWidth` when visible, else the C#'s literal 184 fallback. */
  readonly panelWidth?: number
}

/**
 * `ApplyPhraseWrap` (`MainWindow.xaml.cs:1059-1088`), as one or two lines.
 *
 * Four things here are the C#'s and not the obvious choice:
 *
 *  1. **Three guards, any of which forces one line**: not the phrase clock type, the Split text style, or
 *     wrap disabled. Split is guarded because it has its own two-element layout -- wrapping it as well
 *     would give four lines.
 *  2. **The threshold is `panelWidth * 1.1`, and `panelWidth` is 184 whether the panel is visible or
 *     not.** `StatsPanel` has `Width="184"` in the markup, so `ActualWidth` is 184 when it is visible and
 *     the `else` arm hardcodes 184.0 when it is not. The `?? STATS_PANEL_WIDTH` default below is
 *     therefore the whole behaviour, not a fallback -- 202.4px in every reachable state.
 *  3. **`allowNatural` is `CurrentLocale.StartsWith("en-")`, with the hyphen.** So `en-US` and `en-GB`
 *     get the pause-marker split and a bare `en` would not. The markers are English words; a hyphen-less
 *     `en` is not a locale the engine's tables contain, but the ordinal prefix test is what the C# does
 *     and reproducing it means reproducing the hyphen.
 *  4. **A null split leaves the single line in place.** `ComputeSplit` returns null for a one-word phrase,
 *     and the C# only replaces the inlines `if (split.HasValue)`. So a long single word stays long rather
 *     than being broken mid-word.
 */
export function phraseLines(raw: string, context: PhraseLinesContext): readonly string[] {
  const { settings } = context
  if (settings.clockType !== "phrase" || settings.textStyle === "Split" || !settings.phraseWrapEnabled) {
    return [raw]
  }

  const threshold = wrapThreshold(context.panelWidth ?? STATS_PANEL_WIDTH)
  if (context.measuredWidth <= threshold) return [raw]

  const allowNatural = context.resolvedLocale.startsWith("en-")
  const split = computeSplit(raw, settings.phraseWrapStyle, allowNatural)
  return split === null ? [raw] : [split.line1, split.line2]
}

/**
 * A blinking colon starts **dark**, and that is the C# rather than a coin toss.
 *
 * `LcdClockView` has `private bool _colonVisible = true`, and `UpdateTime` does
 * `_colonVisible = !_colonVisible` **before** assigning it. The first painted frame is therefore
 * `ColonOn = false`. Worth a named constant because the first frame is what a screenshot test captures
 * and what a user sees on launch, and the opposite choice looks equally correct in isolation.
 */
export const FIRST_FRAME_COLON1_ON = false

/**
 * The seconds colon never blinks and is never dark.
 *
 * `UpdateTime` assigns `Colon1.ColonOn` every tick and **never assigns `Colon2.ColonOn` at all**, so
 * Colon2 keeps the value `ColonOnProperty` was registered with --
 * `new PropertyMetadata(true, OnVisualPropertyChanged)` (`SevenSegmentDigit.xaml.cs:45-47`). Lit, always.
 * So the first frame is Colon1 dark and Colon2 lit, which reads as a rendering bug and is the shipped
 * behaviour.
 */
export const COLON2_ALWAYS_ON = true

/** One LCD slot: the character to encode, and for a colon whether its dots are lit or ghosted. */
export interface LcdSlot {
  readonly character: string
  /** `null` for a digit slot; a boolean only for the two colons. */
  readonly colonOn: boolean | null
}

export interface LcdPlan {
  /** `D0 D1 Colon1 D2 D3 [Colon2 D4 D5]` -- six entries without seconds, eight with. */
  readonly slots: readonly LcdSlot[]
  /** The formatted string the slots were read out of, for the tests and for the probe. */
  readonly time: string
}

/**
 * `LcdClockView.UpdateTime`, as data.
 *
 * The slot mapping is the part worth pinning: the view reads `time[0] time[1] _ time[3] time[4]` and
 * `time[6] time[7]`, **skipping the colons in the string** rather than consuming them, because the colon
 * slots carry `Character=":"` from `LcdClockView.xaml` and are never assigned. Indexing straight through
 * the string instead would put a colon glyph in a digit slot at every size.
 *
 * `ShowSeconds=false` collapses `Colon2`, `D4` and `D5` -- and `Collapsed` is what takes them out of the
 * StackPanel's width, which is why `lcdViewSize` counts four digits and one colon there. Omitting them
 * from the array is the same fact.
 *
 * @param colon1On the blink phase; the caller owns the toggle, because it is per-tick state and this is a
 *   pure function. Frame one is {@link FIRST_FRAME_COLON1_ON}.
 */
export function lcdPlan(now: Date, settings: AppSettings, colon1On: boolean): LcdPlan {
  const time = formatLcdTime(now, settings.lcdUse24Hr, settings.lcdShowSeconds)
  const at = (index: number): string => time.charAt(index)

  const slots: LcdSlot[] = [
    { character: at(0), colonOn: null },
    { character: at(1), colonOn: null },
    { character: ":", colonOn: colon1On },
    { character: at(3), colonOn: null },
    { character: at(4), colonOn: null },
  ]
  if (settings.lcdShowSeconds) {
    slots.push(
      { character: ":", colonOn: COLON2_ALWAYS_ON },
      { character: at(6), colonOn: null },
      { character: at(7), colonOn: null },
    )
  }
  return { slots, time }
}

/**
 * `NixieClockView.UpdateTime`: four digits, **always 12-hour, never seconds**.
 *
 * The view ignores `Use24Hr` and `ShowSeconds` entirely -- it has neither property. Its body is
 * `int h = now.Hour % 12; if (h == 0) h = 12;` and then four digit assignments, so a settings file with
 * `lcdUse24Hr` true renders 12-hour on the Nixie face and 24-hour on the LCD face. Not a bug this port
 * gets to fix: the two faces genuinely disagree in the shipped app, and matching that is the parity bar.
 *
 * Note `h / 10` is integer division in C# and gives a **leading zero** at 1-9 o'clock -- `01:05`, not
 * ` 1:05`. The LCD face pads with a space in 12-hour mode and this one does not, which is the second
 * disagreement between them.
 */
export function nixieDigits(now: Date): readonly [number, number, number, number] {
  const hour12 = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12
  const minute = now.getMinutes()
  return [Math.trunc(hour12 / 10), hour12 % 10, Math.trunc(minute / 10), minute % 10]
}

export interface DialPlan {
  readonly hourAngle: number
  readonly minuteAngle: number
}

/**
 * `UpdateDialDisplay` (`MainWindow.xaml.cs:2193`), as the two angles.
 *
 * The C# converts each angle to an endpoint and assigns `HourHand.X2`/`Y2`. This port rotates instead --
 * `handTransform(degrees)` on a hand drawn straight up -- because a `transform` is the one property the
 * compositor can animate without re-laying-out the SVG, and the dial ticks once a second. The two agree
 * exactly, which `dial-geometry.ts`'s `rotateUpwardPoint` exists to prove: rotating `(0, -L)` about the
 * centre by the same angle lands on the C#'s `(40 + L·sin, 40 - L·cos)`.
 *
 * `hour` is the raw 24-hour value; `hourAngleDegrees` folds it with `% 12` and adds the intra-hour sweep,
 * so 13:30 and 01:30 give the same angle and both hands move continuously.
 */
export function dialPlan(now: Date): DialPlan {
  return {
    hourAngle: hourAngleDegrees(now.getHours(), now.getMinutes()),
    minuteAngle: minuteAngleDegrees(now.getMinutes()),
  }
}
