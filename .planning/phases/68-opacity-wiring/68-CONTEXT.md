# Phase 68: MainWindow Wiring + Contrast Guard — Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `GhostModeController.ProximityChanged` into `MainWindow.this.Opacity` so the widget fades
as the cursor approaches. Add the `IsEnabled` gate inside the controller, guard the drag pause
via `_isDragging`, and update the auto-contrast skip predicate for PROX-11.

**In scope:**
- Add `if (!IsEnabled) return;` at the top of `GhostModeController.OnTimerTick` — fully gates
  all proximity behavior (no events, no Activate()) when ghost mode is off (PROX-09)
- `private double _proximityRatio = 0.0;` field in `MainWindow`; updated by `ProximityChanged`
  handler (D-02)
- `ProximityChanged` handler wires ratio → `this.Opacity` via `_windowOpacity * (1.0 - ratio)` —
  never overwrites `_windowOpacity` (SC-4)
- Drag guard: when `_isDragging` is true, `ProximityChanged` handler skips opacity update —
  widget stays at configured opacity during drag (PROX-10)
- Update `_contrast.Initialize()` skip predicate: add `|| _proximityRatio > 0.0` (PROX-11)
- Delete the ghost activation block from `Window_MouseEnter` (lines 1013–1030): synthetic
  cleanup + `_ghostMode.Activate()` + `this.Opacity = 0.0` all removed (D-03)
- `_ghostMode.Restored` handler already snaps `this.Opacity = _windowOpacity` — verify it
  also resets `_proximityRatio` to 0.0 for clean state after cursor fully exits zone

**Out of scope (Phase 69):**
- Settings slider for GhostFadeRadiusPx — Phase 69
- Live slider wiring (`_ghostMode.GhostFadeRadiusPx = value`) — Phase 69

</domain>

<decisions>
## Implementation Decisions

### IsEnabled Gate

- **D-01:** Add `if (!IsEnabled) return;` at the **top of `OnTimerTick`** in
  `GhostModeController`. When ghost mode is disabled: no proximity computation, no
  `ProximityChanged` events, no `Activate()`. PROX-09 fully satisfied inside the controller —
  MainWindow needs no awareness of the enabled state for fade behavior.
  Note: `Window_MouseEnter` already has `|| !_ghostMode.IsEnabled` in the Ctrl+Alt branch
  condition (line 995) — this covers the hover-interaction path when ghost is off. D-01
  covers the timer-driven path.

### Proximity Ratio Storage

- **D-02:** `private double _proximityRatio = 0.0;` field added to `MainWindow`. The
  `ProximityChanged` handler sets `_proximityRatio = ratio;` before applying any opacity
  change. The contrast skip predicate lambda captures `this` and reads `_proximityRatio`
  by reference at evaluation time — no new surface added to `GhostModeController`.

### ProximityChanged → Opacity Wiring

- **D-04:** `_ghostMode.ProximityChanged = ratio => { ... };` assigned after
  `_ghostMode.Initialize()`. Handler body:
  1. Set `_proximityRatio = ratio;`
  2. If `_isDragging`, return — no opacity change during drag (PROX-10)
  3. Set `this.Opacity = _windowOpacity * (1.0 - ratio)` — configured opacity scales to zero
     at ratio=1.0; `_windowOpacity` is never modified (SC-4)
- **D-05:** `_ghostMode.Restored` already snaps `this.Opacity = _windowOpacity`. Add
  `_proximityRatio = 0.0;` to the Restored handler to keep the field in sync when cursor
  fully exits the proximity zone.

### Contrast Skip Predicate

- **D-06:** Update `_contrast.Initialize()` at line 153:
  ```
  () => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging || _proximityRatio > 0.0
  ```
  This satisfies PROX-11 — sampler skips whenever cursor is in the proximity zone, not
  just when fully ghosted.

### Window_MouseEnter Cleanup

- **D-03:** Delete the entire ghost activation block from `Window_MouseEnter` (lines 1013–1030):
  - Synthetic MouseLeave cleanup (backdrop clear, timer reset, `_isHoverFastRefresh = false`)
  - `_ghostMode.Activate()`
  - `this.Opacity = 0.0`
  The synthetic cleanup was a race-condition guard for the old snap-to-ghost transition
  (WS_EX_TRANSPARENT causing immediate WM_MOUSELEAVE delivery). Timer-driven entry
  eliminates that race. The handler body becomes Ctrl+Alt branch only.

### Activate() Public Visibility

- **D-07:** `GhostModeController.Activate()` remains `public` through Phase 68 as noted in
  Phase 67 D-03. Phase 68 removes the *call site* in `Window_MouseEnter`; the method signature
  is unchanged. Phase 69 is free to demote it to `internal` or leave it public.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — PROX-09, PROX-10, PROX-11 (Phase 68 requirements)

### Roadmap
- `.planning/ROADMAP.md` §Phase 68 — success criteria SC1–SC4 are the acceptance gate

### Controller (read-only reference for Phase 68)
- `FuzzyClock.App/GhostModeController.cs` — `OnTimerTick`, `IsEnabled`, `_lastProximityRatio`,
  `ProximityChanged`, `Restored`, `IsActive`, `GhostFadeRadiusPx`

### MainWindow integration points
- `FuzzyClock.App/MainWindow.xaml.cs`:
  - Line 48: `_windowOpacity` field — NEVER overwritten by proximity handler (SC-4)
  - Line 53: `_isDragging` field — drag guard (D-04, PROX-10)
  - Line 55: `_contrast` field — skip predicate update (D-06)
  - Lines 151–154: `_contrast.Initialize()` call — add `|| _proximityRatio > 0.0`
  - Lines 157–162: `_ghostMode.Restored` handler — add `_proximityRatio = 0.0;`
  - Line 163: `_ghostMode.Initialize()` — `ProximityChanged` assignment goes after this
  - Lines 993–1031: `Window_MouseEnter` — delete lines 1013–1030 (ghost path) per D-03
  - Lines 1033–1052: `Window_MouseLeave` — no changes expected

### Test patterns
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — [TestClass]/[TestMethod]/[DataRow] pattern
- `FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs` — existing proximity tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Changes to GhostModeController (controller edit)
One targeted addition to `OnTimerTick`:
```csharp
private void OnTimerTick(object? sender, EventArgs e)
{
    if (!IsEnabled) return;   // D-01: PROX-09 gate

    if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;
    ...
```

### Changes to MainWindow (integration wiring)

**New field** (after `_isDragging`):
```csharp
private double _proximityRatio = 0.0;   // current proximity ratio from GhostModeController
```

**Updated skip predicate** (line 153):
```csharp
() => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging || _proximityRatio > 0.0
```

**Updated Restored handler** (lines 157–162, add `_proximityRatio` reset):
```csharp
_ghostMode.Restored += () =>
{
    _proximityRatio = 0.0;
    this.Opacity = _windowOpacity;
    if (!_backdropAlwaysVisible)
        BackdropBorder.Background = Brushes.Transparent;
};
```

**New ProximityChanged handler** (after `_ghostMode.Initialize()`):
```csharp
_ghostMode.ProximityChanged = ratio =>
{
    _proximityRatio = ratio;
    if (_isDragging) return;
    this.Opacity = _windowOpacity * (1.0 - ratio);
};
```

**Window_MouseEnter** — delete lines 1013–1030 (ghost activation block), Ctrl+Alt branch stays.

</code_context>

<specifics>
## Specific Ideas

- Opacity formula: `_windowOpacity * (1.0 - ratio)`. At ratio=0.0 → full configured opacity.
  At ratio=1.0 → 0.0 (fully transparent). Linear interpolation across the fade zone.
- `Restored` fires only at ratio=0.0 after ghost activation — it's the final state snap.
  `ProximityChanged` handles all intermediate opacity values during cursor retreat.
- No new DispatcherTimer — the 75ms controller timer drives everything via `ProximityChanged`.
- No new WPF animation — direct `this.Opacity` assignment each tick. Smooth appearance comes
  from the 75ms polling cadence and Chebyshev interpolation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 68-opacity-wiring*
*Context gathered: 2026-03-27*
