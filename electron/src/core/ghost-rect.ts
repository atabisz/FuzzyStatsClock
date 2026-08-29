/**
 * Electron's `{x, y, width, height}` bounds to the four edges `computeProximityRatio` wants.
 *
 * This is the adapter Phase 2 named and deferred: `core/ghost.ts` mirrors the C#'s flat 7-argument
 * signature deliberately, so the conversion had to live somewhere, and it is small enough that putting
 * it anywhere else would have hidden the two decisions inside it.
 *
 * ## Decision 1: the right and bottom edges are EXCLUSIVE, because Win32's are
 *
 * `GetWindowRect` fills a `RECT` whose `right`/`bottom` are one past the last pixel -- `right - left`
 * IS the width. `GhostModeController` passes `rect.Right` straight into the ratio, where the inside
 * test is `cursorX <= rectRight`, so in the WPF app a cursor one DIP past the widget's last painted
 * column still reads as *inside*. `x + width` reproduces that exactly.
 *
 * The alternative -- `x + width - 1`, the last painted column -- is the more defensible geometry and
 * is NOT what is shipped here, because this port's contract is behavioural parity and the asymmetry is
 * observable: it is a one-DIP-wider halo on two of the four sides. Stated rather than silently
 * corrected, and pinned by a test, so a future change to the "obviously right" version fails loudly
 * instead of shifting the fade boundary by a pixel nobody can find.
 *
 * ## Decision 2: DIPs, not physical pixels -- and this one is a real divergence
 *
 * Win32 gives `GetWindowRect` and `GetCursorPos` in PHYSICAL pixels, so WPF's `GhostFadeRadiusPx` is a
 * physical-pixel radius. Electron's `getBounds()` and `screen.getCursorScreenPoint()` are both in DIPs.
 * Mixing them is the one thing that would be wrong, and it is not what happens here: both operands come
 * from the DIP APIs, so the ratio is computed consistently in DIP space.
 *
 * What that means at a scale factor other than 1.0 is that the same stored `ghostFadeRadiusPx` covers a
 * different number of physical pixels than the WPF app's did -- at 150%, 1.5x more. There is no
 * conversion that fixes this without picking a display to convert against, which is wrong on a
 * multi-monitor desk with mixed scaling (this one, at 1.00 / 1.25 / 1.00). DIPs are also the better
 * unit for the feature: the halo is about *perceived* cursor distance, which is what a DIP is for.
 * Recorded because Alex's live file says `200`, and 200 of something has to be defined.
 */

/** What `BrowserWindow.getBounds()` returns, structurally -- so nothing here imports Electron. */
export interface WindowBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The four edges, in `computeProximityRatio`'s argument order. */
export interface RectEdges {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** Win32 `RECT` semantics over Electron bounds: right and bottom are exclusive. See the header. */
export function boundsToEdges(bounds: WindowBounds): RectEdges {
  return {
    left: bounds.x,
    top: bounds.y,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height,
  }
}
