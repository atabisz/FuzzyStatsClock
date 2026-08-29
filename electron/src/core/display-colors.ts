/**
 * The accent-colour path, ported from `MainWindow.ApplyTheme` (:2027-2087),
 * `ApplyDisplayColor` (:2089-2122) and `ApplyLcdColors` (:2133-2156).
 *
 * ## Accent alpha is load-bearing, so the parsed colour is RGBA and not RGB
 *
 * `ApplyTheme` builds its main brush as `new SolidColorBrush(_accentColor)` -- the accent's own alpha,
 * whatever it is, straight through. `contrast.ts`'s `RgbColor` deliberately does not model alpha
 * because the auto-contrast maths is defined on opaque colours, so this module carries its own
 * `RgbaColor` and the two meet at `computeDisplayColor`. Dropping the alpha here would silently make
 * every semi-transparent accent fully opaque, which is a bug you only see against a light wallpaper.
 *
 * The **override** path is the other way round: `ApplyDisplayColor` takes an `RgbColor` and builds
 * `Color.FromRgb(...)`, which is alpha `0xFF`. So auto-contrast discards the user's accent alpha by
 * construction, and that asymmetry is in the C#, not introduced here.
 *
 * ## What is themed, and what is deliberately not
 *
 * The two C# methods walk the same element set, and `ApplyTheme` ends with a comment naming the
 * exclusions: the five bar *tracks* and `ContentBorder.Background`. That comment is the specification
 * for `NEVER_THEMED_IDS`, and it is a real decision rather than an oversight -- a track tinted with the
 * accent stops reading as an empty gauge, and `ContentBorder` sits behind the text where an accent fill
 * would destroy contrast with it.
 *
 * The element sets are exported as **data** so a test can assert three things a hand-written renderer
 * cannot: that they are disjoint, that their union accounts for the addressable element set in
 * `index.html`, and that the exclusions are still excluded. That last one is the point -- an accent
 * regression here is a silent visual change, and the failure mode that matters is a *new* element being
 * added and themed by nobody.
 *
 * The union is *these five sets plus two more*, and the extras are deliberately not moved here:
 * `NIXIE_GLYPH_IDS` and `NIXIE_COLON_GRADIENT_ID` live in `renderer/faces/nixie-face.ts`, which is the
 * only module that references them. The gradient in particular carries a colour of its own, so
 * `STRUCTURAL_IDS` -- documented as ids that carry none -- would be the wrong home for it.
 * `test/renderer-ids.test.ts` is where all seven sets are added up.
 *
 * Two elements from the C# list are absent on purpose:
 *  - **`TempsText` never appears.** Temperatures are retired on all three platforms (Option C,
 *    2026-08-28), so there is no element to theme rather than an element left untinted.
 *  - **`UpdateText` joins in Phase 7** with the update check itself; it is named in
 *    `PHASE_7_ACCENT_TARGET_IDS` so the gap is a declaration rather than an omission.
 */

import type { RgbColor } from "./contrast.js"
import type { LcdStyleName } from "./settings.js"

/** An accent colour: `RgbColor` plus the alpha `SolidColorBrush(_accentColor)` keeps. */
export interface RgbaColor extends RgbColor {
  /** 0-255, matching WPF's `Color.A` rather than CSS's 0-1 `alpha`. */
  readonly a: number
}

/** `Colors.White` -- `ColorConverter` failures land here (`MainWindow.xaml.cs:633`). */
export const WHITE_ACCENT: RgbaColor = { a: 0xff, r: 0xff, g: 0xff, b: 0xff }

/**
 * The 55% dim `ApplyTheme` puts on QualifierText and DateText: `Color.FromArgb(0x8C, r, g, b)`.
 *
 * 140/255 is 0.549..., which is the measured `dim-alpha` row -- so "55%" in the C# comment is the
 * intent and 0x8C is the value. The constant is the byte, because that is what the code does.
 */
export const DIM_ALPHA = 0x8c

/**
 * Parses the `AccentColor` string a settings file holds.
 *
 * The app only ever *writes* `#AARRGGBB` (`MainWindow.xaml.cs:912`), but it *reads* with
 * `ColorConverter.ConvertFromString`, which also takes `#RRGGBB`, `#ARGB` and `#RGB`, and the read is
 * wrapped in a `try`/`catch` that falls back to `Colors.White` on any failure. So the four hex shapes
 * are supported here and everything else returns white -- including WPF's ~140 named colours, which
 * `ConvertFromString` does accept. That is a **known, deliberate narrowing**: no code path in the app
 * can produce `"Red"` in the file, so supporting it would be untested surface, and the fallback for it
 * is white either way rather than a crash.
 *
 * Never throws, because the C# never propagates: a corrupt accent must not stop the clock starting.
 */
export function parseAccentColor(text: string): RgbaColor {
  const hex = text.trim()
  if (!hex.startsWith("#")) return WHITE_ACCENT
  const body = hex.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(body)) return WHITE_ACCENT
  const n = (at: number, len: number): number => {
    const slice = body.slice(at, at + len)
    const value = Number.parseInt(slice, 16)
    // A 1-digit group is a nibble that WPF expands by duplication: #F0C is #FF00CC.
    return len === 1 ? value * 0x11 : value
  }
  switch (body.length) {
    case 3:
      return { a: 0xff, r: n(0, 1), g: n(1, 1), b: n(2, 1) }
    case 4:
      return { a: n(0, 1), r: n(1, 1), g: n(2, 1), b: n(3, 1) }
    case 6:
      return { a: 0xff, r: n(0, 2), g: n(2, 2), b: n(4, 2) }
    case 8:
      return { a: n(0, 2), r: n(2, 2), g: n(4, 2), b: n(6, 2) }
    default:
      return WHITE_ACCENT
  }
}

/** `#AARRGGBB`, the only shape the app writes back (`MainWindow.xaml.cs:912`). */
export function formatAccentColor(color: RgbaColor): string {
  const hex = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).toUpperCase().padStart(2, "0")
  return `#${hex(color.a)}${hex(color.r)}${hex(color.g)}${hex(color.b)}`
}

/**
 * A CSS colour for an SVG `fill`/`stroke`.
 *
 * `rgb()` with a slash-alpha rather than `rgba()`: both are CSS Color 4, and this form takes the alpha
 * as 0-1 while keeping the channels as the bytes they are in WPF. Opaque colours emit no alpha at all
 * so the common case reads as an ordinary colour in devtools.
 */
export function cssColor(color: RgbColor | RgbaColor): string {
  const r = Math.round(color.r)
  const g = Math.round(color.g)
  const b = Math.round(color.b)
  const a = "a" in color ? color.a : 0xff
  if (a >= 0xff) return `rgb(${String(r)} ${String(g)} ${String(b)})`
  return `rgb(${String(r)} ${String(g)} ${String(b)} / ${String(a / 255)})`
}

/** The same colour dimmed to `DIM_ALPHA`, replacing any alpha it had -- `Color.FromArgb(0x8C, …)`. */
export function dimmed(color: RgbColor | RgbaColor): RgbaColor {
  return { a: DIM_ALPHA, r: color.r, g: color.g, b: color.b }
}

/**
 * The auto-ghost rule from `SevenSegmentDigit.UpdateSegments`: a `Transparent` GhostColor means
 * "15% of each lit channel", computed with C# **integer** division on bytes.
 *
 * `(byte)(r * 15 / 100)` truncates, and the measured rows show what that costs at the bottom of the
 * range: lit 6 gives ghost 0 while lit 7 gives 1, and `#FF007F` gives `38 0 19`. `Math.trunc` is not
 * optional here -- rounding instead would light a ghost segment that WPF leaves black.
 */
export function autoGhostColor(lit: RgbColor): RgbColor {
  return {
    r: Math.trunc((lit.r * 15) / 100),
    g: Math.trunc((lit.g * 15) / 100),
    b: Math.trunc((lit.b * 15) / 100),
  }
}

/** The four properties `ApplyLcdColors` pushes onto `LcdView`. */
export interface LcdSkin {
  readonly segmentStyle: "Classic" | "Bold"
  readonly lit: RgbaColor
  readonly background: RgbColor
  readonly ghost: RgbColor
}

/**
 * `ApplyLcdColors` (:2133-2156), with Dark's `Colors.Transparent` sentinel already resolved.
 *
 * The C# hands `GhostColor = Transparent` to the control and lets `UpdateSegments` derive the 15%
 * ghost; there is no control here to defer to, so the resolution happens at the boundary and the
 * sentinel never enters the renderer. Paper and Silver carry literal ghosts, so only Dark's is derived
 * -- and Dark's is derived from the **accent**, which is why changing the accent restyles the LCD.
 */
export function lcdSkin(style: LcdStyleName, accent: RgbaColor): LcdSkin {
  switch (style) {
    case "Paper":
      return {
        segmentStyle: "Classic",
        lit: { a: 0xff, r: 0x1a, g: 0x1c, b: 0x14 },
        background: { r: 0xb2, g: 0xc4, b: 0xa0 },
        ghost: { r: 0x8d, g: 0x9b, b: 0x7e },
      }
    case "Silver":
      return {
        segmentStyle: "Bold",
        lit: { a: 0xff, r: 0x18, g: 0x18, b: 0x18 },
        background: { r: 0xd0, g: 0xd2, b: 0xcc },
        ghost: { r: 0xb0, g: 0xb2, b: 0xac },
      }
    default:
      return {
        segmentStyle: "Classic",
        lit: accent,
        background: { r: 0x0f, g: 0x0f, b: 0x0f },
        ghost: autoGhostColor(accent),
      }
  }
}

/**
 * Elements that take the accent at full alpha. Mirrors `ApplyTheme`'s assignment list in its order.
 *
 * The three dial decoration groups are single ids rather than per-element ones because SVG `fill` and
 * `stroke` inherit: setting them on the `<g>` reaches every child, which is the same one-write-per-set
 * shape the C#'s `foreach (var el in _hourTickElements)` has, minus the loop.
 */
export const ACCENT_TARGET_IDS = [
  "phrase",
  "emphasis",
  "hourHand",
  "minuteHand",
  "hourTicks",
  "minuteDots",
  "hourNumbers",
  "cpuBar",
  "gpuBar",
  "memBar",
  "pagBar",
  "battBar",
  "cpuLabel",
  "gpuLabel",
  "memLabel",
  "pagLabel",
  "battLabel",
  "cpuText",
  "gpuText",
  "memText",
  "pagText",
  "battText",
  "uptime",
] as const

/** Elements dimmed to `DIM_ALPHA`: QualifierText and DateText, and only those two. */
export const DIM_TARGET_IDS = ["qualifier", "date"] as const

/**
 * `ApplyTheme`'s closing comment, as data: "Deliberately excluded: CpuBarTrack/GpuBarTrack/
 * MemBarTrack/PagBarTrack/BattBarTrack, ContentBorder.Background".
 */
export const NEVER_THEMED_IDS = [
  "cpuTrack",
  "gpuTrack",
  "memTrack",
  "pagTrack",
  "battTrack",
  "contentBackground",
] as const

/**
 * `UpdateText` -- accent-themed in both C# methods, and absent until the update check exists (ISC-30).
 * Declared so the difference between "not built yet" and "forgot to theme it" stays visible.
 */
export const PHASE_7_ACCENT_TARGET_IDS = ["update"] as const

/**
 * Ids that carry no colour of their own: the SVG root, the shared drop-shadow filter, and the
 * containers the four faces are swapped in and out of.
 */
export const STRUCTURAL_IDS = [
  "root",
  "textShadow",
  "windowBackground",
  "phraseFace",
  "splitFace",
  "dialFace",
  "lcdFace",
  "nixieFace",
  "stats",
] as const

/**
 * The two brushes `ApplyTheme` builds: `brush` and `qualifierBrush`.
 *
 * Named rather than left anonymous because `src/renderer/theme.ts` takes it as a parameter, and a
 * structural type there would let a future third brush be added here without the renderer noticing.
 */
export interface ThemeColors {
  readonly accent: RgbaColor
  readonly dim: RgbaColor
}

/** The colour to paint the themed elements with, given the accent and any auto-contrast override. */
export function resolveThemeColors(accent: RgbaColor, override: RgbColor | null): ThemeColors {
  // `ApplyDisplayColor` uses `Color.FromRgb`, so an override is opaque regardless of accent alpha.
  const base: RgbaColor = override === null ? accent : { a: 0xff, ...override }
  return { accent: base, dim: dimmed(base) }
}
