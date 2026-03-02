# Feature Landscape

**Domain:** Desktop overlay widget — hover-hide (ghost mode) and Ctrl+Alt interaction modifier (v2.3)
**Researched:** 2026-03-02
**Confidence:** HIGH (click-through mechanism: official Win32 docs; modifier key API: official WPF/.NET 10 docs; behavioral edge cases: codebase inspection + Win32 layered window semantics)

---

## Scope Note

This file supersedes the v2.1 FEATURES.md. It focuses on the two primary feature areas for v2.3
Ghost Mode: hover-hide (auto-disappear on hover with click-through) and Ctrl+Alt interaction modifier
(hold modifier to keep widget visible and interactive). The third feature, centered phrase text, is
deliberately excluded from this research — it is a trivial one-property XAML change (TextAlignment=Center
on the phrase TextBlock) with no interaction complexity.

The existing codebase (v2.2) is a transparent frameless always-on-top WPF window (AllowsTransparency=True,
WindowStyle=None, Topmost=True) with these hover behaviors already implemented:

- `Window_MouseEnter` — sets backdrop (ContentBorder semi-transparent) + accelerates stats timer
- `Window_MouseLeave` — clears backdrop + restores stats timer
- `WindowInteropHelper` already used in `MenuThemeCustom_Click` for HWND access
- `Win32Window : IWin32Window` helper class already present

---

## How Click-Through Overlay Windows Work

### The Win32 Mechanism (Authoritative)

A window becomes "click-through" (passes mouse input to windows beneath it) by combining two
extended window styles at the Win32 HWND level:

1. **WS_EX_LAYERED** (0x00080000) — required for transparency effects on the window; already active
   on this WPF window because `AllowsTransparency=True` causes WPF to set this style automatically.

2. **WS_EX_TRANSPARENT** (0x00000020) — when added alongside WS_EX_LAYERED, mouse events pass
   through the window entirely to whatever is beneath it. The window is not the target of hit testing.

Source: https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles (HIGH confidence)

The runtime toggle pattern is:
```csharp
const int GWL_EXSTYLE = -20;
const int WS_EX_TRANSPARENT = 0x00000020;

[DllImport("user32.dll")]
static extern int GetWindowLong(IntPtr hwnd, int nIndex);

[DllImport("user32.dll")]
static extern int SetWindowLong(IntPtr hwnd, int nIndex, int dwNewLong);

// Enable click-through:
var hwnd = new WindowInteropHelper(this).Handle;
int extStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
SetWindowLong(hwnd, GWL_EXSTYLE, extStyle | WS_EX_TRANSPARENT);

// Disable click-through (restore interactivity):
SetWindowLong(hwnd, GWL_EXSTYLE, extStyle & ~WS_EX_TRANSPARENT);
```

The codebase already uses `WindowInteropHelper(this).Handle` in `MenuThemeCustom_Click` (line 888),
so the HWND acquisition pattern is established. The P/Invoke declarations for `GetWindowLong` and
`SetWindowLong` are the only new Win32 additions needed.

### Why Opacity=0 Alone Is Insufficient for Click-Through

Setting `Window.Opacity = 0` makes the window invisible but the HWND remains a valid hit-test target.
Mouse clicks and hover events still route to the WPF window, not to whatever is behind it. The desktop
user experience would be: widget is invisible but still intercepts mouse input — the user cannot
interact with anything in the widget's screen region.

WS_EX_TRANSPARENT is the correct mechanism to pass mouse input through. The two operations
(Opacity=0 and WS_EX_TRANSPARENT) must be applied together for the ghost effect.

Source: Win32 extended styles documentation + WPF AllowsTransparency behavior (HIGH confidence)

### WPF MouseEnter/MouseLeave When Click-Through Is Active

**Critical behavior:** Once WS_EX_TRANSPARENT is set, the window no longer receives Win32 mouse
messages (WM_MOUSEMOVE, WM_LBUTTONDOWN, etc.) because hit testing is bypassed at the OS level.
This means WPF's `MouseEnter` and `MouseLeave` events DO NOT FIRE while the window is click-through.

**Consequence for hover-hide design:** The "restore on exit" trigger cannot rely on `MouseLeave`
when the window is click-through (Opacity=0 + WS_EX_TRANSPARENT), because `MouseLeave` requires
that the window was previously the WM_MOUSEMOVE target — which it is not when transparent.

The recovery mechanism must be a timer-based poll: while click-through is active, a lightweight
timer periodically checks `Win32.GetCursorPos()` or WPF's `Mouse.GetPosition(this)` against the
window bounds. When the cursor leaves the window bounds, restore the window.

Alternatively, use a global mouse hook (SetWindowsHookEx WH_MOUSE_LL) — but this is heavyweight,
requires careful cleanup, and is inappropriate for a personal desktop widget. The timer-based
approach is correct here.

Source: Win32 layered window hit-test semantics (HIGH confidence — WS_EX_TRANSPARENT definition
explicitly states the window is not the hit-test target); WPF event routing depends on WM_MOUSEMOVE
delivery to the HWND.

---

## How Modifier Key Detection Works (WPF)

### Keyboard.Modifiers Property (Authoritative)

WPF exposes current modifier key state via `Keyboard.Modifiers` (static property, no parameters):

```csharp
using System.Windows.Input;

// Check if BOTH Ctrl and Alt are currently held:
bool ctrlAltHeld = (Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Alt)) ==
                   (ModifierKeys.Control | ModifierKeys.Alt);
```

`ModifierKeys` is a bit-field enum. The check uses bitwise AND to detect simultaneous presses.
`Keyboard.Modifiers` is a WPF-managed read that reflects the current hardware key state; it is
always accessible from the UI thread and does not require keyboard focus on the window.

Source: https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.keyboard.modifiers?view=windowsdesktop-10.0 (HIGH confidence)

**Alternative: `Keyboard.IsKeyDown(Key.LeftCtrl)`** — checks a specific key by name. Less
appropriate than `Modifiers` for modifier detection because it requires checking each key variant
(LeftCtrl, RightCtrl) separately. `Keyboard.Modifiers` covers both sides automatically.

### Where to Check Modifiers in the Hover-Hide Flow

The modifier check must happen in two contexts:

1. **Inside the restore timer tick** — after determining the cursor is within bounds, check
   `Keyboard.Modifiers` to decide whether to suppress the hide (Ctrl+Alt held = stay visible).

2. **In `Window_MouseEnter`** — before applying ghost mode, check if Ctrl+Alt is held; if yes,
   skip the hide entirely and stay interactive.

The Ctrl+Alt check should NOT be the primary re-show trigger when already ghost. The restore timer
is the primary mechanism; the modifier check is an override on the hide decision.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Widget disappears when mouse enters | This is the entire point of ghost mode; without it there is no feature | MEDIUM | Requires Opacity=0 + WS_EX_TRANSPARENT applied atomically in MouseEnter; interaction with existing backdrop and hover fast-refresh behaviors |
| Widget reappears when mouse leaves widget area | Obvious inverse of disappear; user must be able to get the widget back without keyboard action | MEDIUM | Cannot use MouseLeave (not delivered when click-through); requires timer-based bounds check on cursor position |
| Widget remains invisible while mouse stays inside | No flickering or partial restore while cursor is still over the widget area | LOW | Timer check is simply: cursor within bounds → stay hidden; no state change needed |
| Ghost mode is the default hover behavior | Without a toggle, the behavior change would confuse users who move their mouse near the clock incidentally | LOW | The hide fires on any MouseEnter; the Ctrl+Alt modifier is the opt-in to suppress it |

### Table Stakes — Ctrl+Alt Interaction Mode

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Holding Ctrl+Alt while hovering keeps widget visible | Without an interaction opt-in, the widget is unreachable once ghost mode is on — user cannot drag, right-click, or scroll | LOW-MEDIUM | Check `Keyboard.Modifiers` in MouseEnter; if Ctrl+Alt held, skip ghost activation and run existing hover behaviors instead |
| Ctrl+Alt allows drag (DragMove), right-click menu, scroll wheel | All existing interactions must remain reachable via the modifier | LOW | No special logic needed — if ghost is suppressed, existing handlers run unchanged |
| Releasing Ctrl+Alt while hovering triggers ghost mode | After interacting, moving away the modifier keys should ghost the widget | MEDIUM | Needs KeyUp handler or timer-based modifier re-check while visible with cursor in bounds |

### Expected Behavioral Details

| Behavior | Why Expected | Implementation Notes |
|----------|--------------|---------------------|
| Opacity set to 0 (not window hidden) | Hiding the window (Visibility=Hidden) would remove it from the layout and complicate restore; Opacity=0 keeps window alive and responsive to restore signal | Set `this.Opacity = 0.0` |
| WS_EX_TRANSPARENT toggled at HWND level | Opacity=0 alone still captures mouse events, blocking the desktop beneath; WS_EX_TRANSPARENT must be added simultaneously | P/Invoke SetWindowLong with GWL_EXSTYLE |
| Restore to user's configured Opacity level (not always 100%) | User may have set 50% opacity via scroll wheel; restoring to 100% would override their preference | Restore to `_windowOpacity` field (already tracked in code for OPAC-01/02) |
| No visible flicker on restore | Timer-based restore should check bounds precisely; spurious re-show while cursor is still inside bounds would cause rapid show/hide cycling | Guard: only restore when cursor is outside window bounds |
| Backdrop suppressed when ghost mode active | When Opacity=0 + click-through, showing a backdrop is irrelevant (invisible) and would cause a flash on restore if the backdrop state is stale | Skip backdrop application in MouseEnter when ghost is activated; clear backdrop state before restoring |
| Hover fast-refresh suppressed when ghost mode active | When click-through, the stats timer fast-refresh serves no purpose; fast-refreshing invisible stats wastes CPU | Skip `_statsTimer` interval change in MouseEnter when ghost is activated |

### Interaction With Existing Hover Behaviors (Critical)

The existing `Window_MouseEnter` implements two behaviors: backdrop + hover fast-refresh. Ghost mode
must coexist with both without breakage.

**State machine for MouseEnter:**

```
Mouse enters widget
  → Is Ctrl+Alt held?
      YES → run existing behaviors (backdrop + fast-refresh); suppress ghost; stay interactive
      NO  → ghost mode: set Opacity=0, add WS_EX_TRANSPARENT; skip backdrop; skip fast-refresh
             start restore-poll timer
```

**State machine for restore-poll timer tick:**
```
While ghost mode active:
  → Get cursor position (Win32 GetCursorPos or WPF Mouse.GetPosition)
  → Is cursor inside window bounds?
      YES → is Ctrl+Alt held?
              YES → exit ghost mode (restore Opacity + remove WS_EX_TRANSPARENT)
                    run existing MouseEnter behaviors (backdrop + fast-refresh)
              NO  → stay ghost (no action)
      NO  → exit ghost mode (restore Opacity + remove WS_EX_TRANSPARENT)
            stop restore-poll timer
            (Window_MouseLeave will NOT fire because WS_EX_TRANSPARENT was active;
             backdrop and fast-refresh restore must be done explicitly here, not via MouseLeave)
```

**Window_MouseLeave interaction:**
When ghost mode deactivates because the cursor left the window area (via poll), `Window_MouseLeave`
will not fire. The restore path must explicitly perform the same cleanup that `Window_MouseLeave`
currently does: clear backdrop, restore stats timer interval, clear `_isHoverFastRefresh`.

### Differentiators (Nice to Have, Not Required for v2.3)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Configurable hide delay (e.g., 500ms after MouseEnter) | Prevents accidental hide when mouse passes through widget area | LOW | `DispatcherTimer` with a 200–500ms delay before applying ghost; cancel if MouseLeave fires first |
| Ghost mode toggle in right-click menu | User may want to disable ghost mode entirely | LOW | New menu item + AppSettings bool; adds settings surface area |
| Persist ghost mode enabled/disabled | Survives restart if user disables ghost mode via menu | LOW | New AppSettings bool field if ghost toggle added |
| Different opacity level when visible (e.g., dim instead of zero) | Less jarring if widget fades to 10% instead of 0% | LOW | Change Opacity target from 0.0 to configurable value; still requires WS_EX_TRANSPARENT regardless of target opacity value |

### Anti-Features (Scope Creep Risks)

| Anti-Feature | Why It Gets Requested | Why to Refuse | What to Do Instead |
|--------------|----------------------|---------------|-------------------|
| Global low-level mouse hook (SetWindowsHookEx WH_MOUSE_LL) | "More reliable cursor tracking" | Requires elevated trust, interferes with other apps' mouse handling, needs careful cleanup to avoid leaked hooks on crash | Lightweight timer polling `Mouse.GetPosition(this)` is correct for this use case |
| Hide on proximity (not contact) | "Widget should hide before I touch it" | Proximity detection requires continuous mouse tracking even when not hovering — a permanent background cost; contact detection (MouseEnter) is zero-cost when not triggered | Use MouseEnter (contact); the delay differentiator above addresses the "too quick" concern |
| Multiple modifier combos (Ctrl+Alt or Shift, configurable) | "I use Ctrl+Alt for something else" | Configurable modifier keys require a settings UI and input capture; the project has no settings screens | Lock to Ctrl+Alt; it is rarely used by other apps and matches the spec |
| Fade animation (gradual Opacity transition) | "Smooth disappear looks nicer" | WPF Storyboard/DoubleAnimation on `Window.Opacity` introduces timing complexity; during the fade, the window is partially visible and partially click-through — intermediate states must be managed | Instant Opacity=0 + WS_EX_TRANSPARENT is cleaner and avoids intermediate state problems |
| Re-use of existing hover backdrop as "dim before hide" | "Semi-transparent widget on hover before going invisible" | The backdrop is a stats-visibility affordance (BACK-04); repurposing it for ghost-mode pre-signaling conflates two distinct behaviors | Ghost activates in MouseEnter; the existing backdrop behavior is gated by the Ctrl+Alt check |
| Full permanent click-through (no modifier) | "I never want to interact with the widget" | Kills DragMove(), right-click menu, and scroll wheel — all established interactions; explicitly rejected in PROJECT.md Out of Scope | The Ctrl+Alt modifier is the correct opt-in interaction gate |

---

## Feature Dependencies

```
[GHOST-01: Ghost Mode — Auto-Hide on Hover]
    └──requires──> [P/Invoke: GetWindowLong + SetWindowLong + GWL_EXSTYLE]
                   (new declarations; Win32 user32.dll; no NuGet)
    └──requires──> [HWND via WindowInteropHelper(this).Handle]
                   (pattern already in use; MenuThemeCustom_Click line 888)
    └──modifies──> [Window_MouseEnter — new ghost activation branch]
                   (Ctrl+Alt check → if not held: Opacity=0 + WS_EX_TRANSPARENT + start restore-poll timer)
    └──requires──> [_windowOpacity field] (already tracked for OPAC-01/02; restore uses this value)
    └──requires──> [restore-poll DispatcherTimer]
                   (new timer; polls cursor position while ghost; fires every ~50–100ms)
    └──must-NOT-run──> [backdrop + fast-refresh when ghosting]
                       (skip existing MouseEnter behaviors when ghost is applied)

[GHOST-02: Ctrl+Alt Interaction Mode]
    └──requires──> [Keyboard.Modifiers from System.Windows.Input] (in-box; no new reference)
    └──checked-in──> [Window_MouseEnter] (Ctrl+Alt held → suppress ghost; run normal hover behaviors)
    └──checked-in──> [restore-poll timer tick] (Ctrl+Alt held while in-bounds → exit ghost mode)
    └──requires──> [KeyUp handling or periodic re-check for modifier release while in-bounds]
                   (modifier released while cursor in bounds should trigger ghost mode)

[Restore Path (from ghost back to visible)]
    └──triggered-by──> [restore-poll timer: cursor outside bounds → restore]
    └──triggered-by──> [restore-poll timer: cursor in bounds AND Ctrl+Alt held → restore]
    └──must-explicitly-do──> [Opacity = _windowOpacity] (restore user's configured opacity)
    └──must-explicitly-do──> [remove WS_EX_TRANSPARENT from GWL_EXSTYLE]
    └──must-explicitly-do──> [clear backdrop (ContentBorder.Background = Transparent)]
                              (MouseLeave will not fire; must do manually)
    └──must-explicitly-do──> [restore _statsTimer interval + clear _isHoverFastRefresh]
                              (MouseLeave will not fire; must do manually)
    └──must-explicitly-do──> [stop restore-poll timer]

[Restore-poll timer]
    └──starts-when──> [ghost mode activated in Window_MouseEnter]
    └──stops-when──> [cursor exits bounds (non-Ctrl+Alt path) OR Ctrl+Alt triggers interactive restore]
    └──interval──> [~50–100ms] (responsive enough; < 5% CPU overhead at 100ms)
    └──does-NOT-require──> [new DispatcherTimer field per activation]
                            (single reusable _ghostRestoreTimer created once; Stop+Start pattern)

[AppSettings extension — ghost mode toggle (DIFFERENTIATOR ONLY)]
    └──if-shipped──> [new GhostModeEnabled bool field; init default = true]
    └──backward-compat──> [JSON missing field defaults to false = ghost disabled on upgrade]
    └──guard-required──> [SettingsService.Load() must default to true if field absent]
    NOTE: The base v2.3 spec does not include a toggle; omit AppSettings change if not shipping toggle.

[Centered phrase text — TRIVIAL; no research dependency]
    └──implementation──> [PhraseText.TextAlignment = TextAlignment.Center in XAML]
    └──no-interaction-with-ghost-mode]
```

### Dependency Notes

- **P/Invoke declarations are the only new Win32 surface.** `WindowInteropHelper` is already
  used. `GetWindowLong` and `SetWindowLong` need to be declared with `[DllImport("user32.dll")]`.
  Both are in `user32.dll`, which is implicitly available; no linker configuration needed.

- **Restore-poll timer vs. existing timers.** There are already two DispatcherTimers: `_timer`
  (10s phrase) and `_statsTimer` (1s/3s/10s stats). The restore-poll timer is a third one (`_ghostRestoreTimer`),
  needed only while the widget is in ghost state. It starts on ghost activation and stops on restore.
  At 100ms interval, it is negligible. It should NOT share either existing timer.

- **`_windowOpacity` field.** The scroll wheel and opacity menu already write to `Window.Opacity`.
  A `_windowOpacity` field (or equivalent reading of `Window.Opacity` before ghosting) must be
  captured before setting `Opacity = 0` so the restore path knows what value to return to.
  Reading `Window.Opacity` on the restore path directly is also viable (it stays at 0 while ghost
  so a separate field is cleaner).

- **WS_EX_TRANSPARENT and WPF AllowsTransparency.** The window already has `WS_EX_LAYERED` because
  `AllowsTransparency=True` requires it. WS_EX_TRANSPARENT is additive; adding it does not interfere
  with the existing layered compositing that gives the transparent background. Removing it restores
  normal hit-testing. This toggle is safe to do at runtime.

- **`Window_MouseLeave` will not fire during ghost restore.** This is the most important integration
  edge case. The restore path must unconditionally perform all the cleanup that `Window_MouseLeave`
  currently does: clear backdrop, restore stats timer interval, set `_isHoverFastRefresh = false`.
  If this cleanup is omitted, the widget restores but is left in fast-refresh mode with a stale
  backdrop state until the next hover cycle.

- **DRAG-01 interaction.** DragMove() is triggered by a left mouse button down in the window.
  When ghost mode is active (WS_EX_TRANSPARENT), mouse events do not reach the window, so
  DragMove() cannot be triggered. This is correct behavior — dragging requires Ctrl+Alt first
  (which exits ghost mode and makes the window interactive). No special handling needed.

---

## MVP Definition for v2.3

### Ship with v2.3

- [ ] **GHOST-01** — Widget automatically sets Opacity=0 and applies WS_EX_TRANSPARENT when
  mouse enters (no Ctrl+Alt held). Restores to user's configured opacity and removes click-through
  when cursor leaves widget bounds (detected via restore-poll timer).

- [ ] **GHOST-02** — Holding Ctrl+Alt while hovering suppresses ghost mode activation: widget
  stays visible at current opacity, all existing hover behaviors (backdrop, fast-refresh) apply
  normally. The Ctrl+Alt check is evaluated in MouseEnter and in the restore-poll timer while
  in-bounds.

- [ ] **CENTER-01** — Phrase text (PhraseText TextBlock) uses TextAlignment=Center within the
  widget content area. (Trivial; no interaction with ghost mode features.)

### Explicitly Not in v2.3

- Ghost mode on/off toggle in right-click menu (keep scope tight)
- GhostModeEnabled persisting to settings.json (no toggle = no setting)
- Fade animation / gradual opacity transition
- Configurable modifier keys
- Proximity-based hide (hide before contact)
- Configurable hide delay

---

## Complexity Assessment

| Component | Complexity | Reason |
|-----------|------------|--------|
| P/Invoke declarations (GetWindowLong / SetWindowLong) | LOW | Two DllImport statements + two const ints; established Win32 pattern; user32.dll already implicit |
| HWND acquisition | TRIVIAL | Pattern already in codebase (line 888); single `WindowInteropHelper(this).Handle` call |
| Ghost activation in MouseEnter | LOW | Ctrl+Alt check + Opacity=0 + WS_EX_TRANSPARENT + timer start; ~10 lines |
| Restore-poll timer | LOW-MEDIUM | New DispatcherTimer; WPF `Mouse.GetPosition(this)` or Win32 `GetCursorPos`; bounds comparison; ~20 lines |
| Restore path (explicit MouseLeave-equivalent cleanup) | MEDIUM | Must replicate all `Window_MouseLeave` cleanup: backdrop clear, stats timer restore, `_isHoverFastRefresh=false`; risk of omitting one leg |
| Modifier release re-check while in-bounds | MEDIUM | The case where user presses Ctrl+Alt while cursor is already inside bounds (to exit ghost) needs the timer to handle it; timer naturally covers this via the in-bounds + Ctrl+Alt branch |
| Centered phrase text | TRIVIAL | `TextAlignment="Center"` in XAML on PhraseText TextBlock |

**Overall milestone complexity: LOW-MEDIUM.** The ghost mechanism itself is a handful of Win32
calls and a timer. The real work is correctly integrating with the two existing hover behaviors
(backdrop + fast-refresh) and ensuring the restore path performs clean-up that `MouseLeave` would
normally handle. No new services, no new NuGet packages, no XAML restructuring required.

---

## Edge Cases Reference

| Edge Case | Symptom if Unhandled | Correct Behavior |
|-----------|---------------------|-----------------|
| Cursor exits window, then Ctrl+Alt pressed while still outside | Ghost remains (correct) | Ghost restore only when cursor re-enters with Ctrl+Alt held; correct |
| Mouse leaves widget very fast (borderline WM_MOUSEMOVE delivery) | MouseEnter fires but MouseLeave never fires (reported WPF behavior on frameless windows) | Restore-poll timer handles this correctly regardless — it detects cursor out-of-bounds independently |
| Ghost activated, then right-click context menu opened from outside (system tray reset) | Widget restores via ResetToDefaults | ResetToDefaults must clear ghost mode (Opacity restore + WS_EX_TRANSPARENT removal) |
| Ghost activated, scroll wheel event | No effect (WS_EX_TRANSPARENT passes all input through) | Correct — transparent window receives no scroll events; user must Ctrl+Alt first |
| Restore-poll timer fires after window is closing | Access to disposed WPF elements | Stop restore-poll timer in Closing handler |
| Stats panel toggled while ghost mode active | Irrelevant — widget is invisible | No special handling; state changes take effect when widget restores |
| User sets Opacity to 0% manually via menu (Window.Opacity = 0) | Ghost mode cannot detect "user wants 0" vs "ghost mode active" | Ghost mode tracks state via a `_isGhostMode` bool, not by reading `Window.Opacity` |
| Hover backdrop stale after ghost restore | Backdrop not cleared = dark background visible on non-hover state | Restore path must unconditionally clear backdrop (same as `Window_MouseLeave` line 505) |
| Fast-refresh active after ghost restore | Stats timer running at 0.5s when cursor is outside widget | Restore path must restore timer interval + clear `_isHoverFastRefresh` (same as `Window_MouseLeave` lines 509–515) |
| Ctrl+Alt held on app startup (user has keys held for other reason) | MouseEnter immediately fires interactive mode | Correct — Ctrl+Alt held means interactive; no ghost on first enter; normal behavior |
| Ghost mode active while drag pause is ongoing (DRAG-01) | _statsTimer stopped during drag + ghost mode attempts to check timer state | Moot — WS_EX_TRANSPARENT means DragMove() cannot be triggered in ghost state; drag pause cannot co-occur with active ghost mode |

---

## Sources

- Win32 Extended Window Styles (WS_EX_TRANSPARENT, WS_EX_LAYERED): https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles (HIGH — official Win32 docs, updated 2025-07-14)
- SetWindowLong (GWL_EXSTYLE): https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlonga (HIGH — official Win32 API docs)
- GetWindowLong (GWL_EXSTYLE): https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlonga (HIGH — official Win32 API docs)
- Keyboard.Modifiers (ModifierKeys.Control | ModifierKeys.Alt): https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.keyboard.modifiers?view=windowsdesktop-10.0 (HIGH — official .NET 10 docs, updated 2026-02-11)
- UIElement.IsEnabled (elements not enabled do not participate in hit testing): https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.isenabled?view=windowsdesktop-10.0 (HIGH — official .NET 10 docs)
- UIElement.IsHitTestVisible: https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.ishittestvisible?view=windowsdesktop-10.0 (HIGH — official .NET 10 docs)
- Window.AllowsTransparency: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency?view=windowsdesktop-10.0 (HIGH — official .NET 10 docs)
- Existing codebase: MainWindow.xaml.cs lines 484–516, 880–905 (HIGH — first-party, inspected 2026-03-02)
- PROJECT.md v2.3 milestone context (HIGH — first-party, inspected 2026-03-02)

---

*Feature research for: Fuzzy Clock v2.3 — hover-hide (ghost mode) and Ctrl+Alt interaction modifier*
*Researched: 2026-03-02*
