# Feature Landscape

**Domain:** Configurable hotkey/modifier UI for desktop widget ghost mode override
**Researched:** 2026-05-07

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Independent checkboxes for each modifier (Ctrl/Alt/Shift) | Standard pattern across Windows apps (PowerToys, VS Code, OBS Studio); users expect granular control over combinations | Low | Three checkboxes; validation logic for "all unchecked = disabled" state |
| Default configuration preserved on upgrade | Existing users with hardcoded Ctrl+Alt expect that behavior to persist | Low | Settings.json default: UseCtrl=true, UseAlt=true, UseShift=false |
| Visual persistence feedback | Setting must save immediately without Apply/OK button (matches existing Settings window modeless pattern) | Low | Already established pattern in SettingsWindow |
| Clear label describing what the modifiers do | Users must understand that these keys suppress ghost mode when held while hovering | Low | Label text: "Hold these keys to keep widget visible:" or similar |
| Disable option (uncheck all) | Power users may want ghost mode without any keyboard override | Low | All three false = IsCtrlAltHeld returns false |
| Reset to Defaults restores Ctrl+Alt | Matches existing ResetToDefaults() pattern for all other settings | Low | Reset: UseCtrl=true, UseAlt=true, UseShift=false |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live visual feedback during configuration | Show real-time "Active combination: Ctrl+Alt" text below checkboxes as user toggles them | Medium | Requires UpdateActiveCombinationDisplay() helper; enhances confidence that setting worked |
| Tooltips on each checkbox | Hover tooltip explains role of each modifier: "Ctrl: Control key", "Alt: Alt/Option key", "Shift: Shift key" | Low | Reduces cognitive load for non-power users unfamiliar with modifier terminology |
| Warning icon when all unchecked | Visual indicator that override is disabled when all three are off | Low | Small warning icon + text "Override disabled — ghost always activates" |
| Human-readable display in Settings | Show "Ctrl + Alt" or "Ctrl + Shift" as formatted text (not just checkboxes) | Medium | Provides confirmation of active combination in prose form |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom key picker (e.g., "Press keys to record") | Scope creep — modifier override is a simple gate, not arbitrary hotkey rebinding; custom keys (like "H" or "F1") conflict with normal typing/usage patterns | Stick to Ctrl/Alt/Shift only; these are universally recognized as non-typing modifiers |
| "None" radio button alongside checkboxes | Mixing radio and checkbox paradigms is confusing UX; "none" is already represented by unchecking all three | Use checkboxes only; all-unchecked state is self-evident |
| Separate enable/disable master toggle | Adds unnecessary hierarchy; "all unchecked" already disables the override cleanly | No master toggle — checkboxes are the direct control |
| Per-modifier strength/priority | Overcomplicated; users expect logical AND (all checked modifiers must be held), not weighted combinations | Simple AND logic: all checked modifiers must be held simultaneously |
| Global hotkey registration (works when widget not focused) | Ghost override is hover-based; GetAsyncKeyState already works globally; registering system-wide hotkeys is overkill and can conflict with other apps | Continue using GetAsyncKeyState polling in GhostModeController |
| Key recording/detection mode | Users don't need to "press the combination" to test it — live hover behavior is the test | Real-world hover testing is sufficient feedback |

## Feature Dependencies

```
AppSettings fields (UseCtrl/Alt/Shift) → GhostModeController.IsCtrlAltHeld() logic
SettingsWindow checkboxes → Three events (UseCtrlChanged/UseAltChanged/UseShiftChanged)
Event handlers → MainWindow wiring → persist to settings.json
ResetToDefaults() → restore Ctrl+Alt default
```

## MVP Recommendation

Prioritize:
1. Three checkboxes (Ctrl/Alt/Shift) in Settings > Behavior
2. Independent bool fields in AppSettings (UseCtrl/Alt/Shift)
3. GhostModeController reads config and checks GetAsyncKeyState for enabled combination
4. All unchecked = override disabled (IsCtrlAltHeld always returns false)
5. ResetToDefaults restores Ctrl+Alt
6. Label: "Hold these keys to keep widget visible:"

Defer:
- Live combination text display below checkboxes (nice-to-have, not critical for functionality)
- Warning icon when all unchecked (cosmetic enhancement)
- Tooltips on each checkbox (self-documenting labels sufficient)

## Research Confidence

| Area | Level | Sources |
|------|-------|---------|
| Checkbox pattern for multi-modifier selection | HIGH | Microsoft Learn keyboard UI guidelines, NN/G shortcut UX guidelines, VS Code/PowerToys patterns |
| Independent bool fields over bitmask | MEDIUM | Common C# pattern for 3–5 boolean flags; simpler than bit manipulation |
| All-unchecked = disable pattern | HIGH | WordPress Trac #21414, Windows 10 keyboard shortcut disable patterns, UI toggle examples |
| Default preservation on upgrade | HIGH | Existing FuzzyClock settings.json init-property pattern established in v1.1+ |

## Patterns from Real-World Apps

### PowerToys Keyboard Manager (Microsoft)
- Key remapping UI uses dropdown selectors per key (not checkboxes)
- Not directly applicable — PowerToys is full key rebinding, not modifier-only configuration

### VS Code Keybindings
- JSON-based configuration, no GUI for modifier selection
- Keyboard Shortcuts editor shows combinations as text (e.g., "Ctrl+Shift+P")
- Teaches: Display active combination as formatted text for clarity

### Windows Settings (Accessibility > Keyboard)
- Checkbox pattern for "Allow the shortcut key to start [Feature]"
- Teaches: Single checkbox to enable/disable entire shortcut; our use case needs per-modifier granularity

### OBS Studio Hotkeys
- Text field where user presses the key combination to record it
- Not applicable — recording arbitrary keys is overkill for 3-modifier configuration

### WordPress "Enable keyboard shortcuts" (Trac #21414)
- Single checkbox to enable/disable all custom shortcuts
- Teaches: Master toggle pattern; we prefer direct per-modifier control instead

## Implementation Notes

**Checkbox placement:** Settings > Behavior tab, below "Ghost fade radius" slider (existing proximity fade setting is logically adjacent)

**Visual grouping:** Indent checkboxes under a section label "Ghost Override Modifiers" or "Hover Override Keys" to group them as a related set

**Label text:** Clear, action-oriented — "Hold these keys to keep widget visible:" explains the purpose immediately

**Default state:** Ctrl ✓, Alt ✓, Shift ☐ — mirrors existing hardcoded Ctrl+Alt behavior

**Validation:** No red-error state needed; all-unchecked is valid (disables override, which is a legitimate choice)

**Persistence:** Immediate save on checkbox toggle (matches existing SettingsWindow event → MainWindow → SaveSettings() pattern)

**Testing:** Cover all 8 permutations (2^3) — ensure GetAsyncKeyState logic handles all combinations correctly

**Complexity assessment:** LOW overall — three bool fields, three checkboxes, three events, one logic update in GhostModeController.IsCtrlAltHeld()

## Sources

- Microsoft Learn: Guidelines for Keyboard User Interface Design (https://learn.microsoft.com/en-us/previous-versions/windows/desktop/dnacc/guidelines-for-keyboard-user-interface-design) — MEDIUM confidence (archived 2018 doc)
- NN/G: UI Copy: UX Guidelines for Command Names and Keyboard Shortcuts (https://www.nngroup.com/articles/ui-copy/) — HIGH confidence (2024)
- Stack Overflow: Best practices for designing keyboard shortcuts (https://stackoverflow.com/questions/4173707/best-practices-for-designing-keyboard-shortcuts) — LOW confidence (community-sourced, no date)
- VS Code: Keyboard shortcuts documentation (https://code.visualstudio.com/docs/configure/keybindings) — HIGH confidence (official docs)
- WordPress Trac #21414: Use checkbox to turn on/off all custom shortcuts (https://core.trac.wordpress.org/ticket/21414) — MEDIUM confidence (real-world implementation reference)
- CSS-Tricks: Radio Buttons Are Like Selects; Checkboxes Are Like Multiple Selects (https://css-tricks.com/radio-buttons-are-like-selects-checkboxes-are-like-multiple-selects/) — HIGH confidence (fundamental UX pattern)
