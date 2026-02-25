# Requirements: Fuzzy Clock v1.2

**Defined:** 2026-02-25
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v1.2 Requirements

### Stats Panel

- [ ] **STAT-01**: Stats panel shows CPU, GPU, and memory usage below the time phrase
- [ ] **STAT-02**: Each stat displays as a horizontal bar + percentage text
- [ ] **STAT-03**: Update interval (1s / 3s / 10s) is user-selectable via right-click Stats submenu
- [ ] **STAT-04**: Stats panel visibility (show/hide) is user-toggleable via right-click Stats submenu
- [ ] **STAT-05**: Stats visibility and update interval persist to settings.json and restore on launch

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
| STAT-01 | — | Pending |
| STAT-02 | — | Pending |
| STAT-03 | — | Pending |
| STAT-04 | — | Pending |
| STAT-05 | — | Pending |

**Coverage:**
- v1.2 requirements: 5 total
- Mapped to phases: 0
- Unmapped: 5 (roadmapper will assign)

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after initial definition*
