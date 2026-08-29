/**
 * The Electron side of placement: `screen` and `BrowserWindow` in, `core/placement.ts` out.
 *
 * ISC-19 and ISC-20 live here. Everything with arithmetic in it is in `core/placement.ts` and tested
 * there; this file is the adapter, and it is structurally typed for the same reason `platform.ts` is
 * -- **no Electron import, not even a type one** -- so the two decisions it makes on its own can be
 * tested with a fake screen and a fake window:
 *
 *   1. WHICH display a window is on, which the C# answers with the window's CENTRE, not its top-left.
 *   2. What a drag commits, including the source monitor's entry being dropped on a cross-monitor drag.
 *
 * ## The centre rule is not incidental
 *
 * `MainWindow.SnapToEdge` and the post-phrase-change re-clamp both resolve their screen with
 * `ScreenDpi.FromDipPoint(Left + ActualWidth / 2, Top + ActualHeight / 2)`. Using the top-left instead
 * would snap a window whose centre is on the next monitor to THIS monitor's edges -- dragging it back
 * across the seam the user just crossed. Faithful, and load-bearing on a 3-display desk.
 *
 * ## ISC-20 diverges from `DragMove`, in timing rather than in behaviour
 *
 * WPF's `DragMove` is a blocking Win32 modal loop with no containment at all, so a WPF user can drop
 * the widget straddling two monitors. ISC-20 requires the window to stay within the target display's
 * work area, so the drop clamps. That reads like a divergence and is barely one: the WPF app clamps
 * the same window against the same centre-display work area on its very next phrase change
 * (`UpdatePhraseIfChanged`'s `_hasUserPosition` branch), which is within five minutes. So a straddling
 * WPF window was already temporary; this makes it immediate.
 */

import type { Bounds, DisplayGeometry } from "../core/display-key.js"
import { displayKey, findDisplayContaining, primaryDisplay } from "../core/display-key.js"
import { clampPosition, resolveStartPosition, snapToEdge } from "../core/placement.js"
import type { StartPositionResult } from "../core/placement.js"
import type { AppSettings, MonitorPosition } from "../core/settings.js"

/** The fields of `Electron.Display` this port uses. Structural, so a test can pass a literal. */
export interface DisplayLike {
  readonly id: number
  readonly label: string
  readonly bounds: Bounds
  readonly workArea: Bounds
  readonly scaleFactor: number
}

export interface ScreenLike {
  getAllDisplays(): DisplayLike[]
  getPrimaryDisplay(): DisplayLike
}

export interface WindowLike {
  getBounds(): Bounds
  setPosition(x: number, y: number): void
  isDestroyed(): boolean
}

type Logger = (level: "info" | "warn" | "error", message: string) => void

/**
 * `Electron.Display` -> `DisplayGeometry`.
 *
 * `isPrimary` is computed by id rather than read, because Electron has no such field: primacy is
 * `screen.getPrimaryDisplay().id`, and the comparison has to happen where both are in hand.
 */
export function toGeometry(display: DisplayLike, primaryId: number): DisplayGeometry {
  return {
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    label: display.label,
    isPrimary: display.id === primaryId,
  }
}

export function displayGeometries(screen: ScreenLike): DisplayGeometry[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => toGeometry(d, primaryId))
}

/**
 * The display a window rect is on: by CENTRE, as the C# does.
 *
 * Two fallbacks, in this order. Top-left containment covers a window whose centre is in the dead
 * space of an L-shaped desktop -- real on Alex's setup, where the internal panel's y range does not
 * overlap either LG's. The primary covers a window on no display at all, which is a real state after
 * a monitor is unplugged and the only alternative is refusing to snap or save at all.
 */
export function displayForRect(rect: Bounds, displays: readonly DisplayGeometry[]): DisplayGeometry | null {
  const centre = { left: rect.x + rect.width / 2, top: rect.y + rect.height / 2 }
  return (
    findDisplayContaining(centre, displays) ??
    findDisplayContaining({ left: rect.x, top: rect.y }, displays) ??
    primaryDisplay(displays)
  )
}

/**
 * Why `commit` is being called. One argument rather than two booleans, because the two behaviours it
 * selects must never be mixed.
 *
 *   - `"drag"` snaps to the work-area edge AND drops the source monitor's saved position. Both are
 *     `Grid_MouseLeftButtonUp` behaviour and both are correct only when a human just moved the window.
 *   - `"display-change"` does neither. It re-clamps the window into whichever display now holds it and
 *     re-keys, and it must NOT drop anything: a monitor being unplugged would otherwise delete the
 *     position the user set on that monitor, which is the one thing they want back when they plug it in
 *     again. That failure is silent and permanent, which is why this is not a `snap: false` call.
 *   - `"reset"` behaves as `"display-change"` and is a separate name on purpose: it is the only caller
 *     that has already emptied `monitorPositions`, and reading `"display-change"` in that log line
 *     would send a future reader looking for a monitor event that never happened.
 */
export type CommitReason = "drag" | "display-change" | "reset"

/** What a placement change asks the caller to persist. Merged into settings by `main.ts`. */
export interface PlacementUpdate {
  readonly monitorPositions: Record<string, MonitorPosition>
  readonly lastActiveMonitor: string
  /** The source monitor's key, dropped by a cross-monitor drag. Null when nothing was dropped. */
  readonly removedKey: string | null
  /** False when the window did not move -- the caller can skip the write entirely. */
  readonly changed: boolean
}

/**
 * Places the window and reports what to save. Owns exactly one piece of state: which display the
 * window is currently on, which is what makes a cross-monitor drag detectable.
 */
export class WindowPlacer {
  private readonly win: WindowLike
  private readonly screen: ScreenLike
  private readonly log: Logger
  private activeKey = ""

  constructor(win: WindowLike, screen: ScreenLike, log: Logger = () => {}) {
    this.win = win
    this.screen = screen
    this.log = log
  }

  /** The key of the display the window is on, as last placed. `""` before the first `restore`. */
  get currentKey(): string {
    return this.activeKey
  }

  /**
   * Startup placement (ISC-19). Call once, after the window is created and BEFORE `show()`.
   *
   * Before `show()` on purpose: Electron knows the window's size at construction, so there is nothing
   * to wait for, and placing a visible window would show it jumping across the desktop -- which is
   * exactly what WPF's two-stage restore looks like when you watch it.
   */
  restore(settings: AppSettings): StartPositionResult {
    const bounds = this.win.getBounds()
    const result = resolveStartPosition({
      monitorPositions: settings.monitorPositions,
      lastActiveMonitor: settings.lastActiveMonitor,
      displays: displayGeometries(this.screen),
      windowWidth: bounds.width,
      windowHeight: bounds.height,
    })
    this.win.setPosition(Math.round(result.position.left), Math.round(result.position.top))
    this.activeKey = result.displayKey
    this.log(
      "info",
      `placement: restored to (${String(result.position.left)}, ${String(result.position.top)}) ` +
        `on ${result.displayKey || "no display"} via ${result.source}` +
        (result.clamped ? " -- CLAMPED back on-screen" : ""),
    )
    return result
  }

  /**
   * Commit the window's current position (ISC-20). Called on drag end, and after a display change.
   *
   * Snapping happens only on `"drag"`, matching `SnapToEdge`'s "never from timers or phrase-resize
   * paths" -- a snap on a timer lets the widget creep along an edge without anyone touching it.
   *
   * The `"display-change"` call has no WPF counterpart: the app subscribes to no display event at all
   * (no `SystemEvents.DisplaySettingsChanged` anywhere in `FuzzyClock.App`), so unplugging a monitor
   * leaves the widget off-screen until `UpdatePhraseIfChanged`'s `_hasUserPosition` branch clamps it
   * on the next phrase change. Same recovery, same clamp, sooner -- the ISC-20 story exactly.
   */
  commit(settings: AppSettings, reason: CommitReason): PlacementUpdate {
    const unchanged: PlacementUpdate = {
      monitorPositions: { ...settings.monitorPositions },
      lastActiveMonitor: settings.lastActiveMonitor,
      removedKey: null,
      changed: false,
    }
    if (this.win.isDestroyed()) return unchanged

    const bounds = this.win.getBounds()
    const displays = displayGeometries(this.screen)
    const target = displayForRect(bounds, displays)
    if (target === null) {
      // No displays at all. Saving a position keyed on nothing would orphan it, and the position the
      // window has right now is not one the user chose.
      this.log("warn", "placement: no displays -- position not saved")
      return unchanged
    }

    const raw: MonitorPosition = { left: bounds.x, top: bounds.y }
    const snapped = reason === "drag" ? snapToEdge(raw, bounds.width, bounds.height, target.workArea) : raw
    // Clamp AFTER the snap: the snap moves the window to a work-area edge, which for a window larger
    // than the work area is outside the clamp's own range, and the clamp is the one that anchors it.
    const position = clampPosition(snapped, bounds.width, bounds.height, target.workArea)
    if (position.left !== bounds.x || position.top !== bounds.y) {
      this.win.setPosition(Math.round(position.left), Math.round(position.top))
    }

    const newKey = displayKey(target)
    const positions: Record<string, MonitorPosition> = { ...settings.monitorPositions }
    positions[newKey] = position

    // Cross-monitor drag drops the source monitor's saved position. Straight from
    // `Grid_MouseLeftButtonDown` ("per design decision"), and the reasoning holds: the user just told
    // us where they want the widget, and keeping a stale position for the monitor they dragged it OFF
    // means unplugging that monitor later restores to a place they abandoned.
    let removedKey: string | null = null
    if (reason === "drag" && this.activeKey !== "" && this.activeKey !== newKey && this.activeKey in positions) {
      delete positions[this.activeKey]
      removedKey = this.activeKey
    }

    const moved = position.left !== bounds.x || position.top !== bounds.y
    const rehomed = newKey !== settings.lastActiveMonitor
    const saved = settings.monitorPositions[newKey]
    const repositioned = saved === undefined || saved.left !== position.left || saved.top !== position.top
    this.activeKey = newKey

    return {
      monitorPositions: positions,
      lastActiveMonitor: newKey,
      removedKey,
      changed: moved || rehomed || repositioned || removedKey !== null,
    }
  }
}
