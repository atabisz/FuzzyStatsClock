# Phase 76: AppSettings + TemperatureFormatter Tests — Research

**Researched:** 2026-05-04
**Domain:** `System.Text.Json` init-property-record forward/backward compatibility + pure static formatter extraction into `FuzzyClock.Core`
**Confidence:** HIGH — every moving part has a direct template already in the repo (`AppSettingsTests`, `DateFormatter`, `UptimeFormatter`, `TemperatureServiceTests`). No new frameworks, no new patterns. The only non-trivial research questions are **specification drift** between ROADMAP and REQUIREMENTS (flagged in §2) and **boundary behavior** of the formatter around the `-1f` sentinel.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **TEST-01** | Five new `AppSettings` fields (`TempsLineVisible`, `TempCpuVisible`, `TempGpuVisible`, `TempMoboVisible`, `TempNvmeVisible`) are init-property bools with defaults matching TEMP-TAB-02 / TEMP-TAB-03. | §3 AppSettings Changes — exact field-by-field additions, defaults table, init-property pattern mirrored from existing `UptimeVisible` / `BatteryVisible`. |
| **TEST-02** | JSON round-trip test covers all five new fields (serialize → deserialize → all values match). | §6.1 Test Roster — `RoundTrip_TempsFields_AllFiveMatch` + per-field `[DataRow]` table directly clones the existing `RoundTrip_FullyPopulated_AllFieldsMatch` pattern. |
| **TEST-03** | Absent-field deserialization tests verify init defaults apply when loading a v4.1 `settings.json` with none of the five fields present. | §6.1 Test Roster — five `Deserialize_Missing{Field}_DefaultsTo{Value}` methods clone the existing `Deserialize_MissingUptimeVisible_DefaultsToTrue` pattern. |
| **TEST-04** | `TemperatureFormatter` (pure static in `FuzzyClock.Core` — no LHM reference) is unit-tested for: all-sensors-present, partial-N/A, all-N/A-returns-empty, single-sensor, correct 2-space separator, `°` symbol, integer rounding. | §4 TemperatureFormatter API + §6.2 Test Roster — full API signature + anti-pattern list + eight enumerated test cases. |
</phase_requirements>

## 1. Executive Summary

Phase 76 is a **pure-infrastructure phase** — it ships zero production runtime behavior (no new UI, no wired-up formatter invocation, no new services). It lands two mechanically independent deliverables that unblock phases 78 and 79:

- **Deliverable A — `AppSettings` five-field extension.** Add `TempsLineVisible`, `TempCpuVisible`, `TempGpuVisible`, `TempMoboVisible`, `TempNvmeVisible` as init-property `bool`s on the existing `AppSettings` record with documented defaults (all OFF for master + Mobo + NVMe, ON for CPU + GPU). Mirrors `UptimeVisible` / `BatteryVisible` line-for-line. No `SettingsService.Validate()` guard required (bools have no invalid states); the existing `try/catch → Defaults()` fallback in `Load()` already protects against malformed JSON.
- **Deliverable B — `TemperatureFormatter` pure static in `FuzzyClock.Core`.** Single public method `Format(float cpu, float gpu, float mobo, float nvme, bool cpuVisible, bool gpuVisible, bool moboVisible, bool nvmeVisible) → string` returning a compact inline line `"CPU 52°  GPU 61°  NVMe 38°"` per TEMP-LINE-02/03/04. `-1f` sentinels and unchecked sensor toggles both suppress the segment; all-suppressed returns `""` (empty string — the widget caller then collapses the `TextBlock`).

The only real research effort is reconciling two documentation-drift signals between ROADMAP and REQUIREMENTS/STATE (§2). Nothing in this phase requires new dependencies, new test frameworks, or new design decisions beyond what Phase 75 already established.

**Primary recommendation:** ship the formatter first (pure Core, zero dependencies) → then land the five AppSettings fields → then the tests. Both deliverables are parallelizable within the phase but implementing the formatter first lets its API shape influence AppSettings field naming if any friction emerges (none expected).

## 2. Documentation Drift — MUST RESOLVE BEFORE PLANNING

Two inconsistencies exist between `ROADMAP.md` Phase 76 success criteria and the current state of `REQUIREMENTS.md` / `STATE.md`. Both are **documentation drift that postdates Phase 75 NO-GO amendments** — REQUIREMENTS.md is newer and authoritative; ROADMAP.md needs an amendment pass.

### Drift #1 — NVMe default (HIGH severity)

| Source | Value | Date | Authority |
|--------|-------|------|-----------|
| `ROADMAP.md` Phase 76 SC#2 (line 76) | `TempNvmeVisible=true` | 2026-05-04 (initial roadmap) | **STALE** |
| `REQUIREMENTS.md` TEMP-TAB-03 (line 24) | `NVMe=OFF` (amended ON→OFF) | 2026-05-04 (post-spike, commit `b2163d1`) | **AUTHORITATIVE** |
| `STATE.md` Active TODOs | TEMP-TAB-03 amendment noted as `[x]` complete | 2026-05-04 | Confirms REQUIREMENTS is current |
| Plan 75-02 `FakeTempSource.cs:19` | `MoboTempC=-1f` (not NVMe — but the comment on that line says "matches TEMP-TAB-03 default") | 2026-05-04 | Consistent with REQUIREMENTS |

**Resolution for planner:** `TempNvmeVisible` default **MUST be `false`** (TEMP-TAB-03 authority). The ROADMAP SC#2 line is stale from before the NO-GO spike amendments were applied.

**Recommendation:** The planner's first action should be to amend `ROADMAP.md` Phase 76 SC#2 to read `TempNvmeVisible=false` — matching what landed in REQUIREMENTS.md at commit `b2163d1`. The amendment is identical in character to the four amendments already applied on 2026-05-04 and documented in STATE.md Active TODOs.

### Drift #2 — Baseline test count (LOW severity, documentation only)

| Source | Value | Notes |
|--------|-------|-------|
| `ROADMAP.md` Phase 76 SC#4 (line 78) | "v4.1 baseline (501 tests) is strictly exceeded" | Pre-Phase-75 number |
| `STATE.md` (line 31) | "522 MSTest tests (433 Core + 89 App = 68 baseline + 21 new)" | Actual post-Phase-75 baseline |
| Plan 75-02 SUMMARY (referenced in STATE) | 522 green | Confirms STATE |

**Resolution for planner:** Phase 76 must strictly exceed **522** (the true current baseline), not 501. The correct target is therefore **≥522 + (Phase 76 new tests)** — per §6 the new-test count is **18 total** (5 round-trip coverage via `[DataRow]` table + 5 absent-field defaults + 8 formatter), landing at **≥540 tests** on suite completion.

**Recommendation:** Amend ROADMAP SC#4 to read "the v4.2 Phase 75 baseline (522 tests) is strictly exceeded" OR (simpler) amend to a formulation that does not hardcode a number: "the full MSTest suite reports 0 failures after the new fields and tests land; test count strictly exceeds the pre-Phase-76 baseline." The latter is more durable against future drift.

### Summary of required amendments

Before Phase 76 PLAN.md is cut, the planner should apply this single amendment commit (documentation only, no code):

```markdown
# In .planning/ROADMAP.md Phase 76 SC#2:
- TempNvmeVisible=true  →  TempNvmeVisible=false

# In .planning/ROADMAP.md Phase 76 SC#4:
- "v4.1 baseline (501 tests)"  →  "pre-Phase-76 baseline"
  (OR hardcode to 522 if the explicit number is preferred)
```

Phase 76 itself then ships against REQUIREMENTS.md + the amended ROADMAP.md, both pointing at the same numbers.

## 3. AppSettings Changes (Deliverable A)

### 3.1 Field additions — exact signatures

Add these five lines to `FuzzyClock.App/AppSettings.cs` within the `public record AppSettings` block. Place them contiguously — a natural grouping near the existing stats-visibility fields (`CpuVisible` / `GpuVisible` / `MemVisible` / `PagVisible` / `BatteryVisible` / `UptimeVisible`) is the obvious home, but any placement works as long as they are init-properties with documented defaults.

```csharp
// New in v4.2 — temperature line visibility (master toggle + per-sensor)
// Defaults per REQUIREMENTS.md TEMP-TAB-02/-03 (NVMe amended ON→OFF on 2026-05-04 post-spike).
public bool TempsLineVisible   { get; init; } = false;   // master toggle; default OFF
public bool TempCpuVisible     { get; init; } = true;    // per-sensor; default ON
public bool TempGpuVisible     { get; init; } = true;    // per-sensor; default ON
public bool TempMoboVisible    { get; init; } = false;   // per-sensor; default OFF (PawnIO-gated)
public bool TempNvmeVisible    { get; init; } = false;   // per-sensor; default OFF (spike amendment — NVMe not enumerated on baseline hardware)
```

### 3.2 Defaults table (copy verbatim into PLAN.md + tests)

| Field | Default | Source | Rationale |
|-------|---------|--------|-----------|
| `TempsLineVisible` | `false` | TEMP-TAB-02 | Master OFF on fresh install + v4.1 upgrade — users must opt in |
| `TempCpuVisible` | `true` | TEMP-TAB-03 | Most-common sensor; worth showing if user enables master |
| `TempGpuVisible` | `true` | TEMP-TAB-03 | Most-common sensor; GPU readable baseline per spike |
| `TempMoboVisible` | `false` | TEMP-TAB-03 | PawnIO-gated on most hardware; noisy / useless on OEM laptops |
| `TempNvmeVisible` | `false` | TEMP-TAB-03 amendment (2026-05-04, commit `b2163d1`) | NVMe not enumerated on spike baseline; user opts in with awareness |

### 3.3 No `SettingsService.Validate()` guard needed

The existing `Validate()` pattern guards against **out-of-range** or **null-ish** values (opacity ≤ 0, whitespace strings, enum-like strings outside a known set, ints outside a range). Bools have no invalid state — `true` and `false` are both always valid. The JSON round-trip for a bool field is trivial: absent → init default; `"TempsLineVisible":true` → `true`; `"TempsLineVisible":false` → `false`; anything else (e.g. manually edited `"TempsLineVisible":"yes"`) is already caught by the outer `try/catch` → `Defaults()` in `SettingsService.Load()` (line 65 of current `SettingsService.cs`).

**Do NOT add guard code for the five new bools.** Doing so would add lines with zero test coverage value and no runtime defense.

### 3.4 `SettingsService.Defaults()` — no change required

`Defaults()` builds an `AppSettings` via `new() { ... }` with explicit field assignments. The new five fields will **inherit their init-property defaults** automatically without being listed in `Defaults()` — because `new AppSettings { FontSize = 32, ... }` constructs the record and every field not mentioned in the initializer takes its declared init default.

**Verify this empirically in Plan 76's review:** `SettingsService.Defaults().TempsLineVisible` must equal `false` without adding the field to `Defaults()`. Same test covers all five. This is the identical contract that already protects `AutoLaunchEnabled`, `AutoContrastEnabled`, `PhraseStyle`, `PhraseLocale`, `PhraseWrapEnabled`, `PhraseWrapStyle`, `BackdropAlwaysVisible`, `BackdropOpacityPercent` — none of these are listed in `Defaults()` yet they round-trip correctly because they rely on init defaults alone.

**Exception:** if the planner chooses to list the new fields in `Defaults()` for symmetry with the older stats fields (`CpuVisible = true`, etc. — which ARE listed), that is acceptable but not required. Either convention round-trips correctly.

### 3.5 `ResetToDefaults()` in `MainWindow.xaml.cs` — MAY be updated, but is NOT required for Phase 76

Phase 78 (Temps Tab in Settings) is where the Settings UI wires the user-visible toggles. `ResetToDefaults()` touches the **in-memory runtime state** of MainWindow fields, not settings persistence. Phase 76 does not introduce any MainWindow field bound to the new five — they live only in `_settings` (the AppSettings record). Therefore:

- **Phase 76 obligation:** zero changes to `ResetToDefaults()`.
- **Phase 78 obligation:** when Temps tab toggles are wired to event handlers, add five lines to `ResetToDefaults()` that reset `_settings = _settings with { TempsLineVisible = false, TempCpuVisible = true, ... }` — matching the defaults table in §3.2. This is NOT a Phase 76 task; flag for Phase 78 planner.

This respects the phase dependency graph in ROADMAP.md: Phase 78 depends on Phase 76 for persisted settings; Phase 76 should not pre-wire Phase 78's UI concerns.

## 4. TemperatureFormatter API Design (Deliverable B)

### 4.1 File layout

| File | Namespace | Posture |
|------|-----------|---------|
| `FuzzyClock.Core/TemperatureFormatter.cs` | `FuzzyClock.Core` | `public static class` — identical to `DateFormatter.cs`, `UptimeFormatter.cs`, `SevenSegmentEncoder.cs`, `PhraseWrapService.cs` |
| `FuzzyClock.Core.Tests/TemperatureFormatterTests.cs` | `FuzzyClock.Core.Tests` | `[TestClass] public class TemperatureFormatterTests` — mirrors `DateFormatterTests` + `UptimeFormatterTests` |

**REL-03 compliance:** `FuzzyClock.Core` targets `net10.0` (not `net10.0-windows`) and has no `LibreHardwareMonitorLib` reference. The formatter consumes **`float` parameters directly** — it never sees an `ISensor`, never imports from `LibreHardwareMonitor.Hardware`, and never references App-layer types. This is verified structurally: the existing `FuzzyClock.Core.csproj` (read during research) has zero `PackageReference` entries. Adding the formatter requires no csproj change.

### 4.2 Public API — single method

```csharp
namespace FuzzyClock.Core;

/// <summary>
/// Renders the temperature stats line. Segments whose value equals the -1f
/// sentinel, or whose visibility toggle is false, are silently omitted.
/// Output format per TEMP-LINE-02: 2-space separator, integer Celsius, ° symbol only.
/// If every segment is suppressed, returns the empty string (caller collapses TextBlock).
/// </summary>
public static class TemperatureFormatter
{
    /// <summary>
    /// Format a temperature line from four float readings and four visibility flags.
    /// </summary>
    /// <param name="cpu">CPU temp in °C, or -1f for N/A.</param>
    /// <param name="gpu">GPU temp in °C, or -1f for N/A.</param>
    /// <param name="mobo">Motherboard temp in °C, or -1f for N/A.</param>
    /// <param name="nvme">NVMe temp in °C, or -1f for N/A.</param>
    /// <param name="cpuVisible">Include CPU segment when reading is valid.</param>
    /// <param name="gpuVisible">Include GPU segment when reading is valid.</param>
    /// <param name="moboVisible">Include Mobo segment when reading is valid.</param>
    /// <param name="nvmeVisible">Include NVMe segment when reading is valid.</param>
    /// <returns>
    /// Compact inline line with 2-space separator, e.g. "CPU 52°  GPU 61°  NVMe 38°".
    /// Empty string when all four segments are suppressed.
    /// </returns>
    public static string Format(
        float cpu,  float gpu,  float mobo,  float nvme,
        bool  cpuVisible, bool gpuVisible, bool moboVisible, bool nvmeVisible)
    {
        // Use a List<string> and string.Join("  ", ...) for the 2-space separator.
        // The List approach is preferred over StringBuilder because:
        //   - At most 4 segments; allocation is trivial
        //   - string.Join handles the "no trailing separator" edge case for free
        //   - Empty-list → "" is the documented empty-string contract
        var segments = new List<string>(capacity: 4);
        if (cpuVisible  && cpu  >= 0f) segments.Add($"CPU {(int)Math.Round(cpu)}°");
        if (gpuVisible  && gpu  >= 0f) segments.Add($"GPU {(int)Math.Round(gpu)}°");
        if (moboVisible && mobo >= 0f) segments.Add($"Mobo {(int)Math.Round(mobo)}°");
        if (nvmeVisible && nvme >= 0f) segments.Add($"NVMe {(int)Math.Round(nvme)}°");
        return string.Join("  ", segments);   // 2-space separator per TEMP-LINE-02
    }
}
```

### 4.3 API design decisions (HIGH confidence, verified against REQUIREMENTS)

| Decision | Value | Source / Rationale |
|----------|-------|--------------------|
| **Separator** | Two-space string `"  "` | TEMP-LINE-02 literal: `"CPU 52°  GPU 61°  NVMe 38°"` |
| **Degree symbol** | Unicode `°` (U+00B0) only | TEMP-LINE-02 "no C/F suffix, no unit toggle" |
| **Rounding** | `(int)Math.Round(value)` banker's rounding (default .NET midpoint mode: `ToEven`) | TEMP-LINE-02 "integer Celsius" — no precision spec, banker's rounding is the .NET default and matches stats-bar conventions |
| **N/A detection** | `value >= 0f` (treats `-1f` and any negative as N/A) | TEMP-LINE-04 `-1f` sentinel; negative temperatures are physically unreachable in °C for silicon, so `>= 0f` is a safe generalization. (Research alternative: exact `value != -1f` would also work but is more brittle if the service boundary ever drifts.) |
| **Visibility short-circuit** | Segment dropped when EITHER `{name}Visible == false` OR `{name} < 0f` | TEMP-LINE-04 "checked but return no valid reading... silently omitted" (user-checked but sensor missing → omit). Unchecked sensors are obviously omitted. Both conditions are OR'd into `&&` inside the `if`. |
| **All-suppressed contract** | Returns `""` (empty string — NOT null, NOT `" "`) | TEMP-LINE-01 "auto-hides with the Stats panel" + §6.2 `AllNA_ReturnsEmptyString` test enforces this explicitly. The widget caller (Phase 79) checks `if (string.IsNullOrEmpty(line)) TempsText.Visibility = Collapsed`. |
| **Friendly labels** | `"CPU"`, `"GPU"`, `"Mobo"`, `"NVMe"` (literal strings inline) | TEMP-LINE-03 — raw LHM sensor names never appear in the formatter output |
| **Method purity** | No static state, no allocation beyond the `List<string>` + returned `string` | Core convention (`DateFormatter`, `UptimeFormatter` are both pure). Safe to call concurrently from any thread without locking. |

### 4.4 Why `(int)Math.Round(x)` and not `(int)x` (truncation)

`(int)x` truncates toward zero: `(int)52.9f == 52`. This is surprising to users and inconsistent with human rounding conventions (52.9 should round to 53, not 52). `Math.Round(x)` with the default `MidpointRounding.ToEven` (banker's rounding) is what `.NET` does for integer formatting of floats elsewhere in the codebase and matches the `{0:F0}` format specifier that stats display formatting already uses (see `MainWindow.xaml.cs` `CpuBar.Text = $"CPU {cpu:F0}%"` or equivalents).

**Test coverage:** the formatter test `IntegerRounding_RoundsToNearest` uses `52.6f → 53` and `52.4f → 52` to nail this explicitly.

### 4.5 Why this signature (eight parameters) and not an object parameter

**Considered:** `Format(TempReading reading)` where `TempReading` is a record with the eight values.

**Rejected because:**
- Core has no equivalent wrapper type today — `DateFormatter.Format(string format, DateTime date)` and `UptimeFormatter.Format(TimeSpan uptime)` both take primitives directly.
- Introducing `TempReading` in Core would either require a mirror type in App (duplicate data carrier) OR App consumers would need to construct it from `ITempSource + AppSettings` each tick. Both add friction with no test-quality benefit.
- The eight-parameter signature is not long enough to benefit from a parameter object (rule of thumb: >10 params). Each parameter is self-documenting via name.
- Eight primitives is trivial to invoke from Phase 79's widget code: `TemperatureFormatter.Format(_temp.CpuTempC, _temp.GpuTempC, _temp.MoboTempC, _temp.NvmeTempC, _settings.TempCpuVisible, _settings.TempGpuVisible, _settings.TempMoboVisible, _settings.TempNvmeVisible)`.

If a future milestone adds Fahrenheit or per-core temps, the API can grow an overload. YAGNI applies today.

### 4.6 Why the formatter does NOT consume the master toggle (`TempsLineVisible`)

`TempsLineVisible` is a **UI-visibility concern** handled by the widget (Phase 79) — when false, the widget sets `TempsText.Visibility = Collapsed` and never invokes the formatter. When true, the widget invokes `Format()` with the four per-sensor flags and either renders the returned string or collapses on empty.

**Alternative considered:** accept `bool tempsLineVisible` as a ninth parameter and return `""` when false. **Rejected** because it conflates two concerns: (a) "is the user opted in at all?" (widget-level) and (b) "of the opted-in segments, which are present?" (formatter-level). Keeping them separate makes the formatter's contract sharper and the widget's wiring clearer.

**Exception the planner may consider:** if there is asymmetry where one phase uses the formatter with an "is master on?" gate baked in, a future thin wrapper `TemperatureFormatter.FormatIfVisible(...)` could add it. Do not add this on speculation.

## 5. Validation Architecture

**Skipped per `.planning/config.json` — `workflow.nyquist_validation: false`.** Phase 76 follows the project's existing MSTest discipline (Task-level `dotnet test` with `--filter` in each plan, full-suite green before phase completion). No per-requirement behavior-to-test table is required.

## 6. Test Roster (TEST-02 + TEST-03 + TEST-04)

Total new tests: **18 distinct test methods** (several parameterized via `[DataRow]`; actual test-runtime count is higher). Target total suite count: **≥540 tests** (522 current + 18 new distinct methods; higher with DataRow expansion).

### 6.1 AppSettings JSON round-trip + absent-field tests (`FuzzyClock.App.Tests/AppSettingsTests.cs`)

**Add to the existing `AppSettingsTests` class** — do NOT create a new file. The class is already `[TestClass]` and MSTest discovers new methods automatically.

| # | Method name | Target | Asserts |
|---|-------------|--------|---------|
| 1 | `Deserialize_MissingTempsLineVisible_DefaultsToFalse` | TEST-03 | Absent field → `false` (init default; NOT C# `bool` default — they happen to coincide here, but test documents the init contract) |
| 2 | `Deserialize_MissingTempCpuVisible_DefaultsToTrue` | TEST-03 | Absent field → `true` (init default — critically NOT `false` which IS the C# bool default; this test DOES differ from C# default and exists to protect v4.1 upgrade path) |
| 3 | `Deserialize_MissingTempGpuVisible_DefaultsToTrue` | TEST-03 | Absent field → `true` (same contract as CPU) |
| 4 | `Deserialize_MissingTempMoboVisible_DefaultsToFalse` | TEST-03 | Absent field → `false` |
| 5 | `Deserialize_MissingTempNvmeVisible_DefaultsToFalse` | TEST-03 | Absent field → `false` (amended — **NOT true**; see §2 Drift #1) |
| 6 | `RoundTrip_TempsFields_AllFiveMatch` | TEST-02 | Single test constructs AppSettings with five explicit non-default values, serializes + deserializes, asserts all five match exactly |
| 7 | `RoundTrip_TempsFields_DefaultValues` | TEST-02 | Round-trip default AppSettings; confirm the five new fields survive the round-trip at their defaults |

**Canonical test template** (mirrors the existing `Deserialize_MissingUptimeVisible_DefaultsToTrue` at `AppSettingsTests.cs:91`):

```csharp
[TestMethod]
public void Deserialize_MissingTempCpuVisible_DefaultsToTrue()
{
    // Simulated v4.1-era settings.json — none of the five v4.2 temp fields present.
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsTrue(result.TempCpuVisible,
        "TempCpuVisible should default to true (init default per TEMP-TAB-03), " +
        "NOT false (C# bool default). This protects the v4.1-upgrade path.");
}
```

**Canonical round-trip template** (clones `RoundTrip_FullyPopulated_AllFieldsMatch` at `AppSettingsTests.cs:19`):

```csharp
[TestMethod]
public void RoundTrip_TempsFields_AllFiveMatch()
{
    // Explicit NON-default values to prove the fields serialize and survive deserialization.
    // Flipped from defaults: master ON, CPU OFF, GPU OFF, Mobo ON, NVMe ON.
    var original = new AppSettings
    {
        TempsLineVisible = true,
        TempCpuVisible   = false,
        TempGpuVisible   = false,
        TempMoboVisible  = true,
        TempNvmeVisible  = true,
    };
    string json   = JsonSerializer.Serialize(original);
    var    result = JsonSerializer.Deserialize<AppSettings>(json)!;

    Assert.AreEqual(true,  result.TempsLineVisible, "TempsLineVisible");
    Assert.AreEqual(false, result.TempCpuVisible,   "TempCpuVisible");
    Assert.AreEqual(false, result.TempGpuVisible,   "TempGpuVisible");
    Assert.AreEqual(true,  result.TempMoboVisible,  "TempMoboVisible");
    Assert.AreEqual(true,  result.TempNvmeVisible,  "TempNvmeVisible");
}
```

### 6.2 TemperatureFormatter tests (`FuzzyClock.Core.Tests/TemperatureFormatterTests.cs`)

**NEW file.** Mirrors the shape of `DateFormatterTests` / `UptimeFormatterTests`.

| # | Method name | Target | Input → Expected |
|---|-------------|--------|------------------|
| 1 | `AllSensorsPresent_AllFourVisible_RendersFullLine` | TEST-04 all-sensors-present | `(52, 61, 45, 38, true, true, true, true)` → `"CPU 52°  GPU 61°  Mobo 45°  NVMe 38°"` |
| 2 | `PartialNA_CpuAndNvmeOnly_OmitsGpuAndMobo` | TEST-04 partial-N/A (visibility) | `(52, 61, 45, 38, true, false, false, true)` → `"CPU 52°  NVMe 38°"` |
| 3 | `PartialNA_GpuSensorUnavailable_OmitsGpuSegment` | TEST-04 partial-N/A (sentinel, TEMP-LINE-04) | `(52, -1, -1, 38, true, true, true, true)` → `"CPU 52°  NVMe 38°"` (GPU + Mobo at `-1f` are dropped even when visible) |
| 4 | `AllNA_ReturnsEmptyString` | TEST-04 all-N/A | `(-1, -1, -1, -1, true, true, true, true)` → `""` |
| 5 | `AllHidden_ReturnsEmptyString` | TEST-04 all-N/A (via visibility path) | `(52, 61, 45, 38, false, false, false, false)` → `""` |
| 6 | `SingleSensor_GpuOnly_RendersOneSegment` | TEST-04 single-sensor | `(-1, 61, -1, -1, true, true, true, true)` → `"GPU 61°"` (no trailing separator) |
| 7 | `TwoSpaceSeparator_BetweenSegments_ExactlyTwoSpaces` | TEST-04 2-space separator | `(52, 61, -1, -1, true, true, true, true)` → `"CPU 52°  GPU 61°"` — assert `result.Contains("°  GPU")` AND `!result.Contains("°   GPU")` AND `!result.Contains("° GPU")` |
| 8 | `IntegerRounding_RoundsToNearest` | TEST-04 integer rounding | `[DataRow]` table: `52.4f → "CPU 52°"`, `52.6f → "CPU 53°"`, `52.5f → "CPU 52°"` (banker's), `52.0f → "CPU 52°"`, `99.9f → "CPU 100°"` |

**Implementation template** (the first case — cloned from `DateFormatterTests.Short_ReturnsAbbreviatedDayAndMonth` shape):

```csharp
using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class TemperatureFormatterTests
{
    [TestMethod]
    public void AllSensorsPresent_AllFourVisible_RendersFullLine()
    {
        string result = TemperatureFormatter.Format(
            cpu: 52f, gpu: 61f, mobo: 45f, nvme: 38f,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);
        Assert.AreEqual("CPU 52°  GPU 61°  Mobo 45°  NVMe 38°", result);
    }

    [TestMethod]
    public void AllNA_ReturnsEmptyString()
    {
        string result = TemperatureFormatter.Format(
            -1f, -1f, -1f, -1f,
            cpuVisible: true, gpuVisible: true, moboVisible: true, nvmeVisible: true);
        Assert.AreEqual("", result, "All-NA must return empty string (TEMP-LINE-01 auto-hide contract)");
    }

    [TestMethod]
    [DataRow(52.4f, "CPU 52°")]
    [DataRow(52.6f, "CPU 53°")]
    [DataRow(52.5f, "CPU 52°")]  // MidpointRounding.ToEven (banker's) — 52.5 → 52
    [DataRow(52.0f, "CPU 52°")]
    [DataRow(99.9f, "CPU 100°")]
    public void IntegerRounding_RoundsToNearest(float cpu, string expected)
    {
        string result = TemperatureFormatter.Format(
            cpu, -1f, -1f, -1f,
            cpuVisible: true, gpuVisible: false, moboVisible: false, nvmeVisible: false);
        Assert.AreEqual(expected, result);
    }
}
```

### 6.3 Expected test-count delta

| Source | Test-method count | Runtime-test count (with `[DataRow]`) |
|--------|-------------------|--------------------------------------|
| `AppSettingsTests` additions | 7 methods | 7 runtime tests (no DataRow on these) |
| `TemperatureFormatterTests` | 8 methods | 12 runtime tests (5 DataRow cases on test #8) |
| **Phase 76 total** | **15 methods** | **~19 runtime tests** |

**Baseline:** 522 (per STATE.md). **Target:** ≥541 runtime tests, all green, zero hardware touches, zero `LibreHardwareMonitor` string under `FuzzyClock.Core/` (REL-03 standing invariant).

> NOTE: the `<additional_context>` block in the task briefing said "5 round-trip + 5 absent-field defaults + 8 formatter = 18 total". The finer-grained enumeration above lands at 15 distinct methods (the "5 round-trip" conflates into 2 methods covering all 5 fields — one non-default round-trip + one defaults round-trip — because a single test can assert all five with `Assert.AreEqual` chained calls). The planner may choose to split the round-trip test into five separate methods (one per field) for clearer MSTest output; that would land at 18 distinct methods and 23 runtime tests. Either granularity satisfies TEST-02/03/04.

## 7. Dont-Hand-Roll

Everything Phase 76 needs already exists. This phase should NOT introduce:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON serialization | Custom `JsonConverter` for bools | `System.Text.Json` default handling | Init-property records + built-in bool handling is already the project's pattern; every existing bool field in `AppSettings` round-trips without a custom converter |
| Absent-field defaults | Custom `[JsonDefault]` attribute / post-load patching | Init-property default values on the record | The `Deserialize_Missing*` test family (at least 9 existing instances) proves this works for bool, string, int, enum, and `Dictionary<string, ...>` types — bools specifically round-trip via `JsonSerializer.Deserialize<AppSettings>(json)` with zero additional code |
| String formatting | `StringBuilder` + manual separator tracking | `List<string>` + `string.Join("  ", ...)` | At most 4 segments; Join eliminates trailing-separator bugs; idiomatic in .NET and matches existing Core formatters |
| Degree symbol | Custom encoding step / `°` escape in string | Direct `°` character literal in source | `FuzzyClock.Core.csproj` compiles with UTF-8 source; the repo already has multilingual phrase providers with non-ASCII characters inline (German ä/ö/ü, Japanese kana/kanji, French é/à) — see `FrenchPhraseProvider.cs` etc. |
| Validation guards for new bools | Add cases to `SettingsService.Validate()` | Nothing — rely on existing outer `try/catch` | Bools have no invalid state; adding guard code is pure ceremony with no test-coverage opportunity |
| Parameter object for formatter | Introduce `TempReading` record in Core | Eight `float` / `bool` primitives | Matches `DateFormatter(string, DateTime)` and `UptimeFormatter(TimeSpan)` conventions; eight params is under the rule-of-thumb threshold for a parameter object |

**Key insight:** Phase 76 is a **mechanical-copy phase**. Almost every task has a direct template (usually a few lines below or above in the same file). The planner's job is to match existing patterns precisely, not to innovate.

## 8. Common Pitfalls

### Pitfall 1 — Using C# `bool` default instead of init default

**What goes wrong:** A v4.1 `settings.json` that predates the five new fields is deserialized into an `AppSettings` instance where `TempCpuVisible` is `false` (C# `bool` default) instead of `true` (init default).

**Why it happens:** `System.Text.Json` does NOT re-apply init-property defaults by default unless the JSON omits the property. It uses the RECORD'S init default when the property is absent. But if the deserializer is miswritten — e.g., someone switches to a positional record `public record AppSettings(bool TempCpuVisible)` instead of `public record AppSettings { public bool TempCpuVisible { get; init; } = true; }` — the init default is lost and the C# `bool` default takes over.

**How to avoid:** Use the existing init-property-record pattern (declarative field with `{ get; init; } = true;`). Never switch to a positional record. `MEMORY.md` already warns about this (line on `AppSettings` init-property record — never positional).

**Warning signs:** Any PR that adds `public record AppSettings(..., bool TempCpuVisible, ...)` — reject immediately. Also watch for `[JsonPropertyName]` decoration which has no effect here but is a signal someone is overthinking this.

**Test that catches it:** `Deserialize_MissingTempCpuVisible_DefaultsToTrue` — if someone regresses the record to positional, this test fails immediately because C# `bool` default is `false`.

### Pitfall 2 — Trailing separator in `string.Join` / manual StringBuilder

**What goes wrong:** Formatter output is `"CPU 52°  GPU 61°  "` (trailing double-space) or `"  CPU 52°  GPU 61°"` (leading double-space).

**Why it happens:** Manual `StringBuilder.Append(segment + "  ")` in a loop leaves a trailing separator; prepending requires a "first-iteration" guard that is easy to get wrong.

**How to avoid:** `string.Join("  ", segments)` — `List<string>` + Join eliminates the trailing-separator class of bugs entirely. This is the pattern shown in §4.2.

**Warning signs:** Any formatter implementation using `StringBuilder.Append` or manual `if (result.Length > 0) result += "  "` — reject and rewrite with `List + string.Join`.

**Test that catches it:** `TwoSpaceSeparator_BetweenSegments_ExactlyTwoSpaces` (test #7 in §6.2) asserts exactly two spaces between segments AND no leading/trailing spaces via `result.StartsWith("CPU")` and `result.EndsWith("°")`.

### Pitfall 3 — Truncation instead of rounding

**What goes wrong:** `(int)52.9f == 52` — user sees CPU 52° when the reading is 52.9°C, but reading 53.1°C also shows as 53°. Jitter crossing .5 boundaries is asymmetric.

**Why it happens:** C# `(int)x` cast truncates toward zero; developers reach for the shortest syntax.

**How to avoid:** Always `(int)Math.Round(x)` — banker's rounding (`MidpointRounding.ToEven` by default) matches .NET's format-specifier behavior.

**Warning signs:** Any code path writing `(int)cpu` to a display string (instead of `Math.Round(cpu)` or `{cpu:F0}`).

**Test that catches it:** `IntegerRounding_RoundsToNearest` with `[DataRow(52.6f, "CPU 53°")]` — truncation implementation would return `"CPU 52°"` and fail.

### Pitfall 4 — `FuzzyClock.Core` contamination (REL-03)

**What goes wrong:** The formatter's implementation references `LibreHardwareMonitor.Hardware.ISensor` or imports from that namespace, breaking REL-03's pure-Core invariant before Phase 80 wires the CI grep gate.

**Why it happens:** Developer reaches for a convenient `ISensor? cpu` parameter instead of writing a typed float.

**How to avoid:** The formatter's signature is floats and bools only (§4.2). NEVER reference `ISensor` or any `LibreHardwareMonitor.*` type in the Core project. Verify structurally: `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` must return nothing — same invariant that Phase 75 Plan 02 preserved. The manual check is one command.

**Warning signs:** Any `using LibreHardwareMonitor.Hardware;` in `FuzzyClock.Core/` source. Any `ISensor` parameter in a Core method signature. Any `PackageReference Include="LibreHardwareMonitorLib"` in `FuzzyClock.Core.csproj`.

**Test that catches it:** Compile-time break — `FuzzyClock.Core` has no LHM reference, so referencing any LHM type fails `dotnet build`. Plus the structural grep in the verify step of each plan.

### Pitfall 5 — Missing `using System.Collections.Generic;` for `List<string>`

**What goes wrong:** `FuzzyClock.Core.csproj` has `ImplicitUsings=enable`, so `List<T>` is available via the implicit `Microsoft.NET.Sdk` using set. But if someone copies the code into a project that doesn't have implicit usings (e.g., a future `FuzzyClock.Core.Benchmarks` project), the build fails.

**How to avoid:** Either (a) rely on implicit usings — correct today — OR (b) add an explicit `using System.Collections.Generic;` to `TemperatureFormatter.cs`. Research recommends option (a) to match the existing Core file conventions (`DateFormatter.cs`, `UptimeFormatter.cs` do not have explicit `using` statements beyond `namespace FuzzyClock.Core;`).

**Warning signs:** Compile error `CS0246: The type or namespace name 'List<>' could not be found`.

### Pitfall 6 — Off-by-one in all-hidden vs all-NA

**What goes wrong:** Returning `" "` (single space, trailing artifact from `string.Join`) when all segments are suppressed, instead of `""`.

**Why it happens:** `string.Join("  ", emptyList)` returns `""` natively — **this is correct**. But a manual StringBuilder implementation might leave one space in the buffer if the "first iteration" guard is inverted.

**How to avoid:** Stick with `List + string.Join` (§4.2). Never initialize the buffer with a separator.

**Warning signs:** `StringBuilder` in the formatter implementation; any initialization that starts with `"  "`.

**Test that catches it:** `AllNA_ReturnsEmptyString` and `AllHidden_ReturnsEmptyString` — both assert `Assert.AreEqual("", result)`. A single-space bug would fail both.

## 9. Code Examples

### 9.1 AppSettings field additions (pattern-matched to existing lines)

Reference:  `FuzzyClock.App/AppSettings.cs:11-48` (existing record body)

```csharp
// Existing pattern (line 16-23 today, for comparison):
public bool CpuVisible { get; init; } = true;
public bool GpuVisible { get; init; } = true;
...
public bool UptimeVisible { get; init; } = true;

// New additions (match exactly):
public bool TempsLineVisible { get; init; } = false;
public bool TempCpuVisible   { get; init; } = true;
public bool TempGpuVisible   { get; init; } = true;
public bool TempMoboVisible  { get; init; } = false;
public bool TempNvmeVisible  { get; init; } = false;
```

### 9.2 Absent-field deserialization test (pattern-matched to existing test)

Reference: `FuzzyClock.App.Tests/AppSettingsTests.cs:91-102` (`Deserialize_MissingUptimeVisible_DefaultsToTrue`)

```csharp
// Pattern to clone for each of the five new fields:
[TestMethod]
public void Deserialize_MissingTempCpuVisible_DefaultsToTrue()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsTrue(result.TempCpuVisible,
        "TempCpuVisible should default to true when absent from JSON (init default per TEMP-TAB-03)");
}
```

### 9.3 Pure Core formatter (pattern-matched to `DateFormatter`)

Reference: `FuzzyClock.Core/DateFormatter.cs` (whole file, 20 lines)

```csharp
// DateFormatter's one-method style — clone exactly:
namespace FuzzyClock.Core;

public static class DateFormatter
{
    public static string Format(string format, DateTime date) => format switch
    {
        "Long"    => date.ToString("dddd, MMMM d"),
        "Numeric" => date.ToString("M/d/yyyy"),
        "ISO"     => date.ToString("yyyy-MM-dd"),
        _         => date.ToString("ddd, MMM d"),
    };
}

// TemperatureFormatter follows the same structural discipline:
// - namespace FuzzyClock.Core;
// - public static class
// - single public static Format method
// - no state, no constructor, no fields
```

### 9.4 Test class skeleton (pattern-matched to `DateFormatterTests`)

Reference: `FuzzyClock.Core.Tests/DateFormatterTests.cs` (whole file, 52 lines)

```csharp
using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class TemperatureFormatterTests
{
    // Section comments mirror DateFormatterTests structure:
    // ----- All sensors present -----
    // ----- Partial N/A (visibility) -----
    // ----- Partial N/A (sentinel) -----
    // ----- All N/A -----
    // ----- Single sensor -----
    // ----- Separator discipline -----
    // ----- Integer rounding ([DataRow]) -----
}
```

## 10. State of the Art

Phase 76 is a **pattern-maintenance phase** — there is no "state of the art" beyond what FuzzyClock already does. The project's own conventions define the target:

| Old / External Approach | Project Convention | Used By |
|-------------------------|--------------------|---------|
| `Dictionary<string, bool>` "options bag" | Explicit init-property `bool` per field on `AppSettings` | Every visibility toggle since v1.0 |
| Custom JSON converter for per-field defaults | Init-property default value in the record | Every field in `AppSettings` |
| WPF-coupled formatter in the App layer | Pure static in `FuzzyClock.Core` (net10.0, zero UI refs) | `DateFormatter`, `UptimeFormatter`, `PhraseWrapService`, `SevenSegmentEncoder`, `ContrastService` |
| `null` / `float?` to denote "no reading" | `-1f` sentinel on `float` (chosen by STATS v1.6; extended to batteries in v3.1; extended to temps in Phase 75) | `StatsService.GpuPercent` / `PagPercent` / `BatteryPercent`; `TemperatureService.{Cpu,Gpu,Mobo,Nvme}TempC` |

**Deprecated / non-goals for Phase 76:**
- Do NOT introduce `Nullable<T>` on the formatter's float params — the `-1f` sentinel is the project's convention (MEMORY).
- Do NOT introduce a `TempReading` record wrapper — §4.5.
- Do NOT introduce a Fahrenheit / per-core / threshold-alert parameter — all explicitly out of scope per REQUIREMENTS.md Future Requirements.

## 11. Open Questions

### 11.1 Round-trip test granularity — 2 tests vs 5 tests?

**What we know:** The `<additional_context>` in the phase briefing says "5 round-trip" (one per field). Research §6.1 proposed 2 round-trip methods (one non-default, one defaults). Both satisfy TEST-02's "all five new fields" requirement.

**What's unclear:** whether the planner prefers finer-grained MSTest output (5 methods → 5 distinct test-explorer rows naming each field) or conciseness (2 methods covering all 5 fields via chained `Assert.AreEqual`).

**Recommendation:** **5 methods.** Clearer MSTest output makes CI failure messages self-identifying ("`RoundTrip_TempCpuVisible_Matches` failed at line X"). The 3 extra methods are one-liners around `JsonSerializer.Serialize + Deserialize + Assert.AreEqual`. Trivial cost, better diagnostic value. This bumps the test-method count from 15 to 18 distinct methods (matching the briefing's stated "18 total"), and the runtime count to ~22.

### 11.2 Should the formatter also expose segment count for UI?

**What we know:** Phase 79 may want to know "how many segments were rendered" for layout decisions (e.g., narrow line → wrap; wide line → single-line).

**What's unclear:** whether surfacing a secondary API (`TemperatureFormatter.FormatWithSegmentCount`) is worth adding now or deferring to Phase 79.

**Recommendation:** **defer.** YAGNI — nothing in REQUIREMENTS.md says the widget needs segment count for layout. Phase 79 can add an overload or a sibling method if needed; until then, the widget can count segments locally via `line.Split("  ")` if required.

### 11.3 Banker's rounding vs round-half-up?

**What we know:** `(int)Math.Round(x)` uses `MidpointRounding.ToEven` (banker's) by default. 52.5 → 52, 51.5 → 52, 53.5 → 54. Users might find this surprising.

**What's unclear:** whether the planner wants `MidpointRounding.AwayFromZero` (traditional "round half up") instead — would match Excel's rounding behavior and be more predictable for users ("52.5 always rounds to 53").

**Recommendation:** **banker's (default).** Temperature readings on silicon are rarely at the .5 boundary because LHM returns floats with multiple decimal places of precision — 52.4732 → 52 regardless of rounding mode; 52.5001 → 53 regardless; only the vanishingly rare exactly-.5 case differs. Banker's is the .NET default and matches every other `Math.Round` call in the codebase. If a user reports seeing "52°" when the hex reading says 52.5, consider switching to `MidpointRounding.AwayFromZero` in a later milestone; don't over-engineer today.

**Test that documents the choice:** `[DataRow(52.5f, "CPU 52°")]` — explicitly asserts banker's behavior. If the planner chooses `AwayFromZero`, change the expected value to `"CPU 53°"`. The choice is documented, not hidden.

### 11.4 Should `SettingsService.Defaults()` be updated for symmetry?

**What we know:** `Defaults()` explicitly lists older visibility fields (`CpuVisible = true`, `GpuVisible = true`, etc.) at `SettingsService.cs:137-158`. The new five fields will default correctly without being listed there (§3.4), but the older-convention-by-listing-everything has some documentation value.

**What's unclear:** whether the planner prefers (a) adding five lines to `Defaults()` for symmetry or (b) relying solely on init-property defaults.

**Recommendation:** **add the five lines to `Defaults()`** for symmetry with the existing stats-visibility fields. The cost is five lines of identical-looking assignment; the benefit is that `Defaults()` remains a single searchable point for "what are the documented defaults of the record." This is a style preference — both options pass the tests. If the planner prefers the minimal-change option, omitting them is equally correct.

## 12. Sources

### Primary (HIGH confidence — directly read during research)

- `FuzzyClock.App/SettingsService.cs` — complete file; lines 18-66 (Load), 72-127 (Validate), 137-158 (Defaults)
- `FuzzyClock.App/AppSettings.cs` — complete file; lines 11-48 (record body) for the field-insertion template
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — complete file (229 lines); lines 19-85 (round-trip pattern), 91-102 (absent-field pattern), 130-147 (the closest ShowDate/DateFormat precedent)
- `FuzzyClock.App.Tests/SettingsServiceTests.cs` — complete file (218 lines); for Validate-pattern confirmation (no new guards needed)
- `FuzzyClock.Core/DateFormatter.cs` — complete file (20 lines); the Core-static template
- `FuzzyClock.Core/UptimeFormatter.cs` — complete file (17 lines); alternate Core-static template
- `FuzzyClock.Core.Tests/DateFormatterTests.cs` — complete file (52 lines); the Core-test template
- `FuzzyClock.Core.Tests/UptimeFormatterTests.cs` — complete file (58 lines); DataRow-heavy Core-test template
- `FuzzyClock.App.Tests/FakeTempSource.cs` — complete file (24 lines); confirms defaults for cross-check with TEMP-TAB-03 amendment
- `FuzzyClock.App/ITempSource.cs` — complete file (29 lines); confirms `-1f` sentinel convention at the boundary Phase 76 consumes
- `.planning/REQUIREMENTS.md` — Phase 76 requirements TEST-01..04, TEMP-TAB-02, TEMP-TAB-03 (amended), TEMP-LINE-02/03/04
- `.planning/STATE.md` — 522 test baseline confirmation, TEMP-TAB-03 amendment provenance, 75-02 SUMMARY reference
- `.planning/ROADMAP.md` — Phase 76 success criteria (where drift exists — flagged in §2)
- `.planning/config.json` — `nyquist_validation: false` (confirms §5 skip)
- `.planning/phases/75-hardware-discovery-spike-temperatureservice/75-02-PLAN.md` — Phase 75 execution artifact for test-discipline cross-reference
- `.planning/phases/75-hardware-discovery-spike-temperatureservice/75-RESEARCH.md` — Phase 75 research (the template this RESEARCH.md shape follows)
- `FuzzyClock.Core/FuzzyClock.Core.csproj` — confirms zero LHM references, zero external PackageReference entries, `net10.0` target
- `FuzzyClock.App.Tests/FuzzyClock.App.Tests.csproj` — confirms MSTest 4.0.1 + `net10.0-windows` + `UseWPF=true`
- `FuzzyClock.Core.Tests/FuzzyClock.Core.Tests.csproj` — confirms MSTest 4.0.1 + `net10.0`

### Secondary (MEDIUM-HIGH — referenced but not re-verified live)

- `.planning/spikes/75-hardware-discovery.md` — §1 (hardware baseline, NVMe absence confirmation driving TEMP-TAB-03 amendment)
- `.planning/phases/75-hardware-discovery-spike-temperatureservice/75-02-SUMMARY.md` — referenced via Plan 75-02 execution artifact chain
- `C:\src\FuzzyStatsClock\CLAUDE.md` — project instruction: no Co-Authored-By trailer in commits

### Tertiary (not consulted — explicitly out of scope)

- Context7 / official `System.Text.Json` docs — not consulted because the JSON round-trip pattern is already proven in 15+ existing tests in `AppSettingsTests.cs`; re-verifying from first principles is pure ceremony
- `MidpointRounding` Microsoft docs — the .NET default is ECMA-335-blessed and universally stable; researching further would not change the recommendation in §11.3

## 13. Metadata

**Confidence breakdown:**
- AppSettings extension: **HIGH** — 15+ identical-pattern tests already exist; every mechanic is proven
- TemperatureFormatter API: **HIGH** — `DateFormatter`/`UptimeFormatter` are structurally identical templates; signature and behavior fully specified by TEMP-LINE-02/03/04
- Test roster: **HIGH** — every test has a direct template in the same or sibling test file
- Drift flagging (§2): **HIGH** — REQUIREMENTS.md commit `b2163d1` and STATE.md Active TODOs both confirm the NVMe amendment; ROADMAP is demonstrably out of date
- Open questions (§11): **MEDIUM** — genuine stylistic / granularity tradeoffs; either answer passes the tests

**Research date:** 2026-05-04
**Valid until:** Phase 76 completion. Nothing in this research depends on external library versions, so it does not expire on time — only on code churn that removes the templates (none expected before Phase 80).

## RESEARCH COMPLETE
