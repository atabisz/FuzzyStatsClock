/**
 * `MainWindow.Window_PreviewMouseWheel` -- scroll on the widget to dim it.
 *
 * ## Why this exists at all, which is the interesting part
 *
 * Found while wiring Phase 5's fade, by reading every writer of `_windowOpacity` in the C# rather than
 * only the one the fade needed. There are three, and this is the one **no phase of the port owned**: the
 * plan's phase table has no row for it and the word "wheel" appears nowhere in the plan document. It is a
 * Phase 3 omission (a window interaction, like the drag and the right-click that phase did port) and it is
 * paid here because Phase 5 is the phase that owns `opacity`, and because a daily-use gesture that
 * silently does nothing is exactly the kind of gap a "Phase 5 closed" claim would have papered over.
 *
 * ## Two things the C# does that a naive port gets wrong
 *
 * **The sign is inverted between the two input models.** WPF's `e.Delta > 0` means scroll *up*, and the C#
 * comments it as increasing opacity. The DOM's `WheelEvent.deltaY` is *negative* for scroll up. Porting
 * `Math.Sign(e.Delta)` straight across therefore produces a widget that dims when you scroll up -- and it
 * would look deliberate, because it still works. The negation lives in `renderer.ts`, at the boundary where
 * the DOM's convention is, and this function takes a plain direction so the two conventions never meet.
 *
 * **`Math.Sign`, not the magnitude.** A high-resolution wheel or a trackpad emits many small deltas per
 * physical notch, and scaling by the magnitude would make one notch a different step on every device. The
 * C#'s comment says exactly this ("exactly one 10% step per physical notch"), so the direction is all this
 * function accepts.
 *
 * ## The clamp is asymmetric with `validateSettings`, and that is the C#'s
 *
 * `SettingsService.Validate` guards opacity only from below (`<= 0 -> 1.0`) and lets 1.5 through, while
 * this clamps to `[0.10, 1.0]`. So a settings file holding 1.5 survives a load and then snaps to 1.0 on
 * the first scroll. Measured behaviour of the C#, kept: the alternative would let a hand-edited file put
 * the widget somewhere the wheel can never return it to.
 */

/** `step = Math.Sign(e.Delta) * 0.10` -- one notch, one tenth. */
export const OPACITY_STEP = 0.1

/**
 * `Math.Clamp(_windowOpacity + step, 0.10, 1.0)`.
 *
 * The floor is the invisible-widget guard, and it is the same regression `SettingsService`'s `<= 0` arm
 * exists for: a fully transparent overlay cannot be found, let alone scrolled back up.
 */
export const OPACITY_MIN = 0.1
export const OPACITY_MAX = 1.0

/** One wheel notch. `direction` is +1 for brighter and -1 for dimmer -- never a raw wheel delta. */
export function stepOpacity(current: number, direction: number): number {
  // A zero direction is what `Math.sign` returns for a delta of exactly 0, which Chromium does emit at the
  // end of a smooth-scroll gesture. It has to be a no-op rather than a clamp of `current + 0`, because
  // `current` may legitimately be 1.5 from a hand-edited file and clamping it here would make a scroll
  // event that carries no direction still change the setting. No finiteness guard: `validateSettings`
  // rejects a non-finite opacity before it can reach here, and the clamp below propagates NaN unchanged
  // anyway -- a check that cannot alter the result reads as protection that exists.
  if (direction === 0) return current
  const next = current + Math.sign(direction) * OPACITY_STEP
  return Math.min(Math.max(next, OPACITY_MIN), OPACITY_MAX)
}
