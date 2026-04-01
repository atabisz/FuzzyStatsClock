# Phase 68: MainWindow Wiring + Contrast Guard — Research

**Researched:** 2026-03-27
**Domain:** WPF window opacity wiring, controller callback integration, drag-state guarding
**Confidence:** HIGH

## Summary

Phase 68 is a pure integration phase. All components already exist and were verified in Phase 67: `GhostModeController` fires `ProximityChanged` and `Restored`, the contrast controller accepts a `Func<bool> shouldSkip` predicate, and `_isDragging` / `_windowOpacity` fields are stable in `MainWindow`. This phase wires those three seams together.

The research domain is entirely internal to this codebase. No external libraries, new NuGet packages, or third-party APIs are involved. Every decision is already locked in the CONTEXT.md. The work is: one field addition, two handler edits, one block deletion, and one predicate update.

**Primary recommendation:** Follow CONTEXT.md decisions D-01 through D-07 exactly. There is nothing to research externally — the full implementation specification is already written.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Add `if (!IsEnabled) return;` at the **top of `OnTimerTick`** in `GhostModeController`. When ghost mode is disabled: no proximity computation, no `ProximityChanged` events, no `Activate()`. PROX-09 fully satisfied inside the controller — MainWindow needs no awareness of the enabled state for fade behavior. Note: `Window_MouseEnter` already has `|| !_ghostMode.IsEnabled` in the Ctrl+Alt branch condition (line 995) — this covers the hover-interaction path when ghost is off. D-01 covers the timer-driven path.

**D-02:** `private double _proximityRatio = 0.0;` field added to `MainWindow`. The `ProximityChanged` handler sets `_proximityRatio = ratio;` before applying any opacity change. The contrast skip predicate lambda captures `this` and reads `_proximityRatio` by reference at evaluation time — no new surface added to `GhostModeController`.

**D-03:** Delete the entire ghost activation block from `Window_MouseEnter` (lines 1013–1030): the synthetic MouseLeave cleanup (backdrop clear, timer reset, `_isHoverFastRefresh = false`), `_ghostMode.Activate()`, and `this.Opacity = 0.0`. The synthetic cleanup was a race-condition guard for the old snap-to-ghost transition (WS_EX_TRANSPARENT causing immediate WM_MOUSELEAVE delivery). Timer-driven entry eliminates that race. The handler body becomes Ctrl+Alt branch only.

**D-04:** `_ghostMode.ProximityChanged = ratio => { ... };` assigned after `_ghostMode.Initialize()`. Handler body: (1) Set `_proximityRatio = ratio;`, (2) If `_isDragging`, return — no opacity change during drag (PROX-10), (3) Set `this.Opacity = _windowOpacity * (1.0 - ratio)` — configured opacity scales to zero at ratio=1.0; `_windowOpacity` is never modified (SC-4).

**D-05:** `_ghostMode.Restored` already snaps `this.Opacity = _windowOpacity`. Add `_proximityRatio = 0.0;` to the Restored handler to keep the field in sync when cursor fully exits the proximity zone.

**D-06:** Update `_contrast.Initialize()` at line 153: `() => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging || _proximityRatio > 0.0`. This satisfies PROX-11 — sampler skips whenever cursor is in the proximity zone, not just when fully ghosted.

**D-07:** `GhostModeController.Activate()` remains `public` through Phase 68 as noted in Phase 67 D-03. Phase 68 removes the *call site* in `Window_MouseEnter`; the method signature is unchanged. Phase 69 is free to demote it to `internal` or leave it public.

### Claude's Discretion

None — all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- Settings slider for GhostFadeRadiusPx — Phase 69
- Live slider wiring (`_ghostMode.GhostFadeRadiusPx = value`) — Phase 69
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROX-09 | Proximity fade is fully gated by the Ghost Mode tray toggle — cursor approach has no opacity effect when Ghost Mode is off | Satisfied by D-01: `if (!IsEnabled) return;` at top of `OnTimerTick` stops all proximity computation and `ProximityChanged` events when disabled |
| PROX-10 | Proximity fade pauses during widget drag — widget stays at configured opacity while being dragged | Satisfied by D-04: `_isDragging` guard in `ProximityChanged` handler returns early before the `this.Opacity` assignment |
| PROX-11 | Auto-contrast sampler skips sampling while widget is in proximity fade state (prevents WCAG flicker feedback loop) | Satisfied by D-06: `|| _proximityRatio > 0.0` added to `_contrast.Initialize()` skip predicate |
</phase_requirements>

---

## Standard Stack

No new libraries or packages. All dependencies already in the project.

| Component | Location | Role in Phase 68 |
|-----------|----------|-----------------|
| `GhostModeController` | `FuzzyClock.App/GhostModeController.cs` | Source of `ProximityChanged` and `Restored` events; receives `IsEnabled` gate |
| `ContrastRefreshController` | `FuzzyClock.App/ContrastRefreshController.cs` | Receives updated skip predicate via `Initialize()` |
| `MainWindow` | `FuzzyClock.App/MainWindow.xaml.cs` | Integration point — all edits land here plus one in the controller |
| `GhostModeControllerProximityTests` | `FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs` | Existing test class — may receive the IsEnabled gate test |

No `npm install` or NuGet changes required.

## Architecture Patterns

### Pattern 1: Controller Callback via Action Delegate

`GhostModeController.ProximityChanged` is typed as `Action<double>?` (a plain delegate field, not an event). Assignment syntax:

```csharp
// Source: FuzzyClock.App/GhostModeController.cs line 75
// Source: CONTEXT.md D-04
_ghostMode.ProximityChanged = ratio =>
{
    _proximityRatio = ratio;
    if (_isDragging) return;
    this.Opacity = _windowOpacity * (1.0 - ratio);
};
```

Assignment goes after `_ghostMode.Initialize()` (line 163 in `ContentRendered`). The controller already invokes `ProximityChanged?.Invoke(ratio)` on every ratio change — Phase 68 assigns the receiver.

### Pattern 2: Gate at the Top of the Timer Tick

All timer-driven side effects are gated by a single early return:

```csharp
// Source: CONTEXT.md D-01
private void OnTimerTick(object? sender, EventArgs e)
{
    if (!IsEnabled) return;   // D-01: PROX-09 gate
    // ... existing Win32 cursor/rect logic
```

This placement means: no `GetCursorPos`, no `GetWindowRect`, no `ComputeProximityRatio`, no `ProximityChanged?.Invoke`, no `Activate()` when ghost mode is off. Single responsibility, zero leakage.

### Pattern 3: Additive Predicate for Skip Guard

`ContrastRefreshController.Initialize()` takes `Func<bool> shouldSkip`. The existing predicate is a lambda capturing `this`:

```csharp
// Existing (line 153 in MainWindow.xaml.cs)
() => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging
```

Phase 68 extends it additively — no structural change, just append the new condition:

```csharp
// Source: CONTEXT.md D-06
() => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging || _proximityRatio > 0.0
```

Because `_proximityRatio` is captured by reference via `this`, the lambda reads the live field value at every sampling tick.

### Pattern 4: Restored Handler Reset

The `Restored` event uses `+=` (it is `event Action?`). Phase 68 prepends the `_proximityRatio` reset to the existing handler body:

```csharp
// Source: CONTEXT.md D-05
_ghostMode.Restored += () =>
{
    _proximityRatio = 0.0;
    this.Opacity = _windowOpacity;
    if (!_backdropAlwaysVisible)
        BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
};
```

The existing two lines stay; `_proximityRatio = 0.0;` is prepended.

### Pattern 5: Block Deletion in Window_MouseEnter

Lines 1013–1030 in `MainWindow.xaml.cs` are the old ghost activation block. After deletion, `Window_MouseEnter` contains only the Ctrl+Alt branch (lines 995–1011):

```csharp
// Source: MainWindow.xaml.cs lines 993-1011 (after deletion)
private void Window_MouseEnter(object sender, MouseEventArgs e)
{
    if (_ghostMode.IsCtrlAltHeld() || !_ghostMode.IsEnabled)
    {
        BackdropBorder.Background = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromArgb(BackdropAlpha(), 0, 0, 0));
        if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null
            && _statsTimer.IsEnabled)
        {
            _statsTimer.Stop();
            _statsTimer.Interval = TimeSpan.FromSeconds(0.5);
            _statsTimer.Start();
        }
        _isHoverFastRefresh = true;
        return;
    }
    // <no ghost path here after Phase 68>
}
```

The method body after the `return;` at line 1010 becomes empty — no further code. This is intentional and correct.

### Anti-Patterns to Avoid

- **Overwriting `_windowOpacity`:** The fade formula `_windowOpacity * (1.0 - ratio)` must only write to `this.Opacity`. `_windowOpacity` is the user's persisted preference and must never be modified by the proximity handler. SC-4 violation risk.
- **Assigning `ProximityChanged` before `_ghostMode.Initialize()`:** The timer starts in `Initialize()`. If the handler is assigned before then, the timer might fire before `_hwnd` is set. Always assign after `Initialize()`.
- **Using WPF `DoubleAnimation` / `Storyboard`:** Explicitly out of scope per REQUIREMENTS.md. WPF animation seizes ownership of the `Window.Opacity` dependency property, breaking the direct assignment pattern and the `WS_EX_TRANSPARENT` timing managed in the controller.
- **Starting a second `DispatcherTimer` for fade:** The existing 75ms controller timer drives all opacity updates via `ProximityChanged`. A second timer introduces timing edge cases. Per REQUIREMENTS.md Out of Scope.
- **Guarding `Restored` with `_isGhostMode` check:** The controller already manages `Restored` firing semantics (only when ratio drops to 0.0 after ghost activation). The handler in MainWindow should trust this and not add defensive guards that could leave `_proximityRatio` unsynchronized.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smooth opacity interpolation | Custom easing / animation timer | Direct `this.Opacity = _windowOpacity * (1.0 - ratio)` on 75ms tick | The controller's Chebyshev distance + 75ms polling provides visually smooth gradients; custom easing adds unintuitive reversal behaviour |
| Ghost-mode enabled check in MainWindow | `if (_ghostMode.IsEnabled)` guards spread across MainWindow | `if (!IsEnabled) return;` at top of `OnTimerTick` | Single gate inside the controller means MainWindow is unaware of enabled state for fade — cleaner separation |
| Custom skip-predicate mechanism | New field/event on controller | Existing `Func<bool> shouldSkip` parameter on `_contrast.Initialize()` | Already designed for this extension pattern |

## Common Pitfalls

### Pitfall 1: ProximityChanged fires during drag — opacity flicker

**What goes wrong:** If `_isDragging` is not checked in the `ProximityChanged` handler, the cursor's natural proximity to the widget during a drag move will reduce `this.Opacity`, making the widget appear to fade while the user is dragging it.

**Why it happens:** The 75ms timer runs continuously — it does not pause for drag. The cursor stays near the widget during drag (user is holding it), so ratio stays high.

**How to avoid:** The `if (_isDragging) return;` check in the handler short-circuits before the `this.Opacity` assignment. `_proximityRatio` is still updated (the field write happens before the guard) so the contrast predicate remains accurate.

**Warning signs:** Widget becomes semi-transparent while being dragged.

### Pitfall 2: _proximityRatio left at stale value after restore

**What goes wrong:** `Restored` fires and snaps `this.Opacity = _windowOpacity`, but if `_proximityRatio` is not reset to 0.0, the contrast sampler's skip predicate `_proximityRatio > 0.0` stays true, and contrast sampling is permanently suppressed.

**Why it happens:** `Restored` fires at ratio=0.0 (cursor has fully left the zone), but the field was last written in a `ProximityChanged` invocation before the restore. Without an explicit reset in the `Restored` handler, the field is stale.

**How to avoid:** D-05 prepends `_proximityRatio = 0.0;` to the `Restored` handler body. This ensures the contrast skip predicate is cleared immediately on full restore.

**Warning signs:** Auto-contrast never updates after the first proximity fade cycle.

### Pitfall 3: IsEnabled gate placed too late in OnTimerTick

**What goes wrong:** If the `if (!IsEnabled) return;` gate is placed after `GetCursorPos`/`GetWindowRect` or after `ComputeProximityRatio`, the system still fires Win32 calls and ratio changes when ghost mode is off — PROX-09 is violated.

**Why it happens:** Developer places the guard closer to the specific behavior they want to suppress (e.g., before `ProximityChanged?.Invoke`) rather than at the top of the method.

**How to avoid:** Guard is the FIRST line of `OnTimerTick`, before any Win32 call. Nothing executes when disabled.

**Warning signs:** Cursor proximity still affects opacity when ghost mode is toggled off in the tray.

### Pitfall 4: Deleting too much or too little from Window_MouseEnter

**What goes wrong:** Lines 1013–1030 are the ghost activation block. Lines 993–1011 are the Ctrl+Alt branch that must survive. Off-by-one deletions either remove the `return;` (lines collapse incorrectly) or leave `_ghostMode.Activate()` still calling.

**Why it happens:** The block starts at line 1013 with a comment. It ends at line 1030 with `this.Opacity = 0.0;`. The Ctrl+Alt branch's `return;` is at line 1010.

**How to avoid:** Delete from line 1013 (the `// Ghost mode activation` comment) through line 1030 (`this.Opacity = 0.0;`) inclusive. Lines 993–1011 are unmodified.

**Warning signs:** `this.Opacity = 0.0` still in the file after edit; or `_ghostMode.IsEnabled` check missing from the Ctrl+Alt condition.

### Pitfall 5: WS_EX_TRANSPARENT + Opacity interaction order

**What goes wrong:** When `Activate()` applies `WS_EX_TRANSPARENT`, the old code also set `this.Opacity = 0.0` immediately in `Window_MouseEnter`. Under Phase 68, opacity reaches 0.0 via the `ProximityChanged` gradient (ratio=1.0 → `_windowOpacity * 0.0`). If there is a one-tick window where `WS_EX_TRANSPARENT` is applied but `this.Opacity` is still > 0, the widget is visually present but non-interactive.

**Why it happens:** Timer fires at ratio=1.0, calls `Activate()` (sets WS_EX_TRANSPARENT), then fires `ProximityChanged(1.0)` — which sets `this.Opacity = 0.0`. The opacity snap happens in the same tick. The old `this.Opacity = 0.0` in `Window_MouseEnter` was a synchronous guarantee; now it's deferred to the handler.

**How to avoid:** This is expected and acceptable — `ProximityChanged` is invoked in the same `OnTimerTick` call that invokes `Activate()` (ratio=1.0 both triggers `Activate()` and fires `ProximityChanged(1.0)`). The one-tick gap is 75ms max and the widget is visually nearly-transparent (ratio close to 1.0) before this point anyway. No extra guard needed.

## Code Examples

### IsEnabled gate in OnTimerTick

```csharp
// Source: CONTEXT.md D-01 / GhostModeController.cs pattern
private void OnTimerTick(object? sender, EventArgs e)
{
    if (!IsEnabled) return;   // PROX-09: gates all proximity behavior when ghost mode is off

    if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;
    // ... existing ratio computation
```

### New _proximityRatio field (MainWindow field declarations block)

```csharp
// Source: CONTEXT.md D-02 — after _isDragging field (line 53)
private double _proximityRatio = 0.0;   // current proximity ratio from GhostModeController
```

### Updated Restored handler (in ContentRendered, lines 157–162)

```csharp
// Source: CONTEXT.md D-05
_ghostMode.Restored += () =>
{
    _proximityRatio = 0.0;
    this.Opacity = _windowOpacity;
    if (!_backdropAlwaysVisible)
        BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
};
```

### ProximityChanged handler (after _ghostMode.Initialize(), line 163)

```csharp
// Source: CONTEXT.md D-04
_ghostMode.ProximityChanged = ratio =>
{
    _proximityRatio = ratio;
    if (_isDragging) return;
    this.Opacity = _windowOpacity * (1.0 - ratio);
};
```

### Updated contrast skip predicate (line 153)

```csharp
// Source: CONTEXT.md D-06
_contrast.Initialize(
    this,
    () => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging || _proximityRatio > 0.0,
    () => new RgbColor(_accentColor.R, _accentColor.G, _accentColor.B));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Window_MouseEnter` snaps `Activate()` + `this.Opacity = 0.0` immediately | Timer-driven `ProximityChanged` gradients opacity via formula | Phase 68 | Eliminates WM_MOUSELEAVE race condition; proximity zone provides gradient instead of snap |
| Contrast skip: `_ghostMode.IsActive \|\| _windowOpacity == 0.0 \|\| _isDragging` | Add `\|\| _proximityRatio > 0.0` | Phase 68 | Prevents WCAG flicker feedback during any fade state, not just full ghost |

## Open Questions

None. All decisions are locked in CONTEXT.md. Implementation is fully specified with exact line numbers and code patterns.

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/GhostModeController.cs` — read directly; confirms `ProximityChanged Action<double>?` field, `Restored event Action?`, `IsEnabled bool`, `OnTimerTick` structure, `Activate()` public visibility
- `FuzzyClock.App/MainWindow.xaml.cs` lines 1–200 + 980–1052 — read directly; confirms `_windowOpacity` at line 48, `_isDragging` at line 53, `_contrast` at line 55, contrast `Initialize()` call at lines 151–154, `Restored` handler at lines 157–162, `_ghostMode.Initialize()` at line 163, `Window_MouseEnter` ghost activation block at lines 1013–1030
- `FuzzyClock.App/ContrastRefreshController.cs` — read directly; confirms `Initialize(Window, Func<bool>, Func<RgbColor>)` signature and `_shouldSkip` field
- `.planning/phases/68-opacity-wiring/68-CONTEXT.md` — primary specification; all decisions D-01 through D-07 are locked
- `.planning/REQUIREMENTS.md` — PROX-09, PROX-10, PROX-11 requirement text
- `.planning/STATE.md` — confirms 414 tests (357 Core + 57 App), 0 failures post-Phase 67

### Secondary (MEDIUM confidence)
- `FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs` — existing test file confirms `[TestClass]` / `[TestMethod]` / `[DataRow]` pattern and `internal static` visibility for `ComputeProximityRatio`
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — existing test file confirms test structure for App.Tests project

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components read directly from source
- Architecture: HIGH — implementation patterns specified verbatim in CONTEXT.md with line numbers
- Pitfalls: HIGH — derived from direct inspection of the code under modification and Phase 67/68 transition notes in CONTEXT.md

**Research date:** 2026-03-27
**Valid until:** Phase 68 execution (internal codebase research; no external dependency drift risk)
