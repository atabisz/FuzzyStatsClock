# Phase 37: Battery Stat Row - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a battery charge % stat row below the PAG row in the stats panel. The row shows a horizontal bar and percentage text reflecting current charge. On desktops/VMs with no battery, the row shows an empty bar and "N/A" text. A tray Stats submenu toggle controls visibility; hiding all five rows (CPU/GPU/MEM/PAG/BATT) auto-collapses the panel. Visibility is persisted to settings.json with default enabled.

</domain>

<decisions>
## Implementation Decisions

### Charging state indicator
- Show ⚡ appended to the percentage text when AC power is connected (e.g. "72% ⚡")
- ⚡ means "plugged in" — it appears whenever AC power is connected, regardless of whether the battery is actively charging or already full
- No ⚡ when on battery power only

### Low battery styling
- Uniform accent color at all charge levels — no color change at low battery
- Same visual style as other stat rows (CPU/GPU/MEM/PAG)

### N/A row behavior (desktop / VM with no battery)
- Hidden by default on machines with no battery detected; user can show it via tray toggle
- Tray Stats submenu toggle is always present regardless of whether a battery exists
- When visible on a no-battery machine: empty bar (0% fill) + "N/A" text — layout stays consistent

### Update cadence
- Battery polled on the same stats refresh timer as CPU/GPU/MEM/PAG
- No separate battery-specific timer

### Claude's Discretion
- Exact XAML layout of bar + text within the battery row
- How to detect AC power state (SystemInformation.PowerStatus.PowerLineStatus or equivalent)
- How to detect no-battery (e.g. BatteryChargeStatus.NoSystemBattery or equivalent)
- Whether "default enabled" on a no-battery machine means BatteryVisible=true in settings but the row starts hidden (auto-detected), or BatteryVisible defaults to false on no-battery machines

</decisions>

<specifics>
## Specific Ideas

- Row label should follow the same format as other rows (e.g. "BATT" or similar prefix consistent with CPU/GPU/MEM/PAG labels)
- ⚡ symbol after the % value, not before

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 37-battery-stat-row*
*Context gathered: 2026-03-07*
