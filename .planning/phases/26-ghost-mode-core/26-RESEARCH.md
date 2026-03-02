# Phase 26: Ghost Mode Core - Research

**Researched:** 2026-03-02
**Domain:** WPF transparent frameless overlay — WS_EX_TRANSPARENT click-through toggle, TrackMouseEvent/WM_MOUSELEAVE restore, hover-state synthetic cleanup
**Confidence:** HIGH (with one MEDIUM-confidence verification point for TrackMouseEvent post-transparency delivery)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GHOST-01 | When the mouse enters the widget area (left Ctrl+Alt not held — Ctrl+Alt is Phase 27), the widget becomes fully invisible (Opacity=0) and click-through — mouse events pass to underlying windows | WS_EX_TRANSPARENT + Opacity=0 together; WS_EX_LAYERED (set by AllowsTransparency=True) must be preserved via OR, not replace; SetWindowPos(SWP_FRAMECHANGED) flushes the style change |
| GHOST-02 | When the mouse leaves the widget area, the widget restores its configured opacity and stops being click-through | TrackMouseEvent(TME_LEAVE) registered before WS_EX_TRANSPARENT applied; WM_MOUSELEAVE handled in HwndSource.AddHook hook; restore: clear WS_EX_TRANSPARENT, SetWindowPos(SWP_FRAMECHANGED), Opacity=_windowOpacity; fallback: DispatcherTimer 50–100ms polling Mouse.GetPosition(this) against ActualWidth/ActualHeight |
| GHOST-03 | While ghost mode is active (widget invisible), hover backdrop and hover fast-refresh do not activate | Ghost path in Window_MouseEnter exits early before backdrop/timer code; _isHoverFastRefresh never set; stats timer unaffected; synthetic MouseLeave cleanup runs before WS_EX_TRANSPARENT is applied |
</phase_requirements>

---

## Summary

Phase 26 implements the core ghost mode lifecycle: on MouseEnter the widget becomes fully invisible and click-through; when the mouse physically leaves the widget area the widget restores to its configured state. Phase 26 does NOT include Ctrl+Alt suppression (Phase 27 adds that as a one-line prepend to Window_MouseEnter). Phase 26 is always-on ghost mode: every MouseEnter triggers ghost.

The implementation is entirely within `MainWindow.xaml.cs` (modified) and adds zero new files, zero new NuGet packages, and zero csproj changes. All required Win32 APIs are in `user32.dll`, which is always present on Windows. The total code delta is approximately 30 new/changed lines of C#.

The core mechanism uses `WS_EX_TRANSPARENT` (extended window style) ORed onto the existing style via `SetWindowLong`, followed by `SetWindowPos(SWP_FRAMECHANGED)` to flush the change. `WS_EX_TRANSPARENT` combined with the already-present `WS_EX_LAYERED` (set by WPF's `AllowsTransparency=True`) causes the OS to exclude the HWND from hit-testing entirely. `Opacity=0` handles visual invisibility. Both must be applied together. Neither alone is sufficient.

The one MEDIUM-confidence item is whether `TrackMouseEvent` delivers `WM_MOUSELEAVE` after `WS_EX_TRANSPARENT` is applied. The docs state tracking is HWND-keyed; the registration is made while the window is still hit-testable; the expectation is that `WM_MOUSELEAVE` will arrive when the cursor exits the HWND rectangle. However, this specific post-transparency delivery is not explicitly documented. The executor must verify this experimentally and fall back to a `DispatcherTimer` polling `Mouse.GetPosition(this)` against `ActualWidth`/`ActualHeight` if `WM_MOUSELEAVE` does not fire.

**Primary recommendation:** Implement the two-phase protocol — register `TrackMouseEvent(TME_LEAVE)` before applying `WS_EX_TRANSPARENT`, handle `WM_MOUSELEAVE` in the existing `HwndSource.AddHook` hook. Run synthetic MouseLeave cleanup (backdrop, timer, `_isHoverFastRefresh`) unconditionally before applying `WS_EX_TRANSPARENT`. If TrackMouseEvent does not deliver post-transparency, switch to the DispatcherTimer fallback — both paths are fully specified below.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `user32.dll` — `GetWindowLong` / `SetWindowLong` | Win32 (all Windows) | Read and write `GWL_EXSTYLE` to toggle `WS_EX_TRANSPARENT` | Only runtime mechanism to add/remove extended window styles on an existing HWND. WPF has no managed API for this. |
| `user32.dll` — `SetWindowPos` | Win32 (all Windows) | Flush extended style change to the window manager | Explicitly required by Microsoft SetWindowPos docs after any `SetWindowLong` call. Without it, `WS_EX_TRANSPARENT` may not apply reliably. |
| `user32.dll` — `TrackMouseEvent` + `WM_MOUSELEAVE` | Win32 (all Windows) | OS-level notification when cursor leaves HWND rectangle, even after WS_EX_TRANSPARENT is set | HWND-keyed tracking; one-shot; zero polling cost; registered before going transparent so the OS records the tracking before mouse messages stop. |
| `System.Windows.Interop.HwndSource.AddHook` | .NET 10 | Receives `WM_MOUSELEAVE` in WndProc chain | Already established in project (used since ColorDialog HWND adapter in v2.0). No new infrastructure. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `DispatcherTimer` (WPF) | .NET 10 | Fallback restore-polling if TrackMouseEvent does not deliver WM_MOUSELEAVE post-transparency | Use if TrackMouseEvent verification fails during execution. 50–100ms interval. Fires on UI thread — safe for SetWindowLong. |
| `WindowInteropHelper(this).Handle` | .NET 10 | Get main window HWND | Always use this inside MainWindow methods — gives the correct window HWND, not the hidden owner window's HWND. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WS_EX_TRANSPARENT via SetWindowLong | WM_NCHITTEST returning HTTRANSPARENT | HTTRANSPARENT only routes to same-thread windows; desktop/Explorer are on different threads and never receive the click. WS_EX_TRANSPARENT is the only cross-thread mechanism. REJECTED — see Pitfall 2 in PITFALLS.md. |
| TrackMouseEvent + WM_MOUSELEAVE | DispatcherTimer polling Mouse.GetPosition | Polling adds latency up to poll interval, wastes CPU. Use only as fallback if TrackMouseEvent fails. |
| Opacity=0 + WS_EX_TRANSPARENT | Visibility.Collapsed / Window.Visibility=Hidden | Collapsed triggers SizeToContent resize to 0 (ActualWidth/ActualHeight become 0, breaking clamp). Hidden removes from compositor. Opacity=0 preserves geometry, position, and HWND. |

**No new NuGet packages. No csproj changes.**

---

## Architecture Patterns

### Existing Code Baseline (Phase 26 Integrates Into This)

```
ContentRendered wires:
  this.MouseEnter += Window_MouseEnter
  this.MouseLeave += Window_MouseLeave

Window_MouseEnter (lines 484–498, current):
  1. ContentBorder.Background = semi-transparent dark (always)
  2. if StatsPanel visible: stop timer, 0.5s interval, restart, _isHoverFastRefresh=true

Window_MouseLeave (lines 501–516, current):
  1. ContentBorder.Background = Transparent (always)
  2. if StatsPanel visible: stop timer, restore interval, restart, _isHoverFastRefresh=false

_windowOpacity field: user-configured opacity (written by SetOpacity/scroll wheel)
this.Opacity: actual window alpha (set to 0 during ghost, restored from _windowOpacity)
ContentBorder.Background: hover backdrop (set/cleared by MouseEnter/MouseLeave)
Grid Background="#01000000": near-transparent hit-test surface — MUST NOT be changed
```

### New Fields to Add

```csharp
// Ghost mode state
private bool   _isGhostMode = false;  // true while Opacity=0 + WS_EX_TRANSPARENT active
private IntPtr _hwnd;                 // cached in ContentRendered; avoids repeated WindowInteropHelper allocations

// P/Invoke constants
private const int  GWL_EXSTYLE       = -20;
private const int  WS_EX_TRANSPARENT = 0x00000020;
private const uint SWP_NOSIZE        = 0x0001;
private const uint SWP_NOMOVE        = 0x0002;
private const uint SWP_NOZORDER      = 0x0004;
private const uint SWP_FRAMECHANGED  = 0x0020;
private const uint TME_LEAVE         = 0x00000002;
private const int  WM_MOUSELEAVE     = 0x02A3;
```

### P/Invoke Declarations (Complete Block)

```csharp
// --- Ghost Mode P/Invoke (v2.3) ---
using System.Runtime.InteropServices;

[DllImport("user32.dll", SetLastError = true)]
private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

[DllImport("user32.dll", SetLastError = true)]
private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

[DllImport("user32.dll", SetLastError = true)]
private static extern bool SetWindowPos(
    IntPtr hWnd, IntPtr hWndInsertAfter,
    int X, int Y, int cx, int cy, uint uFlags);

[DllImport("user32.dll")]
private static extern bool TrackMouseEvent(ref TRACKMOUSEEVENT lpEventTrack);

[StructLayout(LayoutKind.Sequential)]
private struct TRACKMOUSEEVENT
{
    public uint   cbSize;
    public uint   dwFlags;
    public IntPtr hwndTrack;
    public uint   dwHoverTime;
}
```

### Pattern 1: Ghost Activation in Window_MouseEnter

Phase 26 is always-on ghost (no Ctrl+Alt check — that is Phase 27). `Window_MouseEnter` becomes:

```csharp
private void Window_MouseEnter(object sender, MouseEventArgs e)
{
    // Ghost mode activation — always-on in Phase 26 (Phase 27 adds Ctrl+Alt check here)

    // Step 1: Run synthetic MouseLeave cleanup BEFORE going click-through.
    // WS_EX_TRANSPARENT will stop WM_MOUSELEAVE delivery immediately.
    // Backdrop and timer state must be clean before we disappear.
    ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
    if (StatsPanel.Visibility == Visibility.Visible && _statsTimer != null)
    {
        _statsTimer.Stop();
        _statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
        _statsTimer.Start();
    }
    _isHoverFastRefresh = false;

    // Step 2: Register leave tracking BEFORE applying WS_EX_TRANSPARENT.
    // TrackMouseEvent is HWND-keyed. OS will still deliver WM_MOUSELEAVE
    // when cursor exits window rectangle even after we go transparent.
    // (MEDIUM confidence — verify experimentally; fall back to DispatcherTimer if needed)
    var tme = new TRACKMOUSEEVENT
    {
        cbSize      = (uint)Marshal.SizeOf<TRACKMOUSEEVENT>(),
        dwFlags     = TME_LEAVE,
        hwndTrack   = _hwnd,
        dwHoverTime = 0
    };
    TrackMouseEvent(ref tme);

    // Step 3: Apply WS_EX_TRANSPARENT + set Opacity=0
    _isGhostMode = true;
    int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
    SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
    SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
    this.Opacity = 0.0;
}
```

### Pattern 2: Ghost Restore via WndProc Hook (WM_MOUSELEAVE)

The `WndProc` hook handles `WM_MOUSELEAVE` to restore the widget. Registration is in `ContentRendered` after `InitTrayIcon()`:

```csharp
// In ContentRendered (after InitTrayIcon()):
_hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
System.Windows.Interop.HwndSource.FromHwnd(_hwnd).AddHook(WndProcHook);
```

The hook method:

```csharp
private IntPtr WndProcHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
{
    if (msg == WM_MOUSELEAVE && _isGhostMode)
    {
        // Restore from ghost mode
        _isGhostMode = false;
        int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
        SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
        SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        this.Opacity = _windowOpacity;
        // Note: ContentBorder.Background was already cleared in Window_MouseEnter
        // before ghost was applied. Defensive clear below for safety.
        ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
        handled = true;
    }
    return IntPtr.Zero;
}
```

**Important:** `WndProcHook` also handles any future messages. For Phase 26 it only needs to handle `WM_MOUSELEAVE`. The ghost `_isGhostMode` guard prevents spurious firing — `WM_MOUSELEAVE` fires in non-ghost scenarios too (normal hover-out without ghost mode active, in sessions where Window_MouseLeave handles it instead). The guard ensures only the ghost-mode path processes it here; normal MouseLeave events that arrive when `_isGhostMode = false` are ignored and fall through to the WPF `Window_MouseLeave` handler.

### Pattern 3: Modified Window_MouseLeave

With ghost mode active, `Window_MouseLeave` may still fire in edge cases (e.g., if WM_MOUSELEAVE arrives via WPF routing instead of the WndProc hook). Add a guard:

```csharp
private void Window_MouseLeave(object sender, MouseEventArgs e)
{
    // Ghost mode: if restore already happened via WndProcHook, _isGhostMode is false.
    // If somehow Window_MouseLeave fires while in ghost mode (edge case), do nothing —
    // the WndProcHook path handles ghost restore. The existing hover-restore below
    // would incorrectly try to restore timer/backdrop from a state that was never set.
    if (_isGhostMode) return;

    // Existing hover restore path (unchanged):
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

### Pattern 4: DispatcherTimer Fallback (if TrackMouseEvent does not deliver post-transparency)

If testing shows WM_MOUSELEAVE does not arrive after WS_EX_TRANSPARENT is applied, replace the TrackMouseEvent + WndProcHook restore path with a polling timer:

```csharp
// New field:
private DispatcherTimer? _ghostRestoreTimer;

// In ContentRendered (instead of HwndSource.AddHook for WM_MOUSELEAVE):
_ghostRestoreTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(75) };
_ghostRestoreTimer.Tick += (_, _) =>
{
    if (!_isGhostMode) return;
    var pos = Mouse.GetPosition(this);
    // Mouse has left if position is outside 0..ActualWidth, 0..ActualHeight
    if (pos.X < 0 || pos.X > ActualWidth || pos.Y < 0 || pos.Y > ActualHeight)
    {
        _ghostRestoreTimer!.Stop();
        _isGhostMode = false;
        int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
        SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
        SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        this.Opacity = _windowOpacity;
        ContentBorder.Background = System.Windows.Media.Brushes.Transparent;
    }
};

// In Window_MouseEnter ghost path (instead of TrackMouseEvent call):
_ghostRestoreTimer!.Start();
```

**DispatcherTimer is safe for SetWindowLong** — it fires on the UI thread by design. Do not use `System.Threading.Timer` or `Task.Delay` for this path.

### Anti-Patterns to Avoid

- **Replace style flags instead of ORing:** `SetWindowLong(hwnd, GWL_EXSTYLE, WS_EX_TRANSPARENT)` removes `WS_EX_LAYERED` (breaks transparency — widget gets solid background) and `WS_EX_TOOLWINDOW` (widget reappears in Alt+Tab). Always read first: `GetWindowLong` then OR/AND.
- **Apply Opacity=0 without WS_EX_TRANSPARENT:** HWND remains hit-testable. Clicks still reach the widget. Not click-through.
- **Apply WS_EX_TRANSPARENT without Opacity=0:** Widget is click-through but still visually rendered. Visible but untouchable — confusing.
- **Use Visibility.Collapsed for ghost hide:** Triggers SizeToContent resize to 0. Destroys position.
- **Modify `_windowOpacity` in ghost path:** `_windowOpacity` is the user's configured opacity written to settings.json. Conflating it with the ghost state would persist Opacity=0 to disk or corrupt context menu checkmarks.
- **Touch `Grid.Background` (#01000000):** This near-transparent background provides the hit-test surface for right-click and drag on transparent regions. Must remain unchanged at all times.
- **Modify `ContentBorder.Background` to signal ghost state:** It is already used for hover backdrop management. Ghost state must be tracked via `_isGhostMode` bool only.
- **Call `SetWindowLong` from background threads:** Win32 HWND operations must run on the UI (Dispatcher) thread. `DispatcherTimer` is safe. `Task.Delay` / `System.Threading.Timer` are not.
- **Register HwndSource.AddHook before ContentRendered:** `WindowInteropHelper(this).Handle` returns `IntPtr.Zero` before Show(). `FromHwnd(IntPtr.Zero)` returns null; `.AddHook` throws NullReferenceException. Always register in ContentRendered.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Click-through toggle | Custom WM_NCHITTEST HTTRANSPARENT hook | WS_EX_TRANSPARENT via SetWindowLong | HTTRANSPARENT only routes to same-thread windows; desktop/Explorer are on different threads. WS_EX_TRANSPARENT operates before WM_NCHITTEST is generated. |
| Mouse-leave detection from transparent state | Global mouse hook (SetWindowsHookEx WH_MOUSE_LL) | TrackMouseEvent + WM_MOUSELEAVE | Global hooks are flagged by antivirus, degrade system-wide input responsiveness, and require careful cleanup on crash. TrackMouseEvent is the OS-correct mechanism — zero polling cost. |
| Mouse-leave detection (fallback) | Custom bounding box calc with GetCursorPos | DispatcherTimer polling Mouse.GetPosition(this) | Mouse.GetPosition(this) returns relative coordinates to the window — no manual screen-to-window coordinate translation needed. |
| Extended style management | Cached style value field | Always GetWindowLong before SetWindowLong | Other code paths may change the extended style. Always read fresh to avoid race conditions with WPF internals. |

**Key insight:** The entire ghost mechanism is 30 lines of P/Invoke declarations + one field + two method changes. There is no library or abstraction worth adding — raw Win32 P/Invoke is the correct and minimal approach.

---

## Common Pitfalls

### Pitfall 1: WS_EX_TRANSPARENT Replace Instead of OR
**What goes wrong:** `SetWindowLong(hwnd, GWL_EXSTYLE, WS_EX_TRANSPARENT)` removes `WS_EX_LAYERED` (used by WPF for AllowsTransparency) and `WS_EX_TOOLWINDOW` (hides from Alt+Tab). Widget background turns solid; widget reappears in Alt+Tab.
**How to avoid:** Always `GetWindowLong` first; then `exStyle | WS_EX_TRANSPARENT` to enable, `exStyle & ~WS_EX_TRANSPARENT` to disable.
**Warning signs:** Widget background turns solid after enabling click-through. Widget in Alt+Tab after enabling click-through.

### Pitfall 2: Hover State Not Cleaned Up Before WS_EX_TRANSPARENT
**What goes wrong:** `Window_MouseLeave` does not fire after `WS_EX_TRANSPARENT` is applied. `ContentBorder.Background` stays semi-transparent dark. Stats timer stays at 0.5s. `_isHoverFastRefresh` stays true. After ghost mode ends, backdrop visible without any hover.
**How to avoid:** Run full MouseLeave cleanup (backdrop clear, timer interval restore, `_isHoverFastRefresh = false`) unconditionally in `Window_MouseEnter` BEFORE calling `SetWindowLong`. No exceptions.
**Warning signs:** After ghost deactivates, backdrop shows immediately without new mouse-enter. Stats at 0.5s without hover.

### Pitfall 3: TrackMouseEvent Not Delivering WM_MOUSELEAVE Post-Transparency (MEDIUM confidence)
**What goes wrong:** The WndProcHook never receives `WM_MOUSELEAVE` after `WS_EX_TRANSPARENT` is applied. Widget stays invisible indefinitely. Mouse cannot leave ghost mode.
**Why it may happen:** TrackMouseEvent tracks by HWND identity; whether the OS delivers WM_MOUSELEAVE when the window is `WS_EX_TRANSPARENT` is not explicitly documented.
**How to handle:** Verify experimentally during execution. If WM_MOUSELEAVE does not arrive within a reasonable time of moving the mouse off the widget area, switch to the DispatcherTimer fallback (Pattern 4 above).
**Warning signs:** Widget stays invisible even after moving mouse far off the widget area. WM_MOUSELEAVE never observed in WndProcHook.

### Pitfall 4: Wrong HWND (Hidden Owner Window)
**What goes wrong:** `WS_EX_TRANSPARENT` applied to the hidden owner window HWND, not the main window. No observable change to click-through behavior.
**How to avoid:** Always `new System.Windows.Interop.WindowInteropHelper(this).Handle` inside `MainWindow` methods. Cache it in `_hwnd` in ContentRendered. Never use `Application.Current.Windows` enumeration — it includes the hidden owner window.
**Warning signs:** Widget still interactive after ghost mode should be active. SetWindowLong returns no error but has no effect.

### Pitfall 5: MouseEnter Re-Fires When WS_EX_TRANSPARENT Is Removed
**What goes wrong:** When WS_EX_TRANSPARENT is cleared (restore path), Windows resumes mouse message delivery. If the cursor is still over the widget, `WM_MOUSEMOVE` arrives immediately and WPF fires `Window_MouseEnter` again. In Phase 26 (always-on ghost), this is correct — re-entry immediately re-triggers ghost mode for the same hover session. This is not a bug; it is expected behavior. Document it to avoid confusion.
**How to handle:** The state machine handles this correctly by design. After restore, if the mouse is still over the widget, `Window_MouseEnter` fires again and immediately re-ghosts. The user sees a brief flash of the widget. This is acceptable in Phase 26 (Phase 27's Ctrl+Alt check will allow the user to hold the modifier and prevent re-ghosting).

### Pitfall 6: _isGhostMode Guard in Window_MouseLeave Required
**What goes wrong:** Without an `_isGhostMode` guard at the top of `Window_MouseLeave`, a stale `Window_MouseLeave` event (from WPF's event queue after ghost is activated) could execute the hover-restore path even though ghost cleanup already ran in `Window_MouseEnter`. This would try to restore a stats timer that was never accelerated, or re-clear a backdrop that was never set.
**How to avoid:** Add `if (_isGhostMode) return;` at the top of `Window_MouseLeave`. The WndProcHook handles WM_MOUSELEAVE for the ghost restore path.

---

## Code Examples

### Complete P/Invoke Block (verified against official docs, 2025–2026)

```csharp
// Source: learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlongptrw
[DllImport("user32.dll", SetLastError = true)]
private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

// Source: learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlongptrw
[DllImport("user32.dll", SetLastError = true)]
private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

// Source: learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos
[DllImport("user32.dll", SetLastError = true)]
private static extern bool SetWindowPos(
    IntPtr hWnd, IntPtr hWndInsertAfter,
    int X, int Y, int cx, int cy, uint uFlags);

// Source: learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-trackmouseevent
[DllImport("user32.dll")]
private static extern bool TrackMouseEvent(ref TRACKMOUSEEVENT lpEventTrack);

[StructLayout(LayoutKind.Sequential)]
private struct TRACKMOUSEEVENT
{
    public uint   cbSize;
    public uint   dwFlags;
    public IntPtr hwndTrack;
    public uint   dwHoverTime;
}

// Constants
private const int  GWL_EXSTYLE       = -20;           // Source: GetWindowLong docs
private const int  WS_EX_TRANSPARENT = 0x00000020;    // Source: Extended Window Styles docs (2025-07-14)
private const uint SWP_NOSIZE        = 0x0001;
private const uint SWP_NOMOVE        = 0x0002;
private const uint SWP_NOZORDER      = 0x0004;
private const uint SWP_FRAMECHANGED  = 0x0020;        // Source: SetWindowPos docs (2025-07-01)
private const uint TME_LEAVE         = 0x00000002;    // Source: TrackMouseEvent docs
private const int  WM_MOUSELEAVE     = 0x02A3;        // Source: WM_MOUSELEAVE docs
```

### Enable Click-Through

```csharp
// Source: PITFALLS.md Pitfall 1 + STACK.md P/Invoke section (verified official docs)
int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
this.Opacity = 0.0;
```

### Disable Click-Through (restore)

```csharp
int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
this.Opacity = _windowOpacity;
```

### TrackMouseEvent Registration (before WS_EX_TRANSPARENT)

```csharp
// Source: STACK.md TrackMouseEvent section (official docs 2026-01-verified)
var tme = new TRACKMOUSEEVENT
{
    cbSize      = (uint)Marshal.SizeOf<TRACKMOUSEEVENT>(),
    dwFlags     = TME_LEAVE,
    hwndTrack   = _hwnd,
    dwHoverTime = 0
};
TrackMouseEvent(ref tme);
```

### HwndSource.AddHook Registration (in ContentRendered)

```csharp
// Source: learn.microsoft.com/en-us/dotnet/api/system.windows.interop.hwndsource (2026-02-11)
// After InitTrayIcon():
_hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
System.Windows.Interop.HwndSource.FromHwnd(_hwnd).AddHook(WndProcHook);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| WM_NCHITTEST HTTRANSPARENT for desktop pass-through | WS_EX_TRANSPARENT via SetWindowLong | HTTRANSPARENT only works for same-thread windows. WS_EX_TRANSPARENT is the OS-level mechanism that works cross-thread. |
| WPF MouseLeave as restore trigger | TrackMouseEvent + WM_MOUSELEAVE in WndProc hook | WPF MouseLeave does not fire after WS_EX_TRANSPARENT is applied. WM_MOUSELEAVE from TrackMouseEvent arrives even when the window does not receive normal mouse events. |
| Visibility.Collapsed for hide | Opacity=0 | Collapsed destroys geometry (SizeToContent resizes to 0). Opacity=0 preserves all layout and position. |

**Deprecated/outdated:**
- `WM_NCHITTEST HTTRANSPARENT` for desktop-level click-through: rejected definitively. Only WS_EX_TRANSPARENT achieves cross-thread pass-through.
- `Keyboard.IsKeyDown` for modifier detection when window has no focus: stale WPF state. Use `GetAsyncKeyState` (Phase 27).

---

## Open Questions

1. **TrackMouseEvent WM_MOUSELEAVE delivery after WS_EX_TRANSPARENT**
   - What we know: TrackMouseEvent is documented as HWND-keyed. Tracking registered before going transparent. WM_MOUSELEAVE should fire when cursor exits HWND rectangle.
   - What's unclear: Microsoft docs do not explicitly state whether the delivery continues after WS_EX_TRANSPARENT is set. This specific combination is not documented.
   - Recommendation: Implement TrackMouseEvent primary path first. Test immediately: apply ghost, move mouse off widget, observe if WndProcHook receives WM_MOUSELEAVE. If not received within 200ms of cursor clearly outside widget bounds, switch to DispatcherTimer fallback (fully specified in Pattern 4 above). Both paths are ready.

2. **Phase 27 integration point in Window_MouseEnter**
   - What we know: Phase 27 adds a single `if (IsCtrlAltHeld()) { ... existing hover path ... return; }` check prepended to `Window_MouseEnter` before the ghost activation code.
   - What's unclear: nothing — the integration point is clear. Phase 26 leaves this explicitly for Phase 27 with a `// Phase 27: add Ctrl+Alt check here` comment.
   - Recommendation: Add the comment in Phase 26 so the Phase 27 plan has a clear insertion target.

---

## Implementation Checklist (What Must Be TRUE)

Per phase success criteria:

- [ ] Mouse enters widget → widget immediately becomes Opacity=0 + WS_EX_TRANSPARENT (invisible and click-through)
- [ ] Mouse leaves widget area → widget restores to configured opacity, WS_EX_TRANSPARENT removed, fully interactive
- [ ] Ghost active → ContentBorder.Background is Transparent (not hover-backdrop dark)
- [ ] Ghost active → stats timer running at configured interval (not 0.5s fast-refresh)
- [ ] Ghost active → _isHoverFastRefresh is false
- [ ] After ghost restore → drag works (left-click-drag moves widget)
- [ ] After ghost restore → right-click works (context menu opens)
- [ ] After ghost restore → scroll wheel works (opacity changes)
- [ ] WS_EX_LAYERED preserved after enable/disable cycle (widget transparency intact)
- [ ] WS_EX_TOOLWINDOW preserved after enable/disable cycle (widget not in Alt+Tab)
- [ ] _windowOpacity not modified during ghost (settings.json preserves correct opacity)
- [ ] Grid.Background (#01000000) not modified
- [ ] HwndSource.AddHook registered in ContentRendered (not constructor)
- [ ] _hwnd is main window HWND (not hidden owner HWND)
- [ ] SetWindowLong called on UI thread only

---

## Sources

### Primary (HIGH confidence)
- `MainWindow.xaml.cs` — existing `Window_MouseEnter` (lines 484–498), `Window_MouseLeave` (lines 501–516), `_windowOpacity`, `ContentBorder`, `_isHoverFastRefresh`, `_statsTimer`, `ContentRendered` pattern, HWND acquisition via `WindowInteropHelper` — read directly from source 2026-03-02
- `MainWindow.xaml` — `AllowsTransparency="True"`, `Background="#01000000"` hit-test trick, `SizeToContent="WidthAndHeight"`, `ContentBorder` element — read directly from source 2026-03-02
- Microsoft Win32 — Extended Window Styles: `WS_EX_TRANSPARENT = 0x00000020`; "the shape of the layered window will be ignored and the mouse events will be passed to other windows underneath" — learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles (updated 2025-07-14)
- Microsoft Win32 — Window Features / Layered Windows: `WS_EX_TRANSPARENT` with `WS_EX_LAYERED` = click-through behavior — learn.microsoft.com/en-us/windows/win32/winmsg/window-features (updated 2026-02-21)
- Microsoft Win32 — SetWindowPos Remarks: `SWP_FRAMECHANGED` required after any `SetWindowLong` call — learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos (updated 2025-07-01)
- Microsoft Win32 — GetWindowLongPtr / `GWL_EXSTYLE = -20` — learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlongptrw
- Microsoft Win32 — TrackMouseEvent + `TME_LEAVE`; `WM_MOUSELEAVE = 0x02A3` — learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-trackmouseevent
- Microsoft Win32 — WM_NCHITTEST same-thread constraint: HTTRANSPARENT = routes to "underlying windows in the same thread" — learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest (updated 2025-07-14)
- Microsoft .NET 10 — HwndSource.AddHook delegate signature — learn.microsoft.com/en-us/dotnet/api/system.windows.interop.hwndsource.addhook (updated 2026-02-11)
- `.planning/research/SUMMARY.md` — authoritative adjudication of WS_EX_TRANSPARENT vs HTTRANSPARENT; TrackMouseEvent fallback specification — project research 2026-03-02
- `.planning/research/PITFALLS.md` — Pitfalls 1–7 covering OR-not-replace, MouseLeave cleanup ordering, ghost state management, HWND selection, UI thread requirement — project research 2026-03-02
- `.planning/research/STACK.md` — Complete P/Invoke declarations, constants, two-phase protocol, DispatcherTimer fallback spec — project research 2026-03-02

### Secondary (MEDIUM confidence)
- TrackMouseEvent WM_MOUSELEAVE delivery after WS_EX_TRANSPARENT applied — HWND-keyed per docs; delivery post-transparency not explicitly stated; verify experimentally during execution (MEDIUM — documented gap in SUMMARY.md and STATE.md)
- WPF MouseLeave firing from WS_EX_TRANSPARENT removal (re-entry after restore) — deducible from WPF InputManager architecture; restart of mouse tracking when HWND becomes hit-testable again (MEDIUM — functional inference)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all P/Invoke APIs sourced from official Microsoft docs with verified constant values; no new dependencies; zero csproj changes
- Architecture patterns: HIGH — patterns directly derived from existing source code inspection and prior research; WS_EX_TRANSPARENT mechanism confirmed by official docs
- Pitfalls: HIGH — all pitfalls grounded in direct source code reading (existing hover event pipeline) and official Win32/WPF docs; mitigations are concrete and actionable
- TrackMouseEvent post-transparency delivery: MEDIUM — documented gap, verified fallback specified; must confirm experimentally

**Research date:** 2026-03-02
**Valid until:** Stable Win32 APIs — no expiry concern. TrackMouseEvent finding requires experimental verification during Phase 26 execution.
