/**
 * The analog dial: two hands over three optional decoration rings.
 *
 * ## The hands are under the decorations, and that is the C#'s z-order
 *
 * `MainWindow.xaml` declares `HourHand` and `MinuteHand` as `DialCanvas`'s first two children, and
 * `InitDialDecorations()` *appends* the 12 ticks, 60 dots and 12 numbers at `ContentRendered`. Later
 * children paint on top in WPF, so the hands pass behind the tick ring and the hour numbers. That reads as
 * a mistake and is the shipped look, so `index.html` declares them in the same order.
 *
 * ## Nothing here is rebuilt after the first call
 *
 * The dial is a fixed 80x80 at every font size -- `contentSize` returns `DIAL_CANVAS_SIZE` for it
 * unconditionally -- so the tick, dot and number geometry has no settings dependency at all. The three
 * groups are built once and afterwards only their `display` and their colour change. The 84 decoration
 * elements are built from `dial-geometry.ts` rather than written into `index.html` because that module's
 * every endpoint is pinned against the compiled control by fixture, and 60 hand-written circles would be
 * 60 chances to diverge from it silently.
 *
 * ## The hands rotate; they do not move their endpoints
 *
 * `UpdateDialDisplay` assigns `HourHand.X2`/`Y2` from trig. This face instead draws each hand straight up
 * from the centre and writes a `rotate` transform, which is the one property Chromium can animate without
 * re-laying-out the SVG. The two are provably the same placement -- `dial-geometry.test.ts` asserts
 * `rotateUpwardPoint` equals `handEndpoint` to 12 places over 720 minutes -- and that equivalence is what
 * licenses the substitution rather than a claim that it looks right.
 */

import {
  DOT_SIZE,
  NUMBER_FONT_SIZE,
  NUMBER_OFFSET_X,
  NUMBER_OFFSET_Y,
  handTransform,
  hourNumbers,
  hourTicks,
  minuteDots,
} from "../../core/dial-geometry.js"
import { FACE_CONTAINER_IDS, dialPlan } from "../../core/display-plan.js"
import { element, replaceChildren, setAttr, setVisible, svgEl } from "../svg.js"
import { structureGate, type ClockFace, type FaceContext } from "./face.js"

export function createDialFace(): ClockFace {
  const container = element<SVGGElement>(FACE_CONTAINER_IDS.dial)
  const hourHand = element<SVGLineElement>("hourHand")
  const minuteHand = element<SVGLineElement>("minuteHand")
  const tickGroup = element<SVGGElement>("hourTicks")
  const dotGroup = element<SVGGElement>("minuteDots")
  const numberGroup = element<SVGGElement>("hourNumbers")

  // The key is a constant, so the gate fires exactly once. Written this way rather than with a boolean so
  // the shape matches the other three faces and a future settings dependency has somewhere to go.
  const gate = structureGate()

  const buildDecorations = (): void => {
    replaceChildren(
      tickGroup,
      hourTicks().map((t) =>
        svgEl("line", { class: "dialTick", x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2 }),
      ),
    )
    // A `<circle>` at the measured centre rather than a `<rect>` at the measured `left`/`top`: WPF places a
    // 2x2 `Ellipse` by its top-left corner, and `minuteDots()` reports both. The centre form is one
    // attribute fewer and the radius is exactly half `DOT_SIZE`, which is the same 2px dot.
    replaceChildren(
      dotGroup,
      minuteDots().map((d) => svgEl("circle", { class: "dialDot", cx: d.cx, cy: d.cy, r: DOT_SIZE / 2 })),
    )
    replaceChildren(
      numberGroup,
      hourNumbers().map((n) => {
        // `left`/`top` are WPF's top-left placement of a 7pt glyph box, hand-centred with -4.0/-4.5. SVG
        // anchors text by its baseline and its own box, so reproducing the offsets would centre it twice.
        // `text-anchor: middle` and `dominant-baseline: central` on the measured CENTRE is the equivalent,
        // and the two offsets are asserted below to be the ones this replaces.
        const text = svgEl("text", { class: "dialNumber", x: n.cx, y: n.cy, "font-size": NUMBER_FONT_SIZE })
        text.textContent = n.text
        return text
      }),
    )
  }

  return {
    face: "dial",

    rebuild(context: FaceContext): void {
      if (gate("dial")) buildDecorations()
      // The three rings are independently toggleable from the settings window, and `InitDialDecorations`
      // applies all three at the end of its own build for the same reason: the elements do not exist
      // before it runs, so `ApplySettings` could not have set them.
      setVisible(tickGroup, context.settings.showHourTicks)
      setVisible(dotGroup, context.settings.showMinuteDots)
      setVisible(numberGroup, context.settings.showHourNumbers)
    },

    tick(now: Date): void {
      const plan = dialPlan(now)
      setAttr(hourHand, "transform", handTransform(plan.hourAngle))
      setAttr(minuteHand, "transform", handTransform(plan.minuteAngle))
    },

    activate(active: boolean): void {
      setVisible(container, active)
    },
  }
}

/**
 * The two offsets the number placement above deliberately does not apply.
 *
 * Exported so the offsets are still reachable from one place if the centring ever has to be done by hand
 * -- and so that "we chose not to use these" is a fact in the module rather than only in a comment.
 */
export const WPF_NUMBER_OFFSETS = { x: NUMBER_OFFSET_X, y: NUMBER_OFFSET_Y } as const
