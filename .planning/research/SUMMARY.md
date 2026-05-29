# Project Research Summary — v4.5 Update Checker

**Project:** FuzzyClock v4.5 — Update Checker
**Domain:** Once-per-launch GitHub Releases version-check notice in a previously-offline-only WPF widget (.NET 10)
**Researched:** 2026-05-29
**Confidence:** HIGH

## Executive Summary

The v4.5 milestone is the smallest in FuzzyClock's history: a single fire-and-forget HTTPS GET to `api.github.com/repos/{owner}/{repo}/releases/latest`, a pure version-comparison helper, one new TextBlock at the bottom of `StatsPanel`, one new Settings checkbox, and a `UpdateChecksEnabled` AppSettings field. **No NuGet additions** — everything required is in the .NET 10 BCL (`HttpClient`, `System.Text.Json`, `System.Version`, `Assembly.GetName().Version`, `CancellationTokenSource`). The single recommended endpoint `/releases/latest` filters drafts and pre-releases server-side, so the v4.5 "stable-only" out-of-scope item is satisfied at zero client cost.

The recommended approach mirrors `TemperatureService` patterns line-for-line: `UpdateCheckService` lives in `FuzzyClock.App` (HTTP-using), pure logic (`UpdateVersionComparer`) lives in `FuzzyClock.Core` (testable on `net10.0`), three-tier dispose (`OnClosing` + `SessionEnding` + `OnProcessExit`) guarded by `Interlocked.CompareExchange`, async init kicked off **fire-and-forget from `MainWindow.ContentRendered`** so the first paint never waits on the network. UI completion goes through a `Dispatcher.Invoke` callback. The two critical patterns to enforce are (a) the **Phase 33 dual-path** invariant — `UpdateText.Foreground` set in BOTH `ApplyTheme` AND `ApplyDisplayColor` — and (b) the **explicit `= true` init default** on `UpdateChecksEnabled` to prevent silent opt-out for v4.4 users upgrading.

The biggest non-obvious risks are not in the network code itself but in the integration boundary: (1) `.Result`/`.Wait()` deadlocks on the WPF dispatcher if anyone tries to "make it synchronous"; (2) `ConfigureAwait(false)` cargo-culted to UI code (correct in service, **wrong** at the `MainWindow` boundary); (3) overly-broad `catch (Exception)` swallowing programmer errors under the "silent failure" banner; (4) **dev-box version mismatch** — the running csproj `<Version>` is `4.5.0` but `<InformationalVersion>` is stale at `3.6.0`, and dev builds will perpetually show "v4.4.0 available" or similar nonsense; recommendation is `#if DEBUG` skip in `CheckAsync` plus syncing the csproj.

## Key Findings

### Recommended Stack

All four researchers converge: pure BCL .NET 10. No NuGet additions. `System.Version` is sufficient (semver pre-release/build metadata are explicitly out of scope). The single endpoint `/releases/latest` provides automatic stable-only filtering. Source-generated `JsonSerializerContext` is added now (10 lines, zero runtime cost) to future-proof against any later `PublishTrimmed` decision.

**Core technologies:**
- **`System.Net.Http.HttpClient`** + **`SocketsHttpHandler`** with `PooledConnectionLifetime = 15min`, `Timeout = 5s`, User-Agent `FuzzyClock/{Assembly.GetName().Version}` — long-lived static field on the service
- **`System.Text.Json`** with **source-gen `JsonSerializerContext`** — minimal POCO `{ tag_name, prerelease, draft }` (last two are defense-in-depth; `/releases/latest` already filters server-side)
- **`System.Version`** — `Version.TryParse` after stripping leading `v`; comparison via `>` operator (`IComparable<Version>` since .NET 5)
- **`Assembly.GetName().Version`** — running version source (NOT `InformationalVersion`)
- **`CancellationTokenSource`** — 5s timeout via `CancelAfter`; linked to app-shutdown CTS so quit doesn't wait the full 5s on a hung connect

No NuGet additions; no Squirrel/Velopack/Octokit/Newtonsoft; no `IHttpClientFactory` (overkill for one call per process).

### Expected Features

Single-MVP feature; no v4.6 follow-on planned. All P1.

**Must have (table stakes):**
- Show `vX.Y.Z available` notice on widget when GitHub `tag_name` is newer than running version
- Settings → Behavior tab toggle `Check for updates on launch`, default ON
- Skip the network call entirely when toggle is OFF (honor opt-out — no telemetry-by-other-means)
- Silent failure on every non-happy-path: network down, timeout, 403/404/429, malformed JSON, HTML during outage
- Hide notice when `running >= latest`, when toggle is OFF, when check is in-flight, when latest is pre-release/draft (server-side filtered)
- Hard 5s timeout via `CancellationTokenSource.CancelAfter` (linked to app-shutdown CTS)
- Async fire-and-forget; UI thread never blocks

**Should have (FuzzyClock-specific polish):**
- `UpdateText.Foreground` participates in BOTH `ApplyTheme` AND `ApplyDisplayColor` (Phase 33 critical pattern)
- Toggling OFF mid-session immediately collapses the notice AND cancels in-flight CTS
- Pure `UpdateVersionComparer` helper in `FuzzyClock.Core` — fully unit-testable on `net10.0`
- `ResetToDefaults` resets `UpdateChecksEnabled = true` and refreshes the Settings snapshot

**Defer (v4.6+ — explicitly anti-features):**
- In-app changelog viewer
- "Download now" / auto-update / one-click upgrade
- Snooze / "remind me later" / `DismissedVersion`
- Multiple cadence options
- Pre-release / beta-channel toggle
- Failure indicator (red dot, ⚠ icon)
- Telemetry on check outcome
- Clickable notice opening GitHub URL
- "Critical update" / forced-upgrade flag

### Architecture Approach

Service-singleton with async init + three-tier dispose, mirroring `TemperatureService` line-for-line. `UpdateCheckService` (App) owns `HttpClient`, JSON parse, CTS lifecycle, and a once-on-completion `Action<string?>` callback marshalled to UI thread by the caller via `Dispatcher.Invoke`. `UpdateVersionComparer` (Core) is pure static with `TryParseTag`/`IsNewer`. UI: one `<TextBlock x:Name="UpdateText">` as 8th/final child of `StatsPanel` (byte-for-byte clone of `TempsText`/`UptimeText`); one `<CheckBox x:Name="ChkUpdateChecksEnabled">` in Settings → Behavior (clones `ChkAutoLaunchEnabled`); two-line additions to `ApplyTheme` + `ApplyDisplayColor`; two-line dispose wiring in `App.xaml.cs` for tiers 2/3.

**Major components:**
1. **`FuzzyClock.Core/UpdateVersionComparer.cs`** (NEW, pure static) — `bool TryParseTag(string?, out Version)` and `bool IsNewer(Version, Version)`. Strips leading `v`/`V`, rejects pre-release suffixes, tolerates 2-/3-component tags, returns false on malformed input.
2. **`FuzzyClock.App/UpdateCheckService.cs`** (NEW, network) — singleton-shaped service with private static `HttpClient`, `Task<Version?> TryGetLatestReleaseVersionAsync(owner, repo, ct)`. Constructor-injectable `HttpMessageHandler` for tests. `Dispose()` idempotent via `Interlocked.CompareExchange`.
3. **`FuzzyClock.App/MainWindow.xaml`** (MOD) + **`MainWindow.xaml.cs`** (MOD, ~8 discrete edits) — new `UpdateText` TextBlock; service field; `ContentRendered` fire-and-forget kickoff; `UpdateUpdateNoticeDisplay` private method; `ApplyTheme` + `ApplyDisplayColor` both add `UpdateText.Foreground = brush;`; `OnClosing` dispose tier 1; `DisposeUpdateCheckService()` external entry; `OpenSettings` event subscription cancels CTS + collapses notice on toggle OFF; `ResetToDefaults` field reset.
4. **`FuzzyClock.App/AppSettings.cs`** (MOD) + **`SettingsService.cs`** (MOD) — `bool UpdateChecksEnabled { get; init; } = true;` (explicit `= true` is critical). `Defaults()` adds field; `Validate()` needs no new guard.
5. **`FuzzyClock.App/SettingsWindow.xaml`** (MOD) + **`SettingsWindow.xaml.cs`** (MOD) — `<CheckBox x:Name="ChkUpdateChecksEnabled">` with label `Check for updates on launch`; `event Action<bool>? UpdateChecksEnabledChanged`; `_suppressEvents`-guarded `PopulateControls`; `Checked`/`Unchecked` handlers; `SettingsSnapshot.UpdateChecksEnabled`.
6. **`FuzzyClock.App/App.xaml.cs`** (MOD) — two new lines in `SessionEnding` and `OnProcessExit` calling `DisposeUpdateCheckService()`.

### Critical Pitfalls

1. **`.Result`/`.Wait()` deadlock on WPF dispatcher** — Never block on async work from a UI handler.
2. **`ConfigureAwait(false)` boundary** — Use it on every `await` **inside** `UpdateCheckService` (library-like). **Never** use it in `MainWindow.CheckForUpdatesAsync` (UI code).
3. **Phase 33 dual-path invariant** — `UpdateText.Foreground = brush;` MUST be added to BOTH `ApplyTheme` AND `ApplyDisplayColor`.
4. **AppSettings init default** — `bool UpdateChecksEnabled { get; init; } = true;` (explicit `= true`).
5. **`System.Version` foot-guns** — Strip leading `v`; reject pre-release suffixes; pad 2-component tags. `Version("4.5") != Version("4.5.0")` because `Build = -1` sentinel.
6. **Specific-exception catches, not `catch (Exception)`** — Service catches `HttpRequestException`, `TaskCanceledException`, `OperationCanceledException`, `JsonException`, `FormatException`, `ArgumentException` only.
7. **Linked CTS for timeout + app-shutdown** — `CreateLinkedTokenSource(_appShutdownCts.Token, timeoutCts.Token)`.
8. **Dev-box version mismatch** — `<InformationalVersion>3.6.0</InformationalVersion>` is stale; add `#if DEBUG return null;` at top of `CheckAsync`.

## Cross-Research Convergence & Resolved Divergences

### 1. Phase count — RESOLVED: 1 phase, 4 plans

| Researcher | Recommendation |
|------------|----------------|
| STACK | "Single-phase, two plans" |
| FEATURES | (no explicit recommendation; lists 8 P1 deliverables) |
| ARCHITECTURE | "Single phase, 3-4 plans" |
| PITFALLS | "5 phases (UPD-VER / UPD-SVC / UPD-SETT / UPD-WIRE / UPD-VERIFY)" — but those are conceptual prevention tags, not literal milestone phases |

**Synthesized recommendation:** **One phase, four plans**. PITFALLS' five-tag taxonomy is a useful labelling vocabulary for plan-time work-item routing but is NOT a milestone-phase boundary. Build order is forced by C# project references (Core → App → MainWindow); the work is small and tightly coupled — a single phase is correct, four plans give natural seams.

| Plan | Focus | Pitfall tag |
|------|-------|-------------|
| Plan-01 | Core helper + tests | UPD-VER |
| Plan-02 | UpdateCheckService + AppSettings + service-shape tests + csproj version sync | UPD-SVC + UPD-SETT (settings half) |
| Plan-03 | UI wiring + Settings tab + dispose tiers | UPD-WIRE + UPD-SETT (UI half) |
| Plan-04 | Human-verify + closeout (no code) | UPD-VERIFY |

**Rationale:** v4.4 was 4 phases but had genuinely separable subsystems. v4.5's whole feature is smaller than any single v4.4 phase. Splitting into multiple milestone phases would add ceremony without seams.

### 2. Pure helper name + signature — RESOLVED: `UpdateVersionComparer.TryParseTag` + `IsNewer`

```csharp
// FuzzyClock.Core/UpdateVersionComparer.cs
public static class UpdateVersionComparer
{
    public static bool TryParseTag(string? tag, out Version version);
    public static bool IsNewer(Version running, Version latest);
}
```

Rationale:
- `UpdateVersionComparer` more searchable than `VersionComparer`.
- `TryParseTag(out Version)` is canonical .NET `TryParse` shape.
- `IsNewer(Version running, Version latest)` is the simpler primitive; service composes them.

### 3. Service lifecycle — RESOLVED: Fire-and-forget from `MainWindow.ContentRendered` via `Dispatcher.BeginInvoke(ApplicationIdle)`

```csharp
// MainWindow.xaml.cs Window_ContentRendered, AFTER existing startup work
_updateCheckService = new UpdateCheckService(runningVersion,
    tag => Dispatcher.Invoke(() => UpdateUpdateNoticeDisplay(tag)));

if (_settings.UpdateChecksEnabled)
{
    Dispatcher.BeginInvoke(
        new Action(async () => await _updateCheckService.CheckAsync()),
        System.Windows.Threading.DispatcherPriority.ApplicationIdle);
}
```

`BeginInvoke(ApplicationIdle)` defers kickoff past layout/render pump — first paint never gated on network call dispatch.

### 4. `UpdateChecksEnabled` init default — RESOLVED: `= true`

All four researchers agree, all for the same reason: bool fields absent from old `settings.json` deserialize as `false`. Same fix pattern as `UptimeVisible`, `GhostModeEnabled`, `UseCtrl`, `UseAlt`.

```csharp
public bool UpdateChecksEnabled { get; init; } = true;   // EXPLICIT, NOT C# default
```

### 5. `#if DEBUG` skip vs. fixing the stale csproj — RESOLVED: Do BOTH

- `<Version>` drives `AssemblyVersion` (currently `4.5.0`, correct). `Assembly.GetName().Version` reads `AssemblyVersion`, so production behavior is fine.
- Dev builds run `4.5.0` against live GitHub. The `#if DEBUG` skip eliminates polluted screenshots.
- Stale `<InformationalVersion>3.6.0</InformationalVersion>` is a separate latent bug — fix it as a one-line csproj edit in Plan-02.

```csharp
public async Task<Version?> TryGetLatestReleaseVersionAsync(...)
{
#if DEBUG
    return null;
#endif
    // ... real check ...
}
```

### 6. GitHub owner/repo string — RESOLVED: Hard-code `internal const`

Single `internal const string GitHubReleasesUrl` in `UpdateCheckService` with `{owner}` resolved at plan-time via `git remote get-url origin`. Sanity unit test asserts URL contains `github.com/` and does NOT contain `{owner}`.

### 7. Settings checkbox label — CONFIRMED: `Check for updates on launch`

Frequency-explicit so users know there's no background polling. No period. XAML: `x:Name="ChkUpdateChecksEnabled"`.

### 8. Notice text format — CONFIRMED: `vX.Y.Z available` (with `v` prefix preserved)

Plain text, no symbol prefix, accent-colored, byte-for-byte clone of `TempsText` styling.

```csharp
UpdateText.Text = $"{newerTag} available";   // tag includes 'v' prefix
```

### Unified state matrix (notice rendered iff happy-path row is YES)

| State | Notice Visibility | Rationale |
|-------|-------------------|-----------|
| Running version < latest tag | **Visible** | Single happy-path positive state |
| Running version == latest tag | Collapsed | Up to date |
| Running version > latest tag | Collapsed | Dev/CI build ahead of tag |
| `UpdateChecksEnabled == false` | Collapsed | User opted out |
| Check pending (in-flight, not yet returned) | Collapsed | Default constructor state |
| Check failed (network error / timeout / non-200 / bad JSON / rate-limit / DNS) | Collapsed | Silent-failure posture |
| Check disabled mid-launch (toggled OFF after success) | Collapsed | Immediate hide via event handler + CTS cancel |
| Pre-release / draft latest | Collapsed | Server-side filter via `/releases/latest` |
| Tag fails to parse | Collapsed | `TryParseTag` returns false → silent failure |
| Running on `#if DEBUG` build | Collapsed | Dev-box screenshot protection |

### Unified anti-features list (explicitly OUT of scope)

These MUST NOT appear in REQUIREMENTS.md or any plan:

- In-app changelog viewer / release-notes rendering
- "Download now" / "Install now" button
- Auto-update / one-click upgrade (Squirrel/Velopack/AutoUpdater.NET)
- Snooze / "remind me later" / `DismissedVersion` UI
- Multiple cadence options (hourly / daily / on a timer)
- Background polling / `DispatcherTimer`-driven recheck
- "Critical update" / forced-upgrade flag
- Pre-release / beta-channel toggle
- Failure indicator (red dot, ⚠ icon, error toast)
- Telemetry / analytics on check outcome
- Clickable notice that opens GitHub release URL in browser
- "Check now" tray menu item / manual on-demand check
- ETag / If-None-Match conditional request handling
- PAT / OAuth token (anonymous-only; 60 req/hour is plenty)
- Configurable repo URL via settings.json (security: hard-code only)

## Implications for Roadmap

### Phase: v4.5-UPDATE — GitHub Releases Update Checker

**Rationale:** Single-phase milestone. Build order forced by project references. Work is small, tightly coupled, additive.
**Delivers:** Once-per-launch GitHub release check with notice line on widget, Settings toggle, silent-failure posture, dev-box `#if DEBUG` guard.
**Addresses:** All P1 features.
**Avoids:** All 17 PITFALLS items via prevention rules.

#### Plan structure (4 plans)

| Plan | Name | Focus |
|------|------|-------|
| Plan-01 | UpdateVersionComparer Core helper + tests | `FuzzyClock.Core/UpdateVersionComparer.cs`, `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs`. ~13–17 DataRow tests. |
| Plan-02 | UpdateCheckService + AppSettings + service-shape tests + csproj version sync | Service in `FuzzyClock.App`, AppSettings field, ~6–8 tests via `FakeHttpMessageHandler` seam, source-gen `JsonSerializerContext`, `#if DEBUG` skip, csproj `<InformationalVersion>` sync. Resolve `git remote get-url origin` at plan-time. |
| Plan-03 | UI wiring + Settings tab + three-tier dispose | `MainWindow.xaml` + `MainWindow.xaml.cs` (8 edits), `SettingsWindow.xaml` + `SettingsWindow.xaml.cs`, `App.xaml.cs` dispose tiers. ApplyTheme/ApplyDisplayColor parity. Re-clamp after notice becomes visible. |
| Plan-04 | Human-verify + close-out | No code. Checklist on dev box: `#if DEBUG` shows no notice; offline launch is silent; toggle OFF mid-flight; theme switch + auto-contrast flip; SmartScreen/Defender on first outbound HTTPS; absent-field upgrade test from real v4.4 settings.json. |

### Research flags

**Phases needing deeper research during planning:** None. All four research files converge with HIGH confidence.

### Phase ordering rationale

- Single phase; ordering is internal to plans (Plan-01 before Plan-02 before Plan-03 enforced by project references).
- Plan-04 (human-verify) intentionally separate from Plan-03 so the live-network smoke test can run on a tagged production build.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Microsoft Learn (HttpClient, STJ source-gen, System.Version), GitHub Docs verified. Zero NuGet additions. |
| Features | HIGH | GitHub REST API verified; SemVer §11 verified; indie-utility consensus consistent. |
| Architecture | HIGH | Every recommendation grounded in existing in-repo precedent. No new architectural primitives. |
| Pitfalls | HIGH | All 17 pitfalls mapped to specific code-shape rules with cross-refs. |

**Overall confidence:** HIGH. Lowest-risk integration shape FuzzyClock has had — additive, no critical-path mutation, ~500 lines of net-new code (~150 helper, ~100 service, ~30 UI/settings/app, ~200 tests).

### Gaps to Address

- **GitHub repo owner string** — Resolve at Plan-02 start via `git remote get-url origin`; pin as `internal const`.
- **Stale `<InformationalVersion>` in csproj** — Currently `3.6.0`; sync to `<Version>` (`4.5.0`) as part of Plan-02.
- **`/releases/latest` returns 404 if zero releases exist** — Handled by silent-failure (treat as `NoUpdate`).
- **Test seam choice** — Prefer constructor-injected `HttpMessageHandler` over subclass seam. Confirm during Plan-02.
- **AntiVirus / firewall behavior on first outbound HTTPS** — Manual smoke test on stock Windows 11 + Defender + SmartScreen during Plan-04.

## Sources

### Primary (HIGH confidence)
- Microsoft Learn — *HttpClient guidelines for .NET*
- Microsoft Learn — *How to use source generation in System.Text.Json*
- Microsoft Learn — *Source-generation modes in System.Text.Json*
- Microsoft Learn — *Version Class (System)* (`net-10.0`)
- Microsoft Learn — *CancellationTokenSource.CreateLinkedTokenSource*
- GitHub Docs — *Resources in the REST API* (User-Agent required, 403 without)
- GitHub Docs — *Rate limits for the REST API* (60 req/hour anonymous; `403`/`429`)
- GitHub Docs — *Releases REST API* (`/releases/latest` filters drafts and pre-releases server-side)
- Semantic Versioning 2.0.0 spec (semver.org) — §11
- Direct codebase inspection: `FuzzyClock.App/FuzzyClock.App.csproj`, `FuzzyClock.App/TemperatureService.cs`, `FuzzyClock.App/MainWindow.xaml.cs` (Phase 33 dual-path), `.github/workflows/release.yml` (CI version injection)
- Project memory: PROJECT.md v1.1, v2.0, v2.7, v4.0, v4.2 Phase 78–79, v4.4

### Secondary (MEDIUM confidence)
- WPF / Dispatcher.BeginInvoke / DispatcherPriority.ApplicationIdle docs
- Stephen Cleary "Async and Await" series — async/library boundary `ConfigureAwait` rules

---

*Research completed: 2026-05-29*
*Ready for roadmap: yes*
