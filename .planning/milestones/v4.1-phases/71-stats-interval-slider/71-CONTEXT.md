# Phase 71: Stats Interval Slider - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the discrete 1s/3s/10s ComboBox in Settings > Stats with a continuous 0.5–10.0s Slider. The stats update rate becomes a decimal value persisted to settings.json, with validation clamping and rounding.

</domain>

<decisions>
## Implementation Decisions

### Default Interval
- **D-01:** Default shifts from 3s to **2.0s** for new installs and Reset to Defaults. Compromise between responsiveness and resource usage.

### Slider Presentation
- **D-02:** Clean slider with **no tick marks** — matches existing OpacitySlider, BackdropOpacitySlider, GhostFadeRadiusSlider patterns.
- **D-03:** Value label format is **compact "2.5s"** — matches GhostFadeRadiusLabel ("80px") density.

### Tray Menu
- **D-04:** No tray menu changes needed — stats interval control is already exclusively in Settings > Stats (moved in v3.2).

### Claude's Discretion
- Field type migration strategy (`int` → `double` for `StatsIntervalSeconds`) — backward compat with existing settings.json files that have integer values
- Slider step granularity (0.1s increments implied by STAT-04 Math.Round to 1 decimal place)
- CPU load average sample math adjustment for fractional intervals

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Settings Window Slider Pattern
- `FuzzyClock.App/SettingsWindow.xaml` §264-269 — OpacitySlider (established slider + label pattern)
- `FuzzyClock.App/SettingsWindow.xaml` §531-541 — GhostFadeRadiusSlider (most recent slider, includes gated sub-panel)

### Current Stats Interval Implementation
- `FuzzyClock.App/SettingsWindow.xaml` §450-462 — CmbStatsInterval ComboBox (being replaced)
- `FuzzyClock.App/SettingsWindow.xaml.cs` §520-525 — CmbStatsInterval_SelectionChanged handler
- `FuzzyClock.App/SettingsWindow.xaml.cs` §131-137 — ComboBox index mapping from StatsIntervalSeconds

### AppSettings & Validation
- `FuzzyClock.App/AppSettings.cs` §17 — `StatsIntervalSeconds` init-property (int, default 3)
- `FuzzyClock.App/SettingsService.cs` §74-78 — Validate() guard for StatsIntervalSeconds <= 0
- `FuzzyClock.App/SettingsService.cs` §138 — Defaults() StatsIntervalSeconds = 3

### MainWindow Integration
- `FuzzyClock.App/MainWindow.xaml.cs` §949-958 — SetStatsInterval(int) method
- `FuzzyClock.App/MainWindow.xaml.cs` §841-853 — CPU load average sample math using _statsIntervalSeconds
- `FuzzyClock.App/MainWindow.xaml.cs` §1018-1023 — Hover fast-refresh (0.5s override)

### Existing Tests
- `FuzzyClock.App.Tests/SettingsServiceTests.cs` §20-24 — Validate_ZeroStatsInterval_ReturnsDefault
- `FuzzyClock.App.Tests/AppSettingsTests.cs` §30,63 — StatsIntervalSeconds round-trip

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Slider + TextBlock pattern**: OpacitySlider, BackdropOpacitySlider, GhostFadeRadiusSlider all follow identical XAML layout (Slider + TextBlock label) with ValueChanged handler updating label text and firing event
- **SettingsSnapshot**: Already has `StatsIntervalSeconds` property — type changes to `double`
- **SetStatsInterval()**: Existing method handles timer stop/restart — needs parameter type change only

### Established Patterns
- `Action<T>?` events from SettingsWindow → MainWindow (StatsIntervalChanged currently `Action<int>?`)
- AppSettings init-property record with JSON serialization — `int` → `double` is JSON-compatible (existing integer values deserialize to double)
- `Validate()` guard pattern: check range, clamp to default if invalid
- `ResetToDefaults()` in MainWindow restores field values from `SettingsService.Defaults()`

### Integration Points
- `_statsIntervalSeconds` field in MainWindow (int → double) drives timer interval and CPU load avg math
- `SettingsSnapshot.StatsIntervalSeconds` populates slider on SettingsWindow open
- Hover fast-refresh (0.5s) is hardcoded — unaffected by slider range starting at 0.5s
- CPU load avg calculations: `(15 * 60) / _statsIntervalSeconds` — currently int division, needs double division

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing slider patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 71-stats-interval-slider*
*Context gathered: 2026-04-01*
