# Requirements: Fuzzy Clock

**Defined:** 2026-02-25
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1.1 Requirements

Requirements for v1.1 release. Each maps to roadmap phases.

### Window

- [ ] **WIN-04**: User can drag the widget to any position on the desktop
- [ ] **WIN-05**: Widget position is restored on startup; if saved position is off-screen (e.g. after monitor change), it is clamped to visible area

### Display

- [ ] **DISP-05**: User can change the phrase font size (16pt, 24pt, or 32pt) via right-click menu; current size shown as checked
- [ ] **DISP-06**: Selected font size is restored on startup (saved to same JSON file as position)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Startup

- **STRT-01**: Application launches automatically on Windows login (via registry key)

### Window

- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Settings / preferences UI | Contradicts the "no chrome" core value |
| Arbitrary font size input | Fixed 3-step ladder is sufficient; arbitrary input adds complexity |
| Font family selector | Single clean font (Segoe UI Light) is part of the design |
| Click-through transparent areas | Incompatible with drag — kills DragMove() event delivery |
| Per-second or per-minute updates | 5-minute buckets; more frequent updates add no value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIN-04 | Phase 4 | Pending |
| WIN-05 | Phase 4 | Pending |
| DISP-05 | Phase 5 | Pending |
| DISP-06 | Phase 5 | Pending |

**Coverage:**
- v1.1 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after v1.1 roadmap created*
