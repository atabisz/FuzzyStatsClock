# Architecture Patterns

**Domain:** WPF transparent overlay — hover-hide + click-through + Ctrl+Alt interaction (v2.3)
**Researched:** 2026-03-02
**Confidence:** HIGH

---

## System Overview

v2.3 adds ghost mode (auto-hide on hover + click-through), Ctrl+Alt interaction modifier,
and centered phrase text. No new files are required. Two files are modified:
`MainWindow.xaml.cs` and `MainWindow.xaml`. `AppSettings.cs`, `SettingsService.cs`, and
`StatsService.cs` are unchanged.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            FuzzyClock.App (WPF)                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  App.xaml.cs           MainWindow.xaml.cs            SettingsService.cs       │
│  (UNCHANGED)           (MODIFIED)                    (UNCHANGED)              │
│                              │                                                │
│                    ┌─────────┴──────────────┐                                 │
│                    │                        │                                 │
│             _phraseTimer             _statsTimer                              │
│             (10s, existing)          (1s/3s/10s, existing)                   │
│                    │                        │                                 │
│             PhraseEngine               StatsService.cs                       │
│             (UNCHANGED)                (UNCHANGED)                            │
│                                                                               │
│  ── NEW: WndProc Hook ─────────────────────────────────────────────────────  │
│                                                                               │
│  ContentRendered                                                               │
│    HwndSource.FromHwnd(hwnd).AddHook(WndProcHook)  ←── NEW registration     │
│                    │                                                          │
│  WndProcHook(WM_NCHITTEST)                                                    │
│    if _ghostMode → return HTTRANSPARENT  ←── NEW: passes mouse through       │
│    else          → return IntPtr.Zero    (default WPF hit-test)               │
│                                                                               │
│  ── MODIFIED: Hover Handlers ─────────────────────────────────────────────  │
│                                                                               │
│  Window_MouseEnter                                                             │
│    if NOT Ctrl+Alt: _ghostMode=true, Opacity=0, return  ← NEW ghost path    │
│    if Ctrl+Alt:     existing backdrop + fast-refresh    ← UNCHANGED          │
│                                                                               │
│  Window_MouseLeave                                                             │
│    if _ghostMode: restore Opacity, _ghostMode=false, return  ← NEW restore  │
│    else:          existing backdrop clear + timer restore    ← UNCHANGED     │
│                                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  MainWindow.xaml (MODIFIED: TextAlignment="Center" on PhraseText/ShadowText) │
│                                                                               │
│  Window                                                                        │
│    Grid                                                                        │
│      Border (ContentBorder — backdrop, existing)                               │
│        Grid (inner, 2 rows, existing)                                          │
│          Row 0: ShadowText [Center] + PhraseText [Center] / DialCanvas       │
│          Row 1: StatsPanel (existing, unchanged)                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Existing Architecture — Baseline Facts from Source Inspection

### Window properties (XAML, unchanged)
- `AllowsTransparency="True"` — WPF sets WS_EX_LAYERED; composited window
- `WindowStyle="None"` — no chrome
- `Topmost="True"` — always on top
- `Background="Transparent"`
- `SizeToContent="WidthAndHeight"` — window resizes with content

### Hit-test baseline (critical)
The outer `<Grid Background="#01000000">` uses alpha=1 (not 0) deliberately. A fully
transparent background has no hit-test surface; alpha=1 preserves mouse event delivery.
In v2.3, this remains unchanged — the widget is always hit-testable by WPF. The ghost
state is implemented by WM_NCHITTEST returning HTTRANSPARENT in the WndProc hook, which
intercepts the decision at the Win32 level before WPF even processes the mouse event. The
Grid background is not changed.

### Existing WndProc usage
`WindowInteropHelper(this).Handle` is used in `MenuThemeCustom_Click` to get the HWND for
the `Win32Window : IWin32Window` adapter passed to `ColorDialog.ShowDialog()`. This is a
one-time call at dialog open — there is no persistent `HwndSource.AddHook` in the
codebase. v2.3 adds the first persistent WndProc hook.

### Existing hover handlers (wired in ContentRendered, lines 107–108)
```
Window_MouseEnter:
  1. ContentBorder.Background = semi-transparent black (always)
  2. if StatsPanel visible: stop timer, set 0.5s, restart, _isHoverFastRefresh = true

Window_MouseLeave:
  1. ContentBorder.Background = Transparent (always)
  2. if StatsPanel visible: stop timer, restore interval, restart, _isHoverFastRefresh = false
```
Both handlers are on the WPF event layer. When a WndProc hook returns HTTRANSPARENT,
Windows stops delivering positional mouse messages to the window. WPF's InputManager
detects the window is no longer the hit-test target and fires `MouseLeave`. This makes
`Window_MouseLeave` the reliable restore trigger after ghost mode activates.

---

## Component Responsibilities

| Component | Status | Responsibility for v2.3 |
|-----------|--------|-------------------------|
| `MainWindow.xaml.cs` | Modified | Add `WndProcHook`; add `_ghostMode` field + constants; register hook in `ContentRendered`; revise `Window_MouseEnter`/`Window_MouseLeave` |
| `MainWindow.xaml` | Modified | Add `TextAlignment="Center"` to `PhraseText` and `ShadowText` |
| `AppSettings.cs` | Unchanged | Ghost mode is transient; no new persisted fields |
| `SettingsService.cs` | Unchanged | |
| `StatsService.cs` | Unchanged | |
| `App.xaml.cs` | Unchanged | |
| `FuzzyClock.Core` | Unchanged | |

---

## New vs Modified: Component Detail

### New — WndProc Hook

**Purpose:** Intercept WM_NCHITTEST to return HTTRANSPARENT when in ghost mode, causing all
mouse input to pass through the widget to windows beneath.

**Why WM_NCHITTEST hook and not WS_EX_TRANSPARENT extended style:**
Setting WS_EX_TRANSPARENT via `SetWindowLong` makes the window permanently click-through.
WPF `MouseEnter`/`MouseLeave` would never fire — there would be no restore trigger.
WM_NCHITTEST interception is conditional: the hook reads `_ghostMode` and returns
HTTRANSPARENT only when active, leaving normal HTCLIENT delivery otherwise. This is the
correct approach for a toggleable ghost state.

**How WM_NCHITTEST HTTRANSPARENT works (Win32 official docs, 2025-07-14):**
HTTRANSPARENT (-1) means "the cursor is in a window covered by another window in the same
thread." Windows then sends the message to the window beneath in the Z-order, and mouse
input is routed to that window instead. The WPF window receives no further mouse messages
for the current position, causing WPF to fire `MouseLeave` for the overlay window.

**HwndSource.AddHook (official .NET 10 docs, 2026-02-11):**
`HwndSource.FromHwnd(hwnd).AddHook(delegate)` adds a delegate to the window procedure
chain. Hooks are called in LIFO order; returning `handled = true` short-circuits further
processing. The hook is registered via `AddHook` after window construction (in
`ContentRendered`) — the same HWND acquisition path already in the codebase.

**Important:** Official docs note hooks are held by weak reference. The `WndProcHook`
method is an instance method on `MainWindow`, which lives for the process lifetime. No
additional lifetime management is needed.

**New fields:**
```csharp
private const int WM_NCHITTEST  = 0x0084;
private const int HTTRANSPARENT = -1;
private bool _ghostMode = false;
```

**New method:**
```csharp
private IntPtr WndProcHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam,
                           ref bool handled)
{
    if (msg == WM_NCHITTEST && _ghostMode)
    {
        handled = true;
        return new IntPtr(HTTRANSPARENT);
    }
    return IntPtr.Zero;
}
```

**Registration (in ContentRendered, after `InitTrayIcon()`):**
```csharp
var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
System.Windows.Interop.HwndSource.FromHwnd(hwnd).AddHook(WndProcHook);
```

---

### Modified — Window_MouseEnter

**Current:** Sets backdrop unconditionally; optionally accelerates stats timer.

**New ghost path (no Ctrl+Alt held):**
1. Check `Keyboard.Modifiers` — if Ctrl and Alt are not both held, enter ghost mode
2. Set `_ghostMode = true`
3. Set `this.Opacity = 0` (widget invisible; `_windowOpacity` is not touched)
4. Return immediately — skip backdrop, skip stats timer acceleration

After step 3, WM_NCHITTEST starts returning HTTRANSPARENT. WPF fires `MouseLeave` when
the mouse moves (Windows stops delivering mouse-over messages to the HWND). The restore
path in `Window_MouseLeave` handles re-activation.

**Ctrl+Alt interactive path (Ctrl+Alt held):**
Existing behavior, unchanged: backdrop shown, stats timer accelerated.

**Why `Keyboard.Modifiers` and not a global keyboard hook:**
`Keyboard.Modifiers` from `System.Windows.Input` reads synchronous WPF modifier state at
the moment of the call. This project only needs modifier state when the mouse enters the
window — not while the window has no focus. A `SetWindowsHookEx(WH_KEYBOARD_LL)` global
hook requires a separate thread, an unmanaged callback pointer, and hook chain
participation — disproportionate complexity for a one-line state read. `Keyboard.Modifiers`
is the correct tool.

```csharp
private void Window_MouseEnter(object sender, MouseEventArgs e)
{
    bool ctrlAltHeld = (Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Alt))
                       == (ModifierKeys.Control | ModifierKeys.Alt);

    if (!ctrlAltHeld)
    {
        _ghostMode = true;
        this.Opacity = 0;
        return;
    }

    // Ctrl+Alt held — interactive mode (existing behavior)
    ContentBorder.Background = new System.Windows.Media.SolidColorBrush(
        System.Windows.Media.Color.FromArgb(0x59, 0, 0, 0));

    if (StatsPanel.Visibility != Visibility.Visible) return;
    if (_statsTimer != null && _statsTimer.IsEnabled)
    {
        _statsTimer.Stop();
        _statsTimer.Interval = TimeSpan.FromSeconds(0.5);
        _statsTimer.Start();
    }
    _isHoverFastRefresh = true;
}
```

---

### Modified — Window_MouseLeave

**Ghost restore path (_ghostMode is true):**
1. Set `_ghostMode = false` — WM_NCHITTEST returns to normal HTCLIENT
2. Restore `this.Opacity = _windowOpacity` — user's configured opacity
3. Clear `ContentBorder.Background` to Transparent (defensive, in case of mid-session Ctrl+Alt transitions)
4. Return — do not touch stats timer (`_isHoverFastRefresh` was never set in ghost path)

**Ctrl+Alt interactive restore path:**
Existing behavior, unchanged: clear backdrop, restore stats interval, clear `_isHoverFastRefresh`.

```csharp
private void Window_MouseLeave(object sender, MouseEventArgs e)
{
    if (_ghostMode)
    {
        _ghostMode = false;
        this.Opacity = _windowOpacity;
        ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
        return;
    }

    // Ctrl+Alt interactive path — existing behavior
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;

    if (StatsPanel.Visibility != Visibility.Visible) return;
    if (_statsTimer != null)
    {
        _statsTimer.Stop();
        _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
        _statsTimer.Start();
    }
    _isHoverFastRefresh = false;
}
```

**Key invariant: `_windowOpacity` vs `this.Opacity`**
`_windowOpacity` is the user's persisted opacity value, updated only by `SetOpacity()`.
`this.Opacity` is the actual window alpha — equal to `_windowOpacity` during normal
operation, temporarily 0 during ghost mode. `SaveSettings()` writes `_windowOpacity` —
ghost state is never accidentally persisted.

---

### Modified — MainWindow.xaml (Centered Phrase Text)

Add `TextAlignment="Center"` to both `PhraseText` and `ShadowText`. Both TextBlocks must
be changed together because `ShadowText` is the shadow layer rendered at (X=2, Y=2) offset
behind `PhraseText`. Centering one without the other would misalign the shadow.

```xml
<!-- Before -->
<TextBlock x:Name="ShadowText" Text="" FontFamily="Segoe UI Light" FontSize="32"
           Foreground="#BB000000" IsHitTestVisible="False">
    <TextBlock.RenderTransform><TranslateTransform X="2" Y="2" /></TextBlock.RenderTransform>
</TextBlock>
<TextBlock x:Name="PhraseText" Text="" FontFamily="Segoe UI Light" FontSize="32"
           Foreground="White" />

<!-- After -->
<TextBlock x:Name="ShadowText" Text="" FontFamily="Segoe UI Light" FontSize="32"
           Foreground="#BB000000" IsHitTestVisible="False" TextAlignment="Center">
    <TextBlock.RenderTransform><TranslateTransform X="2" Y="2" /></TextBlock.RenderTransform>
</TextBlock>
<TextBlock x:Name="PhraseText" Text="" FontFamily="Segoe UI Light" FontSize="32"
           Foreground="White" TextAlignment="Center" />
```

**SizeToContent interaction:**
`SizeToContent=WidthAndHeight` sets the window width to the measured content width.
A `TextBlock` with `TextAlignment="Center"` centers text within its own layout width, but
the `TextBlock`'s measured width is the text width itself (not a fixed container). Centering
is only visible when the TextBlock has a wider container than the text — specifically, when
`StatsPanel` (Width=180) is visible and forces the inner Grid wider than the phrase text.
When stats are hidden, the window width equals the phrase text width, and centering has no
visual effect. This is acceptable behavior — no additional layout changes are needed.

**No AppSettings field:**
Centering is a permanent change to the default presentation, not a user toggle.
`Reset to Defaults` in the tray menu (TRAY-03) resets to the centered layout by definition.

---

## Integration Map

| Component | File | Change Type | What |
|-----------|------|-------------|------|
| `WM_NCHITTEST` / `HTTRANSPARENT` constants | `MainWindow.xaml.cs` | NEW fields | `private const int WM_NCHITTEST = 0x0084; private const int HTTRANSPARENT = -1` |
| `_ghostMode` | `MainWindow.xaml.cs` | NEW field | `private bool _ghostMode = false` |
| `WndProcHook` method | `MainWindow.xaml.cs` | NEW method | WM_NCHITTEST → HTTRANSPARENT when `_ghostMode` |
| HwndSource.AddHook registration | `MainWindow.xaml.cs` ContentRendered | MODIFIED (addition) | 2 lines appended after `InitTrayIcon()` call |
| `Window_MouseEnter` | `MainWindow.xaml.cs` | MODIFIED | Prepend ghost path (Ctrl+Alt check → set `_ghostMode`, Opacity=0) before existing backdrop path |
| `Window_MouseLeave` | `MainWindow.xaml.cs` | MODIFIED | Prepend ghost restore path (`_ghostMode` check → restore Opacity) before existing clear path |
| `PhraseText` | `MainWindow.xaml` | MODIFIED | Add `TextAlignment="Center"` |
| `ShadowText` | `MainWindow.xaml` | MODIFIED | Add `TextAlignment="Center"` |
| `AppSettings.cs` | No change | NONE | Ghost mode is transient state only |
| `SettingsService.cs` | No change | NONE | |
| `StatsService.cs` | No change | NONE | |

**Total scope:** ~25 new/changed lines of C#, 2 XAML attribute additions.

---

## Data Flow: Ghost Mode Lifecycle

```
Mouse approaches widget from outside
        |
        v
WM_NCHITTEST fires → _ghostMode false → returns IntPtr.Zero (default HTCLIENT path)
WPF receives hit-test positive → prepares MouseEnter
        |
        v
Window_MouseEnter fires
        |
   ┌────┴────────────────────────────────┐
   │                                     │
[Ctrl+Alt NOT held]              [Ctrl+Alt held]
   │                                     │
   v                                     v
_ghostMode = true              ContentBorder.Background = semi-transparent
this.Opacity = 0               _statsTimer accelerated (if stats visible)
return                         _isHoverFastRefresh = true
   │
   v
WM_NCHITTEST fires for subsequent mouse messages
_ghostMode = true → handled = true, return HTTRANSPARENT
Windows routes mouse to window beneath (desktop, other apps)
WPF InputManager loses mouse-over element → MouseLeave fires
   │
   v
Window_MouseLeave fires
_ghostMode = true → enter restore path
_ghostMode = false
this.Opacity = _windowOpacity
ContentBorder.Background = Transparent (defensive clear)
return
   │
   v
Widget visible again.
WM_NCHITTEST → _ghostMode false → returns IntPtr.Zero → HTCLIENT
Normal hover behavior resumes on next MouseEnter.
```

---

## Interaction with Existing Systems

### Stats Timer and _isHoverFastRefresh
Ghost path exits `Window_MouseEnter` early — stats timer is never touched, `_isHoverFastRefresh`
is never set. Ghost restore path (`_ghostMode = true` branch in `Window_MouseLeave`) also
returns early without touching timer or `_isHoverFastRefresh`. The stats timer continues at
its configured interval uninterrupted during ghost mode. This is correct: the widget is
invisible; accelerating stats sampling would be wasteful with no visible output.

### Opacity: _windowOpacity vs this.Opacity
`_windowOpacity` = user-set value, modified only by `SetOpacity()`. Written to settings.
`this.Opacity` = actual window alpha. Ghost mode sets it to 0 and restores it to
`_windowOpacity`. `SaveSettings()` always writes `_windowOpacity` (not `this.Opacity`
directly) — ghost state cannot be accidentally persisted to settings.json.

### Backdrop (ContentBorder.Background)
Ghost mode does not set the backdrop. The backdrop is only applied in the Ctrl+Alt
interactive path. The `Window_MouseLeave` ghost restore path unconditionally clears the
backdrop as a defensive invariant to handle any edge case where the user held Ctrl+Alt for
one hover cycle (backdrop was set) then released it before the next hover cycle (ghost path
taken, backdrop still stale from previous session).

### Drag (Grid_MouseLeftButtonDown)
`DragMove()` is only reachable when the widget is NOT in ghost mode (ghost mode sets
`this.Opacity = 0` and returns HTTRANSPARENT — left-click passes to the window beneath,
never reaching `Grid_MouseLeftButtonDown`). The drag pause/resume of the stats timer is
only active when the user dragged via Ctrl+Alt interaction, making the widget interactive.
The two paths are exclusive; no interaction conflict exists.

### Context Menu (right-click)
Right-click only works when the widget is in interactive mode (Ctrl+Alt held at hover time,
or not yet hovered). In ghost mode the right-click passes through to the window beneath.
This is correct and desired: the user cannot access the context menu while the widget is
invisible. To access the menu, the user holds Ctrl+Alt to enter interactive mode, then
right-clicks.

### PreviewMouseWheel (opacity scroll)
In ghost mode, the widget is HTTRANSPARENT. Scroll events pass through to the window
beneath. Opacity scroll is only available in interactive mode. Correct.

### SetOpacity() called while in ghost mode
If the user somehow adjusts opacity via context menu during an interactive (Ctrl+Alt) hover
session, `SetOpacity()` updates both `_windowOpacity` and `this.Opacity`. When `MouseLeave`
fires (not ghost path, since `_ghostMode` is false in Ctrl+Alt mode), the existing path
restores correctly. No conflict.

### ResetToDefaults() (tray menu)
`ResetToDefaults()` calls `SetOpacity(1.0)` which sets `_windowOpacity = 1.0` and
`this.Opacity = 1.0`. If the widget happens to be in ghost mode when Reset is triggered
(theoretically impossible: tray icon is a WinForms NotifyIcon click, the widget is
HTTRANSPARENT so the user cannot click the tray icon with the mouse over the widget — but
defensively), the `_ghostMode = true` flag would still be set and the WndProc hook would
continue returning HTTRANSPARENT until `MouseLeave` fires. This is an acceptable edge case
that resolves itself on next mouse movement.

---

## Build Order (Suggested Phase Sequence)

**Phase A — Centered phrase text (XAML only)**
- Add `TextAlignment="Center"` to `PhraseText` and `ShadowText` in `MainWindow.xaml`
- Verify: phrase text is centered when StatsPanel is visible; no centering effect when
  stats hidden (expected, by design); shadow alignment unchanged
- Rationale: isolated XAML change with zero behavioral risk; validates SizeToContent
  interaction before adding ghost complexity

**Phase B — Ghost mode core (WndProc + hover handler revision)**
- Add `_ghostMode` field and `WM_NCHITTEST`/`HTTRANSPARENT` constants
- Add `WndProcHook` method
- Register hook in `ContentRendered` (after `InitTrayIcon()`)
- Revise `Window_MouseEnter`: add ghost path (no Ctrl+Alt check yet — always ghost)
- Revise `Window_MouseLeave`: add ghost restore path
- Verify: hovering makes widget invisible and click-through; moving mouse away restores
  widget at correct opacity; stats timer unaffected; drag inaccessible in ghost state
- Rationale: core mechanism verified in isolation before adding Ctrl+Alt branch

**Phase C — Ctrl+Alt interaction modifier**
- Add `Keyboard.Modifiers` check to `Window_MouseEnter`
- Wrap existing backdrop/fast-refresh path in `ctrlAltHeld` branch
- Verify: hovering without Ctrl+Alt → ghost; hovering with Ctrl+Alt → interactive with
  backdrop and fast-refresh; releasing Ctrl+Alt and hovering again → ghost

**Phases B and C can be merged** into a single implementation step. The total change is
~25 lines in two methods. The split is useful only if incremental human verification is
required between the two behaviors. Given the existing milestone's yolo config and the low
line count, merging into one phase is viable.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using WS_EX_TRANSPARENT Extended Style for Click-Through

**What:** Set `WS_EX_TRANSPARENT` via `SetWindowLong(hwnd, GWL_EXSTYLE, ...)` to make the
window permanently click-through.

**Why bad:** WS_EX_TRANSPARENT means the window never receives hit-test input. WPF
`MouseEnter` never fires. `MouseLeave` never fires. There is no restore trigger — the
widget is permanently click-through once the style is set. The feature requires conditional
click-through that can be toggled off when the mouse moves away.

**Instead:** Use the WM_NCHITTEST WndProc hook with `_ghostMode` guard. This is conditional
and reversible within the same message loop tick.

### Anti-Pattern 2: Using Visibility.Collapsed for Ghost Hide

**What:** Set `PhraseText.Visibility = Collapsed` (or the entire window `Visibility =
Hidden`) to hide the widget in ghost mode.

**Why bad:** `Visibility.Collapsed` removes the element from layout. `SizeToContent=
WidthAndHeight` would resize the window to 0, destroying the widget's position. When the
widget restores, the position would need to be re-applied (and `ActualWidth`/`ActualHeight`
are 0 when Collapsed, making clamp calculations unsafe). `Window.Visibility = Hidden`
hides the window but removes it from the compositor — it would not receive further
mouse messages to trigger `MouseLeave`.

**Instead:** `this.Opacity = 0` preserves the window geometry, position, and HWND.
The window is invisible (alpha 0 compositing) but maintains its layout and position.
WM_NCHITTEST (not Visibility) controls click-through.

### Anti-Pattern 3: Global Keyboard Hook for Ctrl+Alt Detection

**What:** Install `SetWindowsHookEx(WH_KEYBOARD_LL)` to track Ctrl+Alt keydown/up globally
and maintain a `_ctrlAltHeld` bool that `Window_MouseEnter` reads.

**Why bad:** Global keyboard hooks require unmanaged function pointers, a message pump on
a separate thread, and participation in the OS hook chain. Any exception in the callback
crashes the process silently. The hook must be uninstalled on application exit (cleanup
path). This is substantial complexity for a feature that needs modifier state only at one
specific moment (mouse entering the window).

**Instead:** `Keyboard.Modifiers` reads the current WPF modifier state synchronously and
accurately at the moment `Window_MouseEnter` fires. Zero additional infrastructure.

### Anti-Pattern 4: Touching _windowOpacity in Ghost Mode

**What:** Set `_windowOpacity = 0` in the ghost path alongside `this.Opacity = 0`.

**Why bad:** `_windowOpacity` is the source of truth for the user's configured opacity. It
is read by `SaveSettings()` and by the opacity preset checkmark sync in `ContextMenu_Opened`.
Setting it to 0 would either persist the ghost state to settings.json (making the widget
invisible on next launch) or corrupt the opacity preset checkmarks.

**Instead:** Only modify `this.Opacity`. The restore path reads `_windowOpacity` to
recover the correct value. The two variables serve distinct purposes and must not be
conflated.

### Anti-Pattern 5: Registering the WndProc Hook Before ContentRendered

**What:** Register `HwndSource.AddHook` in the `MainWindow()` constructor or in
`ApplySettings()`.

**Why bad:** `HwndSource.FromHwnd(hwnd)` requires a valid HWND. The HWND is not allocated
until the window is shown. `WindowInteropHelper(this).Handle` returns `IntPtr.Zero` before
`Show()` is called. Calling `FromHwnd(IntPtr.Zero)` returns null; `.AddHook` would throw
a `NullReferenceException`.

**Instead:** Register in `ContentRendered`, which fires after the first layout pass
following `Show()`. The existing HWND acquisition pattern (`Win32Window` for ColorDialog)
also happens at runtime (after `Show()`), not at construction time. This constraint is
consistent with all other post-show initialization in `ContentRendered`.

---

## Scalability / Long-Term Considerations

This is a single-window personal desktop widget. Ghost mode has no scalability surface —
it is a single bool field and a 5-line WndProc hook. The only runtime cost is one
`WM_NCHITTEST` message intercept per mouse-move event while the mouse is over the window,
which is a near-zero cost per message on the UI thread.

---

## Sources

| Claim | Source | Confidence |
|-------|--------|------------|
| WM_NCHITTEST HTTRANSPARENT (-1) routes mouse input to window beneath | https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest (2025-07-14) | HIGH |
| WS_EX_TRANSPARENT makes window permanently not receive mouse input | https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles (2025-07-14) | HIGH |
| WS_EX_LAYERED is already set by WPF AllowsTransparency=True | Standard WPF documentation; confirmed by existing codebase XAML | HIGH |
| HwndSource.AddHook adds a delegate to the WndProc chain; hooks held by weak reference | https://learn.microsoft.com/en-us/dotnet/api/system.windows.interop.hwndsource (2026-02-11) | HIGH |
| HwndSource.FromHwnd(hwnd) retrieves the HwndSource for the window | https://learn.microsoft.com/en-us/dotnet/api/system.windows.interop.hwndsource (2026-02-11) | HIGH |
| WndProc hook must be registered after window HWND is valid (post-Show) | Existing codebase pattern: Win32Window HWND adapter used at runtime in MenuThemeCustom_Click | HIGH |
| Keyboard.Modifiers reads current WPF modifier state synchronously | Standard WPF API; System.Windows.Input namespace | HIGH |
| WPF fires MouseLeave when WM_NCHITTEST returns HTTRANSPARENT (window stops receiving mouse-over messages) | Established WPF overlay pattern; deducible from WPF InputManager architecture | MEDIUM |
| Opacity=0 preserves window geometry and layout vs Visibility.Collapsed which destroys it | Existing codebase KEY DECISIONS: SizeToContent=WidthAndHeight resizes on Visibility change; ActualHeight=0 when Collapsed | HIGH |
| Pre-Show safety invariant: ContentRendered is the correct registration point for HwndSource.AddHook | Existing codebase ContentRendered pattern for all post-show initialization | HIGH |

---

*Architecture research for: FuzzyClock v2.3 — ghost mode (hover-hide + click-through + Ctrl+Alt)*
*Researched: 2026-03-02*
