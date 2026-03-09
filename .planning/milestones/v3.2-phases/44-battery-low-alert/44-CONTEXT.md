# Phase 44: Battery Low Alert - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

When battery drops below a configurable threshold while unplugged, the battery stat row's progress bar shifts to red (#FFFF4444). Clears when battery rises above threshold OR device is plugged in. Threshold selectable (10%/15%/20%, default 20%) in a new Battery Alert section in the Settings window Behavior tab. Auto-contrast sampling and named themes must not override the red alert color while active.

</domain>

<decisions>
## Implementation Decisions

### Behavior tab UI

- New **"Battery Alert"** labeled section at the bottom of the Behavior tab, below Auto-Launch
- Always visible — not conditional on battery row being enabled
- Three **radio buttons** for threshold: 10% / 15% / 20% — matches the existing process threshold radio button pattern (RbThresh2/5/10 in Stats tab)
- Default: 20%

### Alert trigger logic

- Alert fires when: battery ≤ threshold **AND** device is unplugged
- **1% dead-band on clear**: alert clears when battery > threshold + 1% (e.g., at 20% threshold: alert at ≤20%, clears at ≥22%) — prevents flicker near boundary
- Either condition clearing removes the alert: plugging in OR battery rising above threshold + 1%

### Visual scope

- **Bar only** goes red (#FFFF4444) — text/label stays in normal accent color
- Instant snap — no animation or pulse
- `_batteryAlertActive` flag protects the red bar from being overridden by:
  - Auto-contrast sampling (`ApplyDisplayColor()`)
  - Named theme application (`ApplyNamedTheme()`)
  - `ApplyTheme()` general redraws
- **Alert wins over themes**: while alert is active, applying a named theme does not change the bar color

### Claude's Discretion

- Where `_batteryAlertActive` flag is checked in `ApplyTheme()` and `ApplyDisplayColor()` (only the battery bar brush path)
- Whether the flag is stored as a field or derived from battery state on each call
- `AppSettings.BatteryAlertThresholdPercent` default value storage (int vs double)
- `BatteryAlertThresholdChanged` event naming and wiring in `OpenSettings()`

</decisions>

<specifics>
## Specific Ideas

- The radio button pattern should match `RbThresh2/5/10` already in the Stats tab — planner should study that pattern for naming convention and XAML layout
- The 1% dead-band is important: prevents the bar from rapidly switching red/normal if `PowerStatus.BatteryLifePercent` oscillates near the threshold

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 44-battery-low-alert*
*Context gathered: 2026-03-09*
