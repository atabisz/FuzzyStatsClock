# Requirements: Fuzzy Clock

**Defined:** 2026-03-18
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.6 Requirements

### Settings Window Layout

- [x] **SETT-01**: All controls on the Appearance tab are fully visible within the 480×600 window without any clipping
- [x] **SETT-02**: Theme preset cards use a more compact form to reclaim vertical space
- [x] **SETT-03**: Inter-section margins and padding are tightened to eliminate unnecessary whitespace
- [x] **SETT-04**: Stats and Behavior tabs remain fully visible and unaffected

## Future Requirements

### Settings Window

- Resizable settings window (if compact layout still insufficient on low-DPI or small screens)

## Out of Scope

| Feature | Reason |
|---------|--------|
| ScrollViewer on tabs | User preference: redesign layout instead |
| Resizable window | Not needed if layout condensed correctly |
| Moving controls between tabs | Only condense; don't reorganize tab structure |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETT-01 | Phase 56 | Complete |
| SETT-02 | Phase 56 | Complete |
| SETT-03 | Phase 56 | Complete |
| SETT-04 | Phase 56 | Complete |

**Coverage:**
- v3.6 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
