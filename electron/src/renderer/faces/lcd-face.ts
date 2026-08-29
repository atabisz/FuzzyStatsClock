/**
 * The seven-segment LCD: five or eight slots in a row, each a full digit cell.
 *
 * ## Every slot carries all seven segments and both colon dots
 *
 * That is `SevenSegmentDigit`'s own design and not a simplification. The control has no separate colon
 * glyph: on `':'` it hides the seven polygons, paints the two dots in the lit or ghost colour, and narrows
 * itself to `_builtColonW`; on anything else it shows the polygons, fills them from the encoder's mask, and
 * puts the dots in the ghost colour. So a colon slot and a digit slot differ only in which children are
 * visible, and building them identically is what makes the widths add up the way `lcdViewSize` says.
 *
 * ## A space is not a blank
 *
 * `formatLcdTime` pads the 12-hour tens place with a **space**, and `encodeSevenSegment(" ")` is `0x00` --
 * which fills all seven segments with the *ghost* colour rather than hiding them. So at 1:05 the leading
 * cell shows a dim, unlit `8`, exactly as a real LCD does. Worth stating because "render a space as
 * nothing" is the reasonable-looking version of this and is wrong.
 *
 * ## The blink phase lives here, and survives a face switch
 *
 * `_colonVisible` is a field on the control, initialised `true` and inverted *before* it is assigned, so
 * the first painted frame is a dark colon -- `FIRST_FRAME_COLON1_ON`. `IsVisibleChanged` does not reset it,
 * so switching to another clock type and back resumes the phase rather than restarting it. This face keeps
 * both properties: the flag is closure state that `activate` and `rebuild` do not touch.
 *
 * ## `tick` takes only a `Date`, so the settings are held from the last `rebuild`
 *
 * `UpdateTime()` in the C# reads its own dependency properties, which the window pushed in earlier. The
 * same lifetime here is "whatever `rebuild` was last given", so that is what this closure keeps -- and it
 * starts as `null` so a `tick` before the first `rebuild` is a loud failure rather than a face rendered
 * against invented defaults.
 */

import { COLON2_ALWAYS_ON, FACE_CONTAINER_IDS, lcdPlan } from "../../core/display-plan.js"
import { cssColor, lcdSkin, type LcdSkin } from "../../core/display-colors.js"
import { lcdDigitSize } from "../../core/layout.js"
import { toSegmentHeight } from "../../core/digit-size.js"
import { encodeSevenSegment } from "../../core/seven-segment.js"
import { buildSevenSegmentDigit, pointsAttribute } from "../../core/seven-segment-geometry.js"
import { element, replaceChildren, setAttr, setVisible, svgEl } from "../svg.js"
import { structureGate, type ClockFace, type FaceContext } from "./face.js"

/**
 * The slot indexes that hold a colon: `D0 D1 Colon1 D2 D3 Colon2 D4 D5`.
 *
 * Fixed by position rather than read from the plan, because the *elements* are built before any tick and
 * their widths differ -- a colon slot is `colonWidth` wide. `lcdPlan` agrees, and the test asserts they do.
 */
export const COLON_SLOT_INDEXES: readonly number[] = [2, 5]

/** The slot count with and without seconds -- `D0 D1 : D2 D3` plus `: D4 D5`. */
export const LCD_SLOT_COUNTS = { withSeconds: 8, withoutSeconds: 5 } as const

interface SlotElements {
  readonly isColon: boolean
  /** The background rect, whose fill is the skin's background. */
  readonly background: SVGRectElement
  /** a..g, in `RebuildGeometry`'s order, so bit `i` of the mask addresses index `i`. */
  readonly segments: readonly SVGPolygonElement[]
  readonly dots: readonly SVGRectElement[]
}

export function createLcdFace(): ClockFace {
  const container = element<SVGGElement>(FACE_CONTAINER_IDS.lcd)
  const gate = structureGate()
  let slots: readonly SlotElements[] = []
  let context: FaceContext | null = null
  // `true`, so the first `!colonVisible` below yields `false`: `FIRST_FRAME_COLON1_ON`.
  let colonVisible = true

  const build = (settings: FaceContext["settings"], skin: LcdSkin): void => {
    const geometry = buildSevenSegmentDigit(skin.segmentStyle, toSegmentHeight(lcdDigitSize(settings)))
    const slotCount = settings.lcdShowSeconds
      ? LCD_SLOT_COUNTS.withSeconds
      : LCD_SLOT_COUNTS.withoutSeconds

    const built: SlotElements[] = []
    const groups: SVGGElement[] = []
    let x = 0
    for (let index = 0; index < slotCount; index++) {
      const isColon = COLON_SLOT_INDEXES.includes(index)
      const width = isColon ? geometry.colonWidth : geometry.digitWidth
      const group = svgEl("g", { class: "lcdSlot", transform: `translate(${String(x)} 0)` })
      const background = svgEl("rect", {
        class: "lcdBg",
        x: 0,
        y: 0,
        width,
        height: geometry.canvasHeight,
      })
      const segments = geometry.segments.map((points) =>
        svgEl("polygon", {
          class: "lcdSeg",
          points: pointsAttribute(points),
          // `Visibility.Hidden`, not `Collapsed`: the control keeps the space. In SVG each segment is
          // absolutely placed inside its slot either way, so this is faithfulness rather than layout, and
          // it is written once at build time because a slot never changes which kind it is.
          visibility: isColon ? "hidden" : "visible",
        }),
      )
      // Both dots exist in every slot, at the *colon* geometry's x, because the control builds them
      // unconditionally in `RebuildGeometry` and never moves them.
      const dots = geometry.dots.map((dot) =>
        svgEl("rect", { class: "lcdDot", x: dot.x, y: dot.y, width: dot.width, height: dot.height }),
      )
      group.append(background, ...segments, ...dots)
      groups.push(group)
      built.push({ isColon, background, segments, dots })
      x += width
    }
    replaceChildren(container, groups)
    slots = built
  }

  /** The colours that do not depend on the time: background everywhere, and the ghosts that never move. */
  const paint = (skin: LcdSkin): void => {
    const background = cssColor(skin.background)
    const ghost = cssColor(skin.ghost)
    for (const slot of slots) {
      setAttr(slot.background, "fill", background)
      if (slot.isColon) {
        // `UpdateSegments`'s colon branch never assigns the seven fills, so they keep whatever they had --
        // which for a never-assigned element is the CSS default black. Ghosting them is the port's own
        // choice, costs seven writes per rebuild, and means a `visibility` mistake shows up as a dim
        // segment rather than as an invisible one.
        for (const segment of slot.segments) setAttr(segment, "fill", ghost)
      } else {
        // A digit slot's dots are ghost forever; a colon slot's are repainted every tick.
        for (const dot of slot.dots) setAttr(dot, "fill", ghost)
      }
    }
  }

  return {
    face: "lcd",

    rebuild(next: FaceContext): void {
      context = next
      const skin = lcdSkin(next.settings.lcdStyle, next.theme.accent)
      // Three things change the elements: the segment style, the digit tier and the slot count. The skin's
      // own `segmentStyle` rather than a second `lcdStyle === "Silver"` ternary -- `lcdSkin` owns that
      // mapping, and Paper and Dark are both Classic, so a Paper/Dark swap repaints without rebuilding.
      const key = [skin.segmentStyle, lcdDigitSize(next.settings), next.settings.lcdShowSeconds].join("/")
      if (gate(key)) build(next.settings, skin)
      paint(skin)
    },

    tick(now: Date): void {
      if (context === null) throw new Error("lcd face ticked before rebuild")
      // The toggle is here and the phase is passed in, because `lcdPlan` is pure and the blink is per-tick
      // state. Inverted before use, so frame one is dark.
      colonVisible = !colonVisible
      const plan = lcdPlan(now, context.settings, colonVisible)
      const skin = lcdSkin(context.settings.lcdStyle, context.theme.accent)
      const lit = cssColor(skin.lit)
      const ghost = cssColor(skin.ghost)
      for (const [index, slot] of slots.entries()) {
        const planned = plan.slots[index]
        if (planned === undefined) continue
        if (slot.isColon) {
          // Colon1 follows the phase; Colon2 is `COLON2_ALWAYS_ON`, because `UpdateTime` never assigns it
          // and its dependency property was registered `true`. The plan carries both, so this branch does
          // not need to know which colon it is -- and `?? COLON2_ALWAYS_ON` covers the shape mismatch that
          // a digit character landing in a colon slot would be.
          const fill = (planned.colonOn ?? COLON2_ALWAYS_ON) ? lit : ghost
          for (const dot of slot.dots) setAttr(dot, "fill", fill)
          continue
        }
        const mask = encodeSevenSegment(planned.character)
        for (const [bit, segment] of slot.segments.entries()) {
          setAttr(segment, "fill", ((mask >> bit) & 1) === 1 ? lit : ghost)
        }
      }
    },

    activate(active: boolean): void {
      // Deliberately does not touch `colonVisible`: `IsVisibleChanged` does not either, so the blink phase
      // carries across a clock-type switch.
      setVisible(container, active)
    },
  }
}
