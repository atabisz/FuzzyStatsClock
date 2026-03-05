# Requirements: Fuzzy Clock v2.9

**Defined:** 2026-03-05
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v2.9 Requirements

### Process Threshold

- [ ] **THRESH-01**: User can set the active process count threshold (2% / 5% / 10% CPU) via tray Stats submenu; current selection shown as checkmark; default 5%
- [ ] **THRESH-02**: Threshold persists to settings.json and restores on launch; UpdateUptimeDisplay() uses the persisted value

## Future Requirements

*(None identified for future milestones at this time)*

## Out of Scope

| Feature | Reason |
|---------|--------|
| Arbitrary threshold input | 3-step ladder (2/5/10) is sufficient; avoids text input complexity |
| Threshold shown inline in uptime text | Annotation adds clutter; the count itself is the signal |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| THRESH-01 | Phase 35 | Pending |
| THRESH-02 | Phase 35 | Pending |

**Coverage:**
- v2.9 requirements: 2 total
- Mapped to phases: 2
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-05*
