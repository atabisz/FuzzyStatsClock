# Project Research Summary

**Project:** FuzzyClock v2.1 — uptime display and rolling CPU load averages
**Domain:** WPF transparent frameless desktop widget (Windows, .NET 10)
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

FuzzyClock v2.1 is a tightly scoped, incremental feature addition to an already-validated WPF overlay widget. The milestone adds a single compact line below the existing stats panel showing system uptime in `up Xd Xh Xm` format alongside three rolling CPU load averages (`0.52  0.47  0.43`) styled in the accent color and toggleable via right-click. The entire implementation requires no new NuGet packages, no new services, no new timers, and no new files — only three existing files are modified (`AppSettings.cs`, `MainWindow.xaml`, `MainWindow.xaml.cs`). All new APIs (`Environment.TickCount64`, `TimeSpan.FromMilliseconds`) are in-box .NET 10 with zero initialization cost.

The recommended approach is to build in discrete, independently verifiable steps: first extend `AppSettings` with the `UptimeVisible` field (correctly defaulting to `true`), then add the XAML row and menu toggle with full settings plumbing, then implement uptime display alone, and finally layer in the rolling CPU average logic. This sequencing ensures the most dangerous pitfalls — violating the pre-Show() safety invariant, omitting the new field from `SaveSettings()`, and seeding the average buffer with cold-start zeros — are addressed at the structural level before data logic is written.

The primary risks are all known, preventable, and well-documented from the existing codebase's established patterns. The three most consequential are: (1) corrupting rolling averages with zero-valued samples during StatsService cold-start; (2) corrupting average window sizes when hover fast-refresh fires at 0.5s intervals instead of the configured rate; and (3) violating the pre-Show() safety invariant by calling `SetUptimeRowVisible()` from `ApplySettings()`. All three have explicit, straightforward mitigations that must be applied at implementation time.

---

## Key Findings

### Recommended Stack

The v2.1 stack adds nothing beyond what already exists in the project. `Environment.TickCount64` (in-box `System.Runtime.dll`) replaces any need for WMI or PDH counters for uptime — it is a single sub-microsecond property read returning milliseconds since boot as `Int64`. `TimeSpan.FromMilliseconds()` with `.Days`/`.Hours`/`.Minutes` component properties handles all formatting without custom arithmetic. Rolling CPU averages are computed via a `Queue<float>` trimmed to a 15-minute window, using `LINQ .TakeLast()` and `.Average()` — both in-box .NET 10.

**Core technologies (additions only):**
- `Environment.TickCount64`: system uptime source — zero-dependency, zero-latency, no threading concerns; preferred over WMI and PDH counter alternatives
- `TimeSpan.FromMilliseconds(long)`: uptime decomposition — `.Days`/`.Hours`/`.Minutes` component semantics confirmed via official docs; no custom math needed
- `Queue<float>` trimmed to 15-minute window: rolling CPU average storage — simple, readable, bounded at 900 entries max (negligible memory), trim-on-tick pattern avoids GC pressure
- `AppSettings bool UptimeVisible = true`: settings persistence — identical init-property pattern to all prior boolean fields; one-line addition to existing record

**No csproj changes. No new NuGet packages. All required assemblies already referenced.**

See `.planning/research/STACK.md` for algorithm detail, ring buffer vs. queue tradeoff analysis, code samples, and alternatives considered.

### Expected Features

The feature set is constrained by spec and best-practice convention. The 1m/5m/15m triplet on a single line is a universal convention — deviation (separate rows, different windows, different format) creates confusion without value. The "up" prefix and days/hours/minutes format matches Linux `uptime` output, which users of this class of widget already understand.

**Must have (table stakes):**
- `up Xd Xh Xm` uptime display with leading-zero-unit suppression (`up 5h 3m` not `up 0d 5h 3m`) — universal system monitor convention
- Three rolling CPU load averages (1m/5m/15m) displayed as decimals (`0.52  0.47  0.43`) — the standard triplet, Linux-style normalized to [0.0, 1.0]
- Combined single-line display below stats panel — compact, non-intrusive, matches spec
- Accent color applied to the uptime/load row via `ApplyTheme()` — visual consistency with all other stats text
- Visible by default (`UptimeVisible = true`) — new feature must be discoverable on first launch and after upgrade
- Right-click toggle with persistence — all other rows support this; uptime must follow the same pattern

**Differentiators (deferred to v2+):**
- Boot time tooltip on hover over uptime
- Peak load asterisk indicator when load exceeds 0.80
- Separate update interval for uptime row (vs. stats timer rate)

**Explicitly out of scope for v2.1:**
- Seconds in uptime display (creates display churn, no informational value at widget scale)
- Separate rows for uptime vs. load averages (contradicts single-line spec)
- Configurable averaging windows (1/5/15 is a universal standard; deviation confuses users)
- WMI-based uptime (heavyweight for equivalent result; `TickCount64` is sufficient)
- Separate toggles for uptime portion vs. load portion (one line, one toggle)

See `.planning/research/FEATURES.md` for edge case table, cold-start EWMA analysis, and full dependency graph.

### Architecture Approach

v2.1 follows the established code-behind-first WPF pattern without deviation. No MVVM, no new services, no new timers. The new `_cpuSamples Queue<float>` lives in `MainWindow.xaml.cs` alongside the existing timer state fields. `UpdateUptimeDisplay()` is a new private method called at the end of the existing `_statsTimer.Tick` handler — after `_statsService.Refresh()` has already fired, ensuring `CpuPercent` is current without a second Refresh call. The inner Grid gains a Row 2 for the `UptimeText` TextBlock, which is placed as a sibling of `StatsPanel` (not a child) to preserve independent visibility semantics.

**Modified files:**
1. `AppSettings.cs` — add `bool UptimeVisible { get; init; } = true`
2. `MainWindow.xaml` — add Row 2 `UptimeText` TextBlock (Width=180, FontSize=11) + `MenuUptimeVisible` IsCheckable toggle in Stats submenu
3. `MainWindow.xaml.cs` — add `_cpuSamples` field and `ComputeAvg()`, extend `_statsTimer.Tick` with `UpdateUptimeDisplay()`, extend `ApplySettings()` / `SaveSettings()` / `ContextMenu_Opened()` / `ApplyTheme()`, add `MenuUptimeVisible_Click` and `SetUptimeRowVisible()`

**Unchanged:** `StatsService.cs` (except adding `bool IsReady` property exposing `_initialized`), `SettingsService.cs`, `App.xaml.cs`, `FuzzyClock.Core`

**Key constraint:** The `UpdateUptimeDisplay()` method must include an early exit when `UptimeRow.Visibility != Visible`, preventing queue growth and string formatting when the row is hidden.

See `.planning/research/ARCHITECTURE.md` for data flow diagrams, XAML layout spec, and the 6-step build order with per-step verification criteria.

### Critical Pitfalls

The research identified 12 pitfalls. The 5 most consequential for implementation correctness:

1. **Rolling buffer seeded with StatsService zeros (P1)** — StatsService takes ~6s to initialize; samples pushed before `_initialized = true` are `0.0f`, depressing averages for the first minute. Mitigation: add `bool IsReady` property to StatsService and guard buffer pushes with `if (!_statsService.IsReady) return`.

2. **Hover fast-refresh corrupts average window sizes (P3)** — the 0.5s hover timer rate increases sample density 6x; count-based windows represent much shorter time spans than labeled. Mitigation: skip buffer push during hover fast-refresh ticks using an `_isHoverFastRefresh` flag.

3. **`UptimeVisible` init default must be `true`, not `false` (P4)** — `bool` fields deserialize as `false` when absent from JSON; declaring without `= true` hides the uptime row on first launch and after upgrade. Mitigation: declare `public bool UptimeVisible { get; init; } = true`.

4. **`SaveSettings()` must include the new field (P7)** — omitting `UptimeVisible` from the inline `AppSettings` record construction silently resets the user's toggle choice to the init default on every restart. Mitigation: update `SaveSettings()` in the same commit as the `AppSettings` field addition.

5. **Pre-Show() safety invariant violated by calling `SetUptimeRowVisible()` from `ApplySettings()` (P11)** — `SetUptimeRowVisible()` calls `UpdateLayout()` before `Show()`, producing `ActualHeight = 0` and corrupted position clamping. Mitigation: assign `UptimeRow.Visibility` directly in `ApplySettings()`, same as all other row visibility assignments.

Additional moderate pitfalls: missing `ApplyTheme()` extension (P9, white text with non-white accents), missing `ContextMenu_Opened` sync (P10, inverts checkmark after first toggle), and missing `UpdateLayout()` + re-clamp in `SetUptimeRowVisible()` (P12, widget slides off screen near bottom edge when shown).

See `.planning/research/PITFALLS.md` for all 12 pitfalls with code examples, detection symptoms, and a 12-item "looks done but isn't" verification checklist.

---

## Implications for Roadmap

The research supports a clean 2-phase implementation structure that mirrors the existing codebase's separation of concerns. Each phase is independently testable and produces a fully shippable partial state.

### Phase 1: Infrastructure and Toggle (Settings + XAML + Wiring)

**Rationale:** Settings plumbing and XAML layout have no dependencies on data logic, but data logic depends on them — the TextBlock must exist before it can be updated, and the settings field must exist before `ApplySettings()` can read it. Establishing this infrastructure first addresses the most dangerous pitfalls (P4, P7, P11) before any logic is written, and validates the full toggle lifecycle independently.

**Delivers:** A visible placeholder row (`up —`) in the correct position with correct accent color, toggleable via right-click menu, with state persisting across restarts. The widget is fully functional with no regression to existing behavior.

**Addresses:** UPT-02 (toggle visibility with persistence), AppSettings schema extension, XAML layout placement decision

**Avoids:**
- P4: `UptimeVisible` init default set to `true` from the start
- P6: UptimeRow placed as a sibling of StatsPanel (not a child), avoiding auto-collapse logic gap
- P7: `SaveSettings()` updated in same commit as AppSettings field
- P9: `ApplyTheme()` extended to cover UptimeText immediately
- P10: `ContextMenu_Opened` sync added with the menu item
- P11: `ApplySettings()` sets `UptimeRow.Visibility` directly, not via `SetUptimeRowVisible()`
- P12: `SetUptimeRowVisible()` calls `UpdateLayout()` + re-clamp when showing the row

**Stack:** `AppSettings bool UptimeVisible = true`, `TextBlock` in Row 2 of inner Grid, `SolidColorBrush` extension in `ApplyTheme()`

**Research flag:** No deeper research needed — every pattern in this phase is directly established in the existing codebase. Zero novel patterns.

### Phase 2: Data Display (Uptime + Rolling CPU Averages)

**Rationale:** With the TextBlock and settings wired, display logic can be added incrementally. Implement uptime string first (stateless, trivially verifiable at any uptime value), then rolling averages (stateful, requires P1 and P3 guards). The stepwise approach within this phase allows uptime accuracy to be confirmed before introducing queue state and window-size logic.

**Delivers:** Complete v2.1 feature — `up Xd Xh Xm  0.52  0.47  0.43` displayed in accent color, updating each stats timer tick, with accurate 1m/5m/15m averages that survive hover fast-refresh and StatsService cold-start.

**Addresses:** UPT-01 (full display), uptime formatting edge cases (sub-hour, sub-day, multi-day, very long uptime), rolling average accuracy at all configured timer intervals (1s/3s/10s)

**Avoids:**
- P1: Buffer push guarded by `_statsService.IsReady`; requires adding `bool IsReady` property to StatsService
- P2: `Environment.TickCount64` (Int64) used explicitly; `Environment.TickCount` (Int32, wraps at 24.9 days) never used
- P3: Hover fast-refresh ticks excluded from buffer push
- P8: Format string is `up {D}d {H}h {M}m` — no seconds component

**Stack:** `Environment.TickCount64`, `TimeSpan.FromMilliseconds`, `Queue<float>` with interval-aware window sizing (`windowSamples = (int)Math.Ceiling(windowSeconds / _statsIntervalSeconds)`)

**Architecture:** Extend `_statsTimer.Tick` handler with `UpdateUptimeDisplay()`, add `_cpuSamples` and `ComputeAvg()`, add `StatsService.IsReady` property

**Research flag:** No deeper research needed — all algorithms are confirmed and fully specified in STACK.md and ARCHITECTURE.md with working code samples.

### Phase Ordering Rationale

Phase 1 before Phase 2 is mandatory: the XAML element and settings field must exist before display logic can reference them at compile time. Within Phase 2, uptime string before rolling averages is strongly recommended: uptime is stateless and validates the display pipeline (TextBlock updates, format string, edge cases) without introducing queue state, interval-aware window sizing, or the cold-start and hover guards. Both phases are small enough to constitute a single v2.1 milestone delivery, but implementing them as distinct verifiable steps is consistent with the existing milestone delivery pattern established in ARCHITECTURE.md.

### Research Flags

All phases have HIGH-confidence, complete code examples in the research files. No phase requires `/gsd:research-phase`.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Infrastructure):** Every pattern directly established in the existing codebase — init-property AppSettings fields, XAML row addition, IsCheckable toggle wiring, pre-Show visibility assignment, ApplyTheme brush extension, SaveSettings record construction.
- **Phase 2 (Data Display):** `Environment.TickCount64` confirmed via official .NET 10 docs; `TimeSpan` component semantics confirmed with numeric example; rolling average Queue pattern is standard and fully specified in STACK.md and ARCHITECTURE.md with working code.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs confirmed via official .NET 10 docs; zero new dependencies; all patterns validated in v1.x–v2.0 milestones; ring buffer capacity arithmetic verified |
| Features | HIGH | Scope constrained by spec; feature list grounded in direct codebase inspection and first-party PROJECT.md; no feature ambiguity |
| Architecture | HIGH | Based on direct source code reading; build order is step-by-step verifiable; no inferences required; XAML layout fully specified |
| Pitfalls | HIGH | All 12 pitfalls derived from reading actual source files and official API docs; not from general heuristics; working mitigations provided for all |

**Overall confidence:** HIGH

### Gaps to Address

- **`StatsService.IsReady` property:** The rolling average cold-start guard (P1) requires exposing `StatsService._initialized` as a public `bool IsReady` property. Research classified `StatsService.cs` as "unchanged," but this one-line addition is required for correctness. The implementation phase should add this property to `StatsService.cs` before wiring the buffer push guard.

- **Hover fast-refresh flag:** P3 mitigation requires knowing whether the current stats timer tick is a hover-rate tick. The implementation should verify at Phase 2 start whether `MainWindow.xaml.cs` already exposes an `_isHoverFastRefresh` flag or equivalent from the Phase 12 fast-refresh implementation, and add one if it does not exist.

- **`TickCount64` suspend behavior:** Research confirms that `Environment.TickCount64` on .NET 10/Windows includes sleep/hibernate time per official docs. However, the docs note this behavior changes in .NET 11 (sleep time excluded). The implementation should include an explicit code comment documenting the deliberate choice of `TickCount64` over WMI, and noting that `.NET 10 includes suspend time` so future upgraders understand the semantic.

---

## Sources

### Primary (HIGH confidence)
- `MainWindow.xaml.cs`, `StatsService.cs`, `AppSettings.cs`, `SettingsService.cs`, `MainWindow.xaml` — direct source code inspection, 2026-02-27
- `PROJECT.md` Key Decisions table — 40+ validated architectural decisions, read directly
- `Environment.TickCount64` (net-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0 — Int64, milliseconds since system start, Windows sleep-time behavior confirmed
- `TimeSpan` struct (net-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.timespan?view=net-10.0 — `Days`/`Hours`/`Minutes` component semantics confirmed with numeric example; `FromMilliseconds(long)` overload confirmed
- .NET 11 breaking change for `TickCount64` (sleep time excluded in .NET 11+): https://learn.microsoft.com/en-us/dotnet/core/compatibility/core-libraries/11/environment-tickcount-windows-behavior
- Win32 `GetTickCount64`: https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-gettickcount64
- Prior milestone research (v1.2 StatsService, v1.4 PAG counter): `.planning/milestones/v1.2-phases/07-statsservice/07-RESEARCH.md`

### Secondary (MEDIUM confidence)
- EWMA formula (`α = 1 - e^(-t/window)`) — standard exponential moving average; Linux kernel `include/linux/sched/loadavg.h` as canonical reference; well-known algorithm
- WMI `ManagementObjectSearcher` startup latency (100ms–2000ms) — established in Microsoft developer documentation; consistent with prior v1.2 research rejecting WMI for stats counters
- `Environment.TickCount64` suspend behavior on ACPI platforms — partially platform/driver dependent; official docs confirm Windows .NET 10 behavior

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
