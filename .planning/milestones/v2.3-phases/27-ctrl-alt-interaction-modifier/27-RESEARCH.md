# Phase 27: Ctrl+Alt Interaction Modifier - Research

**Researched:** 2026-03-02
**Domain:** WPF frameless overlay — conditional ghost mode suppression via modifier key polling
**Confidence:** HIGH

## Summary

Phase 27 adds a guard to the existing `Window_MouseEnter` handler: when the user holds left Ctrl + left Alt as the mouse enters the widget, ghost mode is suppressed and the normal hover path activates instead. The implementation is a surgical 10-line addition — the Phase 26 architecture is designed for exactly this extension.

The normal hover path (backdrop + fast-refresh) already existed before Phase 26 replaced it with ghost mode. Phase 27 re-introduces that path as the Ctrl+Alt branch in a conditional. The ghost path remains unchanged and executes when no modifier is held. No new state fields are required.

Modifier detection must use `GetAsyncKeyState` (Win32) rather than `Keyboard.IsKeyDown` (WPF). The widget is a transparent frameless overlay and never holds keyboard focus, so WPF keyboard events do not fire. `GetAsyncKeyState` operates on global keyboard state regardless of focus.

**Primary recommendation:** In `Window_MouseEnter`, add `GetAsyncKeyState(VK_LCONTROL)` + `GetAsyncKeyState(VK_LMENU)` check at the top. If both are pressed, execute the pre-ghost hover path (backdrop + fast-refresh). Otherwise, execute the existing ghost path.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTRLALT-01 | When the user holds left Ctrl + left Alt while hovering, ghost mode is suppressed — widget stays at its configured opacity and is fully interactive | `GetAsyncKeyState(VK_LCONTROL)` + `GetAsyncKeyState(VK_LMENU)` in `Window_MouseEnter` before ghost activation; return early from ghost path if both held |
| CTRLALT-02 | In Ctrl+Alt mode, existing hover behaviors activate normally (backdrop, fast-refresh, drag, right-click, scroll) | The pre-Phase-26 hover path (backdrop `#59000000` + fast-refresh 0.5s) is restored as the Ctrl+Alt branch; drag/right-click/scroll already work when WS_EX_TRANSPARENT is NOT applied |
</phase_requirements>

## Standard Stack

### Core (no new dependencies — all already present)

| API / Class | Source | Purpose | Notes |
|-------------|--------|---------|-------|
| `GetAsyncKeyState` | user32.dll (P/Invoke) | Query instantaneous key press state | Already decided in v2.3 research; not yet declared in code |
| `VK_LCONTROL` (0xA2) | winuser.h | Left Ctrl virtual key code | Use LCONTROL, not CONTROL — avoids right-side ambiguity |
| `VK_LMENU` (0xA4) | winuser.h | Left Alt virtual key code | Use LMENU, not MENU — avoids AltGr false-positives |
| `0x8000` mask | winuser.h | High bit = key currently pressed | `(GetAsyncKeyState(vk) & 0x8000) != 0` |
| `DispatcherTimer` | .NET / WPF | Already used for ghost restore polling | No change needed |
| `ContentBorder.Background` | XAML element | Backdrop activation | Already present; used in pre-Phase-26 hover path |

### No New Packages Required

Phase 27 uses only:
- `user32.dll` (already imported via existing P/Invoke declarations in `MainWindow.xaml.cs`)
- Existing XAML elements and fields

## Architecture Patterns

### Existing Code Structure (Phase 26 output)

```
MainWindow.xaml.cs
├── Fields (lines 35-38)        — ghost mode state: _isGhostMode, _hwnd, _ghostRestoreTimer
├── P/Invoke (lines 41-70)      — GetWindowLong, SetWindowLong, SetWindowPos, GetCursorPos, GetWindowRect
├── ContentRendered (line 93)   — _ghostRestoreTimer setup + MouseEnter/MouseLeave subscriptions
├── Window_MouseEnter (line 546) — EXTENSION POINT: comment "Phase 27 adds Ctrl+Alt check here"
└── Window_MouseLeave (line 579) — ghost guard at top; hover cleanup in non-ghost path
```

### Pattern: Conditional Branch in Window_MouseEnter

**What:** At the top of `Window_MouseEnter`, query modifier keys. If held, execute normal hover path. If not, execute ghost path.

**When to use:** Any time ghost behavior should be suppressed by user intent.

**Current Window_MouseEnter (Phase 26 state):**
```csharp
private void Window_MouseEnter(object sender, MouseEventArgs e)
{
    // Ghost mode activation (v2.3 Phase 26 — always-on; Phase 27 adds Ctrl+Alt check here)

    // Step 1: Run synthetic MouseLeave cleanup BEFORE going click-through.
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
    if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null)
    {
        _statsTimer.Stop();
        _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
        _statsTimer.Start();
    }
    _isHoverFastRefresh = false;

    // Step 2: Start ghost restore polling
    _ghostRestoreTimer!.Start();

    // Step 3: Apply WS_EX_TRANSPARENT
    _isGhostMode = true;
    int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
    SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
    SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
    this.Opacity = 0.0;
}
```

**Phase 27 Window_MouseEnter (target state):**
```csharp
// P/Invoke to add alongside existing declarations:
[DllImport("user32.dll")]
private static extern short GetAsyncKeyState(int vKey);

private const int VK_LCONTROL = 0xA2;
private const int VK_LMENU    = 0xA4;

private void Window_MouseEnter(object sender, MouseEventArgs e)
{
    // Phase 27: Ctrl+Alt check — suppress ghost mode if both modifiers held
    bool ctrlAltHeld = (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0
                    && (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;

    if (ctrlAltHeld)
    {
        // Normal hover path (CTRLALT-01/02): backdrop + fast-refresh, widget stays visible
        ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromArgb(0x59, 0, 0, 0));

        if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null
            && _statsTimer.IsEnabled)
        {
            _statsTimer.Stop();
            _statsTimer.Interval = TimeSpan.FromSeconds(0.5);
            _statsTimer.Start();
        }
        _isHoverFastRefresh = true;
        return;  // Do NOT apply ghost mode
    }

    // Ghost mode activation (v2.3 Phase 26)
    // Step 1: Synthetic MouseLeave cleanup BEFORE going click-through
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
    if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null)
    {
        _statsTimer.Stop();
        _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
        _statsTimer.Start();
    }
    _isHoverFastRefresh = false;

    // Step 2: Start ghost restore polling
    _ghostRestoreTimer!.Start();

    // Step 3: Apply WS_EX_TRANSPARENT
    _isGhostMode = true;
    int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
    SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
    SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
    this.Opacity = 0.0;
}
```

**Source:** Project history (git show HEAD~5 — pre-Phase-26 hover path); MEMORY.md (Ctrl+Alt detection pattern); project decisions log.

### Anti-Patterns to Avoid

- **Using `Keyboard.IsKeyDown(Key.LeftCtrl)`:** WPF keyboard events require focus. This overlay has no keyboard focus — `Keyboard.IsKeyDown` always returns false.
- **Using `VK_CONTROL` (0x11) or `VK_MENU` (0x12):** These are the generic (left or right) virtual key codes. `VK_MENU` is synthesized by AltGr on European keyboards (Right Alt = Left Ctrl + Right Alt), causing false-positives. Always use `VK_LCONTROL` + `VK_LMENU`.
- **Applying `WS_EX_TRANSPARENT` then checking keys:** The Ctrl+Alt check MUST happen before any ghost mode steps. Once `WS_EX_TRANSPARENT` is applied, the window no longer receives mouse input and the state machine is difficult to unwind.
- **Starting `_ghostRestoreTimer` in the Ctrl+Alt path:** The `_ghostRestoreTimer` tick handler has a guard `if (!_isGhostMode) return;`, so starting it in the Ctrl+Alt path would be harmless but wasteful. Do not start it — the normal `Window_MouseLeave` handles exit.
- **Modifying `Window_MouseLeave`:** The existing `Window_MouseLeave` already handles both cases correctly. The `if (_isGhostMode) return;` guard at line 584 skips the hover cleanup in ghost mode; when Ctrl+Alt mode is used (no ghost), `_isGhostMode` is false so the full cleanup runs. No changes needed to `Window_MouseLeave`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modifier key detection without focus | Custom WndProc hook for WM_KEYDOWN | `GetAsyncKeyState(VK_LCONTROL)` + `GetAsyncKeyState(VK_LMENU)` | WndProc only receives messages when focused; GetAsyncKeyState works globally regardless of focus |
| Checking "key pressed right now" | Timer polling keyboard state manually | `GetAsyncKeyState` high-bit check `& 0x8000` | This IS the correct mechanism; one call per `Window_MouseEnter` is sufficient |
| Detecting Alt key without AltGr side-effect | Generic `VK_MENU` | `VK_LMENU` (0xA4) | AltGr on EU keyboards synthesizes LCtrl+RAlt; VK_MENU matches both; VK_LMENU is left-only |

**Key insight:** `GetAsyncKeyState` is the only reliable keyboard query API for overlays without focus. The project already made this decision in v2.3 research.

## Common Pitfalls

### Pitfall 1: AltGr False-Positive on European Keyboards
**What goes wrong:** `GetAsyncKeyState(VK_CONTROL) & 0x8000` AND `GetAsyncKeyState(VK_MENU) & 0x8000` both return true when user presses AltGr (Right Alt) on EU keyboard layouts.
**Why it happens:** Windows synthesizes a Left Ctrl + Right Alt key combination internally when AltGr is pressed.
**How to avoid:** Use `VK_LCONTROL` (0xA2) + `VK_LMENU` (0xA4) exclusively. AltGr produces `VK_RMENU` (0xA5), not `VK_LMENU` — so the combination `VK_LCONTROL + VK_LMENU` is not triggered by AltGr.
**Warning signs:** Users on German/French/etc. keyboards report ghost mode suppressing on normal typing.

### Pitfall 2: WPF Keyboard API Failure on Unfocused Overlay
**What goes wrong:** `Keyboard.IsKeyDown(Key.LeftCtrl)` always returns false even when Ctrl is physically held.
**Why it happens:** WPF `Keyboard.IsKeyDown` reads the WPF input system's focused element state. A transparent frameless overlay is never the focused window — the underlying desktop or other app holds focus.
**How to avoid:** Only use `GetAsyncKeyState` (Win32), which queries global hardware key state independent of focus.
**Warning signs:** Ctrl+Alt check never triggers; ghost mode activates even when modifiers are held.

### Pitfall 3: Ghost Restore Timer Started in Ctrl+Alt Path
**What goes wrong:** `_ghostRestoreTimer.Start()` called when Ctrl+Alt is held; timer polls and finds `!_isGhostMode` and immediately stops harmlessly, but the Start()/Stop() cycle has a marginal cost.
**Why it happens:** Forgetting to put the `_ghostRestoreTimer!.Start()` line inside the ghost-mode branch.
**How to avoid:** The `return` statement after the Ctrl+Alt path naturally avoids executing the ghost-mode steps. Ensure `_ghostRestoreTimer!.Start()` is in the `else`/fallthrough ghost path only.
**Warning signs:** No functional issue, but `_ghostRestoreTimer` unnecessarily started and immediately stopped.

### Pitfall 4: Modifying Window_MouseLeave
**What goes wrong:** Unnecessary complexity if the developer tries to add Ctrl+Alt logic to `Window_MouseLeave`.
**Why it happens:** Misunderstanding the state machine — assuming Ctrl+Alt mode needs special leave handling.
**How to avoid:** The existing `Window_MouseLeave` already handles both cases:
  - Ghost mode: `if (_isGhostMode) return;` guard skips hover cleanup (ghost restore is timer-driven).
  - Normal hover (Ctrl+Alt path): `_isGhostMode` is false, so backdrop + fast-refresh restore runs normally.
**Warning signs:** Any modification to `Window_MouseLeave` beyond the existing code is unnecessary for Phase 27.

### Pitfall 5: GetAsyncKeyState Return Value Misread
**What goes wrong:** Using `GetAsyncKeyState(vk) != 0` instead of `(GetAsyncKeyState(vk) & 0x8000) != 0`.
**Why it happens:** The low bit of `GetAsyncKeyState` indicates whether the key was toggled (pressed and released since last call), not whether it's currently down. Checking `!= 0` would include the low bit and could give false positives.
**How to avoid:** Always mask with `0x8000` — only the high bit means "key is currently pressed."
**Warning signs:** Occasional spurious Ctrl+Alt suppression when modifier was recently pressed/released.

## Code Examples

### GetAsyncKeyState P/Invoke Declaration
```csharp
// Source: Microsoft Win32 API docs — user32.dll
// Return type is short (Int16). High bit (0x8000) = key currently pressed.
[DllImport("user32.dll")]
private static extern short GetAsyncKeyState(int vKey);

private const int VK_LCONTROL = 0xA2;   // Left Ctrl
private const int VK_LMENU    = 0xA4;   // Left Alt (not VK_MENU = 0x12 — AltGr risk)
```

### Modifier Check Pattern
```csharp
// Source: Microsoft Win32 API docs + project MEMORY.md decision
bool ctrlAltHeld = (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0
                && (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;
```

### Normal Hover Path (pre-Phase-26, from git history)
```csharp
// Source: git show HEAD~5 (commit before Phase 26 ghost mode) — verified in codebase
// Backdrop: Color.FromArgb(0x59, 0, 0, 0) = ~35% black overlay
ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
    System.Windows.Media.Color.FromArgb(0x59, 0, 0, 0));

// Fast-refresh: 0.5s cadence (only when stats are visible and timer running)
if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null
    && _statsTimer.IsEnabled)
{
    _statsTimer.Stop();
    _statsTimer.Interval = TimeSpan.FromSeconds(0.5);
    _statsTimer.Start();
}
_isHoverFastRefresh = true;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Keyboard.IsKeyDown` | `GetAsyncKeyState` | Phase 26 research | WPF input system non-functional without focus |
| `VK_MENU` (generic) | `VK_LMENU` (left-only) | Phase 26 research | Prevents AltGr false-positives on EU keyboards |
| `WM_NCHITTEST HTTRANSPARENT` | `WS_EX_TRANSPARENT` | Phase 26 research | HTTRANSPARENT only works same-thread; WS_EX_TRANSPARENT works system-wide |
| `TrackMouseEvent` / `WM_MOUSELEAVE` | `DispatcherTimer` + `GetCursorPos` | Phase 26 implementation | WS_EX_TRANSPARENT causes synthetic immediate WM_MOUSELEAVE |

**Deprecated/outdated for this project:**
- `WndProcHook` approach for ghost restore: Replaced by `DispatcherTimer` + `GetCursorPos` in Phase 26 — WndProcHook is incompatible with self-transparent windows.
- `Mouse.GetPosition(this)` for cursor tracking during ghost: Returns stale/wrong coords when WS_EX_TRANSPARENT active.

## Open Questions

1. **Drag behavior during Ctrl+Alt mode**
   - What we know: `Grid_MouseLeftButtonDown` → `DragMove()` already exists and works when the window is not click-through.
   - What's unclear: No special handling needed — when Ctrl+Alt path is taken, `WS_EX_TRANSPARENT` is NOT applied, so the window remains fully interactive and `DragMove()` works exactly as in the normal (no-hover) state.
   - Recommendation: No code changes to drag handling.

2. **Re-hover after Ctrl+Alt release: will ghost mode activate on next MouseEnter?**
   - What we know: The success criteria state "Releasing Ctrl+Alt and moving the mouse away, then hovering again with no modifier, triggers ghost mode normally."
   - What's unclear: Whether this happens automatically without any extra code.
   - Recommendation: It does happen automatically. When the user moves away (MouseLeave fires), backdrop + fast-refresh are cleaned up normally. The next MouseEnter with no modifier held → `ctrlAltHeld == false` → ghost path runs. No extra code needed.

3. **Stats timer not running when mouse enters with Ctrl+Alt**
   - What we know: `_statsTimer` is only running if the stats panel is visible.
   - What's unclear: The pre-Phase-26 fast-refresh code checked `_statsTimer.IsEnabled` before switching to 0.5s. If stats panel is hidden, timer is stopped and the fast-refresh step is skipped. This is correct behavior.
   - Recommendation: Copy the `_statsTimer.IsEnabled` guard exactly from the pre-Phase-26 code.

## Sources

### Primary (HIGH confidence)
- `git show HEAD~5:FuzzyClock.App/MainWindow.xaml.cs` — Pre-Phase-26 `Window_MouseEnter` hover path (backdrop + fast-refresh code)
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` (current) — Phase 26 ghost mode implementation, extension point comment at line 548
- `C:/src/FuzzyStatsClock/.planning/REQUIREMENTS.md` — CTRLALT-01, CTRLALT-02 definitions
- `C:/Users/altab/.claude/projects/c--src-FuzzyStatsClock/memory/MEMORY.md` — `GetAsyncKeyState(VK_LCONTROL) + GetAsyncKeyState(VK_LMENU)` decision, extension point documentation

### Secondary (MEDIUM confidence)
- Microsoft Win32 API docs: `GetAsyncKeyState` return value semantics (high bit = currently pressed, low bit = toggle since last call) — well-established API, unchanged for decades
- Microsoft Win32 API docs: Virtual key codes — `VK_LCONTROL` (0xA2), `VK_LMENU` (0xA4), `VK_RMENU` (0xA5) — AltGr behavior documented

### Tertiary (LOW confidence)
- None — all claims verified against codebase and established Win32 APIs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all APIs already in project or well-established Win32
- Architecture: HIGH — extension point is pre-planned and commented in Phase 26 code; pre-Phase-26 hover code recovered from git history
- Pitfalls: HIGH — AltGr false-positive and GetAsyncKeyState return value are project decisions (MEMORY.md); verified in codebase

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable Win32 APIs; project codebase is the primary source)
