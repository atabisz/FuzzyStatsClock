# Phase 57: Contrast Flicker Fix - Research

**Researched:** 2026-03-19
**Domain:** Win32 Z-order inspection / WPF auto-contrast feedback loop fix
**Confidence:** HIGH

## Summary

The contrast flicker bug is a feedback loop: `ContrastSamplerService` samples the screen under the widget footprint via BitBlt every 500ms. When the widget sits over an empty desktop (no application window beneath), the BitBlt captures the desktop shell background together with the widget's own rendered colors — including its backdrop or text. Each tick the sampled color varies between the background tint and the widget's own rendered content, causing `ContrastService` to oscillate across the WCAG threshold (4.5 / 5.5), which flips the display color, which changes what BitBlt captures next tick — and the cycle repeats indefinitely.

The fix is a pre-sample guard in `ContrastRefreshController.Tick`: before calling `ContrastSamplerService.Sample`, walk the Win32 Z-order from the widget's HWND downward using `GetWindow(GW_HWNDNEXT)` and inspect each overlapping, visible window. If every overlapping window belongs to a desktop-shell class (`"Progman"`, `"WorkerW"`, `"SysListView32"`), skip the tick entirely — hold the current `_contrastState` and return without firing `ColorChanged`. If any non-shell window overlaps, proceed with the normal sample path. This single guard fixes FIX-01 (bare desktop) and FIX-02 (`BackdropAlwaysVisible`) simultaneously, since neither case has a non-shell window beneath the widget.

**Primary recommendation:** Add `HasAppWindowBeneath(IntPtr hwnd, RECT widgetRect)` as a private static helper on `ContrastRefreshController`, call it at the top of `Tick` immediately after the `_shouldSkip` guard, and declare the four required P/Invoke signatures (`GetWindow`, `GetClassName`, `GetWindowRect`, `IsWindowVisible`) as private static members of `ContrastRefreshController`. Touch no other file.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fix strategy**
- HWND inspection: before sampling, walk the Z-order downward from the widget's HWND using `GetWindow(GW_HWNDNEXT)` to find windows that overlap the widget rect
- For each visible, overlapping window, check its class name via `GetClassName`
- Desktop-shell classes to treat as "empty desktop": `"Progman"`, `"WorkerW"`, `"SysListView32"`
- If only desktop-shell windows are found beneath the widget, skip the sample tick entirely (`return;`) — do not call `ContrastSamplerService.Sample`
- If any non-shell window is found, proceed with the normal BitBlt sample path

**Empty desktop behavior**
- When skipping (empty desktop detected): hold current state — do not modify `_contrastState`, do not fire `ColorChanged`
- The same HWND-inspection skip covers both FIX-01 (bare desktop) and FIX-02 (`BackdropAlwaysVisible`) — no special-casing for backdrop needed

**Fix location**
- Add `HasAppWindowBeneath(IntPtr hwnd, RECT widgetRect)` as a private static helper on `ContrastRefreshController`
- Add the skip guard at the top of `ContrastRefreshController.Tick`, before the `ContrastSamplerService.Sample` call
- `ContrastSamplerService` and `ContrastService` are untouched

**Change scope**
- `ContrastRefreshController.cs` is the only file to modify
- `ContrastSamplerService.cs`, `ContrastService.cs`, and all test files are untouched
- No new unit tests — Win32 HWND inspection is not unit-testable without OS mocking; existing 274 tests confirm no regression; manual verification covers FIX-01/02/03

### Claude's Discretion

- Exact Win32 P/Invoke declarations needed for `GetWindow`, `GetClassName`, `GetWindowRect`, `IsWindowVisible` (may already exist or need adding)
- How to handle the widget's own HWND appearing in the Z-order walk (skip it by comparing to the known `_hwnd`)
- Whether to check `GetWindowRect` overlap or use `IntersectRect` for accuracy

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIX-01 | AutoContrast + empty desktop: no oscillation or flicker | Z-order walk detects no app window beneath; tick skipped; `_contrastState` held stable |
| FIX-02 | BackdropAlwaysVisible + empty desktop: no oscillation or flicker | Same Z-order skip covers this case — backdrop renders on top of desktop shell only |
| FIX-03 | AutoContrast over app windows: correct black/white switching preserved | Non-shell window detected → normal sample path executes → no behavior change from current |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| user32.dll P/Invoke | OS | `GetWindow`, `GetClassName`, `GetWindowRect`, `IsWindowVisible` | Standard Win32 window enumeration; no third-party dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `System.Runtime.InteropServices` | .NET 10 | `DllImport`, `StructLayout` | Already used throughout the project for all P/Invoke |
| `System.Windows.Interop.WindowInteropHelper` | WPF | Obtain native HWND from WPF Window | Already used in MainWindow.xaml.cs line 158 and 1582 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `GetWindow(GW_HWNDNEXT)` Z-order walk | `EnumWindows` callback | `EnumWindows` enumerates all top-level windows without Z-order; harder to early-exit; Z-order walk is simpler and sufficient here |
| Manual rect overlap check | `IntersectRect` Win32 API | `IntersectRect` requires one more P/Invoke declaration; manual check (rect A overlaps rect B when no gap exists on any side) is equally correct and avoids the extra import |

**Installation:** No new packages — all dependencies are already present.

## Architecture Patterns

### Existing `ContrastRefreshController.Tick` Flow
```
Tick()
  └─ if (_shouldSkip!()) return;                 ← existing guard
  └─ [NEW] if (!HasAppWindowBeneath(...)) return; ← new guard inserted here
  └─ Sample → ComputeDisplayColor → ColorChanged
```

### Pattern: P/Invoke declarations private static in consuming class
**What:** Every class that calls Win32 APIs declares its own `[DllImport]` statics privately. No shared P/Invoke helper class exists in this codebase.
**When to use:** Always — established pattern in `GhostModeController`, `ContrastSamplerService`, `MainWindow`.
**Example:**
```csharp
// Pattern from GhostModeController.cs (existing)
[DllImport("user32.dll")]
private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

[StructLayout(LayoutKind.Sequential)]
private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
```

### Pattern: RECT overlap check (manual, no extra P/Invoke)
**What:** Two RECTs overlap when neither is fully to the left, right, above, or below the other.
**When to use:** Preferred when `IntersectRect` would require an additional P/Invoke import for a single use.
```csharp
// Manual overlap — logically equivalent to IntersectRect returning non-empty
static bool Overlaps(RECT a, RECT b) =>
    a.Left < b.Right && a.Right > b.Left &&
    a.Top  < b.Bottom && a.Bottom > b.Top;
```

### Pattern: Z-order walk from widget HWND downward
**What:** Start at the widget's own HWND, step to `GW_HWNDNEXT` (next window below in Z-order), check each candidate.
**When to use:** To find what is visually beneath the widget without enumerating all windows.
```csharp
// Conceptual structure — planner fills in exact method body
const uint GW_HWNDNEXT = 2;
IntPtr candidate = GetWindow(widgetHwnd, GW_HWNDNEXT);
while (candidate != IntPtr.Zero)
{
    // check IsWindowVisible, GetWindowRect overlap, GetClassName
    candidate = GetWindow(candidate, GW_HWNDNEXT);
}
```

### Anti-Patterns to Avoid
- **Modifying `_contrastState` on skip:** When the tick is skipped (empty desktop), do NOT reset `_contrastState` to `Normal` — this would discard the hysteresis state built up from valid app-window samples before the widget was moved to empty desktop.
- **Skipping the widget's own HWND using class name alone:** The widget is a WPF window; its class name is not one of the shell classes, but you must still skip it explicitly by comparing `candidate == _hwnd` (or obtain HWND once in `Tick` and pass it to the helper).
- **Declaring `GetWindow` without the `CharSet`/`SetLastError` attributes:** For `GetClassName`, `CharSet = CharSet.Auto` is required to get the correct ANSI/Unicode variant automatically; omitting it on Windows 10/11 works in practice but `CharSet.Auto` is the documented safe approach.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Desktop-shell detection | Custom heuristic (e.g., check z-order position or window title) | `GetClassName` → compare to known shell class strings | Shell class names are stable Windows constants; heuristics break on non-standard desktop configurations |
| Rect overlap logic | Pixel-level scan or sampling offset | Simple four-inequality check on RECT values | Exact, O(1), no additional Win32 calls |

**Key insight:** The fix requires no changes to the sampling or contrast math — it is purely a "should we sample at all?" gate, which is exactly what the existing `_shouldSkip` pattern was designed for.

## Common Pitfalls

### Pitfall 1: Widget HWND appears at start of Z-order walk
**What goes wrong:** `GetWindow(widgetHwnd, GW_HWNDNEXT)` starts *below* the widget, so the widget itself is not returned — but if the implementation accidentally starts at the widget HWND itself (e.g., using `GW_HWNDPREV` or passing the wrong seed), the widget's own class would be checked and could incorrectly match or not match shell classes.
**Why it happens:** Confusion between `GW_HWNDNEXT` (down the Z-order) and `GW_HWNDPREV` (up the Z-order).
**How to avoid:** Always seed the walk with `GetWindow(widgetHwnd, GW_HWNDNEXT)` — this returns the first window *below* the widget in Z-order. `GW_HWNDNEXT = 2`.
**Warning signs:** The helper always returns `false` (no app window found) even with Notepad clearly behind the widget.

### Pitfall 2: Invisible or minimized windows counted as blocking
**What goes wrong:** A window exists in the Z-order beneath the widget but is minimized or hidden — it does not visually cover the widget, yet it triggers the sample path, reintroducing the flicker for non-shell windows.
**Why it happens:** `GetWindow` returns all windows including invisible ones.
**How to avoid:** Always check `IsWindowVisible(candidate)` before checking the class name or rect overlap. Skip non-visible windows unconditionally.
**Warning signs:** The fix stops working when any invisible app window happens to be in the same Z-order region.

### Pitfall 3: `GetClassName` buffer size
**What goes wrong:** `GetClassName` writes into a `StringBuilder` or char array; if the buffer is too small, the class name is truncated and the shell-class comparison fails silently.
**Why it happens:** Shell class names like `"SysListView32"` are 12 chars, but callers sometimes allocate only 16 chars and forget the null terminator.
**How to avoid:** Allocate 256 chars for the buffer — larger than any realistic Windows class name.
**Warning signs:** `GetClassName` returns a partial string; shell detection stops working for `"SysListView32"`.

### Pitfall 4: `_hwnd` not yet set when `Tick` fires
**What goes wrong:** If `_window` is available but `_hwnd` was never stored, `HasAppWindowBeneath` receives `IntPtr.Zero` and `GetWindow(IntPtr.Zero, GW_HWNDNEXT)` returns unpredictable results.
**Why it happens:** The HWND is obtained via `WindowInteropHelper` at `Initialize` time; if `Initialize` stores the HWND in a field, it is safe. If `Tick` calls `new WindowInteropHelper(_window).Handle` each time, it works but allocates unnecessarily.
**How to avoid:** Store `_hwnd = new WindowInteropHelper(window).Handle` in `Initialize`, use the stored `_hwnd` field in `Tick`. The HWND does not change after the window is shown.

## Code Examples

Verified patterns from existing codebase sources:

### P/Invoke declarations to add to ContrastRefreshController
```csharp
// Source: pattern from GhostModeController.cs + standard Win32 docs
[DllImport("user32.dll")]
private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

[DllImport("user32.dll")]
private static extern bool IsWindowVisible(IntPtr hWnd);

[DllImport("user32.dll")]
private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

[DllImport("user32.dll", CharSet = CharSet.Auto)]
private static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);

[StructLayout(LayoutKind.Sequential)]
private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

private const uint GW_HWNDNEXT = 2;
```

### HasAppWindowBeneath helper — structural outline
```csharp
// Source: design from 57-CONTEXT.md + Win32 Z-order walk pattern
private static bool HasAppWindowBeneath(IntPtr widgetHwnd, RECT widgetRect)
{
    var className = new System.Text.StringBuilder(256);
    IntPtr candidate = GetWindow(widgetHwnd, GW_HWNDNEXT);
    while (candidate != IntPtr.Zero)
    {
        if (IsWindowVisible(candidate) &&
            GetWindowRect(candidate, out RECT r) &&
            Overlaps(widgetRect, r))
        {
            GetClassName(candidate, className, 256);
            string cls = className.ToString();
            if (cls != "Progman" && cls != "WorkerW" && cls != "SysListView32")
                return true;  // non-shell window found beneath widget
        }
        candidate = GetWindow(candidate, GW_HWNDNEXT);
    }
    return false;
}

private static bool Overlaps(RECT a, RECT b) =>
    a.Left < b.Right && a.Right > b.Left &&
    a.Top  < b.Bottom && a.Bottom > b.Top;
```

### Guard insertion point in Tick
```csharp
private void Tick(object? sender, EventArgs e)
{
    if (_shouldSkip!()) return;

    // NEW: skip sampling over empty desktop to prevent feedback-loop flicker
    var widgetRect = GetWidgetRect();   // physical pixels — derive from _window + DPI transform
    if (!HasAppWindowBeneath(_hwnd, widgetRect)) return;

    // ... existing sampling code unchanged ...
}
```

### Obtaining widget RECT in physical pixels
```csharp
// Source: existing Tick code in ContrastRefreshController.cs (lines 84-90)
// The planner should convert the existing px/py/pw/ph locals into a RECT:
var RECT widgetRect = new RECT
{
    Left   = px,
    Top    = py,
    Right  = px + pw,
    Bottom = py + ph
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sample every tick regardless of what is beneath | Z-order walk guard before sampling | Phase 57 | Eliminates feedback loop over empty desktop; no effect on app-window sampling |

## Open Questions

1. **Should `_hwnd` be stored as a field on `ContrastRefreshController`?**
   - What we know: `GhostModeController` stores `_hwnd` set during `Initialize`; `ContrastRefreshController.Initialize` already receives the `Window` reference
   - What's unclear: Current `ContrastRefreshController` does not store a HWND field — `HasAppWindowBeneath` needs one
   - Recommendation: Add `private IntPtr _hwnd;` field; set it in `Initialize` via `new WindowInteropHelper(window).Handle`; pass it to `HasAppWindowBeneath`

2. **`IntersectRect` vs manual overlap?**
   - What we know: `IntersectRect` requires one additional `[DllImport]` and a third out-RECT parameter; the manual four-inequality check is logically equivalent for non-empty rects
   - What's unclear: No correctness difference; purely a style preference
   - Recommendation: Use the manual check — one less P/Invoke import, consistent with the project's pattern of keeping imports minimal

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/ContrastRefreshController.cs` — full source read; exact insertion points identified
- `FuzzyClock.App/ContrastSamplerService.cs` — full source read; existing P/Invoke patterns confirmed
- `FuzzyClock.App/GhostModeController.cs` — full source read; `RECT` struct and `GetWindowRect` pattern confirmed
- `.planning/phases/57-contrast-flicker-fix/57-CONTEXT.md` — locked decisions, discretion areas, implementation guidance

### Secondary (MEDIUM confidence)
- Win32 `GetWindow` / `GW_HWNDNEXT` — well-established Win32 constants; stable across all Windows versions supported by this project (Windows 10+)
- Desktop shell window class names (`Progman`, `WorkerW`, `SysListView32`) — stable Windows internal classes; used consistently in desktop customization tooling

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all P/Invoke declarations follow verified existing patterns in the codebase
- Architecture: HIGH — fix location, helper signature, and guard insertion point all specified precisely in CONTEXT.md; code examples derived from live source files
- Pitfalls: HIGH — four pitfalls identified from direct code inspection and Win32 documentation knowledge; all verified against existing codebase patterns

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable Win32 API surface; no fast-moving dependencies)
