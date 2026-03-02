# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02 after v2.3 milestone start)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 27 COMPLETE — v2.3 Ghost Mode milestone fully shipped

## Current Position

Phase: 27 of 27 (Ctrl+Alt Interaction Modifier)
Plan: 1 of 1 in current phase — COMPLETE (all tasks including human verify APPROVED)
Status: Phase 27 Plan 01 fully complete — v2.3 milestone shipped
Last activity: 2026-03-02 — Phase 27 Plan 01 complete (CTRLALT-01, CTRLALT-02 verified at runtime)

Progress: [██████████] 100% (v2.3: all 6 requirements complete and verified)

## Performance Metrics

**Velocity:**
- Total plans completed: 25 (v1.0 through v2.2)
- Average duration: 2.8 min
- Total execution time: ~65 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1–23 | 23 plans | ~60 min | 2.6 min |
| 24. System Tray Icon | 2 | 4 min | 2 min |
| 25. Centered Phrase Text | 1 | 3 min | 3 min |
| 26. Ghost Mode Core | 1 | 15 min | 15 min |

**Recent Trend:**
- Last 5 plans: 24-01 (2 min), 24-02 (2 min), 25-01 (3 min), 26-01 (15 min)
- Trend: Longer due to 2 auto-fix deviations (WndProcHook approach replaced with DispatcherTimer+GetCursorPos)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 24]: Dispatcher.Invoke wraps WinForms ToolStripMenuItem Click handlers to marshal to WPF Dispatcher thread
- [Phase 24]: this.Closed for tray dispose — keeps shutdown responsibilities separated from OnClosing
- [Research v2.3]: WS_EX_TRANSPARENT (not WM_NCHITTEST HTTRANSPARENT) is the correct click-through mechanism — WM_NCHITTEST only routes to same-thread windows
- [Research v2.3]: GetAsyncKeyState (not Keyboard.IsKeyDown) for Ctrl+Alt detection — overlay never holds keyboard focus
- [Research v2.3]: Synthetic hover-state cleanup (backdrop, timer, _isHoverFastRefresh) must run BEFORE applying WS_EX_TRANSPARENT — MouseLeave will not fire after style is set
- [Research v2.3]: TrackMouseEvent restore path is MEDIUM confidence — DispatcherTimer polling fallback must be verified during Phase 26
- [Phase 25-01]: TextAlignment=Center (not HorizontalAlignment=Center) centers glyphs within full layout-width box — HorizontalAlignment=Center collapses box to content size
- [Phase 25-01]: Both ShadowText and PhraseText must carry identical TextAlignment so 2px TranslateTransform shadow offset remains visually correct at all phrase lengths
- [Phase 26-ghost-mode-core]: DispatcherTimer+GetCursorPos+GetWindowRect for ghost restore — WS_EX_TRANSPARENT causes synthetic WM_MOUSELEAVE + WPF stale coords, bypassing WPF input system is required
- [Phase 27-01]: GetAsyncKeyState (not Keyboard.IsKeyDown) for Ctrl+Alt — overlay has no keyboard focus; VK_LCONTROL/VK_LMENU (not VK_CONTROL/VK_MENU) — VK_MENU matches AltGr on EU keyboards

### Pending Todos

None.

### Blockers/Concerns

None. (Phase 26 blocker resolved: DispatcherTimer+GetCursorPos+GetWindowRect confirmed working; WndProcHook approach is incompatible with self-transparent windows.)

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 27-01-PLAN.md — v2.3 milestone complete; human verify APPROVED (all 4 scenarios)
Resume file: None
Next action: Run /gsd:audit-milestone or /gsd:complete-milestone to archive v2.3
