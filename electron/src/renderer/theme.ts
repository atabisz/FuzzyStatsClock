/**
 * `ApplyTheme` and `ApplyDisplayColor`, as a table plus one loop over it.
 *
 * ## Presentation attributes, not CSS custom properties
 *
 * Every colour here is written with `setAttribute("fill", …)` or `setAttribute("stroke", …)`. The tempting
 * alternative -- one `--accent` custom property on `<svg>` and `fill="var(--accent)"` throughout -- was
 * rejected on a risk asymmetry rather than a measurement. `index.html` ships a CSP with no
 * `style-src 'unsafe-inline'`, and while CSSOM writes are generally taken to be outside `style-src`'s
 * reach, "generally taken to be" is the whole problem: if that is wrong here, or changes, the failure mode
 * is every themed element silently keeping its authored colour. A presentation attribute is provably not a
 * style-src subject, and the cost of choosing it is ~26 attribute writes per settings change, which happens
 * a handful of times in a session. Cheap insurance against a total, silent failure.
 *
 * ## Which elements take `stroke` and which take `fill`
 *
 * From the C#'s own property choices, not from what looks right in SVG: `HourHand.Stroke` and
 * `MinuteHand.Stroke` are strokes, the tick `Line`s are strokes, the minute dots are `Fill`, and every
 * `TextBlock.Foreground` and bar `Border.Background` becomes a fill. Getting one wrong is invisible on the
 * default white accent and produces a black hand or an unfilled dot on any other -- which is exactly the
 * class of bug that survives a screenshot review of the default profile.
 *
 * The three `<g>` containers -- `hourTicks`, `minuteDots`, `hourNumbers` -- are themed once each and their
 * children inherit. That is what lets the dial's 12 ticks, 60 dots and 12 numbers cost three writes rather
 * than 84, and it is why those children must carry classes and never ids.
 *
 * ## No top-level DOM access
 *
 * The tables below are plain data and Bun imports them for the tests. `applyTheme` is the only function
 * that touches an element, and it takes its lookup function as an argument so a test could drive it with a
 * stub if a DOM ever arrives.
 */

import {
  ACCENT_TARGET_IDS,
  DIM_TARGET_IDS,
  PHASE_7_ACCENT_TARGET_IDS,
  cssColor,
  type RgbaColor,
  type ThemeColors,
} from "../core/display-colors.js"
import { setAttr } from "./svg.js"

/** SVG's two paint properties. WPF's `Stroke`/`Fill`/`Foreground`/`Background` all land on one of these. */
export type PaintProperty = "fill" | "stroke"

/**
 * The three elements the C# paints with `Stroke`. Everything else themed is a fill.
 *
 * `hourTicks` is the `<g>` the twelve tick `Line`s live in, so one write covers all twelve by inheritance.
 * `minuteDots` is a `<g>` too but takes `fill`, because `InitDialDecorations` sets `el.Fill` on the
 * ellipses -- the two dial `<g>`s therefore differ in paint property, which is the detail worth having a
 * named set for.
 */
export const STROKE_TARGET_IDS: readonly string[] = ["hourHand", "minuteHand", "hourTicks"]

/** Which of the two accent brushes an element gets: the full-opacity one or the 0x8C-alpha one. */
export type ThemeRole = "accent" | "dim"

export interface ThemeTarget {
  readonly id: string
  readonly property: PaintProperty
  readonly role: ThemeRole
}

/** `fill` unless the id is one of the three strokes. */
export function paintPropertyFor(id: string): PaintProperty {
  return STROKE_TARGET_IDS.includes(id) ? "stroke" : "fill"
}

/**
 * Every element `ApplyTheme` touches, with its property and its brush.
 *
 * Built from `display-colors.ts`'s sets rather than relisted, so the two cannot drift: that module owns
 * *which* ids are themed and this one owns *how*. `PHASE_7_ACCENT_TARGET_IDS` is folded in here -- the
 * `update` element exists in the markup from Phase 4 onward (hidden, as `UpdateText` is `Collapsed` in the
 * XAML), so theming it costs one write and means Phase 7 has nothing to remember.
 */
export const THEME_TARGETS: readonly ThemeTarget[] = [
  ...[...ACCENT_TARGET_IDS, ...PHASE_7_ACCENT_TARGET_IDS].map(
    (id): ThemeTarget => ({ id, property: paintPropertyFor(id), role: "accent" }),
  ),
  ...DIM_TARGET_IDS.map((id): ThemeTarget => ({ id, property: paintPropertyFor(id), role: "dim" })),
]

/**
 * Elements whose colour the theme must NOT overwrite once another rule owns it.
 *
 * One entry today: `battBar` while the battery alert is active. `ApplyTheme` guards it with
 * `if (!_batteryAlertActive)` at `:2058`, and `ApplyDisplayColor` again at `:2109`, so an accent change
 * during a low-battery alert leaves the bar its alert colour. The alert itself is Phase 6; the exemption is
 * declared here because the theme is what would trample it, and a Phase 6 that has to remember to add a
 * guard to a Phase 4 module is how that gets missed.
 */
export interface ThemeOverrides {
  readonly batteryAlertActive?: boolean
}

/** How the renderer hands `applyTheme` its elements. `element` from `svg.ts` satisfies this. */
export type ElementLookup = (id: string) => Element

/**
 * Paint the themed elements, and report how many writes actually reached the DOM.
 *
 * The count is the return value because it is the only observable difference between "the theme was
 * applied" and "the theme was applied and nothing needed to change" -- which is what `test/theme.test.ts`
 * asserts on to prove a settings change with no colour in it does not repaint 26 elements.
 *
 * `probe-display.ts` cannot see this number: the renderer bundle exports to no global, so CDP has no
 * route to a closure. It checks the *outcome* instead -- the computed `fill`/`stroke` of all 26 targets
 * against the accent the settings file carried (its arm D5), which is the half a stub lookup cannot
 * answer because only Chromium's cascade knows whether a stylesheet shadowed the attribute.
 */
export function applyTheme(
  lookup: ElementLookup,
  colors: ThemeColors,
  overrides: ThemeOverrides = {},
): number {
  let writes = 0
  const paint: Record<ThemeRole, string> = {
    accent: cssColor(colors.accent),
    dim: cssColor(colors.dim),
  }
  for (const target of THEME_TARGETS) {
    if (BATTERY_ALERT_OWNED_ID === target.id && overrides.batteryAlertActive === true) continue
    if (setAttr(lookup(target.id), target.property, paint[target.role])) writes++
  }
  return writes
}

/** The one id another rule can take ownership of. See {@link ThemeOverrides}. */
export const BATTERY_ALERT_OWNED_ID = "battBar"

/** `cssColor` re-exported for the faces, which need the same conversion for the LCD skin and the tubes. */
export { cssColor }
export type { RgbaColor, ThemeColors }
