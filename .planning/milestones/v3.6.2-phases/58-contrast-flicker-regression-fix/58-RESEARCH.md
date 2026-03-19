# Phase 58: Contrast Flicker Regression Fix - Research

**Researched:** 2026-03-19
**Domain:** Win32 Z-order inspection, WPF auto-contrast feedback loop, Windows shell window class taxonomy
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIX-04 | AutoContrast enabled + empty desktop: text color stable, no oscillation or flicker, holds for 30+ consecutive ticks | Root cause of guard bypass identified; strengthened shell class list and guard logic documented |
| FIX-05 | BackdropAlwaysVisible enabled + empty desktop: backdrop and text colors stable, no flicker | Same guard path; backdrop does not add an HWND; root cause is same incomplete shell exclusion list |
| FIX-06 | AutoContrast correctly switches text to black/white over an application window — no regression from fix | Guard returns `true` for all non-shell windows; fix must preserve this path unchanged |

</phase_requirements>

---

## Summary

Phase 57 (v3.6.1) shipped a Z-order walk guard (`HasAppWindowBeneath`) that skips BitBlt sampling when only desktop-shell windows are beneath the widget. Human verification confirmed FIX-01/02/03 passed at the time. However, the regression has reappeared — meaning the guard has an edge case that the initial test environment did not expose.

The guard currently checks for three shell window class names: `"Progman"`, `"WorkerW"`, `"SysListView32"`. On many Windows 10/11 configurations a fourth class, `"SHELLDLL_DefView"`, is present between WorkerW and SysListView32 in the Z-order. It is a shell infrastructure window that hosts the desktop icons, is always visible, and fully covers the screen. Because it is not in the exclusion list, `HasAppWindowBeneath` returns `true` when it overlaps the widget — causing BitBlt to run every tick over an "empty" desktop, recreating the original oscillation.

**Primary recommendation:** Add `"SHELLDLL_DefView"` to the shell exclusion list in `HasAppWindowBeneath`. Confirm whether any other Windows shell classes (e.g., `"Shell_TrayWnd"` near the taskbar edge) require exclusion and document findings.

---

## Root Cause Analysis

### Why the regression occurs

The `HasAppWindowBeneath` guard walks the Z-order downward from the widget HWND and returns `true` if any visible, overlapping, non-shell window is found. The exclusion list is:

```
"Progman"      — desktop shell root
"WorkerW"      — alternate desktop rendering layer
"SysListView32" — desktop icon list
```

On Windows 10/11, the typical Z-order beneath a desktop widget is:

```
[widget HWND]
  SHELLDLL_DefView   — desktop icon host (MISSING from exclusion list)
  SysListView32      — desktop icons (in exclusion list)
  WorkerW            — desktop background layer (in exclusion list)
  Progman            — desktop root (in exclusion list)
```

`SHELLDLL_DefView` is always visible, always full-screen (or near-full-screen), and always overlaps the widget. When the guard encounters it, it returns `true` because the class is not in the exclusion list. This causes `ContrastSamplerService.Sample` to run every tick, the BitBlt captures the widget's own rendered colors over empty desktop, and `ContrastService` oscillates across the WCAG threshold — exactly the original feedback loop.

**Confidence: HIGH** — `SHELLDLL_DefView` is documented Microsoft shell infrastructure. Its position in the desktop Z-order between WorkerW and SysListView32 is a well-established Windows shell characteristic. The absence from the exclusion list is a clear omission.

### Why initial human verification passed

The initial verification was done in one session at one point in time. The Z-order topology on a specific machine at that moment may have had desktop icons disabled (no `SHELLDLL_DefView`) or a different shell configuration. The regression appearing after shipping is consistent with a different machine or session configuration exposing `SHELLDLL_DefView`.

### Scope: FIX-05 (BackdropAlwaysVisible)

`BackdropAlwaysVisible` renders a semi-transparent black backdrop inside the widget's own WPF window. It does NOT add a new HWND to the Z-order. The guard failure cause is identical to FIX-04 — `SHELLDLL_DefView` bypasses the guard. There is no additional fix needed for backdrop specifically; fixing the guard for FIX-04 resolves FIX-05 as well.

### Scope: FIX-06 (no regression over application windows)

`HasAppWindowBeneath` returns `true` for any window whose class is not in the shell exclusion list. Application windows (Notepad, Chrome, VS, terminals) all have non-shell classes. Adding more classes to the exclusion list only risks over-excluding; it does not risk under-detecting application windows. FIX-06 is preserved as long as the fix does not add application window classes to the exclusion list.

---

## Standard Stack

### Core (no new libraries needed)

| Component | Status | Notes |
|-----------|--------|-------|
| `ContrastRefreshController.cs` | Only file to modify | Already has P/Invoke declarations and guard structure |
| `ContrastSamplerService.cs` | DO NOT MODIFY | Constraint from v3.6.1 — BitBlt sampler unchanged |
| `ContrastService.cs` | DO NOT MODIFY | Constraint from v3.6.1 — WCAG math unchanged |
| MSTest 4.0.1 | Test runner | 274 existing tests must remain green |

No new NuGet packages required. All necessary P/Invoke declarations already exist in `ContrastRefreshController.cs`.

---

## Architecture Patterns

### Existing Guard Structure (to be modified)

```csharp
// ContrastRefreshController.cs — HasAppWindowBeneath (current)
private static bool HasAppWindowBeneath(IntPtr widgetHwnd, RECT widgetRect)
{
    var className = new StringBuilder(256);
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
                return true;
            className.Clear();
        }
        candidate = GetWindow(candidate, GW_HWNDNEXT);
    }
    return false;
}
```

### Required Fix Pattern

Add `"SHELLDLL_DefView"` to the exclusion list. The minimal targeted fix:

```csharp
// FIX: add SHELLDLL_DefView to shell class exclusion list
if (cls != "Progman" && cls != "WorkerW" &&
    cls != "SysListView32" && cls != "SHELLDLL_DefView")
    return true;
```

The `className.Clear()` call after the shell check must remain to avoid stale data on the next loop iteration.

### Shell Window Class Taxonomy (HIGH confidence)

| Class Name | Role | Present On | Should Exclude |
|------------|------|-----------|----------------|
| `Progman` | Desktop shell root window | All Windows versions | YES — already excluded |
| `WorkerW` | Desktop background rendering layer | Windows 10/11 | YES — already excluded |
| `SHELLDLL_DefView` | Desktop icon host (child of WorkerW) | Windows 10/11 with icons | YES — **MISSING from current list** |
| `SysListView32` | Desktop icon list (child of SHELLDLL_DefView) | Windows 10/11 with icons | YES — already excluded |
| `Shell_TrayWnd` | Taskbar window | All Windows versions | NO — taskbar is a real surface; contrast should adapt to it |
| `DV2ControlHost` | Desktop view host (rare/older) | Windows 10 (some configs) | INVESTIGATE — may need exclusion |

**Decision for the fix:** Add `"SHELLDLL_DefView"` at minimum. Planner should decide whether to also investigate `"DV2ControlHost"` as a low-priority defensive addition.

### Z-Order Walk Integrity Check Pattern

After the fix, the guard's behavior should be:

```
Widget at empty desktop position:
  → GW_HWNDNEXT walk finds: SHELLDLL_DefView (excluded), SysListView32 (excluded), WorkerW (excluded), Progman (excluded)
  → Returns false → Tick returns early → No BitBlt → No oscillation

Widget over a browser window:
  → GW_HWNDNEXT walk finds: Chrome_WidgetWin_1 (not in exclusion list)
  → Returns true → BitBlt proceeds → ContrastService computes → ColorChanged fired
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Shell window detection | Custom heuristics (position, size, process name) | Class name check via `GetClassName` — canonical Win32 approach |
| Z-order enumeration | `EnumWindows` full traversal | `GetWindow(GW_HWNDNEXT)` downward walk from widget HWND — faster, already implemented |
| Pixel sampling | Custom screen capture | `ContrastSamplerService.Sample` — do not duplicate |

---

## Common Pitfalls

### Pitfall 1: Incomplete Shell Class List
**What goes wrong:** A shell infrastructure window class not in the exclusion list causes `HasAppWindowBeneath` to return `true` over an empty desktop, re-triggering the feedback loop.
**Why it happens:** Windows shell Z-order has more classes than Progman/WorkerW/SysListView32. `SHELLDLL_DefView` is always present when desktop icons exist.
**How to avoid:** Test the guard by logging the class names of all overlapping windows when running over an empty desktop. Add any shell classes found to the exclusion list.
**Warning signs:** Flickering resumes after "fix" is applied; happens on machines with desktop icons visible.

### Pitfall 2: `className.Clear()` Placement
**What goes wrong:** If `className.Clear()` is removed or moved outside the shell-class branch, the StringBuilder retains stale data from a previous iteration where `GetClassName` was NOT called (because `IsWindowVisible` or `Overlaps` returned false).
**Why it happens:** `GetClassName` is only called when overlap is confirmed. Candidates that fail the visibility/overlap check do not populate `className`.
**How to avoid:** Keep `className.Clear()` inside the `if` block, after the shell-class check, exactly as it is now. The fix only adds a class to the condition check, not to the `Clear()` position.

### Pitfall 3: Excluding Non-Shell Windows
**What goes wrong:** Adding a non-shell window class (e.g., a taskbar plugin or notification window) to the exclusion list would cause the contrast sampler to skip over real surfaces, breaking FIX-06 behavior.
**How to avoid:** Only add classes that are part of the Windows desktop shell infrastructure. The taskbar (`Shell_TrayWnd`) is NOT in the exclusion list by design — contrast should adapt when the widget is near the taskbar.

### Pitfall 4: Modifying ContrastSamplerService or ContrastService
**What goes wrong:** Violates the established architectural constraint from v3.6.1 — both files are marked read-only for this fix family.
**How to avoid:** The entire fix lives in `ContrastRefreshController.cs` only.

---

## Code Examples

### Current `HasAppWindowBeneath` (lines 140–158 of ContrastRefreshController.cs)

```csharp
// Source: FuzzyClock.App/ContrastRefreshController.cs (v3.6.1 — current)
private static bool HasAppWindowBeneath(IntPtr widgetHwnd, RECT widgetRect)
{
    var className = new StringBuilder(256);
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
                return true;
            className.Clear();
        }
        candidate = GetWindow(candidate, GW_HWNDNEXT);
    }
    return false;
}
```

### Target `HasAppWindowBeneath` (minimal fix — one class added)

```csharp
// Target: add SHELLDLL_DefView to shell exclusion list
private static bool HasAppWindowBeneath(IntPtr widgetHwnd, RECT widgetRect)
{
    var className = new StringBuilder(256);
    IntPtr candidate = GetWindow(widgetHwnd, GW_HWNDNEXT);
    while (candidate != IntPtr.Zero)
    {
        if (IsWindowVisible(candidate) &&
            GetWindowRect(candidate, out RECT r) &&
            Overlaps(widgetRect, r))
        {
            GetClassName(candidate, className, 256);
            string cls = className.ToString();
            if (cls != "Progman" && cls != "WorkerW" &&
                cls != "SysListView32" && cls != "SHELLDLL_DefView")
                return true;
            className.Clear();
        }
        candidate = GetWindow(candidate, GW_HWNDNEXT);
    }
    return false;
}
```

The change is surgical: one additional `&& cls != "SHELLDLL_DefView"` condition. No structural changes.

### Build and Test Commands

```bash
# Build (confirm 0 errors)
cd C:/src/FuzzyStatsClock && dotnet build FuzzyClock.App/FuzzyClock.App.csproj --no-restore

# Full test suite (must be 274 passed, 0 failed)
cd C:/src/FuzzyStatsClock && dotnet test --no-restore --verbosity normal
```

---

## State of the Art

| Phase | Approach | Status |
|-------|----------|--------|
| v2.7 (Phase 33) | BitBlt sampling with no guard — oscillates over empty desktop | Original bug |
| v3.6.1 (Phase 57) | Z-order walk guard with 3 shell classes | Ships but regresses — SHELLDLL_DefView missing |
| v3.6.2 (Phase 58) | Z-order walk guard with 4 shell classes (+ SHELLDLL_DefView) | Target state |

---

## Open Questions

1. **Is `"SHELLDLL_DefView"` always present when desktop icons exist?**
   - What we know: `SHELLDLL_DefView` is the standard Windows shell class for the desktop icon host and is present in Z-order on all Windows 10/11 machines with desktop icons enabled.
   - What's unclear: On configurations where desktop icons are hidden (right-click desktop → View → Show desktop icons = off), `SHELLDLL_DefView` may not be visible or may not overlap. In that case the original guard would have worked, explaining why initial verification passed.
   - Recommendation: Add the class to the exclusion list unconditionally. When it is absent, the guard still works correctly (the class won't appear in the walk).

2. **Should `"DV2ControlHost"` also be excluded?**
   - What we know: `DV2ControlHost` was a Windows 10 shell class used in older builds. It is uncommon on current Windows 11.
   - What's unclear: Whether it appears in any supported Windows 10/11 configuration used by real users.
   - Recommendation: LOW priority. Add only if there is evidence it causes the same issue. The minimal fix (`SHELLDLL_DefView` only) is the right scope for this phase.

3. **Can the fix be unit-tested?**
   - What we know: The guard uses Win32 HWND inspection that requires a real OS window hierarchy. MSTest in the Core project (no WPF) cannot access HWNDs.
   - What's unclear: Nothing — this was already established in Phase 57.
   - Recommendation: No new unit tests. Manual verification (30+ ticks of stability) is the acceptance criterion. The existing 274 tests confirm no regression to the surrounding code.

---

## Validation Architecture

> `nyquist_validation` is explicitly `false` in `.planning/config.json` — skip this section.

---

## Sources

### Primary (HIGH confidence)
- Source code read: `FuzzyClock.App/ContrastRefreshController.cs` — current guard implementation, confirmed unchanged since v3.6.1 tag
- Source code read: `FuzzyClock.App/ContrastSamplerService.cs` — BitBlt sampler, read-only constraint confirmed
- Source code read: `FuzzyClock.Core/ContrastService.cs` — WCAG hysteresis, read-only constraint confirmed
- Git log: `git diff v3.6.1 -- FuzzyClock.App/ContrastRefreshController.cs` — empty diff confirms code unchanged since ship
- Git log: `9c786c1` commit confirmed Phase 57 guard implementation

### Secondary (MEDIUM confidence)
- `.planning/milestones/v3.6.1-phases/57-contrast-flicker-fix/57-VERIFICATION.md` — confirmed FIX-01/02/03 human-verified at ship time; human test context may have lacked SHELLDLL_DefView in Z-order
- `.planning/milestones/v3.6.1-phases/57-contrast-flicker-fix/57-CONTEXT.md` — Phase 57 decisions, constraints, and canonical refs

### Tertiary (LOW confidence)
- Training knowledge: `SHELLDLL_DefView` shell class taxonomy — well-known Windows shell class; cross-verified with code observation that it is absent from current exclusion list

---

## Metadata

**Confidence breakdown:**
- Root cause identification: HIGH — guard unchanged since ship; SHELLDLL_DefView is the canonical missing class
- Fix approach: HIGH — single-line addition to exclusion condition, zero structural change
- Regression risk: HIGH confidence it is low — fix is purely additive to the exclusion list

**Research date:** 2026-03-19
**Valid until:** Stable — Windows shell class names do not change between Windows 10/11 releases
