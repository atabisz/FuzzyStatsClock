# Phase 60: Dial Decoration Settings UI - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire three dial decoration checkboxes in Settings > Appearance:
- "Hour Ticks", "Minute Dots", "Hour Numbers"
- Visible only when Dial clock style is active (hidden for Phrase and Nixie)
- Reflect persisted values on open via `PopulateControls`
- Fire events on toggle for immediate live update
- Persist to settings.json and restore on app restart

This is pure SettingsWindow XAML + `PopulateControls` additions + click handler wiring. No backend work — events, AppSettings fields, SettingsSnapshot fields, and MainWindow subscriptions are already implemented.

</domain>

<decisions>
## Implementation Decisions

### Placement in Appearance Tab
- **D-01:** Add as a new Row 5 in the existing 2-column Appearance tab Grid, after the Phrase Wrap row (currently Row 4). Consistent with how Phrase Style and Phrase Wrap sit below Clock Style as per-style rows.
- The grid row label goes in Column 0, checkboxes panel in Column 1, following the established layout pattern.

### Section Label
- **D-02:** Left-column label text: **"Dial Face"** — matches the visual concept (these are face decorations on the dial clock).

### Checkbox Layout
- **D-03:** Vertical StackPanel — one checkbox per line. Mirrors the Phrase Wrap area layout. Clean and readable for the longer label text ("Hour Ticks", "Minute Dots", "Hour Numbers").

### Visibility Gating
- **D-04:** The Dial Face panel (label + checkboxes) is hidden when Phrase or Nixie is active, visible only when Dial is active. Visibility controlled in code-behind via `SetClockStyleButtonStates` — set `Visibility.Visible` / `Visibility.Collapsed` on named elements, mirroring the `BtnPhrase.Tag` / `BtnDial.Tag` / `BtnNixie.Tag` pattern.

### Event + Handler Pattern
- **D-05:** Checkbox handlers follow the existing `_suppressEvents` guard pattern. Each handler fires the corresponding event (`ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged`) only when `_suppressEvents` is false. `PopulateControls` sets `IsChecked` from `SettingsSnapshot` fields under `_suppressEvents = true`.

### Claude's Discretion
- Exact XAML element names for the checkboxes (e.g., `ChkShowHourTicks`, `ChkShowMinuteDots`, `ChkShowHourNumbers`) — follow existing naming convention
- Named panel element for visibility gating (e.g., `DialFacePanel` TextBlock + StackPanel) — follow how `WrapStylePanel` is named
- Margin values — use the 4px grid spacing established in the Appearance tab

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — DIAL-10, DIAL-11 definitions and acceptance criteria

### Implementation files to read before modifying
- `FuzzyClock.App/SettingsWindow.xaml` — Appearance tab grid structure; rows 0-4 layout to extend
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `PopulateControls`, `SetClockStyleButtonStates`, event declarations, `_suppressEvents` guard pattern

### Prior phase context
- `.planning/phases/59-ui-wiring-and-build-clean/59-CONTEXT.md` — Phase 59 decisions; ClockStyle rail and ContentBorder patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SetClockStyleButtonStates(ClockType ct)` in `SettingsWindow.xaml.cs`: Sets `BtnPhrase.Tag`, `BtnDial.Tag`, `BtnNixie.Tag` — extend this method to also toggle dial face panel visibility
- `PopulateControls(SettingsSnapshot s)`: Already populates stats checkboxes and clock style — add 3 dial checkbox assignments here
- `_suppressEvents` bool: Guards all checkbox `Checked`/`Unchecked` handlers — use same pattern for new handlers
- Existing stats checkboxes (`ChkCpuVisible`, etc.): Template for checkbox handler pattern with event firing

### Established Patterns
- Appearance tab grid: 2 columns (label right-aligned in Col 0, controls left-aligned in Col 1), `Margin="0,8,0,0"` per row
- `WrapStylePanel` visibility: named panel element with `Visibility` set in code-behind — same approach for `DialFacePanel`
- All `Checked` + `Unchecked` events point to the same handler method (e.g., `ChkPhraseWrap_Changed`)

### Integration Points
- `SettingsWindow.xaml` — add Row 5 to the existing Appearance tab Grid
- `SettingsWindow.xaml.cs` — extend `PopulateControls` + `SetClockStyleButtonStates` + add 3 handler methods
- No changes needed to MainWindow, AppSettings, SettingsSnapshot, or tests

</code_context>

<specifics>
## Specific Ideas

No specific visual references — follow the established Phrase Wrap row as the layout template.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 60-dial-decoration-settings-ui*
*Context gathered: 2026-03-23*
