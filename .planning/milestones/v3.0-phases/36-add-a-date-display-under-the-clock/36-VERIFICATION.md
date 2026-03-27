---
phase: 36-add-a-date-display-under-the-clock
verified: 2026-03-07T04:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 36: Add a Date Display Under the Clock — Verification Report

**Phase Goal:** Date line visible below the time phrase/dial, in a muted accent color, with four format options (Short/Long/Numeric/ISO) and a show/hide toggle — all configurable from the tray menu and persisted to settings.
**Verified:** 2026-03-07
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Date text appears below the time phrase (and below the dial in dial mode) | VERIFIED | `DateText` at `Grid.Row="1"` in a 3-row inner grid; `ContentBorder` at Row 0, `StatsPanel` at Row 2 — confirmed in `MainWindow.xaml` lines 24–30, 104–116, 123–127 |
| 2  | Date text is a dimmed accent-color variant — visually subordinate to the time phrase | VERIFIED | `ApplyTheme()` sets `DateText.Foreground` with `Color.FromArgb(0x8C, ...)` (55% alpha); `ApplyDisplayColor()` applies the same 0x8C dimming — `MainWindow.xaml.cs` lines 1106–1108, 1140–1142 |
| 3  | Date text has a drop shadow identical to the phrase text drop shadow | VERIFIED | `DropShadowEffect` (BlurRadius=4, Direction=315, ShadowDepth=1, Opacity=0.6, Color=Black) on `PhraseText`, `EmphasisText`, and `DateText` — confirmed in `MainWindow.xaml` lines 48–50, 75–77, 113–115 |
| 4  | Date updates automatically at midnight without restart | VERIFIED | `_timer.Tick` calls `UpdateDateDisplay()` every tick (line 96); `UpdateDateDisplay()` uses string-equality change-guard — detects midnight when formatted date string changes |
| 5  | Date visibility and format are persisted to settings.json and restored on startup | VERIFIED | `AppSettings` has `ShowDate`/`DateFormat` init properties; `SettingsService.Defaults()` and `Validate()` cover both; `SaveSettings()` serializes the full record; `ApplySettings()` restores both fields — confirmed across `AppSettings.cs`, `SettingsService.cs`, `MainWindow.xaml.cs` |
| 6  | Reset to Defaults shows the date in Short format | VERIFIED | `ResetToDefaults()` sets `_showDate=true`, `_dateFormat="Short"`, `DateText.Visibility=Visible`, calls `UpdateDateDisplay()` — `MainWindow.xaml.cs` lines 866–869 |
| 7  | Tray menu has a checkable "Show Date" top-level item that toggles date visibility | VERIFIED | `_showDateItem` initialized in `Build()` with `Checked=initialState.ShowDate`; `.Click` calls `_cb.ToggleDateVisible()` — `TrayMenuBuilder.cs` lines 180–183 |
| 8  | Tray menu has a "Date Format" submenu with four mutually-exclusive checkmarks: Short, Long, Numeric, ISO | VERIFIED | Four `_dateFormat*` items created and wired in `Build()`; added as children of `dateFormatItem` submenu — `TrayMenuBuilder.cs` lines 186–196 |
| 9  | Short is checked by default on first launch and after Reset to Defaults | VERIFIED | `AppSettings.DateFormat` defaults to `"Short"`; `ResetToDefaults()` resets to `"Short"`; `SyncCheckmarks()` sets `_dateFormatShort.Checked = (s.DateFormat == "Short")` |
| 10 | Show Date checkmark reflects live `_showDate` state on every menu open | VERIFIED | `SyncCheckmarks()` called on every `ContextMenuStrip.Opening`; sets `_showDateItem.Checked = s.ShowDate` from `GetCurrentTrayState()` which reads `_showDate` — `TrayMenuBuilder.cs` lines 157, 367 |
| 11 | Selecting a Date Format option immediately updates the displayed date | VERIFIED | Click handlers call `_cb.SetDateFormat(fmt)` → `Dispatcher.Invoke(() => SetDateFormat(fmt))`; `SetDateFormat()` clears `_currentDateText`, calls `UpdateDateDisplay()`, calls `SaveSettings()` — `MainWindow.xaml.cs` lines 174, 490–495 |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.App/AppSettings.cs` | `ShowDate` and `DateFormat` properties on `AppSettings` record | VERIFIED | Lines 34–35: `public bool ShowDate { get; init; } = true;` and `public string DateFormat { get; init; } = "Short";` |
| `FuzzyClock.App/SettingsService.cs` | Defaults, Validate, and Save coverage for new fields | VERIFIED | `Defaults()` lines 121–122; `Validate()` lines 89–91 (DateFormat guard); `Save()` serializes full record |
| `FuzzyClock.App/MainWindow.xaml` | `DateText` TextBlock in 3-row outer grid with DropShadowEffect matching phrase text | VERIFIED | Lines 24–116: 3 RowDefinitions, `DateText` at Row 1, `DropShadowEffect` identical to PhraseText/EmphasisText, `StatsPanel` at Row 2 |
| `FuzzyClock.App/MainWindow.xaml.cs` | `UpdateDateDisplay`, `ApplyTheme`, `ApplyDisplayColor`, `ApplySettings`, `SaveSettings`, `ResetToDefaults` all cover `DateText` | VERIFIED | All six paths confirmed via grep; `FormatDate()` and `SetDateFormat()`/`SetDateVisible()` helpers present |
| `FuzzyClock.App/TrayMenuBuilder.cs` | Show Date item and Date Format submenu wired with callbacks; `SyncCheckmarks` covers both | VERIFIED | 5 new fields; all initialized in `Build()`; `SyncCheckmarks()` covers all 5 items at lines 367–371 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_timer.Tick` handler | `UpdateDateDisplay()` | Direct call in tick lambda | VERIFIED | `MainWindow.xaml.cs` line 96 |
| `ApplyTheme()` | `DateText.Foreground` | `SolidColorBrush` with `0x8C` alpha | VERIFIED | Lines 1106–1108 |
| `ApplyDisplayColor()` | `DateText.Foreground` | `SolidColorBrush` with `0x8C` alpha from `RgbColor` | VERIFIED | Lines 1140–1142 |
| `TrayMenuBuilder._showDateItem.Click` | `TrayMenuCallbacks.ToggleDateVisible` | Lambda calling `_cb.ToggleDateVisible()` | VERIFIED | `TrayMenuBuilder.cs` line 182 |
| `TrayMenuBuilder._dateFormat*.Click` | `TrayMenuCallbacks.SetDateFormat` | Lambda calling `_cb.SetDateFormat(fmt)` for each format | VERIFIED | `TrayMenuBuilder.cs` lines 190–193 |
| `TrayMenuBuilder.SyncCheckmarks` | `_showDateItem.Checked` and `_dateFormat*.Checked` | `s.ShowDate` and `s.DateFormat` comparisons | VERIFIED | `TrayMenuBuilder.cs` lines 367–371 |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATE-01 | 36-01-PLAN.md, 36-02-PLAN.md | Date display below clock with format options and tray toggle | SATISFIED | Full feature implemented across both plans; all observable truths verified |

Note: No `REQUIREMENTS.md` file exists in `.planning/` — this project tracks requirements via ROADMAP.md phase goals and plan frontmatter. `DATE-01` is the sole requirement ID declared in both plans' frontmatter and marked completed in both summaries.

---

### Anti-Patterns Found

None detected. Grep over `MainWindow.xaml.cs` and `TrayMenuBuilder.cs` found no TODO/FIXME/placeholder patterns, no empty implementations, no stub return values in date-related code.

---

### Human Verification Required

The following behaviors require runtime observation and cannot be verified programmatically:

#### 1. DateText Visual Placement

**Test:** Launch the app and observe the widget.
**Expected:** Date text (e.g. "Sat, Mar 7") appears immediately below the fuzzy time phrase, above the stats panel (when stats are visible), in a muted/dimmed color relative to the phrase text.
**Why human:** Visual layout and color subordination cannot be verified from code inspection alone.

#### 2. Tray Menu "Show Date" Toggle

**Test:** Right-click tray icon, click "Show Date" to uncheck it.
**Expected:** DateText disappears from the widget immediately. Re-checking "Show Date" brings it back.
**Why human:** UI state change from tray interaction requires runtime.

#### 3. Date Format Switching

**Test:** Right-click tray icon, open "Date Format" submenu, select each option (Short/Long/Numeric/ISO).
**Expected:** Widget immediately shows the new format (e.g. "Saturday, March 7" for Long, "3/7/2026" for Numeric, "2026-03-07" for ISO). Only the selected format has a checkmark.
**Why human:** Runtime rendering and checkmark mutual-exclusion require runtime.

#### 4. Persistence Across Restart

**Test:** Set DateFormat to "ISO" and hide the date, then close and relaunch the app.
**Expected:** Widget shows no date, and tray "Date Format" submenu shows ISO checked.
**Why human:** Requires actually restarting the process to confirm settings.json round-trip.

---

### Test Suite

All automated tests pass: **114 tests (91 Core + 23 App), 0 failures.**

The test count grew from the 88 documented in the original plan baseline — this is expected; tests were added in prior phases between the plan baseline and this verification.

---

## Overall Assessment

Phase 36 goal is **fully achieved**. All 11 observable truths are verified against the actual codebase. Both plans executed completely with no stubs or partial implementations found. The date display feature is end-to-end: `DateText` renders below the time phrase with identical drop-shadow treatment, `ApplyTheme`/`ApplyDisplayColor` apply dimmed accent color, the timer keeps the date current, `AppSettings`/`SettingsService` persist visibility and format, and the tray menu provides "Show Date" toggle and "Date Format" submenu (Short/Long/Numeric/ISO) with full `SyncCheckmarks` coverage.

---

_Verified: 2026-03-07_
_Verifier: Claude (gsd-verifier)_
