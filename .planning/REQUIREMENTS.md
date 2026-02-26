# Requirements: Fuzzy Clock

**Defined:** 2026-02-26
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1.9 Requirements

Requirements for the v1.9 Context-Aware Menus milestone.

### Menu

- [x] **MENU-01**: Font Size submenu is hidden from the context menu when dial mode is active; it reappears when switching back to phrase mode

## Future Requirements

Acknowledged but deferred.

### Deferred (v2+)

- **STRT-01**: User can configure app to auto-launch on Windows login (registry key)
- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

| Feature | Reason |
|---------|--------|
| System tray icon / settings UI | Keep it simple — right-click menu is the only UI |
| 24-hour format | Natural English implies 12-hour |
| Click-through / no interaction | Incompatible with drag (kills DragMove() event delivery) |
| Arbitrary font size input | 3-step ladder is sufficient |
| Font family selector | Single clean font (Segoe UI Light) is part of the design |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MENU-01 | Phase 17 | Complete |

**Coverage:**
- v1.9 requirements: 1 total
- Mapped to phases: 1
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 — Phase 17 assigned; traceability confirmed*
