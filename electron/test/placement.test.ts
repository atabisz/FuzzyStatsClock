/**
 * The clamp table is RECORDED off the real C#: `fcappprobe.exe settings` calls
 * `SettingsService.Clamp` -- the actual method, compiled into a console harness -- and prints
 * fourteen rows at `G17`. Nine reproduce the ranges `SettingsServiceTests.cs` covers; five are new,
 * and deliberately so: every C# row uses a work area at the ORIGIN, which is the one case a
 * multi-monitor desk never presents. Two of the added rows use Alex's own work areas, and one of them
 * is the exact recovery ISC-19 turns on.
 *
 * `positionTopRight`, `snapToEdge` and `resolveStartPosition` are new coverage. The C# has no test for
 * any of the three (`MainWindow.xaml.cs` is not unit-testable -- `DragMove` is a blocking Win32 modal
 * loop and `ActualWidth` needs a rendered window), which is most of the reason they are pure
 * functions in this port. Their expectations come from reading the C# and from the same recorded
 * `Clamp`, never from running the WPF app.
 */
import { describe, expect, test } from "bun:test"
import type { DisplayGeometry } from "../src/core/display-key.js"
import { displayKey } from "../src/core/display-key.js"
import {
  EDGE_SNAP_THRESHOLD_PX,
  FIRST_RUN_PADDING_PX,
  centreOnPrimary,
  clampPosition,
  positionTopRight,
  resolveStartPosition,
  snapToEdge,
} from "../src/core/placement.js"

describe("clampPosition, measured against SettingsService.Clamp", () => {
  test.each([
    // left, top, w, h, area, -> expected. First nine: a 200x100 window on a 1920x1080 work area.
    [100, 50, 200, 100, { x: 0, y: 0, width: 1920, height: 1080 }, 100, 50],
    [-50, -10, 200, 100, { x: 0, y: 0, width: 1920, height: 1080 }, 0, 0],
    [1900, 1000, 200, 100, { x: 0, y: 0, width: 1920, height: 1080 }, 1720, 980],
    [-100, -50, 200, 100, { x: 0, y: 0, width: 1920, height: 1080 }, 0, 0],
    [500, 200, 200, 100, { x: 0, y: 0, width: 1920, height: 1080 }, 500, 200],
    // A window LARGER than the work area anchors top-left, from either direction. This is the arm the
    // two Math.Max calls exist for: without them the clamp range inverts and Math.Clamp throws.
    [9999, 9999, 2000, 1200, { x: 0, y: 0, width: 1920, height: 1080 }, 0, 0],
    [-9999, -9999, 2000, 1200, { x: 0, y: 0, width: 1920, height: 1080 }, 0, 0],
    // Exactly on the limit, and one past it.
    [1720, 980, 200, 100, { x: 0, y: 0, width: 1920, height: 1080 }, 1720, 980],
    [1721, 981, 200, 100, { x: 0, y: 0, width: 1920, height: 1080 }, 1720, 980],
    // A NON-ZERO-ORIGIN work area: his internal panel. No C# row covers this shape.
    [0, 0, 232, 260, { x: 3441, y: -499, width: 1920, height: 1040 }, 3441, 0],
    [3500, -400, 232, 260, { x: 3441, y: -499, width: 1920, height: 1040 }, 3500, -400],
    [99999, 99999, 232, 260, { x: 3441, y: -499, width: 1920, height: 1040 }, 5129, 281],
    // His two saved positions against his primary LG's work area.
    [1620, 20, 232, 260, { x: 0, y: 0, width: 3440, height: 1400 }, 1620, 20],
    [-227, 510, 232, 260, { x: 0, y: 0, width: 3440, height: 1400 }, 0, 510],
  ] as const)(
    "%#: (%p,%p) %px%p in %p -> (%p,%p)",
    (left, top, w, h, area, expectedLeft, expectedTop) => {
      expect(clampPosition({ left, top }, w, h, area)).toEqual({ left: expectedLeft, top: expectedTop })
    },
  )

  test("a clamp that changes nothing returns the same numbers, not a nudged copy", () => {
    // Guards against an off-by-one in the max arithmetic that would only show as a 1px drift per
    // restart -- the kind of bug that takes a week of restarts to notice.
    const area = { x: 0, y: 0, width: 3440, height: 1400 }
    let position = { left: 1620, top: 20 }
    for (let i = 0; i < 10; i++) position = clampPosition(position, 232, 260, area)
    expect(position).toEqual({ left: 1620, top: 20 })
  })
})

describe("positionTopRight", () => {
  test("20px in from the primary's top-right corner", () => {
    // `Left = SystemParameters.PrimaryScreenWidth - ActualWidth - 20; Top = 20`
    expect(positionTopRight({ x: 0, y: 0, width: 3440, height: 1440 }, 232)).toEqual({ left: 3188, top: 20 })
    expect(FIRST_RUN_PADDING_PX).toBe(20)
  })

  test("BOUNDS, not work area -- faithful to SystemParameters.PrimaryScreenWidth", () => {
    // Structural rather than numeric: the function takes only `bounds`, so there is no work area it
    // could consult. That IS the faithfulness claim -- a taskbar-aware variant would need a second
    // argument, and a right-docked taskbar therefore tucks the widget partly behind it here and in WPF.
    expect(positionTopRight({ x: 0, y: 0, width: 1920, height: 1080 }, 300)).toEqual({ left: 1600, top: 20 })
  })

  test("a primary that is not at the virtual-desktop origin", () => {
    // The C# omits an x offset because Windows guarantees the primary sits at 0,0. macOS does not, so
    // the port adds `bounds.x`/`bounds.y` -- a no-op on Windows.
    // -1440 + 1440 - 232 - 20 = -252, and -200 + 20 = -180.
    expect(positionTopRight({ x: -1440, y: -200, width: 1440, height: 900 }, 232)).toEqual({
      left: -252,
      top: -180,
    })
  })

  test("the padding applies on BOTH axes", () => {
    // The two rows above were originally written with the x padding dropped, and they read plausibly:
    // `1920 - 300` is 1620, which is also the left edge in Alex's live settings file. The C# is
    // `Left = PrimaryScreenWidth - ActualWidth - Padding` and `Top = Padding` (MainWindow.xaml.cs:1367),
    // so an implementation that padded only the top would be off by exactly 20px forever.
    const at = positionTopRight({ x: 0, y: 0, width: 1000, height: 1000 }, 100)
    expect(at.left).toBe(1000 - 100 - FIRST_RUN_PADDING_PX)
    expect(at.top).toBe(FIRST_RUN_PADDING_PX)
  })
})

describe("centreOnPrimary (ResetToDefaults)", () => {
  test("`(PrimaryScreenWidth - ActualWidth) / 2`, both axes", () => {
    expect(centreOnPrimary({ x: 0, y: 0, width: 1920, height: 1080 }, 232, 260)).toEqual({
      left: (1920 - 232) / 2,
      top: (1080 - 260) / 2,
    })
  })

  test("BOUNDS again, so a taskbar shifts the visual centre -- in WPF too", () => {
    // Same argument as `positionTopRight`: `SystemParameters.PrimaryScreenHeight` is the full extent,
    // so a 40px bottom taskbar leaves the widget 20px high of the visible middle.
    expect(centreOnPrimary({ x: 0, y: 0, width: 3440, height: 1440 }, 232, 260)).toEqual({
      left: 1604,
      top: 590,
    })
  })

  test("offset by a non-origin primary", () => {
    expect(centreOnPrimary({ x: -1440, y: -200, width: 1440, height: 900 }, 232, 260)).toEqual({
      left: -1440 + (1440 - 232) / 2,
      top: -200 + (900 - 260) / 2,
    })
  })

  test("a window larger than the primary centres NEGATIVE, and is not clamped here", () => {
    // The C# has the same behaviour and the same reason: `ResetToDefaults` sets `_hasUserPosition = true`
    // and lets the ordinary save/restore path clamp. Clamping inside this function would need a work
    // area it is not given.
    expect(centreOnPrimary({ x: 0, y: 0, width: 800, height: 600 }, 1000, 800)).toEqual({
      left: -100,
      top: -100,
    })
  })

  test("an odd difference produces a half-pixel, which the caller rounds", () => {
    // `main.ts` calls `Math.round` before `setPosition`. Kept fractional here because the C# assigns a
    // `double` to `Left`/`Top` and WPF lays out on fractional DIPs; rounding in the geometry would make
    // this function disagree with the original by up to half a pixel for no gain.
    expect(centreOnPrimary({ x: 0, y: 0, width: 1001, height: 1001 }, 232, 260)).toEqual({
      left: 384.5,
      top: 370.5,
    })
  })
})

describe("snapToEdge (SNAP-03)", () => {
  const wa = { x: 0, y: 0, width: 1920, height: 1040 }

  test("the threshold is 8px", () => {
    expect(EDGE_SNAP_THRESHOLD_PX).toBe(8)
  })

  test.each([
    [5, 500, 0, 500, "within 8 of the left edge -> flush left"],
    [8, 500, 0, 500, "exactly 8 -> still snaps (<=, not <)"],
    [9, 500, 9, 500, "9 -> untouched"],
    [1715, 500, 1720, 500, "right edge within 8 -> flush right"],
    [1712, 500, 1720, 500, "exactly 8 from the right -> snaps"],
    [1711, 500, 1711, 500, "9 from the right -> untouched"],
    [500, 3, 500, 0, "within 8 of the top -> flush top"],
    [500, 933, 500, 940, "bottom edge within 8 -> flush bottom"],
    [500, 500, 500, 500, "mid-screen -> untouched on both axes"],
    [5, 3, 0, 0, "a corner snaps on both axes independently"],
    [1715, 933, 1720, 940, "the opposite corner, likewise"],
    [0, 0, 0, 0, "already flush -> idempotent"],
  ] as const)("%#: (%p,%p) -> (%p,%p) (%s)", (left, top, expectedLeft, expectedTop) => {
    expect(snapToEdge({ left, top }, 200, 100, wa)).toEqual({ left: expectedLeft, top: expectedTop })
  })

  test("a work area away from the origin snaps to ITS edges", () => {
    // His internal panel: origin (3441, -499). A naive port comparing against 0 would never snap here.
    expect(snapToEdge({ left: 3445, top: -495 }, 232, 260, { x: 3441, y: -499, width: 1920, height: 1040 })).toEqual({
      left: 3441,
      top: -499,
    })
  })

  test("the near edge wins outright: a window wider than the work area is not pulled both ways", () => {
    // The `else if` is load-bearing. Left matches (distance 0), so the right arm never runs -- and had
    // it run it would have produced -80, dragging the window off-screen to satisfy a snap.
    expect(snapToEdge({ left: 0, top: 0 }, 2000, 100, wa).left).toBe(0)
    expect(wa.width - 2000).toBe(-80)
  })

  test("snapping is not applied to a position that is merely close to the far edge in the wrong axis", () => {
    // Sanity: horizontal and vertical are computed independently, so a left-edge snap must not move top.
    expect(snapToEdge({ left: 2, top: 500 }, 200, 100, wa)).toEqual({ left: 0, top: 500 })
  })
})

/** ISC-7's measured desk, reused so restore is exercised against a real multi-monitor layout. */
const INTERNAL: DisplayGeometry = {
  bounds: { x: 3441, y: -499, width: 1920, height: 1080 },
  workArea: { x: 3441, y: -499, width: 1920, height: 1040 },
  scaleFactor: 1.0,
}
const LG_PRIMARY: DisplayGeometry = {
  bounds: { x: 0, y: 0, width: 3440, height: 1440 },
  workArea: { x: 0, y: 0, width: 3440, height: 1400 },
  scaleFactor: 1.0,
  isPrimary: true,
}
const LG_SECOND: DisplayGeometry = {
  bounds: { x: 1, y: -1440, width: 3440, height: 1440 },
  workArea: { x: 1, y: -1440, width: 3440, height: 1440 },
  scaleFactor: 1.0,
}
const DESK: readonly DisplayGeometry[] = [INTERNAL, LG_PRIMARY, LG_SECOND]
const WINDOW = { windowWidth: 232, windowHeight: 260 }

describe("resolveStartPosition (ISC-19)", () => {
  test("no saved monitor -> first-run placement on the primary", () => {
    const result = resolveStartPosition({ monitorPositions: {}, lastActiveMonitor: "", displays: DESK, ...WINDOW })
    expect(result).toEqual({
      position: { left: 3188, top: 20 },
      displayKey: displayKey(LG_PRIMARY),
      source: "first-run",
      clamped: false,
    })
  })

  test("a saved monitor with no stored position -> first-run placement", () => {
    const result = resolveStartPosition({
      monitorPositions: { [displayKey(INTERNAL)]: { left: 3500, top: -400 } },
      lastActiveMonitor: displayKey(LG_PRIMARY),
      displays: DESK,
      ...WINDOW,
    })
    expect(result.source).toBe("first-run")
  })

  test("the ordinary restart: the key matches and the position is restored untouched", () => {
    const result = resolveStartPosition({
      monitorPositions: { [displayKey(LG_PRIMARY)]: { left: 1620, top: 20 } },
      lastActiveMonitor: displayKey(LG_PRIMARY),
      displays: DESK,
      ...WINDOW,
    })
    expect(result).toEqual({
      position: { left: 1620, top: 20 },
      displayKey: displayKey(LG_PRIMARY),
      source: "key",
      clamped: false,
    })
  })

  test("a stale key whose position still lands on a display -> re-homed on geometry", () => {
    // What an imported WPF file looks like if the importer had kept the old keys, and what a
    // re-arranged monitor looks like. The C# had no equivalent -- FindScreenForKey went to the
    // primary and the widget jumped screens.
    const result = resolveStartPosition({
      monitorPositions: { display6: { left: 1620, top: 20 } },
      lastActiveMonitor: "display6",
      displays: DESK,
      ...WINDOW,
    })
    expect(result).toEqual({
      position: { left: 1620, top: 20 },
      displayKey: displayKey(LG_PRIMARY),
      source: "geometry",
      clamped: false,
    })
  })

  test("THE ISC-19 ARM: a position on no display recovers onto the primary, on-screen", () => {
    // His own file: `display5` at (-227, 510). The falsifier is not "the position was lost" -- it is
    // "the window restored off-screen". (0, 510) is the recorded C# `Clamp` answer for this position
    // against his primary's work area, so the recovery is measured rather than asserted.
    const result = resolveStartPosition({
      monitorPositions: { display5: { left: -227, top: 510 } },
      lastActiveMonitor: "display5",
      displays: DESK,
      ...WINDOW,
    })
    expect(result).toEqual({
      position: { left: 0, top: 510 },
      displayKey: displayKey(LG_PRIMARY),
      source: "primary",
      clamped: true,
    })
  })

  test("a resolution change that shrinks the display pulls the window back into view", () => {
    // The saved key was 3440 wide; the display is now 2560. The key misses, no display contains
    // (3300, 20), so the primary arm clamps it to the new right limit: 2560 - 232 = 2328.
    const shrunk: DisplayGeometry = {
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      workArea: { x: 0, y: 0, width: 2560, height: 1400 },
      scaleFactor: 1.0,
      isPrimary: true,
    }
    const result = resolveStartPosition({
      monitorPositions: { "3440x1440@0,0:1.00": { left: 3300, top: 20 } },
      lastActiveMonitor: "3440x1440@0,0:1.00",
      displays: [shrunk],
      ...WINDOW,
    })
    expect(result.position).toEqual({ left: 2328, top: 20 })
    expect(result.source).toBe("primary")
    expect(result.clamped).toBe(true)
  })

  test("the reported key is the display the window LANDED on, never the one requested", () => {
    // The caller saves this back. Reporting the requested key would re-save a key that resolves to
    // nothing, and the position would be orphaned again on every launch, forever.
    const result = resolveStartPosition({
      monitorPositions: { display5: { left: -227, top: 510 } },
      lastActiveMonitor: "display5",
      displays: DESK,
      ...WINDOW,
    })
    expect(result.displayKey).not.toBe("display5")
    expect(result.displayKey).toBe(displayKey(LG_PRIMARY))
  })

  test("restore is stable: the second launch reproduces the first", () => {
    // A recovered position must be a fixed point, or the widget walks across the screen one launch at
    // a time.
    const first = resolveStartPosition({
      monitorPositions: { display5: { left: -227, top: 510 } },
      lastActiveMonitor: "display5",
      displays: DESK,
      ...WINDOW,
    })
    const second = resolveStartPosition({
      monitorPositions: { [first.displayKey]: first.position },
      lastActiveMonitor: first.displayKey,
      displays: DESK,
      ...WINDOW,
    })
    expect(second.position).toEqual(first.position)
    expect(second.source).toBe("key")
    expect(second.clamped).toBe(false)
  })

  test("no displays attached -> the saved position is handed back untouched", () => {
    // Non-destructive by design: inventing (0,0) here would overwrite a good position with a guess on
    // the next save, and the user would find the widget moved when the monitors came back.
    const result = resolveStartPosition({
      monitorPositions: { display5: { left: -227, top: 510 } },
      lastActiveMonitor: "display5",
      displays: [],
      ...WINDOW,
    })
    expect(result).toEqual({
      position: { left: -227, top: 510 },
      displayKey: "",
      source: "no-display",
      clamped: false,
    })
  })
})
