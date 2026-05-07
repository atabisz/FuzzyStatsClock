# Requirements: FuzzyStatsClock v4.3

**Defined:** 2026-05-07
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

Requirements for v4.3 release. Each maps to roadmap phases.

### Configuration Schema

- [ ] **CFG-01**: AppSettings has three bool fields (UseCtrl, UseAlt, UseShift) with init-property defaults (true, true, false)
- [ ] **CFG-02**: SettingsSnapshot carries three bool fields matching AppSettings modifier configuration
- [ ] **CFG-03**: Settings persist to settings.json and restore on launch preserving all three modifier states
- [ ] **CFG-04**: Absent fields in v4.2 settings.json deserialize with init defaults (true, true, false) — backward-compatible upgrade

### Settings UI

- [ ] **UI-01**: Settings > Behavior tab has indented sub-panel below Ghost Mode controls with label "Hold these keys to keep widget visible:"
- [ ] **UI-02**: Sub-panel contains three checkboxes labeled "Left Ctrl", "Left Alt", "Left Shift" (emphasizing left-side-only VK codes)
- [ ] **UI-03**: Sub-panel enabled only when Ghost Mode is enabled (gated by ChkGhostMode.IsChecked)
- [ ] **UI-04**: Each checkbox fires an event on check/uncheck with immediate persistence to settings.json
- [ ] **UI-05**: PopulateControls and RefreshControls set checkbox states with `_suppressEvents` guard to prevent settings corruption

### Runtime Detection

- [ ] **DET-01**: GhostModeController has IsModifierHeld method that checks configured modifiers via GetAsyncKeyState
- [ ] **DET-02**: When all three modifiers are unchecked, IsModifierHeld always returns false (override disabled)
- [ ] **DET-03**: When one or more modifiers are checked, IsModifierHeld returns true only when ALL enabled modifiers are held simultaneously (AND logic, not OR)
- [ ] **DET-04**: GetAsyncKeyState checks use `& 0x8000` high-bit mask (currently-pressed), not low-bit (toggle-since-last-call)
- [ ] **DET-05**: Left-side virtual key codes are used: VK_LCONTROL (0xA2), VK_LMENU (0xA4), VK_LSHIFT (0xA0) — prevents AltGr false-positives on EU keyboards

### Integration

- [ ] **INT-01**: MainWindow subscribes to three modifier checkbox events in OpenSettings
- [ ] **INT-02**: Each event handler immediately persists via `_settings = _settings with { UseX = v }; SaveSettings();` pattern
- [ ] **INT-03**: MainWindow passes modifier configuration to GhostModeController on startup via ApplySettings
- [ ] **INT-04**: ResetToDefaults restores UseCtrl=true, UseAlt=true, UseShift=false and refreshes open Settings window if present

### Testing

- [ ] **TST-01**: MSTest round-trip test verifies AppSettings serializes/deserializes all three modifier bools correctly
- [ ] **TST-02**: MSTest absent-field test verifies v4.2 settings.json (missing UseCtrl/UseAlt/UseShift) deserializes with init defaults
- [ ] **TST-03**: MSTest unit tests verify IsModifierHeld logic for all 8 combinations (2³) including all-false = always-false
- [ ] **TST-04**: Human verification checklist covers: checkbox state persistence, Reset to Defaults, all-unchecked behavior, modifier combination matrix (Ctrl-only, Alt-only, Shift-only, Ctrl+Alt, Ctrl+Shift, Alt+Shift, all three), Ghost Mode master toggle gating

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Future Enhancements

- **FUT-01**: Live display of active combination (e.g., "Active: Ctrl+Alt") below checkboxes
- **FUT-02**: Visual warning icon when all modifiers unchecked
- **FUT-03**: Tooltip explanations on each modifier checkbox
- **FUT-04**: Custom key picker (beyond modifier-only)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Right-side modifier keys | AltGr (right Alt) on EU keyboards synthesizes Ctrl+Alt in hardware — would reintroduce false-positive bug fixed in v2.3 |
| Win key support | Start menu intercepts Win key; ghost override would conflict with Windows shell shortcuts |
| OR logic (any-one-suffices) | Single-key sensitivity too high — accidental Ctrl tap would keep widget visible |
| Mouse button modifiers | Scope creep beyond keyboard; adds P/Invoke complexity for GetAsyncKeyState mouse codes |
| Recording custom hotkeys | Scope creep beyond modifier-only; key-picker UI pattern not validated in FuzzyClock |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CFG-01 | Phase 81 | Pending |
| CFG-02 | Phase 81 | Pending |
| CFG-03 | Phase 81 | Pending |
| CFG-04 | Phase 81 | Pending |
| UI-01 | Phase 82 | Pending |
| UI-02 | Phase 82 | Pending |
| UI-03 | Phase 82 | Pending |
| UI-04 | Phase 82 | Pending |
| UI-05 | Phase 82 | Pending |
| DET-01 | Phase 83 | Pending |
| DET-02 | Phase 83 | Pending |
| DET-03 | Phase 83 | Pending |
| DET-04 | Phase 83 | Pending |
| DET-05 | Phase 83 | Pending |
| INT-01 | Phase 84 | Pending |
| INT-02 | Phase 84 | Pending |
| INT-03 | Phase 84 | Pending |
| INT-04 | Phase 84 | Pending |
| TST-01 | Phase 81 | Pending |
| TST-02 | Phase 81 | Pending |
| TST-03 | Phase 83 | Pending |
| TST-04 | Phase 84 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-07*
*Last updated: 2026-05-07 after initial definition*
