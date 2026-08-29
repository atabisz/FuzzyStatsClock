/**
 * Translated from the three GhostModeController suites in FuzzyClock.App.Tests --
 * GhostModeControllerProximityTests.cs (12 cases), LerpRatioTests.cs (5) and OnSampleTickTests.cs (4)
 * -- plus GhostModeControllerTests.cs's 12 modifier rows, all 33 kept row for row.
 *
 * ## The one translated suite that cannot prove what it claims
 *
 * GhostModeControllerTests.cs says it verifies "all 8 combinations (2^3) including all-false =
 * always-false", and its own header admits why it cannot: `GetAsyncKeyState` returns 0 in a test
 * process, so every one of its 12 rows expects `false`. A suite whose every row expects the same
 * answer cannot distinguish the AND logic from `return false`. The 12 rows are translated anyway --
 * they are still the C#'s recorded behaviour, and the probe reproduced all 16 of them -- but the
 * discriminating block is the exhaustive 256-row (config x held) sweep below it, which is only
 * reachable because the port takes the key state as an argument instead of reading the keyboard.
 *
 * ## Where the added expectations come from
 *
 * Measured, not derived: a throwaway console project (`$TEMP/fc-appprobe`, `dotnet run -- prox|lerp|
 * tick|modifier`) `<Compile Include>`s the real GhostModeController.cs and prints what it returns for
 * every row here, doubles in G17 so no digit is lost. That is where the negative-radius 1.0, the
 * repeated `activate`, the disabled tick that leaves `isActive` true, and the exact float forms come
 * from. Two of them refuted what I expected to find, and both are called out where they sit.
 *
 * Float parity: .NET and Bun returned bit-identical doubles on every row measured, including the four
 * `Math.exp` ones. The exp rows are still asserted with a tolerance against the C#-measured literal,
 * because `Math.exp` is not bit-pinned by either language spec -- and then asserted EXACTLY against
 * the formula evaluated inline, which is what actually pins the shape.
 */
import { describe, expect, test } from "bun:test"
import {
  computeProximityRatio,
  DEFAULT_FADE_RADIUS_PX,
  DEFAULT_MODIFIER_CONFIG,
  GhostSampler,
  isModifierHeld,
  lerpRatio,
  NO_MODIFIERS,
  type ModifierConfig,
  type SampleResult,
} from "../src/core/ghost.js"

/** The rect every proximity row uses: a 100x100 widget at (100,100), same as the C# suites. */
const L = 100
const T = 100
const R = 200
const B = 200

const ratio = (x: number, y: number, radiusPx: number): number =>
  computeProximityRatio(x, y, L, T, R, B, radiusPx)

describe("computeProximityRatio, translated from GhostModeControllerProximityTests", () => {
  // ----- the 10 DataRows, same coordinates, same expectations -----
  test.each([
    [50, 150, 50, 0, "50px left of edge, radius=50 -> 0.0 (zone boundary)"],
    [75, 150, 50, 0.5, "25px from edge, radius=50 -> 0.5"],
    [40, 150, 50, 0, "60px outside zone, radius=50 -> clamped 0.0"],
    [150, 150, 50, 1, "inside rect -> 1.0"],
    [75, 75, 50, 0.5, "diagonal 25px from corner, radius=50 -> 0.5"],
    [150, 90, 50, 0.8, "10px above top edge, radius=50 -> 0.8"],
    [100, 150, 50, 1, "on exact left edge -> 1.0 (inside)"],
    [200, 150, 50, 1, "on exact right edge -> 1.0 (inside)"],
    [150, 100, 50, 1, "on exact top edge -> 1.0 (inside)"],
    [450, 150, 500, 0.5, "large radius 500, 250px away -> 0.5"],
  ])("(%p,%p) r=%p -> %p", (x, y, radiusPx, expected) => {
    expect(ratio(x, y, radiusPx)).toBe(expected)
  })

  // The C# asserts these two with a 0.0001 tolerance; exact is available here and stronger, and the
  // whole point of the zero-radius arm is that it returns the terminal values exactly.
  test("zero radius inside the rect returns 1.0", () => {
    expect(ratio(150, 150, 0)).toBe(1)
  })

  test("zero radius outside the rect returns 0.0", () => {
    expect(ratio(50, 50, 0)).toBe(0)
  })
})

describe("computeProximityRatio, additions measured against the compiled C#", () => {
  // The C# covers the left, right and top edges but not the bottom, and no corner at all.
  test.each([
    [150, 200, "bottom edge"],
    [200, 200, "bottom-right corner"],
    [100, 100, "top-left corner"],
    [100, 200, "bottom-left corner"],
    [200, 100, "top-right corner"],
  ])("(%p,%p) is inside: %s -> 1.0", (x, y) => {
    expect(ratio(x, y, 50)).toBe(1)
  })

  test("1px diagonally outside the corner is 0.98, not 1.0", () => {
    expect(ratio(99, 99, 50)).toBe(0.98)
  })

  // Added after a mutation run: at every non-zero radius the edge-inclusion check is UNOBSERVABLE.
  // Strictening it to `>` and `<` changes nothing, because a cursor on an edge has Chebyshev distance
  // 0 and `1 - 0/r` is 1.0 regardless. The one radius where the two paths disagree is 0, which PROX-08
  // makes a real setting rather than a curiosity -- there the arithmetic path takes the zero-radius arm
  // and returns 0.0, i.e. a widget with the fade disabled would stop ghosting when the cursor sat
  // exactly on its border. All ten values measured (`prox` rows at r=0).
  test.each([
    [100, 150, 1, "left edge"],
    [200, 150, 1, "right edge"],
    [150, 100, 1, "top edge"],
    [150, 200, 1, "bottom edge"],
    [100, 100, 1, "top-left corner"],
    [200, 200, 1, "bottom-right corner"],
    [100, 200, 1, "bottom-left corner"],
    [200, 100, 1, "top-right corner"],
    [99, 150, 0, "1px left of the left edge"],
    [150, 201, 0, "1px below the bottom edge"],
  ])("(%p,%p) with the fade disabled -> %p (%s)", (x, y, expected) => {
    expect(ratio(x, y, 0)).toBe(expected)
  })

  // This row is why `restore-with-event` is reachable at all: the sampler needs an EXACT 0.0, so the
  // boundary has to land on it rather than near it.
  test("exactly radiusPx away returns exactly 0.0", () => {
    expect(ratio(150, 50, 50)).toBe(0)
    expect(ratio(150, 49, 50)).toBe(0)
    expect(ratio(250, 250, 50)).toBe(0)
  })

  // Chebyshev, not Euclidean and not the nearer axis: all three of these are 40px on their worst
  // axis, and all three give the same ratio. A Euclidean port would give 0.0 for the first.
  test.each([
    [240, 240],
    [75, 240],
    [240, 75],
  ])("(%p,%p) takes the worst axis -> 0.19999999999999996", (x, y) => {
    expect(ratio(x, y, 50)).toBe(0.19999999999999996)
  })

  // REFUTED what I expected: I assumed a negative radius would clamp low. The clamp is applied to
  // `1 - distance/radius`, which a negative divisor sends ABOVE 1, so it clamps HIGH -- a negative
  // radius makes the whole screen the widget. Pinned so a settings path that admits one fails here.
  test.each([
    [50, 150, "outside"],
    [150, 150, "inside"],
  ])("a negative radius returns 1.0 (%p, %s)", (x, y) => {
    expect(ratio(x, y, -50)).toBe(1)
  })

  test.each([
    [50, 150, 1, 0],
    [199, 150, 1, 1],
    [201, 150, 1, 0],
    [0, 0, 1_000_000, 0.9999],
    [150, 150, 2_147_483_647, 1],
  ])("(%p,%p) r=%p -> %p", (x, y, radiusPx, expected) => {
    expect(ratio(x, y, radiusPx)).toBe(expected)
  })

  // C# int arithmetic wraps here and a JS number does not, so the intermediates differ. Measured on
  // both sides, the answer does not: it clamps to 0.0 either way.
  test.each([
    [2_147_483_647, 150],
    [-2_147_483_648, 150],
    [150, -2_147_483_648],
  ])("(%p,%p) clamps to 0.0 despite C# int overflow", (x, y) => {
    expect(ratio(x, y, 50)).toBe(0)
  })
})

describe("lerpRatio, translated from LerpRatioTests", () => {
  // ----- the 4 terminal-state-snap DataRows -----
  test.each([
    [0.5, 1, 1],
    [0, 1, 1],
    [0.5, 0, 0],
    [1, 0, 0],
  ])("current=%p, target=%p snaps to %p", (current, target, expected) => {
    expect(lerpRatio(current, target, 15, 0.016)).toBe(expected)
  })

  test("a mid-range target does not snap", () => {
    // The C# computes its expectation inline for the same reason: it pins the formula rather than a
    // literal that would have to be re-derived if the formula moved.
    const [current, target, alpha, deltaSeconds] = [0, 0.5, 15, 0.016]
    const expected = current + (target - current) * (1 - Math.exp(-alpha * deltaSeconds))

    expect(lerpRatio(current, target, alpha, deltaSeconds)).toBe(expected)
    expect(lerpRatio(current, target, alpha, deltaSeconds)).not.toBe(0.5)
  })
})

describe("lerpRatio, additions measured against the compiled C#", () => {
  // The C#-measured values, to 17 significant digits. Tolerance rather than equality only because
  // Math.exp is implementation-defined; the exact assertion is the formula one below.
  test.each([
    [0, 0.5, 15, 0.016, 0.10668606946672327],
    [0, 0.5, 15, -0.016, -0.13562457516070237],
    [0.25, 0.75, 15, 1, 0.7499998470488398],
    [0.2, 0.8, 15, 0.032, 0.42872996491631554],
    [-0.5, 0.5, 15, 0.016, -0.28662786106655347],
    [0.5, 5e-324, 15, 0.016, 0.39331393053327673],
    [0.5, 1.0000000000000002, 15, 0.016, 0.6066860694667233],
  ])("(%p,%p,%p,%p) matches the C# to 15 places and the formula exactly", (c, t, a, d, csharp) => {
    expect(lerpRatio(c, t, a, d)).toBeCloseTo(csharp, 15)
    expect(lerpRatio(c, t, a, d)).toBe(c + (t - c) * (1 - Math.exp(-a * d)))
  })

  test("one ULP above 1.0 is not 1.0, so the snap does not fire", () => {
    // 0.5 -> 1.0000000000000002 through the formula lands at 0.6066..., nowhere near the target.
    // This is the row that proves the snap is an exact compare rather than an epsilon one.
    expect(lerpRatio(0.5, 1.0000000000000002, 15, 0.016)).not.toBe(1.0000000000000002)
  })

  test("the smallest subnormal is not 0.0, so the snap does not fire", () => {
    expect(lerpRatio(0.5, 5e-324, 15, 0.016)).not.toBe(5e-324)
  })

  test("a -0 target snaps and returns -0", () => {
    // -0 === 0 in IEEE, in both languages. Measured: the C# prints "-0" here too.
    expect(Object.is(lerpRatio(0.5, -0, 15, 0.016), -0)).toBe(true)
  })

  test.each([
    [0, 0.5, 15, 0, 0, "zero elapsed returns current"],
    [0, 0.5, 0, 0.016, 0, "alpha 0 returns current"],
    [0.5, 0.5, 15, 0.016, 0.5, "current equal to a mid-range target returns it"],
    [0, 0.5, 15, Number.POSITIVE_INFINITY, 0.5, "infinite elapsed reaches the target exactly"],
  ])("%p,%p,%p,%p -> %p (%s)", (c, t, a, d, expected) => {
    expect(lerpRatio(c, t, a, d)).toBe(expected)
  })

  test("NaN propagates through the formula but not through the snap", () => {
    expect(lerpRatio(Number.NaN, 0.5, 15, 0.016)).toBeNaN()
    expect(lerpRatio(0, Number.NaN, 15, 0.016)).toBeNaN()
    // The snap returns the target before touching current, so a NaN current is discarded.
    expect(lerpRatio(Number.NaN, 1, 15, 0.016)).toBe(1)
    expect(lerpRatio(Number.NaN, 0, 15, 0.016)).toBe(0)
  })
})

describe("isModifierHeld, translated from GhostModeControllerTests", () => {
  // The 12 DataRows. Every one expects false, and with nothing held that is all they can expect --
  // see this file's header.
  test.each([
    [false, false, false, false, "all-false: the override is disabled (DET-02)"],
    [true, false, false, false, "Ctrl only"],
    [false, true, false, false, "Alt only"],
    [false, false, true, false, "Shift only"],
    [false, false, false, true, "Win only"],
    [true, true, false, false, "Ctrl+Alt"],
    [true, false, true, false, "Ctrl+Shift"],
    [false, true, true, false, "Alt+Shift"],
    [false, false, true, true, "Shift+Win"],
    [true, false, false, true, "Ctrl+Win"],
    [true, true, true, false, "Ctrl+Alt+Shift"],
    [true, true, true, true, "all four"],
  ])("config(%p,%p,%p,%p) with no key held is false: %s", (ctrl, alt, shift, win) => {
    expect(isModifierHeld({ ctrl, alt, shift, win }, NO_MODIFIERS)).toBe(false)
  })
})

describe("isModifierHeld, the four configurations the C# suite omits", () => {
  // Same shape and same all-keys-up expectation as the 12 above, and the probe reproduced all 16, so
  // these are measured rather than assumed -- but they are additions, and a describe titled
  // "translated from" holding them would make the translated/added split unmeasurable.
  test.each([
    [false, true, false, true, "Alt+Win"],
    [false, true, true, true, "Alt+Shift+Win"],
    [true, false, true, true, "Ctrl+Shift+Win"],
    [true, true, false, true, "Ctrl+Alt+Win"],
  ])("config(%p,%p,%p,%p) with no key held is false: %s", (ctrl, alt, shift, win) => {
    expect(isModifierHeld({ ctrl, alt, shift, win }, NO_MODIFIERS)).toBe(false)
  })
})

describe("isModifierHeld, exhaustive over config x held", () => {
  const KEYS = ["ctrl", "alt", "shift", "win"] as const

  /** Bit 0 Ctrl, 1 Alt, 2 Shift, 3 Win. */
  const config = (mask: number): ModifierConfig => ({
    ctrl: (mask & 1) !== 0,
    alt: (mask & 2) !== 0,
    shift: (mask & 4) !== 0,
    win: (mask & 8) !== 0,
  })

  /**
   * A deliberately different formulation of the same rule: collect the configured keys, then ask
   * whether they are all down. The implementation is a four-way conjunction of `!configured || held`
   * terms, so agreement across all 256 rows is two independent derivations agreeing rather than one
   * assertion restating the code.
   */
  const oracle = (cfg: ModifierConfig, held: ModifierConfig): boolean => {
    const configured = KEYS.filter((k) => cfg[k])
    return configured.length > 0 && configured.every((k) => held[k])
  }

  test("all 256 (config, held) pairs agree with an independent formulation", () => {
    let heldTrue = 0
    for (let c = 0; c < 16; c++) {
      for (let h = 0; h < 16; h++) {
        const [cfg, held] = [config(c), config(h)]
        const actual = isModifierHeld(cfg, held)
        expect(actual).toBe(oracle(cfg, held))
        if (actual) heldTrue++
      }
    }
    // 65 of 256, and the count is the guard that keeps this test from passing vacuously: two
    // formulations that both collapsed to `return false` would agree on every row.
    expect(heldTrue).toBe(65)
  })

  // Hand-typed anchors, so the pair of formulations is pinned to stated behaviour at the corners.
  test.each([
    [{ ctrl: true, alt: true, shift: false, win: false }, { ctrl: true, alt: false, shift: false, win: false }, false, "Ctrl+Alt configured, only Ctrl down"],
    [{ ctrl: true, alt: true, shift: false, win: false }, { ctrl: true, alt: true, shift: false, win: false }, true, "Ctrl+Alt configured and both down"],
    [{ ctrl: true, alt: true, shift: false, win: false }, { ctrl: true, alt: true, shift: true, win: true }, true, "an unconfigured key being down is ignored"],
    [NO_MODIFIERS, { ctrl: true, alt: true, shift: true, win: true }, false, "nothing configured stays false with everything down (DET-02)"],
    [{ ctrl: false, alt: false, shift: false, win: true }, { ctrl: false, alt: false, shift: false, win: true }, true, "Win alone counts"],
  ])("%p vs %p -> %p (%s)", (cfg, held, expected) => {
    expect(isModifierHeld(cfg, held)).toBe(expected)
  })

  test("the default configuration is Ctrl+Alt", () => {
    // CFG-04, measured off a fresh C# controller rather than read off the field initialisers.
    expect(DEFAULT_MODIFIER_CONFIG).toEqual({ ctrl: true, alt: true, shift: false, win: false })
    expect(isModifierHeld(DEFAULT_MODIFIER_CONFIG, NO_MODIFIERS)).toBe(false)
    expect(isModifierHeld(DEFAULT_MODIFIER_CONFIG, { ctrl: true, alt: true, shift: false, win: false })).toBe(true)
  })
})

/** A tick at the C# suites' geometry, so the rows read as coordinates rather than plumbing. */
const tick = (s: GhostSampler, x: number, y: number, modifiersHeld = false): SampleResult =>
  s.onTick(x, y, L, T, R, B, modifiersHeld)

describe("GhostSampler.onTick, translated from OnSampleTickTests", () => {
  // The C# rows run at the default radius of 80: |10-100|=90 is outside the zone, 75 is mid-fade at
  // 0.6875, 50 is a partial 0.375, and 150 is inside the rect. Its own comment records that the
  // plan's proposed cursorX=50 does not produce the 0.0 the RestoreWithEvent row needs.
  test.each([
    [50, 150, false, "none", "far+!ghost"],
    [150, 150, false, "activate", "inside+!ghost"],
    [75, 150, true, "restore-no-event", "mid+ghost"],
    [10, 150, true, "restore-with-event", "far+ghost"],
  ] as const)("(%p,%p) ghostPre=%p -> %p (%s)", (x, y, ghostPre, expected) => {
    const sampler = new GhostSampler()
    if (ghostPre) sampler.markActive()

    expect(tick(sampler, x, y).transition).toBe(expected)
  })
})

describe("GhostSampler, additions measured against the compiled C#", () => {
  test("the constructor defaults match a fresh C# controller", () => {
    const sampler = new GhostSampler()
    expect(sampler.fadeRadiusPx).toBe(DEFAULT_FADE_RADIUS_PX)
    expect(DEFAULT_FADE_RADIUS_PX).toBe(80)
    expect(sampler.enabled).toBe(true)
    expect(sampler.isActive).toBe(false)
    expect(sampler.modifiers).toEqual(DEFAULT_MODIFIER_CONFIG)
  })

  test("the tick never sets isActive, so it keeps emitting activate", () => {
    // D-06's single-owner rule, and the most surprising thing in the seam: applying click-through is
    // the caller's job, so until the caller calls markActive() every tick over the widget is another
    // `activate`. Measured -- the second tick returns activate with ratioChanged false.
    const sampler = new GhostSampler()

    expect(tick(sampler, 150, 150)).toEqual({ ratio: 1, ratioChanged: true, transition: "activate" })
    expect(tick(sampler, 150, 150)).toEqual({ ratio: 1, ratioChanged: false, transition: "activate" })
    expect(sampler.isActive).toBe(false)

    sampler.markActive()
    expect(tick(sampler, 150, 150)).toEqual({ ratio: 1, ratioChanged: false, transition: "none" })
  })

  test("a retreat that never activated produces none, not a restore", () => {
    // Same rule from the other side: without markActive() the sampler has no ghost state to leave.
    const sampler = new GhostSampler()
    expect(tick(sampler, 150, 150).transition).toBe("activate")
    expect(tick(sampler, 75, 150)).toEqual({ ratio: 0.6875, ratioChanged: true, transition: "none" })
  })

  test("the edge signal fires once per distinct ratio", () => {
    const sampler = new GhostSampler()
    expect(tick(sampler, 50, 150)).toEqual({ ratio: 0.375, ratioChanged: true, transition: "none" })
    expect(tick(sampler, 50, 150)).toEqual({ ratio: 0.375, ratioChanged: false, transition: "none" })
    expect(tick(sampler, 75, 150)).toEqual({ ratio: 0.6875, ratioChanged: true, transition: "none" })
  })

  test("a first tick at 0.0 reports no edge, because lastProximityRatio starts at 0.0", () => {
    // This is why the far+ghost row's RatioChanged is false in the probe output: the initial value
    // and the computed value are both 0.0, so the restore is driven by the transition alone.
    const sampler = new GhostSampler()
    sampler.markActive()
    expect(tick(sampler, 10, 150)).toEqual({ ratio: 0, ratioChanged: false, transition: "restore-with-event" })
    // And the state write means the second identical tick is a plain none.
    expect(tick(sampler, 10, 150)).toEqual({ ratio: 0, ratioChanged: false, transition: "none" })
  })

  test("a held modifier forces the ratio to 0.0 from inside the rect", () => {
    // SEM-03, which the C# suite explicitly puts out of scope for OnSampleTickTests.
    const sampler = new GhostSampler()
    expect(tick(sampler, 150, 150, true)).toEqual({ ratio: 0, ratioChanged: false, transition: "none" })

    const active = new GhostSampler()
    active.markActive()
    expect(tick(active, 150, 150, true)).toEqual({ ratio: 0, ratioChanged: false, transition: "restore-with-event" })
  })

  test("with nothing configured the held flag is ignored (DET-02)", () => {
    const sampler = new GhostSampler()
    sampler.modifiers = NO_MODIFIERS
    expect(tick(sampler, 150, 150, true)).toEqual({ ratio: 1, ratioChanged: true, transition: "activate" })
  })

  test("disabled is a no-op that leaves isActive alone", () => {
    // The gate returns before any state write, so a sampler disabled while ghosted STAYS ghosted --
    // measured, and the reason the enable toggle has to restore the window itself rather than trust
    // the next tick to do it.
    const sampler = new GhostSampler()
    sampler.markActive()
    sampler.enabled = false

    expect(tick(sampler, 10, 150)).toEqual({ ratio: 0, ratioChanged: false, transition: "none" })
    expect(sampler.isActive).toBe(true)

    sampler.enabled = true
    expect(tick(sampler, 10, 150).transition).toBe("restore-with-event")
    expect(sampler.isActive).toBe(false)
  })

  test("a zero fade radius still activates inside the rect and restores outside it", () => {
    const inside = new GhostSampler()
    inside.fadeRadiusPx = 0
    expect(tick(inside, 150, 150)).toEqual({ ratio: 1, ratioChanged: true, transition: "activate" })

    const outside = new GhostSampler()
    outside.fadeRadiusPx = 0
    outside.markActive()
    expect(tick(outside, 50, 150)).toEqual({ ratio: 0, ratioChanged: false, transition: "restore-with-event" })
  })

  test("the fade gradient walks in without activating until it reaches 1.0", () => {
    const sampler = new GhostSampler()
    expect(tick(sampler, 50, 150)).toEqual({ ratio: 0.375, ratioChanged: true, transition: "none" })
    expect(tick(sampler, 75, 150)).toEqual({ ratio: 0.6875, ratioChanged: true, transition: "none" })
    expect(tick(sampler, 150, 150)).toEqual({ ratio: 1, ratioChanged: true, transition: "activate" })
  })

  test("his live 200px radius reaches further than the 80px default", () => {
    // GhostFadeRadiusPx is 200 in %LOCALAPPDATA%\FuzzyClock\settings.json, so the default is not the
    // geometry the app actually runs at. Read-only: the file was read, never written.
    const sampler = new GhostSampler()
    sampler.fadeRadiusPx = 200
    expect(tick(sampler, 10, 150)).toEqual({ ratio: 0.55, ratioChanged: true, transition: "none" })
  })
})
