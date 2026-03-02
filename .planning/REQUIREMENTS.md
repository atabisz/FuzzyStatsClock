# Requirements: FuzzyStatsClock

**Defined:** 2026-03-02
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v2.2 Requirements

### System Tray

- [x] **TRAY-01**: Application displays a system tray icon while running
- [x] **TRAY-02**: System tray icon shows a context menu with "Reset to Defaults" and "Quit" items
- [x] **TRAY-03**: "Reset to Defaults" sets accent color to White, opacity to 100%, and centers the widget on the primary screen
- [x] **TRAY-04**: "Reset to Defaults" saves the reset state to settings.json immediately
- [x] **TRAY-05**: "Quit" exits the application cleanly
- [x] **TRAY-06**: System tray icon is removed from the tray when the application exits

## Future Requirements

### Window Management

- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

### Startup

- **STRT-01**: Auto-launch on Windows login (registry key)

## Out of Scope

| Feature | Reason |
|---------|--------|
| System tray left-click to show/hide widget | Not requested; widget is always visible |
| Tray icon animated/dynamic state | Over-engineering for a minimal overlay tool |
| Full settings UI from tray | Single window, no settings screens — core constraint |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRAY-01 | Phase 24 | Complete |
| TRAY-02 | Phase 24 | Complete |
| TRAY-03 | Phase 24 | Complete |
| TRAY-04 | Phase 24 | Complete |
| TRAY-05 | Phase 24 | Complete |
| TRAY-06 | Phase 24 | Complete |

**Coverage:**
- v2.2 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — traceability confirmed after roadmap creation*
