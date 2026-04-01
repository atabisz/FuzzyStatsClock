# Phase 67: GhostModeController Extension - Research

**Researched:** 2026-03-27
**Domain:** C# WPF — Win32 P/Invoke, DispatcherTimer polling, proximity geometry, pure static computation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Timer starts in `Initialize()` and runs continuously until `Dispose()`. Never stops mid-session. Single always-running timer owns all ghost mode polling: proximity zone detection, fade gradient, ghost activation, and restore detection.
- **D-02:** `Activate()` retains its WS_EX_TRANSPARENT + `_isGhostMode=true` logic but is called **internally by the timer** when ratio reaches 1.0. No longer public-callable from `Window_MouseEnter` for the ghost path.
- **D-03:** `Window_MouseEnter` no longer calls `_ghostMode.Activate()` directly. Phase 68 is responsible for removing/replacing that call. Phase 67 delivers a controller that drives entry entirely via the timer.
- **D-04:** `ProximityChanged: Action<double>?` fires **only when ratio changes**. Last-ratio is tracked internally. No event when cursor is stationary outside the proximity zone (ratio=0.0 steady state).
- **D-05:** Silent when ratio=0.0 and was already 0.0. Events only produced when cursor is moving relative to the widget.
- **D-06:** Controller applies `WS_EX_TRANSPARENT` **internally** when ratio reaches 1.0 (via `Activate()`). WS_EX_TRANSPARENT management stays entirely inside `GhostModeController`.
- **D-07:** `WS_EX_TRANSPARENT` is removed **immediately** when the timer detects cursor has exited the widget rect (ratio drops below 1.0). Widget becomes interactive again as soon as cursor retreats from the widget boundary.
- **D-08:** When `IsCtrlAltHeld()` is true, the timer forces `ProximityRatio = 0.0` regardless of actual cursor distance. If this differs from the last emitted ratio, `ProximityChanged(0.0)` fires.
- **D-09:** When `GhostFadeRadiusPx = 0`, `ComputeProximityRatio` returns 1.0 whenever the cursor is inside the widget rect. Timer detects this and calls `Activate()` immediately — functionally identical to previous instant-snap behavior.
- **D-10:** `ComputeProximityRatio` tests live in `FuzzyClock.App.Tests` (net10.0-windows, UseWPF=true). No extraction to Core needed.

### Claude's Discretion

- Internal data structure for tracking last-ratio (field vs local) — planner decides
- Whether `ComputeProximityRatio` is a `static` method on `GhostModeController` or a separate static helper class — planner decides, but pure static is required (PROX-13)
- Whether to rename or split `_restoreTimer` field now that it owns more than just restore detection

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROX-01 | When Ghost Mode is enabled and cursor enters proximity zone, widget opacity begins decreasing toward 0 | Timer tick computes ratio each poll; ProximityChanged event carries ratio to MainWindow (Phase 68 wires opacity) |
| PROX-02 | Opacity decreases linearly: `display_opacity = configured_opacity × (distance / radius)` — no snap | ComputeProximityRatio returns linear 0.0–1.0 based on normalized distance; formula in Code Examples |
| PROX-03 | WS_EX_TRANSPARENT applied only when Opacity reaches exactly 0 (ratio=1.0) | Activate() called internally only at ratio=1.0; never during gradient |
| PROX-04 | Symmetric restore: cursor retreats → ProximityChanged fires with decreasing ratios | Timer runs continuously; detects retreat and emits decreasing values; WS_EX_TRANSPARENT removed at first sub-1.0 reading (D-07) |
| PROX-05 | Ctrl+Alt suppresses proximity fade — widget stays at configured opacity | D-08: IsCtrlAltHeld() forces ratio=0.0 in timer tick |
| PROX-08 | Zero-radius slider min = instant-snap backward compat | D-09: ComputeProximityRatio returns 1.0 when inside rect with radius=0 |
| PROX-13 | ComputeProximityRatio is pure static; unit tests for outside/boundary/inside/zero-radius cases | Method has no side effects, no Win32 calls; accepts plain int coordinates; testable without HWND |
</phase_requirements>

---

## Summary

Phase 67 extends `GhostModeController` with two focused additions: a pure static geometry method (`ComputeProximityRatio`) and a lifecycle promotion of the restore timer from on-demand to always-running. The timer tick becomes the single owner of all ghost state transitions — proximity detection, gradient traversal, ghost activation at ratio=1.0, and restore on retreat.

The geometry is straightforward: compute the Chebyshev distance from the cursor to the nearest widget edge (treating the widget rect as an axis-aligned bounding box), normalize against the configured radius, and clamp to [0.0, 1.0]. A ratio of 0.0 means cursor is outside the proximity zone; 1.0 means cursor is on or inside the widget boundary. The formula is `ratio = clamp(1.0 - distance/radius, 0.0, 1.0)`. Edge case: when `radius = 0`, return 1.0 iff cursor is inside rect (distance = 0), else 0.0.

All existing P/Invoke declarations, `POINT`/`RECT` structs, `GetCursorPos`/`GetWindowRect`, and `IsCtrlAltHeld()` are reusable without modification. The primary structural change is removing the `if (!_isGhostMode) return;` early-exit from the timer tick so it runs the proximity computation at all times.

**Primary recommendation:** Keep `ComputeProximityRatio` as an `internal static` method on `GhostModeController` itself — avoids a separate class for a single geometric primitive, aligns with the existing pattern of the controller owning all ghost geometry, and makes it directly testable via `GhostModeController.ComputeProximityRatio(...)`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| System.Windows.Threading.DispatcherTimer | .NET 10 built-in | 75ms polling timer already in use | Existing pattern; WPF UI thread affinity required for Opacity changes |
| System.Runtime.InteropServices | .NET 10 built-in | P/Invoke for GetCursorPos/GetWindowRect | Already declared in controller |
| MSTest 4.0.1 | Project standard | Unit tests for ComputeProximityRatio | Matches existing App.Tests project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| net10.0-windows + UseWPF=true | Project TFM | Required for FuzzyClock.App.Tests | Any test that imports FuzzyClock.App types |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Always-running timer | Start/stop timer around proximity events | Start/stop adds state complexity and risks missed ticks during transition; always-running is simpler given 75ms is negligible CPU cost |
| Chebyshev distance | Euclidean distance | Euclidean produces circular proximity zone; Chebyshev aligns with the rectangular widget boundary and is simpler to compute |

**Installation:** No new packages required. All dependencies are already present.

---

## Architecture Patterns

### Recommended Structure: Timer Tick Expansion

The existing timer tick has this shape:
```csharp
_restoreTimer.Tick += (_, _) =>
{
    if (!_isGhostMode) return;          // <-- REMOVE this guard (Phase 67)
    if (!GetCursorPos(...) || !GetWindowRect(...)) return;
    // ... cursor-exit check ...
};
```

Phase 67 removes the `if (!_isGhostMode) return` guard and replaces the body with proximity-aware logic that runs every tick regardless of ghost state.

### Pattern 1: ComputeProximityRatio — Pure Static Method

**What:** Static method that maps (cursor position, window rect, radius) to a [0.0, 1.0] ratio with no side effects.
**When to use:** Called from the timer tick on every poll cycle. Also directly invoked by unit tests.

```csharp
// Pure static — no P/Invoke, no Win32 structs, no side effects
// Parameters use plain ints so tests need no Win32 machinery
internal static double ComputeProximityRatio(
    int cursorX, int cursorY,
    int rectLeft, int rectTop, int rectRight, int rectBottom,
    int radiusPx)
{
    // Step 1: Is cursor already inside the widget rect?
    bool insideRect = cursorX >= rectLeft && cursorX <= rectRight
                   && cursorY >= rectTop  && cursorY <= rectBottom;
    if (insideRect) return 1.0;

    // Step 2: Zero-radius backward compat (PROX-08/D-09)
    if (radiusPx == 0) return 0.0;

    // Step 3: Chebyshev distance from cursor to nearest rect edge
    int dx = Math.Max(rectLeft - cursorX, Math.Max(0, cursorX - rectRight));
    int dy = Math.Max(rectTop  - cursorY, Math.Max(0, cursorY - rectBottom));
    int distance = Math.Max(dx, dy);  // Chebyshev — matches rectangular proximity zone

    // Step 4: Normalize and clamp
    double ratio = 1.0 - (double)distance / radiusPx;
    return Math.Clamp(ratio, 0.0, 1.0);
}
```

Note on the distance formula: `dx` is the horizontal overshoot past the rect edge (0 if within x bounds), `dy` is the vertical overshoot. The Chebyshev distance `max(dx, dy)` produces a square proximity halo around the rectangular widget, which aligns naturally with the widget's own shape. An alternative is `Math.Sqrt(dx*dx + dy*dy)` for Euclidean (circular halo) — either is valid, but Chebyshev is the simpler choice that avoids floating-point sqrt on every tick.

### Pattern 2: Always-Running Timer with Last-Ratio Tracking

**What:** Timer starts in `Initialize()` and never stops. Internal `_lastProximityRatio` field suppresses redundant `ProximityChanged` events.
**When to use:** Required by D-01. Eliminates `_restoreTimer.Start()` from `Activate()` and `_restoreTimer.Stop()` from the restore path.

```csharp
private double _lastProximityRatio = 0.0;
public Action<double>? ProximityChanged;

// In Initialize():
_restoreTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(75) };
_restoreTimer.Tick += OnTimerTick;
_restoreTimer.Start();   // always-running from here

// Timer tick (replaces existing tick body):
private void OnTimerTick(object? sender, EventArgs e)
{
    if (!GetCursorPos(out var cursor) || !GetWindowRect(_hwnd, out var rect)) return;

    double ratio;
    if (IsCtrlAltHeld())
    {
        ratio = 0.0;  // D-08: suppress proximity fade when Ctrl+Alt held
    }
    else
    {
        ratio = ComputeProximityRatio(
            cursor.X, cursor.Y,
            rect.Left, rect.Top, rect.Right, rect.Bottom,
            _ghostFadeRadiusPx);
    }

    // Emit ProximityChanged only when ratio actually changed (D-04/D-05)
    if (ratio != _lastProximityRatio)
    {
        _lastProximityRatio = ratio;
        ProximityChanged?.Invoke(ratio);
    }

    // Ghost activation at ratio=1.0 (D-06)
    if (ratio >= 1.0 && !_isGhostMode)
    {
        Activate();
    }

    // Restore: WS_EX_TRANSPARENT removed immediately when ratio drops below 1.0 (D-07)
    if (ratio < 1.0 && _isGhostMode)
    {
        _isGhostMode = false;
        int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
        SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
        SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

        // Fire Restored only when cursor fully exits proximity zone (ratio=0.0)
        // after having been in ghost state — Phase 68 uses this for full opacity restore
        if (ratio == 0.0)
            Restored?.Invoke();
    }
}
```

### Pattern 3: Activate() — Retained, Caller Changed

**What:** `Activate()` body is unchanged. Its only modification is removing `_restoreTimer.Start()` (timer is already running).
**When to use:** Called internally by the timer at ratio=1.0, not from `Window_MouseEnter`.

```csharp
// Modified Activate() — remove _restoreTimer.Start(), body otherwise unchanged
public void Activate()
{
    // _restoreTimer.Start() removed — timer is always running (D-01)
    _isGhostMode = true;
    int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
    SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
    SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
}
```

### Pattern 4: Restored Event — Conditional on Full Exit

**What:** `Restored` fires only when cursor fully exits the proximity zone (ratio=0.0) after ghost activation, not on every sub-1.0 tick during retreat. This matches Phase 68's need to restore configured opacity only after full exit.

See the timer tick pattern above — `Restored?.Invoke()` fires only when `ratio == 0.0` AND `_isGhostMode` was true.

### Pattern 5: _ghostFadeRadiusPx Field

**What:** Controller needs to know the current radius to pass to `ComputeProximityRatio`. The value originates in `AppSettings.GhostFadeRadiusPx` and must be injectable/updatable.

```csharp
// Field on controller
private int _ghostFadeRadiusPx;

// Initialize signature extended OR separate setter:
public void Initialize(IntPtr hwnd, int ghostFadeRadiusPx = 80) { ... }

// Or a settable property for live updates (Phase 69 will need this):
public int GhostFadeRadiusPx
{
    get => _ghostFadeRadiusPx;
    set => _ghostFadeRadiusPx = value;
}
```

The planner must decide how the current `GhostFadeRadiusPx` value reaches the controller. Options:
1. Pass to `Initialize()` — works for Phase 67, but Phase 69 needs live updates
2. Expose as a settable property — cleaner for Phase 69 wiring
Either approach satisfies Phase 67's requirements. Recommendation: add as a settable property for forward compatibility.

### Anti-Patterns to Avoid

- **Stopping the timer in the restore path:** The timer must never stop mid-session (D-01). Remove all `_restoreTimer.Stop()` calls.
- **Calling Activate() from Window_MouseEnter (ghost path):** Phase 67 delivers the timer-driven path. MainWindow still has the old `_ghostMode.Activate()` call in `Window_MouseEnter` — this is NOT removed in Phase 67 (D-03 says Phase 68 handles that). The controller must not break if Activate() is called externally during the transition period, but the new timer path is the canonical owner.
- **Emitting ProximityChanged every tick:** Compare `ratio != _lastProximityRatio` before invoking (D-04/D-05). Prevents event storms when cursor is stationary outside the zone.
- **Using floating-point equality `ratio == 1.0` for Activate guard:** Since `ComputeProximityRatio` returns exactly 1.0 for inside-rect, this is safe. Document the assumption in a comment.
- **Firing Restored during every sub-1.0 tick:** Restored should fire only once when cursor exits the zone after ghost activation. The `_isGhostMode` guard in the restore block ensures this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Proximity geometry | Custom spatial indexing | Plain int arithmetic on RECT bounds | Widget is a single AABB; no spatial structure needed |
| Rate-limiting ProximityChanged | Separate throttle timer | `_lastProximityRatio` field comparison | Simple field comparison eliminates redundant events without a second timer |
| Mouse tracking under WS_EX_TRANSPARENT | WPF Mouse APIs | GetCursorPos + GetWindowRect (existing) | WPF mouse input is suspended when WS_EX_TRANSPARENT is active; Win32 polling is the only reliable approach |
| Key state detection | Keyboard.IsKeyDown | GetAsyncKeyState (existing) | Overlay window has no keyboard focus; WPF keyboard APIs return stale state |

**Key insight:** All the hard Win32 problems (click-through, cursor polling under transparency, key state) are already solved in the existing controller. Phase 67 is geometry + event emission on top of the working polling foundation.

---

## Common Pitfalls

### Pitfall 1: Stopping the Timer on Restore
**What goes wrong:** The existing restore path calls `_restoreTimer.Stop()`. If this is not removed, the always-running contract (D-01) is broken — timer stops after first ghost cycle and proximity detection halts.
**Why it happens:** Natural carry-over from the original on-demand start/stop lifecycle.
**How to avoid:** Remove `_restoreTimer.Stop()` from the restore path. Remove `_restoreTimer.Start()` from `Activate()`.
**Warning signs:** ProximityChanged fires during first approach but not on subsequent approaches in the same session.

### Pitfall 2: ProximityChanged Firing Every Tick at 0.0
**What goes wrong:** Cursor is stationary far from the widget. Timer fires every 75ms. Without last-ratio tracking, `ProximityChanged(0.0)` fires 800 times per minute when nothing is happening.
**Why it happens:** Missing the `ratio != _lastProximityRatio` guard (D-04/D-05).
**How to avoid:** Initialize `_lastProximityRatio = 0.0` and only invoke `ProximityChanged` when the value differs.
**Warning signs:** Phase 68 opacity callbacks firing continuously when cursor is idle.

### Pitfall 3: Restored Fires on Every Sub-1.0 Tick During Retreat
**What goes wrong:** As cursor retreats, each tick with ratio < 1.0 fires `Restored`. MainWindow snaps opacity to configured value on first tick, then opacity briefly resets before the gradient completes.
**Why it happens:** Restore path fires `Restored?.Invoke()` without checking `_isGhostMode`.
**How to avoid:** Guard `Restored?.Invoke()` behind `_isGhostMode` check (only fires when transitioning out of ghost state) and only when `ratio == 0.0` (full exit).
**Warning signs:** Visible opacity snap during cursor retreat rather than smooth gradient.

### Pitfall 4: ComputeProximityRatio Test Dependency on Win32
**What goes wrong:** If `ComputeProximityRatio` takes `POINT`/`RECT` struct parameters (the private Win32 structs), test code cannot construct them without the P/Invoke infrastructure or `[DllImport]`.
**Why it happens:** Using the controller's private `POINT`/`RECT` structs in the public method signature.
**How to avoid:** Use plain `int` parameters (cursorX, cursorY, rectLeft, rectTop, rectRight, rectBottom, radiusPx). The timer tick extracts these from the Win32 structs before calling the method. Tests construct ints directly.
**Warning signs:** Test compilation errors referencing inaccessible types.

### Pitfall 5: GhostFadeRadiusPx Not Wired to Controller
**What goes wrong:** `_ghostFadeRadiusPx` field defaults to 0 (C# int default) if not explicitly initialized, causing instant-snap behavior regardless of settings.
**Why it happens:** Forgetting to pass `AppSettings.GhostFadeRadiusPx` to the controller at startup.
**How to avoid:** Either pass to `Initialize()` or set the property immediately after calling `Initialize()` in `ContentRendered`.
**Warning signs:** All proximity fade tests pass but live widget always snaps to ghost (zero-radius path active).

---

## Code Examples

### ComputeProximityRatio — Boundary Test Cases

```csharp
// Verified formula behavior (no external library required):
// Widget at (100, 100) to (200, 200), radius = 50px

// Cursor at (50, 150) — 50px to the LEFT of left edge
// dx = 100 - 50 = 50, dy = 0 (within y range)
// Chebyshev distance = max(50, 0) = 50
// ratio = 1.0 - 50/50 = 0.0  (exactly at boundary)

// Cursor at (75, 150) — 25px from left edge
// distance = 25, ratio = 1.0 - 25/50 = 0.5

// Cursor at (150, 150) — inside rect
// insideRect = true → returns 1.0

// Cursor at (40, 150) — 60px from left edge, outside radius
// distance = 60, ratio = 1.0 - 60/50 = -0.2 → clamped to 0.0

// Zero-radius: cursor at (150, 150) inside rect, radius=0 → returns 1.0
// Zero-radius: cursor at (50, 50) outside rect, radius=0 → returns 0.0
```

### MSTest Pattern for Pure Static Method (from existing App.Tests)

```csharp
// Source: FuzzyClock.App.Tests/LcdTimeFormatHelperTests.cs — established DataRow pattern
[TestClass]
public class GhostModeControllerProximityTests
{
    // Widget rect: Left=100, Top=100, Right=200, Bottom=200 for all tests below

    [TestMethod]
    [DataRow(50,  150, 50, 0.0)]   // 50px left of left edge, radius=50 → ratio=0.0 (boundary)
    [DataRow(75,  150, 50, 0.5)]   // 25px from edge, radius=50 → ratio=0.5
    [DataRow(40,  150, 50, 0.0)]   // 60px from edge (outside zone) → clamped 0.0
    [DataRow(150, 150, 50, 1.0)]   // inside rect → 1.0
    public void ComputeProximityRatio_VariousPositions(int cursorX, int cursorY, int radius, double expected)
    {
        double result = GhostModeController.ComputeProximityRatio(
            cursorX, cursorY, 100, 100, 200, 200, radius);
        Assert.AreEqual(expected, result, 0.0001);
    }

    [TestMethod]
    public void ComputeProximityRatio_ZeroRadius_InsideRect_Returns1()
    {
        double result = GhostModeController.ComputeProximityRatio(150, 150, 100, 100, 200, 200, 0);
        Assert.AreEqual(1.0, result, 0.0001);
    }

    [TestMethod]
    public void ComputeProximityRatio_ZeroRadius_OutsideRect_Returns0()
    {
        double result = GhostModeController.ComputeProximityRatio(50, 50, 100, 100, 200, 200, 0);
        Assert.AreEqual(0.0, result, 0.0001);
    }
}
```

### ProximityChanged Event Declaration (from CONTEXT.md code_context)

```csharp
// Pattern: Action<double>? — matches existing Restored: Action? convention in the controller
public Action<double>? ProximityChanged;
```

### Dispose — No Timer Stop Needed

```csharp
// Updated Dispose: timer stops only at explicit disposal (end of session)
public void Dispose() => _restoreTimer?.Stop();
// No change needed — this was already correct. Only the mid-session Stop() calls are removed.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Timer starts in Activate(), stops on restore | Timer starts in Initialize(), runs until Dispose() | Phase 67 | Proximity detection works without first entering the widget rect |
| Restore detected only inside widget rect | Restore detected by ratio returning to 0.0 anywhere in proximity zone | Phase 67 | Symmetric fade-in on retreat |
| Ghost activation from Window_MouseEnter | Ghost activation from timer tick at ratio=1.0 | Phase 67 | Controller fully owns WS_EX_TRANSPARENT lifecycle |

---

## Open Questions

1. **Restored event semantics during partial retreat**
   - What we know: Restored currently fires when cursor exits the widget rect. With proximity zone, cursor can be in the zone (ratio > 0) but not in ghost state (ratio < 1.0).
   - What's unclear: Should Restored fire when cursor exits the widget rect (ratio drops below 1.0) or when it fully exits the proximity zone (ratio = 0.0)?
   - Recommendation: Fire Restored when cursor exits the proximity zone (ratio = 0.0) after ghost activation. This gives Phase 68 a clean "fully restored" signal. The opacity wiring in Phase 68 uses ProximityChanged(0.0) for the gradient and Restored for the final snap to configured opacity. Document this contract clearly in the timer tick comment.

2. **Corner cursor behavior (diagonal approach)**
   - What we know: Chebyshev distance handles corners correctly — `max(dx, dy)` where both dx and dy are nonzero gives the L-infinity distance to the nearest corner.
   - What's unclear: Whether users expect a square halo or a circular halo around the widget.
   - Recommendation: Chebyshev (square halo) is the correct choice — it matches the widget's rectangular boundary and is simpler. Document the choice in a code comment.

3. **_lastProximityRatio initialization**
   - What we know: Must be initialized to 0.0 (not -1.0) so the first tick at 0.0 does NOT fire ProximityChanged needlessly.
   - What's unclear: Whether first-tick at > 0.0 (cursor starts inside proximity zone before timer starts) should fire.
   - Recommendation: Initialize to 0.0. First tick at any nonzero ratio will emit ProximityChanged. This is correct behavior — Phase 68 needs to know about it.

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection: `FuzzyClock.App/GhostModeController.cs` — full current implementation, all P/Invoke declarations, timer lifecycle, struct definitions
- Direct source code inspection: `FuzzyClock.App/AppSettings.cs` — `GhostFadeRadiusPx` field confirmed at line 49 with default 80
- Direct source code inspection: `FuzzyClock.App/MainWindow.xaml.cs` lines 157–163, 993–1031 — ghost mode wiring, Activate() call site
- Direct source code inspection: `FuzzyClock.App.Tests/AppSettingsTests.cs`, `SettingsServiceTests.cs`, `LcdTimeFormatHelperTests.cs` — test patterns
- `.planning/phases/67-ghostmodecontroller-extension/67-CONTEXT.md` — all implementation decisions D-01 through D-10

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — PROX-01 through PROX-13 requirement definitions
- `.planning/ROADMAP.md` — Phase 67 success criteria SC1–SC5

### Tertiary (LOW confidence)
- None — all findings verified against source code.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project dependencies confirmed in source
- Architecture patterns: HIGH — patterns derived directly from existing controller source and CONTEXT.md decisions
- Pitfalls: HIGH — all pitfalls derived from close reading of existing code and locked decisions
- ComputeProximityRatio formula: HIGH — pure integer arithmetic, verified against boundary test cases manually

**Research date:** 2026-03-27
**Valid until:** Stable — this is internal project code with no external dependencies introduced
