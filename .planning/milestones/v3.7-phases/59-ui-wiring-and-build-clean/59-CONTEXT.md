# Phase 59: UI Wiring and Build Clean - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring the full solution to a clean, shippable state for v3.7 Nixie Clock:
- Nixie is selectable in the Settings Clock Style rail and activates the tube clock face
- `dotnet build` exits 0 with 0 errors
- `ContentBorder` background is never set in hover handlers — `BackdropBorder` is the sole hover backdrop
- All existing tests remain green (274+)

UI wiring and data model work is already complete from Phase 57/58. The only remaining implementation task is BACK-05 (ContentBorder backdrop removal).

</domain>

<decisions>
## Implementation Decisions

### BACK-05 — ContentBorder backdrop removal scope
- Remove ALL 5 `ContentBorder.Background` assignments from code-behind — both the hover-backdrop sets AND the transparent clears
- Affected locations:
  - `Window_MouseEnter`: remove `ContentBorder.Background = new SolidColorBrush(Color.FromArgb(BackdropAlpha(), 0, 0, 0))` (normal hover path)
  - `Window_MouseEnter`: remove `ContentBorder.Background = Brushes.Transparent` (ghost mode cleanup step)
  - `Window_MouseLeave`: remove `ContentBorder.Background = Brushes.Transparent`
  - `_ghostMode.Restored` callback: remove `ContentBorder.Background = Brushes.Transparent`
  - `SetBackdropOpacityPercent`: remove `ContentBorder.Background = new SolidColorBrush(...)`
- After removal, `ContentBorder.Background` returns to its XAML default (`Transparent`) and is never touched in code
- `BackdropBorder` remains the sole hover backdrop element

### Already complete from Phase 57/58 (no work needed)
- NIX-02: SettingsWindow 3-button Clock Style rail (Phrase/Dial/Nixie) with `ClockTypeChanged` event — done
- NIX-03: Selecting Nixie activates `NixieView` on the widget — `SetClockType(ClockType.Nixie)` fully wired — done
- NIX-04: No stale `_dialMode` reference anywhere in `FuzzyClock.App` — done
- Build: 0 errors (12 CS0067 warnings for stub LCD/dial events — expected and acceptable)
- Tests: 299 passing (262 Core + 37 App)

### Claude's Discretion
- No discretionary areas — scope is fully defined by BACK-05 and the existing success criteria

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — NIX-02, NIX-03, NIX-04, BACK-05 definitions and traceability

### Prior phase research
- `.planning/phases/58-data-model-foundation/58-RESEARCH.md` — Verified current state of AppSettings, SettingsSnapshot, ClockType enum, build/test status as of Phase 58

### Phase 57 summaries (prior art for what's already done)
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-01-SUMMARY.md` — NIX-01, NIX-04 (GetSegmentKey) completed
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-02-SUMMARY.md` — NIX-02, NIX-03 completed; ClockTypeChanged event wired

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BackdropBorder` (`MainWindow.xaml` line 28): Full-widget backdrop Border — already the sole backdrop for stats/date/uptime rows; after BACK-05 it covers the phrase row too
- `ContentBorder` (`MainWindow.xaml` line 42): Row 0 Border wrapping phrase/dial/Nixie area; XAML default is `Background="Transparent"`; code-behind must stop setting it

### ContentBorder.Background — all 5 removal targets
- `MainWindow.xaml.cs` line ~160 — `_ghostMode.Restored` callback: `ContentBorder.Background = Brushes.Transparent`
- `MainWindow.xaml.cs` line ~1027 — `SetBackdropOpacityPercent`: `ContentBorder.Background = new SolidColorBrush(...)`
- `MainWindow.xaml.cs` line ~1047 — `Window_MouseEnter` normal hover path: `ContentBorder.Background = new SolidColorBrush(Color.FromArgb(BackdropAlpha(), 0, 0, 0))`
- `MainWindow.xaml.cs` line ~1068 — `Window_MouseEnter` ghost cleanup: `ContentBorder.Background = Brushes.Transparent`
- `MainWindow.xaml.cs` line ~1091 — `Window_MouseLeave`: `ContentBorder.Background = Brushes.Transparent`

### Established Patterns
- `BackdropBorder.Background` assignments follow a set/clear pattern across the same 4 methods — leave these intact; only `ContentBorder.Background` assignments are removed
- `ApplyPhraseWrap()` already uses `_clockType != ClockType.Phrase` (no `_dialMode` — already migrated)
- Stub events (CS0067 warnings) are intentional stubs for future LCD/dial settings — do not suppress or remove them

### Integration Points
- `MainWindow.xaml.cs` — sole file to modify for BACK-05
- No XAML changes needed
- No test changes needed (BACK-05 is a hover behavior fix; no tests cover `ContentBorder.Background` directly)

</code_context>

<specifics>
## Specific Ideas

No specific references beyond the ROADMAP success criteria. The ContentBorder removal is a clean surgery: delete the 5 lines, leave BackdropBorder logic untouched, verify build/tests still green.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 59-ui-wiring-and-build-clean*
*Context gathered: 2026-03-19*
