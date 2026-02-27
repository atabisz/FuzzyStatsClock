# Requirements: Fuzzy Clock

**Defined:** 2026-02-27
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v2.0 Requirements

Requirements for v2.0 Visual Identity milestone. Each maps to roadmap phases.

### Theme

- [x] **THEME-01**: User can select a built-in accent color preset (White, Amber, Ice Blue, Green, Hello Kitty Pink) via a right-click Theme submenu; current preset shown as checked
- [ ] **THEME-02**: User can set a custom accent color via a color picker dialog ("Custom..." entry in the Theme submenu)
- [x] **THEME-03**: Active accent color is applied consistently to phrase text, dial hands and decorations (ticks, dots, numbers), and stats bars and percentage text
- [x] **THEME-04**: Active theme (preset name or custom hex color) persists to settings.json and restores on launch

### Opacity

- [x] **OPAC-01**: User can set widget opacity to 25%, 50%, 75%, or 100% via a right-click Opacity submenu; current level shown as checked
- [x] **OPAC-02**: User can adjust widget opacity in 10% increments by scrolling the mouse wheel over the widget
- [x] **OPAC-03**: Opacity applies to the entire widget window (phrase, dial, stats panel, hover backdrop)
- [x] **OPAC-04**: Opacity setting persists to settings.json and restores on launch

## Future Requirements

Deferred to a future release. Tracked but not in current roadmap.

### Identity / Customization

- **THEME-05**: User can save and name custom color themes
- **THEME-06**: User can export/import theme presets

### Startup & System

- **STRT-01**: Auto-launch on Windows login (registry key)

### Multi-Monitor

- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Per-element color control | One accent color is the core simplicity value; per-element breaks visual coherence |
| Settings panel / dialog | Keep widget interaction to right-click only; no chrome |
| Dark/light mode detection | Widget is always on desktop; system theme is irrelevant |
| Font family selector | Segoe UI Light is part of the design identity |
| Click-through / no interaction | Incompatible with drag (kills DragMove() event delivery) |
| 24-hour format | Natural English implies 12-hour |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| THEME-01 | Phase 20 | Complete |
| THEME-02 | Phase 21 | Pending |
| THEME-03 | Phase 20 | Complete |
| THEME-04 | Phase 18 | Complete |
| OPAC-01 | Phase 19 | Complete |
| OPAC-02 | Phase 19 | Complete |
| OPAC-03 | Phase 19 | Complete |
| OPAC-04 | Phase 18 | Complete |

**Coverage:**
- v2.0 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 — traceability filled after roadmap creation*
