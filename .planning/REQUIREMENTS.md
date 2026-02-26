# Requirements: Fuzzy Clock

**Defined:** 2026-02-26
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1 Requirements

Requirements for v1.6 release. Each maps to a roadmap phase.

### Dial Mode

- [x] **DIAL-01**: User can switch between phrase mode and dial mode via the right-click context menu
- [x] **DIAL-02**: In dial mode, the widget displays hour and minute hands on a transparent background (no face, no circle, no numbers — hands only)
- [ ] **DIAL-03**: Hands update every minute to accurately reflect the current hour and minute position
- [x] **DIAL-04**: The stats panel remains visible below the dial when stats are enabled
- [x] **DIAL-05**: The selected clock mode (phrase/dial) persists to settings.json and restores on launch

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
| Second hand on dial | Not requested; adds update complexity for minimal value |
| Smooth sweeping hand animation | Minute-accurate jumps are sufficient; animation adds complexity |
| Multiple dial styles / sizes | Hands-only minimal style is the design intent |
| Click-to-switch (phrase ↔ dial) | Menu toggle only; click is used for drag via DragMove() |
| Hover-triggered stats panel auto-show | Keep stats panel state user-controlled |
| Configurable hover refresh interval | 0.5s is a fixed fast-peek rate |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIAL-01 | Phase 13 | Complete |
| DIAL-02 | Phase 13 | Complete |
| DIAL-03 | Phase 13 | Pending |
| DIAL-04 | Phase 13 | Complete |
| DIAL-05 | Phase 13 | Complete |

**Coverage:**
- v1 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 — v1.6 milestone started*