---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Expanded Experience
status: in_progress
stopped_at: Completed 47-01-PLAN.md
last_updated: "2026-03-09T05:30:25.515Z"
last_activity: 2026-03-09 — Phase 42 Plan 03 complete; Settings window fully operational
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 16
  completed_plans: 16
---

---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Expanded Experience
status: in_progress
stopped_at: Completed 42-03-PLAN.md
last_updated: "2026-03-09T00:00:00Z"
last_activity: 2026-03-09 — Phase 42 Plan 03 complete; Settings window wired end-to-end, tray pruned
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 15
  completed_plans: 7
  percent: 47
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 42 — Settings Window Infrastructure

## Current Position

Phase: 47 of 47 (Tech Debt Cleanup)
Plan: 1 of 1 complete in current phase
Status: Phase 47 complete — v3.2 tech debt cleanup done
Last activity: 2026-03-09 — Phase 47 Plan 01 complete; three surgical tech debt edits applied

Progress: [██████████] 95% (v3.2: 19/20 plans complete)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v3.2:

- Settings Window: modeless (`Show()` not `ShowDialog()`); `Owner=MainWindow`; fires `SettingsChanged` event; MainWindow subscribes; never writes AppSettings directly
- Settings/tray sync: populate-on-open strategy — values shown are those at time of window open; no live sync back to window when tray changes
- Battery alert: configurable threshold (10%/15%/20%, default 20%) with enabled toggle; both `ApplyTheme()` and `ApplyDisplayColor()` must guard with `_batteryAlertActive`
- Phrase styles: English-only for v3.2; Phrase Style selector disabled in Settings window when non-English language is active
- Multilingual: `CultureInfo.CurrentUICulture` (not `CurrentCulture`); Japanese `GetStructuredPhrase` returns `("", fullPhrase)` fallback for all non-English
- Phase 41 first: highest-risk Core change (51 phrase tests); regression isolation before any MainWindow work
- [Phase 41]: IPhraseProvider holds only provider concerns; SetLocale/CurrentLocale stay on PhraseEngine as coordinator
- [Phase 41]: EnglishPhraseProvider is public (not internal) to allow direct construction in future isolation tests
- [Phase 41]: [TestCleanup] required for static class tests: PhraseEngine state persists across test methods; cleanup resets locale to en-classic
- [Phase 42-settings-window-infrastructure]: PhraseStyle and TextStyle kept separate: PhraseStyle governs vocabulary (Classic/Terse/Poetic/Rude); TextStyle governs layout (Classic/Split/Literary/Mono)
- [Phase 42-settings-window-infrastructure]: SettingsSnapshot: immutable record passed to SettingsWindow constructor; changes flow out via events, nothing flows back in (populate-on-open strategy)
- [Phase 42]: PhraseStyle and TextStyle are separate dimensions: TextStyle governs text layout (Classic/Split/Literary/Mono); PhraseStyle governs phrase vocabulary (Classic/Terse/Poetic/Rude in Phase 45)
- [Phase 42]: SettingsSnapshot is an immutable populate-on-open constructor-arg record; changes flow OUT via events, never back IN
- [Phase 42-settings-window-infrastructure]: SettingsWindow public/internal split: class is public (XAML codegen requirement), constructor is internal (SettingsSnapshot is internal)
- [Phase 42-settings-window-infrastructure]: Color alias pattern required when UseWindowsForms=true: use 'using Color = System.Windows.Media.Color' to resolve System.Drawing.Color ambiguity
- [Phase 42]: SettingsWindow must be public (not internal) — XAML codegen generates public partial class; constructor is internal to avoid CS0051 with internal SettingsSnapshot
- [Phase 42]: Color using-alias required in SettingsWindow.xaml.cs: UseWindowsForms=true imports System.Drawing which also defines Color (CS0104 ambiguity)
- [Phase 42-03]: TrayMenuBuilder shrunk from ~43 items to 8+About; all deep submenus removed in favour of SettingsWindow
- [Phase 42-03]: _settingsWindow nulled in Closed handler; each re-open constructs fresh from current snapshot
- [Phase 42-03]: OpenSettings() is MainWindow-private; tray callback wraps in Dispatcher.Invoke
- [Phase 42-03]: About item retained in tray menu (between Reset to Defaults and Quit)
- [Phase 42-settings-window-infrastructure]: SETT-05 scope clarified in REQUIREMENTS.md: Behavior tab covers ghost mode, auto-contrast, auto-launch only; battery alert threshold is ALERT-03 (Phase 44)
- [Phase 43-named-themes]: ThemeDefinition.StatsVisible applies to panel-level toggle only, not per-row visibility — preserves user customization
- [Phase 43-named-themes]: Color using-alias required in ThemeDefinition.cs: using Color = System.Windows.Media.Color resolves UseWindowsForms=true ambiguity
- [Phase 43-named-themes]: SetActiveThemeCard uses theme's own accent color as ring highlight; ClearActiveThemeCard is public for MainWindow to call on deviation
- [Phase 43-named-themes]: ApplyNamedTheme sets _currentTheme before calling individual setters so intermediate SaveSettings() calls persist the correct theme name
- [Phase 43-named-themes]: ApplySettings() theme restore is field-only; ContentRendered ApplyTheme() handles visual update after decoration lists are populated
- [Phase 44-battery-low-alert]: BatteryAlertThresholdPercent is int (not double) — matches discrete 10/15/20 ladder, avoids floating-point equality issues
- [Phase 44-battery-low-alert]: _batteryAlertActive guards BattBar.Background only — BattLabel and BattText keep accent/display color; 1% dead-band prevents threshold-boundary flicker
- [Phase 45-english-phrase-style-personalities]: Terse bucket merges half {h1} to cover minutes 23-32 so minute 30 produces British 'half four'; flat independent providers with no shared base class
- [Phase 45]: ApplySettings uses inline SetLocale rather than calling SetPhraseStyle: avoids redundant SaveSettings at startup while still restoring PhraseEngine locale
- [Phase 45]: SetPhraseStyle clears PhraseText.Text cache before UpdatePhraseIfChanged to force redraw when style changes to same phrase text
- [Phase 46-multilingual-phrases]: [DoNotParallelize] added to PhraseEngineCoordinatorTests: SetLocale mutates static PhraseEngine state; parallel tests caused locale contamination
- [Phase 46-multilingual-phrases]: Japanese phrases provisional — native-speaker review recommended for bucket naturalness before App wiring
- [Phase 46-multilingual-phrases]: PhraseLocale default 'auto': absent field in existing settings.json deserializes to 'auto', preserving English for all existing users
- [Phase 46-multilingual-phrases]: SetPhraseStyle guard: return early if CurrentLocale does not start with 'en-'; prevents English style overriding active non-English locale
- [Phase 47-tech-debt-cleanup]: Ghost theme FontSize=24 (was 28): ensures 24pt button in Settings Appearance tab is highlighted when Ghost theme active

### Pending Todos

None.

### Blockers/Concerns

- Phase 46: Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended before phase is marked done.

## Session Continuity

Last session: 2026-03-09T05:30:25.510Z
Stopped at: Completed 47-01-PLAN.md
Resume file: None
