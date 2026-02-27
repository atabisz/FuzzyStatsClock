# Requirements: Fuzzy Clock

**Defined:** 2026-02-27
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v2.1 Requirements

Requirements for v2.1 Uptime milestone. Each maps to roadmap phases.

### Uptime

- [x] **UPT-01**: Widget displays system uptime in `up Xd Xh Xm` format (leading zero-units suppressed, e.g. `up 5h 3m` not `up 0d 5h 3m`) alongside three rolling CPU load averages (1m/5m/15m) as decimal values (`0.52, 0.47, 0.43`) as a compact single line below the stats panel, themed in the active accent color
- [x] **UPT-02**: User can show or hide the uptime/load line via a right-click Stats submenu toggle; visible by default; persisted to settings.json and restored on launch

## Future Requirements

Deferred to a future release. Tracked but not in current roadmap.

### Uptime / System Info

- **UPT-03**: Boot time tooltip shown on hover over the uptime portion
- **UPT-04**: Peak load indicator when 1m load exceeds a threshold

### Startup & System

- **STRT-01**: Auto-launch on Windows login (registry key)

### Multi-Monitor

- **WIN-06**: Widget position persists per monitor (multi-monitor identity via screen handle)
- **WIN-07**: Widget snaps to screen edges when dragged near them

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Seconds in uptime display | Creates display churn; no value at widget scale |
| Separate rows for uptime vs. load averages | Contradicts single-line compact spec |
| Configurable averaging windows | 1/5/15 is a universal standard; deviation confuses users |
| WMI-based uptime | Heavyweight with startup latency; `Environment.TickCount64` is sufficient |
| Separate toggles for uptime vs. load portions | One line, one toggle |
| EWMA (exponential moving average) | Queue-trimmed simple average is sufficient and more transparent |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UPT-01 | Phase 23 | Complete |
| UPT-02 | Phase 22 | Complete |

**Coverage:**
- v2.1 requirements: 2 total
- Mapped to phases: 2
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 — traceability confirmed; UPT-01 → Phase 23, UPT-02 → Phase 22*
