# Requirements: Fuzzy Clock

**Defined:** 2026-03-18
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.6 Requirements

### Settings Window Layout

- [x] **SETT-01**: All controls on the Appearance tab are fully visible within the 480×600 window without any clipping
- [x] **SETT-02**: Theme preset cards use a more compact form to reclaim vertical space
- [x] **SETT-03**: Inter-section margins and padding are tightened to eliminate unnecessary whitespace
- [x] **SETT-04**: Stats and Behavior tabs remain fully visible and unaffected

### Nixie Re-introduction

- [ ] **NIX-01**: AppSettings and SettingsSnapshot use ClockType enum instead of DialMode bool; LCD fields added
- [ ] **NIX-02**: SettingsWindow exposes a 3-button Clock Style rail (Phrase/Dial/Nixie) with ClockTypeChanged event
- [ ] **NIX-03**: Selecting Nixie in Settings activates the Nixie tube clock face on the widget
- [ ] **NIX-04**: Pre-existing build errors resolved (GetSegmentKey on novelty providers, stale _dialMode reference); project compiles clean

## Future Requirements

### Settings Window

- Resizable settings window (if compact layout still insufficient on low-DPI or small screens)

## Out of Scope

| Feature | Reason |
|---------|--------|
| ScrollViewer on tabs | User preference: redesign layout instead |
| Resizable window | Not needed if layout condensed correctly |
| Moving controls between tabs | Only condense; don't reorganize tab structure |
| LCD settings UI in SettingsWindow | Phase 57 scope is Nixie only; LCD settings surfacing is future work |
| NixieDigit/NixieClockView rendering changes | Pre-existing controls are complete; no visual changes needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETT-01 | Phase 56 | Complete |
| SETT-02 | Phase 56 | Complete |
| SETT-03 | Phase 56 | Complete |
| SETT-04 | Phase 56 | Complete |
| NIX-01 | Phase 57 | Planned |
| NIX-02 | Phase 57 | Planned |
| NIX-03 | Phase 57 | Planned |
| NIX-04 | Phase 57 | Planned |

**Coverage:**
- v3.6 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-19 after Phase 57 planning*
