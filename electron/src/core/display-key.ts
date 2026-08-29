/**
 * Monitor identity: the composite geometry key that replaces FuzzyClock.App/MonitorService.cs.
 *
 * ## Why the WPF key could not be ported
 *
 * `MonitorService` builds a key from the monitor's FRIENDLY NAME (`QueryDisplayConfig` ->
 * `monitorFriendlyDeviceName`), lowercased, with `-2`/`-3` suffixes when two report the same string,
 * and falls back to the GDI device name (`\\.\DISPLAY5` -> `display5`) when the friendly-name lookup
 * fails. Both halves are broken on Alex's desk, and ISC-7 measured it:
 *
 *   - his two LG panels report the IDENTICAL string `"LG HDR WQHD"`, so the friendly name cannot tell
 *     them apart and the `-2` suffix is assigned by enumeration order, which is not stable either;
 *   - his live settings file holds `display5` and `display6`, meaning the lookup DID fail in practice
 *     and the app fell through to GDI indices -- numbers Windows reassigns on an unplug/replug.
 *
 * Electron has no equivalent API at all: `screen.getAllDisplays()` gives `id` (a session-scoped
 * handle, regenerated every boot) and `label` (the same non-unique friendly string). So the key here
 * is the one thing that is both readable and measurably stable across launches:
 *
 *   `WIDTHxHEIGHT@X,Y:SCALE`   e.g. `3440x1440@0,0:1.00`
 *
 * ISC-7 measured three distinct values across two launches on his three-display desk, identical both
 * times. `label` is kept alongside as a display *name*, never as an identity.
 *
 * ## The cost, stated rather than discovered later
 *
 * Position IS part of the key, so re-arranging monitors in Display Settings re-keys them and orphans
 * the saved position. That is deliberate: `placement.ts` handles a key miss by re-homing on geometry
 * and then clamping, so the failure mode is "the widget appears somewhere visible" rather than "the
 * widget restores onto a monitor that is no longer there". A name-keyed scheme fails the other way.
 */

/** The subset of Electron's `Display` this module needs. Structural, so tests need no Electron. */
export interface DisplayGeometry {
  readonly bounds: Bounds
  readonly workArea: Bounds
  readonly scaleFactor: number
  readonly label?: string
  readonly isPrimary?: boolean
}

/** Electron's rect shape: origin plus size, not edges. `placement.ts` does the edge arithmetic. */
export interface Bounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * `WIDTHxHEIGHT@X,Y:SCALE`, with the scale at two decimals.
 *
 * Two decimals because that is enough to separate every scale Windows and macOS offer (1.00, 1.25,
 * 1.50, 1.75, 2.00) while absorbing the float noise a fractional scale arrives with -- ISC-7 read
 * 1.0000000000000002 off one launch and 1.0 off the next, which must not be two monitors.
 */
export function displayKey(display: DisplayGeometry): string {
  const b = display.bounds
  return `${String(b.width)}x${String(b.height)}@${String(b.x)},${String(b.y)}:${display.scaleFactor.toFixed(2)}`
}

/**
 * Half-open containment, matching `ScreenDpi.FromDipPoint`: `>= left`, `< left + width`.
 *
 * The half-open upper edge is what stops a point on the seam between two adjacent monitors from
 * belonging to both.
 */
export function boundsContain(point: { readonly left: number; readonly top: number }, area: Bounds): boolean {
  return (
    point.left >= area.x &&
    point.left < area.x + area.width &&
    point.top >= area.y &&
    point.top < area.y + area.height
  )
}

/** The display whose BOUNDS contain the point, or null. Bounds, not work area: a position under a
 * taskbar is still on that monitor. */
export function findDisplayContaining(
  point: { readonly left: number; readonly top: number },
  displays: readonly DisplayGeometry[],
): DisplayGeometry | null {
  return displays.find((d) => boundsContain(point, d.bounds)) ?? null
}

/** The display with this composite key, or null. */
export function findDisplayByKey(key: string, displays: readonly DisplayGeometry[]): DisplayGeometry | null {
  return displays.find((d) => displayKey(d) === key) ?? null
}

/**
 * `Screen.PrimaryScreen ?? Screen.AllScreens[0]` -- the same two-step fallback, for the same reason:
 * every call site in the C# needs *a* screen and cannot proceed without one.
 *
 * Returns null only for an empty list, which means no displays are attached and there is nothing to
 * position onto. Callers decide what that means; this does not invent a display.
 */
export function primaryDisplay(displays: readonly DisplayGeometry[]): DisplayGeometry | null {
  return displays.find((d) => d.isPrimary === true) ?? displays[0] ?? null
}
