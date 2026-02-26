# Requirements: Fuzzy Clock

**Defined:** 2026-02-26
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

Requirements for v1.8 release. Each maps to a roadmap phase.

### Backdrop

- [x] **BACK-04**: Widget background becomes semi-transparent (~35% black) when the mouse is over the widget, regardless of whether the stats panel is visible; backdrop clears immediately when the mouse leaves

### Dial Face

- [ ] **DIAL-06**: In dial mode, user can show/hide hour tick marks (12 short lines at each hour position) via right-click submenu; persisted across restarts
- [ ] **DIAL-07**: In dial mode, user can show/hide minute marks (60 small dots at each minute position) via right-click submenu; persisted across restarts
- [ ] **DIAL-08**: In dial mode, user can show/hide hour number labels (1–12 at each hour position) via right-click submenu; persisted across restarts
- [ ] **DIAL-09**: Dial face decoration menu options are hidden when in phrase mode; they appear in the context menu only when dial mode is active

## v2 Requirements

Deferred to future release.

### Window / Position

- **STRT-01**: Auto-launch on Windows login (registry key)
- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

| Feature | Reason |
|---------|--------|
| Configurable backdrop opacity | ~35% is chosen to be visually comfortable; configurability adds UI complexity for minimal gain |
| Animated backdrop transition | Instant opacity change matches the widget's minimal aesthetic |
| Backdrop color choices | Black alpha is correct for readability on any wallpaper |
| Second hand on dial | Phrase/dial updates every 10s; second-level accuracy inconsistent with the widget's fuzzy philosophy |
| Date display on dial | Scope creep; core value is time glanceability, not a full clock widget |
| Configurable dial size | Font size (Small/Medium/Large) already controls overall widget scale |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BACK-04 | Phase 15 | Complete |
| DIAL-06 | Phase 16 | Pending |
| DIAL-07 | Phase 16 | Pending |
| DIAL-08 | Phase 16 | Pending |
| DIAL-09 | Phase 16 | Pending |

**Coverage:**
- v1 requirements: 5 total
- Mapped to phases: 5 (roadmap complete)
- Unmapped: 0

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 — BACK-04 complete (Phase 15); 4 remaining requirements in Phase 16*
