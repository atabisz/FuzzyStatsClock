# Technology Stack: v2.3 Ghost Mode

**Project:** FuzzyClock — hover-hide (Opacity=0 + click-through) and Ctrl+Alt interaction modifier
**Researched:** 2026-03-02
**Scope:** Additions only — existing validated stack is unchanged
**Confidence:** HIGH

---

## What Changes vs v2.2

v2.2 stack (already validated, not re-researched):
- .NET 10, C# 13, WPF (`net10.0-windows`)
- `AllowsTransparency=True` / `WindowStyle=None` transparent frameless overlay
- `WindowInteropHelper` for HWND access
- `HwndSource.FromHwnd(hwnd)` + `HwndSource.AddHook` for Win32 message interception
- `UseWindowsForms=true` (System.Drawing, NotifyIcon active since v2.0)
- `Window.Opacity` property for whole-window opacity
- WPF `MouseEnter` / `MouseLeave` events (used for hover-fast-refresh and backdrop)
- `System.Text.Json` for settings persistence
- `System.Diagnostics.PerformanceCounter` NuGet 10.0.0

v2.3 stack additions:

| Layer | What's Added | csproj Change |
|-------|-------------|---------------|
| Click-through toggle | `GetWindowLong` + `SetWindowLong` P/Invoke to read/write `WS_EX_TRANSPARENT` on `GWL_EXSTYLE` | None — `user32.dll` always available |
| Style flush | `SetWindowPos` P/Invoke with `SWP_FRAMECHANGED` to commit extended style change | None — `user32.dll` |
| Mouse-leave from transparent state | `TrackMouseEvent` P/Invoke + `WM_MOUSELEAVE` handler in `HwndSource` hook | None — `user32.dll` |
| Modifier key check | `GetAsyncKeyState` P/Invoke, checked in `MouseEnter` handler | None — `user32.dll` |
| AppSettings extension | One new `bool` init-property: `GhostModeEnabled` | None — same pattern |

**Zero new NuGet packages. Zero csproj changes.**

---

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `GetWindowLong` / `SetWindowLong` (user32.dll) | Win32 (all Windows versions) | Read and write the extended window style to toggle `WS_EX_TRANSPARENT` | The only way to add/remove `WS_EX_TRANSPARENT` on an existing HWND at runtime. WPF has no managed API for extended window styles. `SetWindowLong` with `GWL_EXSTYLE` is the canonical Win32 mechanism. Use `GetWindowLong` first to preserve existing style bits. |
| `SetWindowPos` (user32.dll) | Win32 (all Windows versions) | Flush the extended style change to the window manager | Per Microsoft docs: "If you have changed certain window data using SetWindowLong, you must call SetWindowPos for the changes to take effect." Required flags: `SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED`. Without this call, `WS_EX_TRANSPARENT` may not apply reliably. |
| `TrackMouseEvent` (user32.dll) + `WM_MOUSELEAVE` | Win32 (all Windows versions) | Receive notification when mouse leaves the widget's HWND rectangle, even while the window is transparent and click-through | When `WS_EX_TRANSPARENT` is active, the window does not receive mouse events, so WPF's `MouseLeave` will never fire. `TrackMouseEvent` registers a one-shot OS-level notification tied to the HWND, not the hit-test state. The OS posts `WM_MOUSELEAVE` when the cursor exits the window's rectangle regardless of hit-test eligibility. Received via existing `HwndSource.AddHook` — zero new infrastructure. |
| `GetAsyncKeyState` (user32.dll) | Win32 (all Windows versions) | Check physical Ctrl+Alt key state in `MouseEnter` handler | WPF's `Keyboard.IsKeyDown` only reflects state when the WPF window has keyboard focus. The transparent overlay does not normally hold focus. `GetAsyncKeyState` checks physical key state independently of focus, returning a `SHORT` whose MSB indicates the key is currently down. |

---

## Win32 P/Invoke Declarations

### 1. GetWindowLong — Read Current Extended Style

**Purpose:** Read `GWL_EXSTYLE` before OR-ing in `WS_EX_TRANSPARENT`, preserving all existing style bits.

**Source:** [Microsoft Docs — GetWindowLongPtrW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlongptrw) (HIGH confidence)

```csharp
[DllImport("user32.dll", SetLastError = true)]
private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
```

**Note:** In C# P/Invoke, `GetWindowLong` (not `GetWindowLongPtr`) is the correct name. The CLR marshals it correctly for both 32-bit and 64-bit processes. `GWL_EXSTYLE = -20` (documented constant value).

---

### 2. SetWindowLong — Toggle WS_EX_TRANSPARENT

**Purpose:** Add `WS_EX_TRANSPARENT` to enter ghost mode; remove it to restore interactive mode.

**Source:** [Microsoft Docs — SetWindowLongPtrW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlongptrw) (HIGH confidence)

```csharp
[DllImport("user32.dll", SetLastError = true)]
private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
```

**Why `WS_EX_TRANSPARENT` and not just `Opacity=0`:** Setting `Window.Opacity=0` makes the window visually invisible but the HWND remains fully hit-testable. The OS still delivers `WM_NCHITTEST` to it and it intercepts clicks. `WS_EX_TRANSPARENT` instructs the OS to exclude this window from hit-testing entirely, passing mouse events to whatever is underneath. Both are required together: `Opacity=0` for visual invisibility, `WS_EX_TRANSPARENT` for input pass-through.

**Sequence to enter ghost mode (in MouseEnter, when Ctrl+Alt not held):**
```csharp
// 1. Register leave notification BEFORE going transparent
var tme = new TRACKMOUSEEVENT
{
    cbSize    = (uint)Marshal.SizeOf<TRACKMOUSEEVENT>(),
    dwFlags   = TME_LEAVE,
    hwndTrack = _hwnd,
    dwHoverTime = 0
};
TrackMouseEvent(ref tme);

// 2. Set transparent + invisible
int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
this.Opacity = 0.0;
```

**Sequence to restore (in WM_MOUSELEAVE handler):**
```csharp
this.Opacity = _savedUserOpacity;
int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
```

---

### 3. SetWindowPos — Flush Style Change

**Purpose:** Commit the `GWL_EXSTYLE` change to the window manager. Required by Windows after any `SetWindowLong` call.

**Source:** [Microsoft Docs — SetWindowPos, Remarks section](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos) (HIGH confidence — explicitly documented requirement)

```csharp
[DllImport("user32.dll", SetLastError = true)]
private static extern bool SetWindowPos(
    IntPtr hWnd,
    IntPtr hWndInsertAfter,
    int X, int Y, int cx, int cy,
    uint uFlags);
```

**Call pattern (no geometry change, flush style only):**
```csharp
SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
```

`SWP_FRAMECHANGED = 0x0020` triggers `WM_NCCALCSIZE` and flushes the cached window data. This is the exact combination documented in the SetWindowPos Remarks: "Use the following combination for uFlags: `SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED`."

---

### 4. TrackMouseEvent — Subscribe to WM_MOUSELEAVE

**Purpose:** Register a one-shot OS notification that fires `WM_MOUSELEAVE` when the mouse cursor exits the widget's HWND rectangle — even after `WS_EX_TRANSPARENT` has been set.

**Source:** [Microsoft Docs — TrackMouseEvent](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-trackmouseevent), [Microsoft Docs — WM_MOUSELEAVE](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-mouseleave) (HIGH confidence)

```csharp
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

**Call pattern (register for TME_LEAVE, called in MouseEnter BEFORE setting WS_EX_TRANSPARENT):**
```csharp
var tme = new TRACKMOUSEEVENT
{
    cbSize      = (uint)Marshal.SizeOf<TRACKMOUSEEVENT>(),
    dwFlags     = TME_LEAVE,
    hwndTrack   = _hwnd,
    dwHoverTime = 0
};
TrackMouseEvent(ref tme);
```

**Critical behavior:** `TrackMouseEvent` is one-shot. When `WM_MOUSELEAVE` fires, the OS cancels all tracking for that HWND. The next time the mouse enters, `MouseEnter` fires again (because `WS_EX_TRANSPARENT` was removed at that point), and `TrackMouseEvent` must be called again. This is a natural re-registration pattern that matches the existing `MouseEnter` handler.

**Why not WH_MOUSE_LL (global low-level mouse hook):** A global hook runs on the UI thread for every mouse move system-wide, degrading responsiveness for all applications. It is flagged by security software and antivirus tools. It requires careful unhooking to avoid leaving a dangling hook that stalls system input processing. `TrackMouseEvent` is the Windows-correct mechanism for this exact use case, delivers the notification at zero polling cost, and requires no system-wide interception.

**Why not polling GetCursorPos on DispatcherTimer:** Polling introduces up to one poll-interval of latency (the mouse is visually gone but the window hasn't restored yet), burns CPU for the entire lifetime of the app, and requires tracking the widget's bounding rectangle manually. `WM_MOUSELEAVE` is edge-triggered with system-level accuracy.

---

### 5. WM_MOUSELEAVE — Message Constant for HwndSource Hook

**Purpose:** The numeric constant for the Win32 message to handle inside the `HwndSourceHook` delegate.

**Source:** [Microsoft Docs — WM_MOUSELEAVE](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-mouseleave) (HIGH confidence)

```csharp
private const int WM_MOUSELEAVE = 0x02A3;
```

**Hook handler (added in ContentRendered via HwndSource.AddHook):**
```csharp
private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
{
    if (msg == WM_MOUSELEAVE)
    {
        OnGhostMouseLeave();
        handled = true;
    }
    return IntPtr.Zero;
}
```

**Integration:** The project already obtains `HwndSource` via `HwndSource.FromHwnd(new WindowInteropHelper(this).Handle)` for the v2.0 ColorDialog HWND adapter. Adding `hwndSource.AddHook(WndProc)` in `ContentRendered` is one line — zero new infrastructure.

---

### 6. GetAsyncKeyState — Ctrl+Alt Modifier Detection

**Purpose:** Test whether the user is holding Ctrl+Alt at the moment `MouseEnter` fires. If yes, suppress ghost mode and keep the widget visible and interactive.

**Source:** [Microsoft Docs — GetAsyncKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate), [Microsoft Docs — Virtual-Key Codes](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes) (HIGH confidence)

```csharp
[DllImport("user32.dll")]
private static extern short GetAsyncKeyState(int vKey);
```

**Virtual key constants:**
```csharp
private const int VK_CONTROL = 0x11;  // Ctrl key (either left or right)
private const int VK_MENU    = 0x12;  // Alt key (either left or right)
```

**Usage:**
```csharp
private static bool IsCtrlAltHeld()
{
    // The most significant bit of the return value is set when the key is down.
    // A negative short value means the MSB is set.
    return (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0
        && (GetAsyncKeyState(VK_MENU)    & 0x8000) != 0;
}
```

**Why `GetAsyncKeyState` and not `Keyboard.IsKeyDown`:** WPF's `Keyboard.IsKeyDown` only reports state for the keyboard message queue of the current WPF application when it has keyboard focus. The transparent widget overlay does not normally hold keyboard focus — it is designed to be a passive overlay. `GetAsyncKeyState` queries the physical key state at the OS level, independent of focus, as documented: "Determines whether a key is up or down at the time the function is called."

**Why `VK_CONTROL` / `VK_MENU` (not left/right variants):** These generic codes match either the left or right key, so Ctrl+Alt works with either hand. `VK_LCONTROL (0xA2)` / `VK_LMENU (0xA4)` would be more specific but unnecessarily restrictive.

**AltGr note:** On European keyboards, AltGr sends `VK_LCONTROL` + `VK_RMENU` simultaneously. Because we use the generic `VK_CONTROL` + `VK_MENU`, AltGr will incorrectly trigger Ctrl+Alt mode on those keyboards. For a personal-use app on a US English layout, this is acceptable. If needed in future, use `VK_LCONTROL (0xA2)` + `VK_LMENU (0xA4)` to require strictly left-side keys.

---

## WM_NCHITTEST Override — NOT Required

Handling `WM_NCHITTEST` to return `HTTRANSPARENT = -1` is an alternative click-through mechanism but has disadvantages for this use case:

- It fires on every `WM_MOUSEMOVE` over the window, requiring a permanent `HwndSource` hook that routes every pointer event
- The window still receives `WM_MOUSEMOVE` (it just declines hit-testing) — mouse events are not fully passed through at the OS level
- `WS_EX_TRANSPARENT` is more complete: the OS excludes the window from hit-testing before `WM_NCHITTEST` is even generated

Use `WS_EX_TRANSPARENT` via `SetWindowLong`. Do not implement `WM_NCHITTEST`.

---

## Mouse Enter/Leave Design: The Two-Phase Protocol

### The Core Problem

When the widget is in ghost mode (`WS_EX_TRANSPARENT` + `Opacity=0`), the HWND still exists but the OS skips it during hit-testing. No mouse messages reach it. WPF's `MouseLeave` will never fire. The widget would stay hidden forever unless another mechanism delivers the leave signal.

### Solution: Register Before Going Transparent

**Phase 1 — WPF MouseEnter (window is still hit-testable at this moment):**
1. Check `IsCtrlAltHeld()`
2. If Ctrl+Alt held: do nothing — window stays visible and interactive as before
3. If not held: call `TrackMouseEvent(TME_LEAVE)` to register leave tracking, THEN set `WS_EX_TRANSPARENT` + `Opacity=0`

**Phase 2 — Win32 WM_MOUSELEAVE arrives in HwndSource hook:**
1. Remove `WS_EX_TRANSPARENT`
2. Restore `Opacity = _savedUserOpacity`

**Why the ordering matters:** `TrackMouseEvent` is called while the window is still hit-testable and can receive messages. The OS records the HWND registration. When the window subsequently becomes transparent (and stops receiving normal mouse events), the OS still delivers `WM_MOUSELEAVE` when the cursor exits the window rectangle because the tracking is keyed to the HWND identity, not its hit-test state.

**Confidence for this ordering:** MEDIUM — the documented behavior of `TrackMouseEvent` states it "Posts messages when the mouse pointer leaves a window" and that tracking is tied to `hwndTrack`. The docs do not explicitly state delivery continues after `WS_EX_TRANSPARENT` is set. This specific sequence should be verified during phase execution. If it does not work, the fallback is a `DispatcherTimer` polling `GetCursorPos` against the widget's bounding rect (higher latency, more CPU, but reliable).

---

## Integration Points in Existing Code

| Location | Change |
|----------|--------|
| `MainWindow.xaml.cs` — P/Invoke region | Add 5 `[DllImport]` declarations + 1 struct + all constants |
| `ContentRendered` | Obtain `_hwnd`; get `HwndSource`; call `AddHook(WndProc)` |
| `Window_MouseEnter` | Check `IsCtrlAltHeld()`; if not held, call `TrackMouseEvent` then set ghost mode |
| New `WndProc` method | Handle `WM_MOUSELEAVE` — restore opacity and clear `WS_EX_TRANSPARENT` |
| `ApplySettings()` | Cache `settings.Opacity` into `_savedUserOpacity` before any runtime changes |
| `AppSettings` record | Add `bool GhostModeEnabled { get; init; } = true;` |

**Conflict with existing MouseEnter/MouseLeave handlers:** The existing `Window_MouseEnter` and `Window_MouseLeave` handlers manage hover-fast-refresh and the semi-transparent backdrop (`ContentBorder.Background`). Ghost mode logic must be integrated at the top of `Window_MouseEnter` — if ghost mode activates, clear the backdrop (set to transparent) before going invisible to avoid a residual dark rectangle flash.

**No new files required.** All P/Invoke and logic additions fit in `MainWindow.xaml.cs`.

---

## Complete P/Invoke Block (Ready to Copy)

```csharp
// --- Ghost Mode P/Invoke (v2.3) ---

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

[DllImport("user32.dll")]
private static extern short GetAsyncKeyState(int vKey);

[StructLayout(LayoutKind.Sequential)]
private struct TRACKMOUSEEVENT
{
    public uint   cbSize;
    public uint   dwFlags;
    public IntPtr hwndTrack;
    public uint   dwHoverTime;
}

// GWL_EXSTYLE
private const int  GWL_EXSTYLE        = -20;
// WS_EX_TRANSPARENT: window excluded from hit-testing; clicks pass through
private const int  WS_EX_TRANSPARENT  = 0x00000020;
// SetWindowPos flags
private const uint SWP_NOSIZE         = 0x0001;
private const uint SWP_NOMOVE         = 0x0002;
private const uint SWP_NOZORDER       = 0x0004;
private const uint SWP_FRAMECHANGED   = 0x0020;  // flush SetWindowLong changes
// TrackMouseEvent flag
private const uint TME_LEAVE          = 0x00000002;
// Win32 message value
private const int  WM_MOUSELEAVE      = 0x02A3;
// Virtual key codes
private const int  VK_CONTROL         = 0x11;    // Ctrl (either side)
private const int  VK_MENU            = 0x12;    // Alt (either side)
```

---

## AppSettings Extension

```csharp
// Add to AppSettings record — one new field:
public bool GhostModeEnabled { get; init; } = true;
```

`bool` init-property follows the identical pattern as `CpuVisible`, `GpuVisible`, `UptimeVisible`. Default `true` means ghost mode is on by default for new installs. Existing settings.json without this field JSON-deserializes to the default (`true`) — forward-compatible with no migration needed.

---

## What NOT to Add

| Rejected Approach | Reason | Use Instead |
|-------------------|--------|-------------|
| `WH_MOUSE_LL` global mouse hook | System-wide performance cost; security tool flags; requires careful cleanup; over-engineered for a single-window leave event | `TrackMouseEvent` + `WM_MOUSELEAVE` |
| `WM_NCHITTEST` returning `HTTRANSPARENT` | Less complete than `WS_EX_TRANSPARENT`; fires on every mouse move; still delivers `WM_MOUSEMOVE` | `SetWindowLong` + `WS_EX_TRANSPARENT` |
| `DispatcherTimer` polling `GetCursorPos` | Latency up to poll interval; CPU waste when idle; manual bounding-rect math | `TrackMouseEvent` + `WM_MOUSELEAVE` |
| `Keyboard.IsKeyDown` for Ctrl+Alt | Only works with keyboard focus; overlay never has focus | `GetAsyncKeyState` |
| New NuGet packages | None needed; all APIs in `user32.dll` (always available) | Existing P/Invoke pattern |
| New C# source files | All fits in existing P/Invoke region of `MainWindow.xaml.cs` | In-file addition |

---

## csproj Change Summary

**No changes required.** All Win32 APIs are in `user32.dll`, which is always available on Windows. The existing `[DllImport]` pattern (`Win32Window` HWND adapter, `WinForms` color dialog support) is already established in the codebase.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Click-through mechanism | `WS_EX_TRANSPARENT` via `SetWindowLong` | `WM_NCHITTEST` → `HTTRANSPARENT` | `WS_EX_TRANSPARENT` is OS-level and more complete; `WM_NCHITTEST` fires per mouse move and still delivers `WM_MOUSEMOVE` |
| Mouse-leave detection | `TrackMouseEvent` + `WM_MOUSELEAVE` | `WH_MOUSE_LL` global hook | System-wide overhead, security flags, unnecessary complexity |
| Mouse-leave detection | `TrackMouseEvent` + `WM_MOUSELEAVE` | `DispatcherTimer` polling `GetCursorPos` | Latency, CPU waste, manual bounds math |
| Modifier check | `GetAsyncKeyState` | `Keyboard.IsKeyDown` | Requires keyboard focus; overlay has none |
| Modifier check | `GetAsyncKeyState` | `WH_KEYBOARD_LL` keyboard hook | Global system overhead; `GetAsyncKeyState` is sufficient for a point-in-time check at hover time |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| `WS_EX_TRANSPARENT` value and behavior | HIGH | Official Microsoft docs, value 0x00000020 confirmed |
| `GWL_EXSTYLE = -20` | HIGH | Official Microsoft docs |
| `SetWindowPos` `SWP_FRAMECHANGED` requirement | HIGH | Explicitly documented in SetWindowPos Remarks: "you must call SetWindowPos for the changes to take effect" |
| `SWP_*` flag values | HIGH | Official Microsoft docs, values verified |
| `TrackMouseEvent` / `TME_LEAVE` / `WM_MOUSELEAVE = 0x02A3` | HIGH | Official Microsoft docs |
| `TrackMouseEvent` delivers `WM_MOUSELEAVE` post-transparency | MEDIUM | Documented as HWND-keyed notification; not explicitly stated to survive `WS_EX_TRANSPARENT` — verify in execution |
| `GetAsyncKeyState` MSB semantics | HIGH | Official docs with C++ example showing `< 0` check |
| `VK_CONTROL = 0x11`, `VK_MENU = 0x12` | HIGH | Official Virtual-Key Codes table |
| `HwndSource.AddHook` integration | HIGH | Established in project; used for ColorDialog owner HWND since v2.0 |

---

## Sources

- `WS_EX_TRANSPARENT`: https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles — value 0x00000020; behavior: window excluded from hit-testing in multi-window z-order; updated 2025-07-14
- `GetWindowLongPtr` / `GWL_EXSTYLE = -20`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlongptrw
- `SetWindowLongPtr` / `GWL_EXSTYLE = -20`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlongptrw
- `SetWindowPos` + `SWP_FRAMECHANGED` requirement: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos — Remarks: "use SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED"; updated 2025-07-01
- `TrackMouseEvent` + `TME_LEAVE`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-trackmouseevent
- `WM_MOUSELEAVE = 0x02A3`: https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-mouseleave
- `GetAsyncKeyState` MSB semantics + `VK_CONTROL`, `VK_MENU` usage example: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate — updated 2026-01-29
- `VK_CONTROL = 0x11`, `VK_MENU = 0x12`: https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
- `HwndSource.AddHook` delegate signature: https://learn.microsoft.com/en-us/dotnet/api/system.windows.interop.hwndsource.addhook?view=windowsdesktop-10.0 — updated 2026-02-11

---
*Stack research for: FuzzyClock v2.3 — Ghost Mode (hover-hide + Ctrl+Alt modifier)*
*Researched: 2026-03-02*
