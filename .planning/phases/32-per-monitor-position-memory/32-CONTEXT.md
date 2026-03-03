# Phase 32: Per-Monitor Position Memory - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Widget remembers and independently restores its last-used position on each monitor. Dragging on monitor A does not affect monitor B's saved position. When a previously-used monitor is absent at startup, the widget centers on the primary screen. This phase only adds per-monitor persistence — no new UI, no user-visible monitor management.

</domain>

<decisions>
## Implementation Decisions

### Monitor identification
- Key by **friendly name** (e.g. "Dell U2720Q"), normalized to **lowercase** for case-insensitive matching
- When two monitors share the same friendly name: distinguish by numeric suffix ("dell u2720q-1", "dell u2720q-2"); ordering determined at runtime
- Fallback when no friendly name is available: use **screen bounds** (Left/Top/Width/Height as key)

### Position save timing
- Save to settings on **drag-end only** (no periodic writes, no extra save on window close)
- On startup: restore to the **last-active monitor** (whichever monitor the widget was on at last session end)
- Cross-monitor drag: save to destination monitor at drag-end; **clear source monitor's entry** (only one monitor holds a saved position at a time)

### Missing monitor fallback
- If last-active monitor is absent at startup: **silently center on primary monitor** — no notification or log entry
- When a previously-missing monitor reconnects in a future session: **restore its saved position** (entry persists in settings while disconnected)
- If a restored position would be partially/fully off-screen (e.g. resolution changed): **clamp to visible area** of that monitor (same logic as existing startup clamp)

### Settings migration
- Existing top-level `Left`/`Top` values: **migrate to primary monitor entry** (user keeps their saved position on main screen)
- New storage format: **dictionary keyed by monitor name** in `AppSettings`, e.g. `MonitorPositions: { "dell u2720q": { "Left": 100, "Top": 50 } }`
- **Remove** old `Left`/`Top` top-level properties after migration (no backward-compat shim)
- Monitor entries: **unbounded** (no cap — entries are tiny, users rarely exceed 4 monitors)

### Claude's Discretion
- Exact Win32 API for retrieving monitor friendly name (e.g. `SetupAPI`, `DXGI`, or `GetMonitorInfoEx` path)
- How numeric suffix ordering is determined when multiple same-name monitors are present
- Where migration logic runs (SettingsService load-time vs first ContentRendered)

</decisions>

<specifics>
## Specific Ideas

- No specific references — open to standard Win32/WPF approaches for monitor enumeration

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 32-per-monitor-position-memory*
*Context gathered: 2026-03-03*
