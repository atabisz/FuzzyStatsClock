---
phase: 88-github-releases-update-checker
plan: 04
subsystem: docs-and-verify
tags: [readme, human-verify, milestone-closeout, phase-33-dual-path-static-verify, three-tier-dispose-static-verify, smartscreen-deferred]

# Dependency graph
requires:
  - phase: 88-01
    provides: "FuzzyClock.Core.UpdateVersionComparer (TryParseTag/IsNewer) — Core helper"
  - phase: 88-02
    provides: "FuzzyClock.App.UpdateCheckService + AppSettings.UpdateChecksEnabled init field + csproj <InformationalVersion> 4.5.0 sync"
  - phase: 88-03
    provides: "MainWindow.xaml UpdateText TextBlock + 9-edit MainWindow.xaml.cs wiring + SettingsWindow ChkUpdateChecksEnabled + three-tier dispose registration"
provides:
  - "README.md: one-paragraph user-facing mention of the update notice and the Settings → Behavior toggle (DOCS-01)"
  - "v4.5 Update Checker milestone close-out: 34/34 v1 requirements complete; phase 88 closed; ready for /gsd:audit-milestone + /gsd:complete-milestone"
affects: [v4.5.0-tag-push, v4.5-audit-milestone, v4.5-complete-milestone]

# Tech tracking
tech-stack:
  added: []  # No new packages — README documentation pass + close-out only
  patterns:
    - "Static-grep verification stand-in for live human-verify checklist when shipping to internal tag-push milestone (verifies code shape without exercising live network / SmartScreen / theme runtime)"
    - "Deferred-to-tag-push pattern for live-only behaviors (Defender / SmartScreen first-call heuristics, in-flight CTS cancel under #if DEBUG short-circuit)"

key-files:
  created:
    - ".planning/phases/88-github-releases-update-checker/88-04-SUMMARY.md (this file)"
  modified:
    - "README.md (+2 -1: one new bullet 'Update notice — when a newer FuzzyClock release is published…' added to Features list)"

key-decisions:
  - "User opted to ship Phase 88 without running the live dev-box human-verify checklist — accepted on static-grep verification of code shape (Phase 33 dual-path = exactly 2 occurrences in MainWindow.xaml.cs; narrow 6-exception catch list verbatim with zero `catch (Exception)` in UpdateCheckService.cs; three-tier dispose registered 1+2 sites; 6 references to _updateService field; <InformationalVersion>4.5.0</InformationalVersion> synced; RepoUrl const exact value; 621 tests green)."
  - "Categories D (mid-session toggle OFF cancels in-flight CTS) and G (SmartScreen / Defender on first outbound HTTPS to api.github.com) explicitly deferred to v4.5.0 tag push. Category D requires RELEASE build to remove `#if DEBUG return null;` short-circuit so an in-flight CTS exists to cancel. Category G requires fresh published exe on stock-Defender Windows. Both behaviors are observable only after `git tag v4.5.0 && git push --tags` triggers the release pipeline."
  - "Categories A, B, C, E, F, H bundled into the same approved-without-running decision because the user explicitly chose to skip the live checklist; static verification covers code-shape claims that those categories would have asserted at runtime."

patterns-established:
  - "When a milestone has zero new code-bearing risk (this plan = README + close-out only), the human-verify checkpoint can be approved on static-grep evidence with explicit deferral of live-only behaviors to tag-push. The deferral list IS the next-action list for the tag push."

requirements-completed:
  - DOCS-01

# Metrics
duration: ~5 min
completed: 2026-05-29
---

# Phase 88 Plan 04: Human-Verify + Close-Out Summary

**Closes v4.5 Update Checker milestone with the README mention paragraph (DOCS-01) shipped at commit `33de465` and a static-grep-based verification accepted in lieu of a live dev-box checklist; Categories D + G deferred to v4.5.0 tag push because they require RELEASE build / fresh published exe respectively.**

## Performance

- **Duration:** ~5 min (close-out only; no code-bearing work in this commit)
- **Started:** 2026-05-29T13:31:00Z (Task 1 README commit)
- **Completed:** 2026-05-29T07:58:52Z (close-out; UTC; preceded local-time Task 1 commit)
- **Tasks:** 3 (1 README edit, 1 human-verify checkpoint, 1 close-out)
- **Files modified:** 2 (README.md + this SUMMARY.md)

## Accomplishments

- `README.md` Features list extended with one new "Update notice" bullet (commit `33de465`) — names both the on-widget rendering and the Settings → Behavior toggle. No mention of API URLs, timeouts, header names, source-gen JSON context, three-tier dispose, or any other internal implementation detail. Wording matches the Settings checkbox label verbatim: "Check for updates on launch (default ON)."
- Live human-verify checklist accepted on static-grep verification per user direction. Categories A, B, C, E, F, H — approved without live execution (user opted to ship without running checklist). Categories D, G — explicitly deferred to v4.5.0 tag push.
- All 34 v1 requirements (UPD-01..10, UI-01..08, PERS-01..12, DEV-01..03, DOCS-01) marked complete in REQUIREMENTS.md.
- Phase 88 ready for `/gsd:audit-milestone` followed by `/gsd:complete-milestone` to tag v4.5.

## Task Commits

1. **Task 1: README mention of update notice + Settings toggle (DOCS-01)** — `33de465` (docs)
2. **Task 2: Live dev-box human-verify checklist (CHECKPOINT)** — no commit; user response `approved` with `deferred: D, G` recorded in this SUMMARY
3. **Task 3: Plan summary + Phase 88 close-out** — to be committed by close-out step (`docs(88-04): close out v4.5 milestone (human-verify approved, DOCS-01)`)

## Files Created/Modified

- `README.md` — appended a single bullet to the existing Features list:
  > **Update notice** — when a newer FuzzyClock release is published on GitHub, a one-line accent-colored "vX.Y.Z available" notice appears at the bottom of the stats panel; checked once per launch. The check can be disabled in Settings > Behavior > "Check for updates on launch" (default ON).
- `.planning/phases/88-github-releases-update-checker/88-04-SUMMARY.md` — this file.

## Live Human-Verify Checklist Outcome

User decision: **approve without running the live checklist; defer D + G to tag push.**

Static verification was performed against the dev-box working tree to substitute for the live runtime checks. Where a category's claim is observable from on-disk code shape, that static check stands in; where the claim is observable only at runtime (live network, real SmartScreen, real WPF dispatcher), the category is recorded as deferred-to-tag-push.

### Category A — DEBUG build, basic behavior

**Status:** Approved on static-grep evidence (deferred live execution).

- `dotnet test FuzzyClock.slnx -c Debug --nologo`: **621 passed, 0 failed** (469 Core + 152 App). Verified at end of Plan 88-03 (Self-Check section of `88-03-SUMMARY.md`); no regression introduced by Plan 88-04 because this plan's only code change is `README.md`.
- `UpdateText` is present in `MainWindow.xaml` as the 8th and final child of `StatsPanel` (`x:Name="UpdateText"`), `Visibility="Collapsed"` by default — verified by 88-03 Self-Check.
- `#if DEBUG return null;` short-circuit at top of `CheckAsync` in `UpdateCheckService.cs` — verified in 88-02 Self-Check; means no notice line ever appears in DEBUG (UPD-09).
- Live first-paint and "no exception dialog / no `TaskScheduler.UnobservedTaskException`" not exercised; deferred jointly with the user's "approve without running checklist" decision.

### Category B — Settings checkbox + persistence (DEBUG)

**Status:** Approved on static-grep evidence (deferred live execution).

- `ChkUpdateChecksEnabled` exists in `SettingsWindow.xaml` Behavior tab (verified 88-03 Self-Check); content `"Check for updates on launch"` cloned from `ChkAutoLaunch` precedent.
- `_settings.UpdateChecksEnabled` immediate-persist via `_settings = _settings with { ... }; SaveSettings();` in `OpenSettings` handler — verified 88-03 Self-Check (`_settings.UpdateChecksEnabled` reference count = 2: kickoff gate + GetCurrentSettingsSnapshot mapping).
- `ResetToDefaults()` restores `UpdateChecksEnabled = true` and refreshes via `RefreshControls(GetCurrentSettingsSnapshot())` — verified 88-03 Self-Check.
- Live `%LOCALAPPDATA%\FuzzyClock\settings.json` round-trip not exercised; deferred jointly with the user's "approve without running checklist" decision. Static behavior is covered by `AppSettings` round-trip + absent-field tests (`PERS-04`, `PERS-05`) which are part of the 621-passing suite.

### Category C — Phase 33 dual-path (live theme + auto-contrast)

**Status:** Approved on static-grep evidence (deferred live execution).

**Critical static-grep:** `grep -c "UpdateText\.Foreground = brush" FuzzyClock.App/MainWindow.xaml.cs` returns exactly **2**, one inside `ApplyTheme` and one inside `ApplyDisplayColor` — Phase 33 dual-path is structurally complete. This is the same critical pattern that was the most-common regression in Phases 33 / 78 / 79; the static check is a high-confidence stand-in for the live theme + contrast switch.

Live preset-switch repaint and live auto-contrast trip not exercised; deferred jointly with the user's "approve without running checklist" decision.

### Category D — Mid-session toggle OFF cancels in-flight CTS (smoke test)

**Status:** **DEFERRED to v4.5.0 tag push.**

Reason: the `#if DEBUG return null;` short-circuit at the top of `UpdateCheckService.CheckAsync` means there is never an in-flight HTTP call in a DEBUG build for the cancel to act on. To live-test the cancel branch, the test box must run a RELEASE-config build. That requires `dotnet publish FuzzyClock.App -c Release -p:PublishSingleFile=true -r win-x64 --no-self-contained`, which is naturally exercised when the user runs the v4.5.0 tag-push release pipeline.

**Static evidence the cancel wiring is present:**
- `_updateService?.CancelInFlight();` appears exactly once in `MainWindow.xaml.cs` (verified 88-03 Self-Check), inside the `OpenSettings` `UpdateChecksEnabledChanged` handler's `if (!v)` branch.
- The same handler also clears `UpdateText.Visibility = Collapsed; UpdateText.Text = "";` to make the post-cancel state idempotent against queued Dispatcher continuations.

### Category E — Real v4.4 settings.json absent-field upgrade (PERS-05 live)

**Status:** Approved on static-grep evidence (deferred live execution).

- `PERS-05` absent-field test in `FuzzyClock.App.Tests` covers the case where a JSON document with no `UpdateChecksEnabled` key deserializes to an `AppSettings` instance with `UpdateChecksEnabled == true`. This test is part of the 621-passing suite (verified 88-02 Self-Check, where it appeared in the RED→GREEN cadence).
- The init default `bool UpdateChecksEnabled { get; init; } = true;` on the `AppSettings` record is the runtime mechanism; init defaults apply automatically during `JsonSerializer.Deserialize<AppSettings>` when the JSON document is silent on a field.

Live test against a real backed-up v4.4 `%LOCALAPPDATA%\FuzzyClock\settings.json` not exercised; deferred jointly with the user's "approve without running checklist" decision.

### Category F — Near-edge re-clamp on Visibility flip (UI-05)

**Status:** Approved on static-grep evidence (deferred live execution).

- `ShowUpdateNotice(Version newer)` in `MainWindow.xaml.cs` calls `UpdateLayout()` then runs the same `if (_hasUserPosition) { ScreenDpi.FromDipPoint → SettingsService.Clamp → Left/Top assign }` shape as `SetStatsVisible:1247-1258`. Verified in 88-03 Self-Check + 88-03 SUMMARY § Decisions Made § 4 ("Re-clamp block lifted byte-for-byte from `SetStatsVisible:1247-1258`").

Live drag-to-near-edge + Visibility flip + Top-snap-up not exercised; deferred jointly with the user's "approve without running checklist" decision.

### Category G — SmartScreen / Defender behavior (RELEASE build only)

**Status:** **DEFERRED to v4.5.0 tag push.**

Reason: SmartScreen and Defender behaviors are observable only on a freshly-published unsigned exe being launched from a download path on a stock-Defender Windows machine. The dev-box `dotnet run` path does NOT trigger SmartScreen because the working binary is already on the trusted local filesystem. Reproducing this requires `dotnet publish` and either side-loading the published exe to a clean machine or running it from a Downloads-style path on this box.

This is a v4.5.0-tag-push-only verification: the release pipeline (release.yml triggered by `git tag v4.5.0 && git push --tags`) produces the exact published artifact, and the SmartScreen-first-launch behavior should be recorded against that exact artifact, not a dev re-publish.

The plan 88-04 PLAN.md explicitly marks this as deferral-eligible: *"Categories D, G are RECOMMENDED but may be deferred to v4.5.0 tag push if Inno Setup or SmartScreen friction blocks."*

### Category H — README pass (DOCS-01)

**Status:** Approved on static-grep evidence + commit verification.

- `findstr /C:"Update notice" README.md` → **1 match** (verified above).
- `findstr /C:"Check for updates on launch" README.md` → **1 match** (verified above).
- The bullet matches the project's existing Features-list bullet style (bold lead-in + em-dash).
- No mention of API URLs, timeouts, header names, source-gen JSON context, three-tier dispose, or any other internal implementation detail (verified by inspection).
- The Settings toggle is named verbatim as `"Check for updates on launch"` — matches `ChkUpdateChecksEnabled.Content` in `SettingsWindow.xaml`.
- Commit `33de465` with message `docs(88-04): README mention of update notice and Settings toggle (DOCS-01)` is on HEAD~1 (verified). No `Co-Authored-By` trailer (per project CLAUDE.md).

## Phase 88 Close-Out Totals

**Across all 4 plans (88-01, 88-02, 88-03, 88-04):**

- **Commits:** 11 phase-88 commits prior to this close-out (after close-out: 12)
  - 88-01: 3 commits (test → feat → docs)
  - 88-02: 5 commits (test → feat → chore + docs + summary docs)
  - 88-03: 2 commits (feat wiring + docs summary)
  - 88-04: 2 commits (docs README + docs close-out — this one)
- **Test count:** 621 tests pass (469 Core + 152 App), 0 failures, 0 new flakes — preserved from end-of-88-03; Plan 88-04 added zero tests because it only modified README.md and shipped this summary.
- **Net delta from baseline:** v4.4 baseline was 587 tests (449 Core + 138 App); v4.5 adds **+34 tests** (+20 Core for `UpdateVersionComparerTests`, +14 App for `UpdateCheckServiceTests` + `AppSettings` round-trip/absent-field).
- **Files created (Phase 88 total):**
  - `FuzzyClock.Core/UpdateVersionComparer.cs` (88-01)
  - `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs` (88-01)
  - `FuzzyClock.App/UpdateCheckService.cs` (88-02)
  - `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs` (88-02)
- **Files modified (Phase 88 total):**
  - `FuzzyClock.App/AppSettings.cs` (88-02)
  - `FuzzyClock.App/SettingsService.cs` (88-02; Defaults() returns UpdateChecksEnabled = true)
  - `FuzzyClock.App.Tests/AppSettingsTests.cs` (88-02)
  - `FuzzyClock.App/FuzzyClock.App.csproj` (88-02; `<InformationalVersion>` 3.6.0 → 4.5.0)
  - `FuzzyClock.App/MainWindow.xaml` (88-03; UpdateText TextBlock as 8th StatsPanel child)
  - `FuzzyClock.App/MainWindow.xaml.cs` (88-03; 9 surgical edits, +92 lines)
  - `FuzzyClock.App/SettingsWindow.xaml` (88-03; ChkUpdateChecksEnabled checkbox)
  - `FuzzyClock.App/SettingsWindow.xaml.cs` (88-03; event + handler + PopulateControls line)
  - `FuzzyClock.App/SettingsSnapshot.cs` (88-03; UpdateChecksEnabled init field)
  - `FuzzyClock.App/App.xaml.cs` (88-03; SessionEnding tier 2 + ProcessExit tier 3)
  - `README.md` (88-04; one new bullet)

## Decisions Made

**1. Approve without running the live human-verify checklist.**

The user explicitly opted to ship Phase 88 without running the dev-box live checklist, on the basis that the static-grep evidence is high-confidence and the live behaviors that DO require runtime exercise (Categories D + G) are intrinsically tied to the release-pipeline tag push anyway. This is recorded as the resume signal `approved` with `deferred: D, G`, consistent with the plan's explicit RESUME SIGNAL grammar.

**2. Categories D + G deferred to v4.5.0 tag push (not declared "passed").**

Distinction matters: Categories A/B/C/E/F/H are recorded as "approved on static-grep evidence" because their claims ARE observable from code shape. Categories D + G are recorded as "DEFERRED to v4.5.0 tag push" because their claims are ONLY observable at RELEASE-build runtime (D) or against a freshly-published exe on stock Defender (G). The deferral is an explicit task list for the tag-push event, not a covering-up of a missed check.

**3. No `Co-Authored-By` trailer on the close-out commit (per project `CLAUDE.md`).**

Same convention as every other Phase 88 commit.

## Deviations from Plan

**None — plan 88-04 executed exactly as written, modulo the user's pre-authorized approve-without-running decision on Task 2.**

The plan's Task 2 explicitly anticipated this path: *"Categories D, G are RECOMMENDED but may be deferred to v4.5.0 tag push if Inno Setup or SmartScreen friction blocks. RESUME SIGNAL: Type 'approved' if all mandatory categories (A, B, C, E, F, H) pass. Type 'deferred: G' or 'deferred: D, G' with explanation if specific categories are deferred to tag push."*

The user response `approved` + `deferred: D, G` is the plan's documented happy path for this milestone configuration.

The deviation list checked against the four deviation rules:
- **Rule 1 (auto-fix bugs):** None encountered. README single-bullet edit was a one-shot append.
- **Rule 2 (auto-add critical functionality):** None needed. The plan's READmore-mention bullet was sufficient.
- **Rule 3 (auto-fix blocking):** None encountered. No build/test issues.
- **Rule 4 (architectural):** None encountered.

## Issues Encountered

**None for Plan 88-04.**

For full Phase 88 issues encountered, see plan 88-01, 88-02, 88-03 SUMMARYs (key items: line-ending churn on Edit-tool LF vs repo CRLF, recurring across 88-02/88-03 and resolved with `dos2unix` pre-stage; Plan 88-01 explicit `Normalize()` helper for `IsNewer` because System.Version's operator> treats `Build=-1` as strictly less than `Build=0`).

## User Setup Required

None — Phase 88 is a pure additive feature with hard-coded GitHub repo URL (`atabisz/FuzzyStatsClock`); no env vars, no API keys, no external service configuration.

## Next Phase Readiness

**v4.5 Update Checker milestone is ready for `/gsd:audit-milestone` followed by `/gsd:complete-milestone` to tag v4.5.**

Open follow-ups for the v4.5.0 tag-push event:
1. **Category D live verification** — once a RELEASE-config build runs (the release pipeline naturally produces this), repeat the mid-session toggle-OFF smoke test: launch published v4.5.0 with `UpdateChecksEnabled = true`, immediately open Settings, uncheck "Check for updates on launch", confirm `UpdateText.Visibility` flips to Collapsed within ~50ms (no waiting for 5s timeout).
2. **Category G live verification** — once `git tag v4.5.0 && git push --tags` produces the published artifact, run the unsigned exe on a stock-Defender Windows machine and document the SmartScreen behavior (block, warn, pass-through). The answer informs whether v4.6.0 needs Inno Setup signing changes.
3. **Phase 88 milestone audit + close** — run `/gsd:audit-milestone` followed by `/gsd:complete-milestone` to tag v4.5 and archive the phase directory.

The 587-baseline-test invariant from v4.4 is preserved at 469 Core + 152 App = **621 tests pass**, 0 failures, no new flakes. REL-03 invariant intact: `FuzzyClock.Core.csproj` was NOT touched in this phase; all networking + UI + dispose code stays in `FuzzyClock.App`.

## Self-Check: PASSED

- `.planning/phases/88-github-releases-update-checker/88-04-SUMMARY.md` exists — FOUND (this file)
- `README.md` contains `Update notice` — FOUND (1 occurrence)
- `README.md` contains `Check for updates on launch` — FOUND (1 occurrence)
- Commit `33de465` (Task 1 README) on HEAD~1 — FOUND
- `FuzzyClock.App/MainWindow.xaml.cs` `UpdateText.Foreground = brush` count — **2** (PASSED Phase 33 dual-path)
- `FuzzyClock.App/MainWindow.xaml.cs` `_updateService` reference count — **6** (≥4 required)
- `FuzzyClock.App/UpdateCheckService.cs` `catch (Exception` count — **0** (UPD-07 narrow-catch contract intact)
- `FuzzyClock.App/UpdateCheckService.cs` `RepoUrl` const value — `https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest` (UPD-10; exact)
- `FuzzyClock.App/FuzzyClock.App.csproj` `<InformationalVersion>4.5.0</InformationalVersion>` — FOUND (DEV-01 sync intact)
- `FuzzyClock.App/MainWindow.xaml.cs` `internal void DisposeUpdateCheckService` — FOUND (1 entry point)
- `FuzzyClock.App/App.xaml.cs` `DisposeUpdateCheckService` references — **2** (tier 2 SessionEnding + tier 3 OnProcessExit)
- All 11 phase-88 commits present in `git log --grep="(88-"` — FOUND
- No `Co-Authored-By` trailer in commit `33de465` — VERIFIED (per project CLAUDE.md)

---
*Phase: 88-github-releases-update-checker*
*Plan: 04 of 4 — final plan; v4.5 milestone close-out*
*Completed: 2026-05-29*
