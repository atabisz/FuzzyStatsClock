/**
 * `theme.ts` -- the paint table, and the applier driven against stub elements.
 *
 * ## The applier is testable under Bun, which was not obvious
 *
 * There is no DOM here and no DOM test library, so the working assumption for the whole renderer half was
 * "pure tables tested, painting proven by launch probe". That is too pessimistic for this module: `setAttr`
 * touches exactly one DOM method, `setAttribute`, and `WeakMap` keys on any object. So an object literal
 * with a `setAttribute` and a `Map` behind it is a sufficient stand-in, and the loop, the memo, the
 * fill/stroke split and the battery-alert exemption are all provable here rather than over CDP.
 *
 * What that leaves for `probe-display.ts` is only the part a stub genuinely cannot answer: that the ids
 * exist in the real document, that `fill`/`stroke` on a `<g>` reaches its children by inheritance, and that
 * the colours land visibly. Worth writing down, because the cheap tests and the expensive probe are easy to
 * duplicate and each duplicated arm costs an app launch.
 */
import { describe, expect, test } from "bun:test"
import {
  ACCENT_TARGET_IDS,
  DIM_TARGET_IDS,
  NEVER_THEMED_IDS,
  PHASE_7_ACCENT_TARGET_IDS,
  WHITE_ACCENT,
  cssColor,
  dimmed,
  resolveThemeColors,
  type RgbaColor,
} from "../src/core/display-colors.js"
import {
  BATTERY_ALERT_OWNED_ID,
  STROKE_TARGET_IDS,
  THEME_TARGETS,
  applyTheme,
  paintPropertyFor,
  type PaintProperty,
} from "../src/renderer/theme.js"

/** A stand-in element: records writes, and satisfies the one method `setAttr` calls. */
interface StubElement {
  readonly attrs: Map<string, string>
  setAttribute(name: string, value: string): void
}

const stubElement = (): StubElement => {
  const attrs = new Map<string, string>()
  return {
    attrs,
    setAttribute(name: string, value: string): void {
      attrs.set(name, value)
    },
  }
}

interface Doc {
  readonly lookup: (id: string) => Element
  readonly requested: string[]
  readonly elements: Map<string, StubElement>
}

/**
 * A document that mints an element on first request and returns the same one afterwards, so the memo sees
 * the identity it depends on, and records every id asked for so the exclusions can be checked.
 */
const stubDocument = (): Doc => {
  const elements = new Map<string, StubElement>()
  const requested: string[] = []
  const lookup = (id: string): Element => {
    requested.push(id)
    let found = elements.get(id)
    if (found === undefined) {
      found = stubElement()
      elements.set(id, found)
    }
    return found as unknown as Element
  }
  return { lookup, requested, elements }
}

const attrsOf = (doc: Doc, id: string): Map<string, string> => doc.elements.get(id)?.attrs ?? new Map()

const WHITE = resolveThemeColors(WHITE_ACCENT, null)
const ORANGE: RgbaColor = { a: 0xff, r: 0xff, g: 0x8c, b: 0x00 }

describe("the paint table", () => {
  test("covers exactly the three themed id sets, once each", () => {
    const ids = THEME_TARGETS.map((t) => t.id)
    const expected: readonly string[] = [
      ...ACCENT_TARGET_IDS,
      ...PHASE_7_ACCENT_TARGET_IDS,
      ...DIM_TARGET_IDS,
    ]
    expect([...ids].sort()).toEqual([...expected].sort())
    expect(new Set(ids).size).toBe(ids.length)
    // 23 accent + 1 Phase 7 + 2 dim. The number is in the header of `theme.ts` as the per-change write
    // cost, so it is pinned here rather than left to be recounted.
    expect(ids).toHaveLength(26)
  })

  test("excludes every id `ApplyTheme`'s closing comment excludes", () => {
    const ids = new Set(THEME_TARGETS.map((t) => t.id))
    for (const excluded of NEVER_THEMED_IDS) expect(ids.has(excluded)).toBe(false)
  })

  test("only the two hands and the tick group are strokes", () => {
    // Asserted as the full partition rather than three spot checks: the failure that matters is a *new*
    // themed element defaulting to `fill` when the C# gives it a `Stroke`, and only a partition catches it.
    const byProperty = (property: PaintProperty): readonly string[] =>
      THEME_TARGETS.filter((t) => t.property === property)
        .map((t) => t.id)
        .sort()
    expect(byProperty("stroke")).toEqual(["hourHand", "hourTicks", "minuteHand"])
    expect(byProperty("fill")).toHaveLength(23)
  })

  test("the two dial decoration groups disagree on paint property", () => {
    // `InitDialDecorations` sets `.Stroke` on the tick `Line`s and `.Fill` on the dot `Ellipse`s, and the
    // numbers are `TextBlock.Foreground`. Same `<g>` shape, three different WPF properties, two SVG ones.
    expect(paintPropertyFor("hourTicks")).toBe("stroke")
    expect(paintPropertyFor("minuteDots")).toBe("fill")
    expect(paintPropertyFor("hourNumbers")).toBe("fill")
  })

  test("`paintPropertyFor` agrees with the table for every themed id", () => {
    for (const target of THEME_TARGETS) expect(paintPropertyFor(target.id)).toBe(target.property)
  })

  test("every stroke target is a themed id", () => {
    const ids = new Set(THEME_TARGETS.map((t) => t.id))
    for (const id of STROKE_TARGET_IDS) expect(ids.has(id)).toBe(true)
  })
})

describe("applying a theme", () => {
  test("writes one attribute per themed element and reports the count", () => {
    const doc = stubDocument()
    expect(applyTheme(doc.lookup, WHITE)).toBe(26)
    expect(doc.elements.size).toBe(26)
    for (const target of THEME_TARGETS) {
      const attrs = attrsOf(doc, target.id)
      expect([...attrs.keys()]).toEqual([target.property])
    }
  })

  test("the accent goes on at full alpha and the dim pair at 0x8C", () => {
    const doc = stubDocument()
    applyTheme(doc.lookup, resolveThemeColors(ORANGE, null))
    expect(attrsOf(doc, "phrase").get("fill")).toBe("rgb(255 140 0)")
    expect(attrsOf(doc, "hourHand").get("stroke")).toBe("rgb(255 140 0)")
    // `cssColor` emits the alpha only when it is not 0xFF, so the dim form is visibly different -- which is
    // the whole point of `qualifierBrush` and the arm most likely to be silently dropped.
    expect(attrsOf(doc, "qualifier").get("fill")).toBe(cssColor(dimmed(ORANGE)))
    expect(attrsOf(doc, "date").get("fill")).toBe(cssColor(dimmed(ORANGE)))
    expect(attrsOf(doc, "qualifier").get("fill")).toContain("/ 0.549")
  })

  test("never asks the document for an excluded element", () => {
    const doc = stubDocument()
    applyTheme(doc.lookup, WHITE)
    // Stronger than "does not paint them": the tracks and `contentBackground` are not even looked up, so a
    // future `element()` that throws on a missing id cannot be tripped by the theme.
    for (const excluded of NEVER_THEMED_IDS) expect(doc.requested).not.toContain(excluded)
  })

  test("a second identical apply touches nothing", () => {
    const doc = stubDocument()
    applyTheme(doc.lookup, WHITE)
    expect(applyTheme(doc.lookup, WHITE)).toBe(0)
    // The memo is per element and per attribute, so this also proves no element got a *second* attribute.
    for (const target of THEME_TARGETS) expect(attrsOf(doc, target.id).size).toBe(1)
  })

  test("a changed accent repaints everything", () => {
    const doc = stubDocument()
    applyTheme(doc.lookup, WHITE)
    expect(applyTheme(doc.lookup, resolveThemeColors(ORANGE, null))).toBe(26)
    expect(attrsOf(doc, "emphasis").get("fill")).toBe("rgb(255 140 0)")
  })

  test("an auto-contrast override is opaque even when the accent is not", () => {
    const doc = stubDocument()
    const translucent: RgbaColor = { a: 0x40, r: 0x00, g: 0x00, b: 0xff }
    applyTheme(doc.lookup, resolveThemeColors(translucent, { r: 0x11, g: 0x22, b: 0x33 }))
    // `ApplyDisplayColor` builds with `Color.FromRgb`, so the user's accent alpha is discarded by
    // construction. The asymmetry is the C#'s; this pins that the renderer does not restore it.
    expect(attrsOf(doc, "phrase").get("fill")).toBe("rgb(17 34 51)")
  })

  test("a translucent accent keeps its alpha when there is no override", () => {
    const doc = stubDocument()
    applyTheme(doc.lookup, resolveThemeColors({ a: 0x80, r: 0x00, g: 0x00, b: 0xff }, null))
    expect(attrsOf(doc, "phrase").get("fill")).toBe("rgb(0 0 255 / 0.5019607843137255)")
  })
})

describe("the battery alert owns its bar", () => {
  test("an active alert leaves `battBar` alone and drops the write count by one", () => {
    const doc = stubDocument()
    expect(applyTheme(doc.lookup, WHITE, { batteryAlertActive: true })).toBe(25)
    expect(doc.elements.has(BATTERY_ALERT_OWNED_ID)).toBe(false)
    expect(doc.requested).not.toContain(BATTERY_ALERT_OWNED_ID)
  })

  test("an inactive or absent alert paints it", () => {
    for (const overrides of [{}, { batteryAlertActive: false }]) {
      const doc = stubDocument()
      expect(applyTheme(doc.lookup, WHITE, overrides)).toBe(26)
      expect(attrsOf(doc, BATTERY_ALERT_OWNED_ID).get("fill")).toBe("rgb(255 255 255)")
    }
  })

  test("the alert exemption covers exactly one element", () => {
    // If a second override is ever added, this fails and forces the count above to be re-derived rather
    // than quietly absorbing it.
    const doc = stubDocument()
    const painted = applyTheme(doc.lookup, WHITE)
    const guarded = stubDocument()
    expect(painted - applyTheme(guarded.lookup, WHITE, { batteryAlertActive: true })).toBe(1)
    expect(BATTERY_ALERT_OWNED_ID).toBe("battBar")
  })
})
