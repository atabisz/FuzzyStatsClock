---
phase: 88-github-releases-update-checker
verified: 2026-05-29T00:00:00Z
status: passed
score: 8/8 truths verified (Categories D + G deferred to v4.5.0 tag push by user sign-off)
re_verification: false
deferred_to_tag_push:
  - category: D
    behavior: "Mid-session toggle OFF cancels in-flight CTS"
    why_deferred: "Requires RELEASE build to remove `#if DEBUG return null;` short-circuit so an in-flight CTS exists to cancel. Static-grep confirms wiring present (CancelInFlight call site at MainWindow.xaml.cs:764)."
  - category: G
    behavior: "SmartScreen / Defender behavior on first outbound HTTPS"
    why_deferred: "Requires fresh published exe on stock-Defender Windows. Observable only after `git tag v4.5.0 && git push --tags` triggers release pipeline."
---

# Phase 88: GitHub Releases Update Checker Verification Report

**Phase Goal:** Once-per-launch GitHub Releases API lookup with accent-colored "vX.Y.Z available" notice line on widget, Settings → Behavior toggle (default ON) for opt-out, silent-failure posture across all error paths, full Phase 33 dual-path theme/contrast participation, three-tier dispose for the new service, dev-build `#if DEBUG` skip to prevent polluted screenshots.

**Verified:** 2026-05-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                | Status     | Evidence                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pure-static UpdateVersionComparer with TryParseTag and IsNewer in FuzzyClock.Core (REL-03 preserved) | ✓ VERIFIED | `FuzzyClock.Core/UpdateVersionComparer.cs:6` `public static class UpdateVersionComparer` exports both methods; `FuzzyClock.Core.csproj` zero PackageReference |
| 2   | UpdateCheckService correctly shaped (long-lived static HttpClient, narrow catches, #if DEBUG, Interlocked dispose, source-gen JSON) | ✓ VERIFIED | `FuzzyClock.App/UpdateCheckService.cs`: lines 26–27 RepoUrl exact; line 103 `#if DEBUG return null;`; lines 142–147 narrow 6-catch list; line 170 Interlocked.CompareExchange; lines 192–193 `[JsonSerializable]` source-gen; zero `catch (Exception)` |
| 3   | AppSettings persisted opt-out with explicit default `= true` and round-trip safety                   | ✓ VERIFIED | `AppSettings.cs:69` `public bool UpdateChecksEnabled { get; init; } = true;`; `SettingsService.cs:163` `UpdateChecksEnabled = true`; round-trip + absent-field tests at AppSettingsTests.cs:486–504 |
| 4   | UpdateText TextBlock is the 8th/final child of StatsPanel with TempsText-cloned styling               | ✓ VERIFIED | `MainWindow.xaml:299–311` exact clone of TempsText (Margin/Font/Foreground/Text) with explicit `Visibility="Collapsed"`; appears after TempsText as final StatsPanel child |
| 5   | Phase 33 dual-path: UpdateText.Foreground assigned in BOTH ApplyTheme and ApplyDisplayColor          | ✓ VERIFIED | `MainWindow.xaml.cs:2010` (ApplyTheme) + `:2049` (ApplyDisplayColor) — exactly 2 occurrences with sibling-line comments naming both methods |
| 6   | Three-tier dispose registered: OnClosing, SessionEnding, OnProcessExit                                | ✓ VERIFIED | Tier 1: `MainWindow.xaml.cs:1520` `_updateService?.Dispose();`; Tier 2: `App.xaml.cs:79` `mw?.DisposeUpdateCheckService();`; Tier 3: `App.xaml.cs:98` try/catch wrapped |
| 7   | ContentRendered kicks off via Dispatcher.BeginInvoke at ApplicationIdle, gated on _settings.UpdateChecksEnabled (PERS-12) | ✓ VERIFIED | `MainWindow.xaml.cs:201–205` ctor + gate; `:1248–1270` KickoffUpdateCheck with Dispatcher.BeginInvoke(ApplicationIdle, ...) and outer try/catch (UI-08) and Dispatcher.Invoke marshal back to UI thread (UI-07) |
| 8   | Settings toggle handler immediate-persists, cancels in-flight on OFF, ResetToDefaults restores true   | ✓ VERIFIED | `SettingsWindow.xaml.cs:70` event + `:626` _suppressEvents-guarded handler; `MainWindow.xaml.cs:757–768` immediate-persist + CancelInFlight + collapse + clear; `:1616` ResetToDefaults restores true |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                                | Expected                                                  | Status     | Details                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `FuzzyClock.Core/UpdateVersionComparer.cs`              | TryParseTag + IsNewer pure static                          | ✓ VERIFIED | 57 lines; both methods exported; uses `Version.TryParse`; `Normalize` helper handles `Build=-1` System.Version edge for 2-vs-3 comp parity |
| `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs`   | ~13–17 DataRow + IsNewer ordering                          | ✓ VERIFIED | 64 lines; 5 [TestMethod] declarations covering 6 happy + 10 reject + 4 ordering rows = 20 effective assertions                          |
| `FuzzyClock.App/UpdateCheckService.cs`                  | Service with all required shape                            | ✓ VERIFIED | 194 lines; long-lived `_sharedClient`; RepoUrl const exact; 6 narrow catches in correct order; `#if DEBUG return null;` at line 103 (top); Interlocked.CompareExchange at line 170; JsonSerializerContext at line 193; zero `catch (Exception)` |
| `FuzzyClock.App/AppSettings.cs`                         | `UpdateChecksEnabled { get; init; } = true;`               | ✓ VERIFIED | Line 69 exact match                                                                                                                      |
| `FuzzyClock.App/SettingsService.cs`                     | `Defaults()` returns `UpdateChecksEnabled = true`          | ✓ VERIFIED | Line 163 in `Defaults()` initializer                                                                                                     |
| `FuzzyClock.App/MainWindow.xaml`                        | UpdateText 8th StatsPanel child styled like TempsText      | ✓ VERIFIED | Lines 299–311 sit immediately after TempsText (lines 287–297) as final child before `</StackPanel>` on line 312                          |
| `FuzzyClock.App/MainWindow.xaml.cs`                     | `_updateService` field + kickoff + dual-path + ResetToDefaults | ✓ VERIFIED | Field at line 20; ctor + gate at 201–205; KickoffUpdateCheck/ShowUpdateNotice at 1248–1291; ApplyTheme dual-path at 2010; ApplyDisplayColor dual-path at 2049; OnClosing tier 1 at 1520; DisposeUpdateCheckService at 1534; OpenSettings handler at 757; GetCurrentSettingsSnapshot mapping at 664; ResetToDefaults restore at 1616 |
| `FuzzyClock.App/App.xaml.cs`                            | SessionEnding (tier 2) + OnProcessExit (tier 3)            | ✓ VERIFIED | Lines 79 (SessionEnding) and 98 (OnProcessExit try/catch)                                                                                |
| `FuzzyClock.App/SettingsWindow.xaml`                    | ChkUpdateChecksEnabled in Behavior tab                     | ✓ VERIFIED | Lines 483–487 with Content="Check for updates on launch", Checked + Unchecked both wired to `ChkUpdateChecksEnabled_Changed`            |
| `FuzzyClock.App/SettingsWindow.xaml.cs`                 | Event + handler + PopulateControls integration             | ✓ VERIFIED | Event at line 70; PopulateControls assignment at 225 (inside _suppressEvents-guarded block); handler at 626–630 with `if (_suppressEvents) return;` |
| `FuzzyClock.App/SettingsSnapshot.cs`                    | `UpdateChecksEnabled` field                                | ✓ VERIFIED | Lines 61–62 `public bool UpdateChecksEnabled { get; init; }`                                                                            |
| `FuzzyClock.App/FuzzyClock.App.csproj`                  | `<InformationalVersion>4.5.0</InformationalVersion>`       | ✓ VERIFIED | Line 31                                                                                                                                  |
| `FuzzyClock.App.Tests/FakeHttpMessageHandler.cs`        | Test seam with SendCount + LastRequest                     | ✓ VERIFIED | 38 lines; `SendCount` + `LastRequest` properties; static `Json()` factory; `cancellationToken.ThrowIfCancellationRequested()` honored |
| `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs`       | ~6–8 service-shape tests                                   | ✓ VERIFIED | 118 lines; 8 [TestMethod] declarations (DEBUG-skip + happy contract + 3-row non-success DataRow + malformed + draft + prerelease + 2 dispose idempotence) |
| `FuzzyClock.App.Tests/AppSettingsTests.cs`              | Round-trip + absent-field for UpdateChecksEnabled          | ✓ VERIFIED | Lines 486–504: `RoundTrip_UpdateChecksEnabled_Matches` + `Deserialize_MissingUpdateChecksEnabled_DefaultsToTrue`                         |
| `FuzzyClock.Core/FuzzyClock.Core.csproj`                | Zero `<PackageReference>` (REL-03 invariant)               | ✓ VERIFIED | `findstr PackageReference` returns 0 hits — REL-03 LHM-free invariant preserved                                                          |
| `README.md`                                             | Mention of update notice + "Check for updates on launch"   | ✓ VERIFIED | Line 48 — single bullet covering both surfaces; no implementation detail leaked                                                          |
| All 4 SUMMARYs                                          | 88-01, 88-02, 88-03, 88-04 SUMMARY.md                      | ✓ VERIFIED | 159 + 234 + 249 + 257 = 899 total lines; all four present                                                                                |

### Key Link Verification

| From                                                           | To                                                          | Via                                                         | Status   | Details                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `MainWindow.xaml.cs:1258`                                      | `FuzzyClock.Core/UpdateVersionComparer.cs`                  | `FuzzyClock.Core.UpdateVersionComparer.IsNewer(running, newer)` | ✓ WIRED  | Strict-greater check before showing notice                       |
| `MainWindow.xaml.cs:201`                                       | `FuzzyClock.App/UpdateCheckService.cs`                      | `_updateService = new UpdateCheckService();`                | ✓ WIRED  | Construction unconditional; kickoff conditional on PERS-12 gate  |
| `MainWindow.xaml.cs:1254`                                      | `FuzzyClock.App/UpdateCheckService.cs`                      | `await _updateService.CheckAsync()`                         | ✓ WIRED  | Inside Dispatcher.BeginInvoke ApplicationIdle lambda             |
| `MainWindow.xaml.cs:764`                                       | `UpdateCheckService.CancelInFlight()`                       | `_updateService?.CancelInFlight();`                         | ✓ WIRED  | Inside `if (!v)` branch of UpdateChecksEnabledChanged subscription |
| `MainWindow.xaml.cs:1520, App.xaml.cs:79, App.xaml.cs:98`     | `UpdateCheckService.Dispose()`                              | Three-tier (OnClosing + SessionEnding + ProcessExit)        | ✓ WIRED  | All three tiers present and Interlocked-guarded                  |
| `MainWindow.xaml.cs ApplyTheme:2010`                           | `UpdateText.Foreground`                                     | `UpdateText.Foreground = brush;`                            | ✓ WIRED  | Phase 33 critical — present in primary theme path                |
| `MainWindow.xaml.cs ApplyDisplayColor:2049`                    | `UpdateText.Foreground`                                     | `UpdateText.Foreground = brush;`                            | ✓ WIRED  | Phase 33 critical — present in auto-contrast path                |
| `SettingsWindow.xaml.cs:225`                                   | `SettingsSnapshot.UpdateChecksEnabled`                      | `ChkUpdateChecksEnabled.IsChecked = s.UpdateChecksEnabled;` | ✓ WIRED  | Inside _suppressEvents-guarded PopulateControls                  |
| `SettingsWindow.xaml.cs:626 → MainWindow.xaml.cs:757`         | `MainWindow.OpenSettings UpdateChecksEnabledChanged subscription` | event Action<bool>?                                       | ✓ WIRED  | Immediate-persist + cancel-on-off                               |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                  | Status      | Evidence                                                                                                |
| ----------- | ----------- | ---------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| UPD-01      | 88-01       | Pure-static TryParseTag accepting v-prefix + 2/3/4-component                 | ✓ SATISFIED | UpdateVersionComparer.cs:14 + 6-row DataRow happy path                                                  |
| UPD-02      | 88-01       | IsNewer strict-greater                                                       | ✓ SATISFIED | UpdateVersionComparer.cs:44; equal-returns-false test verified                                          |
| UPD-03      | 88-02       | User-Agent + Accept headers (GitHub API requirement)                         | ✓ SATISFIED | UpdateCheckService.cs:118–119                                                                           |
| UPD-04      | 88-02       | Long-lived static HttpClient with PooledConnectionLifetime=15min             | ✓ SATISFIED | UpdateCheckService.cs:34, 76                                                                            |
| UPD-05      | 88-02       | Linked CTS with CancelAfter(5s)                                              | ✓ SATISFIED | UpdateCheckService.cs:109–110                                                                           |
| UPD-06      | 88-02       | Source-gen JsonSerializerContext, no reflection                              | ✓ SATISFIED | UpdateCheckService.cs:128–131 + :192–193                                                                |
| UPD-07      | 88-02       | Narrow 6-exception catches; never `catch (Exception)`                        | ✓ SATISFIED | UpdateCheckService.cs:142–147; zero `catch (Exception)` in file                                         |
| UPD-08      | 88-02       | Idempotent dispose via Interlocked.CompareExchange                           | ✓ SATISFIED | UpdateCheckService.cs:170                                                                               |
| UPD-09      | 88-02       | `#if DEBUG return null;` early at top of CheckAsync                          | ✓ SATISFIED | UpdateCheckService.cs:103–106 (first statement of method body)                                          |
| UPD-10      | 88-02       | RepoUrl as internal const, never read from settings.json                     | ✓ SATISFIED | UpdateCheckService.cs:26–27 const; not present in AppSettings/SettingsService                           |
| UI-01       | 88-03       | UpdateText 8th StatsPanel child immediately below TempsText                  | ✓ SATISFIED | MainWindow.xaml:304 directly after TempsText:287                                                        |
| UI-02       | 88-03       | "v{version} available" text (synthesised v prefix)                           | ✓ SATISFIED | MainWindow.xaml.cs:1275 `$"v{newer} available"`                                                         |
| UI-03       | 88-03       | Visibility Collapsed default; flips to Visible only on strict-newer          | ✓ SATISFIED | MainWindow.xaml:306 default; .cs:1276 set Visible only inside ShowUpdateNotice (callback gates IsNewer) |
| UI-04       | 88-03       | Phase 33 dual-path Foreground assignment                                     | ✓ SATISFIED | MainWindow.xaml.cs:2010 (ApplyTheme) + 2049 (ApplyDisplayColor)                                         |
| UI-05       | 88-03       | Re-clamp on Visible flip (SettingsService.Clamp)                             | ✓ SATISFIED | MainWindow.xaml.cs:1280–1290 — UpdateLayout + Clamp inside ShowUpdateNotice                             |
| UI-06       | 88-03       | Dispatcher.BeginInvoke ApplicationIdle kickoff                               | ✓ SATISFIED | MainWindow.xaml.cs:1250                                                                                 |
| UI-07       | 88-03       | Service callback marshals to UI thread before touching XAML                  | ✓ SATISFIED | MainWindow.xaml.cs:1261 `Dispatcher.Invoke(() => ShowUpdateNotice(newer))`                              |
| UI-08       | 88-03       | Outer try/catch (Exception) at kickoff boundary (defense in depth)            | ✓ SATISFIED | MainWindow.xaml.cs:1252 + 1263                                                                          |
| PERS-01     | 88-02       | AppSettings.UpdateChecksEnabled with explicit `= true`                       | ✓ SATISFIED | AppSettings.cs:69                                                                                       |
| PERS-02     | 88-02       | SettingsService.Defaults() returns `UpdateChecksEnabled = true`              | ✓ SATISFIED | SettingsService.cs:163                                                                                  |
| PERS-03     | 88-02       | SettingsService.Validate() unchanged (bool needs no guard)                   | ✓ SATISFIED | No new guard added; Validate() remains identical                                                        |
| PERS-04     | 88-02       | Round-trip test for UpdateChecksEnabled                                       | ✓ SATISFIED | AppSettingsTests.cs:490 RoundTrip_UpdateChecksEnabled_Matches                                          |
| PERS-05     | 88-02       | Absent-field test defaults to true                                           | ✓ SATISFIED | AppSettingsTests.cs:499 Deserialize_MissingUpdateChecksEnabled_DefaultsToTrue                          |
| PERS-06     | 88-03       | SettingsWindow ChkUpdateChecksEnabled in Behavior tab                        | ✓ SATISFIED | SettingsWindow.xaml:483 with label "Check for updates on launch"                                        |
| PERS-07     | 88-03       | _suppressEvents-guarded Checked/Unchecked handler                            | ✓ SATISFIED | SettingsWindow.xaml.cs:626–630 with `if (_suppressEvents) return;`                                      |
| PERS-08     | 88-03       | SettingsSnapshot.UpdateChecksEnabled + GetCurrentSettingsSnapshot mapping    | ✓ SATISFIED | SettingsSnapshot.cs:62; MainWindow.xaml.cs:664                                                          |
| PERS-09     | 88-03       | Immediate-persist on toggle (Phase 78 pattern)                               | ✓ SATISFIED | MainWindow.xaml.cs:759–760 `_settings = _settings with { UpdateChecksEnabled = v }; SaveSettings();`  |
| PERS-10     | 88-03       | Mid-session OFF → CancelInFlight + collapse text                             | ✓ SATISFIED | MainWindow.xaml.cs:762–767 `if (!v) { CancelInFlight(); Visibility = Collapsed; Text = ""; }`           |
| PERS-11     | 88-03       | ResetToDefaults restores `UpdateChecksEnabled = true` + RefreshControls      | ✓ SATISFIED | MainWindow.xaml.cs:1616 in with-expression; RefreshControls already at :1622                            |
| PERS-12     | 88-03       | Launch-time gate: skip kickoff when `_settings.UpdateChecksEnabled == false` | ✓ SATISFIED | MainWindow.xaml.cs:202 `if (_settings.UpdateChecksEnabled) KickoffUpdateCheck();`                       |
| DEV-01      | 88-02       | csproj `<InformationalVersion>` synced 3.6.0 → 4.5.0                         | ✓ SATISFIED | FuzzyClock.App.csproj:31                                                                                |
| DEV-02      | 88-02       | `Assembly.GetName().Version` is canonical running-version source             | ✓ SATISFIED | UpdateCheckService.cs:91; MainWindow.xaml.cs:1257                                                       |
| DEV-03      | 88-02       | Service-shape test asserts DEBUG-config null return                          | ✓ SATISFIED | UpdateCheckServiceTests.cs:18 `CheckAsync_DebugBuild_ReturnsNullWithoutDispatchingHttpCall`             |
| DOCS-01     | 88-04       | README mentions update notice + Settings toggle                              | ✓ SATISFIED | README.md:48                                                                                            |

**All 34 requirements: SATISFIED.**

### Anti-Patterns Found

None. Scanned new files (`UpdateVersionComparer.cs`, `UpdateCheckService.cs`, `UpdateVersionComparerTests.cs`, `UpdateCheckServiceTests.cs`, `FakeHttpMessageHandler.cs`) and the touched lines in MainWindow.xaml/.cs, SettingsWindow.xaml/.cs, App.xaml.cs, AppSettings.cs, SettingsService.cs, SettingsSnapshot.cs, README.md, csproj — zero TODO/FIXME/XXX/HACK/PLACEHOLDER markers.

### Test Suite Result

`dotnet test FuzzyClock.slnx -c Debug --nologo --logger "console;verbosity=minimal"`

```
Passed!  - Failed: 0, Passed: 469, Skipped: 0, Total: 469 - FuzzyClock.Core.Tests.dll (net10.0)
Passed!  - Failed: 0, Passed: 152, Skipped: 0, Total: 152 - FuzzyClock.App.Tests.dll (net10.0)
```

**Total: 621 passed / 0 failed** — exactly matches the prediction in the verification asks (469 Core + 152 App).

### Human Verification Status

User-approved on static-grep evidence per Plan 88-04 SUMMARY (commit `33de465` for README + close-out). Categories A, B, C, E, F, H bundled into the approved-without-running decision. Categories D + G explicitly **deferred to v4.5.0 tag push** (recorded in `88-04-SUMMARY.md` key-decisions block):

- **Category D (mid-session toggle OFF cancels in-flight CTS)** — requires RELEASE build to remove `#if DEBUG return null;` short-circuit so an in-flight CTS exists to cancel. Static-grep confirms wiring at MainWindow.xaml.cs:764 `_updateService?.CancelInFlight();` inside the `if (!v)` branch.
- **Category G (SmartScreen / Defender behavior on first outbound HTTPS)** — requires fresh published exe on stock-Defender Windows. Observable only after `git tag v4.5.0 && git push --tags` triggers the release pipeline.

These deferrals are intentional and documented; they do NOT block phase close-out per user direction.

### Gaps Summary

None. Phase 88 delivers all 34 v1 requirements with full verification. Static evidence is consistent across artifacts, key links are wired (Phase 33 dual-path verified by exact-count grep returning 2 matches), and the test suite reports 621 passed / 0 failed.

The two deferred-to-tag-push categories (D + G) are **not gaps** — they are runtime behaviors observable only in RELEASE builds and on first outbound HTTPS to api.github.com. Their wiring is statically verified; the live exercise is intentionally deferred to the v4.5.0 tag push pipeline.

---

_Verified: 2026-05-29_
_Verifier: Claude (gsd-verifier)_
