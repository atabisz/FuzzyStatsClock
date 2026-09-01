/**
 * `GhostDriver` -- the platform half of ghost mode, driven with fakes.
 *
 * Every Electron surface this driver touches is a structural interface (`GhostWindowLike`,
 * `CursorSourceLike`), which is what makes this file possible with no Electron on the path: the fakes below
 * are object literals, and Electron's real `BrowserWindow` and `screen` were checked against the same two
 * interfaces at the call site in `main.ts`. So these arms cover the ordering and the edges, and
 * `probe-shell.ts` covers the one thing a fake cannot -- that `setIgnoreMouseEvents(true)` actually sets
 * `WS_EX_TRANSPARENT` on a live window.
 *
 * ## What each block is really testing
 *
 * The sampler's own logic is already exhaustively tested in `ghost.test.ts` against the compiled C#. What is
 * new here is everything the driver adds on top of it, and all four of those additions are defects if they
 * are missing rather than features if they are present:
 *
 *   - **`markActive()`** -- without it the sampler emits `"activate"` on all 30 ticks a second while the
 *     cursor sits over the widget, and the driver re-applies the same window style on every one.
 *   - **the D-08 early return** -- without it a cursor parked away from the widget still costs an IPC message
 *     30 times a second, which is the cost the whole feature is supposed to not have when idle.
 *   - **`deactivate()` on the disable edge** -- without it a re-enable with the cursor over the widget leaves
 *     it faded to invisible but NOT click-through, curable only by a restart.
 *   - **the emission order** -- `ProximityChanged` fires before the style mutation and before `Restored`, and
 *     a fake that records call order is the only way to see that.
 */
import { describe, expect, test } from "bun:test"
import { GhostDriver, SAMPLE_MS, type CursorSourceLike, type GhostWindowLike } from "../src/main/ghost.js"
import { DEFAULT_MODIFIER_CONFIG, NO_MODIFIERS, type ModifierConfig } from "../src/core/ghost.js"
import type { WindowBounds } from "../src/core/ghost-rect.js"

/** A 100x100 widget at (100,100) -- the rect the translated proximity suite uses. */
const BOUNDS: WindowBounds = { x: 100, y: 100, width: 100, height: 100 }
const RADIUS = 80

interface Harness {
  readonly driver: GhostDriver
  /** Every observable call, in order: `ignore:true`, `ratio:1`, `restored`, `log:…`. */
  readonly calls: string[]
  readonly ratios: number[]
  moveTo(x: number, y: number): void
  destroy(): void
  readonly styleWrites: boolean[]
}

function harness(
  options: {
    readonly readModifiers?: () => ModifierConfig
    readonly staleCursorRestoreTicks?: number
  } = {},
): Harness {
  const calls: string[] = []
  const ratios: number[] = []
  const styleWrites: boolean[] = []
  let cursor = { x: 1_000, y: 1_000 }
  let destroyed = false

  const window: GhostWindowLike = {
    getBounds: () => BOUNDS,
    setIgnoreMouseEvents: (ignore) => {
      styleWrites.push(ignore)
      calls.push(`ignore:${String(ignore)}`)
    },
    isDestroyed: () => destroyed,
  }
  const cursorSource: CursorSourceLike = { getCursorScreenPoint: () => cursor }

  const driver = new GhostDriver({
    window,
    cursor: cursorSource,
    onRatio: (ratio) => {
      ratios.push(ratio)
      calls.push(`ratio:${String(ratio)}`)
    },
    onRestored: () => calls.push("restored"),
    log: (level, message) => calls.push(`log:${level}:${message}`),
    ...(options.readModifiers === undefined ? {} : { readModifiers: options.readModifiers }),
    ...(options.staleCursorRestoreTicks === undefined
      ? {}
      : { staleCursorRestoreTicks: options.staleCursorRestoreTicks }),
  })
  driver.applySettings(true, RADIUS, DEFAULT_MODIFIER_CONFIG)

  return {
    driver,
    calls,
    ratios,
    styleWrites,
    moveTo: (x, y) => {
      cursor = { x, y }
    },
    destroy: () => {
      destroyed = true
    },
  }
}

/** Clear the construction-time log line so an arm can assert on an empty call list. */
function fresh(h: Harness): Harness {
  h.calls.length = 0
  h.ratios.length = 0
  h.styleWrites.length = 0
  return h
}

describe("the sample cadence and the timer", () => {
  test("SAMPLE_MS is the C#'s 33, not a 60 Hz frame", () => {
    // `System.Threading.Timer(…, 0, 33)`. 16 would be a smoother sampler and a different app.
    expect(SAMPLE_MS).toBe(33)
  })

  test("start ticks, stop stops, and a second start leaks no second timer", () => {
    // The negative control is the important half: if `start()` created a timer unconditionally, `stop()`
    // would clear only the last one and the count would keep climbing after it. That is a leak nothing else
    // in this suite could see, because every other arm drives `tick()` directly.
    const h = fresh(harness())
    h.driver.start()
    h.driver.start()
    return Bun.sleep(SAMPLE_MS * 4).then(async () => {
      const running = h.driver.counters.ticks
      expect(running).toBeGreaterThanOrEqual(2)
      h.driver.stop()
      const stopped = h.driver.counters.ticks
      await Bun.sleep(SAMPLE_MS * 4)
      expect(h.driver.counters.ticks).toBe(stopped)
      // And stopping twice is safe -- `before-quit` can run after a window-closed path already stopped it.
      h.driver.stop()
    })
  })
})

describe("D-08: nothing happens at steady state", () => {
  test("a cursor parked away from the widget costs one bounds read and a return", () => {
    const h = fresh(harness())
    for (let i = 0; i < 30; i++) h.driver.tick()
    expect(h.driver.counters).toEqual({ ticks: 30, skipped: 30 })
    // The claim that matters downstream: no IPC, no style write, nothing logged.
    expect(h.calls).toEqual([])
  })

  test("a cursor parked ON the widget is equally silent after the first tick", () => {
    // This is the `markActive()` arm. The sampler emits `"activate"` every tick until someone confirms it,
    // so a driver that forgot the confirmation would show 30 style writes here instead of one.
    const h = fresh(harness())
    h.moveTo(150, 150)
    for (let i = 0; i < 30; i++) h.driver.tick()
    expect(h.styleWrites).toEqual([true])
    expect(h.ratios).toEqual([1])
    expect(h.driver.counters).toEqual({ ticks: 30, skipped: 29 })
    expect(h.driver.isActive).toBe(true)
  })

  test("a disabled driver still ticks but does nothing, and does not clear its own flag", () => {
    // SEM-05, measured on the compiled C#: `IsEnabled = false` makes `onTick` return before the restore
    // branch. That is why the disable edge below has to clear the flag itself.
    const h = fresh(harness())
    h.moveTo(150, 150)
    h.driver.tick()
    expect(h.driver.isActive).toBe(true)
    fresh(h)
    h.driver.sampler.enabled = false
    for (let i = 0; i < 10; i++) h.driver.tick()
    expect(h.calls).toEqual([])
    expect(h.driver.counters.skipped).toBeGreaterThanOrEqual(10)
    expect(h.driver.isActive).toBe(true)
  })

  test("a destroyed window is skipped rather than reached into", () => {
    // The window can be gone while the interval is still pending: `before-quit` runs `ghost?.stop()`, but a
    // tick already queued would otherwise call `getBounds()` on a destroyed object and throw inside a timer.
    const h = fresh(harness())
    h.moveTo(150, 150)
    h.destroy()
    h.driver.tick()
    expect(h.calls).toEqual([])
    expect(h.driver.counters).toEqual({ ticks: 1, skipped: 1 })
  })
})

describe("the transitions, and the order they are emitted in", () => {
  test("activate pushes the ratio BEFORE mutating the style", () => {
    // `ProximityChanged` fires before the Win32 call in the C#. The renderer is therefore already fading
    // when the window goes click-through, rather than a frame behind it.
    const h = fresh(harness())
    h.moveTo(150, 150)
    h.driver.tick()
    expect(h.calls).toEqual(["ratio:1", "ignore:true"])
  })

  test("a partial retreat clears click-through and fires no Restored", () => {
    // The v4.0 P67 invariant: `Restored` is the cursor-left-the-halo signal, so only an exact 0.0 earns it.
    const h = harness()
    h.moveTo(150, 150)
    h.driver.tick()
    fresh(h)
    h.moveTo(150, 240) // 40 past the bottom edge, half the radius
    h.driver.tick()
    expect(h.calls).toEqual(["ratio:0.5", "ignore:false"])
    expect(h.driver.isActive).toBe(false)
  })

  test("a full retreat fires Restored, after the ratio and after the style", () => {
    const h = harness()
    h.moveTo(150, 150)
    h.driver.tick()
    fresh(h)
    h.moveTo(150, 200 + RADIUS) // exactly the radius past the exclusive bottom edge
    h.driver.tick()
    expect(h.calls).toEqual(["ratio:0", "ignore:false", "restored"])
  })

  test("crossing the halo inwards fades before it activates", () => {
    // The sequence a real approach produces: several ratio pushes with no style write, then the activate.
    const h = fresh(harness())
    for (const y of [200 + RADIUS - 1, 240, 220, 205, 199]) {
      h.moveTo(150, y)
      h.driver.tick()
    }
    expect(h.styleWrites).toEqual([true])
    expect(h.ratios).toHaveLength(5)
    expect(h.ratios.at(-1)).toBe(1)
    // Monotonic, which is the arm that would catch the two axes being swapped in `boundsToEdges`.
    for (let i = 1; i < h.ratios.length; i++) {
      expect(h.ratios[i]).toBeGreaterThan(h.ratios[i - 1] ?? 1)
    }
  })
})

describe("the disable edge, and the re-enable it protects", () => {
  test("disabling while active writes all three: style, flag, ratio", () => {
    const h = harness()
    h.moveTo(150, 150)
    h.driver.tick()
    fresh(h)

    h.driver.applySettings(false, RADIUS, DEFAULT_MODIFIER_CONFIG)
    expect(h.driver.isActive).toBe(false)
    expect(h.styleWrites).toEqual([false])
    expect(h.ratios).toEqual([0])
    expect(h.calls.some((call) => call.startsWith("log:info:ghost: click-through cleared"))).toBe(true)
  })

  test("re-enabling with the cursor still over the widget activates AND fades again", () => {
    // Both halves of `deactivate()`, and each catches a different defect on this one tick:
    //
    //   - without the `#isGhostMode` clear, the tick computes 1.0 against an already-active state, emits
    //     `"none"`, and leaves a widget faded to invisible but fully clickable -- restart-only;
    //   - without the `#lastProximityRatio` clear, `ratioChanged` is false, so `ratio:1` never fires while
    //     `ignore:true` still does -- a widget at FULL opacity that ignores clicks. That is the C#'s own
    //     behaviour, measured by reading every writer of `_lastProximityRatio`, and this port diverges.
    //
    // Written as an exact ordered list rather than two `some` checks, because the failure that motivated it
    // was a present style write next to an absent ratio push.
    const h = harness()
    h.moveTo(150, 150)
    h.driver.tick()
    h.driver.applySettings(false, RADIUS, DEFAULT_MODIFIER_CONFIG)
    fresh(h)

    h.driver.applySettings(true, RADIUS, DEFAULT_MODIFIER_CONFIG)
    h.driver.tick()
    expect(h.calls).toEqual(["ratio:1", "ignore:true"])
    expect(h.driver.isActive).toBe(true)
  })

  test("re-enabling with the cursor far away is correctly silent", () => {
    // The other direction of the same clear, and the arm that stops it becoming "always report an edge":
    // ratio 0 against a forgotten 0 is still no edge, which is right -- the renderer is already at full
    // opacity, and a redundant `ratio:0` would be an IPC message and a rAF loop attached for nothing.
    const h = harness()
    h.moveTo(150, 150)
    h.driver.tick()
    h.driver.applySettings(false, RADIUS, DEFAULT_MODIFIER_CONFIG)
    h.moveTo(1_000, 1_000)
    fresh(h)

    h.driver.applySettings(true, RADIUS, DEFAULT_MODIFIER_CONFIG)
    h.driver.tick()
    expect(h.calls).toEqual([])
    expect(h.driver.counters.skipped).toBeGreaterThan(0)
  })

  test("disabling while NOT active still restores interactivity, and logs nothing", () => {
    // Idempotent by design -- the style may already be clear -- but the log line is gated on having been
    // active, so a settings push that toggles ghost mode off twice does not narrate a clear that did not
    // happen. `onRatio(0)` fires either way: the renderer has to be told to snap back regardless.
    const h = fresh(harness())
    h.driver.applySettings(false, RADIUS, DEFAULT_MODIFIER_CONFIG)
    expect(h.styleWrites).toEqual([false])
    expect(h.ratios).toEqual([0])
    expect(h.calls.filter((call) => call.startsWith("log:"))).toEqual([])
  })

  test("an enable-to-enable settings push is not an edge and clears nothing", () => {
    // `applyWindowSettings` runs on every settings change, so most calls arrive with `enabled` unchanged. A
    // clear on those would drop click-through for a tick every time the user changed the accent colour.
    const h = harness()
    h.moveTo(150, 150)
    h.driver.tick()
    fresh(h)
    h.driver.applySettings(true, RADIUS, DEFAULT_MODIFIER_CONFIG)
    expect(h.calls).toEqual([])
    expect(h.driver.isActive).toBe(true)
  })

  test("the radius and the modifier config land on the sampler", () => {
    const h = harness()
    h.driver.applySettings(true, 200, { ctrl: false, alt: false, shift: true, win: false })
    expect(h.driver.sampler.fadeRadiusPx).toBe(200)
    expect(h.driver.sampler.modifiers).toEqual({ ctrl: false, alt: false, shift: true, win: false })
    // Alex's live settings file says 200, not the 80 default -- so the path that carries it has to work.
    expect(h.driver.sampler.fadeRadiusPx).not.toBe(RADIUS)
  })
})

describe("the modifier seam, which ships with no reader", () => {
  test("construction without a reader warns once, and names the consequence", () => {
    const h = harness()
    const warnings = h.calls.filter((call) => call.startsWith("log:warn:"))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("escape hatch is inert")
  })

  test("construction WITH a reader is silent", () => {
    const h = harness({ readModifiers: () => NO_MODIFIERS })
    expect(h.calls.filter((call) => call.startsWith("log:warn:"))).toEqual([])
  })

  test("isModifierHeld is false with the default reader, however it is configured", () => {
    const h = harness()
    expect(h.driver.isModifierHeld).toBe(false)
    h.driver.applySettings(true, RADIUS, DEFAULT_MODIFIER_CONFIG)
    expect(h.driver.isModifierHeld).toBe(false)
  })

  test("an injected reader is consulted on every read, not cached", () => {
    // The C#'s right-click gate calls the predicate at the moment of the click rather than reading whatever
    // the last 33 ms sample decided, so a cached value would answer for a keyboard state up to a tick old.
    let held: ModifierConfig = NO_MODIFIERS
    const h = harness({ readModifiers: () => held })
    expect(h.driver.isModifierHeld).toBe(false)
    held = { ctrl: true, alt: true, shift: false, win: false }
    expect(h.driver.isModifierHeld).toBe(true)
    held = { ctrl: true, alt: false, shift: false, win: false }
    // Ctrl+Alt configured, only Ctrl held: DET-03 is an AND across the configured keys.
    expect(h.driver.isModifierHeld).toBe(false)
  })

  test("a held modifier forces the ratio to zero even with the cursor inside the widget", () => {
    // SEM-03, and the whole point of the override: the widget stays interactive while the chord is down.
    const h = fresh(harness({ readModifiers: () => ({ ctrl: true, alt: true, shift: false, win: false }) }))
    h.moveTo(150, 150)
    h.driver.tick()
    expect(h.calls).toEqual([])
    expect(h.driver.isActive).toBe(false)
  })

  test("releasing the chord over the widget activates on the next tick", () => {
    let held: ModifierConfig = { ctrl: true, alt: true, shift: false, win: false }
    const h = fresh(harness({ readModifiers: () => held }))
    h.moveTo(150, 150)
    h.driver.tick()
    expect(h.calls).toEqual([])
    held = NO_MODIFIERS
    h.driver.tick()
    expect(h.calls).toEqual(["ratio:1", "ignore:true"])
  })
})

describe("the Linux/X11 stale-cursor watchdog (ISC-24.2)", () => {
  // Ported context: `screen.getCursorScreenPoint()` freezes at the last on-widget reading once
  // `setIgnoreMouseEvents(true)` is applied on Ozone/X11, so the poll never sees the cursor leave the
  // halo and the widget stays invisible. Reproduced against a real Electron 33 window driven by `xte`.
  // The watchdog forces a restore after N frozen ticks. Only Linux passes the option; the arms here
  // pass a small N so the count is legible.

  test("a frozen reading while click-through is applied forces a restore after N ticks", () => {
    const h = fresh(harness({ staleCursorRestoreTicks: 5 }))
    h.moveTo(150, 150)
    h.driver.tick() // activate
    expect(h.styleWrites).toEqual([true])
    // Five more ticks with the reading never changing — this is the freeze.
    for (let i = 0; i < 5; i++) h.driver.tick()
    expect(h.styleWrites).toEqual([true, false])
    expect(h.driver.isActive).toBe(false)
    expect(h.ratios.at(-1)).toBe(0)
    expect(h.calls.some((c) => c.includes("stale cursor watchdog"))).toBe(true)
  })

  test("with the option absent (Windows / macOS) a frozen on-widget reading never trips it", () => {
    // The negative control: on the two platforms where a parked-cursor reading is the truth rather than
    // a stale cache, the pure poll must be left alone.
    const h = fresh(harness())
    h.moveTo(150, 150)
    for (let i = 0; i < 60; i++) h.driver.tick()
    expect(h.styleWrites).toEqual([true])
    expect(h.driver.isActive).toBe(true)
    expect(h.calls.some((c) => c.includes("watchdog"))).toBe(false)
  })

  test("a reading that keeps changing over the widget never trips it", () => {
    // `staleTicks` resets on every changed reading, so a live poll — even one parked visually in place
    // but reporting sub-pixel jitter — stays ghosted for as long as the cursor is there.
    const h = fresh(harness({ staleCursorRestoreTicks: 5 }))
    for (let i = 0; i < 40; i++) {
      h.moveTo(140 + (i % 12), 150) // 140..151, all inside the 100..200 widget → ratio stays 1
      h.driver.tick()
    }
    expect(h.styleWrites).toEqual([true])
    expect(h.driver.isActive).toBe(true)
    expect(h.calls.some((c) => c.includes("watchdog"))).toBe(false)
  })

  test("a cursor parked OFF the widget never accrues toward a restore", () => {
    // The `sampler.isActive` guard on the counter: an idle poll of a parked cursor away from the widget
    // is legitimately unchanging and must cost nothing, exactly as D-08 requires.
    const h = fresh(harness({ staleCursorRestoreTicks: 5 }))
    for (let i = 0; i < 60; i++) h.driver.tick() // default cursor (1000,1000), off-widget
    expect(h.calls).toEqual([])
    expect(h.styleWrites).toEqual([])
  })

  test("after a watchdog restore, activation is suppressed until the reading actually changes", () => {
    const h = fresh(harness({ staleCursorRestoreTicks: 5 }))
    h.moveTo(150, 150)
    h.driver.tick()
    for (let i = 0; i < 5; i++) h.driver.tick() // trips the watchdog
    expect(h.styleWrites).toEqual([true, false])

    // Still frozen at the same point: no re-activation, however many ticks pass.
    for (let i = 0; i < 20; i++) h.driver.tick()
    expect(h.styleWrites).toEqual([true, false])
    expect(h.driver.isActive).toBe(false)

    // The reading finally moves (still over the widget): the suppression lifts and the next tick
    // re-activates through the normal sampler path.
    h.moveTo(151, 150)
    h.driver.tick()
    expect(h.styleWrites).toEqual([true, false, true])
    expect(h.driver.isActive).toBe(true)
  })

  test("a tray toggle off-then-on clears a wedged suppression", () => {
    const h = fresh(harness({ staleCursorRestoreTicks: 5 }))
    h.moveTo(150, 150)
    h.driver.tick()
    for (let i = 0; i < 5; i++) h.driver.tick() // watchdog trips, suppression on
    for (let i = 0; i < 5; i++) h.driver.tick() // still suppressed
    expect(h.driver.isActive).toBe(false)

    h.driver.applySettings(false, RADIUS, DEFAULT_MODIFIER_CONFIG)
    h.driver.applySettings(true, RADIUS, DEFAULT_MODIFIER_CONFIG)
    // Enable edge wiped the latch: the very next tick, with the cursor still on the widget, re-activates.
    h.driver.tick()
    expect(h.driver.isActive).toBe(true)
    expect(h.styleWrites.at(-1)).toBe(true)
  })
})
