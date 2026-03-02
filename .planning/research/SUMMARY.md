# Project Research Summary

**Project:** FuzzyClock v2.3 — Ghost Mode
**Domain:** WPF transparent frameless overlay — hover-hide + click-through + Ctrl+Alt interaction modifier
**Researched:** 2026-03-02
**Confidence:** HIGH

## Executive Summary

v2.3 adds "ghost mode" to FuzzyClock: when the mouse enters the widget, it becomes invisible and click-through, yielding the screen area entirely to whatever is beneath. Holding Ctrl+Alt while hovering suppresses ghost mode and keeps the widget interactive for drag, right-click, and opacity scroll. A third change — centering the phrase text — is a trivial XAML attribute addition with no behavioral complexity. The research consensus is clear: this is a small, focused milestone touching only two files (`MainWindow.xaml.cs` and `MainWindow.xaml`) and adding approximately 25 lines of code with no new NuGet packages or csproj changes.

The correct click-through mechanism is `WS_EX_TRANSPARENT` via `SetWindowLong`/`GetWindowLong` (user32.dll P/Invoke), combined with setting `Window.Opacity = 0`. These two operations must always be applied and removed together — Opacity=0 alone is insufficient because the HWND remains fully hit-testable; and the alternative WM_NCHITTEST HTTRANSPARENT hook approach fails to pass input to cross-thread windows (desktop, Explorer) so is not viable. PITFALLS.md Pitfall 2 is the authoritative ruling on this: use `WS_EX_TRANSPARENT`, not WM_NCHITTEST.

The primary technical risk is state management around the hover event pipeline. Applying `WS_EX_TRANSPARENT` in `Window_MouseEnter` stops all Win32 mouse message delivery immediately, which means `Window_MouseLeave` never fires after ghost activation. All hover state cleanup (backdrop, stats timer interval, `_isHoverFastRefresh`) must be performed synthetically before WS_EX_TRANSPARENT is applied. Ctrl+Alt detection must use `GetAsyncKeyState` (not `Keyboard.IsKeyDown`) because the overlay never holds keyboard focus. One MEDIUM-confidence gap exists: whether `TrackMouseEvent` delivers WM_MOUSELEAVE after `WS_EX_TRANSPARENT` is set is not explicitly documented — a DispatcherTimer polling fallback is the documented safe alternative and must be verified during Phase 26 execution.

## Key Findings

### Recommended Stack

v2.3 requires zero new NuGet packages and zero csproj changes. All additions are Win32 P/Invoke declarations against `user32.dll`, which is always available on Windows. The `HwndSource.AddHook` infrastructure is already established in the project from the v2.0 ColorDialog HWND adapter. One new `AppSettings` init-property (`GhostModeEnabled`, defaulting to `false`) may be added if a context menu toggle is shipped; the base spec does not require it.

**Core technologies:**
- `WS_EX_TRANSPARENT` + `WS_EX_LAYERED` (user32.dll `SetWindowLong`/`GetWindowLong`): click-through toggle — only mechanism that works cross-thread for desktop overlays; must OR the flag in, never replace the full extended style value
- `SetWindowPos` with `SWP_FRAMECHANGED` (user32.dll): flushes the extended style change to the window manager — explicitly required by Microsoft docs after any `SetWindowLong` call
- `GetAsyncKeyState` (user32.dll): physical Ctrl+Alt key state independent of window focus — `Keyboard.IsKeyDown` cannot be used because the overlay never has keyboard focus
- `TrackMouseEvent` + `WM_MOUSELEAVE = 0x02A3` (user32.dll): one-shot OS notification when mouse leaves HWND rectangle — registered before going click-through; MEDIUM confidence on delivery post-transparency; DispatcherTimer polling is documented fallback
- `HwndSource.AddHook` (System.Windows.Interop): WndProc hook registration — already used in project; must register in `ContentRendered`, never in constructor

### Expected Features

**Must have (table stakes for v2.3):**
- GHOST-01: Widget auto-hides (Opacity=0 + WS_EX_TRANSPARENT) on MouseEnter with no modifier — the entire value proposition of the milestone
- GHOST-02: Ctrl+Alt modifier suppresses ghost activation, keeping the widget interactive for drag/right-click/scroll
- CENTER-01: Phrase text uses `TextAlignment="Center"` in XAML — trivial, no interaction complexity

**Should have (differentiators, deferred from v2.3 base):**
- Ghost mode toggle in right-click context menu with `GhostModeEnabled` persisted to settings.json
- Configurable hide delay (200–500ms DispatcherTimer) to prevent accidental hide on mouse pass-through

**Defer to v2.4+:**
- Fade animation (gradual opacity transition) — creates intermediate states requiring complex management; instant Opacity=0 is cleaner
- Proximity-based hide (before contact) — requires continuous background mouse tracking at all times
- Configurable modifier keys — requires a settings UI that does not exist
- Full permanent click-through with no modifier — kills DragMove, right-click, and scroll wheel; explicitly rejected

### Architecture Approach

The implementation is contained entirely within `MainWindow.xaml.cs` (modified) and `MainWindow.xaml` (modified). No new files are needed. The ghost state lifecycle is: `Window_MouseEnter` fires → check `IsCtrlAltHeld()` via `GetAsyncKeyState` → if not held, run synthetic hover-state cleanup (backdrop clear, timer restore), then set `Opacity=0` and apply `WS_EX_TRANSPARENT` → widget is invisible and click-through → mouse physically leaves the widget area → OS delivers WM_MOUSELEAVE (via TrackMouseEvent registration) or restore-poll timer detects cursor out of bounds → remove `WS_EX_TRANSPARENT`, restore `Opacity = _windowOpacity`.

**Note on ARCHITECTURE.md divergence:** ARCHITECTURE.md proposes using WM_NCHITTEST HTTRANSPARENT (not WS_EX_TRANSPARENT) and assumes WPF `MouseLeave` fires as the restore trigger after HTTRANSPARENT return. PITFALLS.md Pitfall 2 explicitly rejects this: WM_NCHITTEST HTTRANSPARENT only routes input to same-thread windows; the desktop and other apps are on different threads and never receive the click. The phase must follow STACK.md + FEATURES.md + PITFALLS.md and use `WS_EX_TRANSPARENT`.

**Major components (all in MainWindow.xaml.cs):**
1. P/Invoke declarations region — 5 `DllImport` statements, 1 struct (`TRACKMOUSEEVENT`), ~12 constants
2. `_ghostMode` bool field — tracks current ghost state; never modify `_windowOpacity` alongside it
3. Hook or restore mechanism — WndProcHook for WM_MOUSELEAVE (preferred) or `_ghostRestoreTimer` DispatcherTimer (fallback); registered in `ContentRendered`
4. `Window_MouseEnter` (modified) — prepend `IsCtrlAltHeld()` check; ghost path exits early after cleanup + Opacity=0 + WS_EX_TRANSPARENT
5. `Window_MouseLeave` (modified) — prepend `_ghostMode` check; ghost restore path: clear flag, remove WS_EX_TRANSPARENT, restore `_windowOpacity`
6. `MainWindow.xaml` — add `TextAlignment="Center"` to both `PhraseText` and `ShadowText` TextBlocks

### Critical Pitfalls

1. **WS_EX_TRANSPARENT requires OR, not replace** — always `GetWindowLong` first, then OR in `WS_EX_TRANSPARENT`. Replacing removes `WS_EX_LAYERED` (breaks transparency, widget gets solid background) and `WS_EX_TOOLWINDOW` (widget reappears in Alt+Tab).

2. **WM_NCHITTEST HTTRANSPARENT fails for desktop click-through** — returning HTTRANSPARENT from WndProc only routes input to same-thread windows. Desktop and other applications are on different threads. Only `WS_EX_TRANSPARENT` achieves true desktop pass-through.

3. **Window_MouseLeave does not fire when WS_EX_TRANSPARENT is applied mid-hover** — Win32 stops delivering all mouse messages (including WM_MOUSELEAVE) immediately when `WS_EX_TRANSPARENT` is set. Hover state cleanup (backdrop, stats timer interval, `_isHoverFastRefresh = false`) must be performed synthetically before applying the style — every time, no exceptions.

4. **`Keyboard.IsKeyDown` is unreliable for unfocused overlays** — WPF keyboard state requires keyboard focus, which the transparent overlay never has. Use `GetAsyncKeyState(VK_CONTROL)` and `GetAsyncKeyState(VK_MENU)` via P/Invoke. MSB of the return value indicates the key is physically down.

5. **Never modify `_windowOpacity` in ghost mode** — `this.Opacity` is set to 0 during ghost; `_windowOpacity` is the user's configured value written by `SaveSettings()`. Conflating them persists ghost state to settings.json or corrupts opacity preset checkmarks on the context menu.

## Implications for Roadmap

Based on combined research, 3 phases are recommended. The ordering is: isolated XAML change first (zero risk), then ghost core mechanism, then modifier key integration layered on top.

### Phase 25: Centered Phrase Text

**Rationale:** Fully isolated XAML change with zero behavioral risk. Validates the SizeToContent interaction before any ghost complexity is introduced.
**Delivers:** `TextAlignment="Center"` on both `PhraseText` and `ShadowText` TextBlocks; centering is visible when StatsPanel is wider than phrase text.
**Addresses:** CENTER-01
**Avoids:** Pitfall 16 — centering requires a fixed-width container to have visual effect; verify both shadow and phrase blocks are updated together; verify centering works when StatsPanel is visible and has no apparent effect when stats panel is hidden (by design).
**Research flag:** Skip — well-understood XAML property; SizeToContent interaction is fully documented in ARCHITECTURE.md.

### Phase 26: Ghost Mode Core (Click-Through)

**Rationale:** Core click-through mechanism must be proven in isolation before the Ctrl+Alt modifier branch is added. This phase validates that Opacity=0 + WS_EX_TRANSPARENT makes the widget fully invisible and click-through, and that the restore path brings the widget back correctly with all hover state clean.
**Delivers:** Always-on ghost mode: MouseEnter triggers Opacity=0 + WS_EX_TRANSPARENT; widget restores on mouse exit via WM_MOUSELEAVE (TrackMouseEvent) or DispatcherTimer fallback.
**Uses:** `GetWindowLong`, `SetWindowLong`, `SetWindowPos` (SWP_FRAMECHANGED), `TrackMouseEvent` + WM_MOUSELEAVE 0x02A3, HwndSource.AddHook in ContentRendered.
**Implements:** P/Invoke declarations block, `_ghostMode` field, hook/restore mechanism, modified MouseEnter (always-ghost path), modified MouseLeave (ghost restore path with synthetic cleanup).
**Avoids:** Pitfall 1 (OR not replace), Pitfall 2 (WS_EX_TRANSPARENT not HTTRANSPARENT), Pitfall 3/7 (synthetic MouseLeave cleanup before applying WS_EX_TRANSPARENT), Pitfall 8 (Grid `#01000000` background never modified), Pitfall 13 (correct HWND via `WindowInteropHelper(this).Handle`), Pitfall 14 (UI thread — use DispatcherTimer not Task.Delay), Pitfall 15 (Opacity=0 alone insufficient).
**Research flag:** MEDIUM confidence on TrackMouseEvent delivery post-WS_EX_TRANSPARENT. Attempt TrackMouseEvent first; if WM_MOUSELEAVE does not arrive in testing, switch to a 50–100ms DispatcherTimer polling `Mouse.GetPosition(this)` against `ActualWidth`/`ActualHeight` bounds. Both approaches are fully specified in STACK.md.

### Phase 27: Ctrl+Alt Interaction Modifier

**Rationale:** Built on verified ghost core. The modifier check is a single `if` statement prepended to `Window_MouseEnter`; if modifier is held, the existing backdrop + fast-refresh path runs unchanged.
**Delivers:** Holding Ctrl+Alt on MouseEnter suppresses ghost activation; all existing hover interactions (drag, right-click, scroll) remain accessible. Next hover without modifier triggers ghost normally.
**Uses:** `GetAsyncKeyState` with `VK_CONTROL` (0x11) + `VK_MENU` (0x12) — no new P/Invoke beyond Phase 26.
**Avoids:** Pitfall 5 (Keyboard.IsKeyDown unreliable — use GetAsyncKeyState), Pitfall 6 (AltGr on European keyboards — documented acceptable limitation for US-English app; use `VK_LMENU` if deployment scope widens), Pitfall 4 (MouseEnter re-fires on WS_EX_TRANSPARENT removal — state machine handles re-entry correctly by design).
**Research flag:** Skip — `GetAsyncKeyState` pattern is HIGH confidence official docs with verified constant values.

### Phase Ordering Rationale

- Phase 25 first because it is a zero-risk isolated XAML change that can ship independently and does not interact with ghost mode logic at all.
- Phase 26 before Phase 27 because click-through verification must precede modifier logic — you cannot test "Ctrl+Alt suppresses ghost" until ghost itself works reliably.
- Phase 27 strictly additive to Phase 26 — one `if` statement at the top of `Window_MouseEnter`.
- In yolo mode, Phases 26 and 27 can be merged into one implementation pass given the small total line count (~20 lines C#). The split is for incremental human verification.

### Research Flags

Phases needing deeper attention during execution:
- **Phase 26 (Ghost Core):** TrackMouseEvent restore path has MEDIUM confidence — delivery after WS_EX_TRANSPARENT is applied is not explicitly documented. The executing agent must verify in code and fall back to DispatcherTimer polling if WM_MOUSELEAVE does not fire.
- **Phase 26 (Ghost Core):** ARCHITECTURE.md and PITFALLS.md diverge on click-through mechanism. Phase execution must use `WS_EX_TRANSPARENT` (STACK.md + FEATURES.md + PITFALLS.md consensus), not WM_NCHITTEST (ARCHITECTURE.md).

Phases with standard patterns (skip research-phase):
- **Phase 25 (XAML centering):** Trivial XAML attribute addition; no research needed.
- **Phase 27 (Ctrl+Alt):** GetAsyncKeyState pattern is HIGH confidence; no research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All P/Invoke APIs sourced from official Microsoft docs; constant values verified; zero new dependencies |
| Features | HIGH | MVP scope is tightly defined by spec and codebase inspection; feature boundaries are unambiguous |
| Architecture | MEDIUM | ARCHITECTURE.md uses WM_NCHITTEST which PITFALLS.md definitively rejects; overall structure (Opacity=0 + style toggle + handler revision) is correct but restore mechanism requires verification |
| Pitfalls | HIGH | 16 pitfalls, all grounded in direct source code reading or official Win32/WPF docs; critical mitigations are concrete and actionable |

**Overall confidence:** HIGH — the implementation is small and well-bounded. The MEDIUM architecture area has a clear resolution (use WS_EX_TRANSPARENT, not WM_NCHITTEST) and a documented fallback for the one MEDIUM-confidence API behavior (TrackMouseEvent restore).

### Gaps to Address

- **TrackMouseEvent restore path (MEDIUM confidence):** Whether `TrackMouseEvent` delivers WM_MOUSELEAVE after `WS_EX_TRANSPARENT` is applied is not explicitly documented by Microsoft. Phase 26 must verify this experimentally. If WM_MOUSELEAVE does not arrive, the fallback is a 50–100ms `DispatcherTimer` (`_ghostRestoreTimer`) polling `Mouse.GetPosition(this)` against `ActualWidth`/`ActualHeight` bounds — fully specified in FEATURES.md with state machine detail.

- **ARCHITECTURE.md divergence on click-through mechanism:** ARCHITECTURE.md describes WM_NCHITTEST HTTRANSPARENT as the click-through approach. This is rejected by PITFALLS.md Pitfall 2 (same-thread constraint). Phase execution must use `WS_EX_TRANSPARENT` per the STACK.md, FEATURES.md, and PITFALLS.md consensus. The ARCHITECTURE.md description of `Window_MouseLeave` as the restore trigger is only valid under the WM_NCHITTEST model and should not be relied upon.

- **AltGr keyboard behavior:** Using `VK_MENU` (any Alt) will trigger ghost suppression when AltGr is pressed on European keyboards during AltGr-character input in any application. This is documented and acceptable for a personal US-English deployment. If deployment target changes to include European keyboard layouts, switch to `VK_LMENU` (0xA4, left Alt only) to exclude AltGr.

## Sources

### Primary (HIGH confidence)
- `MainWindow.xaml.cs` — existing Window_MouseEnter, Window_MouseLeave, SetOpacity, ContentBorder, HwndSource patterns (codebase, inspected 2026-03-02)
- `MainWindow.xaml` — AllowsTransparency, Background="#01000000" hit-test trick, SizeToContent (codebase, inspected 2026-03-02)
- `PROJECT.md` — Key Decisions table including PreviewMouseWheel, hidden owner window, WinForms interop (codebase, inspected 2026-03-02)
- Microsoft Win32 — Window Features / Layered Windows: WS_EX_TRANSPARENT behavior with WS_EX_LAYERED (learn.microsoft.com/en-us/windows/win32/winmsg/window-features, updated 2026-02-21)
- Microsoft Win32 — Extended Window Styles: WS_EX_TRANSPARENT = 0x00000020 (learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles, updated 2025-07-14)
- Microsoft Win32 — SetWindowPos Remarks: SWP_FRAMECHANGED requirement after SetWindowLong (learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos)
- Microsoft Win32 — GetWindowLongPtr / SetWindowLongPtr / GWL_EXSTYLE = -20 (learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowlongptrw)
- Microsoft Win32 — GetAsyncKeyState: physical key state, focus-independent; VK_CONTROL=0x11, VK_MENU=0x12 (learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate, updated 2026-01-29)
- Microsoft Win32 — WM_NCHITTEST: HTTRANSPARENT same-thread constraint (learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest, updated 2025-07-14)
- Microsoft Win32 — TrackMouseEvent + TME_LEAVE; WM_MOUSELEAVE = 0x02A3 (learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-trackmouseevent)
- Microsoft Win32 — Virtual-Key Codes: VK_LCONTROL=0xA2, VK_LMENU=0xA4, VK_RMENU=0xA5 (learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes)
- Microsoft .NET 10 — HwndSource.AddHook (learn.microsoft.com/en-us/dotnet/api/system.windows.interop.hwndsource, updated 2026-02-11)
- Microsoft .NET 10 — Keyboard.Modifiers / ModifierKeys enum (learn.microsoft.com/en-us/dotnet/api/system.windows.input.keyboard.modifiers?view=windowsdesktop-10.0)

### Secondary (MEDIUM confidence)
- TrackMouseEvent delivery after WS_EX_TRANSPARENT applied — HWND-keyed per docs but cross-transparency delivery not explicitly stated; verify during Phase 26 execution
- WPF MouseLeave fires after HTTRANSPARENT return (ARCHITECTURE.md) — deducible from WPF InputManager architecture; rejected for production use by Pitfall 2 cross-thread analysis
- AltGr = VK_LCONTROL + VK_RMENU synthesized by Windows OS input stack — established Windows behavior across all versions; consistent with GetAsyncKeyState documentation

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
