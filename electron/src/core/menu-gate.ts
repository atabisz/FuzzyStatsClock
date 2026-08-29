/**
 * Whether a right-click on the widget should open the tray menu, ported from
 * FuzzyClock.App/RightClickMenuGate.cs.
 *
 * Three booleans and two rules: a drag never opens a menu (RMB-02), and a click-through widget only
 * opens one while the Ctrl+Alt escape hatch is held (RMB-03).
 *
 * The C# describes RMB-02 as "winning" over RMB-03, and its own test asserts that. Measured: the
 * precedence is unobservable -- both rules return false, so swapping the two lines changes no answer
 * for any of the eight inputs. The ordering is a readability choice, not behaviour, and the test that
 * looks like it pins it is really just pinning "a drag never opens a menu".
 *
 * The C# calls RMB-03 belt-and-braces, because WPF does not deliver mouse events at all while
 * `WS_EX_TRANSPARENT` is applied. That argument gets stronger in Electron, not weaker:
 * `setIgnoreMouseEvents(true)` is measured here delivering zero events (see ISC-24), so the guard
 * covers the same narrow window between the cursor poll restoring interactivity and the ratio
 * actually dropping.
 */

/** `RightClickMenuGate.ShouldOpen`. */
export function shouldOpenContextMenu(isDragging: boolean, isGhostActive: boolean, isCtrlAltHeld: boolean): boolean {
  if (isDragging) return false // RMB-02
  if (isGhostActive && !isCtrlAltHeld) return false // RMB-03
  return true
}
