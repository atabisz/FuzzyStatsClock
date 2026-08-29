/**
 * The pure half of ghost mode, ported from the Win32-free seams of
 * FuzzyClock.App/GhostModeController.cs: the proximity ratio, the per-frame opacity lerp, the
 * modifier-held predicate and the sampler tick that turns those into a state transition.
 *
 * Everything the C# does with Win32 stays out of this file. `GetCursorPos`/`GetWindowRect` become
 * the caller's problem, `WS_EX_TRANSPARENT` becomes `setIgnoreMouseEvents`, and the 33 ms
 * `System.Threading.Timer` becomes whatever Phase 5 chooses -- ISC-24 through ISC-26 own all three.
 * That split is not an invention of the port: the C# already carved `OnSampleTick` out as a
 * "pure-logic seam ... no Win32, no dispatcher, no events" so its own tests could reach it.
 *
 * ## Two things the port cannot carry over, both recorded rather than papered over
 *
 * **1. `IsModifierHeld` reads the keyboard; the port takes the keyboard as an argument.** The C#
 * calls `GetAsyncKeyState(VK_LCONTROL)` and friends inside the predicate, which is why its own
 * 12-row test can only ever assert `false` -- in a test process no key is down, so eleven of those
 * rows cannot distinguish the AND logic from `return false`. Splitting the read out of the predicate
 * makes the logic testable over all 256 (config x held) combinations, and leaves the read itself as a
 * Phase 5 platform seam. There is no Electron API for global key state without a native module;
 * choosing that mechanism is ISC-24's business, not this file's.
 *
 * **2. C# `int` arithmetic wraps and a JS number does not.** `rectLeft - cursorX` overflows for a
 * cursor at `int.MinValue`. Measured on both sides, the two still agree -- the ratio clamps to 0.0
 * either way -- so the port does not emulate wrapping, and no real cursor coordinate can reach the
 * region where the intermediates differ.
 *
 * Every added expectation in ghost.test.ts was measured against these same .cs files compiled into a
 * throwaway console project, not derived by reading them.
 */

/** `_ghostFadeRadiusPx`'s initialiser (GhostModeController.cs:76). Measured, not assumed. */
export const DEFAULT_FADE_RADIUS_PX = 80

/**
 * Which modifiers suppress ghost mode while held. Doubles as the shape of an observed key state,
 * since "which keys are configured" and "which keys are down" are the same four flags.
 *
 * The C# holds them as four positional bools and its own doc-comment wishes for a record; this is
 * that record.
 */
export interface ModifierConfig {
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly win: boolean
}

/** `_useCtrl`/`_useAlt`/`_useShift`/`_useWin` initialisers -- CFG-04 keeps v4.2's Ctrl+Alt. */
export const DEFAULT_MODIFIER_CONFIG: ModifierConfig = { ctrl: true, alt: true, shift: false, win: false }

/** No key configured and no key down. */
export const NO_MODIFIERS: ModifierConfig = { ctrl: false, alt: false, shift: false, win: false }

/**
 * `GhostTransition`, as a string union rather than an enum -- the four names are the whole value of
 * the type and a numeric ordinal would only be a thing to get wrong at a log line.
 */
export type GhostTransition = "none" | "activate" | "restore-no-event" | "restore-with-event"

/** `SampleResult`. `ratioChanged` is the SEM-01 edge signal, captured before the state write. */
export interface SampleResult {
  readonly ratio: number
  readonly ratioChanged: boolean
  readonly transition: GhostTransition
}

/**
 * Chebyshev proximity ratio: 1.0 inside the widget rect (edges included), falling linearly to 0.0 at
 * `radiusPx` outside it. Chebyshev rather than Euclidean, so the halo is square like the widget.
 *
 * Two edges of the behaviour are load-bearing and both are pinned by tests:
 * - a cursor exactly `radiusPx` away returns exactly 0.0, which is what the sampler needs to emit
 *   `restore-with-event` rather than `restore-no-event`;
 * - a NEGATIVE `radiusPx` returns 1.0 for a cursor outside the rect. That is not a designed
 *   behaviour, it is what the clamp does with a negative divisor -- measured, and pinned so a
 *   settings path that ever admits a negative radius fails a test rather than silently pinning the
 *   widget click-through.
 */
export function computeProximityRatio(
  cursorX: number,
  cursorY: number,
  rectLeft: number,
  rectTop: number,
  rectRight: number,
  rectBottom: number,
  radiusPx: number,
): number {
  // Step 1: inside, or on an edge.
  if (cursorX >= rectLeft && cursorX <= rectRight && cursorY >= rectTop && cursorY <= rectBottom) return 1

  // Step 2: PROX-08 zero-radius backward compatibility. Step 1 already ruled out "inside".
  //
  // Measured to be dead code, and kept anyway: with it removed, an outside cursor divides by zero,
  // `1 - Infinity` is -Infinity, and step 4's clamp returns the same 0.0. A mutation run confirmed no
  // input distinguishes the two. It stays because the C# has it, this port is 1:1, and the arm states
  // an intent (a zero radius means no halo) that the clamp only happens to satisfy.
  if (radiusPx === 0) return 0

  // Step 3: per-axis overshoot past the nearest edge, then Chebyshev distance.
  const dx = Math.max(rectLeft - cursorX, Math.max(0, cursorX - rectRight))
  const dy = Math.max(rectTop - cursorY, Math.max(0, cursorY - rectBottom))
  const distance = Math.max(dx, dy)

  // Step 4: normalise and clamp.
  const ratio = 1 - distance / radiusPx
  return Math.min(Math.max(ratio, 0), 1)
}

/**
 * Frame-rate-independent exponential approach to `target`, with a terminal-state snap.
 *
 * The snap (D-03) is an exact `=== 1` / `=== 0` compare, and that exactness is the point: the only
 * producer of the target is the sampler below, which emits exactly 1.0 and exactly 0.0 at the
 * transitions, so the snap fires precisely when a transition just happened and never merely because
 * the exponential got close. A target one ULP above 1.0 takes the formula path -- measured.
 *
 * No clamping on the result. The formula is bounded between `current` and `target` for any
 * `alpha * deltaSeconds >= 0`; a negative `deltaSeconds` sends it the other way, which is the
 * caller's problem in the C# too (it clamps the frame delta upstream).
 */
export function lerpRatio(current: number, target: number, alpha: number, deltaSeconds: number): number {
  // D-03: terminal-state snap. -0 === 0 in IEEE, so a -0 target snaps and returns -0, same as C#.
  if (target === 1 || target === 0) return target

  return current + (target - current) * (1 - Math.exp(-alpha * deltaSeconds))
}

/**
 * True when every configured modifier is currently held. DET-02: an empty configuration means the
 * override is disabled, which is false regardless of what is held -- not the vacuous true that
 * "every configured modifier" would otherwise give.
 *
 * DET-03 is an AND across the configured keys, and a key that is not configured is ignored rather
 * than required to be up: Ctrl+Alt configured and Ctrl+Alt+Shift held still counts as held.
 */
export function isModifierHeld(config: ModifierConfig, held: ModifierConfig): boolean {
  if (!config.ctrl && !config.alt && !config.shift && !config.win) return false

  return (
    (!config.ctrl || held.ctrl) &&
    (!config.alt || held.alt) &&
    (!config.shift || held.shift) &&
    (!config.win || held.win)
  )
}

/**
 * `OnSampleTick` and the two fields it owns, ported as a class because the seam is stateful: it
 * remembers the previous ratio to produce the edge signal, and the previous ghost state to produce
 * the transition.
 *
 * The asymmetry in that state is deliberate in the C# (D-06) and is preserved here: the tick CLEARS
 * `isGhostMode` on a restore, but never SETS it on an activate -- it emits `"activate"` and leaves
 * the write to whoever applies click-through. So a caller that ignores the transition gets
 * `"activate"` on every tick while the cursor sits over the widget, which is exactly what the C#
 * does and is measured in the tests. `markActive()` is the other half of that contract.
 */
export class GhostSampler {
  /** `_isGhostMode`. Public because the platform side both reads it (to apply the style) and needs
   * `markActive()` to close the loop; the C# exposes it as `IsActive` plus an internal field. */
  #isGhostMode = false
  /** `_lastProximityRatio`, initialised to 0.0 -- so a first tick that computes 0.0 reports no edge. */
  #lastProximityRatio = 0

  /** `IsEnabled`. SEM-05: false makes every tick a no-op that writes nothing. */
  enabled = true
  /** `GhostFadeRadiusPx`. His live settings file says 200, not this default. */
  fadeRadiusPx = DEFAULT_FADE_RADIUS_PX
  /** The `UpdateModifierConfig` quartet. */
  modifiers: ModifierConfig = DEFAULT_MODIFIER_CONFIG

  /** `IsActive` -- true while click-through is applied. */
  get isActive(): boolean {
    return this.#isGhostMode
  }

  /** The `Activate()` half of D-06: the tick emits `"activate"`, the caller confirms it here. */
  markActive(): void {
    this.#isGhostMode = true
  }

  onTick(
    cursorX: number,
    cursorY: number,
    rectLeft: number,
    rectTop: number,
    rectRight: number,
    rectBottom: number,
    modifiersHeld: boolean,
  ): SampleResult {
    // PROX-09 / SEM-05: disabled is a no-op, and notably does NOT clear isGhostMode.
    if (!this.enabled) return { ratio: 0, ratioChanged: false, transition: "none" }

    // D-10: read the config once per tick and use the snapshot for the rest of it.
    const modifiers = this.modifiers
    const radiusPx = this.fadeRadiusPx

    // SEM-03 / DET-02: holding a configured modifier forces the ratio to 0.0. With nothing
    // configured the flag is ignored entirely and ghost mode always activates.
    const anyConfigured = modifiers.ctrl || modifiers.alt || modifiers.shift || modifiers.win
    const ratio =
      anyConfigured && modifiersHeld
        ? 0
        : computeProximityRatio(cursorX, cursorY, rectLeft, rectTop, rectRight, rectBottom, radiusPx)

    // SEM-01: the edge signal, captured before the write below.
    const ratioChanged = ratio !== this.#lastProximityRatio

    let transition: GhostTransition
    if (ratio >= 1 && !this.#isGhostMode) {
      transition = "activate"
    } else if (ratio < 1 && this.#isGhostMode) {
      // The v4.0 P67 invariant: the Restored event fires only at full retreat, so only an exact 0.0
      // earns "restore-with-event".
      transition = ratio === 0 ? "restore-with-event" : "restore-no-event"
      this.#isGhostMode = false
    } else {
      transition = "none"
    }

    // The guard is redundant -- writing unconditionally would store the same value -- and mirrors
    // GhostModeController.cs:157 rather than any behaviour. Measured: no input distinguishes them.
    if (ratioChanged) this.#lastProximityRatio = ratio

    return { ratio, ratioChanged, transition }
  }
}
