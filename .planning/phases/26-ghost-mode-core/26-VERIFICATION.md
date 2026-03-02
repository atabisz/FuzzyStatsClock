---
phase: 26-ghost-mode-core
verified: 2026-03-02T22:30:00+11:00
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Ghost activation (GHOST-01): Hover mouse over widget"
    expected: "Widget becomes fully invisible and mouse clicks pass through to windows beneath (desktop icons, background windows respond)"
    why_human: "Cannot verify click-through behavior or visual invisibility programmatically"
  - test: "Ghost restore (GHOST-02): Move mouse off widget after ghost activates"
    expected: "Widget reappears at configured opacity within ~75ms. Cycle is repeatable (hover=ghost, leave=restore)"
    why_human: "DispatcherTimer polling behavior and opacity restore require runtime observation"
  - test: "No hover backdrop during ghost (GHOST-03a): While widget is invisible, confirm no semi-transparent backdrop appears"
    expected: "ContentBorder.Background stays Transparent; no dark backdrop visible at any point during ghost cycle"
    why_human: "Visual rendering cannot be verified from code alone — backdrop is a visual artifact"
  - test: "No fast-refresh during ghost (GHOST-03b): With stats panel visible, hover to ghost then restore"
    expected: "Stats continue at configured interval (1s/3s/10s) — NOT 0.5s fast-refresh rate"
    why_human: "Timer interval behavior requires runtime timing observation"
  - test: "Full interactivity after restore (GHOST-02 post-restore): After ghost restore, test drag/right-click/scroll"
    expected: "Left-click-drag moves widget, right-click opens context menu, scroll wheel changes opacity"
    why_human: "Interactive behavior and input routing cannot be verified statically"
---

# Phase 26: Ghost Mode Core — Verification Report

**Phase Goal:** Widget auto-hides when the mouse enters — becomes invisible and click-through — and restores to its configured state when the mouse leaves
**Verified:** 2026-03-02T22:30:00+11:00
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When the mouse enters the widget, it immediately becomes invisible (Opacity=0) and mouse clicks pass through to windows beneath | VERIFIED (automated) / ? human needed | `Window_MouseEnter`: `this.Opacity = 0.0` + `SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle \| WS_EX_TRANSPARENT)` + `SetWindowPos(...SWP_FRAMECHANGED)` at lines 571-576 |
| 2 | When the mouse leaves the widget area, the widget restores to its configured opacity and is fully interactive again | VERIFIED (automated) / ? human needed | `_ghostRestoreTimer` Tick handler at lines 159-165: `SetWindowLong(exStyle & ~WS_EX_TRANSPARENT)`, `this.Opacity = _windowOpacity`, `_ghostRestoreTimer.Stop()` |
| 3 | While ghost mode is active, the hover backdrop does not appear and the stats timer does not switch to 0.5s fast-refresh | VERIFIED (automated) | `Window_MouseEnter` Step 1 (lines 553-560) resets `ContentBorder.Background = Transparent`, resets stats timer to `_statsIntervalSeconds`, sets `_isHoverFastRefresh = false` — BEFORE WS_EX_TRANSPARENT is applied. Backdrop/fast-refresh are never set during ghost. |
| 4 | After ghost restore, drag, right-click, and scroll wheel all work normally | ? human needed | WS_EX_TRANSPARENT is removed on restore (line 161), restoring full WPF hit-testing. Static analysis consistent with correct behavior — requires runtime verification. |
| 5 | WS_EX_LAYERED and WS_EX_TOOLWINDOW are preserved through the enable/disable cycle | VERIFIED (automated) | Both enable (line 573: `exStyle \| WS_EX_TRANSPARENT`) and disable (line 161: `exStyle & ~WS_EX_TRANSPARENT`) use read-modify-write on the full exStyle bitmask — never replace the entire value. WS_EX_LAYERED (0x80000) and WS_EX_TOOLWINDOW (0x80) are always preserved. |

**Score:** 5/5 truths verified (automated checks pass; 4 truths additionally require human runtime confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.App/MainWindow.xaml.cs` | Ghost mode activation (MouseEnter), ghost restore (DispatcherTimer), hover-state guard (MouseLeave), P/Invoke declarations | VERIFIED | File exists, 900+ lines, substantive. Contains all required elements — see key links below. |

#### Artifact Level 2 (Substantive) — Contents Verified

| Item | Expected | Found | Location |
|------|----------|-------|----------|
| `_isGhostMode` field | `bool _isGhostMode = false` | `private bool _isGhostMode = false;` | Line 36 |
| `_hwnd` field | `IntPtr _hwnd` | `private IntPtr _hwnd;` | Line 37 |
| `_ghostRestoreTimer` field | `DispatcherTimer? _ghostRestoreTimer` | `private DispatcherTimer? _ghostRestoreTimer;` | Line 38 |
| `GWL_EXSTYLE` constant | `-20` | `private const int GWL_EXSTYLE = -20;` | Line 41 |
| `WS_EX_TRANSPARENT` constant | `0x00000020` | `private const int WS_EX_TRANSPARENT = 0x00000020;` | Line 42 |
| `SWP_*` constants | 4 constants | All 4 present: NOSIZE/NOMOVE/NOZORDER/FRAMECHANGED | Lines 43-46 |
| `GetWindowLong` P/Invoke | user32.dll | `[DllImport("user32.dll")] ... GetWindowLong` | Line 49-50 |
| `SetWindowLong` P/Invoke | user32.dll | `[DllImport("user32.dll")] ... SetWindowLong` | Line 52-53 |
| `SetWindowPos` P/Invoke | user32.dll | `[DllImport("user32.dll")] ... SetWindowPos` | Lines 55-58 |
| `GetCursorPos` P/Invoke | user32.dll | `[DllImport("user32.dll")] ... GetCursorPos(out POINT)` | Lines 60-61 |
| `GetWindowRect` P/Invoke | user32.dll | `[DllImport("user32.dll")] ... GetWindowRect(IntPtr, out RECT)` | Lines 63-64 |
| `POINT` struct | `{ int X; int Y; }` | `struct POINT { public int X; public int Y; }` | Line 67 |
| `RECT` struct | `{ Left, Top, Right, Bottom }` | `struct RECT { public int Left; public int Top; public int Right; public int Bottom; }` | Line 70 |
| `_hwnd` cached in ContentRendered | `WindowInteropHelper(this).Handle` | `_hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;` | Line 146 |
| `_ghostRestoreTimer` initialized in ContentRendered | 75ms interval | `new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(75) }` | Line 147 |
| Ghost restore logic in timer Tick | GetCursorPos + GetWindowRect + opacity restore | Full implementation at lines 150-166 | Lines 150-166 |
| `Window_MouseEnter` — 3-step ghost activation | Step 1 cleanup, Step 2 timer start, Step 3 WS_EX_TRANSPARENT | All 3 steps implemented | Lines 546-577 |
| `Window_MouseLeave` — `_isGhostMode` guard | `if (_isGhostMode) return;` | `if (_isGhostMode) return;` | Line 584 |

### Key Link Verification

The PLAN specified three key links using WndProcHook as the restore mechanism. During execution, WndProcHook was abandoned (Win32 delivers synthetic WM_MOUSELEAVE immediately on WS_EX_TRANSPARENT application) and replaced with DispatcherTimer + GetCursorPos. The equivalent links for the final implementation are verified below.

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `Window_MouseEnter` | `SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle \| WS_EX_TRANSPARENT)` | `GetWindowLong` read-modify-write + `SetWindowPos(SWP_FRAMECHANGED)` | WIRED | Lines 572-575. `WS_EX_TRANSPARENT` is OR'd onto existing exStyle, not replaced. |
| `_ghostRestoreTimer` Tick | `SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT)` | `GetCursorPos + GetWindowRect` boundary check, guarded by `_isGhostMode` | WIRED | Lines 150-165. GetCursorPos (not Mouse.GetPosition) used to bypass WPF input stale coords. |
| `Window_MouseLeave` | early return | `if (_isGhostMode) return;` guard prevents hover-restore path during ghost state | WIRED | Line 584. Guard is first statement in method. |
| `_ghostRestoreTimer` | started in `Window_MouseEnter` | `_ghostRestoreTimer!.Start()` at end of Step 2 | WIRED | Line 567. Timer started before WS_EX_TRANSPARENT is applied at Step 3. |
| `_ghostRestoreTimer` | stopped on restore | `_ghostRestoreTimer!.Stop()` inside Tick when cursor exits rect | WIRED | Line 158. |

**Note on plan deviation:** Plan key_links specified `WndProcHook / WM_MOUSELEAVE` pattern. Actual implementation uses `DispatcherTimer + GetCursorPos + GetWindowRect`. This is a legitimate deviation (documented in SUMMARY as auto-fixed bug — WM_MOUSELEAVE fires synthetically on WS_EX_TRANSPARENT application). The replacement achieves the same observable outcome (GHOST-02) via a more reliable Win32 mechanism.

**Stale comment (non-blocking):** Line 562 comment reads "checks Mouse.GetPosition(this)" but the actual timer body at line 154 uses `GetCursorPos` (correct Win32 API). This is a comment left from the intermediate fix (commit `1133d63`) before `67e059e` replaced it with GetCursorPos. The code is correct; only the comment is stale.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GHOST-01 | 26-01-PLAN.md | Mouse enters widget (Ctrl+Alt not held) → widget becomes Opacity=0 and click-through | SATISFIED | `Window_MouseEnter` sets `this.Opacity = 0.0` (line 576) and `WS_EX_TRANSPARENT` (lines 572-575). Note: Phase 26 is always-on (no Ctrl+Alt check yet — that is Phase 27's scope). |
| GHOST-02 | 26-01-PLAN.md | Mouse leaves widget area → widget restores configured opacity and stops being click-through | SATISFIED | `_ghostRestoreTimer` Tick restores `this.Opacity = _windowOpacity` (line 164) and removes `WS_EX_TRANSPARENT` (lines 160-163). |
| GHOST-03 | 26-01-PLAN.md | While ghost is active, hover backdrop and hover fast-refresh do not activate | SATISFIED | `Window_MouseEnter` Step 1 resets `ContentBorder.Background = Transparent` (line 553), resets stats timer to configured interval (lines 556-558), sets `_isHoverFastRefresh = false` (line 560) — all BEFORE activating ghost. Backdrop is never set during ghost state. |

**Requirement GHOST-01 partial scope note:** REQUIREMENTS.md states "left Ctrl+Alt not held" as part of GHOST-01. Phase 26 does not yet implement the Ctrl+Alt suppression — it is always-on. GHOST-01's Ctrl+Alt gating is explicitly deferred to Phase 27 (CTRLALT-01/02). The Phase 26 portion of GHOST-01 (invisible + click-through on enter) is satisfied.

**Orphaned requirement check:** CTRLALT-01 and CTRLALT-02 are mapped to Phase 27 in REQUIREMENTS.md. They do not appear in Phase 26's plan `requirements` field. No orphaned requirements for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `MainWindow.xaml.cs` | 562 | Stale comment: "checks Mouse.GetPosition(this)" — actual code uses GetCursorPos | Info | None — comment only, code is correct. Left from intermediate fix commit `1133d63` before `67e059e` replaced with GetCursorPos. |

No blockers or warnings found. No TODO/FIXME/placeholder comments. No empty implementations. No stub patterns.

### Build Verification

```
dotnet build FuzzyClock.App/FuzzyClock.App.csproj
  Build succeeded.
  0 Warning(s)
  0 Error(s)
```

### Commit Verification

All three phase commits are valid and present in git history:

| Commit | Message | Files |
|--------|---------|-------|
| `ec882b2` | feat(26-01): implement ghost mode core — WS_EX_TRANSPARENT click-through + WM_MOUSELEAVE restore | MainWindow.xaml.cs (+97/-9) |
| `1133d63` | fix(26-01): switch ghost restore to DispatcherTimer polling fallback | MainWindow.xaml.cs (+26/-48) |
| `67e059e` | fix(26-01): use GetCursorPos+GetWindowRect for ghost restore detection | MainWindow.xaml.cs (+18/-2) |

### Human Verification Required

#### 1. Ghost Activation (GHOST-01)

**Test:** Launch app with `dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj`. Slowly move the mouse over the widget area.
**Expected:** Widget immediately becomes fully invisible. Mouse clicks in that area reach windows beneath (click a desktop icon or background window — it should respond as if the widget is not there).
**Why human:** Visual invisibility and click-through behavior cannot be verified programmatically.

#### 2. Ghost Restore (GHOST-02)

**Test:** While widget is ghost (invisible), move mouse off the widget area past its bounds.
**Expected:** Widget reappears within ~75ms at its configured opacity. Move back over (ghost again), move off (restores again) — cycle is repeatable.
**Why human:** Runtime timer behavior and opacity restoration require visual observation.

#### 3. No Hover Backdrop During Ghost (GHOST-03a)

**Test:** Hover over widget (ghost activates). Confirm no semi-transparent dark backdrop appears. After restore, move away without re-hovering — confirm no backdrop lingers.
**Expected:** ContentBorder.Background always stays transparent. No dark backdrop visible at any point.
**Why human:** Visual rendering artifact cannot be verified from code analysis.

#### 4. No Fast-Refresh During Ghost (GHOST-03b)

**Test:** With stats panel visible (right-click to enable), hover to ghost then restore. Watch stats update frequency.
**Expected:** Stats continue at configured interval (1s/3s/10s default), NOT at 0.5s fast-refresh cadence.
**Why human:** Timer interval measurement requires runtime observation.

#### 5. Full Interactivity After Restore (GHOST-02 post-restore)

**Test:** After ghost restore (widget reappeared), verify: (a) left-click-drag moves the widget; (b) right-click opens context menu; (c) scroll wheel changes opacity.
**Expected:** All three interactions work normally as before ghost mode was introduced.
**Why human:** Input routing and WPF hit-testing cannot be verified statically after WS_EX_TRANSPARENT removal.

### Implementation Summary

Ghost mode core is fully implemented via the DispatcherTimer + Win32 GetCursorPos approach (not the originally planned WndProcHook — abandoned due to Win32 synthetic WM_MOUSELEAVE behavior). The implementation:

1. **Ghost activation** (`Window_MouseEnter`): Cleans hover state synthetically, starts 75ms polling timer, then applies `WS_EX_TRANSPARENT` (OR'd onto existing exStyle, preserving WS_EX_LAYERED and WS_EX_TOOLWINDOW) and sets `Opacity=0`.
2. **Ghost restore** (`_ghostRestoreTimer` Tick): Polls `GetCursorPos` + `GetWindowRect` every 75ms. When cursor exits window rect: stops timer, clears `WS_EX_TRANSPARENT` (AND-NOT), restores `_windowOpacity`.
3. **Hover guard** (`Window_MouseLeave`): Early-returns when `_isGhostMode` is true, preventing double-restore race between WPF mouse events and the timer.
4. **No hover artifacts**: Backdrop and fast-refresh never activated — cleaned up at ghost entry before transparency is applied.

All automated checks pass. Phase 26 goal is structurally achieved. Human verification required to confirm runtime behavior is correct.

---

_Verified: 2026-03-02T22:30:00+11:00_
_Verifier: Claude (gsd-verifier)_
