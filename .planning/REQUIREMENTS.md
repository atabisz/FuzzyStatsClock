# Requirements: Fuzzy Clock

**Defined:** 2026-02-26
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

Requirements for v1.4 release. Each maps to a roadmap phase.

### Stats Display

- [x] **STAT-11**: PAG row appears in stats panel below MEM row, showing % paging file usage as horizontal bar + percentage text
- [ ] **STAT-12**: User can toggle PAG row visibility via right-click Stats submenu; checkmark reflects actual PAG row state each time menu opens
- [ ] **STAT-13**: Hiding all four stat rows (CPU/GPU/MEM/PAG) auto-collapses the stats panel
- [x] **STAT-14**: PAG row visibility persists to settings.json and restores on launch
- [x] **STAT-15**: When paging file is disabled or unavailable, PAG row shows "N/A" with no exception thrown

## v2 Requirements

Deferred to future release.

### Window / Position

- **STRT-01**: Auto-launch on Windows login (registry key)
- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

| Feature | Reason |
|---------|--------|
| System tray icon / settings UI | Keep it simple |
| 24-hour format | Natural English implies 12-hour |
| Click-through / no interaction | Incompatible with drag (kills DragMove() event delivery) |
| Arbitrary font size input | 3-step ladder is sufficient |
| Font family selector | Single clean font (Segoe UI Light) is part of the design |
| Reset all stats to visible via Show Stats | Individual toggles are independent; simpler model |
| Actual swap size display (GB used / GB total) | % bar is consistent with other rows; size adds complexity for little gain |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAT-11 | Phase 11 | Complete |
| STAT-12 | Phase 11 | Pending |
| STAT-13 | Phase 11 | Pending |
| STAT-14 | Phase 11 | Complete |
| STAT-15 | Phase 11 | Complete |

**Coverage:**
- v1 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after v1.4 roadmap created — all 5 requirements mapped to Phase 11*
