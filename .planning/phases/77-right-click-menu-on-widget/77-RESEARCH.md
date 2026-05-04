# Phase 77: Right-Click Menu on Widget — Research

**Researched:** 2026-05-04
**Domain:** WPF + WinForms interop (ContextMenuStrip on AllowsTransparency=True frameless WPF window)
**Confidence:** HIGH

## Summary

Phase 77 re-introduces the right-click menu that was removed in v2.4, but this time sharing the **exact same `ContextMenuStrip` instance** that the tray `NotifyIcon` already uses. The instance lives on `MainWindow._trayIcon.ContextMenuStrip` (built by `TrayMenuBuilder.Build()`). `ContextMenuStrip.Show(Point)` accepts **screen coordinates**, which maps naturally to `System.Windows.Forms.Cursor.Position`. No new menu, no new callbacks, no new AppSettings — the work is narrow: three guards + one `menu.Show()` + two `Opening`/`Closed` handlers to pin/unpin `_proximityRatio`.

The four invariants (RMB-01..04) map to:
1. **Parity (RMB-01)** — reuse the existing `ContextMenuStrip` via `_trayIcon.ContextMenuStrip.Show(Cursor.Position)`; checkmarks already sync via the `Opening` handler wired in `TrayMenuBuilder:90` (no second wire needed).
2. **Drag suppression (RMB-02)** — single `if (_isDragging) return;` guard at handler top. `DragMove()` is a blocking Win32 modal loop that returns before `MouseRightButtonUp` could fire; the guard is belt-and-suspenders for edge cases.
3. **Ghost-mode suppression (RMB-03)** — **no new code needed**. When `_ghostMode.IsActive == true` the window has `WS_EX_TRANSPARENT` applied and Win32 routes the click to the window beneath; `MouseRightButtonUp` never fires in the first place. Ctrl+Alt held forces `_proximityRatio = 0.0` (`GhostModeController:117`) and keeps `WS_EX_TRANSPARENT` off, so right-click naturally works in that branch — zero extra logic.
4. **Proximity freeze (RMB-04)** — hook `ContextMenuStrip.Opening` to set `_menuOpen = true`, `Closed` to set `_menuOpen = false`. Consult the flag either (a) inside the `ProximityChanged` lambda at `MainWindow.xaml.cs:175-181` to skip the `this.Opacity` assignment, or (b) at the top of `GhostModeController.OnTimerTick`. Option (a) is smaller-diff.

**Primary recommendation:** Implement as a single `Window_MouseRightButtonUp` handler wired at the Window level (not on inner controls), guarding `_isDragging`, calling `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)`, and a one-line extension in `TrayMenuBuilder.Build` (or in MainWindow via `_trayIcon.ContextMenuStrip.Closed += ...`) to flip a new `bool _menuOpen` field that the `ProximityChanged` lambda reads.

## User Constraints

> This phase was spawned without a CONTEXT.md (no `/gsd:discuss-phase` was run). Constraints come from the additional_context block supplied by the orchestrator.

### Locked Decisions (from orchestrator / REQUIREMENTS.md)
- **Single source of truth:** The widget right-click MUST show the EXACT same `ContextMenuStrip` instance the tray uses — not a clone, not a WPF `ContextMenu`, not a rebuilt WinForms menu. Byte-for-byte parity (items, checkmarks, enabled state, click handlers).
- **Drag suppression:** Right-click is a no-op while `_isDragging == true` (matches existing "pause stats during drag" discipline).
- **Ghost-mode suppression:** When `_ghostMode.IsActive && !IsCtrlAltHeld()`, right-click must not open the menu. The `WS_EX_TRANSPARENT` click-through pattern already achieves this — no additional code required; Ctrl+Alt re-enables interactivity through the existing branch at `MainWindow.xaml.cs:985`.
- **Proximity freeze:** While the menu is open, `_proximityRatio` is pinned — the widget holds its current opacity until the menu closes.
- **No AppSettings changes** — RMB is always on.
- **No tray menu structure changes** — items, labels, callbacks all untouched.
- **No WPF `ContextMenu`** — the sole menu type is the existing WinForms `ContextMenuStrip`.

### Claude's Discretion
- Exact WPF event to wire (`MouseRightButtonUp` at Grid level vs `PreviewMouseRightButtonUp` at Window level). Recommendation: `PreviewMouseRightButtonUp` at Window level (bubbling guarantees + survives child-control hit-testing).
- Where to place the `_menuOpen` flag (MainWindow field vs GhostModeController property). Recommendation: MainWindow field, consulted in the `ProximityChanged` lambda — smallest diff, no controller API change.
- Whether to extract a small pure helper `ShouldOpenRightClickMenu(isDragging, isGhostActive, isCtrlAltHeld)` for unit testing. Recommendation: YES — the only testable slice of this phase.
- Whether to also hook the `Closing` event (in addition to `Closed`). Recommendation: `Closed` only (`Closing` can be cancelled by a sub-item click handler and then re-fire; `Closed` is the definitive "menu is gone" signal).

### Deferred Ideas (OUT OF SCOPE)
- Changing the tray menu structure (items, order, separators, icons).
- Adding a separate WPF `ContextMenu` for WPF-native styling — rejected by RMB-01 parity requirement.
- New AppSettings to toggle RMB on/off — rejected; RMB is always on.
- Custom positioning logic (e.g. snap to widget corner) — cursor-position is the Windows convention.
- Multi-monitor special-casing — `Cursor.Position` returns virtual-screen coordinates that span all monitors; `ContextMenuStrip.Show(Point)` handles cross-monitor placement natively.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RMB-01 | Right-click opens the exact same `ContextMenuStrip` at cursor with byte-for-byte parity | `TrayMenuBuilder.cs:89-196` — the existing `ContextMenuStrip` is stored as `_trayIcon.ContextMenuStrip`; `Show(Point)` accepts screen coordinates (Microsoft docs — see Sources). Checkmark sync already fires on `menu.Opening` (`TrayMenuBuilder.cs:90`). |
| RMB-02 | Suppress right-click while `_isDragging == true` | `MainWindow.xaml.cs:552-582` — existing drag handler sets `_isDragging = true` around the blocking `DragMove()` call. Simple guard: `if (_isDragging) return;`. |
| RMB-03 | Suppress right-click when Ghost Mode active AND Ctrl+Alt not held | `GhostModeController.cs:168-176` — `Activate()` applies `WS_EX_TRANSPARENT` which routes clicks to the window beneath. `MouseEnter`/`MouseRightButtonUp` never fire in WPF under this state (documented in project memory v2.3). Ctrl+Alt held forces ratio=0.0 at `GhostModeController.cs:115-119` — ghost never activates, WPF events fire normally. |
| RMB-04 | Freeze proximity fade while menu open (`_proximityRatio` pinned, opacity steady) | `MainWindow.xaml.cs:175-181` — `ProximityChanged` lambda already guards on `_isDragging` and `_settingsWindow?.IsVisible`; adding a `_menuOpen` guard is symmetric. `ContextMenuStrip.Opening`/`Closed` events fire reliably (Microsoft docs — inherited from `ToolStripDropDown`). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Windows.Forms` | .NET 10 BCL | `ContextMenuStrip`, `NotifyIcon`, `Cursor.Position` | Already referenced via `UseWindowsForms=true` in `FuzzyClock.App.csproj`; `TrayMenuBuilder` already consumes it. |
| `System.Windows` (WPF) | .NET 10 BCL | `MouseButtonEventArgs`, `PreviewMouseRightButtonUp` routed event | Already consumed by MainWindow; this is how frameless AllowsTransparency windows handle mouse input. |
| `System.Drawing` | .NET 10 BCL | `Point` (screen coordinates) | Needed for `ContextMenuStrip.Show(Point)` signature — `Cursor.Position` returns this type. |

### Supporting
_None — this phase adds no new dependencies._

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `_trayIcon.ContextMenuStrip` | Build a WPF `ContextMenu` | **Rejected** by RMB-01 — violates single-source-of-truth; duplicates 8 items + 2 separators + 4 sub-items; checkmark sync logic would need to fire from two sites. |
| `PreviewMouseRightButtonUp` at Window level | `MouseRightButtonUp` on inner Grid | Inner Grid handler misses right-clicks on `BackdropBorder`, `PhraseText`, `DialCanvas`, etc. because `Handled` may be set by ancestor styling. Preview-level at Window is the failsafe — fires even if bubble path is consumed. |
| `ContextMenuStrip.Show(Point)` | `Show(int, int)` | Functionally identical; `Cursor.Position` returns `Point` directly, so no unpack needed. |
| `menu.Closed` for un-freeze | `menu.Closing` | `Closing` is cancellable and can fire multiple times during a click-through-to-submenu interaction. `Closed` fires exactly once when the menu is truly gone. |

**Installation:** None — all types are already in the BCL + already referenced.

## Architecture Patterns

### Recommended Structure (minimal diff)

```
FuzzyClock.App/
├── MainWindow.xaml          # + PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp"
├── MainWindow.xaml.cs       # + _menuOpen field
│                            # + Window_PreviewMouseRightButtonUp handler
│                            # + menu.Opening/Closed wiring in ContentRendered (after _trayIcon = ...)
│                            # + _menuOpen guard in ProximityChanged lambda
├── RightClickMenuGate.cs    # NEW — pure static ShouldOpen(isDragging, isGhostActive, isCtrlAltHeld)
└── TrayMenuBuilder.cs       # UNCHANGED — single source of truth preserved
```

A three-touch change to `MainWindow.xaml.cs` plus a ten-line pure helper. Total expected LOC delta: **~25 lines**.

### Pattern 1: WinForms ContextMenuStrip.Show from WPF MouseRightButtonUp

**What:** Call `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)` from a WPF `PreviewMouseRightButtonUp` handler.

**When to use:** Always — this is the Windows convention (menu opens on button-UP, not DOWN) and the simplest interop path.

**Example:**
```csharp
// Source: MainWindow.xaml.cs pattern extension + Microsoft docs
// https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.toolstripdropdown.show
private bool _menuOpen = false;

private void Window_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
{
    // RMB-02: drag discipline — mirror the _isDragging guard from stats/contrast paths.
    // Defensive only: DragMove() is a blocking Win32 modal loop that returns on
    // left-button UP, so in practice a right-click UP during drag is impossible,
    // but the guard preserves the invariant symmetrically.
    if (_isDragging) return;

    // RMB-03: ghost-mode suppression is free — when WS_EX_TRANSPARENT is applied,
    // the click is routed to the window beneath and this handler never fires.
    // Ctrl+Alt held forces GhostModeController.ComputeProximityRatio to short-circuit
    // to 0.0 (GhostModeController.cs:117-119), so WS_EX_TRANSPARENT is never applied
    // in that branch — normal WPF event delivery resumes.
    // No code needed here for RMB-03.

    // ContextMenuStrip.Show(Point) expects SCREEN coordinates.
    // System.Windows.Forms.Cursor.Position returns screen coords per Microsoft docs.
    _trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position);
    e.Handled = true;
}
```

### Pattern 2: Proximity Freeze via ContextMenuStrip Lifecycle Events

**What:** Hook `Opening` to pin, `Closed` to unpin. Flag is read by the existing `ProximityChanged` lambda — no new plumbing through `GhostModeController`.

**When to use:** Any time the widget must hold steady opacity during a modal UI action (matches existing `_settingsWindow?.IsVisible` pattern at `MainWindow.xaml.cs:179`).

**Example:**
```csharp
// Source: MainWindow.xaml.cs:175-181 + existing Opening handler at TrayMenuBuilder.cs:90
// In ContentRendered, AFTER _trayIcon = _trayMenu.Build(...):
_trayIcon.ContextMenuStrip!.Opening += (_, _) => _menuOpen = true;
_trayIcon.ContextMenuStrip!.Closed  += (_, _) => _menuOpen = false;

// Then extend the existing ProximityChanged lambda (MainWindow.xaml.cs:175-181):
_ghostMode.ProximityChanged = ratio =>
{
    _proximityRatio = ratio;
    if (_isDragging) return;
    if (_settingsWindow?.IsVisible == true) return;
    if (_menuOpen) return;                          // NEW — RMB-04
    this.Opacity = _windowOpacity * (1.0 - ratio);
};
```

**Why this works:** `_proximityRatio` field still updates (so the value is preserved for resume), but `this.Opacity` assignment is skipped — the widget holds whatever opacity it had at the moment of `Opening`. When `Closed` flips `_menuOpen = false`, the next tick resumes normal fade from the cursor's new position.

**Critical invariant:** The `Opening` handler at `TrayMenuBuilder.cs:90` already calls `SyncCheckmarks(getState())`. Adding a SECOND `Opening` handler via `+=` is safe — WinForms event handlers fire in registration order, so `SyncCheckmarks` still runs first.

### Pattern 3: Pure Helper for Unit Testing

**What:** Extract the "should the menu open" decision into a static method so it can be unit-tested without WPF/WinForms infrastructure.

**When to use:** When UI wiring is mostly integration-bound but a single deterministic predicate can be lifted out.

**Example:**
```csharp
// Source: new file FuzzyClock.App/RightClickMenuGate.cs
// Follows existing pattern from GhostModeController.ComputeProximityRatio (pure static, testable)
namespace FuzzyClock.App;

internal static class RightClickMenuGate
{
    /// <summary>
    /// Returns true when a right-click should open the tray ContextMenuStrip.
    /// Pure function — no WPF/WinForms/Win32 dependencies so unit tests run headless.
    /// </summary>
    /// <param name="isDragging">MainWindow._isDragging — true during DragMove().</param>
    /// <param name="isGhostActive">GhostModeController.IsActive — true when WS_EX_TRANSPARENT is applied.</param>
    /// <param name="isCtrlAltHeld">GhostModeController.IsCtrlAltHeld() — true when both Left-Ctrl and Left-Alt are down.</param>
    public static bool ShouldOpen(bool isDragging, bool isGhostActive, bool isCtrlAltHeld)
    {
        if (isDragging) return false;                       // RMB-02
        if (isGhostActive && !isCtrlAltHeld) return false;  // RMB-03 (defensive; WPF wouldn't fire anyway)
        return true;
    }
}
```

### Anti-Patterns to Avoid
- **Creating a second WPF `ContextMenu`** that mirrors the tray menu. Violates RMB-01 byte-for-byte parity; doubles maintenance; checkmark drift is guaranteed.
- **Handling `MouseRightButtonDown` instead of `MouseRightButtonUp`.** Breaks Windows convention; users expect menus on button-release (matches File Explorer, every Microsoft app). `Down` also fires during the down-stroke of a would-be right-drag gesture.
- **Calling `menu.Show()` without an `e.Handled = true`** on the WPF event. The event continues to bubble and may trigger other right-click handlers on parent controls.
- **Using `PointToScreen` on a WPF `Point`** to manually convert coordinates. `Cursor.Position` is already screen-space — one API call, no DPI conversion, no manual math.
- **Hooking `Closing` instead of `Closed`.** `Closing` is cancellable and can fire spuriously; `Closed` fires exactly once when the menu is actually gone. Using `Closing` risks leaving `_menuOpen` stuck `true` if a handler cancels close.
- **Wiring the handler at the `Grid` level** (inside `Grid Background="#01000000"`). Inner children (`BackdropBorder`, text blocks) may intercept. Wire at `Window` level (Preview event) to catch the click before any child hit-test.
- **Forgetting that `_trayIcon.ContextMenuStrip` is nullable in the type system.** Use `!` suppressor — the tray is built in `ContentRendered` before any user interaction is possible.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Menu positioning at cursor | Manual `Left`/`Top` math on a `Popup` | `ContextMenuStrip.Show(Cursor.Position)` | Handles multi-monitor, DPI, off-screen-clamp, edge-flipping, and keyboard focus automatically. Win32 has done this for 25 years; reinventing it is a guaranteed regression. |
| Checkmark sync | New sync path for widget-invoked menu | Existing `menu.Opening += SyncCheckmarks` (`TrayMenuBuilder.cs:90`) | Fires on EVERY `.Show()` call regardless of invocation source. Single source of truth — tray and widget invocations get the same sync automatically. |
| Click-through suppression | Re-check Ctrl+Alt in the right-click handler | `WS_EX_TRANSPARENT` already suppresses click delivery | Win32 routes the click to the window beneath — WPF never fires `MouseRightButtonUp`. Adding a redundant check is dead code. |
| Menu open/close detection | Polling timer on `_trayIcon.ContextMenuStrip.Visible` | Event-driven `Opening`/`Closed` handlers | Events fire exactly when they should; polling wastes ticks and loses the "pin-at-opening" invariant (polling sees `Visible=true` only one tick later). |
| DPI-aware cursor coord | Manual `LogicalToDeviceUnits` conversion | `Cursor.Position` returns device pixels in screen space | Microsoft docs: "cursor's position in screen coordinates" — already device pixels, already multi-monitor aware. No conversion needed. |

**Key insight:** Every requirement in this phase has existing infrastructure that does the heavy lifting. This phase is **pure wiring** — four touchpoints in `MainWindow.xaml.cs` and one pure helper file. Anything more elaborate is over-engineering.

## Common Pitfalls

### Pitfall 1: AllowsTransparency=True + Right-Click Hit-Testing
**What goes wrong:** Right-clicks on transparent regions of the window pass through to the desktop/windows beneath — no WPF event fires.
**Why it happens:** WPF's hit-test system requires a non-null, non-transparent Background to produce a hit surface. A fully transparent (alpha=0) background has no hit surface.
**How to avoid:** MainWindow.xaml already handles this — `Grid Background="#01000000"` at line 22 provides a near-transparent (alpha=1) fill that IS hit-testable. The inline comment at lines 19-21 documents exactly this pitfall. **No change needed**, but verification: all right-click-receptive regions must sit above a non-zero-alpha background. `BackdropBorder` has `IsHitTestVisible="False"` — correct, it shouldn't absorb events.
**Warning signs:** Right-click works in the center (over text) but not in the transparent padding. Fix by confirming `Grid Background="#01000000"` is the outermost child.

### Pitfall 2: Menu Position Appears at Wrong Monitor
**What goes wrong:** On a multi-monitor setup with mixed DPI, the menu appears on the wrong monitor or clipped at the edge.
**Why it happens:** Using WPF `Mouse.GetPosition(this)` returns WPF device-independent units relative to the window origin — wrong type for `ContextMenuStrip.Show(Point)` which expects screen pixels.
**How to avoid:** Always use `System.Windows.Forms.Cursor.Position` — it's documented as screen coordinates and is multi-monitor/virtual-screen aware. **Never** manually convert via `PointToScreen` — unnecessary and introduces DPI risk.
**Warning signs:** Menu appears in top-left of primary monitor regardless of cursor location. Root cause: passed WPF-logical coords to `Show(Point)`.

### Pitfall 3: Menu Won't Close on First Click-Away
**What goes wrong:** User opens the menu, clicks outside, menu stays open. Requires a second click or Escape.
**Why it happens:** ContextMenuStrip is not parented to any WinForms `Control`, and the owning application hasn't given focus to the menu's message loop.
**How to avoid:** `ContextMenuStrip.Show(Point)` internally sets focus and installs a mouse hook — works correctly when called from the WPF UI thread. The trick: **ensure the call is on the Dispatcher thread**. `PreviewMouseRightButtonUp` already fires on it, so this is satisfied by construction. If anyone later tries to `Show()` from a background task (e.g. a hotkey timer), they must `Dispatcher.Invoke` first.
**Warning signs:** Menu appears but won't close on outside click. Check: is `Show()` being called from the UI thread?

### Pitfall 4: Checkmarks Go Stale When Invoked From Widget
**What goes wrong:** Widget-opened menu shows out-of-date checkmarks (e.g. Ghost Mode toggle lag).
**Why it happens:** Developer added a second `Opening` handler at the MainWindow level that runs AFTER `TrayMenuBuilder.SyncCheckmarks` and overwrites state, OR replaced (`=`) the existing handler instead of appending (`+=`).
**How to avoid:** Use `+=` to ADD the `_menuOpen = true` handler; never reassign. Never replicate `SyncCheckmarks` logic in MainWindow. The existing `Opening` handler at `TrayMenuBuilder.cs:90` is the sole source of truth for checkmark sync.
**Warning signs:** Tray-invoked menu shows correct checkmarks; widget-invoked menu shows stale ones. Diff the handler registration order.

### Pitfall 5: Proximity Resume Snaps Abruptly After Menu Close
**What goes wrong:** Menu closes, widget suddenly snaps to a new opacity that reflects the cursor position "now" (which has moved during the menu interaction).
**Why it happens:** This is NOT a bug — it's the expected behavior. `_proximityRatio` keeps updating in the polling timer even while `_menuOpen == true` (the guard only skips the `this.Opacity = ...` assignment, not the ratio recomputation). On close, the next tick applies the current ratio.
**How to avoid:** If the snap is jarring, add a one-time transition or force `_proximityRatio = 0.0` on menu close (the "Restored" pattern from `GhostModeController.cs:166-173`). **Recommended: don't add a transition** — mirrors existing `_settingsWindow` close behavior; adding transitions only for RMB introduces inconsistency.
**Warning signs:** User reports "widget jumps to full opacity when I close the menu". Confirm this is expected behavior, not a bug, and document in 77-PLAN.md.

### Pitfall 6: Event Bubbling Swallows the Right-Click
**What goes wrong:** Right-click on the phrase text or the stats panel does nothing; right-click on the empty margin works.
**Why it happens:** A child control (possibly `PhraseText` or a decoration) has a `MouseRightButtonUp` handler that sets `e.Handled = true`, breaking the bubble chain.
**How to avoid:** Wire at `PreviewMouseRightButtonUp` on the Window (tunnel, not bubble). Preview events fire BEFORE the regular event and propagate top-down from root, so no child handler can intercept first.
**Warning signs:** Right-click works in some regions, not others. Fix by switching to the Preview event at Window level.

### Pitfall 7: Multiple Rapid Right-Clicks Cause Menu to Flash Open/Closed
**What goes wrong:** Fast right-click spam causes visual flicker as the menu opens, closes, opens.
**Why it happens:** Each right-click calls `Show(Point)` — if the menu is already visible, `Show` repositions it. User-visible as a flicker.
**How to avoid:** Guard with `if (_menuOpen) return;` at the top of the handler (uses the same flag as the proximity guard). Menu stays open on the first click; subsequent right-clicks while open are ignored.
**Warning signs:** Flickering menu on rapid clicks. Add the idempotence guard.

## Code Examples

Verified patterns from official sources and the existing codebase:

### Example 1: Full Handler (drop-in for MainWindow.xaml.cs)

```csharp
// Source: pattern aligned with existing MainWindow.xaml.cs:552 (drag handler) and
// TrayMenuBuilder.cs:89 (menu instance) + Microsoft ContextMenuStrip.Show(Point) docs.
// Wire via XAML: PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp" on <Window>.

private bool _menuOpen = false;

private void Window_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
{
    // RMB-02: drag discipline.
    if (_isDragging) return;

    // Idempotence: don't reopen an already-open menu (anti-flicker guard).
    if (_menuOpen) return;

    // RMB-01: show the exact ContextMenuStrip instance the tray uses.
    // Cursor.Position is screen coordinates per Microsoft docs.
    // RMB-03 is satisfied by WS_EX_TRANSPARENT click-through (this handler
    // doesn't fire when ghost is active without Ctrl+Alt).
    _trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position);
    e.Handled = true;
}
```

### Example 2: Freeze Wiring in ContentRendered (one-time setup)

```csharp
// Source: MainWindow.xaml.cs ContentRendered, immediately after _trayIcon = _trayMenu.Build(...).
// Uses the existing ContextMenuStrip instance — no new menu, no new callbacks.

// RMB-04: freeze proximity fade while the menu is open.
_trayIcon.ContextMenuStrip!.Opening += (_, _) => _menuOpen = true;
_trayIcon.ContextMenuStrip!.Closed  += (_, _) => _menuOpen = false;
```

### Example 3: Extending the ProximityChanged Lambda (RMB-04)

```csharp
// Source: MainWindow.xaml.cs:175-181 — existing ProximityChanged wiring.
// Add ONE line: the _menuOpen guard, mirroring the _settingsWindow?.IsVisible pattern.

_ghostMode.ProximityChanged = ratio =>
{
    _proximityRatio = ratio;
    if (_isDragging) return;
    if (_settingsWindow?.IsVisible == true) return;
    if (_menuOpen) return;                              // NEW — RMB-04
    this.Opacity = _windowOpacity * (1.0 - ratio);
};
```

### Example 4: Pure Helper + Unit Test Skeleton

```csharp
// File: FuzzyClock.App/RightClickMenuGate.cs
namespace FuzzyClock.App;

internal static class RightClickMenuGate
{
    public static bool ShouldOpen(bool isDragging, bool isGhostActive, bool isCtrlAltHeld)
    {
        if (isDragging) return false;
        if (isGhostActive && !isCtrlAltHeld) return false;
        return true;
    }
}

// File: FuzzyClock.App.Tests/RightClickMenuGateTests.cs
// Pattern mirrors GhostModeControllerProximityTests.cs (parametric DataRow table).
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

[TestClass]
public class RightClickMenuGateTests
{
    [TestMethod]
    [DataRow(false, false, false, true,  DisplayName = "normal state -> open")]
    [DataRow(true,  false, false, false, DisplayName = "dragging -> suppress (RMB-02)")]
    [DataRow(false, true,  false, false, DisplayName = "ghost active, no Ctrl+Alt -> suppress (RMB-03)")]
    [DataRow(false, true,  true,  true,  DisplayName = "ghost active + Ctrl+Alt -> open (CTRLALT-01)")]
    [DataRow(true,  true,  true,  false, DisplayName = "dragging beats ghost+Ctrl+Alt (RMB-02 wins)")]
    [DataRow(false, false, true,  true,  DisplayName = "Ctrl+Alt alone (no ghost) -> open (no-op guard)")]
    public void ShouldOpen_Cases(bool isDragging, bool isGhostActive, bool isCtrlAltHeld, bool expected)
    {
        var result = RightClickMenuGate.ShouldOpen(isDragging, isGhostActive, isCtrlAltHeld);
        Assert.AreEqual(expected, result);
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WPF `ContextMenu` on Window | WinForms `ContextMenuStrip` shared with tray | v2.4 (2026-03-03) — "Tray-only controls" removed the WPF right-click menu | Parity requirement — widget and tray must never drift |
| `MouseRightButtonDown` as open trigger | `MouseRightButtonUp` (Preview, at Window level) | Standard Windows convention since Windows 95 | Prevents accidental open during right-drag gestures |
| Manual screen-coord conversion via `PointToScreen` | `System.Windows.Forms.Cursor.Position` direct | .NET Framework 2.0+ | Simpler; DPI-aware; multi-monitor-aware by construction |
| Polling `menu.Visible` for open state | `Opening`/`Closed` event handlers | .NET Framework 2.0+ | Event-driven, zero CPU cost, no race |

**Deprecated/outdated:**
- Referencing `ContextMenu` (the deprecated pre-.NET-2.0 class) instead of `ContextMenuStrip`. The codebase already uses the modern type.
- Using `Cursor.Current.Position` (obsolete access pattern). `Cursor.Position` is the static canonical accessor.

## Open Questions

1. **Does `ContextMenuStrip.Show(Point)` on a DPI-scaled monitor require manual adjustment?**
   - What we know: Microsoft docs state the Point is "the horizontal and vertical location of the screen's upper-left corner, in pixels" — i.e. device pixels in screen space. `Cursor.Position` returns the same units.
   - What's unclear: On mixed-DPI multi-monitor setups (e.g. 100% primary + 175% secondary), whether the Win32 menu code internally handles the cross-monitor transform or whether the app must call `SetProcessDpiAwarenessContext(PER_MONITOR_V2)` first.
   - Recommendation: The app already runs under WPF with AllowsTransparency=True (implicitly DPI-aware V1 at minimum; WPF defaults to system-DPI awareness). Test on a mixed-DPI rig during phase verification. If misalignment occurs, document the reproduction and add a `PerMonitorV2` manifest entry as a follow-up (not a Phase 77 blocker).

2. **Does WPF `PreviewMouseRightButtonUp` fire reliably when the cursor is over a `Canvas` child like `DialCanvas` that has `Visibility=Visible` in dial mode?**
   - What we know: Preview (tunneling) events start at the root and fire regardless of child `Handled` state at the Preview phase. The root is Window, so the handler runs first.
   - What's unclear: Whether any WPF input-system quirk around Canvas/shape hit-test interferes. Project memory doesn't record an issue.
   - Recommendation: Verify in the smoke test that right-click works in all four clock modes (Phrase/Dial/LCD/Nixie). Low risk — Preview events are documented to tunnel from Window root.

3. **Should the first click of a right-click-when-menu-already-open close the menu (natural dismiss) or be a second Show() attempt?**
   - What we know: ContextMenuStrip has a built-in dismiss-on-outside-click behavior. A right-click outside the menu WILL close it — that's handled by the menu's own message hook.
   - What's unclear: Whether the WPF window also receives that right-click (which then calls `Show()` again) OR whether the menu's message hook swallows it before WPF sees it.
   - Recommendation: The `if (_menuOpen) return;` idempotence guard at the handler top makes this a non-issue either way. Keep the guard regardless of how the underlying message flow resolves.

## Validation Architecture

> Config has `workflow.nyquist_validation: false`. Including this section per the orchestrator's output directive (step 5.5 checker uses it as a Wave 0 planning aid).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | MSTest 4.0.1 |
| Config file | `FuzzyClock.App.Tests/MSTestSettings.cs` (parallelization), `FuzzyClock.App.Tests/FuzzyClock.App.Tests.csproj` (net10.0-windows + UseWPF=true) |
| Quick run command | `dotnet test FuzzyClock.App.Tests/FuzzyClock.App.Tests.csproj --filter FullyQualifiedName~RightClickMenuGateTests` |
| Full suite command | `dotnet test FuzzyStatsClock.slnx` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RMB-01 | Right-click opens the tray ContextMenuStrip at cursor with byte-for-byte parity | manual-only | `N/A — menu.Show() requires a live message pump on a visible window; no automated test can exercise it without a UI driver like WinAppDriver` | N/A |
| RMB-02 | Drag suppresses right-click (`_isDragging == true` branch of gate) | unit | `dotnet test --filter "FullyQualifiedName~RightClickMenuGateTests.ShouldOpen_Cases&DisplayName~dragging"` | Wave 0 |
| RMB-03 | Ghost-active + no-Ctrl+Alt suppresses right-click | unit | `dotnet test --filter "FullyQualifiedName~RightClickMenuGateTests.ShouldOpen_Cases&DisplayName~ghost"` | Wave 0 |
| RMB-04 | `_menuOpen` pin blocks opacity change in ProximityChanged lambda | unit (indirect via the gate), manual (visual freeze) | `N/A for visual freeze — requires running app` | N/A (manual smoke) |

**Unit-testable surface:** Only `RightClickMenuGate.ShouldOpen(bool, bool, bool)` — the pure predicate extracted for exactly this purpose. It covers RMB-02 and RMB-03 logic fully. The actual `ContextMenuStrip.Show()` call, the screen-coord math, the `menu.Opening`/`Closed` wiring, and the `ProximityChanged` guard are NOT unit-testable in MSTest without a UI-automation framework (WinAppDriver, FlaUI) which is out of scope.

### Sampling Rate
- **Per task commit:** `dotnet test --filter FullyQualifiedName~RightClickMenuGate` — sub-second, covers the pure helper.
- **Per wave merge:** `dotnet test FuzzyStatsClock.slnx` — full 522-test baseline + any new tests.
- **Phase gate:** Full suite green + manual smoke-test checklist in 77-SUMMARY.md covering:
  1. Right-click over phrase text opens the tray menu at cursor (RMB-01 sighted verification)
  2. Checkmarks match what the tray shows (flip Ghost Mode in tray, verify widget-invoked menu reflects new state)
  3. Right-click during active drag does nothing (hold left, drag window, press right mid-drag — no menu)
  4. Right-click over ghost-faded widget without Ctrl+Alt does nothing (click falls through to desktop)
  5. Right-click over ghost-faded widget WITH Ctrl+Alt held opens menu
  6. While menu open, move cursor — widget opacity does NOT change (proximity freeze)
  7. Close menu — widget opacity resumes tracking cursor on next poll tick
  8. All four clock modes: Phrase, Dial, LCD, Nixie (right-click works in each)

### Wave 0 Gaps
- [ ] `FuzzyClock.App.Tests/RightClickMenuGateTests.cs` — covers RMB-02 and RMB-03 (new file)
- [ ] `FuzzyClock.App/RightClickMenuGate.cs` — pure helper (new file; imported by both handler and tests)

No framework install gap — MSTest 4.0.1 is already established in `FuzzyClock.App.Tests.csproj` and ships 89 existing App tests.

## Sources

### Primary (HIGH confidence)
- [ToolStripDropDown.Show Method — Microsoft Docs](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.toolstripdropdown.show) — verified overloads, `Show(Point)` uses **screen coordinates** explicitly ("The horizontal and vertical location of the screen's upper-left corner, in pixels"). `ContextMenuStrip` inherits `Show` from `ToolStripDropDown`.
- [Cursor.Position Property — Microsoft Docs](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.cursor.position) — verified return type is `Point` **in screen coordinates**.
- [ContextMenuStrip Class — Microsoft Docs](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.contextmenustrip) — verified events: `Opening` (cancellable), `Opened`, `Closing` (cancellable), `Closed`. Multiple handlers via `+=` fire in registration order.
- `c:\src\FuzzyStatsClock\FuzzyClock.App\TrayMenuBuilder.cs` — verified existing `ContextMenuStrip` construction, existing `Opening += SyncCheckmarks` at line 90, exposure via `NotifyIcon.ContextMenuStrip` at line 176.
- `c:\src\FuzzyStatsClock\FuzzyClock.App\MainWindow.xaml.cs` — verified `_trayIcon` field (line 52), `_isDragging` field (line 55), `_proximityRatio` field (line 56), `ProximityChanged` lambda wiring (lines 175-181), `Grid_MouseLeftButtonDown` drag handler (lines 552-582), ghost-mode Ctrl+Alt branch (lines 983-1002), proximity-aware opacity assignment (line 1274).
- `c:\src\FuzzyStatsClock\FuzzyClock.App\GhostModeController.cs` — verified `IsActive` property (line 60), `IsCtrlAltHeld()` method (lines 183-185), `Activate()` applying `WS_EX_TRANSPARENT` (lines 168-176), Ctrl+Alt forces ratio=0.0 (lines 115-119).
- `c:\src\FuzzyStatsClock\FuzzyClock.App\MainWindow.xaml` — verified `Grid Background="#01000000"` hit-test surface with inline pitfall comment (lines 19-23), `AllowsTransparency="True"` + `WindowStyle="None"` (lines 9-10), existing `PreviewMouseWheel` at Window level (line 17) as wiring precedent.
- Project memory (`C:\Users\altab\.claude\projects\c--src-FuzzyStatsClock\memory\MEMORY.md`) — verified v2.3 Ghost Mode discipline: WPF stops receiving mouse messages under `WS_EX_TRANSPARENT`, Ctrl+Alt branch pattern, pre-ghost cleanup order.

### Secondary (MEDIUM confidence)
- WebFetch of Microsoft docs for ContextMenuStrip events — confirmed `Opening`/`Opened`/`Closing`/`Closed` are inherited and cancellable (Opening/Closing only).

### Tertiary (LOW confidence)
- _None._ All critical claims anchored in HIGH-confidence sources (Microsoft docs + existing codebase).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all types are BCL, pattern already in use via tray; the existing `TrayMenuBuilder.cs` is a working proof-of-concept.
- Architecture: HIGH — four-touchpoint minimal-diff strategy derived directly from existing patterns (`_settingsWindow?.IsVisible` guard mirror, `Preview*` wiring precedent, `SyncCheckmarks` Opening handler proof).
- Pitfalls: HIGH — codebase comments (XAML lines 19-21) and project memory encode the hit-test and DPI-aware gotchas explicitly; Microsoft docs confirm `Show(Point)` coordinate semantics.
- RMB-03 "click-through is free" assertion: HIGH — project memory v2.3 explicitly documents that WPF stops receiving mouse messages under `WS_EX_TRANSPARENT`; `Window_MouseEnter` inline comment at `MainWindow.xaml.cs:988` independently confirms "WS_EX_TRANSPARENT is NOT applied — window stays fully interactive (drag, right-click, scroll)" in the Ctrl+Alt branch.

**Research date:** 2026-05-04
**Valid until:** 2026-06-03 (30 days — stable WinForms/WPF interop, no framework churn anticipated)
