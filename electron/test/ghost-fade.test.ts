/**
 * `FadePump` -- `MainWindow.OnRenderingTick`'s five steps, its guard chain, and the two places this port
 * deliberately diverges from it.
 *
 * There is no C# suite to translate: `OnRenderingTick` is a `CompositionTarget.Rendering` handler that
 * writes `this.Opacity` and returns void, so nothing on that side could observe it without a window. Making
 * it a pure state machine that RETURNS the number to write is what makes this file possible at all, and the
 * expectations below come from three places, kept distinct:
 *
 *   - **the C# source**, read line by line, for the step order, the guard order, the `0.016` first-frame
 *     literal, the `[0.0, 0.1]` clamp and the `_windowOpacity * (1.0 - _currentRatio)` product;
 *   - **`lerpRatio`**, already measured against the compiled controller in `ghost.test.ts`, evaluated inline
 *     here rather than restated as a literal;
 *   - **measurement in this runtime**, for the two arms that are about float behaviour rather than about
 *     ported logic -- the 31-frame convergence and the 5000-frame negative control below.
 *
 * ## What each deviation's arm has to discriminate
 *
 * Both deviations are additions to the C#, so an arm that only checks the happy path would pass against the
 * unmodified port. Each therefore ships with the negative control that fails without it:
 *
 *   - **the epsilon snap** -- a raw `lerpRatio` chain driven 5000 frames at an intermediate target still
 *     does not equal the target, so `#currentRatio === #targetRatio` would never hold and the pump could
 *     never report `"converged"`;
 *   - **the owed write** -- the same sequence with the guard held to convergence, asserted to produce a
 *     write on the frame after release. Remove `#owedWrite` and step 1 early-returns forever, which is
 *     exactly the drag defect the C# has.
 */
import { describe, expect, test } from "bun:test"
import {
  FIRST_FRAME_SECONDS,
  FadePump,
  LERP_ALPHA,
  MAX_FRAME_SECONDS,
  NO_GUARDS,
  RATIO_EPSILON,
  type FadeGuards,
} from "../src/core/ghost-fade.js"
import { lerpRatio } from "../src/core/ghost.js"

/** One 60 Hz step, in ms -- what a real `requestAnimationFrame` hands the pump. */
const FRAME_MS = 1000 / 60

function guards(overrides: Partial<FadeGuards> = {}): FadeGuards {
  return { ...NO_GUARDS, ...overrides }
}

/** Drive `n` frames from `startMs` at 60 Hz, returning every frame. */
function run(pump: FadePump, n: number, g: FadeGuards = NO_GUARDS, startMs = 1_000): ReturnType<FadePump["frame"]>[] {
  const frames: ReturnType<FadePump["frame"]>[] = []
  for (let i = 0; i < n; i++) frames.push(pump.frame(startMs + i * FRAME_MS, g))
  return frames
}

describe("the constants are the C#'s, not round numbers that look like them", () => {
  test("LerpAlpha, the first-frame delta and the clamp ceiling", () => {
    expect(LERP_ALPHA).toBe(15)
    // 0.016, not 1/60. The C# literal is what is ported, and the two differ.
    expect(FIRST_FRAME_SECONDS).toBe(0.016)
    expect(FIRST_FRAME_SECONDS).not.toBe(1 / 60)
    expect(MAX_FRAME_SECONDS).toBe(0.1)
  })

  test("RATIO_EPSILON's cost is under an eighth of one 8-bit alpha level", () => {
    // The arithmetic its doc comment claims, asserted rather than trusted: the compositor quantises alpha to
    // 1/255, and the worst error this snap can introduce is `windowOpacity * RATIO_EPSILON` at opacity 1.0.
    expect(RATIO_EPSILON).toBe(1 / 2048)
    expect(RATIO_EPSILON * 255).toBeLessThan(0.125)
    // And it is a power of two, so it is exact in binary and the compare below cannot itself round.
    expect(Math.log2(1 / RATIO_EPSILON) % 1).toBe(0)
  })
})

describe("step 1: the convergence early-return", () => {
  test("a fresh pump is already converged and writes nothing", () => {
    // Both ratios start at 0, so the very first frame is the steady state. This is what lets the renderer
    // start with the pump detached and only attach it when a target arrives.
    const pump = new FadePump()
    expect(pump.frame(1_000)).toEqual({ opacity: null, ratio: 0, skipped: "converged" })
  })

  test("a converged frame CLEARS the clock, so the frame after a long gap is not a jump", () => {
    // The frame clock is only meaningful within a continuous run of frames, and convergence is where a run
    // ends -- the renderer detaches its rAF loop on exactly this value. If `#previousMs` survived the gap,
    // the first frame of the next fade would subtract a timestamp from before it, the 0.1 ceiling would cap
    // the delta, and 78% of the fade would happen in that one frame.
    const pump = new FadePump()
    run(pump, 5)
    pump.setTarget(0.5)
    expect(pump.frame(9_999_999).ratio).toBe(lerpRatio(0, 0.5, LERP_ALPHA, FIRST_FRAME_SECONDS))
  })

  test("and it clears it after a REAL run of frames, which is the reachable case", () => {
    // The arm above passes vacuously on a fresh pump -- `#previousMs` is still null there, so it cannot
    // distinguish clearing the clock from never having set it. This one runs a full fade first, parks at a
    // non-zero ratio (a cursor stopped partway into the halo, which no reset edge covers), and only then
    // takes the long gap. Without the clear, the frame below closes 78% of the gap instead of 21%.
    const pump = new FadePump()
    pump.setTarget(0.05)
    run(pump, 200)
    expect(pump.currentRatio).toBe(0.05)

    pump.setTarget(0.9)
    const resumed = pump.frame(9_999_999)
    expect(resumed.ratio).toBe(lerpRatio(0.05, 0.9, LERP_ALPHA, FIRST_FRAME_SECONDS))
    expect(resumed.ratio).not.toBe(lerpRatio(0.05, 0.9, LERP_ALPHA, MAX_FRAME_SECONDS))
    // The size of what the clear is worth, stated: a fifth of the gap rather than four fifths.
    expect((resumed.ratio - 0.05) / (0.9 - 0.05)).toBeCloseTo(0.213, 3)
  })

  test("converged is reported for a non-zero ratio too, not just at rest", () => {
    const pump = new FadePump()
    pump.setTarget(1)
    expect(run(pump, 1)[0]?.ratio).toBe(1)
    expect(pump.frame(2_000)).toEqual({ opacity: null, ratio: 1, skipped: "converged" })
  })
})

describe("step 2: deltaSeconds, its baseline and its clamp", () => {
  test("the first frame uses the synthetic 0.016 regardless of the timestamp it is handed", () => {
    // There is no previous timestamp to subtract, and a 0 delta would make the whole frame a no-op.
    for (const nowMs of [0, 1, 1_000, 1e9]) {
      const pump = new FadePump()
      pump.setTarget(0.5)
      expect(pump.frame(nowMs).ratio).toBe(lerpRatio(0, 0.5, LERP_ALPHA, FIRST_FRAME_SECONDS))
    }
  })

  test("a real delta is the difference in seconds", () => {
    const pump = new FadePump()
    pump.setTarget(0.5)
    const after = pump.frame(1_000).ratio
    expect(after).toBe(lerpRatio(0, 0.5, LERP_ALPHA, FIRST_FRAME_SECONDS))
    // `#previousMs` is now the first frame's timestamp, so this frame's delta is 20 ms.
    expect(pump.frame(1_000 + 20).ratio).toBe(lerpRatio(after, 0.5, LERP_ALPHA, 0.02))
  })

  test("a gap longer than 100 ms is clamped, so an unlock does not flicker the fade", () => {
    // `requestAnimationFrame` does not run in a hidden or occluded window, so the frame after the desktop is
    // unlocked can legitimately carry a delta of minutes. Two runs, one at exactly the ceiling and one at
    // ten minutes, must produce the same ratio -- that equality IS the clamp.
    const atCeiling = new FadePump()
    atCeiling.setTarget(0.5)
    atCeiling.frame(1_000)
    const ceiling = atCeiling.frame(1_000 + MAX_FRAME_SECONDS * 1000).ratio

    const afterUnlock = new FadePump()
    afterUnlock.setTarget(0.5)
    afterUnlock.frame(1_000)
    const unlocked = afterUnlock.frame(1_000 + 600_000).ratio

    expect(unlocked).toBe(ceiling)
    expect(ceiling).toBe(lerpRatio(lerpRatio(0, 0.5, LERP_ALPHA, FIRST_FRAME_SECONDS), 0.5, LERP_ALPHA, MAX_FRAME_SECONDS))
  })

  test("a backwards clock clamps to zero, which stalls the fade for that frame instead of reversing it", () => {
    // `Math.Clamp(delta, 0.0, 0.1)`'s lower bound, and the C# names the case: a wall-clock change or a VM
    // time-warp. A negative delta through the formula would move `#currentRatio` AWAY from the target.
    const pump = new FadePump()
    pump.setTarget(0.5)
    const first = pump.frame(1_000).ratio
    const backwards = pump.frame(500)
    expect(backwards.ratio).toBe(first)
    // The timestamp is still adopted, so the next frame measures from the new clock rather than compounding
    // the gap.
    expect(pump.frame(520).ratio).toBe(lerpRatio(first, 0.5, LERP_ALPHA, 0.02))
  })
})

describe("step 3 and step 5: the lerp and the product", () => {
  test("an exact target of 1 or 0 snaps on the first frame, because lerpRatio owns that", () => {
    const fadeOut = new FadePump()
    fadeOut.setTarget(1)
    expect(fadeOut.frame(1_000)).toEqual({ opacity: 0, ratio: 1, skipped: null })

    fadeOut.setTarget(0)
    expect(fadeOut.frame(1_016)).toEqual({ opacity: 1, ratio: 0, skipped: null })
  })

  test("the written value is windowOpacity * (1 - currentRatio), never the target", () => {
    const pump = new FadePump()
    pump.setWindowOpacity(0.6)
    pump.setTarget(0.5)
    const first = pump.frame(1_000)
    expect(first.ratio).toBeLessThan(0.5)
    expect(first.opacity).toBe(0.6 * (1 - first.ratio))
    // The arm that catches a write from `#targetRatio`: that would be 0.3 here, and it is not.
    expect(first.opacity).not.toBe(0.6 * (1 - 0.5))
  })

  test("visibleOpacity answers the same question without advancing a frame", () => {
    const pump = new FadePump()
    pump.setWindowOpacity(0.8)
    pump.setTarget(0.5)
    const first = pump.frame(1_000)
    // Narrowed through a throw rather than compared against `first.opacity` directly, and it is a real arm
    // rather than a type appeasement: `FadeFrame.opacity` is `number | null`, so a frame that had SKIPPED
    // would leave both comparisons below asking whether a number equals null -- which is a question with an
    // answer, and therefore a green this arm has no business producing.
    const written = first.opacity
    if (written === null) throw new Error(`the first frame wrote nothing (skipped: ${String(first.skipped)})`)
    expect(pump.visibleOpacity()).toBe(written)
    // Called twice, it is still the same -- it is a read, and the renderer's settings path depends on that.
    expect(pump.visibleOpacity()).toBe(written)
    expect(pump.currentRatio).toBe(first.ratio)
  })

  test("windowOpacity is the unfaded setting, and it diverges from visibleOpacity mid-fade", () => {
    const pump = new FadePump()
    pump.setWindowOpacity(0.8)
    // Unfaded and faded agree at rest, which is why this arm cannot be written at rest alone.
    expect(pump.windowOpacity).toBe(0.8)
    expect(pump.visibleOpacity()).toBe(0.8)

    pump.setTarget(0.5)
    const first = pump.frame(1_000)
    expect(first.ratio).toBeGreaterThan(0)
    // `SetOpacity`'s branch (`MainWindow.xaml.cs:1775-1778`): the settings window open means the user is
    // dragging the opacity slider, and what they must see is the value they are choosing rather than that
    // value dimmed by a halo the cursor happens to be inside. So this is the number the renderer writes on a
    // settings push while `settingsOpen`, and it is NOT the one the pump would have written.
    expect(pump.windowOpacity).toBe(0.8)
    expect(pump.visibleOpacity()).toBeLessThan(0.8)
    // Narrowed through a throw for the reason the arm above gives: `number | null` compared against a number
    // is a question with an answer, and a frame that skipped would answer it green.
    const written = first.opacity
    if (written === null) throw new Error(`the first frame wrote nothing (skipped: ${String(first.skipped)})`)
    expect(pump.visibleOpacity()).toBe(written)

    // A read, not a frame: neither ratio moved.
    expect(pump.currentRatio).toBe(first.ratio)
    expect(pump.targetRatio).toBe(0.5)
  })

  test("setWindowOpacity moves the product without touching the journey", () => {
    const pump = new FadePump()
    pump.setTarget(0.5)
    const first = pump.frame(1_000)
    pump.setWindowOpacity(0.25)
    expect(pump.currentRatio).toBe(first.ratio)
    expect(pump.visibleOpacity()).toBe(0.25 * (1 - first.ratio))
  })

  test("a full fade in and back out is monotonic in both directions", () => {
    const pump = new FadePump()
    pump.setTarget(0.9)
    const inFrames = run(pump, 40)
    for (let i = 1; i < inFrames.length; i++) {
      expect(inFrames[i]?.ratio).toBeGreaterThanOrEqual(inFrames[i - 1]?.ratio ?? 0)
    }
    expect(pump.currentRatio).toBe(0.9)

    pump.setTarget(0.2)
    const outFrames = run(pump, 40, NO_GUARDS, 5_000)
    for (let i = 1; i < outFrames.length; i++) {
      expect(outFrames[i]?.ratio).toBeLessThanOrEqual(outFrames[i - 1]?.ratio ?? 1)
    }
    expect(pump.currentRatio).toBe(0.2)
  })
})

describe("step 4: the guard chain suppresses the write and NOT the lerp", () => {
  test("a guarded frame still advances the ratio", () => {
    // The one `if` in the wrong place this module exists to make impossible. If the guard returned before
    // step 3, releasing it would resume from a stale ratio and the fade would jump.
    const guarded = new FadePump()
    guarded.setTarget(0.5)
    const held = guarded.frame(1_000, guards({ dragging: true }))
    expect(held.opacity).toBeNull()
    expect(held.skipped).toBe("dragging")
    expect(held.ratio).toBe(lerpRatio(0, 0.5, LERP_ALPHA, FIRST_FRAME_SECONDS))

    // Same sequence unguarded reaches the same ratio, which is what "the guard did not skip the lerp" means.
    const free = new FadePump()
    free.setTarget(0.5)
    expect(free.frame(1_000).ratio).toBe(held.ratio)
  })

  test("releasing a guard resumes from where the fade got to, not from where it was pinned", () => {
    const pump = new FadePump()
    pump.setTarget(0.5)
    const held = run(pump, 10, guards({ menuOpen: true }))
    const last = held[held.length - 1]
    expect(last?.opacity).toBeNull()
    const released = pump.frame(1_000 + 10 * FRAME_MS, NO_GUARDS)
    expect(released.opacity).toBe(1 - released.ratio)
    expect(released.ratio).toBeGreaterThan(last?.ratio ?? 0)
  })

  test("the precedence is dragging, then settings, then menu -- the C#'s order", () => {
    const all = new FadePump()
    all.setTarget(0.5)
    expect(all.frame(1_000, { dragging: true, settingsOpen: true, menuOpen: true }).skipped).toBe("dragging")

    const noDrag = new FadePump()
    noDrag.setTarget(0.5)
    expect(noDrag.frame(1_000, { dragging: false, settingsOpen: true, menuOpen: true }).skipped).toBe("settings")

    const menuOnly = new FadePump()
    menuOnly.setTarget(0.5)
    expect(menuOnly.frame(1_000, { dragging: false, settingsOpen: false, menuOpen: true }).skipped).toBe("menu")
  })

  test("`skipped` is a reason and not a boolean, so converged is distinguishable from pinned", () => {
    // The renderer's pump stops on `"converged"` and only on that. If the three guards reported the same
    // value as convergence, a menu opening would detach the loop and the write owed on close would never
    // land -- which is the same defect as the C#'s, arrived at from the other direction.
    const pump = new FadePump()
    pump.setTarget(1)
    expect(pump.frame(1_000, guards({ menuOpen: true })).skipped).toBe("menu")
    expect(pump.frame(1_016, guards({ menuOpen: true })).skipped).toBe("menu")
    expect(pump.frame(1_032, NO_GUARDS).skipped).toBeNull()
    expect(pump.frame(1_048, NO_GUARDS).skipped).toBe("converged")
  })
})

describe("deviation 1: the epsilon snap, and the negative control that needs it", () => {
  test("a raw lerp chain at an intermediate target never reaches it, even after 5000 frames", () => {
    // Measured in this runtime, and this is the whole justification for the deviation: WPF's
    // `_currentRatio == _targetRatio` cannot hold for a target like 0.8, so its `CompositionTarget.Rendering`
    // handler stays attached forever ticking on a value that stopped changing.
    let raw = 0
    for (let i = 0; i < 5_000; i++) raw = lerpRatio(raw, 0.8, LERP_ALPHA, FIRST_FRAME_SECONDS)
    expect(raw).not.toBe(0.8)
    expect(Math.abs(0.8 - raw)).toBeLessThan(RATIO_EPSILON)
  })

  test("the pump does reach it, exactly, in 31 frames at the synthetic delta", () => {
    // 31 is measured, not chosen: at alpha 15 and dt 0.016 each frame closes 21.3% of the gap, so a starting
    // gap of 0.8 crosses 1/2048 on the 31st. Pinned exactly so a change to LERP_ALPHA or to the epsilon has
    // to be a deliberate edit here rather than a silently longer fade.
    const pump = new FadePump()
    pump.setTarget(0.8)
    let frames = 0
    while (pump.currentRatio !== 0.8 && frames < 500) {
      pump.frame(1_000 + frames * FIRST_FRAME_SECONDS * 1000)
      frames++
    }
    expect(frames).toBe(31)
    expect(pump.currentRatio).toBe(0.8)
    expect(pump.frame(9_000).skipped).toBe("converged")
  })

  test("the snap lands ON the target, so it can never overshoot it", () => {
    // `#currentRatio = #targetRatio` rather than a nudge, which is why the exact `===` in step 1 is safe and
    // why the visible error is bounded by the epsilon rather than accumulating.
    for (const target of [0.05, 0.25, 0.5, 0.7, 0.8, 0.95, 0.999]) {
      const pump = new FadePump()
      pump.setTarget(target)
      run(pump, 200)
      expect(pump.currentRatio).toBe(target)
      expect(pump.targetRatio).toBe(target)
    }
  })

  test("the last written opacity is within an eighth of an alpha level of the true asymptote", () => {
    // The cost of the snap, in the only unit that can observe it. `windowOpacity` at its maximum is the
    // worst case, which is why it is the one measured.
    const pump = new FadePump()
    pump.setWindowOpacity(1)
    pump.setTarget(0.8)
    const frames = run(pump, 200)
    const settled = frames.filter((f) => f.opacity !== null).at(-1)
    expect(settled?.opacity).toBe(1 - 0.8)
    const levels = Math.abs((settled?.opacity ?? 0) - (1 - 0.8)) * 255
    expect(levels).toBeLessThan(0.125)
  })
})

describe("deviation 2: the write a guard swallowed is still owed", () => {
  test("the C# drag defect, reproduced up to the point the port diverges", () => {
    // The C#'s own numbers: a drag is in progress, the cursor moves onto the widget, the target becomes
    // exactly 1.0, and `lerpRatio` snaps to it on the very next frame while `_isDragging` suppresses the
    // write. From then on step 1 early-returns and the write never happens -- the widget sits at full
    // opacity for the rest of the gesture with click-through already applied.
    const pump = new FadePump()
    pump.setTarget(1)
    const dragging = guards({ dragging: true })

    const first = pump.frame(1_000, dragging)
    expect(first.ratio).toBe(1)
    expect(first.opacity).toBeNull()

    // Converged AND guarded, for as long as the gesture lasts. Every one of these is where the C# stops.
    for (const frame of run(pump, 30, dragging, 1_016)) {
      expect(frame.opacity).toBeNull()
      expect(frame.skipped).toBe("dragging")
      expect(frame.ratio).toBe(1)
    }

    // The divergence: the first unguarded frame lands the owed write.
    const released = pump.frame(2_000, NO_GUARDS)
    expect(released).toEqual({ opacity: 0, ratio: 1, skipped: null })
    // And exactly once. The frame after it is the steady state again.
    expect(pump.frame(2_016, NO_GUARDS).skipped).toBe("converged")
  })

  test("the owed write survives a guard HANDOVER, not just a release", () => {
    // A real sequence: a drag ends over the widget and the right-click that follows opens the menu. If the
    // owed flag were cleared by anything other than the write itself, the handover would drop it.
    const pump = new FadePump()
    pump.setTarget(1)
    pump.frame(1_000, guards({ dragging: true }))
    pump.frame(1_016, guards({ menuOpen: true }))
    pump.frame(1_032, guards({ settingsOpen: true }))
    expect(pump.frame(1_048, NO_GUARDS)).toEqual({ opacity: 0, ratio: 1, skipped: null })
  })

  test("a write delivered normally owes nothing, so an idle pump stays silent", () => {
    // The other direction, and the arm that stops `#owedWrite` becoming "always write": a converged pump
    // that was never guarded must report `"converged"` forever, or the renderer's rAF loop never detaches.
    const pump = new FadePump()
    pump.setTarget(1)
    expect(pump.frame(1_000).skipped).toBeNull()
    for (const frame of run(pump, 20, NO_GUARDS, 1_016)) expect(frame.skipped).toBe("converged")
  })

  test("an unconverged guarded frame owes nothing extra -- it is already going to write", () => {
    // Mid-fade, guard released: the write comes from step 5 as normal, and the ratio is one frame further
    // on than when the guard was applied. Nothing about the owed flag may add a second write here.
    const pump = new FadePump()
    pump.setTarget(0.5)
    const held = pump.frame(1_000, guards({ menuOpen: true }))
    const released = pump.frame(1_016, NO_GUARDS)
    expect(released.skipped).toBeNull()
    expect(released.ratio).toBeGreaterThan(held.ratio)
    expect(released.opacity).toBe(1 - released.ratio)
  })
})

describe("restore: the snap the three reset edges share", () => {
  test("it zeroes both ratios and leaves visibleOpacity at the user's own setting", () => {
    const pump = new FadePump()
    pump.setWindowOpacity(0.7)
    pump.setTarget(1)
    pump.frame(1_000)
    expect(pump.currentRatio).toBe(1)

    pump.restore()
    expect(pump.currentRatio).toBe(0)
    expect(pump.targetRatio).toBe(0)
    expect(pump.visibleOpacity()).toBe(0.7)
    expect(pump.frame(1_016).skipped).toBe("converged")
  })

  test("it clears the owed write, so a reset taken mid-drag does not fire one later", () => {
    // The disable edge can arrive while a guard is held -- ghost mode turned off from the tray during a
    // drag. `restore()` has already put the correct opacity on screen by then, and an owed write surviving
    // it would repaint a ratio that no longer exists.
    const pump = new FadePump()
    pump.setTarget(1)
    pump.frame(1_000, guards({ dragging: true }))
    pump.restore()
    expect(pump.frame(1_016, NO_GUARDS).skipped).toBe("converged")
  })

  test("it clears the frame clock, so the next fade starts from the synthetic baseline", () => {
    // Without this the first frame of the next fade would subtract a timestamp from before the reset, and
    // the 0.1 clamp would turn that into a near-instant fade rather than an obviously wrong one.
    const pump = new FadePump()
    pump.setTarget(0.5)
    pump.frame(1_000)
    pump.restore()
    pump.setTarget(0.5)
    expect(pump.frame(9_999_999).ratio).toBe(lerpRatio(0, 0.5, LERP_ALPHA, FIRST_FRAME_SECONDS))
  })

  test("restore returns nothing -- visibleOpacity is the single answer", () => {
    // An earlier draft returned the opacity here, which made two ways to ask the same question and one of
    // them only correct immediately after a restore. Pinned so it cannot come back.
    const pump = new FadePump()
    expect(pump.restore()).toBeUndefined()
  })
})
