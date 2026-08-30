/**
 * The hover backdrop: a semi-transparent black panel behind the widget's content.
 *
 * `BackdropBorder` (`MainWindow.xaml:34-37`) sits above the permanent black background and below
 * everything else. It ships `Transparent` and is painted on `MouseEnter`, cleared on `MouseLeave` --
 * unless `backdropAlwaysVisible`, in which case it is painted at startup and never cleared.
 *
 * **Neither of the two settings behind it had a reader anywhere in the port** before this module.
 * `backdropAlwaysVisible` and `backdropOpacityPercent` were imported, validated, persisted and shown to
 * nothing, which is the shape a feature goes missing in: every layer said it was supported except the one
 * that paints.
 *
 * ## The 25 floor is not a rounding guard
 *
 * `Math.Clamp((int)(pct / 100.0 * 255), 25, 255)` -- at the settings window's own minimum the alpha
 * cannot go below 25/255, about 10%. So "backdrop at 0%" is not "no backdrop": it is a faint one. The
 * floor is what keeps `backdropAlwaysVisible` from silently meaning nothing, and it is why the OFF state
 * is a separate boolean rather than 0%.
 *
 * `(int)` in C# **truncates** toward zero; `Math.round` would disagree at 35% (89.25 -> 89 either way,
 * but 14% gives 35.7, truncating to 35 and rounding to 36). `Math.trunc` is therefore the port's
 * conversion, and the test sweeps the whole 0-100 range against an independently written oracle rather
 * than spot-checking the default.
 */

/** `Math.Clamp` floor -- about 10% alpha, the faintest backdrop the app will paint. */
export const BACKDROP_ALPHA_MIN = 25

export const BACKDROP_ALPHA_MAX = 255

/**
 * `BackdropAlpha()`: a percentage to an 8-bit alpha.
 *
 * A non-finite input clamps to the floor rather than propagating NaN into a colour string. That cannot
 * arrive from `validateSettings` (it coerces the field to a number or falls back to the default), so this
 * is the boundary being total rather than a case with a known caller.
 */
export function backdropAlpha(percent: number): number {
  if (!Number.isFinite(percent)) return BACKDROP_ALPHA_MIN
  const raw = Math.trunc((percent / 100) * BACKDROP_ALPHA_MAX)
  return Math.min(Math.max(raw, BACKDROP_ALPHA_MIN), BACKDROP_ALPHA_MAX)
}

/**
 * The backdrop's fill, as SVG takes it: `#rrggbbaa` over black, or `"transparent"`.
 *
 * `#000000` with an alpha suffix rather than `rgba()`, so the value is a legal `fill` **presentation
 * attribute** -- the same constraint the fade's opacity is under, since the CSP ships no `unsafe-inline`
 * and a stylesheet declaration would beat an attribute.
 */
export function backdropFill(alwaysVisible: boolean, hovering: boolean, percent: number): string {
  if (!alwaysVisible && !hovering) return "transparent"
  const alpha = backdropAlpha(percent)
  return `#000000${alpha.toString(16).padStart(2, "0")}`
}
