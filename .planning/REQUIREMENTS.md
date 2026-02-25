# Requirements: Fuzzy Clock v1.2

**Defined:** 2026-02-25
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1.2 Requirements

### Stats Panel

- [x] **STAT-01**: Stats panel shows CPU, GPU, and memory usage below the time phrase
- [x] **STAT-02**: Each stat displays as a horizontal bar + percentage text
- [x] **STAT-03**: Update interval (1s / 3s / 10s) is user-selectable via right-click Stats submenu
- [x] **STAT-04**: Stats panel visibility (show/hide) is user-toggleable via right-click Stats submenu
- [x] **STAT-05**: Stats visibility and update interval persist to settings.json and restore on launch

## v2+ Requirements

### Stats Enhancements

- **STAT-06**: Bar color changes at thresholds (green/yellow/red) — medium complexity, nice-to-have
- **STAT-07**: Per-monitor position persistence (multi-monitor identity via screen handle) — WIN-06 from deferred list
- **STAT-08**: Per-core CPU bar breakdown — high complexity
- **STAT-09**: Historical sparkline graphs — high complexity
- **STAT-10**: VRAM usage — requires vendor-specific DLLs or WMI
- **STAT-11**: Network / disk I/O stats — scope expansion beyond widget concept
- **STAT-12**: GPU / CPU temperature — requires NVAPI/ADL, wrong library surface for this widget

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-process CPU list | That is Task Manager, not a desktop widget |
| GPU/CPU temperature | Requires NVAPI/ADL vendor DLLs; not available as PDH counters |
| Click stat row to open Resource Monitor | Conflicts with drag behavior; DragMove() needs mouse events |
| Custom color themes / color picker | Violates the widget's no-settings-screens philosophy |
| Settings screen / system tray icon | Keep it simple — right-click context menu only |
| WMI for counter reads | 10–50x slower than PDH for identical data |
| LibreHardwareMonitor / OpenHardwareMonitor | Requires kernel driver installation |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAT-01 | Phase 8 | Complete |
| STAT-02 | Phase 8 | Complete |
| STAT-03 | Phase 9 | Complete |
| STAT-04 | Phase 9 | Complete |
| STAT-05 | Phase 6 + Phase 9 | Complete |

**Coverage:**
- v1.2 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0

**Phase assignments:**
- Phase 6 (AppSettings Migration): STAT-05 persistence layer foundation
- Phase 7 (StatsService): STAT-01 data layer
- Phase 8 (XAML Layout and Stats Display): STAT-01 (visual display), STAT-02
- Phase 9 (Controls, Persistence, and Edge Cases): STAT-03, STAT-04, STAT-05 (full round-trip)

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after v1.2 roadmap created — phase assignments added*
