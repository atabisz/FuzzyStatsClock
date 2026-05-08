# Phase 75: Hardware Discovery Spike + TemperatureService - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Empirically verify LibreHardwareMonitorLib 0.9.6 sensor coverage on a no-admin / no-PawnIO environment, record a written go/no-go report, then land the `TemperatureService` singleton that phases 76–80 depend on.

**In scope:**
- `.planning/spikes/75-hardware-discovery.md` — empirical spike report with per-sensor availability, Update() timing, and dated go/no-go decision
- `TemperatureService` singleton in `FuzzyClock.App` — singleton LHM `Computer`, async init via `Task.Run` with 3s timeout, `-1f` sentinel, `IsReady` gate, three-tier dispose with `Interlocked` single-entry guard
- `ITempSource` abstraction in `FuzzyClock.App` + `FakeTempSource` in `FuzzyClock.App.Tests`
- CI grep gates: `WinRing0*.sys` absent from `dotnet publish/`; `LibreHardwareMonitor` absent from `FuzzyClock.Core/`
- MSTest coverage for service lifecycle, sentinel fallback, sensor resolution

**Out of scope (later phases):**
- AppSettings fields / TemperatureFormatter — Phase 76
- Settings Temps tab UI — Phase 78
- MainWindow `TempsText` rendering — Phase 79
- Installer DLL capture, THIRD-PARTY-NOTICES, MPL-2.0 text — Phase 80
- Right-click menu on widget — Phase 77 (parallelizable)

</domain>

<decisions>
## Implementation Decisions

### Spike Report

- **D-01:** Report lives at `.planning/spikes/75-hardware-discovery.md` (new `.planning/spikes/` folder). Survives milestone archival; easy to reference from Phase 80 release docs. NOT inline in the phase plan.
- **D-02:** Go/no-go threshold: **GPU + NVMe both readable = GO**; otherwise a formal scope reduction is documented in the report and the roadmap is amended before Phase 76 proceeds. CPU and Mobo are bonuses (both gated by PawnIO per research).
- **D-03:** Hardware matrix: dev box only. Full LHM sensor tree + Name strings + `Update()` timing captured on the dev machine. Broader coverage deferred to crowdsourced user reports in a future milestone if needed.
- **D-04:** VM policy: **dev machine with PawnIO uninstalled** is an acceptable substitute for a fresh Win11 24H2 VM snapshot. Research establishes PawnIO absence is the sole axis that matters for "clean VM" emulation. The substitution MUST be documented in the report. This interprets SC1 of the roadmap (the "clean Win11 24H2 VM" requirement) — if a true clean-VM test later contradicts the spike, the milestone pauses.

### Refresh Cadence & Threading

- **D-05:** Threading path is **decided in the spike, committed in the service**: if measured `Update()` latency on the dev box is <50 ms, the service piggybacks the existing stats timer with a single-entry lock; if ≥50 ms, the service owns a dedicated long-lived background task. The decision is recorded in the spike report and implemented in this phase — no config switch, no runtime flip.
- **D-06:** Minimum effective LHM refresh interval: **2 seconds**. During 0.5s hover fast-refresh, LHM `Update()` is skipped unless 2s has elapsed since the last successful update. Stats + uptime continue refreshing at the hover rate unchanged.
- **D-07:** If the background-thread path wins under D-05: use a **long-lived `Task.Run` + `CancellationToken`** that sleeps 2s between `Update()` calls and writes results to volatile fields. Cancellation triggered on dispose. No per-tick thread churn.

### Sensor Resolution

- **D-08:** Resolution strategy: **priority-ordered name list per sensor kind + `SensorType.Temperature` fallback**. For each of CPU / GPU / Mobo / NVMe, walk a fixed priority list of known LHM `Name` strings (`"CPU Package"`, `"Core (Tctl/Tdie)"`, `"Core Max"`, etc.), then fall back to the first `SensorType.Temperature` sensor under the matching `HardwareType`. Matches FEATURES.md pseudocode.
- **D-09:** Priority lists expressed as **`private static readonly string[]`** per sensor kind, defined inline in `TemperatureService`. Compile-time constants; no JSON config, no per-vendor branches.
- **D-10:** Sensor cache strategy: **cache resolved `ISensor` refs on init; re-resolve on failure only**. Initialize walks the hardware tree once and caches the four `ISensor` references. Tick reads `.Value` from cached sensors. On null value / exception, trigger one re-walk of the tree (handles NVMe hot-removal, GPU driver update). Mirrors StatsService GPU counter re-enumeration.

### ITempSource Contract

- **D-11:** Interface shape: `IsReady` + four `float` sensor properties (`CpuTempC`, `GpuTempC`, `MoboTempC`, `NvmeTempC`) + `Refresh()`. **No** per-sensor availability bools (encoded by `-1f` sentinel), **no** `IDisposable` on the interface itself (implementation concern).
- **D-12:** Sentinel for unavailable: **`-1f` on a `float` property** (not `float?`, not `null`). Matches `StatsService.GpuPercent` / `PagPercent` / `BatteryPercent` convention and TEMP-SVC-02.
- **D-13:** `FakeTempSource` lives in `FuzzyClock.App.Tests`. Constructor takes explicit values; `Refresh()` is a no-op; exposes mutable-during-test properties so tests can simulate NVMe hot-removal by flipping `NvmeTempC` to `-1f`.

### Initialization Failure UX

- **D-14:** Init failure path (Task.Run timeout, `Computer.Open()` throws, etc.): **silent**. `IsReady=false`, all four properties stay at `-1f`. No log file, no tray balloon, no one-time notification. Matches v4.1 `BatteryPercent=-1f` / "no battery" steady-state. This is the expected posture on no-PawnIO systems, not an error.

### Dispose / Lifecycle

- **D-15:** Three-tier dispose path: `MainWindow.OnClosing` + `Application.SessionEnding` + `AppDomain.ProcessExit`, all routed through a single `Dispose()` method on `TemperatureService` guarded by an `Interlocked.CompareExchange` single-entry flag. `Computer.Close()` must run exactly once per process, even on forced kill. `SessionEnding` is already wired in `App.xaml.cs:70` for settings save — the TempService dispose hooks into the same event.

### Claude's Discretion

- Exact `Interlocked` guard field name and placement inside `TemperatureService`
- Internal field layout (volatile vs lock-guarded mutable state for `CpuTempC` etc.)
- Whether `Refresh()` on the interface is called from the timer tick or from inside the service's own background loop (depends on D-05 outcome)
- Whether `ITempSource` lives in `FuzzyClock.App` or `FuzzyClock.Core` (research recommends App to keep Core LHM-free; planner confirms)
- Priority-list contents beyond the seed names — planner extends based on the spike output

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/SUMMARY.md` — executive summary, risk ordering, phase rationale
- `.planning/research/STACK.md` — LHM 0.9.6 pin, transitive DLL list, MPL compliance checklist
- `.planning/research/ARCHITECTURE.md` — component responsibilities, build order, anti-patterns
- `.planning/research/PITFALLS.md` — 13 pitfalls, "looks done but isn't" checklist, recovery strategies
- `.planning/research/FEATURES.md` — sensor resolution pseudocode, sensor naming conventions, friendly-label mapping

### Requirements
- `.planning/REQUIREMENTS.md` — TEMP-SVC-01 through TEMP-SVC-05 (Phase 75); REL-02, REL-03 (CI grep gates)

### Roadmap
- `.planning/ROADMAP.md` §Phase 75 — SC1–SC5 are the acceptance gate

### Existing Patterns to Mirror
- `FuzzyClock.App/StatsService.cs` — async-init template (`Task.Run(Initialize)`, `volatile bool _initialized`, `-1f` sentinel, safe-no-op `Refresh()`, GPU counter re-enumeration on failure)
- `FuzzyClock.App/App.xaml.cs:70` — `SessionEnding` event hook for cleanup (extend to dispose TempService)
- `FuzzyClock.App/MainWindow.xaml.cs:125` — StatsService instantiation site; TempService instantiation follows the same pattern
- `FuzzyClock.App.Tests/` — MSTest 4.0.1 `[TestClass]`/`[TestMethod]`/`[DataRow]` pattern

### AppSettings (do NOT modify in this phase)
- `FuzzyClock.App/AppSettings.cs` — five new fields land in Phase 76, not here

### External
- LibreHardwareMonitorLib 0.9.6 on NuGet (pinned exact version via Phase 80; this phase adds the reference with an exact version already)
- MPL-2.0 license text (referenced for Phase 80, not needed for this phase)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **StatsService template**: near line-for-line blueprint for `TemperatureService` — async init via `Task.Run(Initialize)`, `volatile bool _initialized`, `-1f` sentinel semantics, `Dispose()` on multi-counter cleanup, GPU counter re-enumeration mirrors sensor re-resolve pattern (D-10).
- **`App.xaml.cs:70` SessionEnding hook**: already wired for settings save — extend to invoke `TemperatureService.Dispose()`. No new event subscription logic.
- **MSTest coverage scaffolding**: `FuzzyClock.App.Tests` already has the MSTest parallelize settings + net10.0-windows + UseWPF TFM wiring. `FakeTempSource` lands alongside existing test patterns.
- **`MainWindow.OnClosing`** (via `SaveSettings()` path): the first tier of the three-tier dispose. Add a call to `_temperatureService.Dispose()` alongside existing cleanup.

### Established Patterns
- **`-1f` sentinel discipline**: four existing properties (`GpuPercent`, `PagPercent`, `BatteryPercent`) use this exact convention. Downstream rendering code already knows `value < 0f` means "N/A".
- **Async init with volatile guard**: `_initialized` must be set **last** in `Initialize()`. `Refresh()` / value reads are safe no-ops until the guard flips.
- **Singleton services**: `StatsService`, `GhostModeController`, `ContrastRefreshController`, `ContrastSamplerService` are all MainWindow-owned singletons. `TemperatureService` joins them.
- **MPL / CI grep discipline**: enforcement gates go in CI workflow files, not in code. Phase 80 wires them; Phase 75 just has to not put LHM references in `FuzzyClock.Core/`.

### Integration Points
- `MainWindow.xaml.cs` constructor / `ContentRendered`: `_temperatureService = new TemperatureService()` alongside `_statsService = new StatsService()` (line ~125).
- `App.xaml.cs:70` `SessionEnding`: augment to dispose TempService.
- `MainWindow.OnClosing`: new line to dispose TempService.
- `AppDomain.CurrentDomain.ProcessExit`: new subscription in `App.OnStartup` or the service itself (planner decides exact placement) — this is the third tier.
- `FuzzyClock.App.csproj`: new `<PackageReference Include="LibreHardwareMonitorLib" Version="0.9.6" />` (exact version, no range).

</code_context>

<specifics>
## Specific Ideas

- TemperatureService API surface follows StatsService exactly — if in doubt, read StatsService.cs and apply the same pattern. This is a mechanical replication of v2.1's async-init + sentinel discipline.
- The `Interlocked` single-entry dispose guard is non-negotiable (SC4): `Computer.Close()` must run exactly once across the three-tier path.
- Spike workflow: uninstall / disable PawnIO on the dev box, snapshot LHM sensor tree via a small throwaway program or the LHM sample app, capture timing, re-enable PawnIO. Document the methodology in the report so a future maintainer can reproduce.
- The spike report is the go/no-go gate for the entire milestone — if GPU+NVMe fail on the dev box, do NOT proceed to Phase 76 without an explicit scope amendment.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The main candidates for scope creep (Fahrenheit, per-core CPU, fan speeds, alerts, sensor picker, sparklines) are already explicitly deferred in `REQUIREMENTS.md` → Future Requirements / Out of Scope.

</deferred>

---

*Phase: 75-hardware-discovery-spike-temperatureservice*
*Context gathered: 2026-05-04*
