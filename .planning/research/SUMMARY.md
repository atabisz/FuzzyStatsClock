# Project Research Summary — v4.2 Temps & Menu

**Project:** FuzzyStatsClock v4.2 (Temps & Menu milestone)
**Domain:** Windows WPF transparent desktop widget — adding hardware temperature monitoring (LibreHardwareMonitorLib) and a right-click context menu on the widget surface
**Researched:** 2026-05-04
**Confidence:** HIGH on stack + architecture; MEDIUM-HIGH on features; HIGH on pitfalls (with one critical gating uncertainty on PawnIO availability)

## Executive Summary

v4.2 is a **low-architectural-risk, medium-deployment-risk** milestone that extends the existing v4.1 widget with (1) a `TemperatureService` reading CPU/GPU/Motherboard/NVMe temperatures via LibreHardwareMonitorLib 0.9.6 (MPL-2.0), (2) a 4th "Temps" tab in `SettingsWindow`, (3) a compact `TempsText` line rendered inside the existing `StatsPanel` below Uptime, and (4) a right-click handler on the root Grid that reuses the existing tray `ContextMenuStrip` via `Show(Point)`. All four features sit cleanly on top of patterns established in v2.1 (StatsService async-init + `-1f` sentinel), v3.2 (SettingsSnapshot + `Action<bool>?` events + capability gating), v3.5 (dark-mode Settings + installer), and v4.0 (proximity-fade gating). No new runtime patterns are required — this is almost entirely a mechanical replication of existing discipline.

The recommended stack addition is **LibreHardwareMonitorLib 0.9.6 only** (pinned, not "latest"), referenced from `FuzzyClock.App` only. LHM 0.9.6 is the first release in the project's eligibility window because (a) older versions bundle WinRing0 which is on the Windows Vulnerable Driver Blocklist and flagged by Defender as `HackTool:Win32/Winring0` on Win11 24H2 default settings — shipping it will break the installer for real users; (b) 0.9.6 replaces WinRing0 with PawnIO, a separate signed driver that is *not* bundled and requires one-time admin install. The project's per-user no-UAC installer invariant means we **cannot** ship PawnIO. LHM 0.9.6 gracefully degrades to `null` sensor values when PawnIO is absent, so we can honor the "N/A with no UAC" milestone invariant — but only if the Hardware Discovery spike (below) empirically confirms that enough sensors survive without PawnIO on a clean Win11 24H2 VM to justify the feature. **This is the single gating uncertainty** and is resolved in Phase 1.

The top risks, in priority order: (1) **WinRing0/Defender** — must pin LHM >=0.9.6 and add a CI grep gate that fails on any `WinRing0*.sys` in the publish output; (2) **Defender/SmartScreen reputation reset** — test every release on a clean Win11 24H2 VM; keep the installer filename stable; keep PawnIO out of our installer; (3) **LHM lifecycle and threading** — wrap `Computer.Open()` in `Task.Run` with a 3s timeout, keep a singleton `Computer` for the process, call `Update()` on a background thread (or carefully on the existing stats tick with a single-entry lock), and dispose via a three-tier cleanup path (OnClosing + SessionEnding + ProcessExit). (4) **MPL-2.0 attribution** — ship `THIRD-PARTY-NOTICES.md` in the installer; non-negotiable, trivial to do.

## Key Findings

### Recommended Stack

Only one new runtime dependency. Everything else reuses existing technology.

**Core technologies:**
- **LibreHardwareMonitorLib 0.9.6** (pinned, MPL-2.0) — temperature sensor readings for CPU package / GPU / Motherboard / NVMe — chosen because it is the only actively maintained .NET sensor library, ships an explicit `net10.0` TFM, and replaces the CVE-listed WinRing0 driver with PawnIO. **Pin exact version** in `FuzzyClock.App.csproj`; never upgrade without re-running the discovery spike.
- **Existing WinForms `ContextMenuStrip`** (in-box, already referenced via `UseWindowsForms=true`) — the single canonical menu for both tray and widget RMB. `ToolStripDropDown.Show(Point screenLocation)` is the stable API.
- **Existing PDH `System.Diagnostics.PerformanceCounter`**, `System.Text.Json`, Inno Setup 6, MSTest 4.0.1 — all unchanged.

**Layering decision (unanimous across STACK + ARCHITECTURE + PITFALLS):** `TemperatureService` lives in `FuzzyClock.App` (Windows-specific, pinvokes, WMI). `FuzzyClock.Core` stays pure `net10.0`. A `TemperatureFormatter` (compact-line string composition) can optionally live in Core as a pure static for unit testing. **Enforcement:** add a CI grep gate that fails if `FuzzyClock.Core/` contains the string `LibreHardwareMonitor`.

**Installer changes:** switch `FuzzyClock.iss` `[Files]` from single-file `FuzzyClock.exe` to a glob that picks up LHM + transitive DLLs (`HidSharp`, `DiskInfoToolkit`, `RAMSPDToolkit-NDD`, `Mono.Posix.NETStandard`, `System.IO.Ports`, `System.Management`, `System.Threading.AccessControl`). Add `licenses/LICENSE-LHM.txt` (verbatim MPL-2.0) and `THIRD-PARTY-NOTICES.md` entries. Do NOT bundle WinRing0 / PawnIO / any `.sys` file.

### Expected Features

Scope is pinned by PROJECT.md to three buckets; research confirms the pinning is correct and identifies the right defaults/conventions.

**Must have (table stakes):**
- Right-click opens a context menu on the widget itself (universal Windows convention since Windows 95)
- Per-sensor visibility toggles (CPU / GPU / Motherboard / NVMe) via checkboxes mirroring the existing stats-row pattern (v1.3+)
- Graceful N/A for unavailable sensors — disabled checkbox + "N/A" label in Settings, silent omission from the widget line
- Celsius with degree symbol, integer precision (`52°` not `52.3°C`) — global convention
- 1–10 s update cadence bound to the existing stats timer (v4.1)
- Friendly sensor labels (`CPU`, `GPU`, `Mobo`, `NVMe`) — never raw LHM names like `Tctl/Tdie`
- No UAC prompt — LHM silently skips admin-required sensors

**Should have (differentiators):**
- Right-click menu is **byte-for-byte identical to the tray menu** (same `ContextMenuStrip` instance) — zero duplication, automatic parity on all future tray changes
- Curated 4-sensor list (not a raw LHM sensor tree) — matches the project's "readable at a glance" value
- Compact inline format (`CPU 52°  GPU 61°  NVMe 38°`) matching the existing `UptimeText` styling
- Hot-swap tolerance — re-resolve sensors every tick, hide gracefully when a drive/GPU disappears
- Right-click suppressed during drag

**Defer / Anti-features (explicitly rejected):**
- Fahrenheit toggle (doubles test matrix, Celsius is unambiguous; v4.3+ if ever)
- Per-core CPU temps (violates glanceability; 16 cores × 4 digits blows the horizontal budget)
- Temperature thresholds / alerts (out of scope per PROJECT.md)
- Free-form sensor picker (exposes raw LHM names, per-machine instability)
- Drag-to-reorder sensors (fixed CPU/GPU/Mobo/NVMe order matches existing stat-row discipline)
- Fan speeds / voltages / clocks in the same line (v4.2 is temperatures only — one bite per milestone)
- Sensor graph / sparkline (its own milestone if ever)
- Elevate-on-demand button (violates per-user no-UAC invariant)

**Default sensor visibility (recommendation):** `TempsLineVisible=false` (master OFF — opt-in feature that changes widget height; mirrors v3.0 ShowDate default), `TempCpuVisible=true`, `TempGpuVisible=true`, `TempNvmeVisible=true` (commonly available + wanted), `TempMoboVisible=false` (often absent on consumer boards; often requires PawnIO; noisy EC/chipset readings when present).

### Architecture Approach

No new architectural patterns required. The milestone is a mechanical extension of v3.2's Settings window + v2.1's StatsService pattern.

**Major components (all new code in `FuzzyClock.App` except the optional formatter):**
1. **`TemperatureService` (new, App)** — wraps a singleton LHM `Computer`; async cold-start via `Task.Run(Initialize)`; exposes `float? CpuTempC/GpuTempC/MoboTempC/NvmeTempC` using `-1f` sentinel for unavailable; `IsReady` gate; `IDisposable` calling `Computer.Close()`; refreshed from the existing stats timer tick (or a dedicated background thread — see Pitfall 3 discussion below). Mirrors `StatsService` exactly.
2. **`TemperatureFormatter` (optional, Core)** — pure static, `Format(IEnumerable<float?>, visibility)` → `"CPU 52°  GPU 61°  NVMe 38°"`. Skips `-1f` sentinels, pure-logic unit-testable.
3. **`AppSettings` additions** — 5 new explicit `bool` init-properties (never a `Dictionary<string,bool>`; matches v1.3/v3.0/v3.1 discipline) with the defaults listed above.
4. **`SettingsSnapshot` additions** — 5 persisted bools + 4 runtime capability flags (`TempsServiceAvailable`, `TempCpuAvailable`, `TempGpuAvailable`, `TempMoboAvailable`, `TempNvmeAvailable`). UI gates enabled/disabled state on capability; persists only the preference. Matches v3.2 phrase-style-per-locale gating pattern.
5. **`SettingsWindow` Temps tab (4th tab)** — ordering: Appearance → Stats → **Temps** → Behavior. Master toggle + 4 checkboxes + unavailable-fallback text. 5 new `event Action<bool>?` fields, identical shape to 15+ existing events.
6. **`MainWindow` integration** — `_temperatureService` field; 5 event handlers; `UpdateTempsDisplay()` called after `UpdateStatsDisplay()` in the existing stats tick; `TempsText` TextBlock appended inside `StatsPanel` after `UptimeText` (inherits `StatsVisible` auto-hide, matches `UptimeText` styling).
7. **`TrayMenuBuilder` change** — one line: expose the existing `ContextMenuStrip` as a public property so `MainWindow` can `.Show(Point)` it from the right-click handler. No duplicate menu.

### Critical Pitfalls

From PITFALLS research, in priority order:

1. **Do NOT ship LHM < 0.9.6 (WinRing0 bundled)** — Defender quarantines the installer on Win11 24H2 default; Microsoft Vulnerable Driver Blocklist blocks the driver. Pin `0.9.6`, CI grep gate on `WinRing0*.sys` in publish, test every release on a clean Win11 24H2 VM. **Prevented in Phase 1.**
2. **PawnIO is NOT bundled in LHM 0.9.6** — it's a separate signed driver requiring one-time admin install. Our installer cannot install it. LHM gracefully returns `null` for PawnIO-dependent sensors (CPU package, motherboard, SMBus DIMM), but GPU (NVAPI/ADL), NVMe (Windows Storage API), and battery work without it. The milestone's "graceful N/A" invariant is satisfiable only if the discovery spike confirms which sensors survive without PawnIO. **Resolved in Phase 1 spike; if spike shows most sensors N/A on clean VMs, fall back to a scope reduction or document "install PawnIO for full coverage" as optional polish — never prompt for UAC from the widget itself.**
3. **LHM `Update()` is slow and not thread-safe** — 40–200 ms on some hardware, can block for seconds on Ryzen 10h/certain Intel chipsets. Never call on UI thread during hover fast-refresh (0.5 s). Use a dedicated background thread OR run on the existing stats tick with a single-entry lock + minimum 2 s refresh interval (decoupled from hover cadence). Prevented in **Phase 1 (TempService)**.
4. **`Computer.Close()` missing on log-off/kill** — orphaned driver handle slows next launch, breaks v3.5's 500 ms single-instance IPC. Three-tier dispose: `OnClosing` + `SessionEnding` + `AppDomain.ProcessExit` with `Interlocked` guard. `Task.Run(Computer.Open)` with 3 s timeout. **Phase 1.**
5. **Layering violation** — don't put LHM in `FuzzyClock.Core`. CI grep gate for `LibreHardwareMonitor` under `FuzzyClock.Core/`. **Phase 1.**
6. **RMB DPI bugs + GC lifetime + focus/activation** — pitfall research recommends building a WPF `ContextMenu` (shared menu-model projected to both WinForms tray and WPF widget). This is the safer path on high-DPI multi-monitor setups but doubles menu code. **Recommendation: start with the low-risk WinForms `Show(Point)` reuse** (per STACK + FEATURES + ARCHITECTURE) because `Window.PointToScreen(Point)` is DPI-correct on .NET 10 PerMonitorV2, the menu is a singleton via `NotifyIcon.ContextMenuStrip` (no GC risk — the instance is rooted by the tray icon for the process lifetime), and Win32 transparency passes RMB through under ghost mode (no focus guard needed). **If** manual testing at 100%/150%/200% scaling uncovers placement bugs in Phase 3, pivot to the WPF menu-model projection approach at that point — do not over-engineer up front. Document the tradeoff and the pivot trigger in the phase plan.
7. **Installer missing LHM DLLs** — switch `[Files]` to glob; add a clean-VM smoke test to CI. **Phase 6.**
8. **SmartScreen reputation reset** — keep installer filename stable (`FuzzyClockSetup-X.Y.Z.exe`); do not change `AppId` GUID; do not bundle PawnIO; submit to Microsoft file-submission portal pre-release. **Phase 6.**
9. **MPL-2.0 attribution missing** — ship `THIRD-PARTY-NOTICES.md` in the installer. Non-negotiable, trivial. **Phase 6.**
10. **Right-click during proximity fade** — pin `_proximityRatio` while menu is open; mirror the existing "suppress proximity during drag" pattern from v4.0. **Phase 3.**

## Implications for Roadmap

### Recommended Phase Structure — 6 Phases

The architecture research suggested 8 phases (one per artifact type) and the pitfalls research suggested 5 (with a spike gate). The middle ground is **6 phases with the spike inline**: the spike is not a standalone phase but the first deliverable of Phase 1, producing the go/no-go data that informs Phase 1's own service design. This keeps velocity without sacrificing the safety gate.

#### Phase 1: Hardware Discovery Spike + TemperatureService
**Rationale:** The PawnIO availability question is gating and must be answered before committing UI surface. Collapsing the spike into Phase 1 means the spike's outcome directly shapes the service contract (which `float?` properties are realistically populated on a no-UAC system). Combining them also prevents the spike's output from being a disposable throwaway.
**Delivers:**
  - Written spike report in the phase plan documenting sensor availability on a clean Win11 24H2 VM with and without PawnIO installed
  - Go/no-go decision recorded (and if no-go, milestone scope reduction, e.g., GPU-only)
  - `TemperatureService` in `FuzzyClock.App` — singleton `Computer`, `Task.Run(Initialize)` with 3 s timeout, `-1f` sentinels, `IsReady` gate, three-tier `Dispose`, background refresh with single-entry lock OR cached values behind `_statsTimer.Tick` with a ≥2 s minimum
  - `ITempSource` abstraction + `FakeTempSource` for tests (enables hardware-free unit testing)
  - CI grep gate: `WinRing0*.sys` absent from publish/; `LibreHardwareMonitor` absent from `FuzzyClock.Core/`
  - MSTest coverage for service lifecycle, sentinel fallback, sensor resolution priority chain
**Addresses (features):** N/A fallback invariant, no-UAC invariant, hot-swap tolerance, sensor priority resolution
**Avoids (pitfalls):** 1 (WinRing0 bundling), 2 (PawnIO assumption), 3 (Update cadence/threading), 4 (Close() missing), 5 (layering violation), 13 (hardware-touching tests)

#### Phase 2: AppSettings + SettingsSnapshot expansion
**Rationale:** All downstream UI depends on the persistence + snapshot contract; build it once, test it once, then write UI against a stable shape.
**Delivers:**
  - 5 new `bool` init-properties on `AppSettings` with defaults as researched
  - 5 persisted fields + 4 capability flags on `SettingsSnapshot`
  - `SettingsService.Validate()` untouched (bools self-validate)
  - STEST round-trip + absent-field tests for the 5 new bools (backward-compat with v4.1 JSON)
**Addresses:** Persistence, upgrade safety, capability-gating foundation
**Avoids (pitfalls):** Schema drift, default-false upgrade surprises

#### Phase 3: Right-Click Menu on Widget
**Rationale:** **Fully parallelizable** with Phases 1, 2, 4, 5 — touches only `TrayMenuBuilder.cs` (one property), `MainWindow.xaml` (one attribute), and `MainWindow.xaml.cs` (one handler). Schedule it to unblock early user-visible wins while Phase 1/2 are still in flight.
**Delivers:**
  - `TrayMenuBuilder.ContextMenu` public property
  - `Grid_MouseRightButtonUp` handler using `PointToScreen()` + `ContextMenuStrip.Show(Point)`
  - `_isDragging` guard; `_proximityRatio` freeze while menu is open (mirroring v4.0 drag-pause pattern); RMB naturally suppressed at `Opacity=0`/`WS_EX_TRANSPARENT` by Win32 routing
  - Manual DPI validation checklist at 100%/150%/200% and multi-monitor mixed-DPI; documented pivot trigger to WPF-menu-model approach if bugs surface
**Addresses (features):** RMB menu byte-for-byte parity with tray, single source of truth
**Avoids (pitfalls):** 6 (DPI placement), 7 (menu GC — singleton via NotifyIcon.ContextMenuStrip), 8 (focus/Topmost), 9 (faded RMB)

#### Phase 4: Settings Temps Tab UI
**Rationale:** Requires Phase 1 (TemperatureService capabilities) and Phase 2 (snapshot shape). The tab + 5 checkboxes + availability-gated Content labels + 5 `Action<bool>?` events.
**Delivers:**
  - 4th TabItem "Temps" in SettingsWindow between Stats and Behavior
  - 5 checkboxes with capability gating (`IsEnabled = snapshot.TempsServiceAvailable && snapshot.TempXxxAvailable`)
  - "(N/A)" suffix on disabled checkbox labels
  - 5 `event Action<bool>?` fields with `_suppressEvents` guard on populate
  - `ResetToDefaults()` resets the 5 new bools
**Addresses (features):** Per-sensor visibility UX, unavailable-fallback affordance
**Avoids (pitfalls):** User confusion on all-N/A systems

#### Phase 5: MainWindow integration + TempsText rendering
**Rationale:** Final wiring — pulls Phases 1, 2, 4 together. Widget now renders the compact line.
**Delivers:**
  - `_temperatureService` field in MainWindow; disposed in `OnClosing`
  - 5 event handlers wired when Settings window opens
  - `TempsText` TextBlock inside `StatsPanel` after `UptimeText`, styled identical to `UptimeText` (accent color, FontSize=11, Opacity=0.7)
  - `UpdateTempsDisplay()` called after `UpdateStatsDisplay()` in `_statsTimer.Tick`
  - Compact format: `CPU 52°  GPU 61°  NVMe 38°`, 2-space separator, enabled+non-sentinel sensors only, degree-symbol-only (no `C`), integer precision
  - Auto-collapse when master off OR all 4 sensors unchecked/unavailable (mirrors v1.4 STAT-13 + v3.1 BATT-04)
  - Edge-snap + contrast-sampler re-clamp verified (widget grows by one row when temps enabled)
**Addresses (features):** Compact inline line, hot-swap tolerance, auto-collapse parity
**Avoids (pitfalls):** Timer coordination, stat-row layout regressions

#### Phase 6: Installer + MPL compliance + release verification
**Rationale:** Cross-cutting release plumbing; must run last because it validates the integrated artifact.
**Delivers:**
  - `FuzzyClock.iss` `[Files]` switched to glob `Source: "{#SourceDir}\*"; ... Flags: ignoreversion recursesubdirs createallsubdirs`
  - `THIRD-PARTY-NOTICES.md` in repo root; shipped in `[Files]`; optional "Open Licenses" link in Settings
  - `licenses/LICENSE-LHM.txt` (verbatim MPL-2.0) in installer
  - CI smoke test: clean Win11 24H2 VM install (manual checklist documented in release workflow)
  - SmartScreen submission via Microsoft file-submission portal
  - CI grep gate green: no `WinRing0*.sys` in publish; no `LibreHardwareMonitor` in `FuzzyClock.Core/`
  - README update: document "install PawnIO for full CPU/motherboard coverage" as optional power-user polish
**Addresses (features):** License compliance, AV reputation, installer completeness
**Avoids (pitfalls):** 10 (installer missing files), 11 (SmartScreen reset), 12 (MPL attribution)

### Phase Ordering Rationale

- **Phase 3 parallelizable with Phases 1/2** — RMB menu touches entirely different code from temperature plumbing. Schedule in parallel to unblock early user-visible value while the Phase 1 spike is in flight.
- **Phase 1 is the critical path gate** — every downstream phase depends on its output (service contract + capability flags + go/no-go on PawnIO).
- **Phase 2 before Phase 4** — UI binds to snapshot shape; stabilize the contract first.
- **Phase 5 integrates 1 + 2 + 4** — must come after all three.
- **Phase 6 last** — validates the integrated artifact; installer changes are one-shot and high-stakes.

### Research Flags

**Needs deeper research during planning (`/gsd:research-phase`):**
- **Phase 1 (Hardware Discovery + TempService)** — the spike needs empirical data from a clean Win11 24H2 VM; no amount of desk research substitutes. Reserve time in the plan for VM setup, snapshot-before/snapshot-after, sensor enumeration with and without PawnIO, and a written report in the plan document. This is the single highest-risk phase in the milestone.
- **Phase 3 (RMB Menu)** — manual DPI validation matrix (100% / 150% / 200% × single / multi-monitor × mixed-DPI); document a pivot plan to the WPF-menu-model approach if placement bugs surface during DPI testing. The STACK + ARCHITECTURE path is the recommended starting point, but the PITFALLS research flagged enough DPI/ContextMenuStrip-scaling history that a contingency is prudent.

**Standard patterns (skip research-phase, plan directly):**
- **Phase 2 (AppSettings + SettingsSnapshot)** — pure mechanical replication of v3.0/v3.1/v3.2/v3.9 patterns
- **Phase 4 (Settings Temps tab)** — mechanical replication of v3.2 SettingsWindow pattern with v3.9 LCD-style capability gating
- **Phase 5 (MainWindow integration + TempsText)** — mechanical replication of v2.1 UptimeText + v1.2 StatsPanel patterns
- **Phase 6 (Installer + release)** — extension of v3.5 Inno Setup pipeline; well-documented CI release flow

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Single new NuGet (LibreHardwareMonitorLib 0.9.6) with explicit `net10.0` TFM; existing WinForms `ContextMenuStrip` reuse is documented on Microsoft Learn; no speculative additions |
| Features | MEDIUM-HIGH | LHM API surface is well-documented (HIGH); UX conventions (Celsius-only, friendly labels, compact format) are synthesized from HWiNFO/iStat Menus/Windows 11 Widgets (MEDIUM); exact LHM sensor `Name` strings per vendor ("CPU Package", "Core (Tctl/Tdie)") will need empirical confirmation during Phase 1 |
| Architecture | HIGH | Every new component mirrors an existing pattern (StatsService, SettingsSnapshot, TrayMenuBuilder, UptimeText). Zero new patterns. No speculative interfaces |
| Pitfalls | HIGH | WinRing0 blocklist, PawnIO separation, MPL-2.0 semantics, Defender/SmartScreen are all HIGH confidence with primary sources. Medium-confidence items (exact DPI failure modes, GC menu-lifetime behavior in Release) are flagged with mitigation paths |

**Overall confidence:** HIGH with one gating uncertainty (PawnIO availability on clean VMs), which is structurally resolved by Phase 1's inline spike.

### Gaps to Address

- **PawnIO availability ground truth on clean Win11 24H2 VMs** — cannot be determined from research alone; Phase 1 spike produces the data. If the spike shows < 50% of CPU/Mobo sensors populated on a no-UAC system, the milestone scope should narrow to "GPU + NVMe only" and the Temps tab should render Mobo + CPU as disabled-with-N/A by default.
- **Exact LHM sensor `Name` strings per vendor** — priority-ordered fallback chain with an any-`SensorType.Temperature` final fallback (per Sensor Resolution pseudocode in FEATURES.md) handles variance gracefully; verify against developer-machine output in Phase 1 and document any discovered variants in Phase 1's output.
- **LHM `Update()` timing on real hardware** — dev-box timing is not representative. Phase 1 spike should also measure refresh latency and determine whether the existing `_statsTimer.Tick` with a single-entry lock is sufficient (simple) or whether a dedicated background thread is required (pitfall research's recommendation). The decision rule: if per-tick `Update()` exceeds 50 ms on the dev box, commit to the background-thread pattern; otherwise, piggyback the existing timer with the lock.
- **RMB menu DPI behavior** — needs Phase 3 manual validation; pivot plan documented.
- **Defender/SmartScreen behavior on v4.2 installer** — needs Phase 6 clean-VM validation before tagging the release.

## Sources

### Primary (HIGH confidence)
- **GitHub `LibreHardwareMonitor/LibreHardwareMonitor`** — 0.9.6 release, source tree (WinRing0 absence, PawnIO embeddings, `LibreHardwareMonitorLib.csproj`)
- **GitHub `namazso/PawnIO`** — separate driver installation model, licensing
- **Microsoft Learn** — `ToolStripDropDown.Show(Point)`, `Window.PointToScreen(Point)`, PerMonitorV2 DPI behavior
- **Microsoft Learn — Vulnerable Driver Blocklist** — default-on since Win11 22H2 / KB5018483 (October 2022); harder to disable on 24H2
- **Microsoft Q&A / Defender docs** — `HackTool:Win32/Winring0` / `VulnerableDriver:WinNT/Winring0` signatures
- **Mozilla MPL-2.0 FAQ** — file-level copyleft; binary redistribution in closed-source apps is permitted with attribution
- **NuGet.org** — `LibreHardwareMonitorLib` 0.9.6 TFM list, transitive deps
- **Project local (`.planning/PROJECT.md`, `MEMORY.md`)** — all architectural invariants, key decisions, test counts, existing patterns

### Secondary (MEDIUM confidence)
- Community and cross-product UX conventions (HWiNFO, iStat Menus, Rainmeter, Windows 11 Widgets) for sensor labels, compact formats, update cadence
- `dotnet/winforms` issues #4898, #9063, #9258 — `ContextMenuStrip` DPI scaling history
- LHM community issues #450, #2166, #1881, #2088, #1660 — PawnIO-absence behavior, threading crashes, memory-leak history

### Tertiary (LOW confidence — flagged for Phase 1 empirical validation)
- Exact LHM sensor `Name` strings per hardware vendor (addressed by priority-fallback chain + final any-Temperature fallback)
- Ryzen 5xxx `Tctl == Tdie` claim (doesn't affect UX regardless)
- `Update()` timing on specific chipsets (addressed by Phase 1 measurement)
- Rainmeter UX patterns (used only as counterpoint; never as a positive pattern to adopt)

### Detailed research documents
- `.planning/research/STACK.md` — full stack recommendations, install checklist, MPL compliance checklist
- `.planning/research/FEATURES.md` — feature landscape, anti-features, sensor naming convention, sensor resolution pseudocode
- `.planning/research/ARCHITECTURE.md` — component responsibilities, data flow diagrams, 6 architectural patterns + 7 anti-patterns, build order
- `.planning/research/PITFALLS.md` — 13 critical pitfalls with mitigation strategies, "looks done but isn't" checklist, recovery strategies, 2026 kernel-driver landscape snapshot

---
*Research completed: 2026-05-04*
*Ready for roadmap: yes*
