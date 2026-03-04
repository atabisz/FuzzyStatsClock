# Phase 34: Uptime Process Count + README - Research

**Researched:** 2026-03-04
**Domain:** C# WPF codebase verification + Markdown documentation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Process count behavior
- Count shows only processes with **>=5% CPU utilization** (not total process count)
- Uses delta of `TotalProcessorTime` between consecutive ticks, divided by elapsed time x `ProcessorCount`
- First tick yields 0 (no prior baseline) — this is acceptable; subsequent ticks show accurate active count
- Format stays as `{N}p` — no qualifier suffix or label change. The number speaks for itself.
- Processes that exit between ticks or deny access are silently skipped (try/catch per-process)

#### Process count display position
- Appended at the end of the uptime line, same as before: `up 5h 3m   0.52  0.47  0.43  7p`
- No layout or spacing changes to the uptime TextBlock

#### README coverage (DOCS-01)
- Must include all v2.7-era features: ghost mode, auto-contrast, tray controls, accent colors, window opacity, uptime row, auto-launch at login, per-monitor position memory
- Process count in the uptime row must be described accurately as **active processes (>=5% CPU)**, not total process count
- Prose style — no screenshots required. Code examples not needed for a UI app.

#### README interaction modes (DOCS-02)
- Three modes documented: right-click context menu, mouse interactions (drag + scroll wheel), system tray controls
- Each mode gets its own subsection so users can find what they need

### Claude's Discretion
- Exact wording and heading structure of README sections
- Whether to include a feature table or bullet list
- README intro/tagline

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROC-01 | Uptime line shows count of active processes appended as `{N}p` at the end of the line (e.g. `up 5h 3m   0.52  0.47  0.43  142p`) | Implementation already exists in `UpdateUptimeDisplay()` — verify it is complete and correct |
| DOCS-01 | README accurately describes current app features (ghost mode, auto-contrast, tray controls, accent colors, opacity, uptime row, auto-launch, per-monitor position memory) | README features section mostly complete; uptime row description already mentions `142p` example; minor accuracy check needed |
| DOCS-02 | README usage section covers right-click context menu, mouse interactions (drag, scroll wheel), and system tray controls | All three subsections already exist; "right-click menu is the primary UI surface" wording is stale since v2.4 moved primary controls to tray |
</phase_requirements>

## Summary

Phase 34 is a verification and formalization phase — both deliverables (PROC-01 process count and DOCS-01/02 README) are already substantially implemented in the codebase. The plan is to confirm correctness, fix the one known stale wording issue in the README, and close the requirements.

The PROC-01 implementation is fully present in `UpdateUptimeDisplay()` in `MainWindow.xaml.cs` (lines 430-498). The method calls `System.Diagnostics.Process.GetProcesses()`, computes CPU-utilization deltas against `_prevProcTimes`, counts processes at >=5% CPU, and formats the result as `{procCount}p` appended to the uptime string. Process objects are disposed via `finally { p.Dispose(); }`. The update fires on every `_statsTimer.Tick`. All format and logic requirements from CONTEXT.md match the current code exactly.

The README is largely accurate and complete for DOCS-01 and DOCS-02. The one confirmed stale statement is line 59: `"The right-click menu is the primary UI surface"` — this became inaccurate in v2.4 when the right-click context menu was removed and all settings moved to the system tray. The tray icon and its controls are now the primary UI surface. All eight feature bullets required by DOCS-01 are present, and all three interaction mode subsections required by DOCS-02 are present.

**Primary recommendation:** Confirm PROC-01 implementation is intact (read and verify `UpdateUptimeDisplay()`), then fix the single stale README line about right-click being the "primary UI surface" and verify all DOCS-01/02 checklist items are accurate.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Diagnostics.Process` | .NET 10 BCL | Process enumeration and CPU time sampling | Built-in, no dependencies, covers all Windows processes |
| MSTest | 4.0.1 | Test runner for 88-test suite | Already established in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Environment.ProcessorCount` | .NET 10 BCL | Normalize CPU time delta to 0-100% per-process | Required for correct multi-core utilization math |
| `Dictionary<int, TimeSpan>` | .NET 10 BCL | Previous-tick CPU time snapshot per PID | Enables delta computation between ticks |

**Installation:** No new packages required — all APIs are in .NET 10 BCL.

## Architecture Patterns

### Existing Pattern: Inline Process Count in UpdateUptimeDisplay()

**What:** Process enumeration, CPU delta computation, and active-count formatting are all inline in `UpdateUptimeDisplay()` in `MainWindow.xaml.cs`.

**When to use:** For small, tightly coupled, single-use logic that does not warrant a Core class or separate service.

**Current implementation (verified from source):**
```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs lines 465-498
var now = DateTime.UtcNow;
var procs = System.Diagnostics.Process.GetProcesses();
var newProcTimes = new Dictionary<int, TimeSpan>(procs.Length);
int procCount = 0;
double elapsedMs = _prevProcSample == DateTime.MinValue
    ? 0
    : (now - _prevProcSample).TotalMilliseconds;
foreach (var p in procs)
{
    try
    {
        var cpuTime = p.TotalProcessorTime;
        newProcTimes[p.Id] = cpuTime;
        if (elapsedMs > 0 && _prevProcTimes.TryGetValue(p.Id, out var prev))
        {
            double pct = (cpuTime - prev).TotalMilliseconds
                         / (elapsedMs * Environment.ProcessorCount) * 100.0;
            if (pct >= 5.0) procCount++;
        }
    }
    catch { /* process exited or access denied — skip */ }
    finally { p.Dispose(); }
}
_prevProcTimes = newProcTimes;
_prevProcSample = now;

string newText = $"{uptimeStr}   {avg1m / 100f:F2}  {avg5m / 100f:F2}  {avg15m / 100f:F2}  {procCount}p";
```

**Status:** Implementation matches all CONTEXT.md requirements exactly. No code changes required for PROC-01.

### README Structure Pattern

**What:** Minimal markdown with bullet lists for features and tables for usage interactions. No screenshots, no marketing copy.

**Current structure (verified):**
```
README.md
├── # Fuzzy Clock           (intro paragraph)
├── ## Features             (bullet list — all v2.7 features present)
├── ## Requirements         (Windows + .NET version)
├── ## Build                (dotnet build command)
├── ## Run                  (dotnet run command)
├── ## Test                 (dotnet test + count)
├── ## Usage
│   ├── ### Right-click context menu   (table)
│   ├── ### Mouse interactions          (table)
│   └── ### System tray                (list)
├── ## Project Structure    (tree diagram)
├── ## Settings File        (path + description)
└── ## Planning Docs        (table of .planning files)
```

### Anti-Patterns to Avoid
- **Do not refactor PROC-01 into a Core class:** The CONTEXT.md explicitly locks the inline implementation pattern. The computation is not shared anywhere else.
- **Do not restructure README sections:** Only fix the stale wording on line 59. Do not add marketing copy, screenshots, or new top-level sections.
- **Do not describe process count as "total process count":** Must be described as "active processes (>=5% CPU)" per CONTEXT.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process CPU utilization | Custom kernel/WMI polling | `Process.TotalProcessorTime` delta | BCL, reliable, already in use |
| Process disposal | Manual GC nudges | `p.Dispose()` in finally block | Already correct in codebase |

**Key insight:** The implementation is already correct. The research job is to verify it, not replace it.

## Common Pitfalls

### Pitfall 1: Describing process count as total process count
**What goes wrong:** README or comments say "total process count" instead of "active processes (>=5% CPU)"
**Why it happens:** The variable is named `procCount` which is ambiguous
**How to avoid:** README uptime row description must say "active process count" and the existing `142p` example is already there
**Warning signs:** Any mention of "total" near process count in README

### Pitfall 2: Stale "primary UI surface" claim in README
**What goes wrong:** README line 59 says "The right-click menu is the primary UI surface" — inaccurate since v2.4 when all settings moved to the system tray
**Why it happens:** README was not updated when right-click menu was removed in v2.4
**How to avoid:** Change the introductory sentence for the Right-click context menu section. The tray controls subsection confirms tray is now primary. Right-click menu is now a supplementary surface for mode/display settings.
**Warning signs:** `grep "primary UI" README.md` returns a match

### Pitfall 3: Missing Process.Dispose() causing handle leak
**What goes wrong:** Process objects are never disposed; each GetProcesses() call returns handles that stay open
**Why it happens:** Forgetting the finally block
**Current state:** Already correct — `finally { p.Dispose(); }` is present

### Pitfall 4: Using TickCount (Int32) instead of TickCount64 (Int64)
**What goes wrong:** Uptime wraps to zero at ~24.9 days
**Current state:** Already correct — `Environment.TickCount64` is used for uptime

## Code Examples

### Verified PROC-01 output format
```
up 5h 3m   0.52  0.47  0.43  142p
```
- `up 5h 3m` — uptime via `UptimeFormatter.Format(uptime)`
- `0.52  0.47  0.43` — rolling 1m/5m/15m CPU load averages (0-1.00 scale)
- `142p` — active process count (processes with >=5% CPU utilization)

### README stale wording to fix (line 59)
```
BEFORE: "The right-click menu is the primary UI surface:"
AFTER:  "The right-click menu provides quick access to display settings:"
        (or similar — exact wording is Claude's discretion per CONTEXT.md)
```

### README uptime feature bullet (already correct — do not change)
```markdown
- **Uptime row** — system uptime (`up 5h 3m`), rolling 1m/5m/15m CPU load averages,
  and active process count (`142p`) in a single compact line
```

## State of the Art

| Feature | Status | Notes |
|---------|--------|-------|
| PROC-01 process count | Already implemented | `UpdateUptimeDisplay()` lines 465-498 |
| DOCS-01 feature coverage | Mostly complete | All 8 features present in README |
| DOCS-02 interaction modes | Mostly complete | All 3 subsections present; one stale phrase |
| README "primary UI" claim | Stale since v2.4 | Line 59 needs update |

**What changed in v2.4:** Right-click context menu was removed as primary surface; all settings moved to system tray. The context menu still exists for display-mode settings (Font Size, Dial Face, Stats, Accent Color, Opacity, Mode toggle) but tray controls (Ghost Mode, Auto-Contrast, Auto-Launch, Reset, Quit) are the primary persistent settings surface.

## Open Questions

1. **Exact rewording of README line 59**
   - What we know: "primary UI surface" is factually stale since v2.4
   - What's unclear: Best replacement phrase that accurately characterizes what the right-click menu still does (display and layout settings)
   - Recommendation: CONTEXT.md marks exact wording as Claude's discretion — the executor should choose minimal-change wording that is accurate without restructuring the section

## Sources

### Primary (HIGH confidence)
- Direct code read: `FuzzyClock.App/MainWindow.xaml.cs` lines 430-499 — `UpdateUptimeDisplay()` implementation verified
- Direct code read: `README.md` lines 1-123 — all feature bullets and usage subsections verified
- Direct code read: `FuzzyClock.App/TrayMenuBuilder.cs` — tray menu structure confirmed (Ghost Mode, Auto-Launch, Auto-Contrast, Reset to Defaults, Opacity, Theme, Stats all in tray)
- `.planning/phases/34-uptime-process-count-readme/34-CONTEXT.md` — locked decisions verified against code

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — confirms "Both Phase 34 features are already implemented" as of 2026-03-04

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are BCL, already in use, no new dependencies
- Architecture: HIGH — verified directly from source files
- Pitfalls: HIGH — stale README wording confirmed by direct grep; process disposal confirmed correct

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable — no external dependencies to drift)
