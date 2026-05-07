# Domain Pitfalls: Configurable Modifier Hotkeys in WPF

**Domain:** Adding configurable modifier checkbox UI + dynamic GetAsyncKeyState routing
**Researched:** 2026-05-07
**Confidence:** HIGH

## Critical Pitfalls

Mistakes that cause rewrites, regressions, or serious user-facing bugs.

---

### Pitfall 1: Checkbox State Corruption During PopulateControls

**What goes wrong:** Modifier checkboxes fire `Changed` events during `PopulateControls()`, triggering persistence writes with stale configuration values before the full snapshot is populated.

**Why it happens:** WPF CheckBox.IsChecked is a dependency property — setting it from code-behind fires the `Checked`/`Unchecked` events. The existing `_suppressEvents` guard pattern prevents this, but forgetting to check it in the new modifier handlers corrupts state.

**Consequences:**
- Settings.json writes partial configuration (e.g., only `UseCtrl=true` written, `UseAlt`/`UseShift` reverted to false)
- Causes user-configured combo to reset on next Settings window open
- AppSettings JSON has correct persisted values, but SettingsWindow handlers overwrite them

**Prevention:**
```csharp
// MANDATORY pattern in every new checkbox Changed handler
private void ChkGhostModCtrl_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;  // <-- MUST be first line
    GhostModifierCtrlChanged?.Invoke(ChkGhostModCtrl.IsChecked == true);
}
```

**Detection:** Unit test that calls `PopulateControls(snapshot)` twice with different values and verifies final persisted state matches the second snapshot, not a hybrid.

**Phase assignment:** Validate in settings UI phase, test in integration verification.

---

### Pitfall 2: VK Code Mapping Mismatch Between UI and Runtime

**What goes wrong:** Checkbox state maps to AppSettings bools (`UseCtrl`, `UseAlt`, `UseShift`), but runtime `IsCtrlAltHeld()` logic maps to different VK codes than the UI implies.

**Why it happens:** Three sources of truth diverge:
1. **UI labels** — "Ctrl", "Alt", "Shift" suggest left-or-right keys
2. **AppSettings field names** — `UseCtrl` ambiguous (left-only? both?)
3. **Runtime VK checks** — hardcoded `VK_LCONTROL`/`VK_LMENU` (left-only) in existing code

**Consequences:**
- User enables "Ctrl" checkbox expecting left+right Ctrl to work; only left Ctrl works
- User tests with right Alt (RMenu) on EU keyboard; override fails silently
- GitHub issue: "Shift doesn't work" — user holds right Shift, code checks left Shift

**Prevention:**
- **Canonical decision:** Preserve existing left-only behavior (`VK_LCONTROL=0xA2`, `VK_LMENU=0xA4`, `VK_LSHIFT=0xA0`)
- **UI precision:** Checkbox labels must say "Left Ctrl", "Left Alt", "Left Shift" (not "Ctrl", "Alt", "Shift")
- **Comment documentation:** AppSettings fields documented as left-only in triple-slash comments
- **Help text:** Settings UI includes "Left-side modifier keys only" help TextBlock below checkboxes

**Detection:** Human verification checklist item: "Hold right Shift → confirm override does NOT activate".

**Phase assignment:** Settings UI phase must lock labels as "Left Ctrl" / "Left Alt" / "Left Shift" to prevent requirement scope creep.

---

### Pitfall 3: All-Unchecked = Undefined Behavior

**What goes wrong:** User unchecks all three modifier checkboxes. Runtime logic encounters undefined state — does it mean "disabled" or "always active" or "last-known config"?

**Why it happens:** Three-checkbox UI naturally allows the empty set. Code must decide semantic meaning:
- **Option A:** All-false = override disabled (ghost always activates, no keyboard bypass)
- **Option B:** All-false = invalid state (force at least one enabled via UI disable)
- **Option C:** All-false = falls back to hardcoded Ctrl+Alt default

**Consequences (if not decided up-front):**
- Ambiguous requirement → executor implements Option A, user expects Option C
- Later phase rewrites runtime logic to change semantics → breaking change
- Or: executor forgets to handle all-false entirely → `IsCtrlAltHeld()` returns false on every call, ghost never activates even without modifiers held

**Prevention:**
- **Lock semantics now:** All-false = override disabled (IsCtrlAltHeld always returns false). Documented as GHOST-OVERRIDE-01 requirement.
- **UI affordance (optional):** Help text "Uncheck all to disable keyboard override" below checkboxes
- **Validate() guard:** Not needed — all-false is a valid semantic state, not corruption
- **Unit test coverage:** Test case `UseCtrl=false, UseAlt=false, UseShift=false → IsCtrlAltHeld() returns false regardless of GetAsyncKeyState`

**Detection:** Test matrix includes row `[false, false, false] → override inactive`.

**Phase assignment:** Requirements phase must lock all-false semantics; test phase must verify it.

---

### Pitfall 4: GetAsyncKeyState Return Value Misread (0x8000 Mask)

**What goes wrong:** New dynamic logic checks `GetAsyncKeyState(vk) != 0` instead of `(GetAsyncKeyState(vk) & 0x8000) != 0`.

**Why it happens:** Cargo-culting from WinForms P/Invoke examples that don't explain bit semantics. GetAsyncKeyState returns `short` with two independent signals:
- **High bit (0x8000):** Key currently pressed right now
- **Low bit (0x0001):** Key was toggled (pressed-and-released) since last call

Checking `!= 0` includes the low bit → false-positive if key was tapped-then-released before hover but is not currently held.

**Consequences:**
- Ghost override activates when Ctrl *was* tapped 5 seconds ago but is not currently held
- Intermittent: only triggers if user tapped Ctrl/Alt/Shift earlier in the session
- Hard to reproduce: requires exact key-press history leading up to hover

**Prevention:**
- **Existing pattern preservation:** Codebase already uses `& 0x8000` at GhostModeController.cs:184-185
- **Code review gate:** Every `GetAsyncKeyState(...)` call must have `& 0x8000` mask
- **Comment on new dynamic check:**
  ```csharp
  // High bit (0x8000) = currently pressed; low bit (0x0001) = toggled since last call
  bool isPressed = (GetAsyncKeyState(vk) & 0x8000) != 0;
  ```

**Detection:** Static analysis — grep for `GetAsyncKeyState.*!= 0` without `& 0x8000`.

**Phase assignment:** Code implementation phase; caught in PR review or pre-commit hook.

---

### Pitfall 5: AltGr False-Positive When User Enables Generic "Alt"

**What goes wrong:** If future scope creep introduces left+right Alt support, using `VK_MENU` (0x12, generic Alt) triggers on AltGr (right Alt) on EU keyboards. AltGr synthesizes `VK_LCONTROL + VK_RMENU` in hardware — `GetAsyncKeyState(VK_MENU)` returns true when user types AltGr+key combo (e.g., `@` on UK layout, `€` on DE layout).

**Why it happens:** Windows keyboard stack maps AltGr → simultaneous left Ctrl + right Alt. Generic VK codes (`VK_CONTROL`, `VK_MENU`) match *either* side. If code checks `VK_LCONTROL & VK_MENU`, AltGr typing triggers both.

**Consequences:**
- User typing `@` symbol on UK keyboard inadvertently suppresses ghost mode
- French/German/Polish users report "ghost override activates randomly while typing"
- GitHub issue closed as "works on my machine" (US keyboard developer cannot reproduce)

**Prevention:**
- **Locked requirement:** Left-side only (`VK_LCONTROL`, `VK_LMENU`, `VK_LSHIFT`). No generic VK codes.
- **Checkbox labels enforce:** "Left Ctrl", "Left Alt", "Left Shift" prevent scope creep requests
- **Validation barrier:** If future milestone adds "Both Sides" UI option, require dedicated research phase on AltGr handling

**Detection:** Human verification on EU keyboard layout (UK, DE, FR, PL) — type AltGr+key combos while hovering → ghost must activate normally, not suppress.

**Phase assignment:** Out-of-scope for v4.3 (locked in requirements); flagged for future milestone if ever requested.

---

## Moderate Pitfalls

Correctness bugs or poor UX, but recoverable without rewrite.

---

### Pitfall 6: Settings Migration Loses User's Existing Ctrl+Alt Preference

**What goes wrong:** Upgrading from v4.2 (hardcoded Ctrl+Alt) to v4.3 (configurable) with no migration path causes one of two failure modes:
- **Mode A:** User's settings.json is missing `UseCtrl`/`UseAlt`/`UseShift` → fields deserialize as C# bool default `false` → all-false state → override disabled → user cannot suppress ghost with Ctrl+Alt anymore
- **Mode B:** Init-property defaults set to `UseCtrl=true, UseAlt=true, UseShift=false` → correct default, but no way to distinguish "v4.2 upgrade never saw Settings UI" from "v4.3 user explicitly unchecked Shift"

**Why it happens:** AppSettings is an init-property record. Absent JSON fields take init-property values, not C# type defaults. If init defaults are not set, C# bool default `false` applies.

**Consequences:**
- v4.2 users upgrade → Ctrl+Alt stops working → "v4.3 broke my workflow"
- Or: v4.2 user who never opens Settings UI has different effective config than v4.3 fresh install → non-deterministic behavior

**Prevention:**
```csharp
// AppSettings.cs — MANDATORY init-property defaults
public bool UseCtrl { get; init; } = true;   // v4.2 compat default
public bool UseAlt  { get; init; } = true;   // v4.2 compat default
public bool UseShift { get; init; } = false; // v4.2 compat default
```

**Validation:** Not needed in `SettingsService.Validate()` — all-false is semantically valid (override disabled). If a corrupted settings.json has `"UseCtrl":"banana"`, System.Text.Json throws during deserialization → caught by outer `try/catch` in `Load()` → falls back to `Defaults()`.

**Detection:**
- Unit test: Deserialize v4.2 settings.json (no UseCtrl/UseAlt/UseShift fields) → verify result has `UseCtrl=true, UseAlt=true, UseShift=false`
- Round-trip test already covers this (STEST-01 pattern)

**Phase assignment:** AppSettings schema phase; validation in test phase.

---

### Pitfall 7: ResetToDefaults() Omits Modifier Fields

**What goes wrong:** User clicks "Reset to Defaults" in Settings UI. `ResetToDefaults()` resets accent color, opacity, font size, clock style, stats visibility... but forgets to reset `UseCtrl`/`UseAlt`/`UseShift`. Next open, modifier checkboxes show user's old values, not defaults.

**Why it happens:** `ResetToDefaults()` in MainWindow.xaml.cs enumerates every AppSettings field explicitly. Adding new fields requires updating this method. Easy to forget during implementation.

**Consequences:**
- User resets to defaults → expects Ctrl+Alt → sees their custom Shift-only config still active
- Confusing UX: "Reset to Defaults" is not idempotent
- Not a data-loss bug (just missed a reset path)

**Prevention:**
```csharp
// MainWindow.xaml.cs ResetToDefaults() — add after GhostFadeRadiusPx reset
_settings = _settings with
{
    // ... existing resets ...
    GhostFadeRadiusPx = 80,
    UseCtrl  = true,   // <-- NEW
    UseAlt   = true,   // <-- NEW
    UseShift = false,  // <-- NEW
};
SaveSettings();
```

After persist, call `_settingsWindow?.RefreshControls(GetCurrentSettingsSnapshot())` so checkboxes update immediately if window is open.

**Detection:**
- Human verification checklist: Open Settings → set Shift-only → close → Reset to Defaults → reopen Settings → verify Ctrl+Alt checkboxes are on, Shift is off
- Or: Unit test that calls ResetToDefaults, reads _settings, asserts modifier fields match `Defaults()`

**Phase assignment:** Settings UI wiring phase; caught in human-verify or audit phase.

---

### Pitfall 8: Runtime Modifier Check Does Not Match Persisted State

**What goes wrong:** User changes modifier config in Settings UI → event fires → `_settings with { UseCtrl = v }` → `SaveSettings()` → disk updated. BUT `GhostModeController.IsCtrlAltHeld()` is not updated with the new config. Next hover, it still checks the old hardcoded VK codes or a stale config snapshot.

**Why it happens:** Separation of concerns — MainWindow owns `_settings`, GhostModeController is a separate instance with no direct `_settings` reference. If GhostModeController caches VK codes at construction time and never re-reads config, it becomes stale.

**Consequences:**
- User enables Shift-only → Settings window shows Shift checked → SaveSettings writes to disk → hover still requires Ctrl+Alt
- Only fixed by app restart (when GhostModeController re-initializes from fresh settings.json)
- Feels like Settings UI is broken

**Prevention (Architecture Decision Required):**

**Option A — Pass config to IsCtrlAltHeld on every call:**
```csharp
// GhostModeController.cs
public bool IsCtrlAltHeld(bool useCtrl, bool useAlt, bool useShift)
{
    if (!useCtrl && !useAlt && !useShift) return false; // all-false = disabled
    bool ctrlMatch = !useCtrl || (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0;
    bool altMatch  = !useAlt  || (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;
    bool shiftMatch = !useShift || (GetAsyncKeyState(VK_LSHIFT)  & 0x8000) != 0;
    return ctrlMatch && altMatch && shiftMatch;
}

// MainWindow.xaml.cs ProximityChanged callback
bool modHeld = _ghostModeController.IsCtrlAltHeld(
    _settings.UseCtrl, _settings.UseAlt, _settings.UseShift);
```

**Option B — Reactive config update method on controller:**
```csharp
// GhostModeController.cs
private bool _useCtrl = true;
private bool _useAlt = true;
private bool _useShift = false;

public void UpdateModifierConfig(bool useCtrl, bool useAlt, bool useShift)
{
    _useCtrl = useCtrl;
    _useAlt = useAlt;
    _useShift = useShift;
}

// MainWindow event handler
GhostModifierCtrlChanged += (enabled) =>
{
    _settings = _settings with { UseCtrl = enabled };
    SaveSettings();
    _ghostModeController.UpdateModifierConfig(
        _settings.UseCtrl, _settings.UseAlt, _settings.UseShift);
};
```

**Recommendation:** Option A (stateless controller). Matches existing codebase pattern — `GhostModeController.IsEnabled` is gated by external flag from MainWindow, not internal state.

**Detection:** Human verification item: "Change modifiers in Settings → close Settings → hover with new combo → verify override activates without restart".

**Phase assignment:** GhostModeController refactor phase; must be decided before implementation starts.

---

### Pitfall 9: Checkbox Logic Inversion (All Must Be Held vs Any Must Be Held)

**What goes wrong:** Ambiguous requirement interpretation — does "Ctrl + Alt + Shift enabled" mean:
- **AND logic:** User must hold Ctrl AND Alt AND Shift simultaneously
- **OR logic:** User can hold Ctrl OR Alt OR Shift (any one suffices)

**Why it happens:** English "and" is ambiguous. "Enable Ctrl and Alt" could mean "both required" or "both allowed". If requirements doc says "user can configure Ctrl, Alt, and Shift" without specifying boolean logic, executor guesses.

**Consequences:**
- Executor implements OR logic (any one held → suppress)
- User expects AND logic (all enabled must be held → suppress)
- OR logic makes single-key Shift override too sensitive (Shift pressed accidentally)
- AND logic makes three-key Ctrl+Alt+Shift override unusable (requires two hands)

**Prevention:**
- **Lock semantics now (HIGH priority):**
  - **Selected logic:** AND (all enabled checkboxes must be held simultaneously)
  - **Rationale:** Matches existing Ctrl+Alt behavior (both required). Single-modifier sensitivity would make Shift-only override trigger on every Shift keypress during typing.
  - **Requirement:** GHOST-OVERRIDE-02: "All enabled modifiers must be held simultaneously to suppress ghost mode"

- **Code clarity:**
  ```csharp
  // Explicit AND logic in IsCtrlAltHeld
  bool ctrlOk  = !useCtrl  || IsKeyPressed(VK_LCONTROL);
  bool altOk   = !useAlt   || IsKeyPressed(VK_LMENU);
  bool shiftOk = !useShift || IsKeyPressed(VK_LSHIFT);
  return ctrlOk && altOk && shiftOk;
  // Translation: each enabled modifier must be pressed; disabled modifiers pass automatically
  ```

**Detection:** Test matrix includes rows `[true,false,false] + Ctrl held → true`, `[true,false,false] + Alt held → false`.

**Phase assignment:** Requirements phase must lock AND vs OR before planning.

---

### Pitfall 10: Timing Race Between Settings Change and GhostModeController Tick

**What goes wrong:** User changes modifier config in Settings UI while hovering near the widget. GhostModeController timer fires its 75ms tick at the same moment. Race condition:
1. UI thread: `_settings = _settings with { UseCtrl = false }`
2. Controller thread: `IsCtrlAltHeld(_settings.UseCtrl, ...)` reads mid-update
3. Stale config or torn read (though C# bool is atomic, the three-field struct is not)

**Why it happens:** GhostModeController runs a DispatcherTimer on the UI thread (not background thread). No race with _settings mutation. But if future refactor moves controller to background thread, reads become unsafe.

**Consequences (if background-threaded):**
- Intermittent: ghost activates when it shouldn't or vice-versa
- Only visible during Settings window open + hover + rapid checkbox toggling
- Hard to reproduce in testing

**Prevention:**
- **Current architecture:** GhostModeController.OnTimerTick is DispatcherTimer → runs on UI thread → no lock needed
- **Future-proofing:** If ever refactored to background thread, document that `_settings` must be read via `Dispatcher.Invoke` or locked
- **Not a v4.3 concern** — no background threading planned

**Detection:** Not applicable (no concurrency in current design). If architecture changes, add lock or Dispatcher.Invoke.

**Phase assignment:** Out-of-scope for v4.3. Flag in architecture notes if threading changes.

---

## Minor Pitfalls

Polish issues, no functional breakage.

---

### Pitfall 11: Settings UI Layout Breaks When Help Text Wraps

**What goes wrong:** Three checkboxes + help text added to Behavior tab. Help text is long ("Left-side modifier keys only. Uncheck all to disable keyboard override."). At narrow window width or large font DPI, text wraps awkwardly, pushing checkboxes off-screen or overlapping controls.

**Why it happens:** WPF TextBlock with `TextWrapping="Wrap"` adapts to container width, but if the container (StackPanel) is not width-constrained, wrapping fails. Or Grid column definitions are hardcoded `Width="250"`, causing overflow at high DPI.

**Consequences:**
- Not a functional bug — settings still save/load correctly
- Poor UX on 4K monitors or accessibility large-text mode
- User cannot see all three checkboxes without scrolling

**Prevention:**
- **StackPanel + MaxWidth:** Wrap checkboxes in a StackPanel with `MaxWidth="320"` to constrain layout
- **Help TextBlock:** `TextWrapping="Wrap"`, `Foreground="#FF999999"`, `FontSize="11"` (matches TEMP-TAB-03 pattern)
- **Manual verification:** Test at 100%, 150%, 200% DPI scaling in Windows display settings

**Detection:** Human verification checklist item: "Open Settings at 150% DPI → verify modifier checkboxes and help text visible without scrolling".

**Phase assignment:** Settings UI phase; caught in visual review.

---

### Pitfall 12: Confusing Help Text Phrasing

**What goes wrong:** Help text says "Hold these keys to prevent ghost mode" — user interprets as "hold these keys to keep ghost mode ON" (opposite intended meaning).

**Why it happens:** "Prevent ghost mode" is ambiguous — prevent activation or prevent deactivation? Natural English is hard.

**Consequences:**
- User confusion → support request or GitHub issue
- Not a data-loss bug, just requires better copy

**Prevention:**
- **Recommended phrasing:** "Hold selected modifiers to keep the widget visible while hovering (suppresses auto-hide)"
- **Or shorter:** "Hold modifiers to suppress auto-hide"
- **Avoid:** "prevent ghost mode", "disable ghost", "override ghost" (all ambiguous)

**Detection:** User study or A/B test (out of scope). Rely on clear requirements doc wording.

**Phase assignment:** Requirements phase locks help text; implemented in Settings UI phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| AppSettings schema | Missing init-property defaults on UseCtrl/UseAlt/UseShift → v4.2 upgrades break | Set `= true/true/false` in AppSettings record |
| Settings UI XAML | Checkbox labels say "Ctrl" not "Left Ctrl" → user expects right-side keys to work | Lock labels as "Left Ctrl", "Left Alt", "Left Shift" in XAML |
| Settings UI wiring | Forget `if (_suppressEvents) return;` in checkbox Changed handlers → PopulateControls corrupts state | Copy-paste guard pattern from existing handlers |
| GhostModeController refactor | Hardcoded VK_LCONTROL/VK_LMENU → dynamic VK routing; forget `& 0x8000` mask on new checks | Code review grep for `GetAsyncKeyState.*!= 0` without mask |
| Runtime integration | IsCtrlAltHeld() checks stale config after Settings UI change → restart required to apply | Pass config params on every call (Option A) or call UpdateModifierConfig on change (Option B) |
| ResetToDefaults | Forget to add UseCtrl/UseAlt/UseShift to reset block → defaults non-idempotent | Add 3 fields after GhostFadeRadiusPx reset |
| Settings migration | Absent fields deserialize to false → all-false = override disabled → Ctrl+Alt stops working | Verify init defaults in round-trip test |
| Human verification | Test on US keyboard only → AltGr conflicts invisible → ships with EU keyboard bug | Verification plan MUST include EU layout testing (or explicit out-of-scope note) |

---

## Sources

**HIGH confidence** — all findings verified against existing codebase:

### Codebase Evidence
- `FuzzyClock.App/GhostModeController.cs:21-22,42,184-185` — VK_LCONTROL/VK_LMENU constants + GetAsyncKeyState & 0x8000 pattern established in v2.3
- `FuzzyClock.App/SettingsWindow.xaml.cs:20,67-79,121-125` — `_suppressEvents` guard pattern in 40+ checkbox handlers
- `FuzzyClock.App/SettingsService.cs:18-66,72-100` — AppSettings init-property pattern + Validate() guards + v2.6 migration (old Left/Top → MonitorPositions)
- `.planning/milestones/v2.3-phases/27-ctrl-alt-interaction-modifier/27-RESEARCH.md` — VK_LMENU rationale (AltGr avoidance), GetAsyncKeyState mask (0x8000 high bit), WPF no-focus keyboard limitation

### Project Decisions
- `.planning/PROJECT.md:441` — "VK_LMENU not VK_MENU for Ctrl+Alt modifier | VK_MENU fires on AltGr (right-Alt) on EU keyboards"
- `.planning/PROJECT.md:42` — "GhostModeController currently hardcodes VK_LCONTROL + VK_LMENU checks. The new implementation will read a configuration (3 bools: UseCtrl, UseAlt, UseShift)"
- `.planning/MILESTONES.md:332` — v2.3 decision: `GetAsyncKeyState(VK_LCONTROL) & 0x8000` + `GetAsyncKeyState(VK_LMENU) & 0x8000` guard in Window_MouseEnter

### Win32 API References
- Microsoft Learn: GetAsyncKeyState return value — high bit (0x8000) = currently pressed, low bit (0x0001) = toggled since last call
- Microsoft Learn: Virtual-Key Codes — VK_LCONTROL (0xA2), VK_LMENU (0xA4), VK_LSHIFT (0xA0), VK_RMENU (0xA5)
- Windows keyboard input model: AltGr on EU keyboards synthesizes VK_LCONTROL + VK_RMENU simultaneously

### WPF Patterns
- WPF CheckBox dependency properties fire events on programmatic IsChecked assignment — universal WPF behavior
- WPF init-property records with System.Text.Json — absent fields take init defaults, not C# type defaults (`.NET 5+` behavior)

---

**Last updated:** 2026-05-07 — v4.3 Configurable Ghost Override research
