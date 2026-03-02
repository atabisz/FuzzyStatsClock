# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02 after v2.3 milestone start)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 25 — Centered Phrase Text (first phase of v2.3)

## Current Position

Phase: 25 of 27 (Centered Phrase Text)
Plan: 1 of 1 in current phase — COMPLETE
Status: Phase 25 complete; ready for Phase 26
Last activity: 2026-03-02 — Phase 25 Plan 01 complete (CENTER-01 satisfied)

Progress: [█░░░░░░░░░] 33% (v2.3: 1/3 phases complete)

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

**Recent Trend:**
- Last 5 plans: 23-01 (2 min), 24-01 (2 min), 24-02 (2 min), 25-01 (3 min)
- Trend: Stable

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

### Pending Todos

None.

### Blockers/Concerns

- [Phase 26]: TrackMouseEvent delivery after WS_EX_TRANSPARENT is applied is not explicitly documented. Must verify experimentally during execution; fall back to DispatcherTimer polling Mouse.GetPosition(this) against ActualWidth/ActualHeight if WM_MOUSELEAVE does not arrive.

## Session Continuity

Last session: 2026-03-02
Stopped at: Phase 25-01 complete — CENTER-01 satisfied, SUMMARY.md written
Resume file: None
Next action: /gsd:plan-phase 26
