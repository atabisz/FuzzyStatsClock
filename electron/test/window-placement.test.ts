/**
 * `main/window-placement.ts` -- the Electron adapter around `core/placement.ts`.
 *
 * Runs under plain `bun test` with no Electron on the path, which is the whole reason that module
 * carries no Electron import: `ScreenLike` and `WindowLike` are structural, so a fake screen whose
 * display list can be REASSIGNED mid-test models an unplug exactly, and a fake window records every
 * `setPosition` call.
 *
 * ## The arm the `CommitReason` type exists for
 *
 * "a display change does NOT drop the source monitor's saved position". Before the refactor, `commit`
 * took `{ snap: boolean }` and dropped the source key whenever the display had changed -- so wiring
 * `screen`'s `display-removed` event to it would have DELETED the position the user set on a monitor at
 * the moment that monitor was unplugged. Silent, permanent, and discovered only when they plugged it
 * back in and found the widget somewhere else. Two tests here pin that, one per non-drag reason.
 *
 * The geometry itself is covered in `placement.test.ts` against the recorded C# `Clamp`. What is new
 * here is the composition: which display a rect is on, when a position is dropped, and what `changed`
 * reports -- because `main.ts` skips the file write when it is false.
 */

import { describe, expect, test } from "bun:test"
import type { Bounds } from "../src/core/display-key.js"
import { displayKey, findDisplayContaining } from "../src/core/display-key.js"
import { snapToEdge } from "../src/core/placement.js"
import { DEFAULTS } from "../src/core/settings.js"
import type { AppSettings, MonitorPosition } from "../src/core/settings.js"
import type { DisplayLike, ScreenLike, WindowLike } from "../src/main/window-placement.js"
import { WindowPlacer, displayForRect, displayGeometries, toGeometry } from "../src/main/window-placement.js"

/**
 * ISC-7's measured desk, in Electron's own `Display` shape. Both LG entries carry the IDENTICAL label,
 * which is not a typo -- it is the measured reason `MonitorService`'s friendly-name key could not be
 * ported, and it belongs in the fixture so any future name-based scheme fails here first.
 */
const INTERNAL: DisplayLike = {
  id: 1,
  label: "Built-in Display",
  bounds: { x: 3441, y: -499, width: 1920, height: 1080 },
  workArea: { x: 3441, y: -499, width: 1920, height: 1040 },
  scaleFactor: 1.0,
}
const LG_PRIMARY: DisplayLike = {
  id: 2,
  label: "LG HDR WQHD",
  bounds: { x: 0, y: 0, width: 3440, height: 1440 },
  workArea: { x: 0, y: 0, width: 3440, height: 1400 },
  scaleFactor: 1.0,
}
const LG_SECOND: DisplayLike = {
  id: 3,
  label: "LG HDR WQHD",
  bounds: { x: 1, y: -1440, width: 3440, height: 1440 },
  workArea: { x: 1, y: -1440, width: 3440, height: 1440 },
  scaleFactor: 1.0,
}
const DESK: readonly DisplayLike[] = [INTERNAL, LG_PRIMARY, LG_SECOND]

/** Electron always has a primary; only a test can reach an empty display list. */
const NO_DISPLAY: DisplayLike = {
  id: -1,
  label: "",
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  workArea: { x: 0, y: 0, width: 0, height: 0 },
  scaleFactor: 1.0,
}

class FakeScreen implements ScreenLike {
  displays: readonly DisplayLike[]
  primaryId: number

  constructor(displays: readonly DisplayLike[] = DESK, primaryId = LG_PRIMARY.id) {
    this.displays = displays
    this.primaryId = primaryId
  }

  getAllDisplays(): DisplayLike[] {
    return [...this.displays]
  }

  getPrimaryDisplay(): DisplayLike {
    return this.displays.find((d) => d.id === this.primaryId) ?? NO_DISPLAY
  }
}

class FakeWindow implements WindowLike {
  bounds: Bounds
  destroyed = false
  readonly moves: { x: number; y: number }[] = []

  constructor(bounds: Bounds) {
    this.bounds = bounds
  }

  getBounds(): Bounds {
    return this.bounds
  }

  setPosition(x: number, y: number): void {
    this.moves.push({ x, y })
    this.bounds = { x, y, width: this.bounds.width, height: this.bounds.height }
  }

  isDestroyed(): boolean {
    return this.destroyed
  }
}

const keyOf = (display: DisplayLike): string => displayKey(toGeometry(display, -1))
const LG_KEY = keyOf(LG_PRIMARY)
const INTERNAL_KEY = keyOf(INTERNAL)
const LG2_KEY = keyOf(LG_SECOND)

function settingsWith(positions: Record<string, MonitorPosition>, lastActive: string): AppSettings {
  return { ...DEFAULTS, monitorPositions: positions, lastActiveMonitor: lastActive }
}

function rect(x: number, y: number): Bounds {
  return { x, y, width: 232, height: 260 }
}

function collect(): { log: (level: "info" | "warn" | "error", message: string) => void; lines: string[] } {
  const lines: string[] = []
  return { log: (level, message) => lines.push(`${level}: ${message}`), lines }
}

describe("toGeometry", () => {
  test("carries the four geometry fields and the label through unchanged", () => {
    expect(toGeometry(INTERNAL, LG_PRIMARY.id)).toEqual({
      bounds: INTERNAL.bounds,
      workArea: INTERNAL.workArea,
      scaleFactor: INTERNAL.scaleFactor,
      label: INTERNAL.label,
      isPrimary: false,
    })
  })

  test("isPrimary is COMPUTED from the id -- Electron's Display has no such field", () => {
    // The whole mechanism. `screen.getPrimaryDisplay().id` is the only signal, so primacy has to be
    // resolved where both ids are in hand; a `d.isPrimary` read would silently be `undefined` forever.
    expect(toGeometry(LG_PRIMARY, LG_PRIMARY.id).isPrimary).toBe(true)
    expect(toGeometry(LG_PRIMARY, INTERNAL.id).isPrimary).toBe(false)
  })
})

describe("displayGeometries", () => {
  test("one geometry per display, exactly one marked primary", () => {
    const geometries = displayGeometries(new FakeScreen())
    expect(geometries).toHaveLength(3)
    expect(geometries.filter((g) => g.isPrimary === true)).toHaveLength(1)
    expect(geometries.find((g) => g.isPrimary === true)?.bounds).toEqual(LG_PRIMARY.bounds)
  })

  test("the three keys are distinct even though two labels are identical", () => {
    // ISC-7's finding, asserted rather than described: both LG panels report "LG HDR WQHD", so a
    // label-keyed scheme would collapse two monitors into one and share a saved position between them.
    const keys = displayGeometries(new FakeScreen()).map(displayKey)
    expect(new Set(keys).size).toBe(3)
    expect(LG_PRIMARY.label).toBe(LG_SECOND.label)
  })

  test("an empty display list is an empty array, not a throw", () => {
    expect(displayGeometries(new FakeScreen([]))).toEqual([])
  })
})

describe("displayForRect", () => {
  const desk = displayGeometries(new FakeScreen())

  test("the CENTRE decides, not the top-left", () => {
    // A window straddling the seam at x=3440: top-left on the primary LG, centre on the internal panel.
    // The C# resolves with `FromDipPoint(Left + ActualWidth / 2, ...)`, and using the top-left instead
    // would snap this window to the LG's edges -- dragging it back across the seam the user just crossed.
    const straddling = rect(3400, 0)
    expect(displayForRect(straddling, desk)?.bounds).toEqual(INTERNAL.bounds)
    expect(displayForRect({ ...straddling, width: 0, height: 0 }, desk)?.bounds).toEqual(LG_PRIMARY.bounds)
  })

  test("a centre in the dead space of an L-shaped desktop falls back to the top-left", () => {
    // (4116, 630) is on no display: the internal panel's y range stops at 581 and neither LG reaches
    // x=4116. Real on this desk, and the reason there are two containment attempts rather than one.
    // The dead-space claim is checked against `findDisplayContaining`, not against `displayForRect` --
    // that function's third arm is the primary, so it never answers null while a display exists, and an
    // assertion on it would have proved nothing about the second arm.
    expect(findDisplayContaining({ left: 4116, top: 630 }, desk)).toBe(null)
    expect(findDisplayContaining({ left: 4000, top: 500 }, desk)?.bounds).toEqual(INTERNAL.bounds)
    expect(displayForRect(rect(4000, 500), desk)?.bounds).toEqual(INTERNAL.bounds)
  })

  test("a rect on no display at all falls back to the primary", () => {
    expect(displayForRect(rect(-5000, -5000), desk)?.bounds).toEqual(LG_PRIMARY.bounds)
  })

  test("no displays -> null, and the caller decides what that means", () => {
    expect(displayForRect(rect(0, 0), [])).toBe(null)
  })
})

describe("WindowPlacer.restore (ISC-19)", () => {
  test("currentKey is empty before the first restore", () => {
    expect(new WindowPlacer(new FakeWindow(rect(0, 0)), new FakeScreen()).currentKey).toBe("")
  })

  test("the ordinary restart: the window is moved to the saved position and the key recorded", () => {
    const win = new FakeWindow(rect(0, 0))
    const placer = new WindowPlacer(win, new FakeScreen())
    const result = placer.restore(settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY))

    expect(result.source).toBe("key")
    expect(win.moves).toEqual([{ x: 1620, y: 20 }])
    expect(placer.currentKey).toBe(LG_KEY)
  })

  test("the window's OWN size is used, not a guess -- WPF's 300x300 pre-Show placeholder is gone", () => {
    // A wider window lands further left on a first run, because `positionTopRight` subtracts the real
    // width. `SizeToContent` left `ActualWidth` at 0 until after `Show()`, which is why the C# guessed.
    const wide = new FakeWindow({ x: 0, y: 0, width: 400, height: 260 })
    const result = new WindowPlacer(wide, new FakeScreen()).restore(settingsWith({}, ""))
    expect(result.position).toEqual({ left: 3440 - 400 - 20, top: 20 })
    expect(wide.moves).toEqual([{ x: 3020, y: 20 }])
  })

  test("a fractional saved position is ROUNDED -- setPosition takes integers", () => {
    // Reachable: `centreOnPrimary` produces a half-pixel on an odd difference, and that value is saved.
    const win = new FakeWindow(rect(0, 0))
    new WindowPlacer(win, new FakeScreen()).restore(settingsWith({ [LG_KEY]: { left: 1620.4, top: 20.6 } }, LG_KEY))
    expect(win.moves).toEqual([{ x: 1620, y: 21 }])
  })

  test("THE ISC-19 ARM: a position on no display restores ON-SCREEN, and says it clamped", () => {
    // His live file: `display5` at (-227, 510), a key no Electron display can produce and a position on
    // none of his monitors. The falsifier is not "the position was lost" but "the window restored
    // off-screen", so the assertion is on where the window actually went.
    const win = new FakeWindow(rect(0, 0))
    const { log, lines } = collect()
    const placer = new WindowPlacer(win, new FakeScreen(), log)
    const result = placer.restore(settingsWith({ display5: { left: -227, top: 510 } }, "display5"))

    expect(result.clamped).toBe(true)
    expect(win.moves).toEqual([{ x: 0, y: 510 }])
    expect(placer.currentKey).toBe(LG_KEY)
    expect(lines[0]).toContain("CLAMPED back on-screen")
  })

  test("no displays: the position is handed back untouched and the key stays empty", () => {
    const win = new FakeWindow(rect(0, 0))
    const placer = new WindowPlacer(win, new FakeScreen([]))
    const result = placer.restore(settingsWith({ display5: { left: -227, top: 510 } }, "display5"))

    expect(result.source).toBe("no-display")
    expect(win.moves).toEqual([{ x: -227, y: 510 }])
    expect(placer.currentKey).toBe("")
  })
})

describe('WindowPlacer.commit("drag") (ISC-20)', () => {
  test("snaps to the work-area edge", () => {
    const win = new FakeWindow(rect(5, 500))
    const placer = new WindowPlacer(win, new FakeScreen())
    const update = placer.commit(settingsWith({}, ""), "drag")

    expect(win.moves).toEqual([{ x: 0, y: 500 }])
    expect(update.monitorPositions[LG_KEY]).toEqual({ left: 0, top: 500 })
    expect(update.changed).toBe(true)
  })

  test("the clamp corrects a snap that would have left the window off-screen", () => {
    // A window WIDER than the work area, positioned so its RIGHT edge is within 8px of the work area's.
    // The snap alone answers -72 -- flush to a right edge, at a left the window cannot legally have --
    // and it is the clamp that anchors it at the work area's left instead. `snapToEdge` is called
    // directly for that first number, so a composition that dropped the clamp fails this arm rather
    // than reading as an equivalent refactor.
    const wa = LG_PRIMARY.workArea
    const width = 3512
    expect(snapToEdge({ left: -75, top: 500 }, width, 100, wa).left).toBe(wa.width - width)
    expect(wa.width - width).toBe(-72)

    const win = new FakeWindow({ x: -75, y: 500, width, height: 100 })
    const update = new WindowPlacer(win, new FakeScreen()).commit(settingsWith({}, ""), "drag")
    expect(update.monitorPositions[LG_KEY]).toEqual({ left: 0, top: 500 })
    expect(win.moves).toEqual([{ x: 0, y: 500 }])
  })

  test("a drag across the seam drops the SOURCE monitor's saved position", () => {
    // `Grid_MouseLeftButtonDown`, "per design decision": the user just said where they want it, so a
    // stale entry for the monitor they dragged it off would restore to a place they abandoned.
    const win = new FakeWindow(rect(1620, 20))
    const screen = new FakeScreen()
    const placer = new WindowPlacer(win, screen)
    const settings = settingsWith({ [LG_KEY]: { left: 1620, top: 20 }, [LG2_KEY]: { left: 100, top: -1000 } }, LG_KEY)
    placer.restore(settings)

    win.bounds = rect(4000, -100)
    const update = placer.commit(settings, "drag")

    expect(update.removedKey).toBe(LG_KEY)
    expect(update.lastActiveMonitor).toBe(INTERNAL_KEY)
    expect(update.monitorPositions).toEqual({
      [INTERNAL_KEY]: { left: 4000, top: -100 },
      // Untouched: the drag says nothing about a monitor it never visited.
      [LG2_KEY]: { left: 100, top: -1000 },
    })
    expect(placer.currentKey).toBe(INTERNAL_KEY)
  })

  test("a drag WITHIN one monitor drops nothing", () => {
    const win = new FakeWindow(rect(1620, 20))
    const placer = new WindowPlacer(win, new FakeScreen())
    const settings = settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY)
    placer.restore(settings)

    win.bounds = rect(2000, 600)
    const update = placer.commit(settings, "drag")

    expect(update.removedKey).toBe(null)
    expect(update.monitorPositions).toEqual({ [LG_KEY]: { left: 2000, top: 600 } })
  })

  test("nothing is dropped before the first restore, when there is no source monitor to name", () => {
    // `activeKey` is `""` here. Deleting under that key would be a no-op, but the guard is what keeps
    // `removedKey` from reporting a removal that never happened into the log.
    const placer = new WindowPlacer(new FakeWindow(rect(4000, -100)), new FakeScreen())
    const update = placer.commit(settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY), "drag")
    expect(update.removedKey).toBe(null)
    expect(update.monitorPositions[LG_KEY]).toEqual({ left: 1620, top: 20 })
  })

  test("two successive cross-monitor drags each drop the monitor just left", () => {
    // The state `activeKey` exists for: after the first drag it must name the INTERNAL panel, or the
    // second drag would delete the entry the first one just wrote.
    const win = new FakeWindow(rect(1620, 20))
    const placer = new WindowPlacer(win, new FakeScreen())
    let settings = settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY)
    placer.restore(settings)

    win.bounds = rect(4000, -100)
    let update = placer.commit(settings, "drag")
    expect(update.removedKey).toBe(LG_KEY)
    settings = { ...settings, monitorPositions: update.monitorPositions, lastActiveMonitor: update.lastActiveMonitor }

    win.bounds = rect(100, -1000)
    update = placer.commit(settings, "drag")
    expect(update.removedKey).toBe(INTERNAL_KEY)
    expect(update.monitorPositions).toEqual({ [LG2_KEY]: { left: 100, top: -1000 } })
  })
})

describe("WindowPlacer.commit -- the non-drag reasons", () => {
  /** An unplug: restore onto the internal panel, then take it away. */
  function afterUnplug(): { win: FakeWindow; placer: WindowPlacer; settings: AppSettings } {
    const win = new FakeWindow(rect(0, 0))
    const screen = new FakeScreen()
    const placer = new WindowPlacer(win, screen)
    const settings = settingsWith({ [INTERNAL_KEY]: { left: 4000, top: -100 }, [LG_KEY]: { left: 1620, top: 20 } }, INTERNAL_KEY)
    placer.restore(settings)
    expect(placer.currentKey).toBe(INTERNAL_KEY)

    screen.displays = [LG_PRIMARY, LG_SECOND]
    return { win, placer, settings }
  }

  test('"display-change" KEEPS the unplugged monitor\'s saved position', () => {
    // The regression the `CommitReason` type exists to prevent. The old `{ snap: false }` shape dropped
    // the source key on any key change, so unplugging a monitor deleted the position set on it -- the
    // one thing the user wants back when they plug it in again.
    const { win, placer, settings } = afterUnplug()
    const update = placer.commit(settings, "display-change")

    expect(update.removedKey).toBe(null)
    expect(update.monitorPositions[INTERNAL_KEY]).toEqual({ left: 4000, top: -100 })
    // And the window is recovered onto the display that is still there, inside its work area.
    expect(win.moves[win.moves.length - 1]).toEqual({ x: 3208, y: 0 })
    expect(update.lastActiveMonitor).toBe(LG_KEY)
  })

  test('"reset" likewise keeps every saved position', () => {
    const { placer, settings } = afterUnplug()
    const update = placer.commit(settings, "reset")
    expect(update.removedKey).toBe(null)
    expect(update.monitorPositions[INTERNAL_KEY]).toEqual({ left: 4000, top: -100 })
  })

  test.each([["display-change"], ["reset"]] as const)("%s does NOT snap to the edge", (reason) => {
    // `SnapToEdge` runs from `Grid_MouseLeftButtonUp` and nowhere else. Snapping on a display event
    // would move a window the user never touched; snapping on a timer would let it creep along an edge.
    const win = new FakeWindow(rect(5, 500))
    const update = new WindowPlacer(win, new FakeScreen()).commit(settingsWith({}, ""), reason)
    expect(win.moves).toEqual([])
    expect(update.monitorPositions[LG_KEY]).toEqual({ left: 5, top: 500 })
  })

  test.each([["display-change"], ["reset"]] as const)("%s still CLAMPS -- recovery is the point", (reason) => {
    const win = new FakeWindow(rect(99999, 99999))
    const update = new WindowPlacer(win, new FakeScreen()).commit(settingsWith({}, ""), reason)
    expect(update.monitorPositions[LG_KEY]).toEqual({ left: 3208, top: 1140 })
    expect(win.moves).toEqual([{ x: 3208, y: 1140 }])
  })
})

describe("WindowPlacer.commit -- what `changed` reports", () => {
  test("false when the window has not moved off its saved position", () => {
    // `main.ts` skips the file write on false. Without it, switching a monitor on fires five display
    // events and each one becomes a settings write for a window that never moved.
    const win = new FakeWindow(rect(1620, 20))
    const placer = new WindowPlacer(win, new FakeScreen())
    const settings = settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY)
    placer.restore(settings)

    const update = placer.commit(settings, "display-change")
    expect(update.changed).toBe(false)
    expect(win.moves).toHaveLength(1) // the restore's, and nothing since
  })

  test("true when only the monitor changed, at an identical position", () => {
    // The window sits at (1620, 20) on the primary LG while the settings claim the second LG. Same
    // numbers, different monitor -- and the key is what restore reads next launch, so this must save.
    const placer = new WindowPlacer(new FakeWindow(rect(1620, 20)), new FakeScreen())
    const update = placer.commit(settingsWith({ [LG2_KEY]: { left: 1620, top: 20 } }, LG2_KEY), "display-change")
    expect(update.changed).toBe(true)
    expect(update.lastActiveMonitor).toBe(LG_KEY)
  })

  test("true when the monitor has no saved position yet", () => {
    const placer = new WindowPlacer(new FakeWindow(rect(1620, 20)), new FakeScreen())
    expect(placer.commit(settingsWith({}, LG_KEY), "display-change").changed).toBe(true)
  })
})

describe("WindowPlacer.commit -- the bail-outs", () => {
  test("a destroyed window changes nothing and is not touched", () => {
    // Reachable: the drag-end IPC message and `before-quit` can interleave.
    const win = new FakeWindow(rect(5, 500))
    win.destroyed = true
    const settings = settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY)
    const update = new WindowPlacer(win, new FakeScreen()).commit(settings, "drag")

    expect(update).toEqual({
      monitorPositions: { [LG_KEY]: { left: 1620, top: 20 } },
      lastActiveMonitor: LG_KEY,
      removedKey: null,
      changed: false,
    })
    expect(win.moves).toEqual([])
  })

  test("no displays: nothing is saved, and it says so", () => {
    // The position the window has right now is not one the user chose, and a key of "" would orphan it.
    const win = new FakeWindow(rect(5, 500))
    const { log, lines } = collect()
    const settings = settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY)
    const update = new WindowPlacer(win, new FakeScreen([]), log).commit(settings, "drag")

    expect(update.changed).toBe(false)
    expect(update.monitorPositions).toEqual({ [LG_KEY]: { left: 1620, top: 20 } })
    expect(win.moves).toEqual([])
    expect(lines).toEqual(["warn: placement: no displays -- position not saved"])
  })

  test("the returned map is a COPY -- the caller merges it into settings", () => {
    // Both paths: the bail-out and the ordinary one. Handing back the same object would let `main.ts`
    // mutate the settings it is about to compare against, and `changed` would then always read false.
    const settings = settingsWith({ [LG_KEY]: { left: 1620, top: 20 } }, LG_KEY)
    const placer = new WindowPlacer(new FakeWindow(rect(5, 500)), new FakeScreen())
    expect(placer.commit(settings, "drag").monitorPositions).not.toBe(settings.monitorPositions)

    const destroyed = new FakeWindow(rect(5, 500))
    destroyed.destroyed = true
    const bailed = new WindowPlacer(destroyed, new FakeScreen()).commit(settings, "drag")
    expect(bailed.monitorPositions).not.toBe(settings.monitorPositions)
    expect(settings.monitorPositions[LG_KEY]).toEqual({ left: 1620, top: 20 })
  })
})
