/**
 * The Nixie tubes: four glass tubes and a colon panel between them.
 *
 * ## One `<path>` in `<defs>` and four `<use>`, per tube
 *
 * `UpdateDisplay` assigns the *same* transformed geometry to all four glow `Path`s -- the bloom is four
 * copies of one curve at decreasing stroke widths, not four different curves. So the port keeps one
 * `<path id="nixieGlyphN">` per tube in `<defs>` and four `<use href>` pointing at it: a digit change is one
 * `d` write and one `transform` write instead of eight, and the 40 ms flicker touches nothing but `opacity`.
 *
 * `stroke`, `stroke-width`, `fill` and the two `stroke-linecap`/`stroke-linejoin` values are all inherited
 * presentation properties, so they cascade from the `<use>` into the referenced geometry. That is what makes
 * the four copies differ while sharing one path. The two round-cap values and `fill: none` come from
 * `.nixieGlow` in `index.css` and **must not** be `stroke` or `stroke-width` there -- a CSS declaration
 * beats a presentation attribute, so styling those in the stylesheet would silently flatten all four layers
 * into one width.
 *
 * The glyph paths have to live in `<defs>` and not in the tube group. A `<use>` renders nothing when its
 * referenced element has `display: none`, so hiding the template that way is not available; `<defs>` is the
 * one container whose contents are referenceable without being painted.
 *
 * ## The ghosts are ten real paths and cannot share the template
 *
 * All ten cathodes are visible at once -- that depth stack is what makes a tube read as a tube -- so each
 * ghost carries its own `d` and its own `transform(index)`. They are built once and never rewritten: the
 * stack does not depend on which digit is lit.
 *
 * ## One shared 40 ms interval, four independent flickers -- a documented divergence
 *
 * The C# gives every `NixieDigit` its own `DispatcherTimer`, each started when that digit last changed, so
 * the four timers drift into arbitrary relative phase. This face runs a single interval and holds the
 * flicker state per tube, so the four *steps* land together while the random targets stay independent. The
 * amplitude behaviour is identical -- each tube still draws its own `flickerTarget` and its own
 * `flickerDelayMs` -- and what is lost is sub-40 ms phase offset between tubes, which is below the interval
 * that produces the effect in the first place. Four intervals would be the faithful version and buys
 * nothing; this is a choice, recorded here so it is not read as an oversight.
 *
 * ## The tubes ignore the accent
 *
 * Every colour in `NixieDigit` is a literal `FromArgb` in `RebuildGeometry` -- the orange is the tube's, not
 * the theme's -- and none of the five ids in `display-colors.ts` is inside this face. So `rebuild` uses
 * `context.settings` and never `context.theme`, and changing the accent leaves a Nixie clock unchanged.
 * That is the shipped behaviour and the reason this face takes no colour from the theme at all.
 */

import {
  DIGIT_PATHS,
  FLICKER_INTERVAL_MS,
  GHOST_STROKE,
  GLOW_LAYER_COLORS,
  HIGHLIGHT_FILL,
  TUBE_FILL,
  TUBE_STROKE,
  TUBE_STROKE_WIDTH,
  WIRE_STROKE,
  WIRE_STROKE_WIDTH,
  buildNixieDigit,
  flickerDelayMs,
  flickerStep,
  flickerTarget,
  glowOpacity,
  nixieColonPanel,
  nixieTransform,
  type NixieGeometry,
} from "../../core/nixie-geometry.js"
import { FACE_CONTAINER_IDS, nixieDigits } from "../../core/display-plan.js"
import { lcdDigitSize } from "../../core/layout.js"
import { toDigitHeight } from "../../core/digit-size.js"
import { element, replaceChildren, setAttr, setVisible, svgEl } from "../svg.js"
import { structureGate, type ClockFace, type FaceContext } from "./face.js"

/**
 * The four `<defs>` glyph templates, one per tube.
 *
 * Static in `index.html`, and exported so `renderer-ids.test.ts` can add them to the id contract: these
 * are two of the seven sets that make up the 46, and they live here rather than in `display-colors.ts`
 * because this is the only module that references them. Worth covering because a `<use>` whose target is
 * missing renders nothing at all, with no error anywhere -- a typo'd id here is a blank clock.
 */
export const NIXIE_GLYPH_IDS = ["nixieGlyph0", "nixieGlyph1", "nixieGlyph2", "nixieGlyph3"] as const

/**
 * The `<radialGradient>` both colon dots are filled with. Static in `index.html`.
 *
 * Not a `STRUCTURAL_IDS` member: that set is documented as ids carrying no colour of their own, and this
 * one is nothing but colour.
 */
export const NIXIE_COLON_GRADIENT_ID = "nixieColonGlow"

interface Tube {
  /** The `<defs>` template this tube's four `<use>` elements reference. */
  readonly glyph: SVGPathElement
  /** Reassigned by a rebuild, which discards the previous four. */
  glows: readonly SVGUseElement[]
  /** `ActiveDigit`, or -1 before the first tick -- the value `UpdateDisplay` treats as "nothing lit". */
  digit: number
  flickerCurrent: number
  flickerTarget: number
  /** `_flickerNextChange`, on the `performance.now()` clock. */
  nextChangeAt: number
}

export function createNixieFace(): ClockFace {
  const container = element<SVGGElement>(FACE_CONTAINER_IDS.nixie)
  const gate = structureGate()
  const tubes: Tube[] = NIXIE_GLYPH_IDS.map((glyphId) => ({
    glyph: element<SVGPathElement>(glyphId),
    glows: [],
    digit: -1,
    flickerCurrent: 1.0,
    flickerTarget: 1.0,
    nextChangeAt: 0,
  }))
  let geometry: NixieGeometry | null = null
  let flickerTimer: ReturnType<typeof setInterval> | null = null

  /** One tube's static children, in `RebuildGeometry`'s order: body, highlight, wires, ghosts, glows. */
  const buildTube = (tube: Tube, g: NixieGeometry, x: number): SVGGElement => {
    const group = svgEl("g", { class: "nixieTube", transform: `translate(${String(x)} 0)` })
    group.append(
      svgEl("rect", {
        class: "nixieBody",
        x: 0,
        y: 0,
        width: g.width,
        height: g.height,
        rx: g.tubeRadius,
        ry: g.tubeRadius,
        fill: TUBE_FILL,
        stroke: TUBE_STROKE,
        "stroke-width": TUBE_STROKE_WIDTH,
      }),
      svgEl("rect", {
        class: "nixieHighlight",
        x: 0,
        y: 0,
        width: g.width,
        height: g.highlightHeight,
        rx: g.highlightRadius,
        ry: g.highlightRadius,
        fill: HIGHLIGHT_FILL,
      }),
      ...g.wires.map((wire) =>
        svgEl("line", {
          class: "nixieWire",
          x1: wire.x1,
          y1: wire.y,
          x2: wire.x2,
          y2: wire.y,
          stroke: WIRE_STROKE,
          "stroke-width": WIRE_STROKE_WIDTH,
        }),
      ),
      ...DIGIT_PATHS.map((d, index) =>
        svgEl("path", {
          class: "nixieGhost",
          d,
          transform: nixieTransform(g, index),
          stroke: GHOST_STROKE,
          "stroke-width": g.baseStroke,
        }),
      ),
    )
    const glows = g.glowStrokeWidths.map((strokeWidth, layer) => {
      const color = GLOW_LAYER_COLORS[layer]
      if (color === undefined) throw new RangeError(`no glow colour for layer ${String(layer)}`)
      return svgEl("use", {
        class: "nixieGlow",
        href: `#${tube.glyph.id}`,
        stroke: color,
        "stroke-width": strokeWidth,
        // `Visibility.Collapsed` until `UpdateDisplay` runs, and `opacity` at the unmultiplied base --
        // `RebuildGeometry` sets both before any flicker tick.
        opacity: glowOpacity(layer, 1.0),
        display: "none",
      })
    })
    group.append(...glows)
    tube.glows = glows
    return group
  }

  const buildColonPanel = (panel: ReturnType<typeof nixieColonPanel>, x: number): SVGGElement => {
    const group = svgEl("g", { class: "nixieColon", transform: `translate(${String(x)} 0)` })
    const radius = panel.dotSize / 2
    // A `<circle>` at the centre rather than an `<ellipse>` at the corner: the WPF `Ellipse` is square at
    // every size, since `OnSizeChanged` pushes one `dotSize` into both `Width` and `Height`.
    group.append(
      ...[panel.dot1Y, panel.dot2Y].map((y) =>
        svgEl("circle", {
          class: "nixieColonDot",
          cx: panel.dotX + radius,
          cy: y + radius,
          r: radius,
          fill: `url(#${NIXIE_COLON_GRADIENT_ID})`,
        }),
      ),
    )
    return group
  }

  const build = (settings: FaceContext["settings"]): void => {
    const digitHeight = toDigitHeight(lcdDigitSize(settings))
    const g = buildNixieDigit(digitHeight)
    const panel = nixieColonPanel(digitHeight, g.height)
    geometry = g

    // `D0 D1 [ColonPanel] D2 D3`, so the panel's width shifts the second pair. The offsets are accumulated
    // rather than written as multiples, because `nixieViewSize` sums the same five boxes and the two must
    // agree exactly or the last tube sits outside the window.
    const groups: SVGGElement[] = []
    let x = 0
    for (const [index, tube] of tubes.entries()) {
      if (index === 2) {
        groups.push(buildColonPanel(panel, x))
        x += panel.width
      }
      groups.push(buildTube(tube, g, x))
      x += g.width
      // A rebuild discards the old `<use>` elements, so nothing lit survives it. -1 is what makes the next
      // tick rewrite `d` and show the glows again rather than skipping as unchanged.
      tube.digit = -1
    }
    replaceChildren(container, groups)
  }

  /** `OnFlickerTick`, for all four tubes at once. Writes `opacity` and nothing else. */
  const flickerTick = (): void => {
    const now = performance.now()
    for (const tube of tubes) {
      if (tube.digit < 0) continue
      if (now >= tube.nextChangeAt) {
        tube.flickerTarget = flickerTarget(Math.random())
        tube.nextChangeAt = now + flickerDelayMs(Math.random())
      }
      tube.flickerCurrent = flickerStep(tube.flickerCurrent, tube.flickerTarget)
      for (const [layer, glow] of tube.glows.entries()) {
        setAttr(glow, "opacity", glowOpacity(layer, tube.flickerCurrent))
      }
    }
  }

  return {
    face: "nixie",

    rebuild(context: FaceContext): void {
      // The digit tier is the only thing that changes these elements. `context.theme` is deliberately
      // unread -- see the module header.
      if (gate(String(lcdDigitSize(context.settings)))) build(context.settings)
    },

    tick(now: Date): void {
      const g = geometry
      if (g === null) throw new Error("nixie face ticked before rebuild")
      const digits = nixieDigits(now)
      for (const [index, tube] of tubes.entries()) {
        const digit = digits[index]
        if (digit === undefined || digit === tube.digit) continue
        const d = DIGIT_PATHS[digit]
        if (d === undefined) throw new RangeError(`no cathode path for digit ${String(digit)}`)
        tube.digit = digit
        // The template moves, not the four `<use>` elements: `_scaledGeometries[digit]` already carries the
        // depth offset for that cathode, so the lit glyph sits exactly over its own ghost.
        setAttr(tube.glyph, "d", d)
        setAttr(tube.glyph, "transform", nixieTransform(g, digit))
        // `UpdateDisplay` resets the flicker to 1.0 on every digit change, so a tube flashes to full
        // brightness as it switches. Only on change -- the hour-tens tube therefore holds a settled flicker
        // for an hour at a time, which is the difference this `continue` above is protecting.
        tube.flickerCurrent = 1.0
        tube.flickerTarget = 1.0
        tube.nextChangeAt = 0
        for (const glow of tube.glows) setVisible(glow, true)
      }
    },

    activate(active: boolean): void {
      setVisible(container, active)
      // `IsVisibleChanged` starts and stops the flicker with visibility. Sixteen `opacity` writes every
      // 40 ms is the app's largest steady-state cost, and leaving it running behind a hidden face would pay
      // it for a clock nobody is looking at.
      if (active && flickerTimer === null) flickerTimer = setInterval(flickerTick, FLICKER_INTERVAL_MS)
      if (!active && flickerTimer !== null) {
        clearInterval(flickerTimer)
        flickerTimer = null
      }
    },
  }
}
