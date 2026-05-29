---
phase: 88-github-releases-update-checker
plan: 03
subsystem: app-ui-wiring
tags: [wpf, dispatcher, phase-33-dual-path, three-tier-dispose, settings-checkbox, settings-snapshot, http-client-cancel, persistence]

# Dependency graph
requires:
  - phase: 88-01
    provides: "FuzzyClock.Core.UpdateVersionComparer.IsNewer(Version, Version) — pure-static newer-than predicate"
  - phase: 88-02
    provides: "FuzzyClock.App.UpdateCheckService — CheckAsync()/CancelInFlight()/Dispose() public surface; AppSettings.UpdateChecksEnabled init-property"
provides:
  - "MainWindow.xaml: UpdateText TextBlock as 8th/final StatsPanel child (Visibility=Collapsed by default; cloned styling from TempsText byte-for-byte)"
  - "MainWindow.xaml.cs: _updateService field, ContentRendered ctor + PERS-12-gated kickoff, KickoffUpdateCheck async dispatcher pattern, ShowUpdateNotice with re-clamp, ApplyTheme + ApplyDisplayColor Phase 33 dual-touch, OnClosing tier 1 dispose, DisposeUpdateCheckService external entry point, OpenSettings event subscription with mid-session cancel, GetCurrentSettingsSnapshot projection, ResetToDefaults reset"
  - "SettingsWindow.xaml: ChkUpdateChecksEnabled checkbox in Behavior tab (cloned shape from ChkAutoLaunch)"
  - "SettingsWindow.xaml.cs: UpdateChecksEnabledChanged event, _suppressEvents-guarded handler, PopulateControls one-line update"
  - "SettingsSnapshot: UpdateChecksEnabled init-property field"
  - "App.xaml.cs: SessionEnding tier 2 + OnProcessExit tier 3 dispose wiring"
affects: [88-04-human-verify]

# Tech tracking
tech-stack:
  added: []  # No new packages — pure WPF wiring atop the in-box BCL surface from 88-02
  patterns:
    - "Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, async () => { ... }) for fire-and-forget kickoff that doesn't gate first paint"
    - "Outer try/catch (Exception) at the kickoff lambda boundary as defense-in-depth (UI-08) — service catches the narrow six-exception set, this prevents TaskScheduler.UnobservedTaskException"
    - "Dispatcher.Invoke marshalling for UI thread access from background continuation (UI-07)"
    - "Phase 33 dual-path foreground assignment — ApplyTheme + ApplyDisplayColor must touch the same set of accent-colored TextBlocks"
    - "SettingsService.Clamp re-clamp on visibility flip to keep widget on-screen when window height grows (UI-05; mirrors SetStatsVisible at MainWindow.xaml.cs:1247-1258)"
    - "Three-tier dispose registration: MainWindow.OnClosing (tier 1), App.SessionEnding (tier 2), AppDomain.CurrentDomain.ProcessExit (tier 3)"
    - "Mid-session cancel via _updateService.CancelInFlight() + UpdateText collapse on toggle OFF (PERS-10)"
    - "Construction-unconditional, kickoff-conditional pattern (PERS-12): service constructed always so dispose tiers never reference null; kickoff gated on _settings.UpdateChecksEnabled"

key-files:
  created: []
  modified:
    - "FuzzyClock.App/MainWindow.xaml (+14 lines: UpdateText TextBlock as 8th StatsPanel child)"
    - "FuzzyClock.App/MainWindow.xaml.cs (+92 lines: 9 surgical edits — service field, ContentRendered ctor + kickoff gate, KickoffUpdateCheck method, ShowUpdateNotice method, ApplyTheme dual-path, ApplyDisplayColor dual-path, OnClosing dispose tier 1, DisposeUpdateCheckService entry point, OpenSettings event subscription, GetCurrentSettingsSnapshot mapping, ResetToDefaults reset)"
    - "FuzzyClock.App/SettingsWindow.xaml (+8 lines: ChkUpdateChecksEnabled checkbox)"
    - "FuzzyClock.App/SettingsWindow.xaml.cs (+15 lines: event field + PopulateControls one-line + handler method)"
    - "FuzzyClock.App/SettingsSnapshot.cs (+4 lines: UpdateChecksEnabled init field with comment)"
    - "FuzzyClock.App/App.xaml.cs (+5 lines: SessionEnding tier 2 + OnProcessExit tier 3)"

key-decisions:
  - "Service constructed unconditionally in ContentRendered (PERS-12) — only the KickoffUpdateCheck() call is gated on _settings.UpdateChecksEnabled. This guarantees dispose tiers 2/3 never reference null and matches the locked CONTEXT decision: 'When _settings.UpdateChecksEnabled == false at launch: service constructed and registered for dispose, but no kickoff BeginInvoke is scheduled.'"
  - "Kickoff outer catch is catch (Exception) — DELIBERATE per UI-08 / Pitfall 9. The service itself uses the narrow six-exception catch list; the kickoff boundary catches everything as defense-in-depth so an unexpected bug doesn't surface as TaskScheduler.UnobservedTaskException. This is NOT a violation of UPD-07 — UPD-07 forbids catch (Exception) in the SERVICE; UI-08 explicitly REQUIRES it at the fire-and-forget boundary."
  - "ShowUpdateNotice synthesises 'v' prefix via $\"v{newer} available\" rather than passing the raw GitHub tag string through. Rationale: shape determinism — Version.ToString() always emits digits + dots, so the rendered text is always shape-clean (e.g. 'v9.9.9 available'). This is the (B) shape from RESEARCH §Open Questions Q5; (A) verbatim-tag would have required the service surface from 88-02 to return (Version, string) instead of just Version. We took (B) and accepted the slight loss of casing fidelity (the user-typed 'V4.6.0' becomes 'v4.6.0') because changing the service surface mid-phase would have been Rule 4 architectural creep."
  - "Re-clamp block (ShowUpdateNotice) lifted byte-for-byte from SetStatsVisible at MainWindow.xaml.cs:1247-1258 — UpdateLayout() then if (_hasUserPosition) { ScreenDpi.FromDipPoint center → SettingsService.Clamp → Left/Top assign }. Same shape, same call sites."
  - "Mid-session cancel handler clears UpdateText.Visibility AND .Text (not just Visibility). Rationale: the marshal-via-Dispatcher.Invoke path may have a queued ShowUpdateNotice scheduled at the moment the user toggles OFF; clearing Text=\"\" alongside Visibility=Collapsed makes the post-cancel state idempotent even if a queued continuation completes after the cancel."

patterns-established:
  - "UpdateText UI rendering: text + visibility set on Dispatcher.Invoke, re-clamp via SettingsService.Clamp, no Foreground touch (lives in ApplyTheme + ApplyDisplayColor per Phase 33)"
  - "PERS-12 launch-time gate pattern: construct service unconditionally, gate kickoff on persisted setting, dispose-register either way"
  - "PERS-10 mid-session cancel pattern: CancelInFlight() + Visibility.Collapsed + Text=\"\" (idempotent against in-flight continuations)"
  - "Three-tier dispose mirrors TemperatureService verbatim: tier 1 in OnClosing (next to _temperatureService?.Dispose()), tier 2 in App.SessionEnding (next to mw?.DisposeTemperatureService()), tier 3 in App.OnProcessExit (next to (MainWindow as MainWindow)?.DisposeTemperatureService() inside try/catch)"

requirements-completed:
  - UI-01
  - UI-02
  - UI-03
  - UI-04
  - UI-05
  - UI-06
  - UI-07
  - UI-08
  - PERS-06
  - PERS-07
  - PERS-08
  - PERS-09
  - PERS-10
  - PERS-11
  - PERS-12

# Metrics
duration: 7 min
completed: 2026-05-29
---

# Phase 88 Plan 03: UpdateText UI Wiring + Three-Tier Dispose Summary

**Wires UpdateCheckService (88-02) into the live widget: UpdateText TextBlock as the 8th StatsPanel child rendering accent-colored "vX.Y.Z available" notices, ChkUpdateChecksEnabled checkbox in Settings → Behavior, full Phase 33 dual-path foreground integration, three-tier dispose registration mirroring TemperatureService, mid-session toggle cancellation, and re-clamp on visibility flip — all 15 UI/PERS requirements complete with zero new tests and zero regressions on the 621-test baseline.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-29T03:17:45Z
- **Completed:** 2026-05-29T03:24:17Z
- **Tasks:** 5 (XAML edits, settings infra, MainWindow wiring, App dispose, summary)
- **Files modified:** 6 (no new files; all surgical additions)
- **Lines added:** +138 (additive only; zero deletions)

## Accomplishments

- `UpdateText` TextBlock added as the 8th and final child of `StatsPanel` in `MainWindow.xaml`, immediately below `TempsText`. Styling cloned byte-for-byte from `TempsText`/`UptimeText`: `Margin="0,2,0,0"`, `FontFamily="Segoe UI Light"`, `FontSize="11"`, `TextAlignment="Left"`, design-time `Foreground="White"`, `Text=""`. Only delta vs `TempsText`: explicit `Visibility="Collapsed"` (vs default `Visible`).
- `ChkUpdateChecksEnabled` checkbox added to `SettingsWindow.xaml` Behavior tab cloning the `ChkAutoLaunch` shape: `Content="Check for updates on launch"`, `Margin="0,4,0,0"`, both `Checked` and `Unchecked` events wired to `ChkUpdateChecksEnabled_Changed`.
- `SettingsSnapshot.UpdateChecksEnabled` init-property field added.
- `SettingsWindow.xaml.cs`: new `public event Action<bool>? UpdateChecksEnabledChanged`, `_suppressEvents`-guarded `ChkUpdateChecksEnabled_Changed` handler, and `PopulateControls` line `ChkUpdateChecksEnabled.IsChecked = s.UpdateChecksEnabled;` — all cloned from the `ChkAutoLaunch` precedent.
- `MainWindow.xaml.cs`: 9 discrete surgical edits applied atomically:
  1. Service field `_updateService` next to `_temperatureService`
  2. `ContentRendered` ctor (unconditional) + `if (_settings.UpdateChecksEnabled) KickoffUpdateCheck()` gate (PERS-12)
  3. New `KickoffUpdateCheck()` method using `Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, async () => { ... })` with outer `catch (Exception)` defense (UI-06/UI-07/UI-08)
  4. New `ShowUpdateNotice(Version newer)` method: sets `UpdateText.Text = $"v{newer} available"`, flips visibility, re-clamps via `SettingsService.Clamp` mirroring `SetStatsVisible:1247-1258` (UI-02/UI-03/UI-05)
  5. `ApplyTheme`: `UpdateText.Foreground = brush;` added immediately below the `TempsText.Foreground` line (UI-04 — half 1/2 of Phase 33 dual-path)
  6. `ApplyDisplayColor`: `UpdateText.Foreground = brush;` added immediately below the `TempsText.Foreground` line (UI-04 — half 2/2 of Phase 33 dual-path)
  7. `OnClosing`: `_updateService?.Dispose();` immediately below the `_temperatureService?.Dispose();` line (UPD-08 tier 1)
  8. `internal void DisposeUpdateCheckService() => _updateService?.Dispose();` external entry point next to `DisposeTemperatureService`
  9. `OpenSettings`: `UpdateChecksEnabledChanged` event subscription with `_settings = _settings with { ... }; SaveSettings();` immediate-persist plus mid-session cancel branch when `v == false` (PERS-09 + PERS-10)
  10. `GetCurrentSettingsSnapshot`: `UpdateChecksEnabled = _settings.UpdateChecksEnabled` projection (PERS-08)
  11. `ResetToDefaults`: `UpdateChecksEnabled = true,` line in the existing with-expression (PERS-11)
- `App.xaml.cs`: `SessionEnding` lambda extended with `mw?.DisposeUpdateCheckService();` (tier 2); `OnProcessExit` extended with `try { (MainWindow as MainWindow)?.DisposeUpdateCheckService(); } catch { }` (tier 3) — both lines mirror the `TemperatureService` ones byte-for-byte and live immediately below them.
- Build: 0 errors, 1 pre-existing warning (MSTEST0037 in `TemperatureServiceTests.cs:65`, unrelated to Phase 88).
- Test suite: **621 passed, 0 failed** (469 Core + 152 App). No new tests added per plan; UI wiring will be exercised live in Plan 88-04 human-verify.

## Task Commits

1. **Tasks 1+2+3+4: Wiring (XAML + settings infra + MainWindow + App dispose)** — `e7ea49c` (`feat(88-03): wire UpdateText UI + Settings checkbox + three-tier dispose`)
2. **Task 5: Plan summary** — to be committed by the executor's final-commit step (`docs`)

Per plan, all wiring lands in a single logical commit because the build is red on missing symbols across the 4 file groups; splitting was attempted only to keep the action sections readable.

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml` — appended `<TextBlock x:Name="UpdateText">` as the 8th and final child of `StatsPanel`, immediately below `TempsText`. Styling cloned byte-for-byte; only `Visibility="Collapsed"` differs vs `TempsText`.
- `FuzzyClock.App/MainWindow.xaml.cs` — 9 surgical edits (~92 lines added). Field, ContentRendered ctor + kickoff, two new methods, two dual-path lines, OnClosing dispose, external entry point, OpenSettings subscription with mid-session cancel, snapshot mapping, ResetToDefaults reset.
- `FuzzyClock.App/SettingsWindow.xaml` — appended `<CheckBox x:Name="ChkUpdateChecksEnabled">` immediately below `ChkAutoLaunch` in the Behavior tab.
- `FuzzyClock.App/SettingsWindow.xaml.cs` — appended `event UpdateChecksEnabledChanged` + `PopulateControls` line + `ChkUpdateChecksEnabled_Changed` handler. All three additions cloned from the existing `ChkAutoLaunch` precedent.
- `FuzzyClock.App/SettingsSnapshot.cs` — appended `UpdateChecksEnabled { get; init; }` field with comment.
- `FuzzyClock.App/App.xaml.cs` — appended one line in `SessionEnding` lambda (tier 2) and one try/catch line in `OnProcessExit` (tier 3). Both mirror their `TemperatureService` siblings byte-for-byte.

## Decisions Made

**1. Service constructed unconditionally; kickoff conditionally (PERS-12).**

The `_updateService = new UpdateCheckService();` line in `ContentRendered` runs regardless of `_settings.UpdateChecksEnabled`. This guarantees dispose tiers 2/3 (`mw?.DisposeUpdateCheckService();`) never reference a null `_updateService` field. The PERS-12 gate is on the *kickoff*, not the construction:

```csharp
_updateService = new UpdateCheckService();
if (_settings.UpdateChecksEnabled)
{
    KickoffUpdateCheck();
}
```

This matches the locked CONTEXT decision verbatim: *"When `_settings.UpdateChecksEnabled == false` at launch: service constructed and registered for dispose, but no kickoff `BeginInvoke` is scheduled."*

**2. Outer `catch (Exception)` at kickoff IS deliberate (UI-08).**

UPD-07 forbids `catch (Exception)` in the SERVICE — that's the narrow-catch contract for `CheckAsync`. UI-08 explicitly REQUIRES `catch (Exception)` at the fire-and-forget boundary of the kickoff async lambda — different code, different rule. RESEARCH.md Pitfall 9 calls this out: *"The outer kickoff catch is defense in depth, not error suppression."* The kickoff explanatory comment makes the intent unambiguous.

**3. `$"v{newer} available"` synthesis chosen over verbatim tag passthrough.**

RESEARCH §Open Questions Q5 noted two acceptable shapes — (A) verbatim GitHub tag (would require service to return `(Version, string)` instead of `Version`); (B) `$"v{newer} available"` synthesis. Picked (B): the service surface from 88-02 already returns `Task<Version?>`, and changing it mid-phase to surface the raw tag would be Rule 4 architectural creep. Cost: a user-typed `V4.6.0` would render as `v4.6.0` (lowercase v, all-numeric components). Acceptable per CONTEXT's "Claude's Discretion" allowance on render shape.

**4. Re-clamp block lifted byte-for-byte from `SetStatsVisible:1247-1258`.**

`ShowUpdateNotice` calls `UpdateLayout()` then runs the same `if (_hasUserPosition) { ScreenDpi.FromDipPoint → SettingsService.Clamp → Left/Top assign }` shape. UI-05 specifically called for this — re-using the proven re-clamp helper rather than inventing a new one.

**5. Mid-session cancel handler clears Text alongside Visibility.**

```csharp
if (!v)
{
    _updateService?.CancelInFlight();
    UpdateText.Visibility = Visibility.Collapsed;
    UpdateText.Text = "";
}
```

Both Text=`""` and Visibility=Collapsed are set — idempotent against the race where the user toggles OFF while a `ShowUpdateNotice` continuation is queued on the Dispatcher. Even if the queued continuation runs *after* `CancelInFlight()` (because the HTTP call already completed but the Dispatcher.Invoke is queued), the visible end-state is collapsed-and-empty.

**6. Used `FuzzyClock.slnx` (not the planner-cited `FuzzyStatsClock.slnx`) for build/test.**

Plan referred to `FuzzyStatsClock.slnx` in Task 3 + Task 4 build commands, but the actual repo solution file is `FuzzyClock.slnx`. Single one-character correction; verified all projects + tests build/run as expected.

## Patterns

- **Phase 33 dual-path enforcement:** Every accent-colored TextBlock added to the StatsPanel hierarchy must have its `Foreground = brush;` assignment in BOTH `ApplyTheme` AND `ApplyDisplayColor`. Verified post-commit: `grep -c "UpdateText\.Foreground = brush" MainWindow.xaml.cs` returns exactly **2**, with one match inside `ApplyTheme` and one inside `ApplyDisplayColor`.
- **Three-tier dispose mirror pattern:** Each new disposable that needs shutdown coverage adds three sibling lines next to the existing `TemperatureService` ones — tier 1 next to `_temperatureService?.Dispose()` in `OnClosing`; tier 2 next to `mw?.DisposeTemperatureService()` in `App.SessionEnding`; tier 3 next to `(MainWindow as MainWindow)?.DisposeTemperatureService()` inside `OnProcessExit`'s `try/catch`. Every service that follows this pattern gets the `internal void Dispose<Service>() => _<service>?.Dispose();` external entry point so `App.xaml.cs` doesn't need direct field access.
- **Construct-unconditional, gate-conditional pattern:** Services with optional kickoff (e.g. user toggle off at launch) construct unconditionally and gate only the activation call. This avoids null-check landmines in dispose tiers and keeps the service lifecycle uniform across launch-on / launch-off scenarios.
- **PopulateControls + `_suppressEvents` clone pattern for new checkboxes:** Every new `<CheckBox>` follows the four-line clone — XAML element, event field declaration, populate-controls IsChecked line (inside `_suppressEvents`-guarded block), handler method (with `_suppressEvents` early-return).

## Deviations from Plan

**Single one-character solution-file correction.**

Plan's Task 3 and Task 4 both cite `dotnet build FuzzyStatsClock.slnx`, but the live solution file is `FuzzyClock.slnx`. Verified by `ls *.slnx`. Used the correct filename. No other deviations encountered.

The deviation list checked against the four deviation rules:
- **Rule 1 (auto-fix bugs):** None encountered. Build went green on first attempt after all 9 MainWindow edits + 2 App edits applied.
- **Rule 2 (auto-add critical functionality):** None needed. Plan + RESEARCH was thorough.
- **Rule 3 (auto-fix blocking):** Solution-filename typo (filename mismatch with reality) was caught via `MSB1009` build error and resolved in <30 seconds with no impact on plan content.
- **Rule 4 (architectural):** None.

## Issues Encountered

**Line-ending churn on edited Windows files (recurring from 88-02).**

Same pattern as 88-02: Edit tool emits LF; on-disk repo is CRLF (autocrlf inert). Used `dos2unix --quiet` on each modified file before staging. All 6 modified files are now LF on disk, matching the index's `i/lf w/lf` convention after the dos2unix pass. Resulting commit diff is clean +138 / -0 (additive only).

**No new tests added.**

Plan explicitly stated: *"No new tests required — UI wiring is hand-verified live (Plan 88-04 owns that)."* Honored. The Phase 33 dual-path is asserted by the post-commit `grep` checks (must equal 2); the three-tier dispose is asserted by the post-commit `findstr` checks; mid-session cancel is asserted by the live human-verify in 88-04.

## User Setup Required

None — pure UI wiring atop the service from 88-02. No environment variables, no external service configuration, no manual installation.

## Next Phase Readiness

**Hand-off note for Plan 88-04 (human-verify + close-out + README):**

The complete UI wiring is on master at commit `e7ea49c`. Plan 88-04's human-verify checklist will exercise — in roughly this order:

1. **Phase 33 dual-path live test** — set Auto-Contrast OFF, change accent color preset → assert `UpdateText` foreground tracks (currently invisible because no notice should be triggered in DEBUG, but the brush is still applied; visible after triggering the next item). Then set Auto-Contrast ON over a contrasting wallpaper → assert foreground re-paints when sampler trips.
2. **Live notice render** — temporarily flip the `#if DEBUG return null;` short-circuit in `UpdateCheckService.CheckAsync` (or run a Release-config build), launch widget, observe "v{tag} available" appears below TempsText with full-alpha accent within 1–2s of launch, no first-paint delay. Restore the `#if DEBUG`.
3. **Re-clamp behavior** — drag the widget to within 13px of the bottom edge, trigger an update notice (Release config or temporary `#if DEBUG` removal), assert `Top` snaps upward by ~13px so the notice doesn't clip off-screen.
4. **Mid-session cancel** — launch with `UpdateChecksEnabled = true` in settings.json, immediately open Settings → Behavior, uncheck "Check for updates on launch" within ~1s of launch, wait 5s — assert no notice ever appears. Settings.json now has `"UpdateChecksEnabled": false`.
5. **Launch-with-OFF flow (PERS-12)** — with `"UpdateChecksEnabled": false` in settings.json, launch widget → assert no `UpdateText` ever appears (kickoff skipped); also assert app exits cleanly (dispose tiers still fired because service was constructed).
6. **ResetToDefaults** — open Settings → click "Reset to Defaults" tray menu (if exposed) → assert `ChkUpdateChecksEnabled` flips back to checked AND settings.json updates accordingly.
7. **Three-tier dispose smoke** — launch, close via tray Quit → assert clean exit (tier 1). Launch, log off Windows → assert clean (tier 2). Launch, kill via Task Manager → assert no orphan socket / no `ObjectDisposedException` in event log (tier 3 is best-effort within ProcessExit's 2s budget).
8. **Absent-field upgrade** — load a v4.4 settings.json (no `UpdateChecksEnabled` key) → assert v4.5 reads it as `true` (PERS-01 default-init flow from 88-02).
9. **README pass** — append the one-line bullet to README.md per RESEARCH §16: *"Update notice — when a newer FuzzyClock release is published on GitHub, a one-line accent-colored 'vX.Y.Z available' notice appears at the bottom of the stats panel; checked once per launch. The check can be disabled in Settings > Behavior > 'Check for updates on launch' (default ON)."*

The 587-baseline-test invariant from v4.4 is preserved at 469 Core + 152 App = **621 tests pass**, 0 failures, no new flakes.

REL-03 invariant intact: `FuzzyClock.Core.csproj` was NOT touched in this plan; all networking + UI + dispose code stays in `FuzzyClock.App`.

## Self-Check: PASSED

- `FuzzyClock.App/MainWindow.xaml` contains `x:Name="UpdateText"` — FOUND (1 occurrence)
- `FuzzyClock.App/SettingsWindow.xaml` contains `x:Name="ChkUpdateChecksEnabled"` — FOUND (1 occurrence)
- `FuzzyClock.App/SettingsSnapshot.cs` contains `UpdateChecksEnabled` — FOUND (2 occurrences: comment + field)
- `FuzzyClock.App/SettingsWindow.xaml.cs` contains `UpdateChecksEnabledChanged`, `ChkUpdateChecksEnabled_Changed`, `ChkUpdateChecksEnabled.IsChecked` — FOUND (4 occurrences total)
- `FuzzyClock.App/MainWindow.xaml.cs` `UpdateText.Foreground = brush` count — **2** (PASSED Phase 33 dual-path; one in ApplyTheme, one in ApplyDisplayColor)
- `FuzzyClock.App/MainWindow.xaml.cs` `_updateService` count — **6** (≥4 required: field + ContentRendered ctor + kickoff gate + OpenSettings cancel + OnClosing dispose + DisposeUpdateCheckService)
- `FuzzyClock.App/MainWindow.xaml.cs` `CancelInFlight` count — **1** (in OpenSettings UpdateChecksEnabledChanged handler)
- `FuzzyClock.App/MainWindow.xaml.cs` `_settings.UpdateChecksEnabled` references — **2** (kickoff gate + GetCurrentSettingsSnapshot mapping)
- `FuzzyClock.App/App.xaml.cs` `DisposeUpdateCheckService` count — **2** (tier 2 + tier 3)
- Commit `e7ea49c` (wiring) — FOUND on HEAD~1
- `dotnet build FuzzyClock.slnx -c Debug`: 0 errors, 1 pre-existing warning — VERIFIED
- `dotnet test FuzzyClock.slnx -c Debug`: 469 Core + 152 App = **621 passed, 0 failed** — VERIFIED
- No `Co-Authored-By` trailer in commit `e7ea49c` — VERIFIED (per project CLAUDE.md)
- No new files created (Plan 88-03 is pure surgical edits) — VERIFIED

---
*Phase: 88-github-releases-update-checker*
*Plan: 03 of 4*
*Completed: 2026-05-29*
