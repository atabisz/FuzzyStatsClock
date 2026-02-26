# Requirements: Fuzzy Clock

**Defined:** 2026-02-26
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

Requirements for v1.7 release. Each maps to a roadmap phase.

### Backdrop

- [ ] **BACK-01**: When the stats panel is visible and the mouse is over the widget, a semi-transparent backdrop (~35% black alpha) appears behind the widget
- [ ] **BACK-02**: When the mouse leaves the widget (and stats are visible), the backdrop returns to fully transparent
- [ ] **BACK-03**: When the stats panel is hidden, the widget background is always fully transparent regardless of hover state

### Drag

- [ ] **DRAG-01**: While dragging the widget, stats updates pause; they resume immediately when the drag completes

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
| Animated fade transition | Instant opacity change matches the widget's minimal aesthetic; animation adds complexity |
| Backdrop color choices | Black alpha is correct for readability on any wallpaper |
| Stats pause on minimize/hide | Only during active drag; other cases don't cause visual hiccups |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BACK-01 | Phase 14 | Pending |
| BACK-02 | Phase 14 | Pending |
| BACK-03 | Phase 14 | Pending |
| DRAG-01 | Phase 14 | Pending |

**Coverage:**
- v1 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 — v1.7 milestone started*
