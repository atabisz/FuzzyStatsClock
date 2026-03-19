# Project Research Summary

**Project:** FuzzyStatsClock v3.7 — Nixie Clock Re-introduction (Phase 57)
**Domain:** WPF C# desktop overlay widget — settings plumbing migration + Nixie clock type wiring
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

This is a low-complexity, high-confidence settings plumbing milestone. The Nixie rendering layer (`NixieClockView`, `NixieDigit`), the `ClockType` enum, tray menu wiring, and the `SetClockType(ClockType.Nixie)` branch in `MainWindow` are all pre-existing and verified complete. The exclusive work of v3.7 is migrating two data-model records (`AppSettings`, `SettingsSnapshot`) from a `DialMode: bool` representation to a `ClockType: enum` representation, exposing a third "Nixie" button in `SettingsWindow`, and resolving pre-existing compile errors that block the build. Zero new NuGet packages are required. The entire solution delta is confined to eight files across two project assemblies (`FuzzyClock.Core` and `FuzzyClock.App`).

The recommended execution sequence is two sequential waves. Wave 1 establishes the data model: add `GetSegmentKey` to six novelty phrase providers (currently blocking `FuzzyClock.Core` from compiling), remove `AppSettings.DialMode` / `SettingsSnapshot.DialMode`, and add `ClockType` + LCD + dial decoration fields with safe `init` defaults. Wave 2 depends on Wave 1 and delivers the UI: replace `DialModeChanged` with `ClockTypeChanged` on `SettingsWindow`, add the `BtnNixie` button to the Clock Style rail, declare six additional missing events, and fix the stale `_dialMode` reference in `ApplyPhraseWrap`. The project cannot be built or tested in any intermediate state between Wave 1 start and Wave 1 completion — all compile errors must be resolved as a unit.

The key risk is cascade breakage when removing `AppSettings.DialMode`: every caller site must be found and updated in the same commit. The pre-existing `SettingsService.Load()` migration is safe because it reads `DialMode` from the raw `JsonDocument` (not the deserialized record), but test code (`STEST-01`) and `ResetToDefaults()` must be audited before deletion. The second risk is declaring only `ClockTypeChanged` and missing the six other events that `MainWindow.OpenSettings()` already subscribes to — these must all be added in a single edit or the project will not compile.

---

## Key Findings

### Recommended Stack

The validated v3.6.1 stack is unchanged: .NET 10 WPF, C# 13, System.Text.Json (BCL), MSTest 4.0.1, Velopack 0.0.1298. No csproj changes and no new NuGet packages are required for this milestone. All required types (`ClockType` enum, `NixieClockView`, `NixieDigit`, `NixieSizeMap`, `SegmentButtonStyle`, `Action<T>`) already exist in the project or the BCL.

**Core technologies:**
- **.NET 10 WPF**: UI framework, XAML controls, DispatcherTimer — already validated; no change
- **C# 13 `init`-property records**: `AppSettings` and `SettingsSnapshot` use `{ get; init; }` — enables safe JSON absent-field defaults on schema upgrade
- **System.Text.Json (BCL)**: Settings serialization — `SettingsService.Load()` reads raw `JsonDocument` for migration then deserializes the record natively; removing `DialMode` from the record does not break the `TryGetProperty` migration path
- **MSTest 4.0.1**: 274 tests currently passing; round-trip test `STEST-01` must be updated as part of Wave 1

**Critical version note:** `LcdSize` must NOT be persisted in `AppSettings` — it is derived at runtime from `FontSize` via `FontSizeToLcdSize()`. It belongs in `SettingsSnapshot` only.

### Expected Features

**Must have (table stakes — all pre-existing, wiring is the work):**
- Nixie digit display for HH:MM with amber glow — `NixieClockView` + `NixieDigit` already complete
- Real-time 1s update — `NixieClockView` self-manages its `DispatcherTimer` via `IsVisibleChanged`; no `MainWindow` timer involvement
- Nixie selectable alongside Phrase and Dial — requires 3-button Settings rail (NIX-02)
- Selection persists across restarts — requires `AppSettings.ClockType` field (NIX-01)
- Ghost cathode effect (all 10 digits faintly visible) — already implemented in `NixieDigit.xaml.cs` with four-level opacity system
- Correct amber-orange palette — hardcoded `#FF8C00` in `NixieDigit.xaml.cs`; must not be overridden by user accent color
- Stats panel visible below Nixie face — `NixieClockView` occupies Grid Row 0 only; stats rows are unchanged

**Should have (differentiators — all pre-existing, no new work required):**
- Wire mesh texture simulation inside tube — already rendered at 9.4% alpha
- Glass reflection highlight — already implemented
- Dark tube fill for depth — `#1A0800 CC` already in `NixieDigit.xaml.cs`
- Accent color isolation — Nixie face must NOT receive accent color from `ApplyTheme()` / `ApplyDisplayColor()`; requires an explicit audit during NIX-03

**Defer (not this phase):**
- Nixie digit crossfade animation — significant complexity for a widget
- Nixie 24hr display option — belongs to a future Nixie settings panel
- LCD clock type surfaced in SettingsWindow — separate future phase
- Custom Nixie color — explicitly an anti-feature; fixed amber palette is the design contract

### Architecture Approach

The existing architecture is a single-orchestrator pattern: `MainWindow` is the sole source of truth for all runtime state. `SettingsWindow` fires typed `Action<T>?` events per setting change; it never reads back from `MainWindow`. `SettingsSnapshot` is a populate-on-open immutable record that flows in one direction only (out via events). `NixieClockView` is self-contained and activated purely via `Visibility` toggle — `MainWindow` does not manage its timer. This pattern is established and all new work must follow it without deviation.

**Major components:**
1. `AppSettings` (record) — persistent JSON settings; `DialMode: bool` replaced by `ClockType: ClockType` + LCD fields; `LcdSize` excluded (derived)
2. `SettingsSnapshot` (record) — populate-on-open snapshot; same field migration as `AppSettings` plus `LcdSize` and dial decoration fields (`ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers`)
3. `SettingsWindow` — fires `ClockTypeChanged` + six previously-missing events; gains `BtnNixie` in Clock Style rail; `SetClockStyleButtonStates` signature changes from `bool` to `ClockType`
4. `MainWindow` — orchestrator; `OpenSettings()` subscription block and `ApplyPhraseWrap()` are the only two touch points for this phase
5. `NixieClockView` / `NixieDigit` — pre-existing and complete; activated by `Visibility` toggle; not to be modified
6. Six novelty providers (`Yoda`, `Jive`, `Pirate`, `Shakespeare`, `Dwarf`, `ValleyGirl`) — missing `GetSegmentKey` implementation; must be added to unblock `FuzzyClock.Core` compilation
7. `SettingsService` — `DialMode → ClockType` JSON migration already implemented at lines 53–61; no changes needed

### Critical Pitfalls

1. **Seven events subscribed in `MainWindow.OpenSettings()` but not declared in `SettingsWindow`** — adds all seven (`ClockTypeChanged`, `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged`) in a single pass before any other Wave 2 work; the project cannot compile in any intermediate state with partial declarations.

2. **`DialMode` removal cascades to undiscovered callers** — grep `\.DialMode` and `DialMode\s*=` across the entire solution before deleting the field; explicitly audit `ResetToDefaults()` and `STEST-01`; fix all sites in one commit; the `SettingsService.Load()` migration at lines 53–61 is safe (reads from `JsonDocument`, not the deserialized record).

3. **`DialModeChanged` → `ClockTypeChanged` rename requires three atomic changes** — remove the old event declaration, update `BtnPhrase_Click` and `BtnDial_Click` to fire `ClockTypeChanged`, add `BtnNixie_Click`; partial changes produce silent dead code (Phrase/Dial buttons no longer fire anything) or compile errors.

4. **`GetCurrentSettingsSnapshot()` omitting new fields causes silent UI bug** — `init` defaults silently fill omitted record fields; a snapshot that omits `ClockType` causes the Settings window to show the Phrase button selected even when Nixie is active; verify `ClockType = _clockType` is explicit in the snapshot constructor.

5. **`BtnNixie` XAML element and code-behind handler must be added in the same commit** — WPF does not produce a compile error for a missing named element referenced only in code-behind; the omission produces a `NullReferenceException` at `BtnNixie.Tag` the first time Settings opens.

---

## Implications for Roadmap

The architecture research has already divided this phase into two sequential waves with a hard dependency between them. Those waves map directly to the recommended roadmap structure. No additional phase decomposition is needed.

### Wave 1 (57-01): Data Model Foundation

**Rationale:** `FuzzyClock.Core` currently does not compile — the six novelty providers are missing `GetSegmentKey`, blocking the entire build. Additionally, `SettingsWindow` code-behind calls `SetClockStyleButtonStates(s.ClockType)` and `PopulateControls` both read from `SettingsSnapshot` — neither compiles until the record has `ClockType`. Both blockers must be resolved before Wave 2 can compile or be tested in any form.

**Delivers:** A clean-building solution with the correct data model: `ClockType` + LCD + dial decoration fields in both `AppSettings` and `SettingsSnapshot`; `DialMode` removed from both; `FuzzyClock.Core` compiling; `STEST-01` updated to cover new fields; absent-field test added.

**Addresses:** NIX-01 (AppSettings/SettingsSnapshot migration); NIX-04 partial (novelty provider `GetSegmentKey` build errors)

**Avoids:** Cascade compile errors from `DialMode` removal; `ResetToDefaults()` silent bug; round-trip test gaps

**Files changed:**
- `FuzzyClock.Core/`: 6 novelty providers — add `GetSegmentKey`
- `FuzzyClock.App/AppSettings.cs` — remove `DialMode`; add `ClockType` + `LcdUse24Hr` + `LcdShowSeconds` + `LcdStyle`
- `FuzzyClock.App/SettingsSnapshot.cs` — remove `DialMode`; add `ClockType` + LCD + `ShowHourTicks` + `ShowMinuteDots` + `ShowHourNumbers`
- Test project — update `STEST-01`; add absent-field test

### Wave 2 (57-02): UI Wiring and Remaining Build Error Resolution

**Rationale:** Depends on Wave 1. Once `SettingsSnapshot.ClockType` exists and `FuzzyClock.Core` compiles, `SettingsWindow` can be updated without cascading errors. The stale `_dialMode` reference and the `DialModeChanged` rename are addressed here, completing NIX-02 (Settings rail), NIX-03 (implicit — Nixie is already wired in `SetClockType`), and NIX-04 (remaining build error: `_dialMode` reference).

**Delivers:** Full solution builds with 0 errors. `BtnNixie` appears in the Settings Clock Style rail. Selecting Nixie activates the tube clock face on the widget and persists across restarts. All seven previously-missing events declared. `DialModeChanged` and `_dialMode` have zero occurrences in the codebase.

**Uses:** Existing `SegmentButtonStyle`, `Action<ClockType>` event pattern, `Visibility`-toggle clock face switch pattern

**Implements:** SettingsWindow 3-button rail; completes the `MainWindow` → `SettingsWindow` → `NixieClockView` data flow

**Files changed:**
- `FuzzyClock.App/SettingsWindow.xaml` — add `BtnNixie` to Clock Style `StackPanel`
- `FuzzyClock.App/SettingsWindow.xaml.cs` — replace `DialModeChanged` with `ClockTypeChanged`; add 6 missing event declarations; update `SetClockStyleButtonStates(ClockType)`, `PopulateControls`, `BtnPhrase_Click`, `BtnDial_Click`; add `BtnNixie_Click`
- `FuzzyClock.App/MainWindow.xaml.cs` — fix `_dialMode` reference in `ApplyPhraseWrap` (line ~718)

### Phase Ordering Rationale

- **Wave 1 before Wave 2 is a hard dependency:** `SettingsWindow` code-behind will not compile until `SettingsSnapshot.ClockType` exists. Attempting Wave 2 changes without Wave 1 complete is impossible.
- **Novelty providers are the absolute first change:** They block `FuzzyClock.Core` from building entirely, which prevents any test run or incremental verification of other changes.
- **All `DialMode` deletions and callers must be fixed in a single commit:** Any intermediate state where the property is deleted but a caller remains is an unbuildable repo.
- **XAML button addition and code-behind handler must ship in the same commit:** Omitting the XAML element causes a `NullReferenceException` only at Settings window open time, not at compile time.

### Research Flags

Phases with standard, well-documented patterns — skip `/gsd:research-phase` for both waves:
- **Wave 1 (data model):** `init`-property record field addition/removal is a standard C# pattern; `GetSegmentKey` delegation is a one-line implementation already specified in the architecture doc; JSON migration safety is verified by direct line inspection.
- **Wave 2 (UI wiring):** `SegmentButtonStyle` is already applied to existing buttons; `Action<T>?` event pattern matches the existing six events; the XAML addition is a single `<Button>` element following an established template.

No waves require external research. All implementation patterns are fully specified in STACK.md, ARCHITECTURE.md, and PITFALLS.md with exact code samples and line numbers.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All verified by direct source audit; zero new packages confirmed; no csproj changes needed |
| Features | HIGH | All findings from codebase inspection + UI-SPEC + phase research; no external sources required |
| Architecture | HIGH | Component boundaries, data flow, and build order verified by cross-referencing all affected files with exact line numbers |
| Pitfalls | HIGH | Every pitfall verified by exact file path and line number in source; no speculation |

**Overall confidence:** HIGH

### Gaps to Address

- **Accent color isolation — verification required during NIX-03:** `ApplyTheme()` and `ApplyDisplayColor()` must be audited to confirm `NixieClockView` is not included in any accent-element iteration loop. Research expects this to be safe (Nixie controls were not in the known accent element lists at time of audit), but the check must be explicit before NIX-03 can be closed.

- **`ResetToDefaults()` — confirm no stale `DialMode` reference:** Research flagged this as a likely caller site for `DialMode` but did not confirm by exact line number. Must be verified as the first check of NIX-01 field deletion, not assumed safe.

- **`NixieClockView` timer stop-on-collapse — verify before NIX-03 wiring:** Research expects the `IsVisibleChanged` handler to stop the timer when `IsVisible == false`. This must be confirmed by reading `NixieClockView.xaml.cs` before `SetClockType(ClockType.Nixie)` is exercised, to prevent the double-start pitfall (Pitfall 12).

---

## Sources

### Primary (HIGH confidence)

All findings are from direct source audit of the current codebase.

- `FuzzyClock.App/MainWindow.xaml.cs` — clock type wiring, `OpenSettings()` subscriptions (lines 460–481), `ApplySettings()` Nixie branch (line 272), `SaveSettings()` (line 557), `GetCurrentSettingsSnapshot()` (line 412), `ApplyPhraseWrap()` stale `_dialMode` reference (line 718)
- `FuzzyClock.App/AppSettings.cs` — `DialMode` field confirmed present; `ClockType` absent
- `FuzzyClock.App/SettingsSnapshot.cs` — `DialMode` field confirmed present; `ClockType` absent
- `FuzzyClock.App/SettingsWindow.xaml.cs` — event declarations audited (lines 22–48); `DialModeChanged` present; seven events absent; `PopulateControls` reads `s.DialMode` at line 79
- `FuzzyClock.App/SettingsWindow.xaml` — 2-button Clock Style rail (Phrase / Dial) confirmed; `BtnNixie` absent
- `FuzzyClock.App/SettingsService.cs` — `DialMode → ClockType` migration at lines 53–61; reads from raw `JsonDocument` via `TryGetProperty`, not from deserialized record
- `FuzzyClock.App/ClockType.cs` — `Phrase / Dial / Lcd / Nixie` enum confirmed complete
- `FuzzyClock.App/TrayMenuBuilder.cs` — `_nixieClockItem` wired to `SetClockType(ClockType.Nixie)` confirmed
- `FuzzyClock.App/Controls/NixieClockView.xaml.cs` — self-contained 1s timer via `IsVisibleChanged` confirmed
- `FuzzyClock.App/Controls/NixieDigit.xaml.cs` — amber palette, ghost cathode four-level opacity, wire mesh texture, glass highlight confirmed
- `FuzzyClock.App/NixieSize.cs` — `NixieSizeMap.ToDigitHeight`: Small=40, Medium=56, Large=72 confirmed
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-RESEARCH.md` — primary phase research; full source audit
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-UI-SPEC.md` — UI design contract; accent isolation spec
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-01-PLAN.md` — Wave 1 task specification
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-02-PLAN.md` — Wave 2 task specification
- `.planning/PROJECT.md` — validated requirements NIX-01 through NIX-04

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
