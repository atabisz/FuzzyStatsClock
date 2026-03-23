# Requirements: Fuzzy Clock

**Defined:** 2026-03-23
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.8 Requirements

### Dial Decoration Settings

- [x] **DIAL-10**: Settings > Appearance shows three checkboxes — "Hour Ticks", "Minute Dots", "Hour Numbers" — that are visible only when Dial clock style is active; they are hidden when Phrase or Nixie is active
- [x] **DIAL-11**: Each checkbox reflects the persisted value on open (via `PopulateControls`), fires its `Changed` event immediately on toggle so the widget updates live, and persists to settings.json; values restore on app restart

## Future Requirements

### LCD Clock

- LCD digit display as a fourth clock type (after Nixie plumbing is in place)
- LCD settings UI (LcdUse24Hr, LcdShowSeconds, LcdStyle) surfaced in Settings > Appearance

## Out of Scope

| Feature | Reason |
|---------|--------|
| Right-click context menu entries for dial decorations | Settings window is the single source of truth since v3.2; context menu removed |
| New decoration types beyond Hour Ticks / Minute Dots / Hour Numbers | Out of scope for this milestone |
| LCD settings UI | Deferred to future milestone after LCD clock type is implemented |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIAL-10 | Phase 60 | Complete |
| DIAL-11 | Phase 60 | Complete |

**Coverage:**
- v3.8 requirements: 2 total
- Mapped to phases: 2 (all covered)
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
