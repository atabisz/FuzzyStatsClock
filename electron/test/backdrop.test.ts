/**
 * `backdrop.ts` — the hover panel, and the two settings that had no reader before it.
 *
 * Provenance of every expectation here:
 *
 *   - **`BackdropAlpha()` (`MainWindow.xaml.cs:1435-1439`)**: `Math.Clamp((int)(pct / 100.0 * 255), 25, 255)`.
 *     Read as source, so the arithmetic, the clamp bounds and the C# cast semantics all come from one line.
 *   - **`ApplyBackdropState` + `Window_MouseEnter`/`Window_MouseLeave` (`:1441-1496`)** for which of the
 *     three states paints.
 *   - **`MainWindow.xaml:34-37`** for the `Transparent` shipped default.
 *
 * ## The sweep runs against a second implementation, not against the first one
 *
 * `expected(pct)` below is written from the C# line independently — a different expression of the same
 * rule, in the same file, so a reader can compare the two by eye. Calling `backdropAlpha` to compute its
 * own expectation would assert nothing. The sweep is 0-100 at 0.5 steps plus every integer, because the
 * `trunc`-vs-`round` divergence is invisible at the default (35% → 89.25, which both give as 89) and shows
 * up at 14% and 39 other points.
 *
 * ## What no test here can settle
 *
 * That the fill actually composites over the window's black background rather than replacing it. That is
 * `probe:pixels`' job and it needs an unlocked screen; this file settles the value, not the paint.
 */
import { describe, expect, test } from "bun:test"
import {
  BACKDROP_ALPHA_MAX,
  BACKDROP_ALPHA_MIN,
  backdropAlpha,
  backdropFill,
} from "../src/core/backdrop.js"
import { DEFAULTS } from "../src/core/settings.js"

/** The C# line, transcribed independently. Not `backdropAlpha`, on purpose — see the header. */
const expected = (percent: number): number => {
  const raw = Math.trunc((percent / 100.0) * 255)
  return raw < 25 ? 25 : raw > 255 ? 255 : raw
}

const SWEEP: number[] = []
for (let tenth = 0; tenth <= 1000; tenth++) SWEEP.push(tenth / 10)

describe("the percentage-to-alpha conversion", () => {
  test("agrees with the C# expression at every tenth of a percent from 0 to 100", () => {
    for (const percent of SWEEP) {
      expect(backdropAlpha(percent)).toBe(expected(percent))
    }
  })

  test("truncates rather than rounding, and 14% is where the two disagree", () => {
    // 14% is 35.7. `(int)` gives 35 and `Math.round` gives 36 — one part in 255 of alpha, invisible on
    // screen, and exactly the kind of difference that makes a pixel-diff against the WPF build fail for a
    // reason nobody can find. Pinned as a value, and then as a whole-range property.
    expect((14 / 100) * BACKDROP_ALPHA_MAX).toBeCloseTo(35.7, 9)
    expect(backdropAlpha(14)).toBe(35)
    expect(Math.round((14 / 100) * BACKDROP_ALPHA_MAX)).toBe(36)

    const divergent = SWEEP.filter(
      (percent) => Math.trunc((percent / 100) * 255) !== Math.round((percent / 100) * 255),
    )
    expect(divergent.length).toBeGreaterThan(0)
    for (const percent of divergent) {
      expect(backdropAlpha(percent)).toBe(Math.max(25, Math.trunc((percent / 100) * 255)))
    }
  })

  test("floors at 25, so 0% is a FAINT backdrop and not an absent one", () => {
    // The fact that makes `backdropAlwaysVisible` a separate boolean rather than "0%". A reader who assumes
    // 0 means off will paint nothing at the settings window's own minimum, and the difference is a visible
    // ~10% black panel.
    expect(BACKDROP_ALPHA_MIN).toBe(25)
    for (const percent of [0, 1, 5, 9.8]) {
      expect(backdropAlpha(percent)).toBe(BACKDROP_ALPHA_MIN)
    }
    // The clamp stops biting at 9.9%, where the raw value first reaches 25 on its own (25.245 → 25). So
    // everything from 0 to 9.8 is the floor *overriding* the arithmetic, and 9.9 upward is the arithmetic.
    expect(Math.trunc((9.8 / 100) * 255)).toBe(24)
    expect(Math.trunc((9.9 / 100) * 255)).toBe(25)
    expect(backdropAlpha(9.9)).toBe(25)
    expect(backdropAlpha(10.2)).toBe(26)
    expect(backdropAlpha(BACKDROP_ALPHA_MIN / 2.55)).toBe(BACKDROP_ALPHA_MIN)
  })

  test("ceils at 255 and holds there, including above 100%", () => {
    // `backdropOpacityPercent` is validated as a number and **not** range-clamped (`settings.ts:369` is a
    // bare `?? default`), so a hand-edited 500 reaches this function. The clamp is the only thing between
    // that and a 12-digit `fill` attribute.
    expect(BACKDROP_ALPHA_MAX).toBe(255)
    expect(backdropAlpha(100)).toBe(255)
    expect(backdropAlpha(100.4)).toBe(255)
    expect(backdropAlpha(500)).toBe(255)
    expect(backdropAlpha(Number.MAX_SAFE_INTEGER)).toBe(255)
  })

  test("negative and non-finite inputs clamp to the floor rather than escaping", () => {
    // Same reachability argument as above, in the other direction, plus `NaN`: `Math.min(Math.max(NaN,…))`
    // is NaN, which would render `#000000NaN` — a fill Chromium drops silently, leaving a stale backdrop.
    for (const percent of [-0.1, -50, Number.NEGATIVE_INFINITY]) {
      expect(backdropAlpha(percent)).toBe(BACKDROP_ALPHA_MIN)
    }
    expect(backdropAlpha(Number.NaN)).toBe(BACKDROP_ALPHA_MIN)
    expect(backdropAlpha(Number.POSITIVE_INFINITY)).toBe(BACKDROP_ALPHA_MIN)
    // Infinity to the floor is the surprising one and it is deliberate: the finite guard runs first, so
    // "not a usable number" has one answer rather than two. Asserted so it is not read as a bug.
  })

  test("is monotonic across the whole sweep", () => {
    // The property that says the clamp did not invert anything, and the cheapest check that a future
    // refactor to integer arithmetic kept the shape.
    let previous = -1
    for (const percent of SWEEP) {
      const alpha = backdropAlpha(percent)
      expect(alpha).toBeGreaterThanOrEqual(previous)
      previous = alpha
    }
    expect(previous).toBe(255)
  })

  test("the default 35% is 89, which is where the trunc question does NOT arise", () => {
    // Recorded because it is why the cast had to be read rather than assumed: 89.25 truncates and rounds to
    // the same 89, so a default-only test passes with either implementation.
    expect(DEFAULTS.backdropOpacityPercent).toBe(35)
    expect(backdropAlpha(35)).toBe(89)
    expect(Math.round((35 / 100) * 255)).toBe(89)
  })
})

describe("the fill the renderer writes", () => {
  test("is transparent when the backdrop is off and the cursor is away", () => {
    // The shipped state: `BackdropBorder` is `Transparent` in the markup and both defaults leave it there.
    expect(DEFAULTS.backdropAlwaysVisible).toBe(false)
    expect(backdropFill(false, false, DEFAULTS.backdropOpacityPercent)).toBe("transparent")
    // The literal string matters: `"none"` would be an SVG *no-paint*, which is the same pixel but a
    // different thing, and `""` removes the attribute and lets the stylesheet win.
    expect(backdropFill(false, false, 0)).toBe("transparent")
  })

  test("paints on hover, and stays painted when always-visible", () => {
    expect(backdropFill(false, true, 35)).toBe("#00000059")
    expect(backdropFill(true, false, 35)).toBe("#00000059")
    expect(backdropFill(true, true, 35)).toBe("#00000059")
    // 0x59 is 89, the default alpha above — the same number in the form the attribute takes.
    expect(Number.parseInt("59", 16)).toBe(89)
  })

  test("is #000000 plus a two-digit alpha, at every point of the sweep", () => {
    // The format is the constraint, not the colour: 8-digit hex is a legal `fill` **presentation
    // attribute**, and `rgba()` is too — but the padding is what stops `#0000005` (a 7-digit value
    // Chromium rejects outright) at every alpha below 16.
    for (const percent of SWEEP) {
      const fill = backdropFill(true, false, percent)
      expect(fill).toMatch(/^#000000[0-9a-f]{2}$/)
      expect(Number.parseInt(fill.slice(7), 16)).toBe(backdropAlpha(percent))
    }
  })

  test("pads a single hex digit, which the 25 floor makes unreachable and worth keeping anyway", () => {
    // The floor means the smallest alpha this module can emit is 0x19, so no shipped input needs the pad.
    // It is here because the floor is the only thing preventing it, and a future settings window with its
    // own clamp is exactly the change that would remove that guarantee without touching this file.
    expect(backdropAlpha(0)).toBe(25)
    expect(backdropFill(true, false, 0)).toBe("#00000019")
    expect((10).toString(16).padStart(2, "0")).toBe("0a")
  })

  test("hovering is ignored while always-visible, so the two settings cannot fight", () => {
    // `ApplyBackdropState` paints unconditionally when the flag is set and `MouseLeave` checks the flag
    // before clearing. Without that check, moving the cursor off the widget would clear a backdrop the user
    // asked to be permanent — the single behaviour the flag exists for.
    for (const percent of [0, 35, 100]) {
      expect(backdropFill(true, true, percent)).toBe(backdropFill(true, false, percent))
    }
  })

  test("the four states are exactly two outcomes, and only one of them is transparent", () => {
    // The truth table, stated as one. `!always && !hover` is the only transparent cell; asserting it as a
    // count is what catches an inverted condition, which every other arm here would still pass.
    const cells = [
      backdropFill(false, false, 35),
      backdropFill(false, true, 35),
      backdropFill(true, false, 35),
      backdropFill(true, true, 35),
    ]
    expect(cells.filter((fill) => fill === "transparent")).toHaveLength(1)
    expect(cells[0]).toBe("transparent")
    expect(new Set(cells).size).toBe(2)
  })
})
