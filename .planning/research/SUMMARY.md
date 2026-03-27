# Project Research Summary

**Project:** FuzzyStatsClock v4.0 — Proximity Ghost Mode
**Domain:** WPF transparent desktop overlay — proximity-based opacity fade extending existing ghost mode
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

v4.0 Proximity Ghost Mode is an in-place extension of the existing `GhostModeController` — not a new component, not a new timer, not a new framework. All infrastructure needed (Win32 P/Invokes, 75ms `DispatcherTimer`, `WS_EX_TRANSPARENT` management, Ctrl+Alt detection) already exists and is validated in production. The implementation adds one property (`ProximityFadeRadius`), one read-only float (`ProximityRatio`), and two events (`ProximityChanged`, `Activating`) to the existing controller, plus a pure-static `ComputeProximityRatio` function for unit testability. `MainWindow` applies the ratio to `this.Opacity` via a simple lerp on each `ProximityChanged` callback. The Settings UI adds a single Slider to the existing Behavior tab. No new NuGet packages, no new timers, no new Win32 P/Invoke declarations are required.

The recommended approach is a position-driven, linearly-interpolated opacity fade computed via Chebyshev distance (rectangular proximity zone matching the widget's rectangular shape, no `sqrt` cost), assigned directly to `this.Opacity` on every 75ms tick. WPF animation APIs (`Storyboard`, `DoubleAnimation`) must not be used — they cannot reliably synchronize `WS_EX_TRANSPARENT` at exactly `Opacity == 0`, they seize ownership of the opacity dependency property away from `_windowOpacity`, and they cannot reverse mid-animation when the cursor retreats. The existing two-variable discipline (`_windowOpacity` = configured preference, `this.Opacity` = transient display value) is the central correctness invariant throughout every phase.

The key risks concentrate around three interaction surfaces that have each caused multi-milestone regression histories in this project. First, the auto-contrast sampler's `shouldSkip` predicate must be extended to include proximity fading state in the same commit that introduces the fade — omitting this re-introduces the feedback flicker loop that required three separate fixes (v3.6, v3.6.1, v3.6.2). Second, `WS_EX_TRANSPARENT` must only be applied when `this.Opacity == 0.0` — never during the fade — or the widget becomes click-through while still visible and WPF stops delivering mouse events. Third, `_windowOpacity` must never be written from any fade callback — it is the configured preference that drives every opacity restore, save, and slider sync.

---

## Key Findings

### Recommended Stack

No new libraries or packages are needed. The entire feature is implementable from APIs already declared and validated in the project. The `AppSettings` init-property record pattern supports two new fields with zero migration risk — absent fields JSON-deserialize to their `init` defaults.

**Core technologies:**
- `GetCursorPos` + `GetWindowRect` (Win32, user32.dll): cursor-to-rect distance polling — already declared in `GhostModeController`; the only reliable approach under `WS_EX_TRANSPARENT` (WPF `Mouse.GetPosition` stops working when click-through is active, validated in project history)
- `DispatcherTimer` at 75ms (WPF BCL, .NET 10): drives proximity polling — already exists; extend the tick handler in-place; no second timer
- `Window.Opacity` direct assignment (WPF, .NET 10): applies computed fade value — already used by ghost mode; no animation framework needed or appropriate
- `Math.Clamp` (.NET BCL): guards the `[0.0, 1.0]` opacity range; zero-cost against floating-point edge cases

### Expected Features

FEATURES.md defines 10 MVP requirements (PROX-01 through PROX-10).

**Must have (table stakes):**
- Opacity decreases proportionally as cursor approaches widget boundary (PROX-01) — core behavior; absent = feature does not exist
- Fade reaches zero on boundary crossing with no snap discontinuity (PROX-02) — any discontinuity reads as a bug
- Symmetric fade-in on cursor retreat using the same distance formula (PROX-03) — asymmetric restore is jarring
- `WS_EX_TRANSPARENT` applied only at `distance == 0`, removed on first non-zero tick on retreat (PROX-04) — preserves the click-through contract
- Ctrl+Alt held suppresses proximity fade; normal hover path activates instead (PROX-05) — existing gesture contract must be preserved
- Ghost Mode tray toggle gates proximity fade; off = fully off (PROX-06) — proximity fade is a sub-feature of ghost mode
- `AppSettings.GhostFadeRadiusPx` (int, default 80, valid range 20–200) with `Validate()` guard (PROX-07)
- Slider in Settings > Behavior tab (range 20–200px, step 10px, value label showing px) (PROX-08)
- Slider disabled when Ghost Mode checkbox is unchecked (PROX-09) — prevents confusing active control with no effect
- `GhostFadeRadiusChanged` event declared in `SettingsWindow` and wired in `MainWindow.OpenSettings()` (PROX-10)

**Defer (v4.1+):**
- Asymmetric fade speed (faster fade-out than fade-in) — linear is sufficient for v4.0
- Fade zone shape options (rectangular vs radial) — rectangular matches widget shape and is the correct default
- Multiple concentric proximity zones — no clear UX benefit over a single radius
- Per-axis independent radii — not requested; over-engineered

### Architecture Approach

Extend `GhostModeController` in-place rather than creating a new `ProximityFadeController`. All ghost-mode Win32 infrastructure is already there; splitting concerns into a new class would duplicate the P/Invoke surface and the polling timer. The controller emits a `float ProximityRatio` (0.0 = outside zone, 1.0 = inside widget) on each tick; `MainWindow` computes `this.Opacity = _windowOpacity * (1.0 - ratio)` inline. The `Activating` event (fired when ratio first reaches 1.0) lets `MainWindow` run the pre-activation cleanup sequence before calling `Activate()` — same as the existing `Window_MouseEnter` ghost path, just triggered from the polling loop.

**Major components:**
1. `GhostModeController` — Win32 cursor polling, Chebyshev distance computation, proximity ratio emission, `WS_EX_TRANSPARENT` management, Ctrl+Alt detection; communicates to `MainWindow` via `ProximityChanged(float)` + `Activating` + existing `Restored` events
2. `MainWindow` — owns `_windowOpacity` (configured, never written by fade) and `this.Opacity` (transient display); applies lerp from `ProximityChanged`; handles `Activating` for pre-activation cleanup; propagates `_isDragging` guard
3. `AppSettings` + `SettingsService` — persists `ProximityFadeRadiusPx`; `Validate()` clamps to `[0, 200]`; `ResetToDefaults()` must include this field (all four: `init` default, `Defaults()`, `Validate()`, `ResetToDefaults()`)
4. `SettingsWindow` + `SettingsSnapshot` — Slider in Behavior tab; `ProximityFadeRadiusChanged` event; `PopulateControls` reads from snapshot; slider gated on Ghost Mode checkbox
5. `ContrastRefreshController` — pause predicate extended with `|| _ghostMode.ProximityRatio > 0.0f`; no other changes

### Critical Pitfalls

1. **Overwriting `_windowOpacity` from the fade path** — configured opacity is silently corrupted, persisted to `settings.json`, and surfaces as "my opacity keeps changing." Prevention: all fade writes go to `this.Opacity` only; `_windowOpacity` is only written by `SetOpacity()`, `ApplySettings()`, `PreviewMouseWheel`, and `ResetToDefaults()`.

2. **`WS_EX_TRANSPARENT` applied before `Opacity == 0.0`** — widget is click-through while still visible; WPF stops delivering mouse events; synthetic `WM_MOUSELEAVE` fires immediately and creates a spurious ghost-restore loop. Prevention: `Activate()` is called only from the `Activating` event handler in `MainWindow`, which fires only when `ProximityRatio` reaches exactly 1.0.

3. **Auto-contrast sampler running during fade** — `ContrastRefreshController.shouldSkip` predicate misses the partially-transparent state; mid-fade BitBlt samples a blended image including the widget's own dimmed rendering; re-introduces WCAG oscillation feedback (the bug fixed across v3.6, v3.6.1, v3.6.2). Prevention: extend the skip predicate to include `|| _ghostMode.ProximityRatio > 0.0f` in the same commit as the fade implementation; never defer.

4. **Proximity fade active during drag** — widget fades to invisible while user is dragging it; only recoverable by releasing the mouse. Prevention: add `if (_isDragging) { this.Opacity = _windowOpacity; return; }` at the top of the `ProximityChanged` callback, same pattern as the existing contrast sampler `_isDragging` guard.

5. **Opacity jitter at the outer fade boundary** — continuous linear mapping amplifies 1–3px mouse input jitter into visible "breathing" when cursor is near the fade start distance. Prevention: apply a hardcoded 10–15px hysteresis band at the outer boundary (same pattern as `ContrastService` 4.5/5.5 WCAG thresholds); build it in from the start.

---

## Implications for Roadmap

Architecture.md prescribes a clean 4-phase build order plus a final test/audit phase. The dependency graph is strict: the `AppSettings` field must exist before the controller reads it; the controller events must be declared before `MainWindow` subscribes; the `MainWindow` wiring method must exist before `SettingsWindow` is wired to it. Each phase can be safely tested against the zero-radius fallback (existing snap behavior) to confirm non-regression.

### Phase 1: AppSettings + Validation + Tests
**Rationale:** All subsequent phases depend on `ProximityFadeRadiusPx` existing in `AppSettings`. Zero behavioral change — default `0` preserves existing snap ghost behavior identically. Establishing the four-point checklist here prevents Pitfall 9 (ResetToDefaults missing the field), which has bitten this project before (v3.5 FIX-01).
**Delivers:** New `AppSettings.ProximityFadeRadiusPx` field (`int`, default `0`); `SettingsService.Validate()` guard clamping to `[0, 200]`; `ResetToDefaults()` reset; round-trip test; absent-field default test; invalid-value clamp test.
**Addresses:** PROX-07 (settings persistence); Pitfall 9 (ResetToDefaults coverage).
**Avoids:** Settings.json incompatibility; silent defaults corruption on upgrade.

### Phase 2: GhostModeController Extension + Unit Tests
**Rationale:** The controller is the pure computational core. Extracting `ComputeProximityRatio` as a static method enables isolation testing without an HWND. The zero-radius code path is left completely unchanged, so all existing `GHOST-01` through `CTRLALT-02` tests continue to pass. This phase establishes the event surface that all downstream phases rely on.
**Delivers:** `ProximityFadeRadius` property; `ProximityRatio` read-only float; `ProximityChanged(float)` event; `Activating` event; extended polling tick with Ctrl+Alt suppression; `ComputeProximityRatio(POINT, RECT, int)` pure static; unit tests for the static covering cursor inside RECT, at zone boundary, beyond zone, zero radius, Chebyshev corner vs cardinal edge cases.
**Uses:** Chebyshev distance formula (no `sqrt`); existing `GetCursorPos`/`GetWindowRect` P/Invokes; existing 75ms timer.
**Avoids:** Pitfall 2 (`Activating` event ensures MainWindow runs cleanup before `Activate()`); Pitfall 7 (pure Win32 pixel space throughout — no WPF DIPs).

### Phase 3: MainWindow Wiring + Contrast Guard
**Rationale:** Requires Phase 2 events and Phase 1 settings field. This phase carries the highest correctness risk and must be treated as atomic. The ContrastRefreshController predicate update is non-negotiable in this same phase — deferring it would ship a regression against the v3.6.2 fix. The `Restored` handler snap-restore behavior (Pitfall 3 / asymmetric fade-in) is resolved here.
**Delivers:** `ProximityChanged` subscription (lerp opacity, `_isDragging` guard, `_windowOpacity` never written); `Activating` subscription (pre-activation cleanup + `Activate()` + `this.Opacity = 0`); `SetProximityFadeRadius()` method; `ApplySettings()` and `ResetToDefaults()` updates; ContrastRefreshController pause predicate extended with `|| _ghostMode.ProximityRatio > 0.0f`.
**Avoids:** Pitfall 1 (`_windowOpacity` invariant); Pitfall 3 (symmetric fade-in — `Restored` handler initiates fade-in via `ProximityChanged`, not snap-opacity); Pitfall 4 (contrast guard in same commit); Pitfall 5 (hover fast-refresh gated on ghost enabled); Pitfall 8 (`_isDragging` guard at top of callback).

### Phase 4: SettingsWindow UI
**Rationale:** Requires Phase 3 (`SetProximityFadeRadius()` must exist before wiring). Behavior tab height must be confirmed before adding the slider row (~40px) — measure against the 480x600 window constraint established in v3.6. Follow the `BackdropOpacitySlider` pattern in the Appearance tab as the UI reference.
**Delivers:** `ProximityFadeRadiusPx` in `SettingsSnapshot`; `ProximityFadeRadiusChanged` event in `SettingsWindow`; Slider in Behavior tab with px value label and description ("widget fades to invisible within this distance"); slider gated on Ghost Mode checkbox; `PopulateControls` update; `OpenSettings()` wiring.
**Addresses:** PROX-08 (slider); PROX-09 (slider gating); PROX-10 (event wiring); Pitfall 10 (clear labeling, "0 = disabled" at left end, description line).

### Phase 5: End-to-End Tests + Audit
**Rationale:** Full test run (395 existing + new proximity tests). Manual verification of the "Looks Done But Isn't" checklist from PITFALLS.md. Auto-contrast stability during fade is the highest-priority manual check given the v3.6 history.
**Delivers:** All 10 PROX items verified; no regression to existing ghost-mode, contrast, drag, or settings behavior; hysteresis stability confirmed at 20px radius.

### Phase Ordering Rationale

- Settings field first because the zero default preserves all existing behavior while establishing the data model every other phase reads; round-trip tests confirm forward compatibility immediately.
- Controller second because it is the pure-computation core with no UI dependency; `ComputeProximityRatio` unit tests run without HWND or WPF, confirming the distance formula before any opacity changes are live.
- MainWindow third because the dangerous invariant violations (opacity corruption, contrast guard omission) all live here; shipping this phase also closes the snap-restore asymmetry before the UI exposes the feature.
- SettingsWindow last because it only needs the wiring points Phase 3 establishes; XAML changes have zero effect on core correctness.
- Every phase uses zero-radius as the unmodified fallback, so the existing test suite provides non-regression signals at every boundary.

### Research Flags

Phases with well-documented patterns (skip `/gsd:research-phase`):
- **Phase 1 (AppSettings):** Standard init-property + `Validate()` pattern; identical to every prior settings field addition.
- **Phase 4 (SettingsWindow):** Standard slider pattern; follow `BackdropOpacitySlider` in Appearance tab as direct reference.
- **Phase 5 (Tests):** Standard MSTest suite; no new framework.

Phases warranting deliberate care but not full research:
- **Phase 2 (GhostModeController):** The tick restructuring changes validated behavior; plan must explicitly confirm zero-radius path is untouched and include before/after test comparison.
- **Phase 3 (MainWindow):** The highest concurrent invariant burden in one phase; plan should enumerate the four write-sites for `_windowOpacity` and confirm none are reachable from the new callback.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs already in production use; avoidance of WPF animation APIs is grounded in the existing `WS_EX_TRANSPARENT` synchronization invariant, not speculation |
| Features | HIGH | MVP requirements derived from PROJECT.md goals and direct codebase audit; official WPF animation + Fluent motion docs consulted and confirm the linear position-driven approach |
| Architecture | HIGH | Derived from direct source audit of all affected files in the current production codebase (v3.9, 395 tests); no external documentation consulted — all findings from reading actual code |
| Pitfalls | HIGH | Every pitfall is grounded in specific existing code paths; Pitfall 4 (auto-contrast) is directly backed by the v3.6–v3.6.2 fix history in this project |

**Overall confidence:** HIGH

### Gaps to Address

- **DPI label convention for slider:** `ProximityFadeRadiusPx` is stored in physical pixels to match the Win32 coordinate space. On 150% DPI, "100px" on the slider represents a smaller visual distance than a user naively expects. For v4.0, label as "px (screen pixels)" and defer per-DPI correction unless explicitly requested. The conversion formula (`physicalPx = logicalPx * PresentationSource.CompositionTarget.TransformToDevice.M11`) is documented in STACK.md if needed later.

- **Hysteresis band magnitude:** PITFALLS.md recommends 10–15px hardcoded hysteresis at the outer boundary. The exact value is estimated from typical 1–3px device jitter, not validated against real hardware. Confirm during Phase 5 by holding the cursor at the fade start distance for 5+ seconds at the minimum (20px) radius — the most sensitive configuration. Adjust the constant if breathing is visible.

- **Behavior tab height:** ARCHITECTURE.md flags that adding a slider row (~40px) must be measured against the 480x600 SettingsWindow before Phase 4 XAML work begins. If the tab is constrained, a compact single-row layout (slider inline with Ghost Mode label) may be needed.

---

## Sources

### Primary (HIGH confidence)

- `FuzzyClock.App/GhostModeController.cs` — P/Invoke declarations, 75ms timer, `Activate()`, `Restored` event, `IsCtrlAltHeld()`, `WS_EX_TRANSPARENT` application site
- `FuzzyClock.App/MainWindow.xaml.cs` — `_windowOpacity` / `this.Opacity` separation, `Window_MouseEnter` ghost path, `Restored` handler, ContrastRefreshController pause predicate, `_isDragging` flag, ghost activation cleanup sequence
- `FuzzyClock.App/AppSettings.cs` + `SettingsService.cs` — init-property record pattern, `Validate()` guard patterns, `Defaults()`, `ResetToDefaults()` structure
- `FuzzyClock.App/SettingsWindow.xaml.cs` + `SettingsWindow.xaml` — event declaration pattern, `_suppressEvents` guard, `PopulateControls`, `BackdropOpacitySlider` as UI reference
- `FuzzyClock.App/ContrastRefreshController.cs` — `shouldSkip` predicate; 500ms sampling timer; `_isDragging` pattern
- `FuzzyClock.App/ContrastSamplerService.cs` — `MaxSampleDim = 200` used as upper-bound rationale for radius validation
- `.planning/PROJECT.md` — validated decisions: Win32 polling rationale under `WS_EX_TRANSPARENT`, synthetic MOUSELEAVE behavior, `VK_LMENU` vs `VK_MENU`, pre-ghost cleanup order, `_windowOpacity` as authoritative configured value
- v3.6 / v3.6.1 / v3.6.2 project history — contrast feedback loop fix history; establishes why auto-contrast sampling during partial transparency is dangerous

### Secondary (MEDIUM confidence)

- WPF Animation Overview (official): https://learn.microsoft.com/en-us/dotnet/desktop/wpf/graphics-multimedia/animation-overview — confirms `DoubleAnimation` DP ownership behavior; consulted for rationale for the non-recommended path only
- WPF Easing Functions (official): https://learn.microsoft.com/en-us/dotnet/desktop/wpf/graphics-multimedia/easing-functions — confirms easing is for time-driven animation; linear is correct for position-driven proximity fade
- Microsoft Fluent motion timing (official): https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing — `ControlNormalAnimationDuration = 250ms`; validates that 75ms polling over 80px produces an appropriately fast perceived response

### Tertiary (MEDIUM confidence, informational only)

- Rainmeter documentation: https://docs.rainmeter.net/manual/mouse-actions/ — confirms no proximity fade primitives exist in the desktop widget ecosystem; this feature is custom-built, not a pattern to copy from elsewhere

---

*Research completed: 2026-03-27*
*Ready for roadmap: yes*
