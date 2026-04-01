# Phase 74: Remove Named Themes - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Delete the named theme system (Midnight/Neon/Ghost/Warm/Terminal) from the codebase and Settings UI. Users with a saved Theme in settings.json are silently migrated to their current accent color on first v4.1 launch. No new features — pure removal and cleanup.

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy
- **D-01:** No explicit migration code needed. `SaveSettings()` has always persisted `AccentColor` as a hex string alongside `Theme` in settings.json. When `Theme` field is removed from `AppSettings`, `System.Text.Json` silently ignores the unknown `"Theme"` key in old settings files. The individually persisted `AccentColor`, `Opacity`, `FontSize`, `ClockType`, and `StatsVisible` values are used directly on next startup.
- **D-02:** Silently ignore old `Theme` keys — no diagnostic logging, no one-time migration write, no cleanup of old settings files.
- **D-03:** The startup restore block in `ApplySettings()` (lines 363-372) that overrides individual fields from theme definitions is deleted entirely.

### Cleanup Scope
- **D-04:** Delete `ThemeDefinition.cs` entirely (contains `ThemeDefinition` record and `BuiltInThemes` static registry).
- **D-05:** Delete `SettingsSnapshot.ActiveTheme` field — no downstream code reads it once theme cards are removed.
- **D-06:** Delete from `MainWindow.xaml.cs`: `_currentTheme` field, `ApplyNamedTheme()`, `ClearActiveTheme()`, `ThemeSelected` subscription, theme name in `SaveSettings()` with-expression.
- **D-07:** Delete from `SettingsWindow.xaml.cs`: `ThemeSelected` event, 5 theme click handlers, `SetActiveThemeCard()`, `ClearActiveThemeCard()`, `ActiveTheme` restore in `PopulateControls`.
- **D-08:** Delete from `SettingsWindow.xaml`: theme card row (RingThemeMidnight through RingThemeTerminal) and the "Theme" TextBlock header.
- **D-09:** Remove `AppSettings.Theme` field. `SettingsService.Validate()` currently has no Theme guard (nullable string with null default), so CLEAN-04 is trivially satisfied.

### ResetToDefaults
- **D-10:** No special handling needed — once `_currentTheme` field is deleted, ResetToDefaults has nothing to clear. The whole concept vanishes.

### Tests
- **D-11:** Existing test suite is sufficient. No migration-specific tests needed since the migration is a no-op (JSON deserialization ignores unknown keys). Build verification confirms deletion is complete.

### Documentation
- **D-12:** Update PROJECT.md to remove references to "5 built-in named themes" from the project description.

### Claude's Discretion
- Settings UI layout adjustment after theme card row removal (spacing, gaps)
- Order of deletions across files (any dependency-safe sequence)
- Whether to update any existing tests that reference theme names

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Theme infrastructure (to be deleted)
- `FuzzyClock.App/ThemeDefinition.cs` — Contains `ThemeDefinition` record and `BuiltInThemes` static registry (entire file deleted)
- `FuzzyClock.App/AppSettings.cs` line 43 — `string? Theme` field (to be removed)
- `FuzzyClock.App/SettingsSnapshot.cs` line 38 — `string? ActiveTheme` field (to be removed)

### Theme wiring in MainWindow
- `FuzzyClock.App/MainWindow.xaml.cs` lines 363-372 — Startup theme restore block (to be deleted)
- `FuzzyClock.App/MainWindow.xaml.cs` lines 1218-1244 — `ApplyNamedTheme()` and `ClearActiveTheme()` methods (to be deleted)
- `FuzzyClock.App/MainWindow.xaml.cs` line 478 — `ThemeSelected` event subscription (to be deleted)
- `FuzzyClock.App/MainWindow.xaml.cs` line 547 — `Theme = _currentTheme` in SaveSettings (to be deleted)
- `FuzzyClock.App/MainWindow.xaml.cs` line 403 — `ActiveTheme = _currentTheme` in GetCurrentSettingsSnapshot (to be deleted)

### Theme UI in SettingsWindow
- `FuzzyClock.App/SettingsWindow.xaml` lines 58-155 — Theme card XAML (entire section deleted)
- `FuzzyClock.App/SettingsWindow.xaml.cs` lines 48, 202-326 — ThemeSelected event, click handlers, card ring logic (to be deleted)

### Requirements
- `.planning/REQUIREMENTS.md` — CLEAN-01 through CLEAN-04 define the acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SettingsService.Save()`/`Load()` — JSON round-trip already handles missing fields gracefully (init-property defaults)
- `System.Text.Json` behavior — unknown keys in JSON are silently ignored during deserialization (no `JsonExtensionData` configured)

### Established Patterns
- `AppSettings` init-property record — removing a field is backward-compatible; old settings files with the field are deserialized without error
- `SaveSettings()` with-expression — removing `Theme = _currentTheme` line is a single-line edit
- `ClearActiveTheme()` pattern — called by 6+ property setters (accent color, opacity, font size, clock type, stats visibility); all these callers simply have their `ClearActiveTheme()` call deleted

### Integration Points
- `MainWindow.ApplySettings()` — theme restore block (lines 363-372) removed; individual field loading above it remains unchanged
- `MainWindow.OpenSettingsWindow()` — `ThemeSelected` subscription removed; other subscriptions unchanged
- `SettingsWindow.PopulateControls()` — `ActiveTheme` restore block removed; remaining controls unaffected
- `GetCurrentSettingsSnapshot()` — `ActiveTheme = _currentTheme` line removed
- `PROJECT.md` "What This Is" section — remove "Five built-in named themes" reference

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward deletion with no migration code. The key insight is that `SaveSettings()` has always persisted all individual property values alongside the Theme name, making explicit migration unnecessary.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 74-remove-named-themes*
*Context gathered: 2026-04-02*
