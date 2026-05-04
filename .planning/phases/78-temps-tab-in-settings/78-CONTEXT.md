# Phase 78: Temps Tab in Settings — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a new **Temps** tab to `SettingsWindow` (slotted between Stats and Behavior) that exposes the five `AppSettings` temp-visibility bools already landed in Phase 76, with per-sensor N/A degradation driven by `TemperatureService` from Phase 75-02.

**In scope:**
- `FuzzyClock.App/SettingsWindow.xaml` — add `<TabItem Header="Temps">` as the 3rd tab (position index 2), containing the master toggle + sensor WrapPanel + help text
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `ChkTempsVisible_Changed` + 4 per-sensor `ChkTempXVisible_Changed` handlers; 5 new `event Action<bool>?` hooks following the established shape (lines 23–55 are the precedent)
- `FuzzyClock.App/SettingsSnapshot.cs` — 5 new fields
- `FuzzyClock.App/MainWindow.xaml.cs` — 5 new handlers wiring events → `_settings` mutation → `SettingsService.Save(_settings)`; extend `GetCurrentSettingsSnapshot()`
- `ResetToDefaults()` — reset all 5 new fields to their documented defaults (TempsLineVisible=false, CPU/GPU=true, Mobo/NVMe=false)
- N/A detection logic: post-`IsReady`, sensors where `_temperatureService.<Kind>TempC < 0f` get `.IsEnabled = false` + Content suffix " (N/A)"
- MSTest coverage for the new snapshot fields + event contract (App-side; no Core changes)

**Out of scope (later phases):**
- Widget rendering of `TempsText` — Phase 79
- Event wiring from Settings events to the MainWindow temps render path — Phase 79 (Phase 78 just raises the events; Phase 79 consumes them)
- Installer / CI grep gates / MPL notices — Phase 80
- Any change to `TemperatureService` / `ITempSource` public surface — locked by Phase 75 D-11 (no `IsSensorAvailable` API)
- Any change to `FuzzyClock.Core/` — REL-03 invariant (no LHM references in Core); this is a pure App-side phase

</domain>

<decisions>
## Implementation Decisions

### N/A Detection (Area 1)

- **D-01:** **Read sentinel values directly from `TemperatureService`** — the Temps tab calls `_temperatureService.CpuTempC`, `GpuTempC`, `MoboTempC`, `NvmeTempC` and treats `value < 0f` (i.e. `-1f` sentinel) as N/A. **No new API surface** on `ITempSource` or `TemperatureService`. Matches the `-1f` discipline established in Phase 75 D-11/D-12 and mirrors the existing `GpuPercent`/`PagPercent`/`BatteryPercent` convention.
- **D-02:** **`IsReady` race policy — optimistic before ready:** before `IsReady` flips true (up to 5s on cold start per Phase 75 timeout), all 4 per-sensor checkboxes render **enabled with no "(N/A)" suffix**. Only after `IsReady` is true does the tab evaluate sentinels and apply disable + suffix. Rationale: user expectation is responsive checkboxes; greying everything out for 5s on cold start looks broken. The probability of opening Settings during the 5s init window is low but non-zero.
- **D-03:** **N/A evaluation is snapshot-at-open, not live:** the tab evaluates sensor availability once when the window is opened (or refreshed via `RefreshControls`). It does NOT subscribe to `IsReady` changes or poll live. If `IsReady` flips after Settings is already open, the tab stays in its opened-state assumptions until the user closes and reopens Settings. Rationale: modeless window simplicity; hot-swap of sensor state mid-Settings-session is an edge-of-edge case.

### Master Toggle Gates Sub-Panel (Area 2)

- **D-04:** **Sub-panel grays out via `IsEnabled = false` when master is OFF** — the four per-sensor checkboxes are wrapped in a named `<StackPanel x:Name="TempSensorsPanel">`. When `ChkTempsVisible` is unchecked, `TempSensorsPanel.IsEnabled = false`. When checked, `IsEnabled = true`. Mirrors `GhostFadeRadiusPanel` (the canonical gated sub-panel in Behavior tab, SettingsWindow.xaml:407–419, explicitly cited in CLAUDE.md as a critical pattern). Stored values are preserved — user edits while master is off are saved but dormant.
- **D-05:** **Help text stays enabled regardless** — the PawnIO/admin disclaimer TextBlock sits outside `TempSensorsPanel` so it remains readable even when the master toggle is off. Users reading "why are these checkboxes greyed out" can still see the disclaimer.

### N/A Checked-State Policy (Area 3)

- **D-06:** **Disabled checkboxes reflect the stored value** — if `TempNvmeVisible=true` in `settings.json` but NVMe is N/A on the current machine, the NVMe checkbox is `IsEnabled=false` AND `IsChecked=true` (greyed checkmark). The stored value is **untouched**. Consequence: when the user moves back to a machine where NVMe is available, the checkbox becomes enabled and the sensor re-appears on the widget automatically — non-destructive roaming.
- **D-07:** **"(N/A)" label suffix** — when a sensor is detected N/A (per D-01 + D-02 timing), the Content of the checkbox is `"CPU (N/A)"` / `"GPU (N/A)"` / `"Mobo (N/A)"` / `"NVMe (N/A)"`. The suffix is a literal " (N/A)" appended to the existing label. When the sensor becomes available again on a subsequent launch, the suffix is absent (labels are set in `RefreshControls`, not hard-coded in XAML).

### Help Text Placement & Wording (Area 4)

- **D-08:** **Help text lives below the sensor WrapPanel, muted style** — a TextBlock with `Foreground="#FF999999" FontSize="11" TextWrapping="Wrap"` sits beneath the four-checkbox row, matching the existing Behavior tab patterns (SettingsWindow.xaml:389 for "Phrase Language" description; SettingsWindow.xaml:430 for "Battery Alert" description). Text is the exact wording locked by TEMP-TAB-03:

  > _"CPU and NVMe readings may require elevated access or a helper driver (e.g. PawnIO) on some hardware; disabled checkboxes indicate the sensor is unavailable on this machine."_

- **D-09:** **Not tooltips** — the disclaimer is visible inline, not hidden in a tooltip on the disabled checkbox. Tooltips are discoverable only by hover and hostile to screen readers.

### Snapshot + Event Plumbing

- **D-10:** **5 new `SettingsSnapshot` fields** — `TempsLineVisible`, `TempCpuVisible`, `TempGpuVisible`, `TempMoboVisible`, `TempNvmeVisible` (all `bool`). Populated by `GetCurrentSettingsSnapshot()` in MainWindow.xaml.cs:379 from `_settings.TempXVisible`.
- **D-11:** **5 new events** on `SettingsWindow` matching the established `public event Action<bool>?` shape (precedent at SettingsWindow.xaml.cs:37–43 for the Stats visibility events). Event names: `TempsLineVisibleChanged`, `TempCpuVisibleChanged`, `TempGpuVisibleChanged`, `TempMoboVisibleChanged`, `TempNvmeVisibleChanged`.
- **D-12:** **MainWindow handlers** mutate `_settings` via a new `with { TempXVisible = ... }` record-copy (AppSettings is an init-property record — Phase 76 Plan 01 established this) and call `SettingsService.Save(_settings)`. Phase 78 does NOT trigger any widget render path — those events hook in Phase 79. For Phase 78, the handlers only persist the values.
- **D-13:** **`RefreshControls(SettingsSnapshot)`** extended to populate all 5 new controls: set `IsChecked` from the snapshot, evaluate per-sensor N/A per D-01/D-02, set `IsEnabled` + Content suffix accordingly, and gate `TempSensorsPanel.IsEnabled` per D-04.

### ResetToDefaults

- **D-14:** **All 5 fields reset to documented defaults** — `TempsLineVisible=false`, `TempCpuVisible=true`, `TempGpuVisible=true`, `TempMoboVisible=false`, `TempNvmeVisible=false` (matches AppSettings.cs:51+ init-defaults and TEMP-TAB-02 / TEMP-TAB-03). After reset, `RefreshControls` re-evaluates N/A so disabled state is correct.

### Claude's Discretion

- Exact XAML layout of the four checkboxes (WrapPanel width matching Stats tab's 270px precedent, or StackPanel in a row — planner picks)
- Whether per-sensor checkboxes go in a `Grid` or `WrapPanel` — Stats tab uses `WrapPanel Width="270"` with fixed child Width="86"; Temps tab can follow suit
- Whether `TempSensorsPanel` is the name or something more specific (`TempSensorsGroup`, etc.) — planner picks
- Exact ordering of CPU/GPU/Mobo/NVMe in the UI (spec is CPU/GPU/Mobo/NVMe — follow REQUIREMENTS order)
- Whether N/A re-evaluation in `RefreshControls` calls a private helper or inlines the 4 comparisons — stylistic
- Test count and exact `[DataRow]` coverage for the new snapshot fields — planner picks; Phase 76 established 5 round-trip + 5 absent-field test entries per set

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TEMP-TAB-01 through TEMP-TAB-05 (the 5 locked requirements for this phase)

### Roadmap
- `.planning/ROADMAP.md` §Phase 78 — SC1–SC5 define acceptance

### Prior Phase Context (gray areas already decided)
- `.planning/phases/75-hardware-discovery-spike-temperatureservice/75-CONTEXT.md` — D-11 (ITempSource contract: no per-sensor availability bools; `-1f` sentinel is the availability signal), D-12 (sentinel discipline), D-14 (silent init-failure UX)
- `.planning/phases/76-appsettings-temperatureformatter-tests/76-01-PLAN.md` — 5 AppSettings fields already shipped with exact defaults
- `.planning/phases/77-right-click-menu-on-widget/77-01-SUMMARY.md` — SettingsWindow event-wiring pattern (not strictly used by Phase 78 but same module)

### Existing Code to Mirror
- `FuzzyClock.App/SettingsWindow.xaml:383–442` — Behavior tab structure (section header + muted TextBlock description + gated sub-panel via `GhostFadeRadiusPanel`); closest precedent for Temps tab layout
- `FuzzyClock.App/SettingsWindow.xaml:285–381` — Stats tab structure (`WrapPanel` for per-row checkboxes with `Width="86"`; 2×3 grid layout); structural precedent
- `FuzzyClock.App/SettingsWindow.xaml:407–419` — `GhostFadeRadiusPanel` as the canonical gated sub-panel (CLAUDE.md critical pattern)
- `FuzzyClock.App/SettingsWindow.xaml.cs:23–55` — 29 `event Action<T>?` hooks (the 5 new events append to this block)
- `FuzzyClock.App/SettingsWindow.xaml.cs:114` — `RefreshControls(SettingsSnapshot s)` — entry point for extending with 5 new control refresh calls + N/A evaluation
- `FuzzyClock.App/SettingsWindow.xaml.cs:121` — `PopulateControls(SettingsSnapshot s)` — parallel structure
- `FuzzyClock.App/SettingsSnapshot.cs:8` — `internal sealed record SettingsSnapshot` (init-property record; add 5 new fields)
- `FuzzyClock.App/MainWindow.xaml.cs:379` — `GetCurrentSettingsSnapshot()` — extend with 5 new field mappings
- `FuzzyClock.App/MainWindow.xaml.cs:418, 421` — Settings open + RefreshControls call sites
- `FuzzyClock.App/AppSettings.cs:51` — `TempsLineVisible` + 4 per-sensor bool init properties (already shipped in Phase 76)
- `FuzzyClock.App/TemperatureService.cs` — `IsReady` gate + 4 `float` temp properties (from Phase 75-02; read directly per D-01)

### Tests
- `FuzzyClock.App.Tests/` — MSTest 4.0.1, `[TestClass]`/`[TestMethod]`/`[DataRow]`; AppSettings round-trip + absent-field patterns established in Phase 76 (AppSettingsTests.cs 5+5 new methods)

### External
- None. Phase 78 is pure C# + XAML; no new NuGet packages; no new platform APIs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SettingsWindow event pattern**: 29 `event Action<T>?` hooks already defined at SettingsWindow.xaml.cs:23–55. Adding 5 new `event Action<bool>?` events follows the exact existing shape — no new architecture.
- **SettingsSnapshot record**: `internal sealed record SettingsSnapshot` (init-property). Adding 5 new `bool` fields is mechanical.
- **GhostFadeRadiusPanel gated sub-panel**: SettingsWindow.xaml:407–419 is the template for "master checkbox enables a sub-panel" — `ChkGhostMode_Changed` sets `GhostFadeRadiusPanel.IsEnabled`. Temps tab clones this pattern with `ChkTempsVisible_Changed` + `TempSensorsPanel`.
- **Stats tab WrapPanel structure**: SettingsWindow.xaml:305–322 shows per-row checkbox layout (WrapPanel Width="270", child CheckBox Width="86", vertical margins) — directly reusable for the 4 per-sensor checkboxes.
- **Muted description TextBlock**: SettingsWindow.xaml:389 ("Auto-detects from Windows display language") and SettingsWindow.xaml:430 ("Alert when unplugged…") show the pattern for help text: `Foreground="#FF999999" FontSize="11" TextWrapping="Wrap"`.
- **TemperatureService direct-read**: `IsReady` + four `float` properties (`CpuTempC`, `GpuTempC`, `MoboTempC`, `NvmeTempC`) already shipped in Phase 75-02. No API changes needed.
- **ResetToDefaults pattern**: existing method resets all toggleable state in one pass (established across v3.2+). Adding 5 field resets is a 5-line change.

### Established Patterns
- **`-1f` sentinel discipline**: downstream code (Phase 79 will use it for rendering; Phase 78 uses it for N/A detection) treats `value < 0f` as unavailable. Matches `GpuPercent`/`PagPercent`/`BatteryPercent`/`BatteryAlertActive` semantics already in the codebase.
- **Init-property records**: `AppSettings` and `SettingsSnapshot` are both init-property records; updates use `with { … }` record-copy. Never positional constructors (CLAUDE.md critical pattern).
- **Settings events flow through MainWindow**: SettingsWindow raises events → MainWindow handlers mutate `_settings` via `with` → `SettingsService.Save(_settings)` + any UI refresh. Phase 78 handlers save only — widget render lands in Phase 79.
- **`RefreshControls` vs click handlers**: `RefreshControls` is the single place IsChecked is assigned from external state. Click handlers NEVER touch IsChecked programmatically (CLAUDE.md critical pattern: "never touch IsChecked in click handlers").

### Integration Points
- **`SettingsWindow.xaml` TabControl** (line 51): insert `<TabItem Header="Temps">` as the 3rd child (after Stats at line 285, before Behavior at line 384).
- **`SettingsWindow.xaml.cs` event block** (lines 23–55): append 5 new events.
- **`SettingsWindow.xaml.cs` `RefreshControls`** (line 114): populate 5 new controls + apply N/A detection + gate TempSensorsPanel.
- **`SettingsSnapshot.cs`** (line 8): add 5 `bool` init properties.
- **`MainWindow.xaml.cs` `GetCurrentSettingsSnapshot()`** (line 379): add 5 field mappings.
- **`MainWindow.xaml.cs`** Settings-open path (line 418, 421): subscribe handlers after `new SettingsWindow(...)`; one event → one handler → `_settings with` + `SettingsService.Save`.
- **`MainWindow.xaml.cs`** has `_temperatureService` singleton field from Phase 75-02; RefreshControls needs access to it. Either: pass it into `RefreshControls` as a parameter, pass the 4 temp values in the `SettingsSnapshot`, or expose a small availability accessor. Planner decides — the snapshot route keeps SettingsWindow free of service dependencies.
- **`ResetToDefaults()`**: extend with 5 field resets; call `RefreshControls` afterwards (already the pattern) so N/A detection re-runs.

### New Files (if any)
- None expected — this phase is purely additive edits to existing files (SettingsWindow.xaml, SettingsWindow.xaml.cs, SettingsSnapshot.cs, MainWindow.xaml.cs) plus test additions in `FuzzyClock.App.Tests/`.

</code_context>

<specifics>
## Specific Ideas

- **Snapshot carries the N/A data**: cleanest integration for D-01/D-02 is for `GetCurrentSettingsSnapshot()` to populate 4 additional read-only fields on `SettingsSnapshot` (e.g., `CpuTempC`, `GpuTempC`, `MoboTempC`, `NvmeTempC` + a `TempsServiceReady` bool) — read directly off `_temperatureService`. `RefreshControls` evaluates these fields against `< 0f` to apply the N/A suffix. Keeps `SettingsWindow` free of any `TemperatureService` dependency. Planner decides whether this is the path vs passing the service directly; snapshot-route is the stated preference.
- **TEMP-TAB-04 disable state is cosmetic only**: the disabled checkbox still participates in XAML layout and takes snapshot values on open. No layout reflow when switching machines.
- **Help text visibility: always** — even when master toggle is off and sub-panel greys, the disclaimer remains readable. Place it OUTSIDE `TempSensorsPanel`.
- **Test scope**: 5 AppSettings round-trip tests already shipped in Phase 76 (TEST-01/TEST-02/TEST-03). Phase 78 adds Snapshot-round-trip tests (populate AppSettings → GetCurrentSettingsSnapshot → 5 fields match) and event-firing contract tests (change checkbox → event fires with correct bool). No XAML/visual automation — pattern from Phase 77 (RightClickMenuGate) is pure-predicate tests, not UI tests.
- **Event naming**: `TempsLineVisibleChanged` NOT `TempsVisibleChanged` (the master toggle is "Show Temps Line"; the field is `TempsLineVisible`; the event matches).

</specifics>

<deferred>
## Deferred Ideas

- **`IsSensorAvailable(SensorKind)` API on `ITempSource`** — rejected in D-01 for Phase 78 (redundant with sentinel discipline). If a future phase needs richer availability semantics (e.g., distinguishing "sensor removed mid-session" from "sensor never enumerated"), revisit this.
- **Live `IsReady` subscription in Settings** — rejected in D-03 (snapshot-at-open only). If cold-start UX becomes an issue, add a one-shot `IsReady` event subscription that calls `RefreshControls` once when it flips.
- **"Open Licenses" link in Temps tab** — already deferred to `REQUIREMENTS.md` Future Requirements; Phase 80 territory.
- **PawnIO installer prompt / README pointer** — already deferred to Future Requirements.
- **Per-sensor label customization** — out of scope; labels are literal `CPU` / `GPU` / `Mobo` / `NVMe` per TEMP-LINE-03.

</deferred>

---

*Phase: 78-temps-tab-in-settings*
*Context gathered: 2026-05-04*
