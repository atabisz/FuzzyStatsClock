# Phase 87: Verification & performance acceptance - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 5 (2 new test files, 2 production-code edits, 1 new verification doc)
**Analogs found:** 5 / 5 (all analogs cited in CONTEXT.md verified against the live codebase)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `FuzzyClock.App.Tests/LerpRatioTests.cs` (new) | test (MSTest unit) | pure-function table-driven | `FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs:13-26` | exact |
| `FuzzyClock.App.Tests/OnSampleTickTests.cs` (new) | test (MSTest unit) | parametric seam (controller + injected inputs) | `FuzzyClock.App.Tests/GhostModeControllerTests.cs:18-26` | exact |
| `FuzzyClock.App/GhostModeController.cs:70` (edit) | model (state field) | one-keyword visibility relaxation | siblings at `GhostModeController.cs:72-81` (already `internal`/visible) | exact (in-file) |
| `FuzzyClock.App/MainWindow.xaml.cs:260-275` (edit) | controller (event handler) | request-response (event → state mutation) | `MainWindow.xaml.cs:1484-1494` (`SetOpacity` settings-pin pattern) | role-match |
| `.planning/phases/87-verification-performance-acceptance/87-VERIFICATION.md` (new) | documentation (verification report) | structured attestation | `.planning/phases/86-frame-driven-opacity-rendering/86-VERIFICATION.md` | exact |

---

## Pattern Assignments

### `FuzzyClock.App.Tests/LerpRatioTests.cs` (test, pure-function table-driven)

**Analog:** `FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs`

**Imports + class header pattern** (lines 1-11):
```csharp
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Unit tests for GhostModeController.ComputeProximityRatio.
/// Widget rect used in all parametric tests: Left=100, Top=100, Right=200, Bottom=200 (100x100 widget).
/// </summary>
[TestClass]
public class GhostModeControllerProximityTests
{
```
**Mirror:** Replace summary text and class name; same `using FuzzyClock.App;` + `namespace FuzzyClock.App.Tests;` + `[TestClass] public class LerpRatioTests`. No additional `using` for MSTest (project's test SDK pulls `Microsoft.VisualStudio.TestTools.UnitTesting` globally — confirmed from analog).

**Core `[DataRow]` parametric pattern** (lines 12-28):
```csharp
[TestMethod]
[DataRow(50,  150, 50, 0.0,  DisplayName = "50px left of edge, radius=50 -> 0.0 (zone boundary)")]
[DataRow(75,  150, 50, 0.5,  DisplayName = "25px from edge, radius=50 -> 0.5")]
[DataRow(40,  150, 50, 0.0,  DisplayName = "60px outside zone, radius=50 -> clamped 0.0")]
[DataRow(150, 150, 50, 1.0,  DisplayName = "inside rect -> 1.0")]
// ... more rows ...
public void ComputeProximityRatio_VariousPositions(int cursorX, int cursorY, int radius, double expected)
{
    double result = GhostModeController.ComputeProximityRatio(
        cursorX, cursorY, 100, 100, 200, 200, radius);
    Assert.AreEqual(expected, result, 0.0001);
}
```
**Mirror:** One `[TestMethod]` with N `[DataRow]` decorators, each carrying a `DisplayName = "..."` describing the case. Single-line `Assert.AreEqual(expected, result, 0.0001)` (epsilon for `double`). Method body is direct call to `GhostModeController.LerpRatio(...)` with the row's parameters. Per CONTEXT D-LERP-02 the row layout is already specified in `87-CONTEXT.md` "Specific Ideas".

**Optional non-parametric helper-method pattern** (lines 30-42):
```csharp
[TestMethod]
public void ComputeProximityRatio_ZeroRadius_InsideRect_Returns1()
{
    double result = GhostModeController.ComputeProximityRatio(150, 150, 100, 100, 200, 200, 0);
    Assert.AreEqual(1.0, result, 0.0001);
}
```
**Mirror:** D-LERP-01 mid-range NOT-snap assertion (target=0.5 does NOT return target) cleanly fits this single-method shape — separate `[TestMethod]` per CONTEXT D-LERP-02 ("implementer's choice").

---

### `FuzzyClock.App.Tests/OnSampleTickTests.cs` (test, parametric seam)

**Analog:** `FuzzyClock.App.Tests/GhostModeControllerTests.cs`

**Imports + class header pattern** (lines 1-16):
```csharp
// NOTE: Tests document expected behavior but cannot verify actual keypresses in CI.
// GetAsyncKeyState returns 0 when keys not pressed, so all tests will initially
// behave as if no keys are held. Manual verification required for keypress scenarios.
// Plan 83-02 implements IsModifierHeld logic; Phase 84 human verification validates end-to-end.

using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

/// <summary>
/// Tests for GhostModeController.IsModifierHeld() configurable modifier detection.
/// TST-03: Verify all 8 combinations (2³) including all-false = always-false.
/// </summary>
[TestClass]
public class GhostModeControllerTests
{
```
**Mirror:** Same `using` + `namespace` + `[TestClass]` shape. Top-of-file `// NOTE:` comment block is the established convention for explaining test-environment caveats — `OnSampleTickTests` should carry an analogous note explaining direct-write `controller._isGhostMode = true;` setup is for seam-state setup only and does not violate the Phase 85 D-06 ownership rule (production-side writes still owned by `OnSampleTick(false)` and `Activate(true)`).

**Internals access + `[DataRow]` parametric body** (lines 17-39):
```csharp
[TestMethod]
[DataRow(false, false, false, false)]  // all-false case (DET-02): override disabled
[DataRow(true,  false, false, false)]  // Ctrl-only enabled, not held → false
[DataRow(false, true,  false, false)]  // Alt-only enabled, not held → false
// ... more rows ...
public void IsModifierHeld_VariousConfigs_ReturnsExpected(
    bool useCtrl, bool useAlt, bool useShift, bool expected)
{
    // Arrange: controller with config
    var controller = new GhostModeController();
    controller.UpdateModifierConfig(useCtrl, useAlt, useShift);

    // Act: call IsModifierHeld (no keys actually pressed in CI)
    // NOTE: GetAsyncKeyState returns 0 when keys not pressed
    bool result = controller.IsModifierHeld();

    // Assert: verify logic (all-false cases should return false)
    Assert.AreEqual(expected, result);
}
```
**Mirror:** `var controller = new GhostModeController();` followed by per-row internal-state setup (`controller._isGhostMode = isGhostModePre;` per CONTEXT D-SEAM-02), then a single `OnSampleTick(...)` call, then `Assert.AreEqual(expectedTransition, result.Transition);`. The pattern of constructing the controller and exercising `internal` members directly is exactly what `InternalsVisibleTo` enables — confirmed at `FuzzyClock.App.csproj:7-11`.

**Direct-internal-write setup pattern** (per CONTEXT D-SEAM-02, no in-file analog yet — this test is the first writer):
```csharp
// (cursorX, cursorY, isGhostModePre, expectedTransition) per CONTEXT "Specific Ideas":
var c = new GhostModeController();
c._isGhostMode = isGhostModePre;
var r = c.OnSampleTick(cursorX, cursorY, 100, 100, 200, 200, modifiersHeld: false);
Assert.AreEqual(expectedTransition, r.Transition);
```
**Mirror:** No prior analog because Phase 87 is the first test that needs a direct field write. This works only after the field-visibility relaxation lands at `GhostModeController.cs:70`. Widget rect coordinates `100, 100, 200, 200` match the established convention in `GhostModeControllerProximityTests` for cross-test consistency.

---

### `FuzzyClock.App/GhostModeController.cs:70` (model, visibility relaxation)

**Analog (in-file):** sibling fields at `GhostModeController.cs:72-81` already broadcast the `internal`-visibility convention for fields that tests reach.

**Current declaration** (line 70, before edit):
```csharp
private volatile bool _isGhostMode;                      // D-06: cross-thread reader at MainWindow.xaml.cs:165
```

**Sibling fields establishing the convention** (lines 72-81):
```csharp
private IntPtr _hwnd;
private System.Threading.Timer? _timer;                  // D-01: thread-pool sampling timer
private Dispatcher _dispatcher = null!;                  // D-09: captured once at Initialize for UI marshalling
private int _tickInFlight;                               // D-02: Interlocked reentrancy guard (0=idle, 1=tick running)
private double _lastProximityRatio = 0.0;                // D-06: sampler-thread-local — no cross-thread reader, no volatile
private volatile int _ghostFadeRadiusPx = 80;            // D-10: cross-thread config; UI writes, sampler reads
private volatile bool _useCtrl  = true;                  // D-10: CFG-04 default preserves Ctrl+Alt behavior from v4.2
private volatile bool _useAlt   = true;                  // D-10: CFG-04 default preserves Ctrl+Alt behavior from v4.2
private volatile bool _useShift = false;                 // D-10: CFG-04 default Shift disabled
private volatile bool _isEnabled = true;                 // D-11: backing field for manual IsEnabled property
private bool _disposed;                                  // D-03: idempotency guard for Dispose()
```

**Required edit** (per CONTEXT D-SEAM-02b — exactly one keyword change at line 70):
```csharp
internal volatile bool _isGhostMode;                     // D-06: cross-thread reader at MainWindow.xaml.cs:165 (Phase 87 D-SEAM-02b: relaxed to internal for OnSampleTickTests setup)
```
**Mirror:** Keep `volatile bool` modifier and inline trailing comment; only `private` → `internal`. Optionally append a `Phase 87 D-SEAM-02b` note clause to the comment for traceability — non-mandatory; CONTEXT explicitly permits implementer discretion on comment style.

**Invariant preservation note:** Phase 85 D-06 ownership rule (sampler writes `false`; `Activate()` writes `true`) is unaffected — `internal` does not introduce new production-side writers. Verified at `GhostModeController.cs:423` (`_isGhostMode = false;` inside `OnSampleTick`) and the sole `Activate()` write site. The existing `public bool IsActive => _isGhostMode;` getter (declared elsewhere in the file) continues to work identically.

---

### `FuzzyClock.App/MainWindow.xaml.cs:260-275` (controller, request-response edit)

**Analog (in-file, settings-window-pin pattern):** `MainWindow.xaml.cs:1484-1494` (`SetOpacity` method).

**Current handler body** (lines 260-275, before edit):
```csharp
private void OnGhostEnabledChanged(bool enabled)
{
    if (enabled)
    {
        if (_renderPumpAttached) return;
        _previousRenderTime = null;                       // D-01: reset baseline so first frame uses 0.016 synth
        System.Windows.Media.CompositionTarget.Rendering += OnRenderingTick;
        _renderPumpAttached = true;
    }
    else
    {
        if (!_renderPumpAttached) return;
        System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;
        _renderPumpAttached = false;
    }
}
```

**Settings-window-pin reference pattern** (lines 1484-1494, `SetOpacity`):
```csharp
private void SetOpacity(double opacity)
{
    _windowOpacity = opacity;
    // Apply proximity fade only when settings window is closed
    // (settings window open means user is actively adjusting opacity)
    if (_settingsWindow?.IsVisible == true)
        this.Opacity = _windowOpacity;
    else
        this.Opacity = _windowOpacity * (1.0 - _currentRatio);
    SaveSettings();
}
```
**Why this is the analog:** It is the canonical in-file pattern for "if settings window is open, skip the proximity-fade math and write `_windowOpacity` raw; otherwise multiply through `_currentRatio`." The Phase 87 WR-04 fix uses the inverse condition shape (`_settingsWindow?.IsVisible != true`) per CONTEXT D-CARRY-01 because the disable branch only writes when NOT pinned — the settings window holds opacity to its own pinned value (line 1490) and Phase 87 must not stomp on that contract.

**Field-zero pattern** (mirrors `MainWindow.xaml.cs:185-186` in the contrast-skip path):
```csharp
_currentRatio = 0.0;
this.Opacity = _windowOpacity;
```
**Mirror:** The "zero `_currentRatio`, write `Opacity = _windowOpacity`" two-line pair already exists at lines 185-186 (initialization-time path); Phase 87 mirrors that two-line shape inside the disable branch but adds the `_targetRatio = 0.0;` companion (Phase 86 D-13 introduced `_targetRatio` after the line-185 path was written — the pattern needs both fields zeroed for full reset).

**Required edit** (per CONTEXT D-CARRY-01, six-line patch — placed between the existing `_renderPumpAttached = false;` at line 273 and the closing brace at line 274):
```csharp
private void OnGhostEnabledChanged(bool enabled)
{
    if (enabled)
    {
        if (_renderPumpAttached) return;
        _previousRenderTime = null;
        System.Windows.Media.CompositionTarget.Rendering += OnRenderingTick;
        _renderPumpAttached = true;
    }
    else
    {
        if (!_renderPumpAttached) return;
        System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;
        _renderPumpAttached = false;
        // Phase 87 WR-04 fix: clear residual lerp state and restore Opacity unless pinned.
        _currentRatio = 0.0;
        _targetRatio  = 0.0;
        if (_settingsWindow?.IsVisible != true)
            this.Opacity = _windowOpacity;
    }
}
```
**Mirror specifics:**
- `_currentRatio = 0.0;` and `_targetRatio = 0.0;` field writes mirror the existing line 185-186 reset pattern (and Phase 86 D-12/D-13 field semantics).
- `if (_settingsWindow?.IsVisible != true) this.Opacity = _windowOpacity;` directly mirrors the inverse polarity of the in-file `SetOpacity:1489-1490` test (`if (_settingsWindow?.IsVisible == true) this.Opacity = _windowOpacity;`), preserving the exact `?.IsVisible` null-safe pattern used everywhere else in this file.
- No new fields, no method-signature change — body-only edit per CONTEXT "Integration Points".

---

### `.planning/phases/87-verification-performance-acceptance/87-VERIFICATION.md` (documentation, attestation)

**Analog:** `.planning/phases/86-frame-driven-opacity-rendering/86-VERIFICATION.md`

**Frontmatter pattern** (lines 1-29):
```yaml
---
phase: 86-frame-driven-opacity-rendering
verified: 2026-05-20T12:00:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Hover cursor toward widget — confirm visible fade is smooth at display refresh rate (no stepping/jank tied to 33 ms sampling cadence)"
    expected: "Fade traversal looks smoothly continuous at 60 Hz / 144 Hz; visibly different from pre-Phase-86 stepwise behavior; activation crisp at proximity = 1.0; restore crisp at proximity = 0.0"
    why_human: "FADE-01 visible smoothness is observation-only — grep can confirm CompositionTarget.Rendering subscription and per-frame LerpRatio call, but only a human eye on the running widget can confirm the user-perceptible smoothness improvement. Phase 87 owns formal PERF-01 acceptance under sustained 25-50% CPU load."
  # ... more items ...
---
```
**Mirror:** Same YAML keys (`phase`, `verified`, `status`, `score`, `overrides_applied`, `human_verification`). For Phase 87, `phase: 87-verification-performance-acceptance`. The `human_verification:` list per CONTEXT D-CARRY-03 absorbs the 12 carry-forward items from Phases 85 (5) and 86 (7); each item retains the analog's three-key shape (`test:`, `expected:`, `why_human:`).

**Body section pattern** (verified file uses these section headings in order):
```markdown
# Phase 86: Frame-driven opacity rendering — Verification Report

**Phase Goal:** [phase goal restated]
**Verified:** [iso timestamp]
**Status:** [human_needed | verified]
**Re-verification:** [No | Yes — round N]

---

## Goal Achievement
[narrative paragraph: success criteria summary]

## Observable Truths
| # | Truth | Status | Evidence |
| ... |

## Required Artifacts
| Artifact | Expected | Status | Details |

## Key Link Verification
| From | To | Via | Status | Details |

## Behavioral Spot-Checks
| Behavior | Command | Result | Status |

## Requirements Coverage
| Requirement | Source Plan | Description | Status | Evidence |

## Anti-Patterns Found
[scan results]

## Human Verification Required
[narrative pointing back to frontmatter]

## Gaps Summary
[narrative]
```
**Mirror specifics for Phase 87:**
- Same nine sections (Goal Achievement → Observable Truths → Required Artifacts → Key Link Verification → Behavioral Spot-Checks → Requirements Coverage → Anti-Patterns Found → Human Verification Required → Gaps Summary).
- Per CONTEXT D-PERF-02, the "Behavioral Spot-Checks" table includes the PERF-01 attestation row capturing: load level reached, monitor refresh rate, subjective smoothness verdict (`smooth` / `barely-stepping` / `clearly-stepping`), and explicit sign-off line.
- Per CONTEXT D-CARRY-03, append a UAT-observation checklist to the Human Verification section noting which absorbed items were observed during the PERF-01 load run vs. which remain open.
- TEST-04 evidence row records the `dotnet test FuzzyClock.sln --nologo --verbosity quiet` `Passed: NNN, Failed: 0, Skipped: 0` line.
- Footer pattern (lines 188-191):
  ```markdown
  _Verified: [timestamp]_
  _Verifier: Claude (gsd-verifier)_
  _Build: dotnet build FuzzyClock.slnx → 0 Warnings, 0 Errors_
  _Tests: NNN / NNN App + NNN / NNN Core = NNN / NNN baseline preserved_
  ```

---

## Shared Patterns

### `InternalsVisibleTo` test access
**Source:** `FuzzyClock.App/FuzzyClock.App.csproj:7-11`
**Apply to:** `LerpRatioTests.cs`, `OnSampleTickTests.cs`
```xml
<ItemGroup>
  <AssemblyAttribute Include="System.Runtime.CompilerServices.InternalsVisibleTo">
    <_Parameter1>FuzzyClock.App.Tests</_Parameter1>
  </AssemblyAttribute>
</ItemGroup>
```
**No edit required** — already configured. Both new test files inherit access to `internal` members of `FuzzyClock.App` (specifically `LerpRatio`, `OnSampleTick`, `GhostTransition`, `SampleResult`, and the relaxed `_isGhostMode` field).

### MSTest `[TestClass]` + `[TestMethod]` + `[DataRow]` table-driven convention
**Source:** Both analog test files (`GhostModeControllerProximityTests.cs:9-28`, `GhostModeControllerTests.cs:14-39`)
**Apply to:** `LerpRatioTests.cs`, `OnSampleTickTests.cs`
- Top-of-file: `using FuzzyClock.App;` then `namespace FuzzyClock.App.Tests;` (file-scoped namespace).
- Class: `[TestClass] public class XxxTests` (no inheritance).
- Method: single `[TestMethod]` with stacked `[DataRow(..., DisplayName = "...")]` decorators where parametric; standalone `[TestMethod]` for one-off cases.
- Assertion: `Assert.AreEqual(expected, actual)` for booleans/enums; `Assert.AreEqual(expected, actual, 0.0001)` for `double` (epsilon convention from `GhostModeControllerProximityTests.cs:27`).
- No `[TestInitialize]`, no `[AssemblyInitialize]`, no DI fixtures — direct `var controller = new GhostModeController();` per test row.

### `_settingsWindow?.IsVisible` null-safe pin guard
**Source:** `MainWindow.xaml.cs:1489` (`SetOpacity`), also `:313` (`OnRenderingTick`)
**Apply to:** WR-04 fix in `OnGhostEnabledChanged(false)`
- Always use the null-conditional `?.` form: `_settingsWindow?.IsVisible == true` or `_settingsWindow?.IsVisible != true` — never bare `_settingsWindow.IsVisible`.
- Polarity:
  - When the action is "skip the fade math" (`SetOpacity:1489`, `OnRenderingTick:313`), test for `== true` to enter the skip branch.
  - When the action is "do the fade-restore unless pinned" (Phase 87 WR-04 fix), test for `!= true` per CONTEXT D-CARRY-01.

### Phase verification report YAML+markdown shape
**Source:** `.planning/phases/86-frame-driven-opacity-rendering/86-VERIFICATION.md`
**Apply to:** `87-VERIFICATION.md`
- Frontmatter keys are positional: `phase`, `verified`, `status`, `score`, `overrides_applied`, `human_verification`.
- `status` values observed: `human_needed`, `verified` (Phase 87 will be `human_needed` until the human PERF-01 sign-off lands).
- `score` format: `N/N must-haves verified`.
- Body sections in fixed order (see "body section pattern" above).

---

## No Analog Found

None. All five Phase 87 deliverables have direct analogs in the codebase or the prior-phase verification corpus.

---

## Metadata

**Analog search scope:**
- `FuzzyClock.App.Tests/` (per-class MSTest files)
- `FuzzyClock.App/GhostModeController.cs` (in-file sibling-field convention for visibility relaxation)
- `FuzzyClock.App/MainWindow.xaml.cs` (in-file `_settingsWindow?.IsVisible` references and existing `_currentRatio`/`_targetRatio`/`_windowOpacity` writes)
- `FuzzyClock.App/FuzzyClock.App.csproj` (`InternalsVisibleTo` plumbing)
- `.planning/phases/86-frame-driven-opacity-rendering/86-VERIFICATION.md` (verification doc shape)

**Files scanned (read in this pass):** 6
- `c:/src/FuzzyStatsClock/.planning/phases/87-verification-performance-acceptance/87-CONTEXT.md`
- `c:/src/FuzzyStatsClock/.planning/REQUIREMENTS.md`
- `c:/src/FuzzyStatsClock/.planning/STATE.md`
- `c:/src/FuzzyStatsClock/FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs`
- `c:/src/FuzzyStatsClock/FuzzyClock.App.Tests/GhostModeControllerTests.cs`
- `c:/src/FuzzyStatsClock/FuzzyClock.App/GhostModeController.cs` (targeted ranges 55-95, 360-410, 408-435, 470-495)
- `c:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` (targeted ranges 45-70, 240-290, 1480-1500; grep across full file for `_settingsWindow?.IsVisible`/`_windowOpacity`/`_currentRatio`/`_targetRatio`)
- `c:/src/FuzzyStatsClock/FuzzyClock.App/FuzzyClock.App.csproj`
- `c:/src/FuzzyStatsClock/.planning/phases/86-frame-driven-opacity-rendering/86-VERIFICATION.md`

**Pattern extraction date:** 2026-05-20
