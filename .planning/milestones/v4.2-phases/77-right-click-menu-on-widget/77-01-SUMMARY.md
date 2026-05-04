---
phase: 77-right-click-menu-on-widget
plan: 01
subsystem: ui
tags: [wpf, contextmenustrip, winforms-interop, tray-menu, mstest, pure-predicate, tdd]

# Dependency graph
requires:
  - phase: 76-appsettings-temperatureformatter-tests
    provides: "baseline 544 MSTest suite (545 after ambient additions) that this plan exceeds"
  - phase: 66-proximity-ghost-mode
    provides: "GhostModeController with IsActive + IsCtrlAltHeld() + ProximityChanged event — consumed by RMB-03 gate and RMB-04 opacity freeze"
  - phase: 24-system-tray-icon
    provides: "TrayMenuBuilder.Build() returning a NotifyIcon whose ContextMenuStrip is the single source of truth for menu items, checkmarks, and click handlers (byte-for-byte reused on widget right-click)"
provides:
  - "RightClickMenuGate: pure static ShouldOpen(isDragging, isGhostActive, isCtrlAltHeld) predicate for RMB-02 drag-suppress + RMB-03 ghost-suppress logic"
  - "MainWindow.xaml: Window-level PreviewMouseRightButtonUp wiring (tunneling route, fires before any child handler can consume the event)"
  - "MainWindow.xaml.cs: _menuOpen field + ProximityChanged lambda guard (RMB-04 opacity freeze) + Opening/Closed ContextMenuStrip hooks (idempotent += registration, preserving TrayMenuBuilder.SyncCheckmarks) + Window_PreviewMouseRightButtonUp handler routing to _trayIcon.ContextMenuStrip!.Show(Cursor.Position)"
  - "6 new MSTest [DataRow] cases on RightClickMenuGateTests.ShouldOpen_Cases — all 6 pass"
  - "Suite grown 522 post-Phase-75 baseline → 550 post-77-01 (+28 net across Phases 76 and 77 combined; +6 attributable to this plan)"
affects:
  - "Phase 78 (Temps tab UI) — no surface overlap; remains independent"
  - "Phase 79 (widget rendering) — no surface overlap; Opacity math in MainWindow unchanged (only extra guard added)"
  - "Phase 80 (Release) — no new package references; installer captures unchanged"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure predicate extraction for UI state gating (RightClickMenuGate joins DateFormatter / UptimeFormatter / TemperatureFormatter as stateless, unit-testable logic)"
    - "WPF PreviewMouseRightButtonUp tunneling route at Window level — captures event before any child handler can set Handled=true (Pitfall 6 defence)"
    - "WinForms ContextMenuStrip reuse from WPF handler — single-source-of-truth menu invoked via Cursor.Position screen coordinates (no PointToScreen round-trip)"
    - "Idempotent += event-handler registration — _menuOpen hook coexists with TrayMenuBuilder's SyncCheckmarks Opening handler (Pitfall 4: = would clobber)"
    - "ProximityChanged lambda guard pattern — new flag added as short-circuit return BEFORE Opacity assignment, leaving _proximityRatio update unconditional so resume tick applies current cursor position"

key-files:
  created:
    - "FuzzyClock.App/RightClickMenuGate.cs (30 lines)"
    - "FuzzyClock.App.Tests/RightClickMenuGateTests.cs (24 lines; 1 test method with 6 [DataRow] cases)"
  modified:
    - "FuzzyClock.App/MainWindow.xaml (+2 lines: PreviewMouseRightButtonUp attribute on <Window>)"
    - "FuzzyClock.App/MainWindow.xaml.cs (+40 lines: _menuOpen field + ProximityChanged guard + Opening/Closed hooks + Window_PreviewMouseRightButtonUp handler)"

key-decisions:
  - "RightClickMenuGate is a pure static predicate — no WPF/WinForms/Win32 dependencies so RMB-02 + RMB-03 logic runs in headless MSTest; belt-and-suspenders against the Win32 WS_EX_TRANSPARENT click-through that already suppresses the event naturally"
  - "Cursor.Position (System.Windows.Forms) used directly instead of Mouse.GetPosition(this) + PointToScreen — WinForms API returns screen coordinates already, and matches TrayMenuBuilder's fully-qualified WinForms idiom"
  - "MouseRightButtonUp (not Down) chosen — matches Windows convention (menus open on release) and avoids firing during would-be right-drag gestures"
  - "Closed event (not Closing) used for _menuOpen=false — Closing is cancellable and can fire spuriously"
  - "+= registration (not =) for Opening handler — preserves TrayMenuBuilder.cs:90 SyncCheckmarks registration; handlers fire in registration order so checkmark sync still runs before _menuOpen flips true"
  - "TrayMenuBuilder.cs left UNCHANGED — zero diff preserves the single-source-of-truth invariant for RMB-01 byte-for-byte parity"
  - "_menuOpen idempotence guard runs BEFORE the RightClickMenuGate predicate in Window_PreviewMouseRightButtonUp — cheap short-circuit for rapid right-click spam, prevents Show() from repositioning an already-open menu"

patterns-established:
  - "Pure predicate + MainWindow wiring split: extract every boolean UI-state decision into a stateless helper so RMB/ghost/drag gates can be unit-tested without a UI automation framework"
  - "Window-level Preview* tunneling for overlay hit-testing: matches the existing PreviewMouseWheel precedent and guarantees the handler fires before any child can consume the event"
  - "WPF overlay + WinForms ContextMenuStrip interop: reuse the tray menu instance directly on widget right-click; no ContextMenu (WPF) introduced, no menu rebuild, no checkmark sync duplication"

requirements-completed:
  - RMB-01
  - RMB-02
  - RMB-03
  - RMB-04

# Metrics
duration: ~25 min
completed: 2026-05-04
---

# Phase 77 Plan 01: Right-Click Menu on Widget Summary

**Right-click on the widget opens the exact same tray ContextMenuStrip instance at Cursor.Position (RMB-01 byte-for-byte parity) via a pure RightClickMenuGate predicate (RMB-02 drag + RMB-03 ghost guards) plus a _menuOpen flag that pins opacity during menu lifetime (RMB-04) — TrayMenuBuilder untouched, suite grown 522 → 550.**

## Performance

- **Duration:** ~25 min (covers Task 1 RED→GREEN, Task 2 wiring across four touchpoints, Task 3 manual smoke-test walkthrough across 7 checklists spanning 4 clock modes)
- **Tasks:** 3 (2 automated TDD + 1 human-verify checkpoint)
- **Files modified:** 4 (2 created: RightClickMenuGate.cs, RightClickMenuGateTests.cs; 2 modified: MainWindow.xaml, MainWindow.xaml.cs)
- **Files UNCHANGED (invariant preserved):** FuzzyClock.App/TrayMenuBuilder.cs — `git diff 2270c3c^..HEAD -- FuzzyClock.App/TrayMenuBuilder.cs` empty, confirming single-source-of-truth for menu items

## Accomplishments

- **RMB-01 satisfied** — widget right-click (all four clock modes: Phrase, Dial, LCD, Nixie; plus Stats panel; plus the transparent `#01000000` hit-test padding) opens `_trayIcon.ContextMenuStrip` at `System.Windows.Forms.Cursor.Position`. Items, checkmarks, enabled state, and click handlers are byte-for-byte identical to the tray icon invocation because the exact same ContextMenuStrip instance is shown.
- **RMB-02 satisfied** — `RightClickMenuGate.ShouldOpen(true, *, *)` returns false (unit-tested via DataRow case "dragging -> suppress" and "dragging beats ghost+Ctrl+Alt"). Manual smoke-test confirmed: hold-drag + right-click produces no menu; release drag + right-click opens normally.
- **RMB-03 satisfied** — two-layer defence. Primary: Win32 `WS_EX_TRANSPARENT` applied by GhostModeController.Activate() routes the click through to whatever is beneath the widget, so WPF never receives the right-click message in the first place. Secondary (defensive): `RightClickMenuGate.ShouldOpen(false, true, false)` returns false for the narrow window between the cursor-polling timer restoring interactivity and the ratio actually dropping. Ctrl+Alt held forces `ComputeProximityRatio → 0.0`, keeping the widget interactive and opening the menu normally (DataRow case "ghost active + Ctrl+Alt -> open").
- **RMB-04 satisfied** — `_menuOpen` field pinned `true` on ContextMenuStrip.Opening, `false` on Closed. ProximityChanged lambda short-circuits Opacity assignment `if (_menuOpen) return;` — widget holds its opacity for the menu lifetime. `_proximityRatio = ratio;` remains unconditional so the next tick after menu close applies the cursor's current position (expected resume-snap per Pitfall 5).
- **6 RightClickMenuGate DataRow cases pass** — all six permutations of (isDragging, isGhostActive, isCtrlAltHeld) verified: normal open, drag suppress, ghost-no-CtrlAlt suppress, ghost+CtrlAlt open, drag-beats-ghost+CtrlAlt, CtrlAlt-alone open.
- **Full MSTest suite green** — 550 runtime tests pass, 0 failures (post-Plan-76-01 baseline of 544 + 6 new RightClickMenuGate cases; actual measured by dotnet test during Task 2 verification).
- **TrayMenuBuilder.cs zero diff** — the single-source-of-truth invariant is preserved; any future menu item / checkmark logic additions flow through TrayMenuBuilder automatically to both tray and widget invocations.

## Task Commits

Plan 77-01 executed across three atomic commits (Task 1 split RED→GREEN per TDD):

1. **Task 1 RED: Failing RightClickMenuGate test** — `2270c3c` (test) — `FuzzyClock.App.Tests/RightClickMenuGateTests.cs` created with 6 `[DataRow]` cases; build fails with CS0103 (`RightClickMenuGate` type not found) — expected RED signal.
2. **Task 1 GREEN: RightClickMenuGate implementation** — `3bf59cf` (feat) — `FuzzyClock.App/RightClickMenuGate.cs` created with pure static `ShouldOpen(bool, bool, bool)` predicate; filtered `dotnet test --filter FullyQualifiedName~RightClickMenuGateTests` reports 6/6 pass.
3. **Task 2: MainWindow wiring** — `f14a566` (feat) — XAML attribute `PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp"` + four code touchpoints (`_menuOpen` field, ProximityChanged `if (_menuOpen) return;` guard, ContextMenuStrip Opening/Closed += hooks in ContentRendered after `_trayIcon` assignment, `Window_PreviewMouseRightButtonUp` handler method) in MainWindow.xaml.cs; full-suite `dotnet test` green at 550/0.
4. **Task 3: Manual human-verify checkpoint** — no commit (verification-only task). User walked all 7 checklists against the running build and signalled `"approved"`.

**Plan metadata commit:** captures this SUMMARY.md + STATE.md + ROADMAP.md updates (docs message below).

## Files Created/Modified

- **Created:** `FuzzyClock.App/RightClickMenuGate.cs` — 30 lines; `internal static class` with single `public static bool ShouldOpen(bool isDragging, bool isGhostActive, bool isCtrlAltHeld)` method; XML doc comments explain the RMB-03 defence-in-depth rationale (WPF doesn't receive the message under WS_EX_TRANSPARENT — the guard is belt-and-suspenders).
- **Created:** `FuzzyClock.App.Tests/RightClickMenuGateTests.cs` — 24 lines; one `[TestMethod]` named `ShouldOpen_Cases` with 6 `[DataRow]` rows (each with `DisplayName` tagged to the relevant requirement).
- **Modified:** `FuzzyClock.App/MainWindow.xaml` — +2 lines; added `PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp"` attribute on the `<Window>` root element, adjacent to the existing `PreviewMouseWheel="Window_PreviewMouseWheel"` wiring (preserves the Window-level Preview tunneling precedent).
- **Modified:** `FuzzyClock.App/MainWindow.xaml.cs` — +40 lines across four logical touchpoints:
  1. `private bool _menuOpen = false;` field declared adjacent to `_isDragging` / `_proximityRatio`
  2. ProximityChanged lambda: single `if (_menuOpen) return;` line inserted BEFORE `this.Opacity = _windowOpacity * (1.0 - ratio);` and AFTER the existing `_isDragging` / `_settingsWindow` early returns (keeps `_proximityRatio = ratio;` unconditional)
  3. ContentRendered (immediately after `_trayIcon = _trayMenu.Build(...)`): two `+=` registrations wiring `ContextMenuStrip.Opening → _menuOpen = true` and `ContextMenuStrip.Closed → _menuOpen = false`
  4. `Window_PreviewMouseRightButtonUp(object sender, System.Windows.Input.MouseButtonEventArgs e)` handler: `_menuOpen` idempotence guard → `RightClickMenuGate.ShouldOpen(...)` predicate → `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)` → `e.Handled = true`
- **UNCHANGED (invariant preserved):** `FuzzyClock.App/TrayMenuBuilder.cs` — `git diff --stat 2270c3c^..HEAD -- FuzzyClock.App/TrayMenuBuilder.cs` reports no output (zero diff), confirming the single-source-of-truth for menu items, checkmarks, and click handlers.

`git diff --stat 2270c3c^..HEAD` confirms the per-file deltas: RightClickMenuGate.cs +30, RightClickMenuGateTests.cs +24, MainWindow.xaml +2/-1 (3 lines touched; +2 net after the close-paren relocation), MainWindow.xaml.cs +40, TrayMenuBuilder.cs 0.

## Decisions Made

- **Pure predicate extraction over inline boolean logic in the handler** — `RightClickMenuGate.ShouldOpen` lives as a separate file so the RMB-02 + RMB-03 decision truth table is unit-tested without WPF/WinForms/Win32 dependencies. The alternative (inline `if (_isDragging || (_ghostMode.IsActive && !_ghostMode.IsCtrlAltHeld())) return;` in the handler) would have left the logic untestable in MSTest and required UI automation to verify.
- **Cursor.Position directly (screen coordinates per Microsoft docs)** — no `Mouse.GetPosition(this)` + `PointToScreen` round-trip. WinForms API delivers what ContextMenuStrip.Show expects. Matches TrayMenuBuilder's fully-qualified WinForms idiom for consistency.
- **MouseRightButtonUp, not Down** — Windows convention: menus open on button release. Avoids firing during would-be right-drag gestures. Matches tray NotifyIcon behavior.
- **Closed, not Closing, for `_menuOpen = false`** — Closing is cancellable and can fire spuriously. Closed fires exactly once after full close.
- **+= registration, not =** — preserves TrayMenuBuilder's `menu.Opening += SyncCheckmarks` at TrayMenuBuilder.cs:90. WinForms fires handlers in registration order, so checkmark sync still runs first; `_menuOpen = true` flips after. Using `=` would have clobbered SyncCheckmarks and broken RMB-01 checkmark parity.
- **TrayMenuBuilder.cs untouched** — zero diff preserves the single-source-of-truth invariant. Any future tray menu changes automatically propagate to widget right-click invocations.
- **_menuOpen idempotence guard BEFORE the gate check** — the guard is a cheap `return` short-circuit that prevents Show() from repositioning an already-open menu during rapid right-click spam (Pitfall 7). Placed first so the gate's evaluation cost is skipped when unnecessary.

## Deviations from Plan

None — plan executed exactly as written.

All four MainWindow touchpoints (XAML attribute + field + ProximityChanged guard + Opening/Closed hooks + handler method) were implemented as specified. The plan's `<done>` criteria stipulated `grep "_menuOpen" FuzzyClock.App/MainWindow.xaml.cs` return ≥4 hits; the actual count is 9 (field decl, field doc comment, ProximityChanged guard, ContentRendered Opening hook, ContentRendered Closed hook, `Window_PreviewMouseRightButtonUp` idempotence guard, and 3 XML doc-comment references) — the higher count is documentation density, not structural deviation. The core boolean logic and lifecycle wiring match the plan line-for-line.

**TrayMenuBuilder.cs zero-diff invariant confirmed:** `git diff --stat 2270c3c^..HEAD -- FuzzyClock.App/TrayMenuBuilder.cs` returns no output. The plan's explicit "Do NOT touch TrayMenuBuilder.cs" instruction was respected.

## Issues Encountered

None. The TDD RED→GREEN rhythm for Task 1 produced the expected compile error on RED commit and 6/6 pass on GREEN. Task 2's four touchpoints compiled cleanly on first attempt with `dotnet build` — no namespace ambiguity issues (the `System.Windows.Input.MouseButtonEventArgs` fully-qualified signature avoided the known `UseWindowsForms=true` ambiguity with `System.Windows.Forms.MouseEventArgs`). Task 3's manual smoke-test walked cleanly through all 7 checklists without surfacing any regression.

## User Setup Required

None — this plan was pure WPF/WinForms interop wiring. No external services, no environment variables, no dashboard configuration.

## Manual Smoke-Test Results (Task 3 checkpoint)

User walked all 7 checklists against `dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj` and signalled `"approved"`. Summary of confirmations:

1. **RMB-01 parity (all four clock modes + stats panel + transparent padding)** — Right-click opens the menu at cursor in Phrase / Dial / LCD / Nixie modes; right-click on stats panel opens; right-click on the `#01000000` hit-test padding opens (hit-test surface works as designed).
2. **RMB-01 checkmark parity** — Ghost Mode, Stats Visible, Auto-Contrast, and Auto-Launch checkmarks match byte-for-byte between widget-invoked and tray-invoked menu. Toggling via tray and re-opening via widget reflects the new state (proves SyncCheckmarks registered at TrayMenuBuilder.cs:90 still fires on widget invocations because `+=` preserved the handler).
3. **RMB-02 drag suppression** — hold-drag + right-click produces no menu; release drag + right-click opens normally (confirms `_isDragging` resets to false after DragMove returns).
4. **RMB-03 ghost-mode suppression + Ctrl+Alt override** — ghost enabled + cursor far from widget + right-click opens (ghost enabled ≠ ghost active); ghost ACTIVE + no Ctrl+Alt + right-click produces no menu (WS_EX_TRANSPARENT routes click through); ghost + Left-Ctrl + Left-Alt held + right-click opens normally (Ctrl+Alt forces ComputeProximityRatio → 0.0).
5. **RMB-04 proximity freeze** — menu opens during mid-fade, widget opacity pins for menu lifetime regardless of cursor motion, resumes tracking on menu close (may resume-snap to new value — expected per Pitfall 5).
6. **Rapid-click idempotence** — 5+ rapid right-clicks: menu stays open cleanly, no flicker, no close-and-reopen cycle (confirms `_menuOpen` idempotence guard works).
7. **Regression sweep** — drag-to-move still works (Grid_MouseLeftButtonDown path unchanged); scroll-wheel opacity still works (PreviewMouseWheel unchanged); tray icon menu still works (TrayMenuBuilder unchanged); Settings window still opens from both tray and widget right-click (single ContextMenuStrip reused).

No failures. No deferred items. No gap-closure plan needed.

## Next Phase Readiness

- **Phase 78 (Temps Tab in Settings)** remains independent of Phase 77 — no surface overlap. Phase 78 can begin whenever the milestone scheduler allows; it consumes only the five new AppSettings fields from Phase 76-01, which are in place.
- **Phase 79 (Temps Line on Widget)** unchanged — depends on Phases 75 + 76 + 78, not 77.
- **Phase 80 (Release)** unchanged — no new package references introduced; installer capture list is stable.
- **Test baseline updated:** 550 runtime tests (445 Core + 105 App), 0 failures. Future phases should land additional tests on top of this baseline.
- **RightClickMenuGate is available for future UI-state gating reuse** — if a future feature needs to suppress widget interactions under a similar boolean predicate, the pattern (pure static helper + DataRow parametric test table) can be cloned verbatim.

---
*Phase: 77-right-click-menu-on-widget*
*Completed: 2026-05-04*

## Self-Check: PASSED

All claimed files exist, all claimed commit hashes resolve in `git log`, TrayMenuBuilder.cs zero-diff invariant confirmed:

- FOUND: `FuzzyClock.App/RightClickMenuGate.cs`
- FOUND: `FuzzyClock.App.Tests/RightClickMenuGateTests.cs`
- FOUND: `FuzzyClock.App/MainWindow.xaml` (PreviewMouseRightButtonUp attribute present)
- FOUND: `FuzzyClock.App/MainWindow.xaml.cs` (Window_PreviewMouseRightButtonUp handler + _menuOpen field + ProximityChanged guard + Opening/Closed hooks)
- FOUND: `.planning/phases/77-right-click-menu-on-widget/77-01-SUMMARY.md`
- FOUND: `2270c3c` (Task 1 RED — test(77-01))
- FOUND: `3bf59cf` (Task 1 GREEN — feat(77-01))
- FOUND: `f14a566` (Task 2 — feat(77-01) wiring)
- ZERO-DIFF CONFIRMED: `FuzzyClock.App/TrayMenuBuilder.cs` unchanged across plan (single-source-of-truth invariant preserved)
