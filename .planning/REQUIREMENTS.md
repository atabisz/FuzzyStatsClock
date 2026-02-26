# Requirements: Fuzzy Clock

**Defined:** 2026-02-26
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

Requirements for v1.5 release. Each maps to a roadmap phase.

### Hover Fast-Refresh

- [ ] **HVRF-01**: When the mouse enters the widget and the stats panel is visible, the stats refresh rate switches to 0.5s
- [ ] **HVRF-02**: When the mouse leaves the widget, the stats refresh rate returns to the user's configured interval (1s/3s/10s)
- [ ] **HVRF-03**: When the stats panel is hidden, mouse hover has no effect on the stats timer

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
| Hover-triggered stats panel auto-show | Keep stats panel state user-controlled; hover only affects refresh rate |
| Configurable hover refresh interval | 0.5s is a fixed fast-peek rate; adding config adds complexity for minimal gain |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HVRF-01 | Phase 12 | Pending |
| HVRF-02 | Phase 12 | Pending |
| HVRF-03 | Phase 12 | Pending |

**Coverage:**
- v1 requirements: 3 total
- Mapped to phases: 3
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 — Phase 12 roadmap created*
