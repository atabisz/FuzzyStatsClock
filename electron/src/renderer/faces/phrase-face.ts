/**
 * The two text faces: the inline phrase, and Split's qualifier-over-emphasis pair.
 *
 * Two factories in one module because they share the engine, the font logic and the change-detection rule,
 * and differ only in how many elements they paint. `ClockType.Phrase` has two containers in the C# --
 * `PhraseText` and `SplitPhrasePanel`, with separate visibilities -- which is why `Face` has five members
 * and not four.
 *
 * ## Only these faces implement `measure()`, and the renderer must call it before resizing
 *
 * A string's rendered width depends on which font the platform actually resolved, so it cannot be derived
 * -- `layout.ts`'s `contentSize` takes it as a parameter for exactly this reason. `tick` records the width
 * it measured and `measure()` hands it back without doing any work, so the renderer's order is: tick, then
 * measure, then `windowLayout`, then resize. Sizing first would use a phrase width of 0, and a phrase
 * window with no measured text is legitimately 24 wide -- both paddings -- so the visible symptom is a 24px
 * sliver for one frame rather than a wrong-by-a-little window.
 *
 * ## The wrap decision needs a real layout pass, and gets one for free
 *
 * `ApplyPhraseWrap` sets the single line, calls `UpdateLayout()`, reads `PhraseText.ActualWidth`, and only
 * then decides. This face does the same three steps: it writes the whole phrase to line 1 with line 2
 * hidden, reads `getComputedTextLength()` -- which forces a synchronous layout in Blink, so it is the
 * `UpdateLayout()` equivalent and not an approximation of one -- and passes the result to `phraseLines`.
 *
 * That forced layout is why the segment gate matters. `getSegmentKey` changes once per five-minute bucket,
 * so the measurement happens a few times an hour, not once a second.
 *
 * **Measure per `<tspan>`, never on the parent `<text>`.** `getComputedTextLength()` on a `<text>` sums the
 * advances of every character it contains, so a wrapped phrase would report the two lines added end to end
 * -- wider than either line and wider than the unwrapped phrase that triggered the wrap. The window would
 * then grow on wrapping instead of shrinking.
 *
 * ## Which settings force a repaint, taken from the C# rather than from what seems safe
 *
 * Exactly four assignments clear `_lastSegmentKey`: `SetPhraseStyle` (:1798), `SetLanguage` (:1808),
 * `SetPhraseWrapEnabled` (:1817) and `SetPhraseWrapStyle` (:1826). **`ApplyFontSize` and `SetTextStyle` do
 * not** -- both change the rendered width of the phrase and neither re-runs the wrap decision, so in the
 * shipped app raising the font size leaves an over-wide phrase unwrapped for up to five minutes. Verified
 * by reading all six methods, not assumed from the two that do.
 *
 * The port reproduces that, and the reproduction is only possible because the two `<tspan>` elements are
 * built once and never rebuilt: a font change rewrites `font-size` and line 2's `dy` in place. Had a font
 * change recreated them, the phrase would have gone blank until the next bucket, and the port would have
 * had to reset the gate -- accidentally fixing the defect while appearing to be a faithful translation.
 * Building once is what keeps that a decision.
 *
 * ## One gate per face here, one shared gate in the C#
 *
 * `UpdatePhraseIfChanged` has a single `_lastSegmentKey` and assigns *both* representations under it --
 * `PhraseText.Text` and the qualifier/emphasis pair -- with the C#'s own note that the hidden one costs
 * nothing. Each face here holds its own, reset by `activate(true)`, so the face being switched to repaints
 * on its next tick. Same observable behaviour, because `activeFace` guarantees only one is visible.
 */

import { FACE_CONTAINER_IDS, phraseLines } from "../../core/display-plan.js"
import { deriveFontSizes, fontNameFor, fontStackFor, lineHeight } from "../../core/text-metrics.js"
import { phraseEngine } from "../../core/phrase/engine.js"
import type { AppSettings } from "../../core/settings.js"
import { element, setAttr, setText, setVisible, svgEl } from "../svg.js"
import { structureGate, type ClockFace, type FaceContext, type FaceMeasurement } from "./face.js"

/** `#phrase`'s two line children. Classes, never ids -- they are built here, not authored in the markup. */
export const PHRASE_LINE_CLASS = "phraseLine"

/**
 * The four settings whose change clears `_lastSegmentKey` in the C#.
 *
 * Exported as data so the omissions are assertable: `fontSize` and `textStyle` are absent on purpose, and a
 * future edit adding them would be changing behaviour rather than tidying a list.
 */
export const PHRASE_REPAINT_SETTING_KEYS = [
  "phraseStyle",
  "phraseLocale",
  "phraseWrapEnabled",
  "phraseWrapStyle",
] as const

/** The repaint gate's key: the four settings above, in order. */
function repaintKey(settings: AppSettings): string {
  return PHRASE_REPAINT_SETTING_KEYS.map((name) => String(settings[name])).join("/")
}

/**
 * The inline phrase: one `<text id="phrase">` holding one or two `<tspan>` lines.
 *
 * Line 2 exists from the first rebuild and is hidden until a wrap needs it. Creating it on demand would put
 * an element creation inside `tick`, which is the boundary `face.ts` draws -- and it would also mean the
 * one frame that first wraps is the one frame that allocates.
 */
export function createPhraseFace(): ClockFace {
  const container = element<SVGGElement>(FACE_CONTAINER_IDS.phrase)
  const text = element<SVGTextElement>("phrase")
  const gate = structureGate()
  const repaintGate = structureGate()

  let line1: SVGTSpanElement | null = null
  let line2: SVGTSpanElement | null = null
  let settings: AppSettings | null = null
  let lastSegmentKey: string | null = null
  let measured: FaceMeasurement = { width: 0, lines: 1 }

  const build = (): void => {
    // `x="0"` on both, with the centring carried by a `transform` on the parent `<text>`: a `<tspan>` with
    // no `x` continues the previous line's text position, which for line 2 is the END of line 1. So the `x`
    // is not optional, and putting the centring in the transform is what stops it having to be recomputed
    // on this element every time the measured width changes.
    const spans = [0, 1].map((index) =>
      svgEl("tspan", {
        class: PHRASE_LINE_CLASS,
        x: 0,
        // Written per span rather than inherited from the stylesheet, so the probe reads the value off the
        // element it is asserting about instead of resolving a cascade.
        "dominant-baseline": "text-before-edge",
        ...(index === 1 ? { display: "none" } : {}),
      }),
    )
    text.replaceChildren(...spans)
    line1 = spans[0] ?? null
    line2 = spans[1] ?? null
  }

  return {
    face: "phrase",

    rebuild(context: FaceContext): void {
      settings = context.settings
      if (gate("phrase")) build()
      const sizes = deriveFontSizes(context.settings.fontSize)
      setAttr(text, "font-family", fontStackFor(context.settings.textStyle))
      setAttr(text, "font-size", sizes.phrase)
      // Line 2 sits one line height below line 1. `dy` and not a second `y`, because `dy` is relative to
      // the current text position and so survives the parent's `y` moving when a row above it resizes.
      if (line2 !== null) setAttr(line2, "dy", lineHeight(fontNameFor(context.settings.textStyle), sizes.phrase))
      if (repaintGate(repaintKey(context.settings))) lastSegmentKey = null
    },

    tick(now: Date): void {
      if (settings === null || line1 === null || line2 === null) {
        throw new Error("phrase face ticked before rebuild")
      }
      const segmentKey = phraseEngine.getSegmentKey(now)
      if (segmentKey === lastSegmentKey) return
      lastSegmentKey = segmentKey

      const raw = phraseEngine.getPhrase(now)
      // Single line first, line 2 out of the box: this is what makes the measurement below the width of the
      // WHOLE phrase, which is the number `ApplyPhraseWrap` compares to its threshold.
      setText(line1, raw)
      setText(line2, "")
      setVisible(line2, false)

      const singleLineWidth = line1.getComputedTextLength()
      const lines = phraseLines(raw, {
        settings,
        measuredWidth: singleLineWidth,
        // `allowNatural` is `CurrentLocale.StartsWith("en-")`, so it reads the locale the engine SETTLED on
        // and not the one the settings asked for -- `setLocale` rejects an unregistered key and keeps the
        // previous locale, and this is the side of that the wrap decision has to see.
        resolvedLocale: phraseEngine.currentLocale,
      })

      const second = lines[1]
      if (second === undefined) {
        measured = { width: singleLineWidth, lines: 1 }
        return
      }
      setText(line1, lines[0] ?? raw)
      setText(line2, second)
      setVisible(line2, true)
      // The wider of the two lines, measured after the split. Not `singleLineWidth`, which is the width the
      // wrap was meant to get rid of, and not the parent `<text>`, which sums both -- see the header.
      measured = {
        width: Math.max(line1.getComputedTextLength(), line2.getComputedTextLength()),
        lines: 2,
      }
    },

    activate(active: boolean): void {
      setVisible(container, active)
      // Forget the bucket rather than painting here: the next tick is at most a second away and does the
      // work in the one place that is allowed to. The C#'s `IsVisibleChanged` comment -- "Do NOT call
      // UpdateTime() here" -- is the same rule from the other direction.
      if (active) lastSegmentKey = null
    },

    measure(): FaceMeasurement {
      return measured
    },
  }
}

/**
 * Split: `#qualifier` above `#emphasis`, in a vertical stack that never wraps.
 *
 * Split is the second of `ApplyPhraseWrap`'s three guards, so there is no measurement-driven decision here
 * at all -- `measure()` still exists because `contentSize` needs the width, but `lines` is always 1: the
 * two rows are the *content*, and `contentSize` adds their two line heights itself rather than multiplying
 * one of them.
 */
export function createSplitFace(): ClockFace {
  const container = element<SVGGElement>(FACE_CONTAINER_IDS.split)
  const qualifier = element<SVGTextElement>("qualifier")
  const emphasis = element<SVGTextElement>("emphasis")
  const repaintGate = structureGate()

  let lastSegmentKey: string | null = null
  let measured: FaceMeasurement = { width: 0, lines: 1 }

  return {
    face: "split",

    rebuild(context: FaceContext): void {
      const sizes = deriveFontSizes(context.settings.fontSize)
      const family = fontStackFor(context.settings.textStyle)
      const font = fontNameFor(context.settings.textStyle)
      setAttr(qualifier, "font-family", family)
      setAttr(qualifier, "font-size", sizes.qualifier)
      setAttr(emphasis, "font-family", family)
      setAttr(emphasis, "font-size", sizes.emphasis)
      // A StackPanel's second child starts where the first ends. With `dominant-baseline:
      // text-before-edge` both `y` values are line-box tops, so the emphasis row's top is the qualifier's
      // height -- the same sum `contentSize` returns for this face, from the same function.
      setAttr(qualifier, "y", 0)
      setAttr(emphasis, "y", lineHeight(font, sizes.qualifier))
      if (repaintGate(repaintKey(context.settings))) lastSegmentKey = null
    },

    tick(now: Date): void {
      const segmentKey = phraseEngine.getSegmentKey(now)
      if (segmentKey === lastSegmentKey) return
      lastSegmentKey = segmentKey
      const structured = phraseEngine.getStructuredPhrase(now)
      setText(qualifier, structured.qualifier)
      setText(emphasis, structured.emphasis)
      measured = {
        width: Math.max(qualifier.getComputedTextLength(), emphasis.getComputedTextLength()),
        lines: 1,
      }
    },

    activate(active: boolean): void {
      setVisible(container, active)
      if (active) lastSegmentKey = null
    },

    measure(): FaceMeasurement {
      return measured
    },
  }
}
