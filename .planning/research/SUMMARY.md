# Project Research Summary

**Project:** FuzzyClock v4.3 Configurable Ghost Override
**Domain:** WPF desktop widget settings persistence and modifier key detection
**Researched:** 2026-05-07
**Confidence:** HIGH

## Executive Summary

This milestone adds user-configurable modifier keys for the Ghost Mode override feature (currently hardcoded as Ctrl+Alt). Research confirms **zero new dependencies required** — the entire feature uses existing capabilities validated in production: WPF CheckBox controls (present in Settings since v3.2), Win32 `GetAsyncKeyState` P/Invoke (used since v2.3), and `AppSettings` init-property record persistence (established in v1.1).

The recommended approach follows proven v4.2 Phase 78 patterns: three independent bool fields in `AppSettings` with explicit init-property defaults (UseCtrl=true, UseAlt=true, UseShift=false), three checkboxes in Settings > Behavior indented under Ghost Mode, immediate persistence via event handlers, and dynamic runtime detection in `GhostModeController.IsCtrlAltHeld()`. All eight possible modifier combinations (2³) have clear semantics — all-unchecked disables override (ghost always activates), and any other combination requires all enabled modifiers to be held simultaneously (AND logic, not OR).

The primary risk is **checkbox state corruption during PopulateControls()** if `_suppressEvents` guard is omitted, causing Settings UI to overwrite persisted values on every open. Secondary risks include VK code mapping mismatches (left-side-only VK_LCONTROL/VK_LMENU/VK_LSHIFT must be clearly communicated via "Left Ctrl"/"Left Alt"/"Left Shift" labels to prevent scope creep) and forgetting to update `GhostModeController` immediately when settings change. All risks have established mitigation patterns from prior phases.

## Key Findings

### Recommended Stack

**Zero new dependencies.** The existing v4.2 stack handles all v4.3 requirements.

**Core technologies:**
- **WPF CheckBox controls** — Settings UI checkboxes with Checked/Unchecked event wiring
- **Win32 GetAsyncKeyState P/Invoke** — Keyboard state detection with 0x8000 high-bit mask
- **AppSettings init-property record** — JSON persistence with explicit init defaults
- **MSTest 4.0.1** — Test coverage for serialization and modifier logic matrix

### Expected Features

**Must have (table stakes):**
- Independent checkboxes for each modifier (Ctrl/Alt/Shift)
- Default configuration preserved on upgrade (UseCtrl=true, UseAlt=true, UseShift=false)
- Immediate persistence feedback (no Apply button)
- Clear label describing purpose
- Disable option (all unchecked = override disabled)
- Reset to Defaults restores Ctrl+Alt

**Defer (anti-features):**
- Custom key picker (scope creep)
- OR logic (single-key sensitivity issue)
- Right-side modifier keys (AltGr conflicts)
- Win key support (Start menu conflicts)

### Architecture Approach

Three-layer data flow:
1. **Settings persistence layer** — AppSettings + SettingsSnapshot + SettingsService
2. **Settings UI layer** — SettingsWindow indented sub-panel with 3 CheckBoxes
3. **Runtime detection layer** — GhostModeController with config-driven VK routing

**Major components:**
1. **AppSettings + SettingsSnapshot** — 3 bool fields with init defaults (true/true/false)
2. **SettingsWindow** — GhostOverridePanel with 3 CheckBoxes and _suppressEvents guard
3. **MainWindow** — Event wiring with immediate persistence
4. **GhostModeController** — IsModifierHeld() with AND logic for enabled modifiers

### Critical Pitfalls

1. **Checkbox state corruption** — Forget `_suppressEvents` guard → PopulateControls() overwrites settings
2. **VK code mapping mismatch** — Use "Left Ctrl/Alt/Shift" labels to prevent scope creep to right-side keys
3. **All-unchecked undefined** — Lock semantics: all-false = override disabled
4. **GetAsyncKeyState mask** — Must use `& 0x8000` not `!= 0` to check currently-pressed state
5. **Settings migration** — Explicit init defaults required for v4.2 upgrade compatibility

## Implications for Roadmap

Suggested phase structure with **4 phases** (Phase 2 and 3 can overlap):

### Phase 1: Data Flow (Foundation)
**Rationale:** Persistence schema must be established first

**Delivers:** 
- 3 bool fields in AppSettings with init defaults
- SettingsSnapshot extension
- MSTest round-trip + absent-field tests

**Avoids:** Pitfall 5 (settings migration)

---

### Phase 2: Runtime Detection (Controller)
**Rationale:** Refactor before UI exists; can run parallel with Phase 3

**Delivers:**
- ModifierConfig struct
- IsModifierHeld() refactor with AND logic
- 6 MSTest unit tests

**Avoids:** Pitfall 3 and 4 (all-false semantics, 0x8000 mask)

---

### Phase 3: Settings UI (Wiring)
**Rationale:** UI layer can build in parallel with Phase 2

**Delivers:**
- GhostOverridePanel XAML with 3 CheckBoxes
- Labels "Left Ctrl", "Left Alt", "Left Shift"
- 3 events with _suppressEvents guards

**Avoids:** Pitfall 1 and 2 (state corruption, VK mapping)

---

### Phase 4: MainWindow Integration (End-to-End)
**Rationale:** Integration layer requires all prior phases complete

**Delivers:**
- Event subscriptions with immediate persistence
- ResetToDefaults extension
- Human verification checklist (29 items)

**Avoids:** Pitfall 7 and 8 (ResetToDefaults omission, stale controller)

---

### Phase Ordering Rationale

- Phase 1 is foundation for all other layers
- Phase 2 and 3 have zero dependencies on each other
- Phase 4 wires all three layers together
- All phases use proven patterns from production code

### Research Flags

**All phases use standard patterns (skip research-phase):**
- Phase 1: AppSettings init-property pattern (30+ existing fields)
- Phase 2: GetAsyncKeyState pattern (validated v2.3)
- Phase 3: Indented sub-panel pattern (Phase 69, Phase 78)
- Phase 4: Immediate persistence pattern (Phase 78)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all capabilities in production |
| Features | HIGH | Table-stakes match Windows app conventions |
| Architecture | HIGH | Three-layer data flow matches v4.2 patterns |
| Pitfalls | HIGH | All have codebase evidence and mitigation patterns |

**Overall confidence:** HIGH

### Gaps to Address

**No unresolved gaps.** The following were explicitly scoped out:

- Right-side modifier keys — Deferred (AltGr conflicts)
- Win key support — Deferred (Start menu conflicts)
- OR logic — Rejected (single-key sensitivity)
- Custom key picker — Rejected (scope creep)

**Validation during execution:**
- EU keyboard layout testing (UK/DE/FR/PL)
- DPI scaling verification (100%/150%/200%)
- v4.2 upgrade path unit tests

## Sources

### Primary (HIGH confidence)
- FuzzyClock codebase (GhostModeController.cs, SettingsWindow.xaml.cs, SettingsService.cs, PROJECT.md)
- Microsoft Learn: GetAsyncKeyState API, Virtual-Key Codes
- WPF CheckBox documentation
- .NET init-property records with System.Text.Json

### Secondary (MEDIUM confidence)
- NN/G: UI Copy Guidelines
- VS Code keybindings documentation
- Stack Overflow: Keyboard shortcuts best practices

---
*Research completed: 2026-05-07*  
*Ready for roadmap: yes*
