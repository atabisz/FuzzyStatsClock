/**
 * `boundsToEdges`, and the one-DIP asymmetry it deliberately reproduces.
 *
 * The module is four additions, so testing it in isolation would be testing that `+` works. What is worth
 * pinning is the DECISION recorded in its header: `right = x + width`, Win32 `RECT` semantics, which is one
 * DIP past the widget's last painted column. That is not the more defensible geometry -- `x + width - 1` is
 * -- and it is shipped because `GhostModeController` passes `rect.Right` straight into an inside test of
 * `cursorX <= rectRight`, so the WPF app's halo genuinely does extend a DIP further on two of its four
 * sides.
 *
 * So the arms below compose `boundsToEdges` with `computeProximityRatio` and measure the asymmetry rather
 * than asserting the arithmetic: the left and right halves of the same halo are checked against each other,
 * and the refused alternative is pinned as an explicit inequality. Change the module to `x + width - 1` and
 * the symmetry arms go green while the asymmetry arms go red, which is the discrimination this file exists
 * for.
 */
import { describe, expect, test } from "bun:test"
import { boundsToEdges, type WindowBounds } from "../src/core/ghost-rect.js"
import { computeProximityRatio } from "../src/core/ghost.js"

/** A 100x100 widget at (100,100) -- the same rect the translated C# proximity suite uses. */
const WIDGET: WindowBounds = { x: 100, y: 100, width: 100, height: 100 }
const RADIUS = 80

/** Ratio for a cursor, with the edges taken from `boundsToEdges` rather than authored here. */
function ratioAt(bounds: WindowBounds, x: number, y: number, radiusPx = RADIUS): number {
  const e = boundsToEdges(bounds)
  return computeProximityRatio(x, y, e.left, e.top, e.right, e.bottom, radiusPx)
}

describe("the mapping itself", () => {
  test("left and top pass through, right and bottom are the exclusive edges", () => {
    expect(boundsToEdges(WIDGET)).toEqual({ left: 100, top: 100, right: 200, bottom: 200 })
  })

  test("right minus left IS the width, which is what makes it a Win32 RECT", () => {
    const e = boundsToEdges(WIDGET)
    expect(e.right - e.left).toBe(WIDGET.width)
    expect(e.bottom - e.top).toBe(WIDGET.height)
  })

  test("a negative origin maps without special-casing", () => {
    // This desk has a display at negative x, and `getBounds()` reports the window there in that space.
    // Nothing in the mapping may treat a coordinate's sign as meaningful.
    expect(boundsToEdges({ x: -1920, y: -200, width: 232, height: 260 })).toEqual({
      left: -1920,
      top: -200,
      right: -1688,
      bottom: 60,
    })
  })

  test("a zero-size window collapses to a point rather than inverting", () => {
    // Reachable: `main.ts` creates the window at a placeholder size and the renderer measures afterwards,
    // so a tick between those two sees whatever `getBounds()` reports. A degenerate rect must stay
    // degenerate -- an inverted one (right < left) would make the inside test unsatisfiable and the
    // overshoot arithmetic read from the wrong edge.
    const e = boundsToEdges({ x: 50, y: 60, width: 0, height: 0 })
    expect(e).toEqual({ left: 50, top: 60, right: 50, bottom: 60 })
    expect(ratioAt({ x: 50, y: 60, width: 0, height: 0 }, 50, 60)).toBe(1)
  })
})

describe("the asymmetry the exclusive edge produces, measured on both sides of one halo", () => {
  test("the last painted column is inside, and so is the one after it", () => {
    // The widget paints columns 100..199. 200 is not painted, and it still reads as fully inside, because
    // the inside test is `<=` against an exclusive edge. This is the arm that fails on `x + width - 1`.
    expect(ratioAt(WIDGET, 199, 150)).toBe(1)
    expect(ratioAt(WIDGET, 200, 150)).toBe(1)
    expect(ratioAt(WIDGET, 150, 200)).toBe(1)
  })

  test("one DIP outside is a fade on the left but full opacity on the right", () => {
    // The pair that names the divergence. Same distance from the painted area, different answers.
    expect(ratioAt(WIDGET, 99, 150)).toBe(1 - 1 / RADIUS)
    expect(ratioAt(WIDGET, 200, 150)).toBe(1)
    expect(ratioAt(WIDGET, 150, 99)).toBe(1 - 1 / RADIUS)
    expect(ratioAt(WIDGET, 150, 200)).toBe(1)
  })

  test("the inside region is width+1 DIPs across, not width", () => {
    let inside = 0
    for (let x = 0; x <= 400; x++) if (ratioAt(WIDGET, x, 150) === 1) inside++
    expect(inside).toBe(WIDGET.width + 1)
  })

  test("the full-retreat boundary sits one DIP further out on the right and bottom", () => {
    // Exactly 0.0 is what earns `restore-with-event` rather than `restore-no-event`, so this boundary is
    // the one the `Restored` event fires on -- which makes the extra DIP observable in behaviour and not
    // only in a ratio.
    expect(ratioAt(WIDGET, 100 - RADIUS, 150)).toBe(0)
    expect(ratioAt(WIDGET, 100 - RADIUS + 1, 150)).toBeGreaterThan(0)
    expect(ratioAt(WIDGET, 200 + RADIUS, 150)).toBe(0)
    expect(ratioAt(WIDGET, 200 + RADIUS - 1, 150)).toBeGreaterThan(0)

    // And the same distance measured from the PAINTED area is one DIP longer on the right: 199 + 80 + 1.
    expect(200 + RADIUS - (199 + RADIUS)).toBe(1)
  })

  test("the refused alternative is pinned as an inequality, not as a comment", () => {
    // `x + width - 1` is the last painted column and the geometry a reader would reach for. If someone
    // "corrects" the module to it, the arms above move by a DIP and this one says what changed.
    const e = boundsToEdges(WIDGET)
    expect(e.right).not.toBe(WIDGET.x + WIDGET.width - 1)
    expect(e.right).toBe(WIDGET.x + WIDGET.width)
  })

  test("the corner is Chebyshev, so the halo stays square through the mapping", () => {
    // A 45-degree diagonal from the corner and a straight run out from the edge give the same ratio at the
    // same overshoot. Euclidean distance would not, and a square halo around a square widget is the whole
    // reason `computeProximityRatio` uses the max rather than the hypotenuse.
    expect(ratioAt(WIDGET, 200 + 40, 200 + 40)).toBe(ratioAt(WIDGET, 200 + 40, 150))
  })
})
