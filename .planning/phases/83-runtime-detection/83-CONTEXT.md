# Phase 83: Runtime Detection — Context

**Created:** 2026-05-07
**Phase Goal:** GhostModeController correctly detects user-configured modifier combinations

## Domain

Transform `IsCtrlAltHeld()` in [GhostModeController.cs](../../FuzzyClock.App/GhostModeController.cs) from hardcoded `VK_LCONTROL` + `VK_LMENU` checks to a configurable system that checks only the user's enabled modifiers (Ctrl/Alt/Shift).

**What changes:**
- Hardcoded two-key check → configurable three-key check with all-false short-circuit
- Single call site: [GhostModeController.cs:115](../../FuzzyClock.App/GhostModeController.cs#L115) in `OnTimerTick` (forces `ratio = 0.0` when modifiers held)
- New public `UpdateModifierConfig(bool useCtrl, bool useAlt, bool useShift)` method
- Rename `IsCtrlAltHeld()` → `IsModifierHeld()` (public for unit testing per TST-03)

**What doesn't change:**
- Left-side-only VK codes (VK_LCONTROL=0xA2, VK_LMENU=0xA4) — proven pattern since v2.3, prevents AltGr false-positives on EU keyboards
- `GetAsyncKeyState(...) & 0x8000` high-bit mask for currently-pressed detection
- 75ms timer tick frequency
- ProximityChanged event flow

## Requirements Locked

Phase 83 covers 6 requirements from REQUIREMENTS.md:

- **DET-01:** GhostModeController has IsModifierHeld method checking configured modifiers via GetAsyncKeyState
- **DET-02:** All three modifiers unchecked → IsModifierHeld always returns false (override disabled)
- **DET-03:** One or more checked → IsModifierHeld returns true only when ALL enabled modifiers held simultaneously (AND logic)
- **DET-04:** GetAsyncKeyState checks use `& 0x8000` high-bit mask (currently-pressed, not toggle-since-last-call)
- **DET-05:** Left-side VK codes: VK_LCONTROL (0xA2), VK_LMENU (0xA4), VK_LSHIFT (0xA0)
- **TST-03:** MSTest unit tests verify IsModifierHeld logic for all 8 combinations (2³) including all-false = always-false

## Decisions

### Config Flow (decided: Property setter)
`GhostModeController` gets new public method `UpdateModifierConfig(bool useCtrl, bool useAlt, bool useShift)`. Settings window modifier checkbox events will trigger MainWindow handlers that call this method directly. Config changes instant, no controller recreation needed.

**Call sites (decided: Both):**
1. `ApplySettings()` — centralized startup/reset path (sets GhostFadeRadiusPx already; add UpdateModifierConfig call)
2. Each modifier checkbox event handler — immediate propagation when user changes checkboxes

Pattern: `_settings = _settings with { UseX = v }; SaveSettings(); _ghostController.UpdateModifierConfig(_settings.UseCtrl, _settings.UseAlt, _settings.UseShift);`

### Method Naming (decided: IsModifierHeld)
Rename `IsCtrlAltHeld()` → `IsModifierHeld()`. Aligns with DET-01 requirement naming. Generic, clear intent. One call site changes from `IsCtrlAltHeld()` to `IsModifierHeld()`.

### Visibility (decided: Public)
`IsModifierHeld()` becomes **public** for direct unit testing. TST-03 says "unit tests" — tests call IsModifierHeld directly with different configs, no timer/event machinery needed.

### All-False Optimization (decided: Short-circuit in OnTimerTick)
When all three bools are false, `OnTimerTick` skips `IsModifierHeld()` call entirely (same user behavior, fewer Win32 calls per tick). Implementation:

```csharp
if (_useCtrl || _useAlt || _useShift)
{
    if (IsModifierHeld())
        ratio = 0.0;  // suppress ghost
}
else
{
    // all false: override disabled, no need to check keys
}
```

This satisfies DET-02 ("always returns false") via never calling the method when disabled.

### VK Constants (decided: Add VK_LSHIFT)
Add `VK_LSHIFT = 0xA0` to existing VK const block at top of GhostModeController. Consistency with VK_LCONTROL/VK_LMENU pattern. DET-05 satisfied.

### Test Style (decided: [DataRow] parametric)
Single `[TestMethod]` with 8 `[DataRow]` attributes (one per combination). Follows existing GhostModeController test pattern (ComputeProximityRatio has 12 DataRow tests). TST-03: "verify all 8 combinations".

Test cases (all 8):
```csharp
[DataRow(false, false, false, false)]  // all-false = always false
[DataRow(true,  false, false, false)]  // Ctrl-only enabled, Ctrl not held = false
[DataRow(true,  false, false, true)]   // Ctrl-only enabled, Ctrl held = true
[DataRow(false, true,  false, false)]  // Alt-only enabled, Alt not held = false
[DataRow(false, true,  false, true)]   // Alt-only enabled, Alt held = true
[DataRow(true,  true,  false, false)]  // Ctrl+Alt enabled, neither held = false
[DataRow(true,  true,  false, true)]   // Ctrl+Alt enabled, only Ctrl held = false
[DataRow(true,  true,  false, true)]   // Ctrl+Alt enabled, both held = true
```

Mock GetAsyncKeyState returns via test doubles or manual verification with real keypresses (GetAsyncKeyState not easily mockable in MSTest without extra P/Invoke wrapper layer).

## Code Context

### Current Implementation Baseline

[GhostModeController.cs:21-22](../../FuzzyClock.App/GhostModeController.cs#L21-L22):
```csharp
private const int  VK_LCONTROL = 0xA2;   // Left Ctrl only
private const int  VK_LMENU    = 0xA4;   // Left Alt only — VK_MENU matches AltGr on EU keyboards
```

Add between line 22 and 23:
```csharp
private const int  VK_LSHIFT   = 0xA0;   // Left Shift only
```

[GhostModeController.cs:183-185](../../FuzzyClock.App/GhostModeController.cs#L183-L185) — current hardcoded implementation:
```csharp
public bool IsCtrlAltHeld() =>
    (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0 &&
    (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;
```

This becomes:
```csharp
public bool IsModifierHeld()
{
    bool ctrlHeld  = _useCtrl  && (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0;
    bool altHeld   = _useAlt   && (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;
    bool shiftHeld = _useShift && (GetAsyncKeyState(VK_LSHIFT)   & 0x8000) != 0;
    
    // AND logic: all enabled modifiers must be held
    bool ctrlOk  = !_useCtrl  || ctrlHeld;
    bool altOk   = !_useAlt   || altHeld;
    bool shiftOk = !_useShift || shiftHeld;
    
    return ctrlOk && altOk && shiftOk;
}
```

[GhostModeController.cs:115](../../FuzzyClock.App/GhostModeController.cs#L115) — call site in OnTimerTick:
```csharp
if (IsCtrlAltHeld())  // old
    ratio = 0.0;

// becomes:

if (_useCtrl || _useAlt || _useShift)  // short-circuit when all-false
{
    if (IsModifierHeld())
        ratio = 0.0;
}
```

### MainWindow Integration Sites

[MainWindow.xaml.cs](../../FuzzyClock.App/MainWindow.xaml.cs) — `ApplySettings()` already sets `_ghostController.GhostFadeRadiusPx`. Add after that line:
```csharp
_ghostController.UpdateModifierConfig(_settings.UseCtrl, _settings.UseAlt, _settings.UseShift);
```

Event handlers (three new subscriptions in `OpenSettings()`, same pattern as existing Phase 82 checkbox handlers):
```csharp
_settingsWindow.UseCtrlChanged += v =>
{
    _settings = _settings with { UseCtrl = v };
    SaveSettings();
    _ghostController.UpdateModifierConfig(_settings.UseCtrl, _settings.UseAlt, _settings.UseShift);
};
// repeat for UseAltChanged, UseShiftChanged
```

`ResetToDefaults()` already sets `UseCtrl=true, UseAlt=true, UseShift=false` via Phase 81. After `ApplySettings()` call in ResetToDefaults, the startup path (`ApplySettings` → `UpdateModifierConfig`) handles propagation. No extra code needed.

### Test File Location

New file: `FuzzyClock.App.Tests/GhostModeControllerTests.cs` (parallel to existing `SettingsServiceTests.cs`).

Test class structure:
```csharp
[TestClass]
public class GhostModeControllerTests
{
    [TestMethod]
    [DataRow(false, false, false, false)]  // all-false case
    [DataRow(true,  false, false, true)]   // Ctrl-only enabled, Ctrl held
    [DataRow(true,  true,  false, true)]   // Ctrl+Alt enabled, both held
    // ...5 more DataRow for remaining combinations
    public void IsModifierHeld_VariousConfigs_ReturnsExpected(
        bool useCtrl, bool useAlt, bool useShift, bool expected)
    {
        // Arrange: controller.UpdateModifierConfig(useCtrl, useAlt, useShift)
        // Act: press keys (or mock GetAsyncKeyState)
        // Assert: controller.IsModifierHeld() == expected
    }
}
```

**GetAsyncKeyState mocking caveat:** GetAsyncKeyState is a static P/Invoke. MSTest doesn't support mock frameworks that can intercept static externs. Two paths forward:
1. **Manual verification** — run tests with real keypresses (press Ctrl, assert true; release, assert false). Requires human interaction, not CI-friendly.
2. **Extract to interface** — wrap GetAsyncKeyState in `IKeyStateProvider`, inject into controller. Adds indirection but makes tests deterministic. Out of scope for Phase 83 (requires constructor change, breaks Phase 84 integration).

**Researcher recommendation:** Validate logic via code inspection + human verification checklist in Phase 84. MSTest tests document the 8 combinations via DataRow but may need `[Ignore]` attribute with comment "Requires real keyboard input — validated in Phase 84 checklist."

## Canonical References

- [REQUIREMENTS.md](../../.planning/REQUIREMENTS.md) — DET-01 through DET-05, TST-03
- [ROADMAP.md](../../.planning/ROADMAP.md) — Phase 83 requirements mapping
- [PROJECT.md](../../.planning/PROJECT.md) — v2.3 ghost mode history (lines 126-132: GHOST-01, GHOST-02, CTRLALT-01, CTRLALT-02)
- [GhostModeController.cs](../../FuzzyClock.App/GhostModeController.cs) — current implementation baseline

## Out of Scope

Explicitly NOT in Phase 83 (covered in Phase 84 or future):
- MainWindow wiring complete end-to-end (Phase 84: INT-01, INT-02, INT-03, INT-04)
- Human verification checklist (Phase 84: TST-04)
- UI updates when user changes checkboxes (Phase 82 already handled; Phase 84 verifies end-to-end)
- Tooltip explanations on checkboxes (Future: FUT-03)
- Visual warning when all unchecked (Future: FUT-02)
- Right-side modifier keys (explicitly excluded in REQUIREMENTS.md — AltGr conflict)

## Notes

**Why left-side VK codes only:** Phase 27 (v2.3) proved that `VK_MENU` (generic Alt key) matches AltGr on EU keyboards, causing false-positives. `VK_LMENU` (left Alt specifically) avoids this. Same logic applies to Ctrl and Shift — use `VK_LCONTROL` and `VK_LSHIFT` for consistency and to prevent future right-side ambiguity.

**Why AND logic (not OR):** Single-key sensitivity too high. Accidental Ctrl tap would keep widget visible. Requirement DET-03 explicitly says "ALL enabled modifiers held simultaneously". OR logic explicitly excluded in REQUIREMENTS.md Out of Scope table.

**Default configuration:** `UseCtrl=true, UseAlt=true, UseShift=false` (Phase 81). Preserves v2.3+ behavior for existing users upgrading from v4.2 to v4.3.

---

## Next Steps

**After this phase completes:**

1. `/clear` then `/gsd-plan-phase 83` — create detailed plan with TDD RED/GREEN splits
2. Phase 84: Integration — wire MainWindow event handlers + ApplySettings + ResetToDefaults + human verification checklist (INT-01 through INT-04, TST-04)
