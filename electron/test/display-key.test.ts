/**
 * New coverage, not a translation: `FuzzyClock.App.Tests/` has no MonitorService test (confirmed by
 * search), and the C# scheme this replaces could not be ported anyway -- see display-key.ts.
 *
 * The three-display table is Alex's actual desk, measured for ISC-7 by enumerating
 * `screen.getAllDisplays()` across two separate Electron launches. The figures matter because they
 * are what killed label-based identity: two of his three displays report the IDENTICAL label.
 */
import { describe, expect, test } from "bun:test"
import type { DisplayGeometry } from "../src/core/display-key.js"
import {
  boundsContain,
  displayKey,
  findDisplayByKey,
  findDisplayContaining,
  primaryDisplay,
} from "../src/core/display-key.js"

/** ISC-7, measured: internal panel, primary LG, second LG. Work areas are the taskbar-adjusted rects. */
const INTERNAL: DisplayGeometry = {
  bounds: { x: 3441, y: -499, width: 1920, height: 1080 },
  workArea: { x: 3441, y: -499, width: 1920, height: 1040 },
  scaleFactor: 1.0,
  label: "",
}
const LG_PRIMARY: DisplayGeometry = {
  bounds: { x: 0, y: 0, width: 3440, height: 1440 },
  workArea: { x: 0, y: 0, width: 3440, height: 1400 },
  scaleFactor: 1.0,
  label: "LG HDR WQHD",
  isPrimary: true,
}
const LG_SECOND: DisplayGeometry = {
  bounds: { x: 1, y: -1440, width: 3440, height: 1440 },
  workArea: { x: 1, y: -1440, width: 3440, height: 1440 },
  scaleFactor: 1.0,
  label: "LG HDR WQHD",
}
const DESK: readonly DisplayGeometry[] = [INTERNAL, LG_PRIMARY, LG_SECOND]

describe("displayKey", () => {
  test.each([
    [INTERNAL, "1920x1080@3441,-499:1.00"],
    [LG_PRIMARY, "3440x1440@0,0:1.00"],
    [LG_SECOND, "3440x1440@1,-1440:1.00"],
  ] as const)("%#: -> %p", (display, expected) => {
    expect(displayKey(display)).toBe(expected)
  })

  test("three displays, three distinct keys -- where labels give only two", () => {
    // The measurement that decided the scheme. Both LG panels report "LG HDR WQHD", so a label-keyed
    // map would collapse them and restore the widget onto whichever one enumerated first.
    expect(new Set(DESK.map(displayKey)).size).toBe(3)
    expect(new Set(DESK.map((d) => d.label)).size).toBe(2)
  })

  test("scale-factor float noise does not fork a display in two", () => {
    // ISC-7 read 1.0000000000000002 off one launch and 1.0 off the next. Two decimals absorb that
    // while still separating every scale Windows and macOS actually offer.
    expect(displayKey({ ...LG_PRIMARY, scaleFactor: 1.0000000000000002 })).toBe(displayKey(LG_PRIMARY))
    expect(displayKey({ ...LG_PRIMARY, scaleFactor: 1.25 })).toBe("3440x1440@0,0:1.25")
    expect(displayKey({ ...LG_PRIMARY, scaleFactor: 1.5 })).toBe("3440x1440@0,0:1.50")
    expect(displayKey({ ...LG_PRIMARY, scaleFactor: 2 })).toBe("3440x1440@0,0:2.00")
  })
})

describe("boundsContain is half-open, matching ScreenDpi.FromDipPoint", () => {
  const area = { x: 0, y: 0, width: 100, height: 50 }

  test.each([
    [{ left: 0, top: 0 }, true, "the origin is inside"],
    [{ left: 99, top: 49 }, true, "one short of each far edge is inside"],
    [{ left: 100, top: 0 }, false, "the right edge itself is OUTSIDE"],
    [{ left: 0, top: 50 }, false, "the bottom edge itself is OUTSIDE"],
    [{ left: -1, top: 0 }, false, "left of the origin"],
    [{ left: 0, top: -1 }, false, "above the origin"],
  ] as const)("%#: %p -> %p (%s)", (point, expected) => {
    expect(boundsContain(point, area)).toBe(expected)
  })

  test("a point on the seam between two adjacent displays belongs to exactly one", () => {
    // The reason the upper edge is exclusive. His LG panels abut at x=1/y=0-ish; without the
    // half-open rule a seam point would match both and the winner would be enumeration order.
    const left = { x: 0, y: 0, width: 1000, height: 1000 }
    const right = { x: 1000, y: 0, width: 1000, height: 1000 }
    const seam = { left: 1000, top: 500 }
    expect(boundsContain(seam, left)).toBe(false)
    expect(boundsContain(seam, right)).toBe(true)
  })
})

describe("findDisplayContaining", () => {
  test.each([
    [{ left: 1620, top: 20 }, LG_PRIMARY, "display6's saved position, on the primary LG"],
    [{ left: 3500, top: -400 }, INTERNAL, "on the internal panel, whose origin is negative in y"],
    [{ left: 100, top: -1000 }, LG_SECOND, "on the LG stacked above"],
  ] as const)("%#: %p -> the expected display (%s)", (point, expected) => {
    expect(findDisplayContaining(point, DESK)).toBe(expected)
  })

  test("display5's saved position lands on NO display he owns", () => {
    // The row the whole importer turns on: (-227, 510) is left of the primary, below the stacked LG,
    // and far short of the internal panel. ISC-18 drops it rather than guessing a home.
    expect(findDisplayContaining({ left: -227, top: 510 }, DESK)).toBeNull()
  })

  test("bounds, not work area -- a position under the taskbar is still on its monitor", () => {
    // The primary's work area stops at y=1400; its bounds run to 1440.
    expect(findDisplayContaining({ left: 500, top: 1420 }, DESK)).toBe(LG_PRIMARY)
  })
})

describe("findDisplayByKey", () => {
  test("an exact key resolves", () => {
    expect(findDisplayByKey("3440x1440@1,-1440:1.00", DESK)).toBe(LG_SECOND)
  })

  test("a stale WPF key resolves to nothing", () => {
    // What every imported file's keys look like: `display5`, `display6`.
    expect(findDisplayByKey("display6", DESK)).toBeNull()
  })

  test("a re-arranged display re-keys, so the old key misses", () => {
    // The cost display-key.ts documents up front: position is part of identity.
    const moved: DisplayGeometry = { ...LG_SECOND, bounds: { x: 0, y: -1440, width: 3440, height: 1440 } }
    expect(findDisplayByKey(displayKey(LG_SECOND), [INTERNAL, LG_PRIMARY, moved])).toBeNull()
  })
})

describe("primaryDisplay mirrors `Screen.PrimaryScreen ?? Screen.AllScreens[0]`", () => {
  test("the flagged primary wins", () => {
    expect(primaryDisplay(DESK)).toBe(LG_PRIMARY)
  })

  test("with no flag, the first display stands in", () => {
    expect(primaryDisplay([INTERNAL, LG_SECOND])).toBe(INTERNAL)
  })

  test("an empty list yields null rather than an invented display", () => {
    expect(primaryDisplay([])).toBeNull()
  })
})
