# Phase 79: Temps Line on Widget — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Render the temperature stats line on the widget. Add `TempsText` TextBlock inside `StatsPanel` below `UptimeText`, populate it via `TemperatureFormatter.Format(...)` on every stats tick, gate visibility on master toggle + formatter-non-empty, subscribe to the 5 Phase 78 Settings events for immediate live reflow, inherit accent color, participate in auto-contrast.

**In scope:**
- `FuzzyClock.App/MainWindow.xaml` — new `<TextBlock x:Name="TempsText">` sibling of `UptimeText`, child of `StatsPanel`, inserted immediately AFTER UptimeText (order: CpuRow/GpuRow/MemRow/PagRow/BattRow/UptimeText/**TempsText**)
- `FuzzyClock.App/MainWindow.xaml.cs` — new `UpdateTempsDisplay()` method; call from `UpdateStatsDisplay()` (or an adjacent render point); extend 5 Phase 78 event handlers to call `UpdateTempsDisplay()` immediately; extend `ApplyDisplayColor` + `ApplyTheme` to set `TempsText.Foreground = brush`
- Tests in `FuzzyClock.App.Tests` (not Core — REL-03) covering the visibility predicate + the event-reflow wiring contract (no XAML-automation; pure-method tests following the Phase 78 pattern)

**Out of scope (later phases):**
- TemperatureFormatter itself — already shipped Phase 76 (`FuzzyClock.Core/TemperatureFormatter.cs`)
- TemperatureService — already shipped Phase 75-02 (`FuzzyClock.App/TemperatureService.cs`)
- 5 AppSettings temp fields — already shipped Phase 76 (`AppSettings.cs:51+`)
- 5 Settings events raised by SettingsWindow — already shipped Phase 78 (`SettingsWindow.xaml.cs`)
- 5 handlers in MainWindow that mutate `_settings` + `SaveSettings` — already shipped Phase 78 (Phase 79 EXTENDS them with one additional line, does not add new handlers)
- Installer DLL capture / MPL notices / CI grep gates — Phase 80
- New LHM integration code — none; Phase 79 is a pure consumer of already-shipped Phase 75-02 and 76 artifacts

</domain>

<decisions>
## Implementation Decisions

### Refresh Throttle (Area 1 — TEMP-LINE-05)

- **D-01:** **No widget-side throttle.** `TemperatureService` (Phase 75-02 Path 2 per D-05/D-07) already owns a dedicated 2s-cadence background task with a single-entry lock on `Update()`. Widget reads (`_temperatureService.CpuTempC` etc.) are cheap volatile-field reads. TEMP-LINE-05's "minimum 2-second effective refresh for LHM reads; single-entry lock prevents overlapping Update()" is satisfied by the service layer, NOT by new Phase 79 code. Widget just reads every stats tick (5s normal, 500ms hover fast-refresh) and the displayed value updates whenever the background task writes a fresh one.
- **D-02:** **No `_lastTempsUpdate` timestamp on the widget side.** No "reformat only when values change" dirty-check either — `TemperatureFormatter.Format` is cheap (4 × `Math.Round` + `string.Join` on ≤4 items); premature optimization would add state without observable gain.

### Empty-Line Visibility (Area 2 — TEMP-LINE-04)

- **D-03:** **`Visibility = Collapsed` when formatter returns empty string.** When `TemperatureFormatter.Format(...)` returns `""` (all 4 sensors N/A, or all 4 per-sensor toggles off with master still ON, or any combination that suppresses every segment), `TempsText.Visibility = Visibility.Collapsed`. StatsPanel reflows height to account for the disappeared line. Matches existing convention — `UptimeText.Visibility` at `MainWindow.xaml.cs:1111` uses `Visibility.Collapsed` rather than `Text=""` with visible-empty.
- **D-04:** **NOT `Text=""` with `Visibility.Visible`** — that would reserve an empty stripe of vertical space that looks broken.

### Visibility Predicate (Area 3 — TEMP-LINE-01)

- **D-05:** **Complete gate: `TempsText.Visibility = (s.TempsLineVisible && formatted.Length > 0) ? Visibility.Visible : Visibility.Collapsed;`** — where `formatted` is the return value of `TemperatureFormatter.Format(...)`. The Stats-panel-off case is handled **automatically by WPF layout inheritance** — TempsText is a child of `StatsPanel`, so `StatsPanel.Visibility=Collapsed` hides TempsText without the predicate needing to reference `StatsVisible`. Exactly the same pattern as `UptimeText` (see existing comment at `MainWindow.xaml.cs:268-269`).
- **D-06:** **No three-way compound check** in the predicate. Keeping the widget-side code focused on the two conditions Phase 79 actually owns (master toggle + formatter output) aligns with the existing discipline in the file.

### Event Reflow (Area 4 — TEMP-TAB-05 SC5 "no widget restart")

- **D-07:** **Extend each of the 5 Phase 78 event handlers with an immediate `UpdateTempsDisplay()` call.** Current Phase 78 handler shape (MainWindow.xaml.cs, in `OpenSettings` subscription block):
  ```csharp
  _settingsWindow.TempCpuVisibleChanged += v =>
  {
      _settings = _settings with { TempCpuVisible = v };
      SaveSettings();
  };
  ```
  Phase 79 extends each of the 5 handlers (`TempsLineVisibleChanged`, `TempCpuVisibleChanged`, `TempGpuVisibleChanged`, `TempMoboVisibleChanged`, `TempNvmeVisibleChanged`) with **one additional line**: `UpdateTempsDisplay();` immediately after `SaveSettings();`. User sees reflow the instant they toggle.
- **D-08:** **Not a dirty-flag pattern.** Direct call is simpler, immediate, and matches existing render-dispatch discipline in this file (handlers call `UpdateStatsDisplay`, `UpdateDateDisplay`, etc. directly).
- **D-09:** **Timer tick reflows naturally too.** `UpdateTempsDisplay()` is called from inside the stats-tick render path (likely at the tail of `UpdateStatsDisplay` or the existing `OnTimerTick` lambda — planner picks the exact site). So sensor value changes between ticks (e.g., CPU temp rising) show up on next tick without any event plumbing — the events are only for user-initiated toggle changes.

### Accent Color + Auto-Contrast (Follow-up — TEMP-LINE-06)

- **D-10:** **Mirror `UptimeText` pattern in both `ApplyDisplayColor` and `ApplyTheme`.** At MainWindow.xaml.cs:1637 + 1674 the existing code does `UptimeText.Foreground = brush;` where `brush = new SolidColorBrush(_accentColor)` (never mutate frozen `Brushes.*`). Phase 79 adds `TempsText.Foreground = brush;` **at BOTH sites** — CLAUDE.md critical pattern (from Phase 33 v2.7 lesson): _"both ApplyDisplayColor and ApplyTheme must cover the same full element set."_ Auto-contrast participation is free because `ContrastRefreshController` already re-runs `ApplyDisplayColor` with contrast-adjusted accent.
- **D-11:** **No Style resource with accent binding.** No other TextBlock in this codebase uses that pattern; stay with imperative-assignment convention.
- **D-12:** **Avoid mutating a Brush across frames** — each Foreground assignment creates a fresh `SolidColorBrush` (CLAUDE.md critical pattern + v2.7 lesson about frozen `Brushes.*`). The existing `_accentColor → new SolidColorBrush(_accentColor)` dance at line 1591, 1637, 1674 is the template.

### Plumbing

- **D-13:** **`UpdateTempsDisplay()` is a new private method in MainWindow.xaml.cs.** It:
  1. Reads 4 temp floats from `_temperatureService` (null-coalesce `?? -1f` for pre-init safety — Phase 78 D-01 pattern)
  2. Reads 4 per-sensor visibility bools + master from `_settings`
  3. Calls `TemperatureFormatter.Format(cpu, gpu, mobo, nvme, cpuVis, gpuVis, moboVis, nvmeVis)` — returns string
  4. Sets `TempsText.Text = formatted;`
  5. Sets `TempsText.Visibility = (_settings.TempsLineVisible && formatted.Length > 0) ? Visibility.Visible : Visibility.Collapsed;`
  6. (Foreground is set elsewhere via `ApplyDisplayColor` / `ApplyTheme` — no Foreground assignment here on the per-tick path)
- **D-14:** **Call site for `UpdateTempsDisplay()`**: invoked from the same place `UpdateStatsDisplay` and `UpdateUptimeDisplay` are already invoked — the existing stats-timer tick. Adding one line `UpdateTempsDisplay();` after the existing calls keeps temperature refresh piggy-backed on the stats timer per TEMP-LINE-05.
- **D-15:** **XAML positioning**: insert `<TextBlock x:Name="TempsText">` in MainWindow.xaml as the LAST child of `StatsPanel`, immediately AFTER `UptimeText`. Clone UptimeText's styling baseline: `Margin="0,2,0,0" Visibility="Visible" FontFamily="Segoe UI Light" FontSize="11" Foreground="White" Text="" TextAlignment="Left"`. `Foreground="White"` is a design-time default only — ApplyDisplayColor overrides at runtime (same as UptimeText). Initial `Text=""` + initial `Visibility=Visible`; first tick immediately sets both correctly (no visual flash).

### Tests

- **D-16:** **All new tests land in `FuzzyClock.App.Tests`**, not Core (REL-03 invariant). Follow the contract-test pattern from Phases 76/78 (pure-method tests on the visibility predicate + snapshot mapping; no XAML automation). Minimum test surface:
  1. A visibility-predicate test — given `(TempsLineVisible, formatterOutput)` combinations, asserts the Boolean visibility decision
  2. An `UpdateTempsDisplay` behavioral test(s) — can use `FakeTempSource` (shipped Phase 75-02) to drive sensor values; can verify `TempsText.Text` and `TempsText.Visibility` after the call. (Planner decides whether this needs a test-seam helper method or can be done via a WPF test window).
- **D-17:** **Test count target**: 554 baseline → target >= 556 (+2 minimum). Follow Phase 78's pattern of modest atomic test additions per plan. Planner may add more if it aids verification.

### Human-Verify Checkpoint

- **D-18:** **Phase 79 MUST have a human-verify checkpoint** as the final task of the last plan. UI rendering cannot be automated reliably in this project (Phase 77/78 precedent). Checklist covers: rendering order below UptimeText (TEMP-LINE-01); format string with 2-space separator and ° (TEMP-LINE-02); friendly labels only (TEMP-LINE-03); N/A segments silently omitted (TEMP-LINE-04); reflow on Settings toggle with no restart (TEMP-TAB-05 SC5); accent color match UptimeText (TEMP-LINE-06); auto-contrast adjustment works (TEMP-LINE-06).
- **D-19:** **Dev-box expectations** for human-verify: GPU segment visible (NVIDIA A2000 readable per Phase 75 spike); NVMe segment should be ABSENT (omitted — not "NVMe N/A"); CPU and Mobo segments likely ABSENT (PawnIO-gated on dev box). Final line likely renders as just `GPU 51°` on this machine.

### Claude's Discretion

- Exact insertion site for `UpdateTempsDisplay()` call inside the timer tick (right after `UpdateUptimeDisplay` is the obvious placement, but planner picks)
- Whether `UpdateTempsDisplay` is one method or splits into `BuildTempsText` (pure) + `ApplyTempsVisibility` (UI) for testability — planner picks
- Exact test file name (`TempsLineTests.cs` vs extending `AppSettingsTests.cs` — follow Phase 78 precedent)
- Exact commit count and naming for Plan 79-01 (follow Phase 78 atomic-commit discipline)
- Whether the human-verify checkpoint is in its own plan (79-02) or as the final task of 79-01 (follow Phase 78 = 2-plan split)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TEMP-LINE-01 through TEMP-LINE-06 (the 6 locked requirements for this phase); TEMP-TAB-05 SC5 ("no widget restart" — bridges to Phase 79)

### Roadmap
- `.planning/ROADMAP.md` §Phase 79 — SC1–SC6 define acceptance

### Prior Phase Context (locked — do NOT re-decide)
- `.planning/phases/75-hardware-discovery-spike-temperatureservice/75-CONTEXT.md` — D-05/D-07 (service-side 2s background-task cadence), D-11/D-12 (-1f sentinel + 4-float read surface), D-14 (silent init-failure UX)
- `.planning/phases/76-appsettings-temperatureformatter-tests/76-01-SUMMARY.md` — TemperatureFormatter shipped in `FuzzyClock.Core/TemperatureFormatter.cs`; 2-space separator, integer Celsius, ° only, empty-string-when-all-suppressed
- `.planning/phases/78-temps-tab-in-settings/78-CONTEXT.md` — D-10/D-11/D-12 (5 snapshot fields, 5 events, handler shape `_settings = _settings with { TempXVisible = v }; SaveSettings();` — Phase 79 extends these)
- `.planning/phases/78-temps-tab-in-settings/78-02-SUMMARY.md` — exact wiring sites in MainWindow.xaml.cs for the 5 handlers (to be extended by Phase 79)

### Existing Code to Mirror
- `FuzzyClock.App/MainWindow.xaml:275-284` — UptimeText TextBlock definition (clone shape for TempsText)
- `FuzzyClock.App/MainWindow.xaml:162` — StatsPanel opening tag (TempsText is its last child)
- `FuzzyClock.App/MainWindow.xaml.cs:768-813` — UpdateStatsDisplay pattern (per-value N/A sentinel handling, `-1f < 0f` gate — analogous semantics to temp rendering)
- `FuzzyClock.App/MainWindow.xaml.cs:848-?` — UpdateUptimeDisplay (adjacent call site + StatsPanel-visibility guard pattern at lines 850-854)
- `FuzzyClock.App/MainWindow.xaml.cs:1637, 1674` — `UptimeText.Foreground = brush;` (the two sites to clone for `TempsText.Foreground`)
- `FuzzyClock.App/MainWindow.xaml.cs:1111` — `UptimeText.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;` — the Collapsed convention for this codebase
- `FuzzyClock.App/MainWindow.xaml.cs:1591` — `new SolidColorBrush(_accentColor)` (never mutate frozen `Brushes.*`)
- `FuzzyClock.App/MainWindow.xaml.cs:415-419` — GetCurrentSettingsSnapshot already reads `_temperatureService?.XxxTempC ?? -1f` — same null-coalesce pattern for `UpdateTempsDisplay`
- `FuzzyClock.Core/TemperatureFormatter.cs` — `Format(cpu, gpu, mobo, nvme, cpuVisible, gpuVisible, moboVisible, nvmeVisible) → string` (already shipped Phase 76; returns `""` when all suppressed)
- `FuzzyClock.App/TemperatureService.cs` — `IsReady` gate + `CpuTempC/GpuTempC/MoboTempC/NvmeTempC` properties (already shipped Phase 75-02)

### Tests
- `FuzzyClock.App.Tests/` — MSTest 4.0.1 pattern established; FakeTempSource already exists (Phase 75-02) and can drive test sensor values
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — Phase 78's mapping-contract test pattern; Phase 79 can add visibility-predicate tests following the same shape

### External
- None. Phase 79 is pure C# + XAML; no new NuGet packages; no new platform APIs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **UptimeText as blueprint**: existing TextBlock at MainWindow.xaml:277-284 — Phase 79 TempsText is a near-clone (same font, same margin, same design-time Foreground, same parent StatsPanel).
- **UpdateStatsDisplay render pattern**: MainWindow.xaml.cs:768-813 does per-sensor `< 0f` N/A check and assigns Text — Phase 79 follows the same `< 0f` discipline via TemperatureFormatter's internal logic.
- **Phase 78 handler block**: already 5 handlers in OpenSettings — Phase 79 adds a ONE-LINE extension (`UpdateTempsDisplay();` call after `SaveSettings();`). Zero new event subscriptions.
- **TemperatureFormatter**: already tested at 18 methods (22 runtime via DataRow) in Phase 76. Phase 79 is a pure CONSUMER. No Core changes.
- **TemperatureService.CpuTempC/GpuTempC/MoboTempC/NvmeTempC**: cheap volatile-field reads; no overhead per tick.
- **ApplyDisplayColor / ApplyTheme element set**: CLAUDE.md critical pattern lists the exact TextBlocks both methods must cover. Phase 79 adds TempsText as element #N+1 to both.

### Established Patterns
- **`< 0f` sentinel discipline**: downstream rendering treats `value < 0f` as unavailable (multiple existing precedents in UpdateStatsDisplay). TemperatureFormatter already implements this — Phase 79 never sees the sentinel in formatted output.
- **`Visibility.Collapsed` for hide-without-reflow**: MainWindow.xaml.cs:1111 for UptimeText is the canonical convention. Phase 79 follows it.
- **Imperative Foreground assignment in two-sync sites**: ApplyDisplayColor + ApplyTheme. Per-Phase-33 rule, both must cover the same element set. Phase 79 must remember BOTH.
- **`new SolidColorBrush(_accentColor)` per assignment**: never mutate frozen brushes. Already the pattern across the codebase.
- **Single-timer discipline**: existing stats timer (5s normal / 500ms hover fast-refresh). Phase 79 piggybacks — no new DispatcherTimer.

### Integration Points
- `FuzzyClock.App/MainWindow.xaml:285` (end of StatsPanel): new `<TextBlock x:Name="TempsText">` inserted as last child of StatsPanel before the closing `</StackPanel>`.
- `FuzzyClock.App/MainWindow.xaml.cs` (~line 800): append `TempsText.Foreground = brush;` to whatever private method batches TextBlock foreground assignments (planner identifies whether it's a helper or inline in ApplyDisplayColor/ApplyTheme).
- `FuzzyClock.App/MainWindow.xaml.cs:1637 + 1674`: `UptimeText.Foreground = brush;` — insert `TempsText.Foreground = brush;` immediately after each.
- `FuzzyClock.App/MainWindow.xaml.cs` (OpenSettings event-subscription block — the 5 handlers from Phase 78): append `UpdateTempsDisplay();` inside each handler after `SaveSettings();`.
- `FuzzyClock.App/MainWindow.xaml.cs` (stats timer tick / UpdateStatsDisplay tail): call `UpdateTempsDisplay();` so per-tick sensor updates reflect even without user interaction.
- `FuzzyClock.App/MainWindow.xaml.cs` (new method): `private void UpdateTempsDisplay()` — reads service + settings, calls TemperatureFormatter.Format, sets Text + Visibility.

### New Files (if any)
- Potentially `FuzzyClock.App.Tests/TempsLineTests.cs` (new) for the visibility-predicate + UpdateTempsDisplay contract tests — OR extend `AppSettingsTests.cs` per Phase 78 precedent. Planner picks.

</code_context>

<specifics>
## Specific Ideas

- **Piggyback, don't own**: no new DispatcherTimer. `UpdateTempsDisplay()` is invoked from the existing stats-tick render path. TEMP-LINE-05's "piggybacks on the existing stats timer tick" is satisfied by calling from inside the existing tick, not by creating a new timer.
- **Test-seam candidate**: `UpdateTempsDisplay()` takes no parameters (reads instance state). For testability the planner MAY split out a pure helper like `static string BuildTempsLine(ITempSource, AppSettings)` that the test can call directly, and keep `UpdateTempsDisplay()` as the thin UI-binding wrapper. Whether this split is worth the minor indirection is planner discretion — the contract tests can alternatively test `TemperatureFormatter.Format` directly (already covered by Phase 76 tests) plus a single MainWindow smoke test for the glue.
- **Design-time default stays `Foreground="White"`** in XAML — runtime `ApplyDisplayColor` overwrites immediately on first render (same as UptimeText). Keeps the XAML designer preview readable if someone opens the .xaml in Visual Studio.
- **Human-verify on dev box**: expect a LINE like `GPU 51°` (1 segment). NOT `CPU (N/A)  GPU 51°` — the formatter silently omits N/A segments per TEMP-LINE-04. This is a common point of confusion — document it in the human-verify checklist so the verifier knows to expect the minimal-segment output.

</specifics>

<deferred>
## Deferred Ideas

- **Widget-side throttle / dirty-flag for formatter reruns** — D-01/D-02: rejected. Revisit only if profiling shows the 5s tick formatter cost is nontrivial (it won't — `Math.Round` × 4 + `string.Join` ≤ 1µs).
- **Test-seam split of UpdateTempsDisplay** — D-15 leaves this to planner discretion, not locking now.
- **TempsText auto-contrast extended to per-segment color coding** (e.g. red at CPU > 90°) — already in REQUIREMENTS.md Future Requirements "Temperature thresholds / alerts (row color shift at high temp)". Not Phase 79.
- **Per-core CPU temps / Fahrenheit toggle / sparklines** — already deferred to Future Requirements.
- **Fahrenheit unit toggle** — explicit Out of Scope in REQUIREMENTS.md.

</deferred>

---

*Phase: 79-temps-line-on-widget*
*Context gathered: 2026-05-04*
