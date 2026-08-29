/**
 * `MainWindow.OnRenderingTick`, ported as a pure state machine so the renderer's rAF loop is four lines.
 *
 * The C# runs this on `CompositionTarget.Rendering` and its own doc-comment calls the body order
 * load-bearing, listing five numbered steps. All five are here in the same order, and the reason to port
 * it as a class rather than inline it into `renderer.ts` is that the *order* is the behaviour: the guard
 * chain short-circuits the opacity write but must NOT short-circuit the lerp, so visible state catches up
 * on the frame after the guard releases instead of jumping. That is one `if` in the wrong place away from
 * a fade that snaps when you finish a drag, and it is not observable from a screenshot.
 *
 * ## Why the pump lives in the renderer and not in main
 *
 * PERF-01 -- the v4.4 defect this phase is required to close rather than defer again -- is the fade
 * stuttering under load. In WPF the fade ran on the UI thread's render pump, which is the thread that
 * also handles input, layout and the 1 Hz clock. In Electron the equivalent choice would be
 * `win.setOpacity()` from main at 30 Hz, and that is the same defect rebuilt: main also owns the tray,
 * the settings file, the `typeperf` children and the 33 ms cursor poll, so a busy main process would
 * stall the fade exactly as before. Running the interpolation on the renderer's own `requestAnimationFrame`
 * and writing a composited property means a blocked main process delays the *target*, not the animation.
 *
 * ## What the opacity write is, and why it is an attribute
 *
 * `this.Opacity = _windowOpacity * (1.0 - _currentRatio)` is a WINDOW opacity in WPF. Here the window is
 * transparent and the widget is one `<svg id="root">`, so the equivalent is that element's opacity --
 * and it goes on as the SVG `opacity` **presentation attribute**, not `element.style.opacity`, for the
 * same CSP reason every colour does (`index.html` ships no `style-src 'unsafe-inline'`). `index.css`
 * therefore may not declare `opacity` on `#root`; `test/renderer-ids.test.ts` is what enforces that.
 *
 * Deliberately NOT `win.setOpacity()`, and this is the harder half of the decision, because main was
 * already calling it (`main.ts:205`, `mainWindow.setOpacity(settings.opacity)`) and the product could
 * have been split across the two layers -- window alpha times element alpha is the same number. Read off
 * `electron.d.ts:3115-3120`: `setOpacity` is **`@platform win32,darwin`** and "On Linux, does nothing."
 * Splitting the product would therefore have made the user's own opacity setting silently inert on one
 * of the three platforms this port is required to support, while the fade kept working -- a divergence
 * visible only to a Linux user, on a setting they had already saved. So the whole product moved here and
 * main's `setOpacity` call is gone.
 *
 * ## No DOM here
 *
 * `frame()` returns the number to write and lets the caller write it, so Bun can drive the whole pump.
 * `null` means "do not write" -- either converged or guarded -- which is a different statement from
 * "write the same value again", and `svg.ts`'s memo would collapse the two if this returned a number.
 *
 * ## Two deviations from `OnRenderingTick`, both deliberate and both named
 *
 * **1. An epsilon snap, because the C#'s convergence test cannot be reached for an intermediate target.**
 * `lerpRatio` snaps hard when the target is exactly 0 or 1, so those two converge on the first frame. But
 * `ProximityChanged` receives every value `computeProximityRatio` produces, and a cursor parked partway
 * into the halo is a target like 0.8 -- which the exponential approaches and never equals. `_currentRatio
 * == _targetRatio` then never holds, and WPF's `CompositionTarget.Rendering` stays attached forever,
 * ticking at the compositor's rate for a value that stopped changing. {@link RATIO_EPSILON} closes that
 * so the pump can actually stop, and the visible cost is bounded arithmetic rather than a judgement --
 * see its own note.
 *
 * **2. A converged frame still writes once if a guard swallowed the write.** In the C# the guards return
 * before the write while step 3 has already advanced `_currentRatio`, so a guard held long enough for the
 * lerp to converge means the write never happens at all: step 1 early-returns from then on. Reproduction,
 * with the C#'s own numbers -- start a drag, move onto the widget, and the target becomes exactly 1.0,
 * which `lerpRatio` snaps to on the very next frame while `_isDragging` suppresses the write. Every later
 * frame takes step 1. The widget stays at full opacity for the rest of that gesture even though ghost
 * mode is active and click-through has been applied. {@link FadePump.frame} tracks the swallowed write and
 * lands it on the first unguarded frame, which is why `skipped` is a *reason* rather than a boolean.
 */

import { lerpRatio } from "./ghost.js"

/** `MainWindow.LerpAlpha`. The C# comments it as a "smooth ~150 ms" feel. Measured constant, not tuned. */
export const LERP_ALPHA = 15

/**
 * The synthesised first-frame delta, from `OnRenderingTick`'s own `: 0.016` -- one 60 Hz frame.
 *
 * It exists because the first frame after subscribing has no previous timestamp to subtract, and a 0
 * delta would make `lerpRatio` a no-op for that frame. 0.016 rather than 1/60 exactly: the C# literal is
 * what is being ported, and at alpha 15 the difference is 1e-5 of one frame's progress.
 */
export const FIRST_FRAME_SECONDS = 0.016

/**
 * `Math.Clamp(deltaSeconds, 0.0, 0.1)` -- the C# calls it "defensive against clock changes / VM
 * time-warp / suspend-resume", and in Electron it earns its keep for a fourth reason: `requestAnimationFrame`
 * does not run in a hidden or occluded window, so the frame after the desktop is unlocked can carry a
 * delta of minutes. Without the ceiling that single frame would complete the entire fade in one step,
 * which looks like a flicker rather than a fade.
 */
export const MAX_FRAME_SECONDS = 0.1

/**
 * How close to the target counts as arrived. Deviation 1 in the header; this is the arithmetic for it.
 *
 * `1 / 2048`, chosen against the only thing that can observe it: the compositor quantises the alpha it
 * renders to 8 bits, one level being `1 / 255`. The largest opacity error this snap can introduce is
 * `windowOpacity * RATIO_EPSILON`, which at the maximum opacity of 1.0 is 0.000488 -- and `0.000488 * 255`
 * is 0.124 of an alpha level. So it can change the rendered level at all only where the true asymptote
 * lies within 0.124 of a rounding boundary, and then by exactly one level out of 255.
 *
 * Not a tuning knob: making it larger starts truncating the visible tail of a fade, and making it smaller
 * buys nothing a display can show while pushing the pump back toward never stopping.
 */
export const RATIO_EPSILON = 1 / 2048

/** The guards that suppress the opacity WRITE while still advancing the lerp. Order is the C#'s. */
export interface FadeGuards {
  /** `_isDragging`. The widget must not fade out from under a drag. */
  readonly dragging: boolean
  /** `_settingsWindow?.IsVisible == true`. Always false until Phase 6.5 exists to set it. */
  readonly settingsOpen: boolean
  /** RMB-04's `_menuOpen`. The widget must not fade out from under its own context menu. */
  readonly menuOpen: boolean
}

export const NO_GUARDS: FadeGuards = { dragging: false, settingsOpen: false, menuOpen: false }

/** Why nothing was written. `"converged"` is the steady state and the caller's signal to stop the pump. */
export type FadeSkip = "converged" | "dragging" | "settings" | "menu"

/**
 * Which guard wins, in the C#'s order, or null for none.
 *
 * Extracted rather than written as three `if`s inside `frame()` because the deviation-2 path needs the
 * same chain a second time, and two copies of a precedence order is how a precedence order drifts.
 */
function firstGuard(guards: FadeGuards): FadeSkip | null {
  if (guards.dragging) return "dragging"
  if (guards.settingsOpen) return "settings"
  if (guards.menuOpen) return "menu"
  return null
}

export interface FadeFrame {
  /** The value to write to `#root`'s `opacity`, or `null` for "nothing to write this frame". */
  readonly opacity: number | null
  /** The lerped visible ratio after this frame. Exposed for the probe and the tests, not for the caller. */
  readonly ratio: number
  /** Why nothing was written, when nothing was. Null means the `opacity` above is a value to write. */
  readonly skipped: FadeSkip | null
}

export class FadePump {
  /** `_currentRatio` -- the lerped, visible value. Only this class and a restore snap write it. */
  #currentRatio = 0
  /** `_targetRatio` -- where the sampler says we are heading. */
  #targetRatio = 0
  /** `_previousRenderTime`, as a `performance.now()` reading. `null` until the first frame. */
  #previousMs: number | null = null
  /** `_windowOpacity` -- the user's own opacity setting, which the fade multiplies. */
  #windowOpacity = 1
  /** Deviation 2: a guard swallowed a write, so one is owed once the guards clear. */
  #owedWrite = false

  get currentRatio(): number {
    return this.#currentRatio
  }

  get targetRatio(): number {
    return this.#targetRatio
  }

  /**
   * What `#root`'s `opacity` should be right now, with no frame advanced and no state touched.
   *
   * The single answer to that question, and the reason it is public: two callers change the pump's state
   * out of band -- a settings push moving `#windowOpacity`, and {@link restore} -- and both then have to
   * put the result on screen themselves, because the pump may legitimately not be running. The
   * alternative was those callers each recomputing `windowOpacity * (1 - ratio)`, which is the formula
   * this whole module exists to have exactly one copy of.
   */
  visibleOpacity(): number {
    return this.#windowOpacity * (1 - this.#currentRatio)
  }

  /** `ProximityChanged`: set the destination and nothing else. The pump owns the journey. */
  setTarget(ratio: number): void {
    this.#targetRatio = ratio
  }

  /** `_windowOpacity`, from `settings.opacity`. A settings push lands here. */
  setWindowOpacity(opacity: number): void {
    this.#windowOpacity = opacity
  }

  /**
   * The `Restored` handler: `this.Opacity = _windowOpacity`, with the lerp state cleared.
   *
   * Separate from a target of 0 on purpose. `Restored` fires at the moment the cursor leaves the halo
   * entirely, and the C# snaps rather than fading the last of the way -- because by then the ratio IS
   * 0 and there is nothing left to interpolate. Clearing `#previousMs` too, so the frame after a long
   * gap does not carry a stale delta into the next fade.
   *
   * This serves all THREE edges the C# resets on, which is why it is not named `onRestored`:
   * `Restored` itself, and both sides of `SetGhostModeEnabled`. The enable edge matters as much as the
   * disable one and the C# says why -- a sampler message queued just before a disable would otherwise
   * survive as a stale target that a later re-enable lerps toward for one frame, which is a visible
   * one-frame ghost flash. Zeroing on both edges makes the contract symmetric and closes it.
   *
   * Returns nothing: the caller writes {@link visibleOpacity}, which after this call is the user's own
   * opacity unmultiplied. An earlier draft returned that number here, which meant two ways to ask the
   * same question and one of them only correct immediately after a restore.
   */
  restore(): void {
    this.#currentRatio = 0
    this.#targetRatio = 0
    this.#previousMs = null
    this.#owedWrite = false
  }

  /**
   * One frame. `nowMs` is a `performance.now()` reading; the caller owns the clock so Bun can drive it.
   *
   * The five steps are `OnRenderingTick`'s, in its order and with its numbering.
   */
  frame(nowMs: number, guards: FadeGuards = NO_GUARDS): FadeFrame {
    // (1) Convergence early-return -- D-10 / D-11, plus deviation 2's escape from it. An exact `===` on a
    // float is safe for the reason the C# gives: `lerpRatio`'s terminal snap lands `#currentRatio` exactly
    // on a target of 0 or 1, and `RATIO_EPSILON` below does the same for every other target, so this
    // compare means arrived rather than coincidentally-equal.
    const converged = this.#currentRatio === this.#targetRatio
    if (converged && !this.#owedWrite) {
      // The frame clock is only meaningful WITHIN a continuous run of frames, and this return is where a
      // run ends -- the renderer detaches its rAF loop on exactly this value. Keeping `#previousMs` across
      // the gap would make the first frame of the NEXT fade subtract a timestamp from before it, and the
      // 0.1 ceiling would then turn a ten-minute gap into 78% of the fade in one frame: a flicker rather
      // than an obviously wrong number. `restore()` already did this for the two reset edges; a detach at a
      // non-zero ratio -- a cursor parked partway into the halo -- is the third way to get there, and it is
      // the one no edge covers.
      this.#previousMs = null
      return { opacity: null, ratio: this.#currentRatio, skipped: "converged" }
    }

    if (!converged) {
      // (2) deltaSeconds -- D-01, with the first-frame baseline and the defensive clamp.
      const deltaSeconds = Math.min(
        Math.max(this.#previousMs === null ? FIRST_FRAME_SECONDS : (nowMs - this.#previousMs) / 1000, 0),
        MAX_FRAME_SECONDS,
      )
      this.#previousMs = nowMs

      // (3) The lerp -- FADE-01. `lerpRatio` owns the D-03 terminal snap for the two exact targets.
      this.#currentRatio = lerpRatio(this.#currentRatio, this.#targetRatio, LERP_ALPHA, deltaSeconds)
      // Deviation 1: arrive, for an intermediate target that the exponential only approaches.
      if (Math.abs(this.#targetRatio - this.#currentRatio) < RATIO_EPSILON) {
        this.#currentRatio = this.#targetRatio
      }
    }

    // (4) The guard chain -- D-13 / SEM-04, in the C#'s order. These return AFTER step 3, never before:
    // the lerp has already advanced, so releasing a guard resumes the fade from where it would have been
    // rather than jumping. Reversing steps 3 and 4 is the defect this file exists to make impossible.
    const guard = firstGuard(guards)
    if (guard !== null) {
      this.#owedWrite = true
      return { opacity: null, ratio: this.#currentRatio, skipped: guard }
    }

    // (5) The write -- FADE-02, from `#currentRatio` (the visible value) and never from `#targetRatio`.
    this.#owedWrite = false
    return { opacity: this.visibleOpacity(), ratio: this.#currentRatio, skipped: null }
  }
}
