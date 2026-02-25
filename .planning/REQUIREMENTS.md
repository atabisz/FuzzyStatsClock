# Requirements: Fuzzy Clock

**Defined:** 2026-02-25
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Display

- [x] **DISP-01**: App displays the current time as a fuzzy, poetic English phrase (e.g. "just a little after 11", "almost noon", "12 o'clock", "quarter past 3")
- [x] **DISP-02**: Phrases map to 5-minute buckets — 12 distinct phrase slots per hour
- [x] **DISP-03**: Exact noon shows "noon", exact midnight shows "midnight" (not "12 o'clock")
- [x] **DISP-04**: Phrase updates at each real 5-minute clock boundary (timer aligns to clock, not 5-min interval from launch)

### Window

- [x] **WIN-01**: Window is frameless and transparent — text floats directly on the desktop with no background box
- [x] **WIN-02**: Window is always-on-top
- [x] **WIN-03**: User can right-click to close the application (required: Alt+F4 is removed by WindowStyle=None)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Window

- **WIN-04**: User can drag window to reposition on the desktop
- **WIN-05**: Window position persists across restarts (screen-bounds validated for DPI/multi-monitor safety)

### Startup

- **STRT-01**: Application launches automatically on Windows login (via registry key)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Settings / preferences UI | Contradicts the "no chrome" core value |
| Exact digital time display | Defeats the purpose of a fuzzy clock |
| 24-hour time format | Natural English implies 12-hour |
| Per-second or per-minute updates | 5-minute buckets; more frequent updates add no value |
| System tray icon | Not needed for a floating text widget |
| Multi-language support | English only per project description |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISP-01 | Phase 1 | Complete |
| DISP-02 | Phase 1 | Complete |
| DISP-03 | Phase 1 | Complete |
| DISP-04 | Phase 3 | Complete |
| WIN-01 | Phase 2 | Complete |
| WIN-02 | Phase 2 | Complete |
| WIN-03 | Phase 2 | Complete |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after roadmap creation*
