/**
 * Where the overlay window goes: clamp, first-run placement, edge snap, and startup restore.
 *
 * Ported from the pure geometry in FuzzyClock.App/SettingsService.cs (`Clamp`) and
 * FuzzyClock.App/MainWindow.xaml.cs (`PositionTopRight`, `SnapToEdge`, and the two-stage restore
 * split across `ApplySettings` and the `ContentRendered` handler).
 *
 * ## The whole of ScreenDpi.cs disappears here, and that is the point
 *
 * WPF's problem was mixed units: with `UseWPF` + `UseWindowsForms` the process is per-monitor
 * DPI-aware, so `Screen.WorkingArea` returns PHYSICAL PIXELS while `Window.Left/Top` are DIPs.
 * `ScreenDpi.cs` exists solely to divide one by the scale factor before they meet -- and its header
 * records the bug that bought it: "a saved DIP position [falls] outside the screen's pixel bounds
 * while still appearing 'in range' -- the widget renders off-screen."
 *
 * Electron reports `bounds` and `workArea` in DIPs already, and `BrowserWindow.setPosition` takes
 * DIPs. There is no conversion to get wrong, so the file has no counterpart and the class of bug it
 * guarded does not exist in the port. Recorded because a deletion this size looks like an omission.
 *
 * ## The two-stage restore collapses to one, by construction
 *
 * `SizeToContent=WidthAndHeight` leaves `ActualWidth` at 0 until after `Show()`, so WPF has to place
 * the window twice: `ApplySettings` sets Left/Top pre-Show against a 300x300 *guess* at the footprint
 * and a union-of-all-work-areas containment test, then `ContentRendered` re-clamps with the real size
 * against the keyed monitor. The pre-Show pass is explicitly belt-and-braces -- its own comment says
 * it exists so "recovery doesn't depend on FindScreenForKey resolving the saved key or on the
 * ContentRendered clamp branch executing without throwing."
 *
 * In Electron the window's size is known before it is shown, so `resolveStartPosition` runs once with
 * the real footprint. The union pre-check is therefore not ported: it guarded a timing hazard this
 * port does not have, and both of the things it was insuring against (an unresolvable key, a throwing
 * clamp) are handled here in the ordinary path. The 300x300 guess disappears with it.
 */

import type { MonitorPosition } from "./settings.js"
import type { Bounds, DisplayGeometry } from "./display-key.js"
import { displayKey, findDisplayByKey, findDisplayContaining, primaryDisplay } from "./display-key.js"

/** `PositionTopRight`'s `const double Padding = 20.0` -- first-run inset from the primary's corner. */
export const FIRST_RUN_PADDING_PX = 20

/** `MainWindow.EdgeSnapThresholdPx` (SNAP-03). Within this of a work-area edge, go flush to it. */
export const EDGE_SNAP_THRESHOLD_PX = 8

/** `Math.Clamp` -- and note the C# THROWS when min > max, which is why `Clamp` guards with `Math.Max`. */
function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * `SettingsService.Clamp` -- keeps a window's top-left inside an area, allowing for its own size.
 *
 * The two `Math.Max` calls are the load-bearing part. When the window is LARGER than the area,
 * `area.x + area.width - windowWidth` is less than `area.x`, so the naive clamp range inverts and
 * `Math.Clamp` throws. Taking the max anchors the window to the area's top-left instead: some of it
 * hangs off the bottom-right, which is the deliberate choice the C# documents. Measured: a 2000x1200
 * window on a 1920x1080 work area lands at (0,0) from BOTH (9999,9999) and (-9999,-9999).
 */
export function clampPosition(
  position: MonitorPosition,
  windowWidth: number,
  windowHeight: number,
  area: Bounds,
): MonitorPosition {
  const maxLeft = Math.max(area.x, area.x + area.width - windowWidth)
  const maxTop = Math.max(area.y, area.y + area.height - windowHeight)
  return {
    left: clampValue(position.left, area.x, maxLeft),
    top: clampValue(position.top, area.y, maxTop),
  }
}

/**
 * `PositionTopRight` -- first-run placement, 20px in from the primary display's top-right corner.
 *
 * BOUNDS, not work area, because the C# reads `SystemParameters.PrimaryScreenWidth`, which is the
 * primary's full width. A right-docked taskbar therefore tucks the widget partly behind it in WPF
 * too. Faithful rather than improved: fixing it here would put the port's first-run position
 * somewhere the WPF app never used, and ISC-16's screenshot comparison is against the WPF app.
 *
 * The C# can assume the primary sits at the virtual-desktop origin (Windows guarantees it) and so
 * omits an x offset entirely. This adds `bounds.x`/`bounds.y`, which is a no-op on Windows and is
 * what makes the same function correct on a macOS layout where the primary need not be at 0,0.
 */
export function positionTopRight(primaryBounds: Bounds, windowWidth: number): MonitorPosition {
  return {
    left: primaryBounds.x + primaryBounds.width - windowWidth - FIRST_RUN_PADDING_PX,
    top: primaryBounds.y + FIRST_RUN_PADDING_PX,
  }
}

/**
 * `ResetToDefaults`'s "Center on primary screen" -- the one other place the app moves itself.
 *
 * BOUNDS again, and for the same reason as `positionTopRight`: the C# reads
 * `SystemParameters.PrimaryScreenWidth/Height`, which is the primary's full extent. So a reset on a
 * machine with a taskbar centres the widget slightly high of the visible middle, in WPF too.
 *
 * The C# result can be negative -- a window taller than the primary centres above its top edge --
 * and that is not clamped here. `ResetToDefaults` sets `_hasUserPosition = true`, so the position
 * goes through the same save-and-restore path as a dragged one, and the clamp belongs at the caller
 * where the target work area is known.
 */
export function centreOnPrimary(primaryBounds: Bounds, windowWidth: number, windowHeight: number): MonitorPosition {
  return {
    left: primaryBounds.x + (primaryBounds.width - windowWidth) / 2,
    top: primaryBounds.y + (primaryBounds.height - windowHeight) / 2,
  }
}

/**
 * `SnapToEdge` (SNAP-03) -- after a drag, if an edge landed within 8px of a work-area edge, go flush.
 *
 * Work area, not bounds: snapping flush to the bottom of the *screen* would put the widget behind the
 * taskbar. Each axis is independent, and within an axis the near edge wins outright -- the `else if`
 * is what stops a window wider than the work area from being pulled both ways.
 *
 * Called only post-drag. Never from a timer or a resize: a phrase change resizes the window, and
 * re-snapping on every resize would let the widget creep along an edge on its own.
 */
export function snapToEdge(
  position: MonitorPosition,
  windowWidth: number,
  windowHeight: number,
  workArea: Bounds,
): MonitorPosition {
  const waRight = workArea.x + workArea.width
  const waBottom = workArea.y + workArea.height

  let left = position.left
  if (Math.abs(position.left - workArea.x) <= EDGE_SNAP_THRESHOLD_PX) {
    left = workArea.x
  } else if (Math.abs(position.left + windowWidth - waRight) <= EDGE_SNAP_THRESHOLD_PX) {
    left = waRight - windowWidth
  }

  let top = position.top
  if (Math.abs(position.top - workArea.y) <= EDGE_SNAP_THRESHOLD_PX) {
    top = workArea.y
  } else if (Math.abs(position.top + windowHeight - waBottom) <= EDGE_SNAP_THRESHOLD_PX) {
    top = waBottom - windowHeight
  }

  return { left, top }
}

/** How `resolveStartPosition` decided, so a caller can log it and a test can assert on it. */
export type PlacementSource =
  /** No saved monitor, or no position saved for it: `PositionTopRight` on the primary. */
  | "first-run"
  /** The saved monitor key matched a connected display exactly. */
  | "key"
  /** The key missed, but the saved position still lands on some connected display. */
  | "geometry"
  /** The key missed and the position is on no display: recovered onto the primary. */
  | "primary"
  /** No displays attached. */
  | "no-display"

export interface StartPositionRequest {
  readonly monitorPositions: Readonly<Record<string, MonitorPosition>>
  readonly lastActiveMonitor: string
  readonly displays: readonly DisplayGeometry[]
  readonly windowWidth: number
  readonly windowHeight: number
}

export interface StartPositionResult {
  readonly position: MonitorPosition
  /** The key of the display the window ended up on, or `""` when there is none to name. */
  readonly displayKey: string
  readonly source: PlacementSource
  /** True when the clamp moved the saved position. The falsifier ISC-19 actually cares about. */
  readonly clamped: boolean
}

/**
 * Startup placement: the composition `ApplySettings` + `ContentRendered` performs, in one pass.
 *
 * Resolution order, and every step of it is a real case off Alex's desk rather than a hypothetical:
 *
 *   1. `lastActiveMonitor` empty, or no position stored under it -> first-run, top-right on primary.
 *      `""` is the sentinel AppSettings.cs documents for exactly this.
 *   2. The key names a connected display -> clamp into its WORK AREA. The normal restart.
 *   3. The key misses but the saved position lands inside some display's bounds -> clamp into that
 *      one. This is the display-configuration change ISC-19 names: a geometry key re-keys when a
 *      monitor moves, and re-homing on containment restores to the right screen anyway. The WPF app
 *      had no equivalent -- `FindScreenForKey` went straight to the primary.
 *   4. Otherwise -> clamp the saved position into the PRIMARY's work area. This is the arm that
 *      matters, and it is why ISC-19's falsifier is "the window restored off-screen" rather than
 *      "the position was lost": his own file has `display5` at (-227, 510), which lies on no display
 *      he owns. Measured against the C# `Clamp`, that recovers to (0, 510) on his 3440x1400 primary
 *      work area -- on-screen, near the height the user left it, which is the whole intent.
 */
export function resolveStartPosition(request: StartPositionRequest): StartPositionResult {
  const { monitorPositions, lastActiveMonitor, displays, windowWidth, windowHeight } = request

  const primary = primaryDisplay(displays)
  if (primary === null) {
    // Nothing attached. Returning the saved position untouched is the only non-destructive answer:
    // inventing (0,0) would overwrite a good position with a guess on the next save.
    const saved = monitorPositions[lastActiveMonitor]
    return {
      position: saved ?? { left: 0, top: 0 },
      displayKey: "",
      source: "no-display",
      clamped: false,
    }
  }

  const saved = lastActiveMonitor === "" ? undefined : monitorPositions[lastActiveMonitor]
  if (saved === undefined) {
    return {
      position: positionTopRight(primary.bounds, windowWidth),
      displayKey: displayKey(primary),
      source: "first-run",
      clamped: false,
    }
  }

  const keyed = findDisplayByKey(lastActiveMonitor, displays)
  // Which BRANCH matched, never which display it happens to be. Deriving the source from
  // `target === primary` reports "primary" for a position that was correctly re-homed by geometry
  // onto the primary -- a real case (a stale WPF key over a position on the main monitor), and one
  // where the log would then claim a recovery that did not happen.
  const contained = keyed === null ? findDisplayContaining(saved, displays) : null
  const target = keyed ?? contained ?? primary
  const source: PlacementSource = keyed !== null ? "key" : contained !== null ? "geometry" : "primary"

  const position = clampPosition(saved, windowWidth, windowHeight, target.workArea)
  // The key reported is the display the window ENDED UP on, never the one the settings asked for --
  // the caller saves this back, so reporting the requested key would re-save a key that resolves to
  // nothing and orphan the position permanently.
  return {
    position,
    displayKey: displayKey(target),
    source,
    clamped: position.left !== saved.left || position.top !== saved.top,
  }
}
