# Phase 67: GhostModeController Extension - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `GhostModeController` with proximity ratio computation and `ProximityChanged` event emission.

**In scope:**
- `ComputeProximityRatio(POINT cursor, RECT windowRect, int radiusPx)` — pure static method
- `ProximityChanged: Action<double>?` event — fires when ratio changes, silent when unchanged
- Timer lifecycle change: always-running from `Initialize()` instead of starting in `Activate()`
- Timer tick drives all ghost state transitions: proximity fade, ghost activation at ratio=1.0, restore on cursor retreat
- Unit tests for `ComputeProximityRatio` in `FuzzyClock.App.Tests`

**Out of scope (Phase 68):**
- `MainWindow.Opacity` wiring — Phase 68 subscribes to `ProximityChanged` and updates opacity
- Drag guard, auto-contrast skip predicate — Phase 68
- Settings window UI (fade radius slider) — Phase 69

</domain>

<decisions>
## Implementation Decisions

### Timer Lifecycle

- **D-01:** Timer starts in `Initialize()` and runs continuously until `Dispose()`. Never stops mid-session. Single always-running timer owns all ghost mode polling: proximity zone detection, fade gradient, ghost activation, and restore detection.
- **D-02:** `Activate()` retains its WS_EX_TRANSPARENT + `_isGhostMode=true` logic but is called **internally by the timer** when ratio reaches 1.0. No longer public-callable from `Window_MouseEnter` for the ghost path.
- **D-03:** `Window_MouseEnter` no longer calls `_ghostMode.Activate()` directly. Phase 68 is responsible for removing/replacing that call. Phase 67 delivers a controller that drives entry entirely via the timer.

### ProximityChanged Event

- **D-04:** `ProximityChanged: Action<double>?` fires **only when ratio changes**. Last-ratio is tracked internally. No event when cursor is stationary outside the proximity zone (ratio=0.0 steady state).
- **D-05:** Silent when ratio=0.0 and was already 0.0. Events only produced when cursor is moving relative to the widget (entering zone, traversing zone, retreating).

### WS_EX_TRANSPARENT Ownership

- **D-06:** Controller applies `WS_EX_TRANSPARENT` **internally** when ratio reaches 1.0 (via `Activate()`). WS_EX_TRANSPARENT management stays entirely inside `GhostModeController` — Phase 68 does not call `Activate()` externally.
- **D-07:** `WS_EX_TRANSPARENT` is removed **immediately** when the timer detects cursor has exited the widget rect (ratio drops below 1.0). Widget becomes interactive again as soon as cursor retreats from the widget boundary, even before opacity has fully restored.

### Ctrl+Alt Handling

- **D-08:** When `IsCtrlAltHeld()` is true, the timer forces `ProximityRatio = 0.0` regardless of actual cursor distance. If this differs from the last emitted ratio, `ProximityChanged(0.0)` fires. This allows MainWindow (Phase 68) to maintain configured opacity when Ctrl+Alt is held — consistent with PROX-05.

### Zero-Radius Backward Compat

- **D-09:** When `GhostFadeRadiusPx = 0`, `ComputeProximityRatio` returns 1.0 whenever the cursor is inside the widget rect (distance = 0). Timer detects this and calls `Activate()` immediately — functionally identical to the previous instant-snap behavior. PROX-08 satisfied without a special code path.

### Test Assembly

- **D-10:** `ComputeProximityRatio` tests live in `FuzzyClock.App.Tests` (net10.0-windows, UseWPF=true) alongside the controller. No extraction to Core needed — the method is pure but its home assembly is App.

### Claude's Discretion

- Internal data structure for tracking last-ratio (field vs local) — planner decides
- Whether `ComputeProximityRatio` is a `static` method on `GhostModeController` or a separate static helper class — planner decides, but pure static is required (PROX-13)
- Whether to rename or split `_restoreTimer` field now that it owns more than just restore detection

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — PROX-01 through PROX-05, PROX-08, PROX-13 (Phase 67 requirements)

### Roadmap
- `.planning/ROADMAP.md` §Phase 67 — success criteria SC1–SC5 are the acceptance gate

### Existing Controller
- `FuzzyClock.App/GhostModeController.cs` — current timer lifecycle, Activate(), Restored event, P/Invoke declarations (RECT, POINT structs already defined here)

### AppSettings
- `FuzzyClock.App/AppSettings.cs` — `GhostFadeRadiusPx` field (int, default 80, range 20–200px)

### MainWindow ghost wiring (context only — do not change in this phase)
- `FuzzyClock.App/MainWindow.xaml.cs` — lines ~993–1037: `Window_MouseEnter` (current `Activate()` call), `Window_MouseLeave` ghost guard, `_ghostMode.Restored` handler

### Test patterns
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — existing [TestClass]/[TestMethod]/[DataRow] pattern
- `FuzzyClock.App.Tests/SettingsServiceTests.cs` — existing Validate_ test naming pattern

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GhostModeController._restoreTimer` (DispatcherTimer, 75ms): already the polling mechanism — extend its tick handler rather than adding a new timer
- `GhostModeController.POINT` / `RECT` structs: already defined, reusable for ComputeProximityRatio parameters
- `GhostModeController.GetCursorPos` / `GetWindowRect` P/Invokes: already declared
- `GhostModeController.IsCtrlAltHeld()`: already implemented, callable from the timer tick
- `GhostModeController.Activate()`: existing WS_EX_TRANSPARENT + flag logic — call it internally at ratio=1.0 rather than rewriting

### Established Patterns
- `Action?` events (not `event EventHandler<T>`): `Restored` event uses `Action?` — `ProximityChanged` should use `Action<double>?`
- `_hwnd` cached in `Initialize()`: matches existing `ContrastRefreshController` pattern
- `_isGhostMode` bool tracks ghost state: reuse as the ratio=1.0 state flag
- Restore detection: `GetCursorPos + GetWindowRect` comparison in timer tick — proximity ratio computation extends this same check

### Integration Points
- Timer tick is the single extension point — all proximity logic goes there
- `Activate()` is called internally at ratio=1.0 (no change to its body, just its caller)
- `Restored` event continues to fire when cursor fully exits the proximity zone (ratio=0.0 after having been in ghost state) — Phase 68 subscribes to both `Restored` and `ProximityChanged`

</code_context>

<specifics>
## Specific Ideas

- `ComputeProximityRatio` signature should take plain `int` coordinates (X, Y, Left, Top, Right, Bottom) or the existing POINT/RECT structs — planner decides, but must be callable without Win32 machinery for unit tests
- The PROX-13 requirement for zero-radius behavior: `ComputeProximityRatio(anyPoint, rect, 0)` must return 1.0 when cursor is inside rect, 0.0 when outside

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 67-ghostmodecontroller-extension*
*Context gathered: 2026-03-27*
