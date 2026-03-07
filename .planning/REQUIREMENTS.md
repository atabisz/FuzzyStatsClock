# Requirements: Fuzzy Clock

**Defined:** 2026-03-07
**Milestone:** v3.1 Quality + Battery
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.1 Requirements

### Battery

- [x] **BATT-01**: Stats panel shows battery charge % as a horizontal bar + percentage text below PAG row
- [x] **BATT-02**: Battery row shows "N/A" (no exception) when no battery is present (desktop/VM)
- [x] **BATT-03**: User can toggle battery row visibility via tray Stats submenu; checkmark reflects current state
- [x] **BATT-04**: Hiding all five stat rows (CPU/GPU/MEM/PAG/BATT) auto-collapses the stats panel
- [x] **BATT-05**: Battery row visibility persists to settings.json and restores on launch; default enabled

### Tests

- [ ] **UTEST-03**: DateFormatter logic extracted from MainWindow into FuzzyClock.Core as a pure static class with unit tests covering all 4 format options
- [ ] **STEST-08**: AppSettings JSON round-trip includes DateVisible and DateFormat fields (no silent defaults on upgrade)

### Docs

- [ ] **DOCS-03**: README updated to reflect v3.0 date display (Show Date toggle, 4 formats, example output) and battery row

### Cleanup

- [ ] **CLEAN-01**: Pure logic extracted from MainWindow.xaml.cs into FuzzyClock.Core; MainWindow LOC meaningfully reduced; all extracted code covered by tests

## Future Requirements

### Battery Enhancements

- **BATT-06**: Battery row shows charging indicator (icon or "+" symbol) when AC power connected
- **BATT-07**: Battery row changes color (e.g. red accent) when charge falls below configurable threshold

### Cleanup

- **CLEAN-02**: MainWindow split into partial classes by concern (display, input, tray, settings)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Battery time-remaining display | Unreliable on many systems; OS estimate varies widely |
| Charging animation | Motion/animation conflicts with minimal design philosophy |
| Per-battery support (multi-battery) | Rare use case; composite % is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BATT-01 | Phase 37 | Complete |
| BATT-02 | Phase 37 | Complete |
| BATT-03 | Phase 37 | Complete |
| BATT-04 | Phase 37 | Complete |
| BATT-05 | Phase 37 | Complete |
| UTEST-03 | Phase 38 | Pending |
| STEST-08 | Phase 38 | Pending |
| CLEAN-01 | Phase 38 | Pending |
| DOCS-03 | Phase 39 | Pending |

**Coverage:**
- v3.1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 — traceability filled in after roadmap creation*
