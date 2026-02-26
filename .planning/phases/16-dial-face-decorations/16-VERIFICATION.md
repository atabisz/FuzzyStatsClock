---
phase: 16-dial-face-decorations
verified: 2026-02-26T11:00:00Z
status: human_needed
score: 5/6 must-haves verified automatically
re_verification: false
human_verification:
  - test: "In dial mode, right-click and open Dial Face submenu; confirm Show Hour Ticks, Show Minute Marks, Show Hour Numbers each reflect the correct checkmark state (unchecked when decoration is off, checked when on)"
    expected: "All three items appear; each checkmark accurately mirrors the current decoration visibility"
    why_human: "IsChecked state is driven by runtime _showHourTicks/_showMinuteDots/_showHourNumbers fields — only observable by running the app"
  - test: "Toggle each decoration on/off and confirm the visual result on DialCanvas"
    expected: "Show Hour Ticks: 12 short white lines at hour positions appear/disappear. Show Minute Marks: 60 small white dots appear/disappear. Show Hour Numbers: labels 1-12 appear/disappear"
    why_human: "WPF Canvas rendering — Visibility toggling verified in code but pixel output requires visual inspection"
  - test: "Enable all three decorations, close the app, relaunch, and right-click in dial mode"
    expected: "All three Dial Face items are still checked and all three decoration types are visible — confirming settings.json round-trip"
    why_human: "File I/O persistence requires a live restart cycle to confirm"
  - test: "Switch to phrase mode (click Dial Mode to deselect), right-click"
    expected: "Dial Face submenu is completely absent from the context menu"
    why_human: "Visibility.Collapsed on a menu item — correct in code, but requires running app to confirm no layout artefact"
  - test: "Switch back from phrase mode to dial mode, right-click"
    expected: "Dial Face submenu reappears with the same checked state as before the mode switch"
    why_human: "Mode round-trip behaviour requires visual confirmation"
---

# Phase 16: Dial Face Decorations Verification Report

**Phase Goal:** In dial mode, users can independently show or hide hour tick marks, minute dots, and hour number labels via the right-click menu, with all preferences persisted across restarts and the decoration menu items hidden in phrase mode.
**Verified:** 2026-02-26T11:00:00Z
**Status:** human_needed (all automated checks pass; 5 visual/runtime behaviors require human confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Right-click in dial mode reveals Dial Face submenu with 3 checkable items | VERIFIED | `MainWindow.xaml` lines 61-75: `MenuDialFace` with `MenuShowHourTicks`, `MenuShowMinuteDots`, `MenuShowHourNumbers`, all `IsCheckable="True"`. `ContextMenu_Opened` (line 283) sets `MenuDialFace.Visibility = _dialMode ? Visible : Collapsed` and sets `.IsChecked` on all three |
| 2 | Toggling Show Hour Ticks draws/removes 12 short lines at hour positions | VERIFIED | `InitDialDecorations()` (line 505): loop `h=0..11` creates 12 `Line` elements at R=31-36, added to `DialCanvas.Children`. `SetShowHourTicks()` (line 475) toggles all 12 via Visibility loop. Click handler wired at line 450 |
| 3 | Toggling Show Minute Marks draws/removes 60 small dots at minute positions | VERIFIED | `InitDialDecorations()` (line 523): loop `m=0..59` creates 60 `Ellipse` 2x2px elements at R=35, added to `DialCanvas.Children`. `SetShowMinuteDots()` (line 483) toggles all 60. Click handler wired at line 453 |
| 4 | Toggling Show Hour Numbers draws/removes labels 1-12 at hour positions | VERIFIED | `InitDialDecorations()` (line 542): loop `h=1..12` creates 12 `TextBlock` elements at R=25 with text `h.ToString()`, added to `DialCanvas.Children`. `SetShowHourNumbers()` (line 491) toggles all 12. Click handler wired at line 456 |
| 5 | Dial Face submenu is hidden (Collapsed) in phrase mode | VERIFIED | `SetDialMode()` (line 468): `MenuDialFace.Visibility = dialMode ? Visibility.Visible : Visibility.Collapsed`. `ContextMenu_Opened` (line 283): same guard. Both call sites confirmed |
| 6 | All three decoration preferences survive app restart | VERIFIED (code path) | `ApplySettings()` lines 130-132 read `s.ShowHourTicks/ShowMinuteDots/ShowHourNumbers` into private fields. `SaveSettings()` lines 154-156 write them back. `InitDialDecorations()` (called at line 84 in ContentRendered) applies initial Visibility from those fields. Round-trip path complete — requires human restart test to confirm file I/O |

**Score:** 5/6 truths fully verified in code; 1 (persistence) verified code-path only, needs human restart test

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.App/AppSettings.cs` | Persistence fields for three decoration booleans | VERIFIED | Lines 16-18: `ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers` all `{ get; init; } = false` |
| `FuzzyClock.App/MainWindow.xaml` | Dial Face submenu with three IsCheckable MenuItems | VERIFIED | Lines 61-75: `x:Name="MenuDialFace"` parent with three named `IsCheckable="True"` child items, click handlers referenced |
| `FuzzyClock.App/MainWindow.xaml.cs` | InitDialDecorations, SetShow* helpers, toggle handlers, ApplySettings/SaveSettings/ContextMenu_Opened/SetDialMode wiring | VERIFIED | 3 occurrences of `InitDialDecorations` (definition line 499, call line 84, comment line 133). All 9 required methods/blocks present and substantive |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ContextMenu_Opened` (line 265) | `MenuDialFace` XAML element | `MenuDialFace.Visibility = _dialMode ? Visible : Collapsed` | WIRED | Line 283 confirmed |
| `ApplySettings()` (line 96) | `AppSettings.ShowHourTicks/ShowMinuteDots/ShowHourNumbers` | `_showHourTicks = s.ShowHourTicks` (and siblings) | WIRED | Lines 130-132 confirmed |
| `SaveSettings()` (line 140) | `AppSettings` record construction | `ShowHourTicks = _showHourTicks` (and siblings) | WIRED | Lines 154-156 confirmed |
| `MenuShowHourTicks_Click` (line 450) | `SetShowHourTicks => SaveSettings` | `SetShowHourTicks(!_showHourTicks)` | WIRED | Line 451; `SetShowHourTicks` calls `SaveSettings()` at line 480 |
| `MenuShowMinuteDots_Click` (line 453) | `SetShowMinuteDots => SaveSettings` | `SetShowMinuteDots(!_showMinuteDots)` | WIRED | Line 454; `SetShowMinuteDots` calls `SaveSettings()` at line 488 |
| `MenuShowHourNumbers_Click` (line 456) | `SetShowHourNumbers => SaveSettings` | `SetShowHourNumbers(!_showHourNumbers)` | WIRED | Line 457; `SetShowHourNumbers` calls `SaveSettings()` at line 496 |
| `SetDialMode()` (line 459) | `MenuDialFace` visibility | `MenuDialFace.Visibility = dialMode ? Visible : Collapsed` | WIRED | Line 468 confirmed |
| `InitDialDecorations()` (ContentRendered line 84) | `DialCanvas.Children` | `DialCanvas.Children.Add(tick/dot/tb)` | WIRED | Lines 519, 538, 558 confirmed — all 3 element types added to DialCanvas |

All 8 key links WIRED. No broken wiring found.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DIAL-06 | 16-01, 16-02 | In dial mode, user can show/hide hour tick marks (12 short lines) via right-click submenu; persisted across restarts | SATISFIED | 12 `Line` elements created in `InitDialDecorations()`, toggled by `SetShowHourTicks()`, persisted via `ShowHourTicks` field in `AppSettings` |
| DIAL-07 | 16-01, 16-02 | In dial mode, user can show/hide minute marks (60 small dots) via right-click submenu; persisted across restarts | SATISFIED | 60 `Ellipse` elements created in `InitDialDecorations()`, toggled by `SetShowMinuteDots()`, persisted via `ShowMinuteDots` field |
| DIAL-08 | 16-01, 16-02 | In dial mode, user can show/hide hour number labels (1-12) via right-click submenu; persisted across restarts | SATISFIED | 12 `TextBlock` elements created in `InitDialDecorations()`, toggled by `SetShowHourNumbers()`, persisted via `ShowHourNumbers` field |
| DIAL-09 | 16-01, 16-02 | Dial face decoration menu options hidden in phrase mode; appear only in dial mode | SATISFIED | `MenuDialFace.Visibility` controlled in both `ContextMenu_Opened` (line 283) and `SetDialMode()` (line 468) — both paths covered |

All 4 requirement IDs from PLAN frontmatter accounted for. REQUIREMENTS.md marks all four as `[x]` complete.

---

## Anti-Patterns Found

None. Scan of all three modified files found:
- No TODO/FIXME/XXX/HACK/PLACEHOLDER comments
- No empty return stubs (`return null`, `return {}`, `return []`)
- No console-log-only handlers
- `InitDialDecorations()` is substantive: 70 lines, creates 84 canvas elements (12+60+12)

---

## Build and Test Verification

- **Build:** `dotnet build FuzzyClock.App/FuzzyClock.App.csproj --no-restore -c Debug` — **0 errors, 0 warnings**
- **Tests:** `dotnet test FuzzyClock.Core.Tests` — **51 passed, 0 failed** (no regressions in FuzzyClock.Core)
- **Commits:** `d75fd94` (Task 1: AppSettings fields + XAML submenu) and `8858ab9` (Task 2: InitDialDecorations + full wiring) both present in git log

---

## Human Verification Required

All automated code checks pass. The following 5 items require running the app and observing behavior:

### 1. Checkmark state accuracy

**Test:** Right-click in dial mode; open Dial Face submenu. Toggle each item on/off; right-click again after each toggle.
**Expected:** Each item's checkmark reflects current state — unchecked when decoration is off, checked when on.
**Why human:** Runtime `IsChecked` assignment (`MenuShowHourTicks.IsChecked = _showHourTicks` etc.) only observable at runtime.

### 2. Hour tick visual toggle (DIAL-06)

**Test:** Click Show Hour Ticks; observe DialCanvas. Click again.
**Expected:** 12 short white lines appear at each hour position (12, 1, 2 ... 11 o'clock) on first click; disappear on second click.
**Why human:** WPF Canvas rendering — Visibility on `Line` elements requires visual confirmation.

### 3. Minute dot visual toggle (DIAL-07)

**Test:** Click Show Minute Marks; observe DialCanvas. Click again.
**Expected:** 60 small white dots appear evenly around the dial; disappear on second click.
**Why human:** WPF Canvas rendering requires visual confirmation.

### 4. Hour number visual toggle (DIAL-08)

**Test:** Click Show Hour Numbers; observe DialCanvas. Click again.
**Expected:** Labels 1 through 12 appear at each hour position inside the tick ring; disappear on second click.
**Why human:** WPF Canvas TextBlock rendering requires visual confirmation.

### 5. Persistence + mode round-trip (DIAL-09)

**Test:** Enable all three decorations. Close app. Relaunch. Right-click in dial mode. Then click Dial Mode off, right-click. Then click Dial Mode on, right-click.
**Expected:** (a) After restart: all three items checked, all decorations visible. (b) In phrase mode: Dial Face submenu absent. (c) Back in dial mode: submenu reappears with all items still checked.
**Why human:** File I/O persistence round-trip and mode-switch visibility require live execution.

---

## Summary

Phase 16 implementation is complete and substantive. All 84 canvas decoration elements (12 hour ticks, 60 minute dots, 12 hour number labels) are created by `InitDialDecorations()` and added to `DialCanvas.Children`. All toggle methods, click handlers, ApplySettings/SaveSettings wiring, and DIAL-09 mode-conditional menu visibility are fully implemented with no stubs or placeholder code. Build passes clean, 51 tests pass.

The only remaining verification is observational (visual rendering, persistence round-trip, mode-switch behavior) — 5 items that require a running app.

---

_Verified: 2026-02-26T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
