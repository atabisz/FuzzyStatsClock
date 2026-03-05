---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - FuzzyClock.App/MainWindow.xaml.cs
autonomous: true
requirements:
  - QUICK-01
must_haves:
  truths:
    - "Changing the process threshold via tray menu immediately reflects in the uptime display without waiting for the next tick"
    - "The comment describing the process count logic refers to the configurable threshold, not a hardcoded 5%"
  artifacts:
    - path: "FuzzyClock.App/MainWindow.xaml.cs"
      provides: "SetProcessThreshold calls UpdateStatsDisplay after saving; comment at line 470 is accurate"
  key_links:
    - from: "SetProcessThreshold"
      to: "UpdateStatsDisplay"
      via: "direct method call at end of SetProcessThreshold body"
      pattern: "UpdateStatsDisplay\\(\\)"
---

<objective>
Fix two related issues in SetProcessThreshold:
1. After updating `_processCountThreshold` and saving settings, call `UpdateStatsDisplay()` so the uptime line recounts active processes against the new threshold immediately — no stale display until the next timer tick.
2. Fix the stale comment at line 470 that hardcodes "5%" — it should reference the configurable `_processCountThreshold` field.

Purpose: Keeps displayed process count in sync with the threshold the user just selected, and keeps the code comment accurate.
Output: Modified MainWindow.xaml.cs with one method call added and one comment fixed.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add UpdateStatsDisplay() call and fix stale comment</name>
  <files>FuzzyClock.App/MainWindow.xaml.cs</files>
  <action>
Two edits to MainWindow.xaml.cs:

1. At line 470, replace the comment:
   ```
   // Count processes with >= 5% CPU utilization by comparing TotalProcessorTime deltas.
   ```
   with:
   ```
   // Count processes with >= _processCountThreshold% CPU utilization by comparing TotalProcessorTime deltas.
   ```
   (The threshold is now configurable; the hardcoded "5%" is stale.)

2. In SetProcessThreshold (currently lines 577-581), add UpdateStatsDisplay() after SaveSettings():
   ```csharp
   private void SetProcessThreshold(double threshold)
   {
       _processCountThreshold = threshold;
       SaveSettings();
       UpdateStatsDisplay();
   }
   ```
   This matches the pattern used by SetStatsInterval (which also calls UpdateStatsDisplay after saving) and ensures the uptime line reflects the new threshold immediately without waiting for the next timer tick.
  </action>
  <verify>
    <automated>cd "C:/src/FuzzyStatsClock" && dotnet build FuzzyClock.App/FuzzyClock.App.csproj --no-restore -v quiet 2>&1 | tail -5 && dotnet test --no-build -v quiet 2>&1 | tail -10</automated>
  </verify>
  <done>Build succeeds, all 88 tests pass, SetProcessThreshold ends with UpdateStatsDisplay(), comment at line 470 references _processCountThreshold not 5%.</done>
</task>

</tasks>

<verification>
- `dotnet build` exits 0 with no errors
- `dotnet test` reports 88 passed, 0 failed
- `grep -n "UpdateStatsDisplay" FuzzyClock.App/MainWindow.xaml.cs` shows a call inside SetProcessThreshold
- `grep -n "5% CPU" FuzzyClock.App/MainWindow.xaml.cs` returns no results (stale comment removed)
</verification>

<success_criteria>
SetProcessThreshold updates _processCountThreshold, saves settings, and immediately refreshes the uptime display. The comment in UpdateStatsUptime accurately describes the configurable threshold. All 88 tests continue to pass.
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-call-updatestatsdisplay-at-end-of-se/1-SUMMARY.md`
</output>
