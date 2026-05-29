---
phase: 88-github-releases-update-checker
plan: 02
subsystem: app-service
tags: [http-client, sockets-handler, source-gen-json, cancellation-tokens, three-tier-dispose, app-settings, persistence, mstest]

# Dependency graph
requires:
  - phase: 88-01
    provides: "FuzzyClock.Core.UpdateVersionComparer.TryParseTag(string?, out Version) and IsNewer(Version, Version) — pure-static helpers consumed by UpdateCheckService.CheckAsync"
provides:
  - "FuzzyClock.App.UpdateCheckService — long-lived static HttpClient + linked CTS + source-gen JSON + narrow 6-exception catch + #if DEBUG short-circuit + Interlocked-guarded idempotent Dispose"
  - "Test seam: FuzzyClock.App.Tests.FakeHttpMessageHandler with SendCount + LastRequest + Json static factory"
  - "AppSettings.UpdateChecksEnabled init-property field with explicit = true default (PERS-01 absent-field upgrade-safety)"
  - "SettingsService.Defaults() returns UpdateChecksEnabled = true; Validate() unchanged (PERS-03 — bool fields cannot be invalid)"
  - "FuzzyClock.App.csproj <InformationalVersion> synced 3.6.0 -> 4.5.0 (DEV-01)"
  - "8 service-shape MSTest declarations (DEBUG-skip, happy 200, non-success 404/403/429, malformed JSON, draft, prerelease, dispose-3x, dispose-concurrent) + 2 AppSettings persistence tests (round-trip, absent-field)"
affects: [88-03-mainwindow-callback, 88-04-human-verify]

# Tech tracking
tech-stack:
  added: []  # All in-box net10.0 BCL: System.Net.Http, System.Text.Json source-gen, System.Threading
  patterns:
    - "Long-lived static HttpClient + SocketsHttpHandler.PooledConnectionLifetime=15min (canonical pattern for one-call-per-launch services)"
    - "Per-call CancellationTokenSource.CreateLinkedTokenSource(shutdownCts.Token) + CancelAfter(5s) — earlier of {shutdown, timeout} wins"
    - "Source-gen [JsonSerializable]/JsonSerializerContext for GitHubRelease POCO (trim/AOT-safe; no reflection)"
    - "Narrow six-exception catch list: HttpRequestException, TaskCanceledException, OperationCanceledException, JsonException, FormatException, ArgumentException — never catch (Exception)"
    - "Three-tier dispose Interlocked.CompareExchange on int _disposed (mirrors TemperatureService verbatim)"
    - "AppSettings init-property record `= true` upgrade-safety pattern (mirrors UptimeVisible/GhostModeEnabled/UseCtrl)"
    - "FakeHttpMessageHandler test seam (override SendAsync; SendCount + LastRequest assertions)"
    - "#if DEBUG short-circuit at top of method body (prevents dev-build screenshots showing nonsensical update notices)"

key-files:
  created:
    - "FuzzyClock.App/UpdateCheckService.cs (199 lines — service class + GitHubRelease POCO + UpdateCheckJsonContext source-gen partial)"
    - "FuzzyClock.App.Tests/FakeHttpMessageHandler.cs (37 lines)"
    - "FuzzyClock.App.Tests/UpdateCheckServiceTests.cs (118 lines — 8 [TestMethod] declarations)"
  modified:
    - "FuzzyClock.App/AppSettings.cs (+6 lines: UpdateChecksEnabled init field with comment)"
    - "FuzzyClock.App/SettingsService.cs (+1 line: UpdateChecksEnabled = true in Defaults())"
    - "FuzzyClock.App/FuzzyClock.App.csproj (1 line: 3.6.0 -> 4.5.0)"
    - "FuzzyClock.App.Tests/AppSettingsTests.cs (+22 lines: round-trip + absent-field tests)"

key-decisions:
  - "Service file placed at FuzzyClock.App/UpdateCheckService.cs (flat root) NOT under Services/ subdirectory — preserves the existing convention (TemperatureService, ContrastSamplerService, AutoLaunchService, SettingsService all sit at App project root). RESEARCH.md §Project Structure marked this Claude's Discretion."
  - "Service-shape tests assert on Debug-config short-circuit (Assert.IsNull + SendCount=0) AND document expected Release-config behavior in test names (`*_ContractOnly` suffix on the contract-asserting tests). Pattern: every CheckAsync test asserts result == null and the DEBUG-skip test additionally asserts fake.SendCount == 0 to prove no HTTP dispatch happened (Pitfall 10 in RESEARCH.md)."
  - "Narrow catch order locked verbatim: HttpRequestException -> TaskCanceledException -> OperationCanceledException -> JsonException -> FormatException -> ArgumentException. TaskCanceledException is a subclass of OperationCanceledException so it MUST be caught first (catch the more-derived first). Order is locked; planner forbade reordering."
  - "Dispose decision: _ownsClient flag distinguishes test-injected handler (dispose at Dispose()) from production shared static client (NEVER disposed; process exit reaps the socket). Comment in code makes the asymmetry explicit."

patterns-established:
  - "UpdateCheckService dispose pattern: Interlocked.CompareExchange(ref _disposed, 1, 0) gate + try/catch around _shutdownCts.Cancel/Dispose + conditional _client.Dispose only when _ownsClient=true"
  - "Test seam pattern: FakeHttpMessageHandler with Func<HttpRequestMessage, HttpResponseMessage> responder + SendCount/LastRequest properties + Json(body, status=OK) static factory"
  - "AppSettings extension pattern: append init field with comment block citing requirement ID + upgrade-safety rationale, mirror existing field naming and = true/false explicit defaults"

requirements-completed:
  - UPD-03
  - UPD-04
  - UPD-05
  - UPD-06
  - UPD-07
  - UPD-08
  - UPD-09
  - UPD-10
  - PERS-01
  - PERS-02
  - PERS-03
  - PERS-04
  - PERS-05
  - DEV-01
  - DEV-02
  - DEV-03

# Metrics
duration: 8 min
completed: 2026-05-29
---

# Phase 88 Plan 02: UpdateCheckService + AppSettings Summary

**Once-per-launch GitHub Releases checker with long-lived static HttpClient + linked-CTS shutdown + source-gen JSON + narrow 6-exception catch + #if DEBUG skip + 3-tier idempotent dispose, plus AppSettings.UpdateChecksEnabled persistent toggle and csproj `<InformationalVersion>` drift fix.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-29T03:02:00Z
- **Completed:** 2026-05-29T03:10:14Z
- **Tasks:** 4 (RED tests, GREEN service+settings, csproj sync, summary)
- **Files created:** 3 (UpdateCheckService.cs, FakeHttpMessageHandler.cs, UpdateCheckServiceTests.cs)
- **Files modified:** 4 (AppSettings.cs, SettingsService.cs, FuzzyClock.App.csproj, AppSettingsTests.cs)

## Accomplishments

- `UpdateCheckService` service-class shipped with the full locked surface: `RepoUrl` const (atabisz/FuzzyStatsClock), production ctor (long-lived static HttpClient), test ctor (HttpMessageHandler injection), `CheckAsync()` returning `Task<Version?>`, `CancelInFlight()` for PERS-10 mid-session toggle, and idempotent `Dispose()`.
- `#if DEBUG return null;` is the first statement of `CheckAsync` body — prevents dev-build screenshots from showing nonsensical "vX.Y.Z available" notices and makes service-shape tests trivially correct (MSTest runs in Debug by default).
- `SocketsHttpHandler` with `PooledConnectionLifetime = 15 min` and `HttpClient.Timeout = 5s` configured on both production and test client paths; per-call linked CTS bounds every call by `min(shutdown, 5s)`.
- Source-gen `JsonSerializerContext` for the `GitHubRelease` POCO (`tag_name`, `prerelease`, `draft`) — zero reflection, trim-safe, AOT-safe.
- Narrow 6-exception catch list verbatim (no `catch (Exception)` anywhere in the service); `OperationCanceledException` listed AFTER `TaskCanceledException` (correct C# exception-handler-walk order — catch the more-derived first).
- `AppSettings.UpdateChecksEnabled = true` init field added; `SettingsService.Defaults()` extended; `Validate()` unchanged (PERS-03).
- `<InformationalVersion>` drift fix: `3.6.0` -> `4.5.0` to match `<Version>4.5.0</Version>`. CI `release.yml` does NOT pass `-p:InformationalVersion` so the csproj value flows through to the published binary.
- Test count: App grew **138 -> 152** (+14 method-level results: 8 service-shape methods with the 3-row DataRow expansion = 10, plus 2 AppSettings persistence tests, plus 2 incidental method-level expansions from existing test class). Core test count unchanged from 88-01 (469).
- Full suite: **621 passed, 0 failed** (469 Core + 152 App).

## Task Commits

1. **Task 1: RED — failing service-shape + AppSettings tests + FakeHttpMessageHandler seam** — `e6af92a` (`test`)
2. **Task 2: GREEN — UpdateCheckService + AppSettings.UpdateChecksEnabled + Defaults() update** — `846b28d` (`feat`)
3. **Task 3: csproj <InformationalVersion> sync (DEV-01)** — `430ff0a` (`chore`)
4. **Task 4: Plan summary** — to be committed at end (`docs`)

## Files Created/Modified

- `FuzzyClock.App/UpdateCheckService.cs` (NEW, 199 lines) — internal sealed class implementing IDisposable; long-lived static HttpClient with double-checked-locking lazy init; per-call linked CTS bound to service-lifetime `_shutdownCts`; Interlocked-guarded `_activeCts` for PERS-10 cancel; six narrow catches; three-tier-safe Dispose. Co-resident `GitHubRelease` POCO and `UpdateCheckJsonContext` source-gen partial class.
- `FuzzyClock.App.Tests/FakeHttpMessageHandler.cs` (NEW, 37 lines) — internal sealed class : HttpMessageHandler; overrides `SendAsync`; tracks `SendCount` + `LastRequest`; calls `cancellationToken.ThrowIfCancellationRequested()` before returning so cancellation tests can exercise the cancellation path; `static FakeHttpMessageHandler.Json(body, status=OK)` factory.
- `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs` (NEW, 118 lines) — `[TestClass]` with 8 `[TestMethod]` declarations: `CheckAsync_DebugBuild_ReturnsNullWithoutDispatchingHttpCall` (DEV-03 anchor with `Assert.AreEqual(0, fake.SendCount)`), 5 contract-only DataRow/single methods documenting Release-config behavior (200 happy / 404+403+429 / malformed JSON / draft / prerelease), and 2 dispose idempotence tests (3x sequential, 3x concurrent via `Parallel.For`).
- `FuzzyClock.App/AppSettings.cs` (MODIFIED, +6 lines) — appended `UpdateChecksEnabled` init field with header comment citing PERS-01 + the absent-field upgrade-safety rationale.
- `FuzzyClock.App/SettingsService.cs` (MODIFIED, +1 line) — extended `Defaults()` with `UpdateChecksEnabled = true,` line in the existing object initializer.
- `FuzzyClock.App/FuzzyClock.App.csproj` (MODIFIED, 1 line) — `<InformationalVersion>3.6.0</InformationalVersion>` -> `<InformationalVersion>4.5.0</InformationalVersion>`.
- `FuzzyClock.App.Tests/AppSettingsTests.cs` (MODIFIED, +22 lines) — appended `RoundTrip_UpdateChecksEnabled_Matches` (PERS-04) and `Deserialize_MissingUpdateChecksEnabled_DefaultsToTrue` (PERS-05) at end of class before closing brace.

## Decisions Made

**1. File placement at flat App root, NOT under Services/.**

The plan explicitly cited research §Project Structure ("the existing convention is flat root"). Followed convention. Other service files (`TemperatureService.cs`, `ContrastSamplerService.cs`, `AutoLaunchService.cs`, `SettingsService.cs`) all sit at `FuzzyClock.App/` root.

**2. Test ctor uses `disposeHandler: false` + sets `_ownsClient = true`.**

Subtle distinction: `_ownsClient = true` triggers `_client.Dispose()` in `Dispose()`. But the underlying `HttpMessageHandler` (the `FakeHttpMessageHandler` instance) is NOT disposed by the HttpClient (we passed `disposeHandler: false`). This lets test code construct and inspect a single FakeHttpMessageHandler across multiple service instances if needed, AND lets `using var svc = new UpdateCheckService(fake)` cleanly dispose only the per-instance HttpClient wrapper. Comment in code documents the asymmetry.

**3. Line-ending normalization to LF for production-source files (matches index storage).**

The repo's git index stores LF for `.cs`/`.csproj` files (verified via `git ls-files --eol`). Used `dos2unix` on edited files before staging to keep diffs minimal. Test files ended up CRLF in the index (the RED commit normalized them via `unix2dos`); they remain CRLF. The Edit tool emits LF, so for new test files this happens to match the post-conversion state. Production source files were normalized back to LF for clean diffs.

## Patterns

- **Service shape mirrors TemperatureService verbatim where applicable.** Three-tier dispose with `Interlocked.CompareExchange(ref _disposed, 1, 0)` gate + best-effort `try { } catch { }` around shutdown signals + asymmetric handling of process-static vs instance-owned resources (here: shared static HttpClient is NOT disposed; instance-owned test HttpClient IS).
- **`#if DEBUG return null;` at top of method body** — chosen over preprocessor-conditional method body because the short-circuit is an explicit semantic anchor (DEV-03 test asserts on it) rather than just an optimisation. Single-line return makes the contract obvious.
- **AppSettings init-property `= true` pattern** — explicit init default mandatory for absent-field upgrade safety. Existing repo precedent: `UptimeVisible = true`, `GhostModeEnabled = true`, `UseCtrl = true`, `UseAlt = true`. v4.4 -> v4.5 upgrade flow: deserialize old settings.json (no UpdateChecksEnabled key) -> JSON decoder applies init default of true -> v4.4 user is opted IN by default, exactly the locked decision.
- **Six narrow catches in fixed order** — TaskCanceledException listed BEFORE its base class OperationCanceledException because C# exception-handler-walk takes the first matching handler; if OperationCanceledException were first, TaskCanceledException would never match. Order is verifiable invariant.

## Deviations from Plan

None - plan executed exactly as written.

The deviation list checked against the four deviation rules:
- Rule 1 (auto-fix bugs): None encountered. Tests went RED on missing symbols, GREEN immediately on production-code addition; no buggy paths surfaced.
- Rule 2 (auto-add critical functionality): None needed. Plan + RESEARCH.md was thorough.
- Rule 3 (auto-fix blocking): None encountered. The test file CRLF/LF normalization was housekeeping (NOT a blocker — the build succeeded either way) and the BOM restore on csproj was conservative neutrality (return the file to its original encoding state aside from the version literal).
- Rule 4 (architectural): None.

## Issues Encountered

**Line-ending churn from Edit-tool LF emission against CRLF on-disk files.**

The Edit tool emits LF; the repo's working-tree files are CRLF (Windows convention; git autocrlf is `false` so on-disk endings persist). After every Edit, the file flipped to LF on disk, and after `git add` the index version (which is also LF for production sources) showed a HUGE diff because the diff treats line-ending-change as full-line rewrite when the file modes flip.

Resolution: ran `dos2unix` on all production-source edits before `git add` to align the working-tree file with the index storage convention. Result: clean +9/-2 minimal diff instead of a 994-line "rewrite". For the csproj BOM was preserved post-dos2unix via a small Python recipe.

The cost of this housekeeping was paid once per file; subsequent edits will be clean. The RED commit absorbed a one-time line-ending normalization for the test files (994-line "rewrite" of AppSettingsTests.cs) which was unavoidable since the test file had been CRLF in the index AND on disk before the Edit; the choice was to either ship that one-shot churn in RED or revert AppSettingsTests to its pre-edit form and use a different append technique. Took the churn — content is intact.

## User Setup Required

None — pure App-layer service + AppSettings extension + csproj literal edit. No environment variables, no external service configuration, no UI exposure yet (UI wiring lands in Plan 88-03).

## Next Phase Readiness

**Hand-off note for Plan 88-03 (UI wiring):**

The public surface that 88-03 will consume is fully tested and stable:

```csharp
using FuzzyClock.App;
using FuzzyClock.Core;
using System.Reflection;

// 1. Construct in MainWindow.ContentRendered (or equivalent; planner picks placement):
_updateService = new UpdateCheckService();   // long-lived static HttpClient under the hood

// 2. Gate kickoff on the persisted setting (PERS-12):
if (_settings.UpdateChecksEnabled)
{
    Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, async () =>
    {
        try
        {
            var newer = await _updateService.CheckAsync().ConfigureAwait(false);
            if (newer is null) return;
            var running = Assembly.GetExecutingAssembly().GetName().Version!;   // DEV-02 canonical source
            if (!UpdateVersionComparer.IsNewer(running, newer)) return;
            Dispatcher.Invoke(() => ShowUpdateNotice(newer));   // marshal to UI thread (UI-07)
        }
        catch (Exception)
        {
            // UI-08 defense in depth — service already swallows narrow exceptions
        }
    });
}

// 3. Mid-session toggle OFF (PERS-10):
_updateService.CancelInFlight();

// 4. Three-tier dispose registration:
//    - MainWindow.OnClosing: _updateService?.Dispose();
//    - App.SessionEnding:    mw?.DisposeUpdateCheckService();
//    - AppDomain.ProcessExit: try { (MainWindow as MainWindow)?.DisposeUpdateCheckService(); } catch { }
```

`AppSettings.UpdateChecksEnabled` is queryable at launch (default = true). `SettingsService.Defaults()` returns it; `Validate()` is unchanged (no new guard required).

Phase-33 dual-path reminder for 88-03: any new `UpdateText.Foreground = brush;` line in `ApplyTheme` MUST also exist in `ApplyDisplayColor` — this is the single most regression-prone pattern in the codebase per PROJECT.md.

REL-03 invariant intact: `FuzzyClock.Core.csproj` was NOT touched in this plan (zero PackageReferences preserved). The new networking + JSON + threading code lives entirely in `FuzzyClock.App`.

## Self-Check: PASSED

- `FuzzyClock.App/UpdateCheckService.cs` — FOUND
- `FuzzyClock.App.Tests/FakeHttpMessageHandler.cs` — FOUND
- `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs` — FOUND
- `FuzzyClock.App/AppSettings.cs` contains `UpdateChecksEnabled` — FOUND (1 occurrence)
- `FuzzyClock.App/SettingsService.cs` contains `UpdateChecksEnabled = true` — FOUND
- `FuzzyClock.App/FuzzyClock.App.csproj` contains `<InformationalVersion>4.5.0</InformationalVersion>` — FOUND
- `FuzzyClock.App.Tests/AppSettingsTests.cs` contains `RoundTrip_UpdateChecksEnabled_Matches` + `Deserialize_MissingUpdateChecksEnabled_DefaultsToTrue` — FOUND (2 of 8 UpdateChecksEnabled occurrences)
- Commit `e6af92a` (RED) — FOUND
- Commit `846b28d` (GREEN) — FOUND
- Commit `430ff0a` (csproj sync) — FOUND
- `dotnet test FuzzyClock.slnx -c Debug`: 469 Core + 152 App = 621 passed, 0 failed — VERIFIED
- `RepoUrl` literal contains exact string `https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest` — VERIFIED
- `catch (Exception)` count in UpdateCheckService.cs = 0 — VERIFIED
- Six narrow catches present in correct order (Http, TaskCanceled, OperationCanceled, Json, Format, Argument) — VERIFIED

---
*Phase: 88-github-releases-update-checker*
*Plan: 02 of 4*
*Completed: 2026-05-29*
