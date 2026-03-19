# Requirements: FuzzyClock v3.6.2

**Defined:** 2026-03-19
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

### Bug Fix

- [ ] **FIX-04**: When AutoContrast is enabled and the widget sits over an empty desktop, text color remains stable — no oscillation or flicker (regression from v3.6.1)
- [ ] **FIX-05**: When BackdropAlwaysVisible is enabled and the widget sits over an empty desktop, backdrop and text colors remain stable — no oscillation or flicker (regression from v3.6.1)
- [ ] **FIX-06**: AutoContrast correctly switches text to black/white when the widget is over an application window — no regression from the fix

## v2 Requirements

None deferred.

## Out of Scope

| Feature | Reason |
|---------|--------|
| ContrastSamplerService architecture refactor | Structural changes not needed; targeted guard fix is sufficient |
| New contrast modes or thresholds | Out of scope — this milestone fixes a regression only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-04 | Phase 58 | Pending |
| FIX-05 | Phase 58 | Pending |
| FIX-06 | Phase 58 | Pending |

**Coverage:**
- v1 requirements: 3 total
- Mapped to phases: 3
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — traceability confirmed after roadmap creation*
