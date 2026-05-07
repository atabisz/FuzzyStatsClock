# Phase 83: Runtime Detection — Discussion Log

**Date:** 2026-05-07
**Participants:** Alex (user), Seven (DA)

## Areas Discussed

### 1. Config Flow
**Question:** How should GhostModeController receive the modifier configuration?

**Options presented:**
- Constructor injection (3 bools passed at Initialize) — clean dependency, but config changes need controller replacement
- **Property setter (UpdateModifierConfig method)** ✓ SELECTED — instant config changes, no recreation
- Event subscription (MainWindow publishes changes) — decoupled, but adds another event handler

**Decision:** Property setter via new `UpdateModifierConfig(bool, bool, bool)` method. Settings window events trigger MainWindow handlers that call it directly.

**Rationale:** Config changes should be instant without controller lifecycle complexity. Matches Phase 82's immediate-persistence pattern.

---

### 2. Method Naming
**Question:** What should the refactored method be named?

**Options presented:**
- **IsModifierHeld() — generic, matches DET-01 spec** ✓ SELECTED
- IsOverrideHeld() — emphasizes ghost override purpose
- Keep IsCtrlAltHeld() — preserve call-site familiarity (misleading when Shift-only)

**Decision:** Rename `IsCtrlAltHeld()` → `IsModifierHeld()`. Aligns with requirement DET-01 naming. One call site changes.

**Rationale:** Generic name stays accurate regardless of which modifiers the user enables. Requirement explicitly calls it "IsModifierHeld".

---

### 3. All-False Behavior
**Question:** How should the all-false case (no modifiers enabled) behave?

**Options presented:**
- Always return false (DET-02 literal) — override disabled
- **Short-circuit in OnTimerTick — skip GetAsyncKeyState calls** ✓ SELECTED

**Decision:** When all three bools false, OnTimerTick skips IsModifierHeld() call entirely. Same user behavior (override disabled), fewer Win32 calls per tick.

**Implementation:**
```csharp
if (_useCtrl || _useAlt || _useShift)
{
    if (IsModifierHeld())
        ratio = 0.0;
}
// else: all false, no check needed
```

**Rationale:** Satisfies DET-02 ("always returns false") by never calling the method when disabled. Optimization avoids unnecessary P/Invoke overhead on 75ms timer.

---

### 4. VK Constants
**Question:** Should VK_LSHIFT (0xA0) be declared as a new const?

**Options presented:**
- **Yes — add VK_LSHIFT=0xA0 to existing VK block** ✓ SELECTED
- No — inline the literal 0xA0 in GetAsyncKeyState call

**Decision:** Add `VK_LSHIFT = 0xA0` to const block between VK_LCONTROL and VK_LMENU.

**Rationale:** Consistency with existing pattern. All three left-side codes in one place. DET-05 requirement satisfied.

---

### 5. Call Site Strategy
**Question:** Where should UpdateModifierConfig be called from MainWindow?

**Options presented:**
- In ApplySettings (centralized config application)
- In each modifier checkbox event handler (immediate)
- **Both — ApplySettings on startup + event handlers on change** ✓ SELECTED

**Decision:** ApplySettings for startup/reset path; event handlers for live changes.

**Implementation:**
- `ApplySettings()`: add `_ghostController.UpdateModifierConfig(_settings.UseCtrl, _settings.UseAlt, _settings.UseShift);` after GhostFadeRadiusPx line
- Event handlers: three new subscriptions in `OpenSettings()` — same pattern as Phase 82 checkbox handlers
- Pattern: `_settings = _settings with { UseX = v }; SaveSettings(); _ghostController.UpdateModifierConfig(...);`

**Rationale:** ApplySettings is centralized startup/reset config. Event handlers provide immediate propagation. Redundant but complete coverage.

---

### 6. Test Style
**Question:** Should unit tests use [DataRow] for all 8 combinations or individual [TestMethod]s?

**Options presented:**
- **[DataRow] x8 on one [TestMethod] — compact parametric** ✓ SELECTED
- 8 separate [TestMethod]s — explicit naming

**Decision:** Single test method with 8 DataRow attributes. Follows existing GhostModeController test pattern (ComputeProximityRatio has 12 DataRow tests).

**Test cases:**
1. `(false, false, false, false)` — all-false = always false
2. `(true, false, false, true)` — Ctrl-only enabled, Ctrl held = true
3. `(true, true, false, true)` — Ctrl+Alt enabled, both held = true
4. ...5 more combinations

**Rationale:** TST-03 says "verify all 8 combinations". Parametric DataRow matches existing test style. Compact, systematic.

---

### 7. Method Visibility
**Question:** Should IsModifierHeld be public or internal?

**Options presented:**
- Internal — test through ProximityChanged event (integration-style)
- **Public — direct unit testing** ✓ SELECTED

**Decision:** IsModifierHeld becomes **public** for direct unit testing.

**Rationale:** TST-03 says "unit tests". Direct calls easier than timer/event machinery. Tests verify logic without 75ms delays and ProximityChanged subscriptions.

---

## Deferred Ideas

None — all questions were about HOW to implement Phase 83 scope, not about NEW capabilities.

## Scope Boundaries Reinforced

- MainWindow wiring end-to-end → Phase 84 (INT-01 through INT-04)
- Human verification checklist → Phase 84 (TST-04)
- Tooltip explanations → Future (FUT-03)
- Visual warning when all unchecked → Future (FUT-02)
- Right-side modifier keys → Explicitly excluded (AltGr conflict per REQUIREMENTS.md)

---

**Session duration:** ~12 minutes
**Outcome:** All 7 gray areas resolved. CONTEXT.md written with locked decisions. Ready for `/gsd-plan-phase 83`.
