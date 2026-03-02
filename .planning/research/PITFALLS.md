# Pitfalls Research

**Domain:** WPF transparent frameless overlay — hover-hide (Opacity=0 + click-through) and Ctrl+Alt interaction mode (v2.3 Ghost Mode)
**Project:** Fuzzy Clock
**Researched:** 2026-03-02
**Confidence:** HIGH — all claims grounded in direct reading of existing source code, verified Win32/WPF official documentation, and functional analysis of the existing app's mouse event pipeline.

---

> **Scope note:** This document covers pitfalls specific to adding auto-hover-hide (Opacity=0 + click-through via WS_EX_TRANSPARENT) and the Ctrl+Alt interaction mode to this existing widget. Prior milestone pitfalls (frozen brushes, AllowsTransparency rendering, DragMove, PreviewMouseWheel, ColorDialog, WinForms interop, rolling averages) are in prior PITFALLS.md versions and are not repeated here except where they directly interact with the v2.3 additions.

---

## Critical Pitfalls

Mistakes that cause the feature to silently not work, or permanently break existing behavior.

---

### Pitfall 1: WS_EX_TRANSPARENT Alone Does Not Make a WPF AllowsTransparency Window Click-Through

**What goes wrong:**
A developer adds `WS_EX_TRANSPARENT` to the window's extended styles via `SetWindowLong` to make the widget click-through when hidden, but the window still receives mouse messages. Right-clicks still hit the widget even at Opacity=0. Clicks appear to pass through sometimes but not others.

**Why it happens:**
`WS_EX_TRANSPARENT` has two different behaviors depending on whether `WS_EX_LAYERED` is also set:

- **Without `WS_EX_LAYERED`:** `WS_EX_TRANSPARENT` means "do not paint until sibling windows beneath this window have painted" (paint transparency, not input transparency). It does NOT route mouse messages through.
- **With `WS_EX_LAYERED`:** `WS_EX_TRANSPARENT` causes "the shape of the layered window to be ignored and mouse events to be passed to other windows underneath the layered window." This is the click-through behavior.

WPF's `AllowsTransparency=True` on a top-level window sets `WS_EX_LAYERED` automatically (this is how WPF achieves per-pixel transparency). So `WS_EX_TRANSPARENT` combined with the already-present `WS_EX_LAYERED` produces true click-through — but ONLY if the extended style is correctly ORed in via `SetWindowLong`, not replacing the existing flags.

**Common incorrect implementation:**
```csharp
// WRONG: replaces all extended styles (loses WS_EX_LAYERED, WS_EX_TOOLWINDOW, etc.)
SetWindowLong(hwnd, GWL_EXSTYLE, WS_EX_TRANSPARENT);

// CORRECT: OR in the flag to preserve existing styles
int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
```

Replacing instead of ORing removes `WS_EX_LAYERED`, which breaks transparency entirely (widget gets a solid white/black background). It also removes `WS_EX_TOOLWINDOW`, causing the widget to re-appear in the Alt+Tab switcher.

**Prevention:**
Always read the current extended style before writing. Always OR/AND the target flag:
- Enable click-through: `SetWindowLong(hwnd, GWL_EXSTYLE, GetWindowLong(hwnd, GWL_EXSTYLE) | WS_EX_TRANSPARENT)`
- Disable click-through: `SetWindowLong(hwnd, GWL_EXSTYLE, GetWindowLong(hwnd, GWL_EXSTYLE) & ~WS_EX_TRANSPARENT)`

**Warning signs:**
- Widget background turns solid (black or color) after enabling click-through — `WS_EX_LAYERED` was removed.
- Widget reappears in Alt+Tab after enabling click-through — `WS_EX_TOOLWINDOW` was removed.
- Click-through does not work even though `WS_EX_TRANSPARENT` was set — `WS_EX_LAYERED` was removed simultaneously.

**Phase to address:** Phase implementing click-through toggle — first line of the implementation.

**Source:** Microsoft Win32 Documentation — Window Features / Layered Windows: "If the layered window has the WS_EX_TRANSPARENT extended window style, the shape of the layered window will be ignored and the mouse events will be passed to other windows underneath the layered window." (learn.microsoft.com/en-us/windows/win32/winmsg/window-features, updated 2026-02-21)

---

### Pitfall 2: WM_NCHITTEST HTTRANSPARENT Is Not Equivalent to WS_EX_TRANSPARENT for This Use Case

**What goes wrong:**
A developer chooses WM_NCHITTEST + HTTRANSPARENT (via `HwndSource.AddHook`) to implement click-through instead of `WS_EX_TRANSPARENT`, but it does not fully work. Right-click still opens the context menu. Scroll wheel events still hit the widget even when hidden.

**Why it happens:**
`HTTRANSPARENT` returned from `WM_NCHITTEST` causes Win32 to "send the message to underlying windows in the same thread until one of them returns a code that is not HTTRANSPARENT" (from the Win32 WM_NCHITTEST documentation). The critical constraint is "same thread."

For a WPF desktop overlay:
- The widget is likely the only top-level window on its thread (aside from the hidden owner window)
- The windows underneath (other apps, Explorer desktop) are on different threads
- Returning HTTRANSPARENT from WM_NCHITTEST does NOT propagate to cross-thread windows

Additionally, WM_NCHITTEST is only sent for non-client hit testing. WPF itself may absorb some input events before WM_NCHITTEST is sent, meaning `HwndSource.AddHook` WM_NCHITTEST interception is not the right approach for full click-through.

**The correct approach:**
Use `WS_EX_TRANSPARENT` + `WS_EX_LAYERED` (Pitfall 1). This operates at the Win32 message routing layer before any WndProc receives messages. It is the only mechanism that works cross-thread for a desktop overlay.

**Warning signs:**
- Hook-based HTTRANSPARENT approach works for left-clicks but right-clicks still open context menu.
- Scroll wheel still changes opacity even when widget is "hidden."
- Desktop (Explorer) does not receive clicks passed through.

**Phase to address:** Design phase — choose WS_EX_TRANSPARENT, not WM_NCHITTEST HTTRANSPARENT.

**Source:** Win32 Documentation — WM_NCHITTEST: "In a window currently covered by another window in the same thread (the message will be sent to underlying windows in the same thread until one of them returns a code that is not HTTRANSPARENT)." The same-thread constraint makes this unsuitable for desktop pass-through. (learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest)

---

### Pitfall 3: MouseLeave Fires When Widget Goes Click-Through — Window_MouseLeave Sees Ghost State

**What goes wrong:**
When the widget becomes click-through (WS_EX_TRANSPARENT applied), Windows stops delivering mouse messages to the window, which includes the `WM_MOUSELEAVE` message that WPF uses to fire `Window_MouseLeave`. The existing `Window_MouseLeave` handler:
1. Restores `ContentBorder.Background` to `Brushes.Transparent`
2. Restores the stats timer to the configured interval

When click-through is activated without also triggering `Window_MouseLeave` logic, the widget can enter a state where:
- `ContentBorder.Background` is still the hover-state `#59000000` (semi-transparent dark backdrop)
- `_isHoverFastRefresh` is still `true`
- The stats timer is still running at 0.5s

When click-through is later disabled (Ctrl+Alt pressed), the widget reappears with the wrong background and wrong timer interval.

**Why it happens:**
The existing hover state is managed through `Window_MouseEnter` and `Window_MouseLeave`. Applying `WS_EX_TRANSPARENT` does not fire `Window_MouseLeave` — it silently stops mouse message delivery. The WPF event system is not notified that the mouse left.

**Prevention:**
When activating click-through (ghost mode), explicitly run the same cleanup that `Window_MouseLeave` would run:

```csharp
private void ActivateGhostMode()
{
    // Explicitly clean up hover state before going click-through.
    // WS_EX_TRANSPARENT will stop WM_MOUSELEAVE delivery, so Window_MouseLeave
    // will never fire after this point. Run its cleanup now.
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
    if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null)
    {
        _statsTimer.Stop();
        _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
        _statsTimer.Start();
    }
    _isHoverFastRefresh = false;

    // Now apply WS_EX_TRANSPARENT
    this.Opacity = 0;
    // ... SetWindowLong to add WS_EX_TRANSPARENT
}
```

**Warning signs:**
- After ghost mode is disabled and widget reappears, backdrop is dark even when mouse is not hovering.
- Stats timer is running at 0.5s even when mouse is not over widget after ghost mode disable.
- `_isHoverFastRefresh` is true after disabling ghost mode without hovering.

**Phase to address:** Ghost mode activation/deactivation implementation.

---

### Pitfall 4: MouseEnter Fires Again When Click-Through Is Removed — Double-Enter State

**What goes wrong:**
The opposite of Pitfall 3. When `WS_EX_TRANSPARENT` is removed (Ctrl+Alt pressed, widget becomes interactive), Windows begins delivering mouse messages again. If the mouse was still positioned over the widget when click-through was removed, Windows delivers `WM_MOUSEMOVE` (and potentially `WM_MOUSEHOVER`), which WPF routes as `MouseEnter` because the window previously had no mouse tracking active.

This fires `Window_MouseEnter` again while the widget was supposedly already in a hover-enter state from the initial hover that triggered ghost mode.

The consequence depends on the exact state machine:
- If ghost mode was triggered by `MouseEnter` (mouse entered → ghost), and then Ctrl+Alt is pressed to restore, `MouseEnter` fires a second time for the same physical hover session, causing `ContentBorder.Background` to be set to the hover backdrop and the fast-refresh timer to start — which is correct behavior if the widget is now interactive, but incorrect if the state guard assumes enter fires only once per exit-enter cycle.

**Why it happens:**
`WS_EX_TRANSPARENT` causes Win32 to stop tracking mouse position relative to the window. When the style is cleared, mouse tracking restarts and WPF considers the mouse to have "just entered" the window.

**Prevention:**
The state management must be designed to tolerate double-entry. The existing `Window_MouseEnter` handler sets background and starts fast-refresh — applying it again when the widget reappears is actually correct (the user wants to interact now). The key is to not confuse the ghost-mode activation logic:

- Use a `_isGhostMode` bool flag that gates whether `Window_MouseEnter` triggers ghost mode.
- When `_isGhostMode` is true, entering the window triggers ghost; when false (Ctrl+Alt held), entering is normal hover.

**Warning signs:**
- Stats timer runs at 0.5s the moment widget reappears after Ctrl+Alt press.
- Backdrop reappears immediately when Ctrl+Alt is pressed to restore widget.
- These are actually correct behavior — the warning sign is if they DON'T happen when they should.

**Phase to address:** State machine design phase — document the expected enter-on-restore behavior explicitly.

---

### Pitfall 5: Keyboard.IsKeyDown Is NOT Reliable for Detecting Ctrl+Alt When the WPF Window Has No Focus

**What goes wrong:**
`Keyboard.IsKeyDown(Key.LeftCtrl)` returns `false` even when the user is physically holding Ctrl, because the WPF `Keyboard` class queries the WPF keyboard state cache, not the physical hardware state. The WPF keyboard state is only updated when the WPF window has keyboard focus. A desktop overlay that is never focused (it has `WindowStyle=None`, `ShowInTaskbar=False`, no focus-accepting elements) will have a stale keyboard state.

Specifically for ghost mode: when the widget is at Opacity=0 and click-through, it definitely has no focus. When the user presses Ctrl+Alt hoping to re-enable interaction, `Window_MouseEnter` (or a polling timer) calls `Keyboard.IsKeyDown(Key.LeftCtrl)` and gets `false` despite the keys being physically held.

**Why it happens:**
`Keyboard.IsKeyDown` queries `InputManager.Current.PrimaryKeyboardDevice.GetKeyStates(key)`, which reflects WPF's internal keyboard state. This state is only updated when keyboard messages (`WM_KEYDOWN`, `WM_KEYUP`, `WM_SYSKEYDOWN`, `WM_SYSKEYUP`) are routed to the WPF window. A window that is Topmost but unfocused does not receive keyboard messages.

**Correct approach — Win32 `GetAsyncKeyState`:**
Use `GetAsyncKeyState` (or the equivalent `GetKeyState`) via P/Invoke. `GetAsyncKeyState` returns the physical keyboard state at the moment of the call, independent of which window has focus:

```csharp
[System.Runtime.InteropServices.DllImport("user32.dll")]
private static extern short GetAsyncKeyState(int vKey);

private const int VK_CONTROL = 0x11;
private const int VK_MENU    = 0x12;  // Alt key

private static bool IsCtrlAltDown()
{
    // Most significant bit set = key is physically pressed
    return (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0
        && (GetAsyncKeyState(VK_MENU)    & 0x8000) != 0;
}
```

Note: `VK_MENU` is the Win32 virtual key code for the Alt key. `Key.LeftAlt` / `Key.RightAlt` in WPF maps to `VK_LMENU` / `VK_RMENU`. For the Ctrl+Alt feature, check either `VK_MENU` (either Alt) or both `VK_LMENU` and `VK_RMENU`.

**Caution — Ctrl+Alt Is AltGr on European Keyboards:**
On keyboards with AltGr (common in European locales), pressing AltGr sends both `VK_CONTROL` and `VK_MENU` simultaneously. A widget that uses Ctrl+Alt as a modifier will accidentally trigger "interaction mode" whenever a user types a character that requires AltGr (e.g., `@` on German keyboards, `€` on several others). This is a localization pitfall — see Pitfall 6.

**Warning signs:**
- Ctrl+Alt key detection never triggers even when keys are visibly held.
- Feature works when debugging (window may receive keyboard focus from debugger) but not in normal use.
- `Keyboard.IsKeyDown` returns false consistently for modifier keys.

**Phase to address:** Ctrl+Alt detection implementation — use `GetAsyncKeyState` from the start, document the AltGr caveat.

**Source:** Official: `Keyboard.IsKeyDown` documentation does not mention the no-focus limitation, but it follows from the WPF keyboard routing model. `GetAsyncKeyState` documentation: "Determines whether a key is up or down at the time the function is called" — no focus requirement mentioned. (learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate)

---

### Pitfall 6: Ctrl+Alt Is AltGr — European Keyboard Localization Trap

**What goes wrong:**
On non-US keyboards that have an AltGr key (Germany, France, Netherlands, Poland, Czech Republic, and many others), pressing AltGr is implemented by the OS as Left Ctrl + Right Alt simultaneously. A `GetAsyncKeyState(VK_CONTROL) && GetAsyncKeyState(VK_MENU)` check fires on every AltGr keypress.

For a widget sitting on the desktop, this means: every time a user types a character requiring AltGr in ANY application (email client, editor, terminal), the widget briefly enters "interaction mode" (reveals itself), then immediately re-hides. On active typing sessions, this produces a flickering, visually annoying effect.

**Why it happens:**
Windows implements AltGr as a synthesized Ctrl+Alt modifier. The `VK_MENU` check catches Right Alt (AltGr) because AltGr synthesizes `VK_LCONTROL` + `VK_RMENU`. The combination appears indistinguishable from genuine Ctrl+Alt to `GetAsyncKeyState` unless the check distinguishes `VK_LMENU` vs `VK_RMENU`.

**Detection approach to avoid the trap:**
Check for Left Alt specifically, not any Alt:

```csharp
private const int VK_LCONTROL = 0xA2;
private const int VK_LMENU    = 0xA4;  // Left Alt only (not AltGr)
private const int VK_RMENU    = 0xA5;  // Right Alt (AltGr synthesizes this)

private static bool IsCtrlAltDown_NoAltGr()
{
    // Check Left Ctrl + Left Alt only.
    // AltGr synthesizes Left Ctrl + RIGHT Alt (VK_RMENU) — excluded here.
    bool ctrl = (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0;
    bool lalt = (GetAsyncKeyState(VK_LMENU)    & 0x8000) != 0;
    return ctrl && lalt;
}
```

This is a usability tradeoff: Left Ctrl + Left Alt is slightly harder to press than the natural Ctrl+Alt on a US keyboard, but it avoids AltGr interference.

**Warning signs:**
- Widget briefly flickers visible and invisible while typing in another application (only on non-US keyboards).
- Reported by testers with German, French, or other European keyboard layouts.
- Does not reproduce on US-English keyboard layout.

**Phase to address:** Ctrl+Alt detection implementation — address at the same time as Pitfall 5.

---

### Pitfall 7: Window_MouseLeave Does Not Fire When Opacity=0 + WS_EX_TRANSPARENT Is Set While Mouse Is Over Widget

**What goes wrong:**
The activation sequence matters. If the implementation sets `Opacity=0` and applies `WS_EX_TRANSPARENT` in `Window_MouseEnter`, the mouse is currently over the window at the moment click-through is applied. Windows stops delivering mouse messages immediately, including `WM_MOUSELEAVE`. The existing `Window_MouseLeave` never fires.

The widget transitions:
```
Mouse enters → Window_MouseEnter fires → [ghost mode: Opacity=0, WS_EX_TRANSPARENT] → Mouse physically still over widget → No WM_MOUSELEAVE → Widget invisible but hover state dirty
```

When the user later moves the mouse away (at which point the widget is already invisible and click-through), no `Window_MouseLeave` fires because the window is no longer receiving mouse messages. The hover state (`ContentBorder.Background`, `_isHoverFastRefresh`, fast-refresh timer) remains in the entered state indefinitely.

**Why it happens:**
Win32 mouse leave tracking (via `TrackMouseEvent` / `WM_MOUSELEAVE`) requires the window to be receiving mouse messages. `WS_EX_TRANSPARENT` terminates mouse message delivery. The `WM_MOUSELEAVE` that would fire when the mouse physically exits the window bounds never arrives.

This is a more specific version of Pitfall 3 — it covers the case where ghost activation happens mid-hover (which is the normal case, since ghost mode activates on `MouseEnter`).

**Prevention:**
The ghost mode activation code must unconditionally run `Window_MouseLeave` cleanup before applying `WS_EX_TRANSPARENT`. No exception. The cleanup must happen before the window goes click-through:

```csharp
private void SetGhostMode(bool ghost)
{
    if (ghost)
    {
        // Synthesize the mouse-leave cleanup that WS_EX_TRANSPARENT will prevent.
        // This must run BEFORE applying WS_EX_TRANSPARENT.
        ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
        if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null)
        {
            _statsTimer.Stop();
            _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
            _statsTimer.Start();
        }
        _isHoverFastRefresh = false;

        this.Opacity = 0.0;
        // ... apply WS_EX_TRANSPARENT
    }
    else
    {
        // ... remove WS_EX_TRANSPARENT
        this.Opacity = _windowOpacity;
        // Window_MouseEnter will fire if mouse is over window — that's correct
    }
}
```

**Warning signs:**
- After ghost deactivation, backdrop shows immediately without a new mouse-enter event.
- Stats timer is at 0.5s immediately after deactivation.
- Backdrop permanently shown between ghost sessions.

**Phase to address:** Ghost mode activation/deactivation implementation — same phase as Pitfall 3.

---

### Pitfall 8: The Existing #01000000 Background Hit-Test Trick Conflicts with Ghost Mode

**What goes wrong:**
The current XAML uses `Background="#01000000"` on the outermost Grid to create a near-invisible but hit-testable surface. This is why right-click (context menu) works on the transparent areas between text characters.

When ghost mode is active (Opacity=0 + WS_EX_TRANSPARENT), this near-invisible background is irrelevant for input routing — `WS_EX_TRANSPARENT` bypasses it entirely at the Win32 level. However, when Ctrl+Alt is held and `WS_EX_TRANSPARENT` is removed (widget becomes interactive), the `#01000000` background is needed again for hit-testing of transparent areas.

The conflict arises if the ghost mode implementation accidentally removes or changes this background. If it is changed to `Background="Transparent"` (alpha=0) during ghost mode, then when ghost mode is disabled, transparent areas of the widget (between text characters, on DialCanvas margins) become click-through even while `WS_EX_TRANSPARENT` is not set — right-click in the gaps between letters stops working.

**Why it happens:**
The existing code sets `ContentBorder.Background` dynamically (hover backdrop pattern). If the ghost mode implementation repurposes `ContentBorder.Background = Transparent` as "ghost mode indicator," it collides with the hover state management that uses the same property.

**Prevention:**
Do not change `Grid.Background` (`#01000000`) — it must remain as-is at all times. Ghost mode state should be a separate `bool _isGhostMode` field. The `ContentBorder.Background` is already used for the hover backdrop and should not serve as a ghost-mode flag.

**Warning signs:**
- Right-click in transparent areas (between word characters in phrase mode) stops working after ghost mode disable.
- Mouse events pass through the widget in transparent areas even when click-through is disabled.

**Phase to address:** Ghost mode implementation review — check that Grid Background is not modified.

---

## Moderate Pitfalls

Issues that produce wrong but recoverable behavior.

---

### Pitfall 9: Ghost Mode Must Guard the DragMove() Path — Widget Cannot Be Dragged While Invisible

**What goes wrong:**
The `Grid_MouseLeftButtonDown` handler calls `DragMove()`. If ghost mode is implemented so that `WS_EX_TRANSPARENT` is toggled mid-drag (e.g., a timer fires and applies click-through while the user is dragging), `DragMove()`'s Win32 modal loop loses mouse tracking, the drag terminates abruptly, and the window may be left at an intermediate position.

More realistically: if ghost mode is active (widget invisible + click-through) and the user holds Ctrl+Alt, the widget becomes interactive. The user might then immediately left-click-drag. The drag should work normally. But if the ghost mode deactivation and drag start race (e.g., on a slow machine), `DragMove()` may be called before `WS_EX_TRANSPARENT` is fully cleared.

**Prevention:**
- Ghost mode may only be activated when no drag is in progress (guard with a `_isDragging` bool).
- Ghost mode deactivation must complete (WS_EX_TRANSPARENT removed, Opacity restored) before any mouse-down handling proceeds.
- Since the mouse-down handler calls `DragMove()` synchronously, and `WS_EX_TRANSPARENT` clearing must happen before mouse-down fires, the sequence is safe as long as deactivation happens on `Window_MouseEnter` (which fires before any click events on the window).

**Warning signs:**
- Widget "snaps" to a position mid-drag when ghost mode activates.
- Widget position is wrong after a drag that started immediately after ghost mode deactivation.

**Phase to address:** Ghost mode + DragMove integration — test drag immediately after Ctrl+Alt press.

---

### Pitfall 10: AppSettings for Ghost Mode Bool — Wrong Default Breaks First-Launch Experience

**What goes wrong:**
If a `GhostMode` or `HoverHide` enabled setting is added to `AppSettings`, the init default matters:

- `= true` (enabled by default): first launch, the widget immediately vanishes when the user hovers over it. The user has no idea the widget exists or how to interact with it. This is a terrible first-launch experience.
- `= false` (disabled by default): the feature must be explicitly opted into. This is the correct default.

The precedent in this project: features that change fundamental usability (like making the widget disappear) should default to the less disruptive state. Dial mode defaults `false`. Decorations default `false`. Ghost mode should default `false`.

**Prevention:**
```csharp
public bool GhostModeEnabled { get; init; } = false;  // correct
```

Also: `SaveSettings()` and `ApplySettings()` must be updated atomically with the field addition (see prior PITFALLS.md Pitfall 7 pattern).

**Warning signs:**
- First-launch widget immediately disappears on hover with no indication of how to bring it back.
- New users cannot find the widget after first hover.

**Phase to address:** AppSettings extension — first step before any activation logic.

---

### Pitfall 11: ContextMenu_Opened Must Sync Ghost Mode Toggle — Standard Pattern

**What goes wrong:**
If a `MenuGhostMode` menu item is added as `IsCheckable="True"` without adding it to `ContextMenu_Opened`, the checkmark state diverges from the actual `_ghostModeEnabled` field after the first toggle (established pattern — see prior PITFALLS.md Pitfall 10).

**Prevention:**
Add to `ContextMenu_Opened`:
```csharp
MenuGhostMode.IsChecked = _ghostModeEnabled;
```

Click handler reads the current state, not `IsChecked`:
```csharp
private void MenuGhostMode_Click(object sender, RoutedEventArgs e)
    => SetGhostModeEnabled(!_ghostModeEnabled);
```

**Warning signs:**
- Checkmark inverts after first toggle.
- Two clicks required to re-enable after disable.

**Phase to address:** Context menu wiring — same commit as adding the menu item.

---

### Pitfall 12: Ghost Mode While Stats Timer Is Running — Timer Fires While Widget Is Invisible

**What goes wrong:**
Ghost mode sets `Opacity=0`, but the `_statsTimer` and `_timer` (phrase timer) continue firing. This is intentional — the timers should keep running so the widget is up-to-date when it reappears.

However, `UpdateStatsDisplay()` calls `_statsService.Refresh()` and updates `CpuText.Text`, `CpuBar.Width`, etc. These UI element assignments are harmless on invisible elements.

The risk is `UpdatePhraseIfChanged()`, which calls `UpdateLayout()` and may call `PositionTopRight()` or `SettingsService.Clamp()`. These change `this.Left` and `this.Top`. If the widget is ghost-mode-invisible, position changes are invisible to the user, which is fine — but the position must remain correct for when the widget reappears.

**This is actually not a problem** — both timers should continue running. The issue to guard against is inadvertent calls to `SaveSettings()` from timer-driven paths during ghost mode. `UpdatePhraseIfChanged()` does not call `SaveSettings()` directly (it only clamps position). No timer path calls `SaveSettings()`. This is safe.

**Prevention:**
Verify no timer-driven code path calls `SetGhostModeEnabled()` or tries to change `WS_EX_TRANSPARENT` in response to a timer tick. Ghost mode state changes should only come from hover events (Enter/Leave) and key state checks.

**Warning signs:**
- No observable warning sign for this pitfall — it is a theoretical correctness check.
- If `SaveSettings()` is accidentally added to a timer path, it would be an I/O performance issue rather than a correctness bug.

**Phase to address:** Implementation review — trace all timer-driven code paths when ghost mode is active.

---

### Pitfall 13: WS_EX_TRANSPARENT Applied to Wrong HWND — Hidden Owner Window Issue

**What goes wrong:**
This app uses a hidden owner window pattern: a `WindowStyle=ToolWindow` invisible owner window prevents the widget from appearing in Alt+Tab. The hidden owner has its own HWND, different from the main window HWND.

If `WS_EX_TRANSPARENT` is applied to the hidden owner HWND instead of the main window HWND, the main window remains fully interactive (not click-through) while the owner window has an irrelevant style change.

**Why it happens:**
The hidden owner window is created in `App.xaml.cs`. Its HWND is obtained differently from the main window HWND. Using `new WindowInteropHelper(this).Handle` from `MainWindow` returns the correct main window HWND. Using `Application.Current.MainWindow` HWND is equivalent. Confusion arises if the code tries to find the HWND via `Application.Current.Windows` enumeration, which includes the owner window.

**Prevention:**
Always use `new WindowInteropHelper(this).Handle` inside `MainWindow` methods to get the correct HWND:

```csharp
var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
```

Test: after applying WS_EX_TRANSPARENT, clicks in the widget area should pass through to the desktop. Verify by clicking on a desktop icon through the (invisible) widget.

**Warning signs:**
- Widget is still not click-through despite `SetWindowLong` succeeding (no error returned).
- Opacity=0 but right-click still opens context menu.

**Phase to address:** Click-through toggle implementation — add HWND verification to the test plan.

---

### Pitfall 14: SetWindowLong Must Be Called from the UI Thread

**What goes wrong:**
`SetWindowLong` modifies a window's style. In WPF, `HWND` operations on the window's own HWND must be performed from the thread that owns the HWND — the WPF dispatcher thread (UI thread). Calling `SetWindowLong` from a background thread or from a `Task.Run` lambda produces either a silent no-op or an access violation.

The ghost mode toggle happens in `Window_MouseEnter`, which fires on the UI thread — so for the normal hover-enter path, this is not an issue. The risk is if a global keyboard hook or polling timer calls `SetGhostMode()` from a non-dispatcher thread.

If using a `DispatcherTimer` for key-state polling (checking `GetAsyncKeyState` periodically), the timer fires on the UI thread by default — safe. If using `System.Threading.Timer` or `Task.Delay`, the callback fires on a ThreadPool thread — unsafe.

**Prevention:**
Use `DispatcherTimer` for any polling that may trigger `SetWindowLong`. Never use background threads to trigger window style changes:

```csharp
// Safe: DispatcherTimer fires on UI thread
var _ghostKeyTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
_ghostKeyTimer.Tick += (_, _) =>
{
    bool ctrlAltNow = IsCtrlAltDown_NoAltGr();
    // SetWindowLong here is safe — on UI thread
};
```

**Warning signs:**
- `SetWindowLong` has no effect but returns no error (called from wrong thread).
- Application crashes with `InvalidComObjectException` or access violation related to HWND operations.

**Phase to address:** Key state polling implementation — choose timer type carefully.

---

## Minor Pitfalls

---

### Pitfall 15: Opacity=0 Does Not Prevent Window from Being Focused

**What goes wrong:**
Setting `this.Opacity = 0` hides the visual but the window is still in the Z-order and can receive focus when the user clicks in its area (if WS_EX_TRANSPARENT is not applied). If ghost mode uses only Opacity=0 without WS_EX_TRANSPARENT, clicking the desktop in the widget's area gives the widget focus, steals it from the application the user was working in, and opens the context menu or fires other events.

**Why it happens:**
WPF `Opacity` is a rendering property, not a window presence property. The HWND remains in the Z-order and is fully interactive even at Opacity=0.

**Prevention:**
Ghost mode must always apply both: `Opacity=0` AND `WS_EX_TRANSPARENT`. Opacity=0 alone is insufficient for click-through. This is the core design — both together. Neither alone achieves the required behavior.

**Warning signs:**
- Widget is invisible but clicking in its area "steals" focus from other apps.
- Right-click in widget area opens context menu even at Opacity=0.

**Phase to address:** Ghost mode design — document this as an invariant: Opacity=0 and WS_EX_TRANSPARENT are always applied and removed together.

---

### Pitfall 16: Phrase Text Centering Interacts With SizeToContent=WidthAndHeight

**What goes wrong:**
The v2.3 milestone includes centered phrase text (`TextAlignment=Center`). The widget currently uses `SizeToContent="WidthAndHeight"` — the window width is determined by the widest content. With `TextAlignment=Center`, the TextBlock needs a fixed width to center against. If `Width` is not set on `PhraseText`, `TextAlignment=Center` has no effect (the TextBlock sizes to exactly the text width, so centering within it is visually identical to left-align).

This is not a crash or functional bug, but the feature "appears to work" in some test scenarios (when the window happens to be wider than the text due to stats panel width) but fails in phrase-only mode where the window width equals the text width.

**Prevention:**
To center text in a `SizeToContent` window, set a `MinWidth` on the outer container or use a fixed width for the phrase TextBlock. Alternatively, set `HorizontalAlignment=Center` on the TextBlock within a containing element that has a determined width (like the stats panel width of 180).

Simpler approach: `TextAlignment=Center` works correctly when the `PhraseText` TextBlock fills the width of the stats panel. If `StatsPanel.Width=180` is the widest element, the phrase area should match that width.

**Warning signs:**
- Text appears left-aligned in phrase-only mode (no stats panel) even with `TextAlignment=Center` set.
- Text is only centered when stats panel is visible.

**Phase to address:** Centered phrase text XAML implementation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use `WM_NCHITTEST HTTRANSPARENT` instead of `WS_EX_TRANSPARENT` | Feels more "WPF-native" | Cross-thread pass-through does not work; desktop clicks don't reach Explorer | Never — only `WS_EX_TRANSPARENT` works for desktop overlay |
| Use `Keyboard.IsKeyDown` instead of `GetAsyncKeyState` | No P/Invoke | Returns stale state; Ctrl+Alt never detected since window has no focus | Never — `GetAsyncKeyState` is required |
| Use `VK_MENU` (any Alt) instead of `VK_LMENU` (left Alt only) | Simpler code | AltGr typed in any app causes widget to flicker | Acceptable only on explicitly US-English deployments |
| Apply Opacity=0 without WS_EX_TRANSPARENT | Simpler implementation | Widget still receives all input events when "invisible"; clicks stolen from desktop | Never — both must be applied together |
| Replace extended styles instead of ORing the new flag | One `SetWindowLong` instead of two | Removes WS_EX_LAYERED (breaks transparency) and WS_EX_TOOLWINDOW (widget reappears in Alt+Tab) | Never |
| Default `GhostModeEnabled = true` | No menu navigation needed | First-launch widget vanishes on first hover, user has no idea widget exists | Never |
| Skip MouseLeave cleanup before applying WS_EX_TRANSPARENT | Less code | Hover state permanently dirty; backdrop and fast-refresh stuck on | Never |

---

## Integration Gotchas

Common mistakes when connecting the new features to the existing system.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| `WS_EX_TRANSPARENT` + `WS_EX_LAYERED` coexistence | Replace style flags | Always `GetWindowLong` then OR/AND — never replace |
| Ghost mode + existing `Window_MouseLeave` | Assume WM_MOUSELEAVE fires when WS_EX_TRANSPARENT applied | Synthetically run MouseLeave cleanup before applying WS_EX_TRANSPARENT |
| Ghost mode + existing `Window_MouseEnter` | Assume enter doesn't fire after WS_EX_TRANSPARENT removed | Accept it fires; ensure state machine handles re-entry |
| Ctrl+Alt detection | Use `Keyboard.IsKeyDown` | Use `GetAsyncKeyState` via P/Invoke — WPF keyboard state is stale without focus |
| AltGr keyboards | Check `VK_MENU` (any Alt) | Check `VK_LMENU` (left Alt) to exclude AltGr |
| `GetAsyncKeyState` timing in `Window_MouseEnter` | Check at instant of event | Snap is reliable in `MouseEnter` — `GetAsyncKeyState` reads physical state at call time |
| Ghost mode + drag (`DragMove`) | Apply ghost mode while drag modal loop is active | Guard: do not activate ghost mode while `_isDragging = true` |
| `SetWindowLong` thread safety | Call from background timer/task | Only call from UI thread; use `DispatcherTimer` for key polling |
| HWND selection | Apply to wrong HWND (hidden owner) | Always use `new WindowInteropHelper(this).Handle` inside MainWindow |
| `AppSettings.GhostModeEnabled` init default | Set to `true` (seems more discoverable) | Must be `false` — first-launch users should not have the widget vanish immediately |
| `SaveSettings()` + `GhostModeEnabled` field | Forget to add field to SaveSettings() | Atomic pair: field addition + SaveSettings() update in same commit |
| `TextAlignment=Center` + `SizeToContent` | Expect centering to work without fixed-width container | Set width on phrase container equal to stats panel width (180px) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling `GetAsyncKeyState` on a fast timer (e.g., 16ms / 60Hz) | Excessive CPU use; measurable CPU% in stats panel from the widget itself | Use 50–100ms polling interval; or event-driven via key hooks | Always, at 60Hz polling |
| Applying `SetWindowLong` on every timer tick instead of only when state changes | Win32 call overhead per tick | Track current ghost state in `_isGhostMode`; only call `SetWindowLong` on transitions | Every timer tick |
| Global low-level keyboard hook (`SetWindowsHookEx WH_KEYBOARD_LL`) for Ctrl+Alt detection | Hook DLL injection, cross-process latency, resource leak on app crash | Use polling `GetAsyncKeyState` on a `DispatcherTimer` — simpler, no global hook needed, no memory leak risk | On crash without hook cleanup |

---

## "Looks Done But Isn't" Checklist

- [ ] **WS_EX_LAYERED preserved:** After enabling click-through, widget transparency still works (not solid background).
- [ ] **WS_EX_TOOLWINDOW preserved:** After enabling click-through, widget not in Alt+Tab.
- [ ] **Click-through works through widget:** With ghost mode active, click a desktop icon through the widget area — icon responds.
- [ ] **Right-click passes through:** With ghost mode active, right-click in widget area opens desktop context menu, not widget menu.
- [ ] **Scroll wheel passes through:** With ghost mode active, scroll in widget area scrolls the window behind it, not the widget opacity.
- [ ] **Hover backdrop cleared on ghost activation:** After ghost mode deactivates and reactivates, backdrop is not persistent.
- [ ] **Stats timer interval correct after ghost deactivation:** After ghost mode is disabled (Ctrl+Alt), stats timer runs at configured interval, not 0.5s.
- [ ] **Ctrl+Alt detection works without focus:** Press Ctrl+Alt while another application is focused — widget reveals itself.
- [ ] **AltGr does not trigger:** On a European keyboard (or keyboard layout), type a character that requires AltGr — widget does not flicker.
- [ ] **GhostModeEnabled=false default:** First launch (no settings.json) — widget stays visible on hover.
- [ ] **GhostModeEnabled persists:** Toggle on via menu, close app, reopen — ghost mode is on.
- [ ] **ContextMenu checkmark syncs:** Toggle ghost mode off; reopen menu — item shows unchecked. Toggle on — checked.
- [ ] **Drag works after Ctrl+Alt:** Press Ctrl+Alt to reveal widget, then immediately drag — widget moves correctly.
- [ ] **HWND is main window, not owner:** Verify in debug — `new WindowInteropHelper(this).Handle` value used in SetWindowLong is the same HWND shown in window title when debugging.

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WS_EX_TRANSPARENT requires WS_EX_LAYERED (P1) | Click-through toggle implementation | Transparency works after enabling; test with Amber theme |
| HTTRANSPARENT wrong approach (P2) | Design phase — choose WS_EX_TRANSPARENT | Architecture decision, no runtime test |
| MouseLeave not fired when WS_EX_TRANSPARENT applied (P3) | Ghost activation implementation | Backdrop + timer correct after ghost deactivate |
| MouseEnter fires on WS_EX_TRANSPARENT removal (P4) | State machine design | Enter-on-restore behaves correctly (backdrop/fast-refresh start) |
| Keyboard.IsKeyDown unreliable (P5) | Ctrl+Alt detection implementation | Feature works when another app has focus |
| AltGr keyboard conflict (P6) | Ctrl+Alt detection implementation | AltGr typing in another app does not flicker widget |
| MouseLeave not fired mid-hover ghost activation (P7) | Ghost activation implementation | Same as P3 — verify after same-session ghost activate/deactivate |
| #01000000 background preserved (P8) | Implementation review | Right-click in text gaps works after ghost cycle |
| Ghost mode + DragMove guard (P9) | Integration testing | Drag immediately after Ctrl+Alt press works |
| GhostModeEnabled default false (P10) | AppSettings extension | First launch widget visible on hover |
| ContextMenu_Opened sync (P11) | Context menu wiring | Two open+close cycles; checkmark correct |
| Timer fires during ghost mode (P12) | Implementation review | Phrase/stats update correctly; position stable during ghost |
| SetWindowLong wrong HWND (P13) | Click-through implementation | Click-through works (not silently applied to owner) |
| SetWindowLong on UI thread (P14) | Key polling timer choice | No crash; `DispatcherTimer` used |
| Opacity=0 alone insufficient (P15) | Ghost mode design invariant | Right-click at Opacity=0 before WS_EX_TRANSPARENT applied — confirm not done |
| TextAlignment centering requires fixed width (P16) | Phrase centering XAML phase | Text centered in phrase-only mode (no stats panel) |

---

## Sources

| Source | Confidence |
|--------|------------|
| `MainWindow.xaml.cs` — existing `Window_MouseEnter`, `Window_MouseLeave`, `Grid_MouseLeftButtonDown`, `SetOpacity()`, `ContentBorder.Background` patterns; read directly from `C:\src\FuzzyStatsClock\FuzzyClock.App\MainWindow.xaml.cs` | HIGH |
| `MainWindow.xaml` — `Background="#01000000"` hit-test trick, `AllowsTransparency="True"`, `SizeToContent="WidthAndHeight"`, `ContentBorder` element; read directly from source | HIGH |
| `PROJECT.md` Key Decisions table — all validated architectural decisions including PreviewMouseWheel, hidden owner window, WinForms interop; read directly from project file | HIGH |
| Microsoft Win32 Documentation — Window Features / Layered Windows: "If the layered window has the WS_EX_TRANSPARENT extended window style, the shape of the layered window will be ignored and the mouse events will be passed to other windows underneath the layered window." Updated 2026-02-21. (learn.microsoft.com/en-us/windows/win32/winmsg/window-features) | HIGH |
| Microsoft Win32 Documentation — Extended Window Styles: WS_EX_TRANSPARENT = 0x00000020L; description of paint-transparency vs click-through behavior. Updated 2025-07-14. (learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles) | HIGH |
| Microsoft Win32 Documentation — WM_NCHITTEST: HTTRANSPARENT = -1; "In a window currently covered by another window in the same thread." Updated 2025-07-14. (learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest) | HIGH |
| Microsoft WPF Documentation — HwndSource.AddHook: registers delegate for all Win32 messages; hooks called in order added; `handled=true` stops further processing. Updated 2026-02-11. (learn.microsoft.com/en-us/dotnet/api/system.windows.interop.hwndsource.addhook) | HIGH |
| Microsoft Win32 Documentation — GetAsyncKeyState: "Determines whether a key is up or down at the time the function is called" — no focus requirement; MSB set = key down; `VK_LCONTROL`, `VK_LMENU`, `VK_RMENU` virtual key codes available. (learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate) | HIGH |
| AltGr as Left Ctrl + Right Alt behavior — established Windows behavior documented in multiple official sources; AltGr = `VK_LCONTROL` + `VK_RMENU` synthesized by the OS input stack | HIGH — standard Windows behavior, consistent across versions |
| `Keyboard.IsKeyDown` focus requirement — derived from WPF keyboard routing model documented in WPF interop guide; `Keyboard.IsKeyDown` uses `InputManager.Current.PrimaryKeyboardDevice` which reflects WPF's message-processed state | MEDIUM — functional inference from WPF keyboard routing architecture; not explicitly stated in `Keyboard.IsKeyDown` API docs |

---

*Pitfalls research for: WPF transparent overlay — v2.3 Ghost Mode (hover-hide + Ctrl+Alt interaction)*
*Researched: 2026-03-02*
