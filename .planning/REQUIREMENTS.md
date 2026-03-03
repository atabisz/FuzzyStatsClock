# Requirements: Fuzzy Clock

**Defined:** 2026-03-03
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v2.6 Requirements

### Auto-Launch at Login

- [x] **STRT-01**: User can toggle auto-launch at Windows login via tray context menu; toggle state shown as checkmark
- [x] **STRT-02**: Auto-launch setting persists to settings.json and restores on launch
- [x] **STRT-03**: When auto-launch is enabled, HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run registry entry is written; when disabled, the entry is removed

### Per-Monitor Position

- [x] **MON-01**: Widget tracks last-used position per connected monitor using monitor identity as key
- [x] **MON-02**: On startup, widget restores to the position last used on the currently connected monitor
- [x] **MON-03**: If the last-used monitor is not connected at startup, widget centers on the primary screen

### Auto-Contrast

- [ ] **CONTRAST-01**: User can enable/disable auto-contrast mode via tray menu; off by default; persisted to settings.json
- [ ] **CONTRAST-02**: When enabled, widget samples screen color under its footprint at each timer tick
- [ ] **CONTRAST-03**: When accent color vs background contrast is insufficient (WCAG threshold), widget elements switch to whichever of black or white gives better contrast against the background
- [ ] **CONTRAST-04**: Widget elements restore to configured accent color when background contrast is sufficient again

## Future Requirements

### Window Behavior

- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

| Feature | Reason |
|---------|--------|
| Edge snapping | Deferred to future milestone — interaction model needs more thought |
| System tray full settings UI | Complexity vs benefit — tray controls are sufficient |
| 24-hour format | Natural English implies 12-hour |
| Font family selector | Single clean font (Segoe UI Light) is part of the design |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STRT-01 | Phase 31 | Complete |
| STRT-02 | Phase 31 | Complete |
| STRT-03 | Phase 31 | Complete |
| MON-01 | Phase 32 | Complete |
| MON-02 | Phase 32 | Complete |
| MON-03 | Phase 32 | Complete |
| CONTRAST-01 | Phase 33 | Pending |
| CONTRAST-02 | Phase 33 | Pending |
| CONTRAST-03 | Phase 33 | Pending |
| CONTRAST-04 | Phase 33 | Pending |

**Coverage:**
- v2.6 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 — traceability confirmed after roadmap creation*
