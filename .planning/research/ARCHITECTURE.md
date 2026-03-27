# Architecture Patterns: Proximity Fade Integration

**Domain:** Ghost mode extension — proximity-based opacity fade for v4.0
**Researched:** 2026-03-27
**Confidence:** HIGH — derived from direct source audit of production codebase (v3.9, 395 tests)

---

## Recommended Architecture

**Extend `GhostModeController`** — not a new `ProximityFadeController`, not inline in `MainWindow`.

All ghost-mode Win32 infrastructure (HWND caching, WS_EX_TRANSPARENT management, GetCursorPos/GetWindowRect polling, GetAsyncKeyState Ctrl+Alt detection) is already in `GhostModeController`. Proximity fade is a natural extension of the same polling loop: it uses the same cursor position data, the same RECT comparison, and the same cursor-exit detection. Splitting to a new class would duplicate the P/Invoke surface and the polling timer. Embedding the logic back in `MainWindow` would re-tangle what was already extracted.

The controller gets one new responsibility: on each polling tick, compute a `proximityRatio` float (0.0 when cursor is outside the fade zone, 1.0 when cursor is at or inside the widget boundary) and fire a new `ProximityChanged` event with that value. `MainWindow` applies `this.Opacity = _windowOpacity * (1.0 - proximityRatio)`.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `GhostModeController` | Win32 cursor polling, proximity ratio computation, WS_EX_TRANSPARENT management, Ctrl+Alt detection | `MainWindow` via `Restored` event + new `ProximityChanged` event |
| `MainWindow` | Sets `this.Opacity` from proximity ratio; owns `_windowOpacity` (configured) and applies fade to `this.Opacity` (transient); routes Ctrl+Alt suppression; persists `ProximityFadeRadiusPx` | `GhostModeController`, `AppSettings`, `SettingsWindow` |
| `AppSettings` | Stores `ProximityFadeRadiusPx` (int, pixels); default 0 (disables fade — snap-on-entry, existing behavior) | `SettingsService.Validate()` |
| `SettingsWindow` | Slider in Behavior tab under Ghost Mode checkbox; fires `ProximityFadeRadiusChanged` event | `MainWindow.OpenSettings()` subscription |
| `SettingsSnapshot` | Adds `ProximityFadeRadiusPx` for open-time population of SettingsWindow slider | `SettingsWindow` constructor |
| `ContrastRefreshController` | Pause predicate extended to include `_ghostMode.ProximityRatio > 0.0f` to avoid sampling during fade | `MainWindow.ContentRendered` initialization |

---

## Data Flow: Display Opacity vs Configured Opacity

This is the most critical correctness concern in the entire feature.

### Two Opacity Values — One Persisted, One Transient

```
_windowOpacity  — the user's configured opacity (e.g. 0.75)
                  Written by: SetOpacity(), ApplySettings(), ResetToDefaults(), scroll wheel
                  Persisted to: AppSettings.Opacity via SaveSettings()
                  Never written by ghost, proximity, or fade logic

this.Opacity    — the actual WPF window opacity (transient)
                  Written by: proximity tick callback, Restored handler, SetOpacity(), ApplySettings()
                  Never persisted; recomputed from _windowOpacity on every restore
```

`_windowOpacity` and `this.Opacity` are currently equal except during ghost state (where `this.Opacity == 0`). Proximity fade introduces a third state: `this.Opacity` is between `_windowOpacity` and 0 based on cursor distance.

**The rule: `_windowOpacity` is never written from any fade or ghost path. Only `this.Opacity` changes during fade transitions.**

### Lerp Formula

```
displayOpacity = lerp(_windowOpacity, 0.0, proximityRatio)
               = _windowOpacity * (1.0 - proximityRatio)
```

Where `proximityRatio` (0.0–1.0) is computed entirely inside `GhostModeController`. `MainWindow`'s `ProximityChanged` handler is:

```csharp
_ghostMode.ProximityChanged += ratio =>
{
    if (_ghostMode.IsCtrlAltHeld() || !_ghostMode.IsEnabled) return;
    this.Opacity = _windowOpacity * (1.0 - ratio);
};
```

No intermediate field is needed in `MainWindow`. The controller owns the ratio; `MainWindow` computes the transient display opacity inline on each event.

---

## GhostModeController Extension Pattern

### New surface on GhostModeController

**New property:** `public int ProximityFadeRadius { get; set; } = 0`

Set by `MainWindow` from `AppSettings.ProximityFadeRadiusPx` during `ApplySettings()` and `SetProximityFadeRadius()`. Zero means snap-on-entry (existing v3.9 behavior). This is the safe default — no behavioral change for users who have not configured a radius.

**New property:** `public float ProximityRatio { get; private set; } = 0.0f`

Holds the last emitted value. Readable by `MainWindow` for the ContrastRefreshController pause predicate (`_ghostMode.ProximityRatio > 0.0f`). Resets to `0.0f` when cursor exits the proximity zone entirely.

**New event:** `public event Action<float>? ProximityChanged`

Fired on every polling tick when `ProximityRatio > 0.0f` (or when it transitions from non-zero to zero). `MainWindow` uses this to update `this.Opacity`.

### Changes to the polling tick

The existing `_restoreTimer.Tick` handler:

```
if (!_isGhostMode) return;
if cursor outside RECT → stop timer, remove WS_EX_TRANSPARENT, fire Restored
```

Extended:

```
if (!_isGhostMode):
    if ProximityFadeRadius > 0:
        compute dist = ChebyshevDist(cursor, rect)
        compute ProximityRatio = clamp(1 - dist / ProximityFadeRadius, 0, 1)
        if ProximityRatio changed:
            fire ProximityChanged(ProximityRatio)
        if ProximityRatio == 1.0 (cursor inside widget):
            [pre-activation cleanup — see below]
            Activate()   → apply WS_EX_TRANSPARENT
            [caller sets this.Opacity = 0 via Activated event — see below]
    return   ← polling continues while cursor is in proximity zone

if (!_isGhostMode && ProximityFadeRadius == 0): return  ← existing behavior
```

### Ctrl+Alt suppression in the tick

When `IsCtrlAltHeld()` is true, the tick should emit `ProximityRatio = 0.0f` and not advance toward ghost activation. The `Window_MouseEnter` handler already routes to the normal hover path when Ctrl+Alt is held — the polling tick must not override that with a proximity fade.

```csharp
if (IsCtrlAltHeld())
{
    ProximityRatio = 0.0f;
    ProximityChanged?.Invoke(0.0f);
    return;
}
```

### Pre-activation cleanup boundary

When proximity fade drives the cursor crossing into the widget (ProximityRatio reaches 1.0), the same pre-activation cleanup that currently runs in `Window_MouseEnter` must still run:

- Clear backdrop (if not `BackdropAlwaysVisible`)
- Reset stats timer interval to configured rate
- Set `_isHoverFastRefresh = false`

These are `MainWindow` responsibilities. The cleanest approach: fire a dedicated `Activating` event (or reuse `ProximityChanged(1.0f)` with a check in `MainWindow`), and have `MainWindow` run the cleanup + then call `Activate()` and set `this.Opacity = 0`. The controller does not call `Activate()` directly from the tick — it emits the signal and MainWindow acts. This preserves the existing cleanup sequence without duplicating it in the controller.

Alternatively, for zero-radius (existing behavior), `Window_MouseEnter` continues to handle all activation as today. Proximity-mode activation can be handled entirely in the polling tick's event callback in `MainWindow`.

**Recommended:** Add an `Activating` event that fires when `ProximityRatio` first reaches 1.0. `MainWindow` subscribes to run pre-activation cleanup + `_ghostMode.Activate()` + `this.Opacity = 0`. `Window_MouseEnter` retains the zero-radius path unchanged.

### Unchanged in GhostModeController

- All P/Invoke declarations and structs
- `_hwnd`, `_restoreTimer`, `_isGhostMode`
- `IsEnabled`, `IsActive`, `Activate()`, `Dispose()` API surface
- `IsCtrlAltHeld()` implementation
- `Restored` event and its firing logic (cursor exits RECT while ghost is active)

---

## Proximity Ratio Computation

The controller has a `RECT` from `GetWindowRect` and `POINT` from `GetCursorPos`. Chebyshev distance (maximum of horizontal and vertical component distances) is recommended over Euclidean:

- Aligns with the widget's rectangular shape — gives a square proximity zone, which is intuitive for a rectangular widget
- Avoids `Math.Sqrt` on every 75ms tick
- Simpler and equally correct for this use case

```csharp
static float ComputeProximityRatio(POINT cursor, RECT rect, int radius)
{
    // Distance from cursor to nearest rect edge (0 if cursor is inside rect)
    int dx = Math.Max(0, Math.Max(rect.Left - cursor.X, cursor.X - rect.Right));
    int dy = Math.Max(0, Math.Max(rect.Top  - cursor.Y, cursor.Y - rect.Bottom));
    int dist = Math.Max(dx, dy);  // Chebyshev distance

    if (radius == 0) return dist == 0 ? 1.0f : 0.0f;  // snap-on-entry (zero radius)
    return Math.Clamp(1.0f - (float)dist / radius, 0.0f, 1.0f);
}
```

This function is a pure static — extract it from the controller so it can be unit-tested without an HWND.

Results:
- Cursor inside widget (`dist == 0`) → `1.0` → ghost activation threshold
- Cursor at exact proximity zone boundary (`dist == radius`) → `0.0` → no fade
- Cursor beyond zone (`dist > radius`) → `0.0` → no fade
- Cursor at midpoint of zone → `0.5` → `this.Opacity = _windowOpacity * 0.5`

---

## Restore Path: No Changes Required

The existing `Restored` handler in `MainWindow`:

```csharp
_ghostMode.Restored += () =>
{
    this.Opacity = _windowOpacity;
    if (!_backdropAlwaysVisible)
        BackdropBorder.Background = System.Windows.Media.Brushes.Transparent;
};
```

This already sets `this.Opacity = _windowOpacity` (configured value). When the cursor retreats from the proximity zone while not in ghost state, the controller emits decreasing `ProximityRatio` values until `0.0`, then stops emitting. `MainWindow`'s handler computes `_windowOpacity * 1.0 = _windowOpacity` — the window returns to full configured opacity naturally.

When the cursor retreats after having triggered ghost mode (cursor inside widget → ghost activated → cursor exits), the existing `Restored` event fires as before. No new restore path is needed.

When `ProximityRatio` reaches 0.0 after being non-zero, reset `this.Opacity = _windowOpacity` in the `ProximityChanged` handler for the zero-ratio case to guarantee no float rounding artifact:

```csharp
_ghostMode.ProximityChanged += ratio =>
{
    if (_ghostMode.IsCtrlAltHeld() || !_ghostMode.IsEnabled) return;
    this.Opacity = ratio == 0.0f ? _windowOpacity : _windowOpacity * (1.0 - ratio);
};
```

---

## Settings Integration

### AppSettings

Add one field with safe JSON-forward-compat default:

```csharp
public int ProximityFadeRadiusPx { get; init; } = 0;
```

Default `0` disables proximity fade (existing snap behavior). Valid range: `[0, 200]`. The value `200` matches `ContrastSamplerService.MaxSampleDim` — a reasonable upper bound for a proximity zone.

### SettingsService.Validate()

```csharp
// ProximityFadeRadiusPx guard — must be in [0, 200]
if (loaded.ProximityFadeRadiusPx < 0 || loaded.ProximityFadeRadiusPx > 200)
    loaded = loaded with { ProximityFadeRadiusPx = 0 };
```

### SettingsSnapshot

```csharp
public int ProximityFadeRadiusPx { get; init; } = 0;
```

### SettingsWindow

Add `public event Action<int>? ProximityFadeRadiusChanged` to the event surface.

Add in Behavior tab (under the Ghost Mode checkbox group, before or after it):

```
[ Fade Radius ]  [slider 0–200, step 10]  [value label: "N px"]
```

Follow the `BackdropOpacitySlider` pattern in the Appearance tab: label on the left, `Slider` + `TextBlock` on the right in a horizontal `StackPanel`. The slider is disabled when `Ghost Mode` is unchecked.

```csharp
private void ProximityFadeSlider_ValueChanged(...)
{
    if (_suppressEvents) return;
    var val = (int)ProximityFadeSlider.Value;
    ProximityFadeLabel.Text = $"{val}px";
    ProximityFadeRadiusChanged?.Invoke(val);
}
```

`PopulateControls`: `ProximityFadeSlider.Value = s.ProximityFadeRadiusPx`.

### MainWindow wiring

In `OpenSettings()`:
```csharp
_settingsWindow.ProximityFadeRadiusChanged += r => SetProximityFadeRadius(r);
```

New method:
```csharp
private void SetProximityFadeRadius(int radiusPx)
{
    _ghostMode.ProximityFadeRadius = radiusPx;
    SaveSettings();
}
```

In `ApplySettings()`:
```csharp
_ghostMode.ProximityFadeRadius = s.ProximityFadeRadiusPx;
```

In `ResetToDefaults()`:
```csharp
_ghostMode.ProximityFadeRadius = 0;
```

### ContrastRefreshController pause predicate

Current (in `ContentRendered`):
```csharp
_contrast.Initialize(
    this,
    () => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging,
    ...);
```

Extended:
```csharp
() => _ghostMode.IsActive || _ghostMode.ProximityRatio > 0.0f || _windowOpacity == 0.0 || _isDragging
```

Pausing contrast sampling during proximity fade avoids unnecessary BitBlt overhead while the window is transitioning toward invisible.

---

## Build Order

Dependencies flow: AppSettings fields → GhostModeController logic → MainWindow wiring → SettingsWindow UI.

### Phase 1: AppSettings + Validation + Tests

**What:** Add `ProximityFadeRadiusPx` to `AppSettings`. Add guard to `SettingsService.Validate()`. Add round-trip test and absent-field/invalid-value tests to `FuzzyClock.App.Tests`.

**Why first:** All subsequent phases read from this field. Zero behavioral change — default 0 is existing snap behavior.

**Files:** `AppSettings.cs`, `SettingsService.cs`, test project.

**Tests:** Extend STEST-01 round-trip to cover `ProximityFadeRadiusPx`. Add: absent-field defaults to 0; negative value clamped to 0; 201 clamped to 0 (or 200 — decide boundary in validate).

---

### Phase 2: GhostModeController Extension + Unit Tests

**What:** Add `ProximityFadeRadius`, `ProximityRatio`, `ProximityChanged`, and `Activating` events to `GhostModeController`. Extract `ComputeProximityRatio` as a pure static method. Extend the polling tick. Add Ctrl+Alt suppression in tick.

**Why second:** The controller compiles and its pure logic tests in isolation. No UI changes yet. Zero regression risk to existing ghost behavior (zero-radius path unchanged).

**Files:** `GhostModeController.cs`, test project.

**Tests:** Unit tests for `ComputeProximityRatio(cursor, rect, radius)` covering: cursor inside RECT; cursor at zone boundary; cursor beyond zone; zero radius; Chebyshev corner vs cardinal edge cases.

---

### Phase 3: MainWindow Wiring

**What:** Subscribe to `_ghostMode.ProximityChanged` and `_ghostMode.Activating` in `ContentRendered`. Set `this.Opacity` from the ratio. Update ContrastRefreshController pause predicate. Add `SetProximityFadeRadius()`. Update `ApplySettings()` and `ResetToDefaults()`.

**Why third:** Requires Phase 2 (controller events) and Phase 1 (settings field).

**Files:** `MainWindow.xaml.cs`.

**Critical invariant:** `_windowOpacity` must never be written from any proximity callback. Verify by auditing `SaveSettings()` — it reads `_windowOpacity`, not `this.Opacity`. The `_settings with { Opacity = _windowOpacity }` expression in `SaveSettings()` is the proof point.

---

### Phase 4: SettingsWindow + SettingsSnapshot UI

**What:** Add `ProximityFadeRadiusPx` to `SettingsSnapshot`. Add `ProximityFadeRadiusChanged` event to `SettingsWindow`. Add slider in Behavior tab. Wire in `OpenSettings()`. Update `PopulateControls`.

**Why fourth:** Requires Phase 3 (MainWindow `SetProximityFadeRadius` method exists before wiring it).

**Files:** `SettingsSnapshot.cs`, `SettingsWindow.xaml`, `SettingsWindow.xaml.cs`, `MainWindow.xaml.cs` (OpenSettings only).

**XAML constraint:** The Behavior tab must accommodate the new slider row. Measure current tab height before adding. If constrained, the slider can be placed inline with the Ghost Mode label row.

---

### Phase 5: Tests + Audit

**What:** Full test run (395 tests + new ones). Manual verification: snap behavior at radius=0; fade behavior at radius=80; Ctrl+Alt suppression; opacity restore on cursor retreat; settings round-trip on restart; ResetToDefaults zeroes the radius.

**Files:** Test project only.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Writing `_windowOpacity` from Proximity Tick

**What goes wrong:** Any code path that does `_windowOpacity = this.Opacity` after a fade tick, or reads `this.Opacity` to compute the next fade step.

**Why it happens:** `this.Opacity` is now set to a transient fade value. A careless assignment back to `_windowOpacity` would corrupt the user's configured opacity — the next restore would restore to a partially-faded value.

**Consequences:** User sees configured opacity slider "stuck" at a lower value after ghost interaction. Scroll wheel opacity would compute from wrong base. Settings JSON would save corrupted opacity.

**Prevention:** `_windowOpacity` is only written by `SetOpacity()`, `ApplySettings()`, `ResetToDefaults()`, and the scroll wheel handler. None of these are in the proximity callback path. The `SaveSettings()` method reads `_windowOpacity`, never `this.Opacity`.

---

### Anti-Pattern 2: Separate DispatcherTimer for Proximity

**What goes wrong:** Adding a second `DispatcherTimer` (at 75ms or any interval) in MainWindow or in a new `ProximityFadeController` class.

**Why it happens:** Temptation to separate the proximity concern from ghost mode restore detection.

**Consequences:** Two timers polling `GetCursorPos` + `GetWindowRect` simultaneously. Race between them for determining what state the widget is in. Double the Win32 P/Invoke overhead. Two code paths that must stay in sync.

**Prevention:** Extend the existing `_restoreTimer` tick in `GhostModeController`. Proximity polling and ghost restore detection are the same operation (read cursor, read RECT, determine state). One tick, one code path.

---

### Anti-Pattern 3: Calling `Activate()` Directly From the Proximity Tick

**What goes wrong:** When `ProximityRatio` reaches 1.0 in the tick, calling `_ghostMode.Activate()` directly inside the controller.

**Why it happens:** The natural "cursor is inside widget, activate ghost" logic.

**Consequences:** `Activate()` applies `WS_EX_TRANSPARENT`, which triggers a synthetic `WM_MOUSELEAVE`. The `Window_MouseEnter` cleanup (backdrop clear, stats timer reset, `_isHoverFastRefresh = false`) does not run. Backdrop and timer state are corrupted after the ghost activates.

**Prevention:** Fire an `Activating` event from the controller tick when ratio reaches 1.0. `MainWindow`'s handler runs the pre-activation cleanup sequence and then calls `_ghostMode.Activate()` explicitly, exactly as the existing `Window_MouseEnter` ghost path does today.

---

### Anti-Pattern 4: Duplicating ProximityRatio State in MainWindow

**What goes wrong:** Adding a `_proximityRatio` field to `MainWindow` that mirrors the controller's internal state.

**Why it happens:** Feeling that MainWindow needs to know "is fade active" for guard conditions.

**Consequences:** Two sources of truth. If the controller's ratio and MainWindow's copy drift (e.g., an event is missed, or they are reset at different times), the ContrastRefreshController pause predicate may be wrong, or `_windowOpacity` restoration may fire at the wrong time.

**Prevention:** Use `_ghostMode.ProximityRatio` (the read-only property on the controller) wherever MainWindow needs to check if a fade is in progress. No copy in MainWindow.

---

### Anti-Pattern 5: Euclidean Distance for Proximity Zone

**What goes wrong:** Using `Math.Sqrt(dx*dx + dy*dy)` as the distance metric.

**Why it happens:** Euclidean distance is mathematically "correct" for a circle.

**Consequences:** The proximity zone becomes circular, which is inconsistent with the widget's rectangular shape. The user can stand precisely at a corner and be in the zone at a different distance than standing at an edge — counterintuitive. Also adds a `Math.Sqrt` call on every 75ms tick.

**Prevention:** Use Chebyshev distance: `Math.Max(dx, dy)`. This gives a square zone, aligned with the widget rectangle, with no float-point computation beyond addition and comparison.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| AppSettings default | `ProximityFadeRadiusPx = 0` must be the JSON-absent default, not any non-zero value | Use `init` property with `= 0`; verify with absent-field test |
| Validate() guard | Upper bound choice (200px) must be documented; if user manually edits to 201 it should clamp, not throw | Clamp to `[0, 200]` in Validate(); same pattern as existing guards |
| Tick Ctrl+Alt path | Ctrl+Alt check in tick must fire `ProximityChanged(0.0f)` so MainWindow restores opacity | Do not just `return` silently — emit zero explicitly so MainWindow snaps back |
| Opacity restore at ratio 0.0 | Float arithmetic `_windowOpacity * 1.0` should equal `_windowOpacity` but floating-point may differ by epsilon | Use `ratio == 0.0f ? _windowOpacity : ...` explicit branch |
| SettingsWindow Behavior tab height | The new slider row adds ~40px; verify tab still scrolls or fits in 480x600 window | Measure tab content height before adding; collapse to a single row if tight |
| SaveSettings() opacity field | `SaveSettings()` uses `_settings with { Opacity = _windowOpacity }` — must stay reading `_windowOpacity`, not `this.Opacity` | Add a code comment at the save site making this invariant explicit |

---

## Sources

All findings are HIGH confidence — derived from direct source audit of the production codebase. No external documentation was consulted.

| File audited | Key findings |
|-------------|-------------|
| `FuzzyClock.App/GhostModeController.cs` | Full class: P/Invokes, `_restoreTimer` (75ms), `Activate()`, `Restored` event, `IsCtrlAltHeld()`, `IsActive`, `IsEnabled` |
| `FuzzyClock.App/MainWindow.xaml.cs` | `_windowOpacity` vs `this.Opacity` separation; `Window_MouseEnter` ghost path; `Restored` handler; ContrastRefreshController pause predicate; `_ghostMode.IsEnabled` and `IsCtrlAltHeld()` checks |
| `FuzzyClock.App/AppSettings.cs` | All existing fields; `ProximityFadeRadiusPx` absent — new field needed |
| `FuzzyClock.App/SettingsSnapshot.cs` | All existing fields; `ProximityFadeRadiusPx` absent — new field needed |
| `FuzzyClock.App/SettingsWindow.xaml.cs` | Event declaration pattern; `_suppressEvents` guard; `PopulateControls`; `BackdropOpacitySlider` pattern as UI reference |
| `FuzzyClock.App/SettingsService.cs` | `Validate()` guard patterns (range clamp, string whitelist); `SaveSettings()` reads `_windowOpacity` field |
| `FuzzyClock.App/ContrastSamplerService.cs` | `MaxSampleDim = 200` — used as upper bound rationale for `ProximityFadeRadiusPx` |
| `.planning/PROJECT.md` | Validated decisions: WS_EX_TRANSPARENT synthetic MOUSELEAVE, Win32 polling rationale, VK_LMENU vs VK_MENU, pre-ghost cleanup order, opacity-as-display vs _windowOpacity-as-config |

---

*Architecture research for: FuzzyClock v4.0 — Proximity Ghost Mode*
*Researched: 2026-03-27*
