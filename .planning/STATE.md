---
gsd_state_version: 1.0
milestone: v3.3
milestone_name: LCD Tech Debt Cleanup
status: in_progress
stopped_at: Completed 53-01-PLAN.md
last_updated: "2026-03-10T20:43:26.611Z"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 10
  completed_plans: 10
  percent: 80
---

---
gsd_state_version: 1.0
milestone: v3.3
milestone_name: LCD Clock
status: in_progress
stopped_at: Milestone planning complete
last_updated: "2026-03-10T00:00:00Z"
last_activity: 2026-03-10 — v3.3 LCD Clock milestone started; REQUIREMENTS.md + ROADMAP phases 48-52 written
progress:
  [████████░░] 80%
  completed_phases: 0
  total_plans: 5
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v3.3 LCD Clock — Phase 48

## Current Position

Milestone v3.3 planning complete. Ready to execute Phase 48 (ClockType Enum Migration).

Previous milestone: v3.3 inherits 224 tests (199 Core + 25 App) from v3.2.

## Accumulated Context

### Decisions

- LCD segments drawn with WPF Polygons (no font assets/bitmaps)
- Ghost segments required (dimmed, not hidden)
- `bool DialMode` → `ClockType` enum migration done first as isolated phase to keep tests green
- `SevenSegmentEncoder` lives in FuzzyClock.Core (pure logic, testable)
- WPF controls (`SevenSegmentDigit`, `LcdClockView`) live in FuzzyClock.App/Controls/
- LCD theme system is independent of the existing named-theme system
- Nixie-style is backlog (out of scope for v3.3)
- [Phase 48-clocktype-enum-migration]: ClockType serializes as string via JsonStringEnumConverter; DialMode->ClockType migration in Load()
- [Phase 49-sevensegmentencoder]: Assert.Throws<T>() is the correct MSTest 4.x API; Assert.ThrowsException<T>() removed in MSTest 4.0
- [Phase 49-sevensegmentencoder]: SevenSegmentEncoder in FuzzyClock.Core as static class; colon maps to 0x80 sentinel (not a segment bit)
- [Phase 50-01]: WPF/WinForms type aliases (WpfUserControl, WpfRectangle, WpfPoint) used in SevenSegmentDigit to resolve CS0104 ambiguity in mixed UseWPF+UseWindowsForms project
- [Phase 50-01]: SevenSegmentDigit background rect width updated alongside RootCanvas.Width on colon slot to prevent background bleed
- [Phase 50-wpf-segment-controls]: DispatcherTimer starts only via IsVisibleChanged, never in constructor — prevents timer leak if control created but never shown
- [Phase 50-wpf-segment-controls]: Visibility.Collapsed (not Hidden) for seconds slots when ShowSeconds=false — ensures StackPanel width is correct for HH:MM mode
- [Phase 51-app-integration]: LCD foundation wired: LcdClockView in MainWindow with three-way SetClockType, timer guard, and SettingsWindow/tray integration. IsVisibleChanged drives timer, not UpdateTime(). FontSizeToLcdSize maps 16->Small, 24->Medium, 32+->Large.
- [Phase 51-app-integration]: TrayMenuCallbacks.SetClockType is required (not optional) — consistent with all other callbacks in the record
- [Phase 51-app-integration]: LCD rows in SettingsWindow show/hide as a unit via SetLcdRowsVisible() — never toggled individually
- [Phase 52-tests-readme]: Test count updated to 237 (212 Core + 25 App) based on actual dotnet test output
- [Phase 52-tests-readme]: LcdTimeFormatHelper changed from internal to public static class — pure logic helper, test access requires public modifier
- [Phase 52-tests-readme]: LcdSize added with JsonStringEnumConverter for string serialization consistency with LcdTheme
- [Phase 52-tests-readme]: README test count corrected to 245 (212 Core + 33 App) to match post-52-01 dotnet test output
- [Phase 53-v3-3-lcd-tech-debt-cleanup]: LcdSize derived via FontSizeToLcdSize in SaveSettings() and GetCurrentSettingsSnapshot() — no backing field, consistent with existing call sites
- [Phase 53-v3-3-lcd-tech-debt-cleanup]: SettingsSnapshot.LcdSize defaults to LcdSize.Medium matching AppSettings record default

### Pending Todos

None.

### Blockers/Concerns

- Phase 46: Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended.
- ResetToDefaults() does not reset `_currentPhraseStyle` or `_currentPhraseLocale` — minor inconsistency, not a requirement violation.

## Session Continuity

Last session: 2026-03-10T20:43:26.607Z
Stopped at: Completed 53-01-PLAN.md
Resume: `/gsd:plan-phase 48` to start execution
