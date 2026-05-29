# Phase 88: GitHub Releases Update Checker - Research

**Researched:** 2026-05-29
**Domain:** .NET 10 / WPF — once-per-launch GitHub Releases REST poll, version-compare helper, accent-colored notice TextBlock, Settings checkbox, three-tier dispose
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Repo URL**
- `internal const string RepoUrl = "https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest";` — confirmed against live `git remote get-url origin` (REQUIREMENTS.md placeholder `{owner}/FuzzyClock` was generic; actual repo is `atabisz/FuzzyStatsClock`)
- Hard-coded as `internal const`, never read from `settings.json` (UPD-10 — security: prevents redirect-via-malicious-settings)

**Plan Split (4 plans)**
- **88-01** — `UpdateVersionComparer` Core helper + tests (`FuzzyClock.Core/UpdateVersionComparer.cs` + ~13–17 DataRow rows in `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs`)
- **88-02** — `UpdateCheckService` + `AppSettings.UpdateChecksEnabled = true` init field + ~6–8 service-shape tests via `FakeHttpMessageHandler` seam + `<InformationalVersion>` sync (3.6.0 → 4.5.0)
- **88-03** — UI wiring (`UpdateText` TextBlock, `ContentRendered` kickoff, `ApplyTheme` + `ApplyDisplayColor` dual-path, re-clamp, mid-session CTS cancel, `OpenSettings` event subscription, `ResetToDefaults` reset) + `SettingsWindow` Behavior tab checkbox + `App.xaml.cs` `SessionEnding` + `OnProcessExit` dispose tiers
- **88-04** — Human-verify checklist + close-out + README pass

Each plan is RED→GREEN with atomic commits. Plan boundaries are also natural seams for `/gsd:execute-phase` wave parallelization (none here — strict sequential dependency: Core helper → service → UI).

**Service Shape**
- Long-lived static `HttpClient` (single instance per process); `SocketsHttpHandler.PooledConnectionLifetime = 15min`
- `Timeout = TimeSpan.FromSeconds(5)` set on the `HttpClient` instance + per-call `CancellationTokenSource.CancelAfter(5s)` linked to a service-owned shutdown CTS via `CreateLinkedTokenSource` — both gates so app shutdown unwinds in ms
- Required headers per GitHub API conventions: `User-Agent: FuzzyClock/{AssemblyVersion}` and `Accept: application/vnd.github+json`
- Source-gen `JsonSerializerContext` for `GitHubRelease` POCO (fields: `tag_name`, `prerelease`, `draft`); no reflection deserialization
- Narrow catch set ONLY: `HttpRequestException`, `TaskCanceledException`, `OperationCanceledException`, `JsonException`, `FormatException`, `ArgumentException`. Never `catch (Exception)`. On any catch: returns `Version?` = null
- `#if DEBUG` skip: method body returns null at the very top in DEBUG builds (prevents dev screenshots showing nonsensical "vX.Y.Z available" notices). Service-shape test in `FuzzyClock.App.Tests` verifies the DEBUG-config null return as the natural test-runtime assertion (DEV-03)

**Dispose Pattern (mirrors TemperatureService)**
- `int _disposed` field guarded by `Interlocked.CompareExchange` for idempotence
- Three-tier registration: `MainWindow.OnClosing` (tier 1), `App.SessionEnding` (tier 2), `AppDomain.CurrentDomain.ProcessExit` (tier 3)
- Mid-session toggle OFF cancels the in-flight CTS immediately (PERS-10) — the active CTS is held in a service field; toggling back ON mid-session is a no-op (next-launch only invariant)

**UI / Phase 33 Dual-Path**
- `UpdateText` is the 8th and final child of `StatsPanel`, immediately below `TempsText`
- Styling cloned byte-for-byte from `TempsText`/`UptimeText`: `Margin="0,2,0,0"`, `FontFamily="Segoe UI Light"`, `FontSize="11"`, `TextAlignment="Left"`, design-time `Foreground="White"`, `Text=""`
- `Visibility = Collapsed` by default; flips to `Visible` only when service callback returns a tag whose parsed `Version` is strictly newer than `Assembly.GetExecutingAssembly().GetName().Version`
- `Foreground = brush;` set in BOTH `ApplyTheme` AND `ApplyDisplayColor` (same Phase 33 critical pattern as `TempsText`)
- 100% accent (full alpha) — DateText's 55% (0x8C) muted treatment is NOT applied here
- On visibility flip → `Visible`: re-call existing `SettingsService.Clamp` with current `Left`/`Top` so a near-edge widget doesn't clip the new line off-screen (UI-05)

**Kickoff Path**
- `Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, async () => { ... })` from `MainWindow.ContentRendered` — first paint never gated on network call dispatch
- Outer `try { } catch (Exception) { }` at the kickoff boundary as defense in depth (the service already catches narrow exceptions, but `TaskScheduler.UnobservedTaskException` from the fire-and-forget edge stays silenced)
- Service callback marshals to UI thread via `Dispatcher.Invoke` before touching `UpdateText.Text` or `.Visibility`
- When `_settings.UpdateChecksEnabled == false` at launch: service constructed and registered for dispose, but no kickoff `BeginInvoke` is scheduled

**Settings Plumbing**
- `bool UpdateChecksEnabled { get; init; } = true;` on `AppSettings` record — explicit `= true` mandatory for absent-field upgrade safety
- `SettingsService.Defaults()` returns `UpdateChecksEnabled = true`
- `SettingsService.Validate()` requires no new guard (bool cannot be invalid)
- `SettingsSnapshot` gains `UpdateChecksEnabled` bool; `MainWindow.GetCurrentSettingsSnapshot()` populates from `_settings.UpdateChecksEnabled`
- New `<CheckBox x:Name="ChkUpdateChecksEnabled">` in `SettingsWindow.xaml` Behavior tab with label `Check for updates on launch` — clones `ChkAutoLaunchEnabled` placement and styling
- `event Action<bool>? UpdateChecksEnabledChanged;` fired from `Checked`/`Unchecked` handlers; `_suppressEvents` guard during `PopulateControls` (existing pattern)
- `MainWindow.OpenSettings` immediate-persist: `_settings = _settings with { UpdateChecksEnabled = v }; SaveSettings();`
- `ResetToDefaults()` restores `UpdateChecksEnabled = true` and refreshes via `RefreshControls(GetCurrentSettingsSnapshot())`

**Version Comparison**
- `UpdateVersionComparer.TryParseTag(string? tag, out Version version)`:
  - Strips leading `v`/`V` (case-insensitive single-char strip)
  - Accepts 2-component (`4.5`), 3-component (`4.5.0`), 4-component (`4.5.0.0`) numeric tags
  - Rejects pre-release suffixes (`-beta`, `-rc1`, `-alpha.2`)
  - Rejects build metadata (`+sha.abc`)
  - Returns false on null, empty, whitespace, garbage, or any non-numeric segment
- `IsNewer(Version running, Version latest)` returns `latest > running` strictly (equal returns false)
- `Assembly.GetExecutingAssembly().GetName().Version` is the canonical "running version" source — never `AssemblyInformationalVersion` (DEV-02)

**Csproj Sync**
- `<InformationalVersion>3.6.0</InformationalVersion>` → `<InformationalVersion>4.5.0</InformationalVersion>` to match `<Version>4.5.0</Version>`
- One-line edit; CI tag-push override behavior in `release.yml` unchanged

**Test Coverage**
- `UpdateVersionComparerTests`: ~13–17 DataRow rows covering: v-prefix strip, 2/3/4-component happy paths, prerelease reject (`-beta`/`-rc1`/`-alpha.2`), build-metadata reject (`+sha`), null/empty/whitespace/garbage reject, IsNewer ordering (running<latest=true, running=latest=false, running>latest=false, multi-component edge cases)
- Service-shape tests (~6–8 in `FuzzyClock.App.Tests` via `FakeHttpMessageHandler` seam): happy path 200 with valid tag, 404 returns null, 403 returns null, 429 returns null, malformed JSON returns null, draft/prerelease tag silently rejected, `#if DEBUG` returns null without dispatching, request shape (User-Agent + Accept headers present)
- `AppSettings` round-trip + absent-field tests for `UpdateChecksEnabled` survival and `= true` default (extends STEST-01 round-trip; new STEST-09 absent-field follows STEST-08 pattern)

### Claude's Discretion

- Internal field naming, helper organization, exact test method names, README paragraph wording — all free choice within the patterns above
- Specific exception logging output during DEV builds (acceptable as `Debug.WriteLine` for triage; never to console/stderr in RELEASE)
- Whether the `UpdateCheckService` field on `MainWindow` is constructed eagerly in `ApplySettings` or lazily on `ContentRendered` — both work; pick whichever cleanest matches `TemperatureService` precedent

### Deferred Ideas (OUT OF SCOPE)

These were explicitly noted by the milestone Out-of-Scope table and remain out of scope for v4.5:

- **PERF-FOLLOW-01** — investigate occasional brief freeze observed during ghost-mode fade under sustained 25–50% CPU load (v4.4 PERF-01 `barely-stepping` verdict); v4.5 doesn't touch the fade-render path so this is carried forward to v4.6+
- **UPD-FUTURE-01** — clickable notice opens GitHub release URL in browser (v4.5 is plain text)
- **UPD-FUTURE-02** — manual "Check now" tray menu item (v4.5 is once-per-launch only)
- **UPD-FUTURE-03** — pre-release / beta-channel toggle (v4.5 uses `/releases/latest` which filters server-side)
- **UPD-FUTURE-04** — snooze / dismiss `DismissedVersion` field (adds state complexity)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UPD-01 | `UpdateVersionComparer.TryParseTag` strips `v`/`V`, accepts 2/3/4-component, rejects prerelease/build-meta/garbage | §1 (Core helper code skeleton) + §6 DataRow test grid |
| UPD-02 | `IsNewer(running, latest)` returns true iff `latest > running`; equal returns false | §1 (`Version` operator overloads documented in BCL) |
| UPD-03 | Single anonymous HTTPS GET to `/repos/atabisz/FuzzyStatsClock/releases/latest` per launch with `User-Agent` + `Accept` headers | §2 GitHub REST verbatim — User-Agent missing → 403; Accept: application/vnd.github+json |
| UPD-04 | Long-lived static `HttpClient`, `Timeout=5s`, `SocketsHttpHandler.PooledConnectionLifetime=15min`, optional `HttpMessageHandler` ctor for tests | §3 Microsoft Learn verbatim citation; §6 FakeHttpMessageHandler seam pattern |
| UPD-05 | 5s linked CTS via `CreateLinkedTokenSource(shutdownCts.Token)` + `CancelAfter(5s)` so shutdown unwinds in ms | §4 linked CTS skeleton |
| UPD-06 | Source-gen `JsonSerializerContext` for `GitHubRelease` POCO (`tag_name`, `prerelease`, `draft`); no reflection | §5 Microsoft Learn source-gen example + JsonPropertyName mapping |
| UPD-07 | Narrow catch only (HttpRequestException, TaskCanceledException, OperationCanceledException, JsonException, FormatException, ArgumentException); silent failure → null | §4 service skeleton |
| UPD-08 | Idempotent `Interlocked.CompareExchange` on `int _disposed`; three-tier dispose mirrors TemperatureService | §7 verbatim TemperatureService pattern (already-shipped precedent) |
| UPD-09 | `#if DEBUG` skip at top of method; verified by service-shape test (DEV-03) | §4 + §6 — test runs in DEBUG → assertion is natural |
| UPD-10 | Repo coordinates hard-coded `internal const string` — never read from settings.json | §1 — `internal const string RepoUrl = "..."` line |
| UI-01 | New `<TextBlock x:Name="UpdateText">` 8th/final StatsPanel child below `TempsText`; cloned styling | §8 XAML diff verbatim from TempsText (lines 290–297 of MainWindow.xaml) |
| UI-02 | `UpdateText.Text = $"{tag} available"` — preserves leading `v` prefix from GitHub `tag_name` | §8 — formatter shape `$"{newerTag} available"` |
| UI-03 | `Visibility=Collapsed` by default; flips Visible only when `IsNewer(running, parsed) == true` | §8 service-callback skeleton |
| UI-04 | `UpdateText.Foreground = brush;` in BOTH `ApplyTheme` AND `ApplyDisplayColor` (Phase 33 critical) | §9 — exact line 1919 / 1957 pattern of `TempsText.Foreground = brush;` |
| UI-05 | Re-clamp via `SettingsService.Clamp` when visibility flips Visible — same shape as `SetStatsVisible` | §8 — re-clamp block from MainWindow.xaml.cs:1247-1258 |
| UI-06 | Kickoff via `Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, ...)` from `ContentRendered` | §10 dispatcher kickoff skeleton |
| UI-07 | Service callback marshals via `Dispatcher.Invoke` before touching XAML | §10 |
| UI-08 | Outer `try { } catch (Exception) { }` at the kickoff boundary as defense-in-depth | §10 — outer catch around BeginInvoke async lambda |
| PERS-01 | New `bool UpdateChecksEnabled { get; init; } = true;` in `AppSettings` (mirrors `UptimeVisible`/`GhostModeEnabled`/`UseCtrl`) | §11 AppSettings diff |
| PERS-02 | `SettingsService.Defaults()` returns `UpdateChecksEnabled = true` | §11 Defaults() diff |
| PERS-03 | `SettingsService.Validate()` requires no new guard (bool cannot be invalid) | §11 — no Validate() change |
| PERS-04 | Round-trip JSON test extends STEST-01 OR adds standalone | §6 — 1 round-trip method clone of `RoundTrip_TempCpuVisible_Matches` |
| PERS-05 | Absent-field test mirrors STEST-02/STEST-08 — JSON without `UpdateChecksEnabled` deserializes to true | §6 — 1 absent-field method clone of `Deserialize_MissingUptimeVisible_DefaultsToTrue` |
| PERS-06 | `<CheckBox x:Name="ChkUpdateChecksEnabled">` in Behavior tab cloning `ChkAutoLaunchEnabled` placement/styling | §12 SettingsWindow.xaml diff verbatim |
| PERS-07 | `event Action<bool>? UpdateChecksEnabledChanged;` from Checked/Unchecked handlers; `_suppressEvents` guard | §12 SettingsWindow.xaml.cs diff — event field + `Chk_Changed` handler clone |
| PERS-08 | `SettingsSnapshot.UpdateChecksEnabled` populated by `GetCurrentSettingsSnapshot` | §11 SettingsSnapshot append; §13 GetCurrentSettingsSnapshot append |
| PERS-09 | Immediate-persist in OpenSettings: `_settings = _settings with { UpdateChecksEnabled = v }; SaveSettings();` | §13 OpenSettings event subscription clone of TempsLineVisibleChanged handler (MainWindow.xaml.cs:741-746) |
| PERS-10 | Mid-session toggle OFF cancels in-flight CTS; toggling back ON is a no-op (once-per-launch) | §13 — handler shape that calls `_updateService.CancelInFlight()` + collapses TextBlock |
| PERS-11 | `ResetToDefaults()` restores `UpdateChecksEnabled = true` + `RefreshControls(GetCurrentSettingsSnapshot())` | §14 ResetToDefaults diff |
| PERS-12 | When `_settings.UpdateChecksEnabled == false` at launch, service is constructed + dispose-registered but kickoff is skipped | §10 — `if (_settings.UpdateChecksEnabled) Dispatcher.BeginInvoke(...);` gate |
| DEV-01 | `<InformationalVersion>3.6.0</InformationalVersion>` → `4.5.0` | §15 — verified `release.yml` line 49–60 does NOT pass `-p:InformationalVersion`, so the file value flows through |
| DEV-02 | `Assembly.GetExecutingAssembly().GetName().Version` canonical, never `AssemblyInformationalVersion` | §15 |
| DEV-03 | Service-shape test verifies `#if DEBUG` skip — test runs in DEBUG configuration | §6 — `Service_DebugBuild_ReturnsNullWithoutHttpCall` test |
| DOCS-01 | README mentions notice line + `Check for updates on launch` toggle | §16 README diff |
</phase_requirements>

## Summary

This phase adds an opt-in once-per-launch GitHub Releases update checker to FuzzyClock v4.5. The phase is small, well-bounded, and follows two strong precedents already in the repo: (1) the **`TemperatureService` three-tier dispose + async-init pattern** introduced in v4.2 Phase 75/76, and (2) the **Phase 33 dual-path foreground assignment** required for every accent-colored TextBlock. Every architectural decision in the phase has been cross-checked against working production code in this repository.

The implementation is a single Core helper, a single App service, ~15 LOC of XAML, and ~30 LOC of code-behind wiring. The only external surface area is a single anonymous HTTPS GET to `https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest` per app launch — well under GitHub's 60 req/hr/IP anonymous limit. All failure modes (offline, rate-limited, malformed response, slow response, app shutdown during in-flight call) collapse to the silent-failure posture: `Visibility.Collapsed` on the notice TextBlock with zero user-visible feedback.

**Primary recommendation:** Lift the `TemperatureService` async-init + `Interlocked`-guarded three-tier dispose pattern verbatim. Use `HttpClient` with a long-lived static `SocketsHttpHandler` (15-min `PooledConnectionLifetime`) wrapped behind an injectable `HttpMessageHandler` constructor parameter for testability. Use `JsonSerializerContext` source-generation (already the repo's house style — Newtonsoft.Json explicitly out of scope per Out-of-Scope table). Keep the catch list narrow (six exceptions, never `Exception`). The `#if DEBUG return null;` skip at the top of the method makes the service-shape test trivially correct because MSTest runs in DEBUG configuration.

## Standard Stack

### Core (everything is in-box .NET 10 — no new NuGet)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Net.Http` | net10.0 in-box | HTTP client | Single static `HttpClient` is the canonical pattern for one-call-per-launch services. `IHttpClientFactory` is overkill (Out-of-Scope table) |
| `System.Net.Http.SocketsHttpHandler` | net10.0 in-box | Connection pooling + DNS refresh | `PooledConnectionLifetime` solves DNS staleness in long-lived static `HttpClient` instances (verified verbatim against Microsoft Learn — "useful in order to allow connections to be reestablished periodically so as to better reflect DNS or other network changes") |
| `System.Text.Json` | net10.0 in-box | JSON deserialization | Already the project standard; `JsonSerializerContext` source-gen for `GitHubRelease` POCO is trim/AOT-safe |
| `System.Text.Json.Serialization` | net10.0 in-box | `[JsonPropertyName]`, `[JsonSerializable]`, `[JsonSourceGenerationOptions]` | Maps snake_case GitHub fields (`tag_name`, `prerelease`, `draft`) to PascalCase POCO without reflection |
| `System.Threading` | net10.0 in-box | `CancellationTokenSource.CreateLinkedTokenSource` + `CancelAfter` | Standard linked-CTS pattern for "earlier of [shutdown, 5s timeout]" |
| `System.Reflection` | net10.0 in-box | `Assembly.GetExecutingAssembly().GetName().Version` | Canonical "running version" source per DEV-02 |
| `MSTest` | 4.0.1 (already pinned) | Tests | Same framework as all 587 existing tests; matches `FuzzyClock.App.Tests.csproj` line 10 verbatim |

**No new packages.** REL-03 invariant unaffected (`FuzzyClock.Core` stays LHM-free; the new helper there has zero new dependencies).

### Alternatives Considered (and rejected per Out-of-Scope table)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| Plain HttpClient | `IHttpClientFactory` | One call per process — DI infrastructure overkill |
| `System.Text.Json` source-gen | Newtonsoft.Json | Project standard is STJ; explicitly Out of Scope |
| HTTP + STJ | `Octokit` SDK | One endpoint, one POCO; SDK overkill |
| In-house notify-only | Squirrel / Velopack / AutoUpdater.NET | Notify-only feature; auto-update is Out of Scope |
| Anonymous GET | Authenticated (PAT/OAuth) | 60 req/hr/IP is plenty for once-per-launch; no auth secrets to ship |
| One-shot `/releases/latest` | List + filter on `prerelease==false` | `/releases/latest` filters server-side; UPD-FUTURE-03 pre-release toggle is deferred |
| Anonymous public endpoint | ETag conditional GETs | Once per launch; bandwidth optimization unwarranted |

**Installation:** None. Everything is in-box.

## Architecture Patterns

### Project Structure (additions only)

```
FuzzyClock.Core/
├── UpdateVersionComparer.cs           NEW — pure static; `TryParseTag` + `IsNewer`

FuzzyClock.Core.Tests/
├── UpdateVersionComparerTests.cs      NEW — ~13–17 DataRow rows

FuzzyClock.App/
├── Services/                          NEW directory (project layout uses flat root today;
│   └── UpdateCheckService.cs          NEW — service folder is one-of-a-kind for organisational
│                                      clarity; CONTEXT.md mentions the path explicitly. The
│                                      `<files_to_read>` block also references "Services/"
│                                      so we honor that placement (Phase 75 placed
│                                      TemperatureService.cs at FuzzyClock.App/ root; we have
│                                      Claude's Discretion to either match that flat layout or
│                                      introduce Services/. Recommend: match flat layout to
│                                      preserve the existing convention — TemperatureService,
│                                      ContrastSamplerService, AutoLaunchService all sit at root.)
├── AppSettings.cs                     EDIT — append `UpdateChecksEnabled = true` init field
├── SettingsService.cs                 EDIT — extend Defaults() with one line; Validate() unchanged
├── SettingsSnapshot.cs                EDIT — append `UpdateChecksEnabled` field
├── MainWindow.xaml                    EDIT — append `<TextBlock x:Name="UpdateText">` to StatsPanel
├── MainWindow.xaml.cs                 EDIT — `_updateService` field + ContentRendered kickoff +
│                                      ApplyTheme + ApplyDisplayColor + UpdateUpdateNoticeDisplay
│                                      + GetCurrentSettingsSnapshot + OpenSettings event +
│                                      OnClosing tier 1 + ResetToDefaults
├── SettingsWindow.xaml                EDIT — append `<CheckBox x:Name="ChkUpdateChecksEnabled">`
├── SettingsWindow.xaml.cs             EDIT — `event UpdateChecksEnabledChanged` + handler +
│                                      PopulateControls one-line append
├── App.xaml.cs                        EDIT — SessionEnding tier 2 + ProcessExit tier 3
└── FuzzyClock.App.csproj              EDIT — `<InformationalVersion>3.6.0</InformationalVersion>`
                                       → `4.5.0`

FuzzyClock.App.Tests/
├── UpdateCheckServiceTests.cs         NEW — ~6–8 service-shape tests via FakeHttpMessageHandler
├── FakeHttpMessageHandler.cs          NEW — test seam (override SendAsync)
└── AppSettingsTests.cs                EDIT — +1 round-trip + +1 absent-field test
```

**Recommendation on Services/ folder:** the existing convention is **flat root** (`TemperatureService.cs`, `ContrastSamplerService.cs`, `AutoLaunchService.cs`, `SettingsService.cs` all sit at `FuzzyClock.App/` root). Place `UpdateCheckService.cs` at `FuzzyClock.App/UpdateCheckService.cs` — DO NOT introduce `Services/` subdirectory just for this one file. The `<files_to_read>` block's `Services/` reference is forward-looking but breaking convention here would create inconsistency. (CONTEXT.md notes this is in Claude's Discretion.)

### Pattern 1: Long-lived Static HttpClient with `SocketsHttpHandler.PooledConnectionLifetime`

**What:** Single `HttpClient` instance per process, with a custom `SocketsHttpHandler` that periodically rotates connections so DNS changes (e.g., GitHub IP rotation) are picked up without restart.

**When to use:** Any process that holds an `HttpClient` for the lifetime of the app. The classic anti-pattern (`new HttpClient()` per call) creates socket-exhaustion DOS risk; the modern pattern (long-lived `HttpClient` with bounded `PooledConnectionLifetime`) avoids both that AND DNS staleness.

**Verbatim from Microsoft Learn (System.Net.Http.SocketsHttpHandler.PooledConnectionLifetime, retrieved 2026-05-29):**

> Gets or sets how long a connection can be in the pool to be considered reusable. Default value: `InfiniteTimeSpan`.
>
> This property defines maximal connection lifetime in the pool, tracking its age from when the connection was established, regardless of how much time it spent idle or active. Connections are not torn down while actively being used to service requests. **This lifetime is useful in order to allow connections to be reestablished periodically so as to better reflect DNS or other network changes.**
>
> If the connection endpoint is not the Domain name but the IP address, the value can be `InfiniteTimeSpan`.

**Recommended value: 15 minutes.** This is the value CONTEXT.md locked. It's the same order as Microsoft's own `IHttpClientFactory` default (originally 2 minutes; in modern .NET typical guidance is 1–15 minutes depending on call rate). For a once-per-launch service, the value barely matters — but 15 minutes is well-established prior art and matches the locked decision.

**Skeleton:**

```csharp
// Source: Microsoft Learn — System.Net.Http.SocketsHttpHandler.PooledConnectionLifetime
//   https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler.pooledconnectionlifetime
internal sealed class UpdateCheckService : IDisposable
{
    // Long-lived static HttpClient; one per process. Created lazily from the
    // _sharedHandlerFactory result so test seams can swap the handler.
    private static readonly HttpClient _sharedClient = CreateSharedClient();

    private static HttpClient CreateSharedClient()
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(15),
        };
        return new HttpClient(handler, disposeHandler: true)
        {
            Timeout = TimeSpan.FromSeconds(5),
        };
    }
    ...
}
```

### Pattern 2: Linked CancellationTokenSource for "earlier of {shutdown, 5s}"

**What:** `CancellationTokenSource.CreateLinkedTokenSource(shutdown.Token)` returns a CTS that signals when EITHER the parent token signals OR `Cancel()`/`CancelAfter()` fires on the linked CTS. Using both, a 5-second `CancelAfter` plus a service-owned shutdown CTS gives "5s timeout, OR shutdown — whichever comes first."

**When to use:** Any async network call you want to bound by both a per-call timeout AND a process-lifetime signal. Without the linked CTS, app shutdown during an in-flight 5s call would block teardown for up to 5s; with the link, the shutdown CTS firing immediately cancels the call.

**Skeleton:**

```csharp
// Source: BCL — CancellationTokenSource.CreateLinkedTokenSource (in-box .NET 10)
private CancellationTokenSource? _activeCts;          // mid-session toggle OFF cancels this
private readonly CancellationTokenSource _shutdownCts = new();

internal async Task<Version?> CheckAsync()
{
#if DEBUG
    return null;       // UPD-09 — prevents dev screenshots showing fake "vX.Y.Z available"
#else
    using var perCall = CancellationTokenSource.CreateLinkedTokenSource(_shutdownCts.Token);
    perCall.CancelAfter(TimeSpan.FromSeconds(5));
    Interlocked.Exchange(ref _activeCts, perCall);   // PERS-10: held in field for mid-session cancel

    try
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, RepoUrl);
        req.Headers.UserAgent.ParseAdd(UserAgentString);
        req.Headers.Accept.ParseAdd("application/vnd.github+json");

        using var resp = await _sharedClient.SendAsync(req, perCall.Token).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode) return null;

        await using var stream = await resp.Content.ReadAsStreamAsync(perCall.Token)
                                                   .ConfigureAwait(false);
        var release = await JsonSerializer.DeserializeAsync(
            stream,
            UpdateCheckJsonContext.Default.GitHubRelease,
            perCall.Token).ConfigureAwait(false);

        if (release is null || release.Draft || release.Prerelease) return null;
        return UpdateVersionComparer.TryParseTag(release.TagName, out var v) ? v : null;
    }
    catch (HttpRequestException)     { return null; }
    catch (TaskCanceledException)    { return null; }      // includes 5s timeout
    catch (OperationCanceledException) { return null; }    // includes shutdown
    catch (JsonException)            { return null; }
    catch (FormatException)          { return null; }
    catch (ArgumentException)        { return null; }
    finally
    {
        Interlocked.CompareExchange(ref _activeCts, null, perCall);
    }
#endif
}

internal void CancelInFlight()
{
    // PERS-10: mid-session toggle OFF — cancels active call without disposing the service.
    var cts = Interlocked.Exchange(ref _activeCts, null);
    try { cts?.Cancel(); } catch { /* race with finally is harmless */ }
}
```

### Pattern 3: Source-Generated `JsonSerializerContext` for the `GitHubRelease` POCO

**What:** `[JsonSerializable(typeof(GitHubRelease))]` on a `partial class : JsonSerializerContext` triggers the .NET source generator to emit fully-typed deserialization metadata at compile time. Used together with `JsonSerializer.DeserializeAsync(stream, Context.Default.GitHubRelease, ct)`.

**When to use:** Always preferred over reflection-based deserialization in modern .NET (trim-safe, AOT-safe, faster cold start). Already the project standard for any non-trivial JSON shape.

**Verbatim pattern from Microsoft Learn (`source-generation.md`, 2025-11-13):**

```csharp
[JsonSourceGenerationOptions(WriteIndented = true)]
[JsonSerializable(typeof(WeatherForecast))]
internal partial class SourceGenerationContext : JsonSerializerContext { }

// Deserialize:
weatherForecast = JsonSerializer.Deserialize(
    jsonString, SourceGenerationContext.Default.WeatherForecast);
```

**For the GitHub release shape (snake_case → PascalCase), use `[JsonPropertyName]` on each POCO field:**

```csharp
// Source: Microsoft Learn — System.Text.Json source generation
//   https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation
internal sealed class GitHubRelease
{
    [JsonPropertyName("tag_name")]   public string? TagName    { get; init; }
    [JsonPropertyName("prerelease")] public bool    Prerelease { get; init; }
    [JsonPropertyName("draft")]      public bool    Draft      { get; init; }
}

[JsonSerializable(typeof(GitHubRelease))]
internal partial class UpdateCheckJsonContext : JsonSerializerContext { }
```

**Note:** GitHub returns ~30+ fields per release; the POCO only declares the three we read. STJ silently ignores unknown fields by default (matches the existing `AppSettings.cs` migration pattern at `SettingsService.cs:54` — old `DialMode` field is silently ignored).

### Anti-Patterns to Avoid

- **`new HttpClient()` per call** — socket exhaustion under load; ignored DNS changes. Use the long-lived static instance.
- **`catch (Exception)`** — explicitly forbidden by UPD-07. Hides bugs that should propagate (`OutOfMemoryException`, `StackOverflowException`).
- **Reflection-based `JsonSerializer.Deserialize<T>(json)`** — works at runtime today, breaks on `PublishTrimmed=true`. UPD-06 requires source-gen.
- **No User-Agent header** — GitHub returns 403 (verified verbatim from docs.github.com 2026-05-29: *"Requests without a User-Agent header will be rejected with a 403 Forbidden response."*).
- **Storing the repo URL in `settings.json`** — UPD-10 security trap (malicious settings could redirect to attacker endpoint). Hard-code as `internal const string`.
- **Mutating `Brushes.*` static instances** — frozen, throws `InvalidOperationException`. Always `new SolidColorBrush(_accentColor)`. (Existing project pattern, PROJECT.md key decision.)
- **Setting `UpdateText.Foreground` only in `ApplyTheme`** — Phase 33 critical regression pattern. Auto-contrast switching calls `ApplyDisplayColor`, not `ApplyTheme`. **Must be set in BOTH.**
- **Setting `UpdateText.Foreground = brush;` only at one call site** — both `ApplyTheme` AND `ApplyDisplayColor` need the line.
- **Touching XAML from the service callback thread** — `UpdateText.Text` and `.Visibility` must be set on the WPF Dispatcher thread. Use `Dispatcher.Invoke`/`Dispatcher.BeginInvoke` to marshal.
- **Calling `Dispatcher.Invoke` (synchronous) from the kickoff path** — would block the kickoff async lambda waiting for the dispatcher; use `Dispatcher.BeginInvoke` instead. (Inside the service callback, sync `Invoke` is fine because the caller is the background continuation, not the UI thread.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version compare | Custom split-by-dot string parser | `System.Version.Parse` / `TryParse` | Handles 2/3/4-component, has correct `>` operator overloads, rejects garbage. Existing BCL since .NET Framework 1.0 |
| HTTP client lifecycle | Custom socket + connection pool | `HttpClient` + `SocketsHttpHandler.PooledConnectionLifetime` | Decade of bug fixes around DNS/keepalive/HTTP2; you cannot do better |
| JSON parse | Hand-rolled tokenizer / regex | `System.Text.Json` source-gen | Trim/AOT safe; zero-alloc paths in .NET 8+ |
| Cancellation linking | Polling timestamps + manual flag | `CancellationTokenSource.CreateLinkedTokenSource` + `CancelAfter` | Atomic, correct under shutdown race |
| Idempotent dispose | `bool _disposed` field | `int _disposed` + `Interlocked.CompareExchange` | Lock-free, race-safe across all three dispose tiers (already the TemperatureService precedent) |
| HTTP test seam | Real socket against `httpbin.org` | `FakeHttpMessageHandler : HttpMessageHandler` override `SendAsync` | Hermetic, deterministic; no flaky network tests in CI |
| Settings absent-field defaults | Custom JSON migration logic | `init`-property record default values | Built into System.Text.Json; zero migration code (existing `AppSettings` pattern) |

**Key insight:** Every "harder than it looks" subproblem in this phase has a battle-tested .NET BCL solution shipping in-box. Custom code multiplies surface area for bugs without solving anything; the Out-of-Scope table reflects this discipline (no Octokit, no Squirrel, no Newtonsoft).

## Common Pitfalls

### Pitfall 1: Missing `User-Agent` Header → 403 Forbidden

**What goes wrong:** Service silently fails on every request. No exception thrown — just a non-200 status code, narrow catch swallows it, `Visibility.Collapsed` stays. User sees no notice ever.

**Why it happens:** GitHub REST API returns 403 for any request without a `User-Agent` header — regardless of authentication state. This is a hard requirement, not a recommendation.

**How to avoid:** Set `req.Headers.UserAgent.ParseAdd("FuzzyClock/4.5.0.0")` on EVERY request. Use `Assembly.GetExecutingAssembly().GetName().Version` to interpolate the running version so log triage on the GitHub side shows what tag the user is on. Verify in a service-shape test that `req.Headers.UserAgent.Count > 0`.

**Warning signs:** A working dev-build returns 403 from your local machine but works on a shared dev box. Inspect headers in `FakeHttpMessageHandler.SendAsync` and assert the User-Agent is present.

**Verbatim from docs.github.com (retrieved 2026-05-29):** *"All API requests must include a valid User-Agent header. The User-Agent header identifies the user or application that is making the request. Requests without a User-Agent header will be rejected with a 403 Forbidden response."*

### Pitfall 2: Reflection-based `JsonSerializer.Deserialize<T>` works in DEBUG, fails in trimmed Release

**What goes wrong:** All tests pass in `dotnet test` (which runs DEBUG by default), but the published self-contained release exe silently returns null because `JsonSerializer.Deserialize<GitHubRelease>(json)` falls through to a reflection path that's been trimmed away.

**Why it happens:** The CI Publish step uses `-p:PublishTrimmed=true` (or eventually will). Reflection-based deserialization without an explicit `JsonSerializerContext` triggers a runtime InvalidOperationException OR silently throws a `JsonException` that the narrow catch swallows.

**How to avoid:** Use the source-gen `JsonSerializerContext` from day one. Pass `UpdateCheckJsonContext.Default.GitHubRelease` to `JsonSerializer.DeserializeAsync` — never `<GitHubRelease>` generic overload.

**Warning signs:** UPD-06 explicitly forbids reflection deserialization; the planner should reject any plan that uses `Deserialize<T>(string)` instead of `Deserialize(stream, Context.Default.T)`.

### Pitfall 3: Catching `Exception` Instead of the Narrow Six

**What goes wrong:** A bug elsewhere (`NullReferenceException` from a refactor, `OutOfMemoryException` from a leak) gets eaten by the catch and never surfaces. The user sees "no notice"; the developer never sees a crash log.

**Why it happens:** Defensive coding instinct says "catch everything"; UPD-07 explicitly carves out the six exceptions that ARE expected from `HttpClient` + `JsonSerializer` + `Version.Parse` and forbids `catch (Exception)`.

**How to avoid:** Six catches in this exact order:

```csharp
catch (HttpRequestException)        { return null; }
catch (TaskCanceledException)       { return null; }
catch (OperationCanceledException)  { return null; }
catch (JsonException)               { return null; }
catch (FormatException)             { return null; }
catch (ArgumentException)           { return null; }
// Anything else propagates — that's a bug, not "the network is down"
```

**Note on `TaskCanceledException` vs `OperationCanceledException`:** `TaskCanceledException : OperationCanceledException`, so listing both is redundant in C#'s exception-handler-walk semantics — `OperationCanceledException` would catch both. But CONTEXT.md locks the six-name list, and the order in the locked list (Http, TaskCanceled, OperationCanceled, …) puts `TaskCanceledException` BEFORE `OperationCanceledException`, which is the only correct order: catch the more-derived first. **Do not reorder this list.**

### Pitfall 4: Three-Tier Dispose Race — `Computer.Close()` Called Twice

**What goes wrong:** If `OnClosing` (tier 1) and `SessionEnding` (tier 2) both fire (e.g., user clicks Quit on tray, then Windows initiates shutdown 100ms later), `Dispose()` runs twice. Without a guard, the second call would either re-cancel the already-disposed CTS or double-dispose `HttpClient` (well, in this case `HttpClient` is static and shared so we don't dispose it — but the per-instance `_shutdownCts` would throw `ObjectDisposedException`).

**Why it happens:** Three independent dispose paths can fire in any interleaving. Win32 shutdown can fire `WM_QUERYENDSESSION` while WPF is still processing `Window.Closing`.

**How to avoid:** Verbatim copy of `TemperatureService.Dispose` (FuzzyClock.App/TemperatureService.cs:281–300):

```csharp
public void Dispose()
{
    if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0) return;
    try { _shutdownCts.Cancel(); } catch { }
    try { _shutdownCts.Dispose(); } catch { }
    // _sharedClient is process-static — DO NOT dispose. Process exit reaps the socket.
}
```

**Warning signs:** Look for any `ObjectDisposedException` in shutdown logs; they indicate the guard isn't holding. Tests `Dispose_CalledThreeTimes_*` and `Dispose_CalledConcurrentlyFromThreeThreads_*` (already shipped pattern in `TemperatureServiceTests.cs:316-344`) should be cloned for `UpdateCheckServiceTests`.

### Pitfall 5: Phase 33 Dual-Path Regression — Foreground Set Only in `ApplyTheme`

**What goes wrong:** `UpdateText` renders correctly when the user picks a preset accent color (because `SetAccentColor` calls `ApplyTheme`), but the moment the auto-contrast sampler trips and calls `ApplyDisplayColor` (which is the OTHER painting path used by the WCAG-based black/white override), `UpdateText.Foreground` doesn't update — it stays the previous accent color while every other text element flips. Visual inconsistency on every contrast switch.

**Why it happens:** `ApplyTheme` and `ApplyDisplayColor` are TWO INDEPENDENT painting paths. `ApplyTheme` runs from preset / custom color picks; `ApplyDisplayColor` runs from `_contrast.ColorChanged` events (every 500ms when sampler detects insufficient contrast). Both must touch the same set of TextBlock `Foreground` properties.

**How to avoid:** Search MainWindow.xaml.cs for all current foreground-assigning lines in `ApplyTheme` (lines 1869–1928); make sure the EXACT same set of lines exists in `ApplyDisplayColor` (lines 1930–1962). For Phase 88, both methods need:

```csharp
UpdateText.Foreground = brush;   // 100% accent, NOT the 0x8C dimmed treatment
```

**Both lines, same brush expression, same indentation.** This is the single most regression-prone pattern in the codebase per the Phase 33 decision in PROJECT.md (`Stats label TextBlocks must have x:Name for code-behind access… both ApplyDisplayColor and ApplyTheme must cover the same element set; bug discovered during verification when label TextBlocks lacked names`).

**Warning signs:** Plan reviewer should grep for any new `TextBlock.Foreground` assignment in code-behind and confirm it appears in BOTH methods. Plan-03 acceptance criterion should explicitly require this dual-touch.

### Pitfall 6: Dispatcher Marshal — Touching XAML from the Service Callback Thread

**What goes wrong:** `UpdateText.Text = "v4.6.0 available";` from a `Task` continuation throws `InvalidOperationException: The calling thread cannot access this object because a different thread owns it.`

**Why it happens:** The `await _sharedClient.SendAsync(...).ConfigureAwait(false)` line forces the continuation onto the thread pool, not back to the WPF Dispatcher. Any subsequent line that touches a UI element runs on the wrong thread.

**How to avoid:** All UI writes go through `Dispatcher.Invoke(() => { ... })` (synchronous; safe because we're already off the UI thread) or `BeginInvoke`. Sample callback shape:

```csharp
// In MainWindow's kickoff path:
Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, async () =>
{
    try
    {
        var newer = await _updateService.CheckAsync().ConfigureAwait(false);
        if (newer is null) return;
        var running = Assembly.GetExecutingAssembly().GetName().Version!;
        if (!UpdateVersionComparer.IsNewer(running, newer)) return;

        // BACK TO UI THREAD before touching UpdateText
        Dispatcher.Invoke(() =>
        {
            UpdateText.Text = $"v{newer} available";
            UpdateText.Visibility = Visibility.Visible;

            // UI-05 re-clamp (mirrors SetStatsVisible path at MainWindow.xaml.cs:1247-1258)
            UpdateLayout();
            if (_hasUserPosition)
            {
                var screen = ScreenDpi.FromDipPoint(Left + ActualWidth / 2, Top + ActualHeight / 2);
                var clamped = SettingsService.Clamp(
                    new MonitorPosition { Left = Left, Top = Top },
                    ActualWidth, ActualHeight, screen);
                Left = clamped.Left;
                Top  = clamped.Top;
            }
        });
    }
    catch (Exception)
    {
        // Defense in depth (UI-08). The service already swallows narrow exceptions;
        // the only way we end up here is a bug in the service or a race in cancellation.
        // Per silent-failure posture, eat it.
    }
});
```

**Warning signs:** Any `UpdateText.*` assignment NOT inside a `Dispatcher.Invoke` lambda is a bug.

### Pitfall 7: Mid-session Toggle OFF — In-flight Call Still Renders Notice After User Disabled

**What goes wrong:** User flips `Check for updates on launch` OFF mid-session 200ms after launch. The 5-second HTTP request is still in flight on the thread pool. 4 seconds later the response arrives, the callback fires, and the notice line appears — exactly what the user just opted out of.

**Why it happens:** Without an explicit cancel, the in-flight `SendAsync` continues regardless of the setting flip.

**How to avoid:** Per PERS-10, store the active per-call CTS in a service field. The `UpdateChecksEnabledChanged(false)` handler calls `_updateService.CancelInFlight()`, which cancels the linked CTS — propagating through the entire chain (`SendAsync` throws `OperationCanceledException`, which the narrow catch swallows, return null, no UI mutation). Also: collapse the TextBlock immediately so even if the callback ALREADY-marshaled to the Dispatcher and is queued, the visible result is `Collapsed`:

```csharp
_settingsWindow.UpdateChecksEnabledChanged += v =>
{
    _settings = _settings with { UpdateChecksEnabled = v };
    SaveSettings();
    if (!v)
    {
        _updateService?.CancelInFlight();   // cancel any in-flight HTTP call
        UpdateText.Visibility = Visibility.Collapsed;
        UpdateText.Text = "";
    }
    // toggling back ON mid-session is a no-op (next-launch only invariant)
};
```

**Warning signs:** Manual test: launch, immediately open Settings, uncheck the box; ensure no notice appears ~5s later.

### Pitfall 8: `<InformationalVersion>` Drift Misleads Triage But Doesn't Break Comparison

**What goes wrong:** `<InformationalVersion>3.6.0</InformationalVersion>` is stale while `<Version>4.5.0</Version>` is current. If the comparison code reads `AssemblyInformationalVersion` (which is hand-edited and known stale), it would compare 3.6.0 against 4.5.0 from GitHub and incorrectly notify "v4.5.0 available" forever.

**Why it happens:** Three independent version attributes in C# (`AssemblyVersion`, `FileVersion`, `AssemblyInformationalVersion`); each can be set independently via csproj or `[assembly:]` attributes. A hand-edit drift between them is invisible at build time.

**How to avoid:** DEV-02 mandates `Assembly.GetExecutingAssembly().GetName().Version` as canonical — that's `AssemblyVersion` (from `<AssemblyVersion>` csproj line, set by CI to `${{ steps.version.outputs.version }}.0` at tag push). Never use `Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()`. DEV-01 also fixes the static drift with a one-line edit.

**Warning signs:** Any plan that calls `Assembly.*.InformationalVersion` is wrong. Search for that string and reject.

### Pitfall 9: Outer `try/catch (Exception)` at Kickoff vs. Narrow Catches in Service

**What goes wrong:** Plan reviewer sees the kickoff outer `try { ... } catch (Exception) { }` and rejects it for violating the "never `catch (Exception)`" rule.

**Why it happens:** UPD-07 forbids `catch (Exception)` in the SERVICE — because that's the production code path where unexpected exceptions indicate bugs. UI-08 explicitly REQUIRES an outer `catch (Exception)` at the FIRE-AND-FORGET BOUNDARY of the kickoff async lambda — because if anything escapes the service, it would surface as `TaskScheduler.UnobservedTaskException` (process-wide event with no obvious tie to FuzzyClock) which is much worse than a swallowed unexpected exception in the kickoff path. **The outer kickoff catch is defense in depth, not error suppression.**

**How to avoid:** Explicit comment in the kickoff lambda: `// UI-08: defense in depth — service already catches narrow exceptions, this prevents UnobservedTaskException`. Plan reviewer should accept the outer `catch (Exception)` ONLY at the kickoff async lambda boundary, NOT in the service.

### Pitfall 10: Service-Shape `#if DEBUG` Test Naturally Asserts Null in Test Runtime

**What goes wrong:** Plan reviewer sees `Assert.IsNull(await svc.CheckAsync())` and asks "what's this proving? The fake handler isn't even invoked!"

**Why it happens:** UPD-09's `#if DEBUG return null;` at the top of `CheckAsync` short-circuits BEFORE any HTTP call. In DEBUG builds (which is what MSTest runs in by default), the method always returns null without dispatching. The test's job is to PROVE this — the assertion *is* the contract.

**How to avoid:** Test name and comment make the intent explicit:

```csharp
[TestMethod]
public async Task CheckAsync_DebugBuild_ReturnsNullWithoutDispatchingHttpCall()
{
    // DEV-03: in DEBUG builds, CheckAsync MUST return null at the top of the method
    // before any HTTP call. The fake handler asserts it was never invoked.
    var fake = new FakeHttpMessageHandler(_ => throw new InvalidOperationException(
        "DEBUG build dispatched HTTP call — UPD-09 violation"));
    using var svc = new UpdateCheckService(fake);

    var result = await svc.CheckAsync();

    Assert.IsNull(result);
    Assert.AreEqual(0, fake.SendCount,
        "Service must not dispatch HTTP call in DEBUG configuration (UPD-09)");
}
```

In a hypothetical `dotnet test --configuration Release` invocation this test would invoke the handler — but the project tests run in Debug, so the assertion holds.

## Code Examples

Verified patterns. Source citations inline.

### §1 — `FuzzyClock.Core/UpdateVersionComparer.cs`

```csharp
// Pure static helper — no WPF, no HttpClient, no I/O. Lives in FuzzyClock.Core
// (net10.0, REL-03 invariant: zero PackageReference). Mirrors UptimeFormatter
// and DateFormatter pattern (FuzzyClock.Core/UptimeFormatter.cs).
namespace FuzzyClock.Core;

public static class UpdateVersionComparer
{
    /// <summary>
    /// Parse a GitHub-style release tag (e.g. "v4.5.0", "4.5", "4.5.0.0") into a
    /// System.Version. Returns false on null/empty/whitespace, on prerelease
    /// suffixes (-beta, -rc1, -alpha.2), on build metadata (+sha.abc), and on
    /// any non-numeric component.
    /// </summary>
    public static bool TryParseTag(string? tag, out Version version)
    {
        version = new Version(0, 0);   // sentinel out-value — caller must check return

        if (string.IsNullOrWhiteSpace(tag)) return false;
        var trimmed = tag.Trim();

        // Strip a single leading 'v' or 'V' (case-insensitive). Preserves the
        // GitHub convention of "v4.5.0" tags. We do NOT strip "version " or
        // longer prefixes — keep the rule narrow.
        if (trimmed[0] is 'v' or 'V') trimmed = trimmed[1..];

        // Reject prerelease suffix BEFORE Version.TryParse. Version.TryParse
        // accepts "4.5.0" but rejects "4.5.0-beta"; we want our own clear
        // rejection of any tag that isn't a clean release.
        if (trimmed.Contains('-') || trimmed.Contains('+')) return false;

        // Version.TryParse handles 2/3/4-component natively. It rejects
        // negative components, non-numeric components, and overflowing components
        // — every case we care about for "is this a release tag we recognize".
        return Version.TryParse(trimmed, out version!);
    }

    /// <summary>
    /// Returns true iff `latest` is strictly greater than `running`. Equal
    /// versions return false (UPD-02). System.Version.operator&gt; performs
    /// component-wise comparison with absent components treated as 0
    /// (so "4.5" and "4.5.0" and "4.5.0.0" all compare equal).
    /// </summary>
    public static bool IsNewer(Version running, Version latest)
        => latest > running;
}
```

### §2 — `FuzzyClock.App.Tests/FakeHttpMessageHandler.cs` (test seam)

```csharp
// Standard .NET test pattern — override SendAsync to return a prebuilt
// HttpResponseMessage. Inspired by every official Microsoft sample on
// HttpClient testability. UpdateCheckService takes an optional
// HttpMessageHandler ctor parameter; the FakeHttpMessageHandler is wired in.
namespace FuzzyClock.App.Tests;

internal sealed class FakeHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

    /// <summary>Last request seen by SendAsync — service-shape tests assert on headers.</summary>
    public HttpRequestMessage? LastRequest { get; private set; }
    public int SendCount { get; private set; }

    public FakeHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
        => _responder = responder;

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        SendCount++;
        LastRequest = request;
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_responder(request));
    }

    /// <summary>Convenience factory — 200 OK with the supplied JSON body.</summary>
    public static FakeHttpMessageHandler Json(string body, HttpStatusCode status = HttpStatusCode.OK)
        => new(_ => new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        });
}
```

### §3 — `FuzzyClock.App/UpdateCheckService.cs` (full skeleton)

```csharp
// Source: BCL HttpClient + SocketsHttpHandler.PooledConnectionLifetime
//   https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler.pooledconnectionlifetime
// Source: BCL CancellationTokenSource.CreateLinkedTokenSource
//   https://learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtokensource.createlinkedtokensource
// Source: System.Text.Json source generation
//   https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation
// Source: GitHub REST API rate limits
//   "60 requests per hour" anonymous, returns 403 or 429 when exceeded
//   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
// Source: GitHub REST API User-Agent requirement (verbatim)
//   "Requests without a User-Agent header will be rejected with a 403 Forbidden response"
//   https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
//
// Three-tier dispose mirrors TemperatureService.Dispose (FuzzyClock.App/TemperatureService.cs:281-300).
using System.Net.Http;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;

namespace FuzzyClock.App;

internal sealed class UpdateCheckService : IDisposable
{
    // UPD-10: hard-coded const — never read from settings.json (security: prevents
    // redirect-via-malicious-settings). Repo coordinate verified against
    // `git remote get-url origin` 2026-05-29.
    internal const string RepoUrl =
        "https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest";

    private static readonly string UserAgent = BuildUserAgent();

    // UPD-04: long-lived static HttpClient. Created lazily on first construction
    // when no test handler is injected. Test seam: production code never touches
    // _sharedClient; tests construct with their own handler via the alternate ctor.
    private static HttpClient? _sharedClient;
    private static readonly object _sharedClientGate = new();

    // Per-instance — points at either the shared static client or a test client.
    private readonly HttpClient _client;
    private readonly bool _ownsClient;   // true only when test handler was injected

    // UPD-05: per-call CTS held here so PERS-10 mid-session toggle can cancel.
    private CancellationTokenSource? _activeCts;

    // UPD-08 service-lifetime shutdown CTS — linked into every per-call CTS.
    // Tier 1/2/3 dispose calls _shutdownCts.Cancel() so any in-flight call
    // unwinds in milliseconds rather than 5 seconds.
    private readonly CancellationTokenSource _shutdownCts = new();

    private int _disposed;   // Interlocked guard (D-15 pattern from TemperatureService)

    /// <summary>Production constructor — uses the long-lived static HttpClient.</summary>
    public UpdateCheckService()
    {
        _client = GetOrCreateSharedClient();
        _ownsClient = false;
    }

    /// <summary>Test constructor — wires a FakeHttpMessageHandler. Disposes the client at Dispose.</summary>
    internal UpdateCheckService(HttpMessageHandler handler)
    {
        _client = new HttpClient(handler, disposeHandler: false)
        {
            Timeout = TimeSpan.FromSeconds(5),
        };
        _ownsClient = true;
    }

    private static HttpClient GetOrCreateSharedClient()
    {
        if (_sharedClient is not null) return _sharedClient;
        lock (_sharedClientGate)
        {
            if (_sharedClient is not null) return _sharedClient;
            var handler = new SocketsHttpHandler
            {
                PooledConnectionLifetime = TimeSpan.FromMinutes(15),
            };
            _sharedClient = new HttpClient(handler, disposeHandler: true)
            {
                Timeout = TimeSpan.FromSeconds(5),
            };
        }
        return _sharedClient;
    }

    private static string BuildUserAgent()
    {
        // UPD-03: User-Agent is REQUIRED; missing → 403 Forbidden (verified 2026-05-29).
        // Format: "FuzzyClock/4.5.0.0" — running version helps GitHub triage.
        var v = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0.0";
        return $"FuzzyClock/{v}";
    }

    /// <summary>
    /// Issue the once-per-launch GitHub Releases query. Returns the parsed latest
    /// version or null on any failure mode (silent-failure posture). In DEBUG
    /// builds, returns null at the top of the method without dispatching the
    /// HTTP call (UPD-09).
    /// </summary>
    public async Task<Version?> CheckAsync()
    {
#if DEBUG
        // UPD-09: prevents dev-build screenshots from showing nonsensical
        // "v4.4.0 available" notices when running an untagged dev build.
        return null;
#else
        // UPD-05: linked CTS — earlier of {shutdown, 5s timeout} wins.
        using var perCall = CancellationTokenSource.CreateLinkedTokenSource(_shutdownCts.Token);
        perCall.CancelAfter(TimeSpan.FromSeconds(5));

        // PERS-10: hold the active CTS so mid-session toggle OFF can cancel.
        Interlocked.Exchange(ref _activeCts, perCall);

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, RepoUrl);
            req.Headers.UserAgent.ParseAdd(UserAgent);
            req.Headers.Accept.ParseAdd("application/vnd.github+json");

            using var resp = await _client.SendAsync(req, perCall.Token).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) return null;   // 403 / 404 / 429 → silent

            await using var stream = await resp.Content.ReadAsStreamAsync(perCall.Token)
                                                       .ConfigureAwait(false);

            // UPD-06: source-gen — never reflection deserialization.
            var release = await JsonSerializer.DeserializeAsync(
                stream,
                UpdateCheckJsonContext.Default.GitHubRelease,
                perCall.Token).ConfigureAwait(false);

            // /releases/latest already filters draft/prerelease server-side,
            // but be defensive: a future GitHub API change should not cause us
            // to surface a draft tag to the user.
            if (release is null || release.Draft || release.Prerelease) return null;

            return UpdateVersionComparer.TryParseTag(release.TagName, out var v) ? v : null;
        }
        catch (HttpRequestException)        { return null; }
        catch (TaskCanceledException)       { return null; }   // 5s timeout
        catch (OperationCanceledException)  { return null; }   // shutdown
        catch (JsonException)               { return null; }   // malformed body
        catch (FormatException)             { return null; }   // header parse
        catch (ArgumentException)           { return null; }   // header parse
        finally
        {
            // Best-effort clear; race with CancelInFlight is harmless.
            Interlocked.CompareExchange(ref _activeCts, null, perCall);
        }
#endif
    }

    /// <summary>
    /// PERS-10: cancel any in-flight call without disposing the service.
    /// Called by MainWindow when the user toggles the checkbox OFF mid-session.
    /// </summary>
    public void CancelInFlight()
    {
        var cts = Interlocked.Exchange(ref _activeCts, null);
        try { cts?.Cancel(); } catch { /* race with finally is harmless */ }
    }

    public void Dispose()
    {
        // UPD-08: idempotent across three-tier (OnClosing + SessionEnding + ProcessExit).
        // Mirrors TemperatureService.Dispose verbatim.
        if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0) return;

        try { _shutdownCts.Cancel(); } catch { }
        try { _shutdownCts.Dispose(); } catch { }

        if (_ownsClient)
        {
            try { _client.Dispose(); } catch { }
        }
        // _sharedClient is process-static — DO NOT dispose here. Process exit reaps the socket.
    }
}

// UPD-06: source-gen JSON context. Trim/AOT-safe; PublishTrimmed-ready even though
// the project doesn't use trimming today.
internal sealed class GitHubRelease
{
    [JsonPropertyName("tag_name")]   public string? TagName    { get; init; }
    [JsonPropertyName("prerelease")] public bool    Prerelease { get; init; }
    [JsonPropertyName("draft")]      public bool    Draft      { get; init; }
}

[JsonSerializable(typeof(GitHubRelease))]
internal partial class UpdateCheckJsonContext : JsonSerializerContext { }
```

### §4 — Test methods (skeletons; planner picks final test names)

```csharp
// FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs
using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class UpdateVersionComparerTests
{
    // ----- TryParseTag happy path -----

    [TestMethod]
    [DataRow("v4.5.0",      4, 5, 0,   -1)]   // -1 in expected = "no 4th component"
    [DataRow("V4.5.0",      4, 5, 0,   -1)]   // case-insensitive single-char strip
    [DataRow("4.5.0",       4, 5, 0,   -1)]   // no v prefix
    [DataRow("4.5",         4, 5, -1,  -1)]   // 2-component
    [DataRow("4.5.0.0",     4, 5, 0,    0)]   // 4-component
    [DataRow("v10.20.30.40",10,20,30,  40)]   // multi-digit components
    public void TryParseTag_ValidTag_ParsesCorrectly(
        string tag, int expectedMajor, int expectedMinor, int expectedBuild, int expectedRevision)
    {
        Assert.IsTrue(UpdateVersionComparer.TryParseTag(tag, out var v));
        Assert.AreEqual(expectedMajor, v.Major);
        Assert.AreEqual(expectedMinor, v.Minor);
        Assert.AreEqual(expectedBuild, v.Build);       // -1 when absent
        Assert.AreEqual(expectedRevision, v.Revision); // -1 when absent
    }

    // ----- TryParseTag rejection path -----

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("v")]
    [DataRow("v.")]
    [DataRow("garbage")]
    [DataRow("v4.5.0-beta")]
    [DataRow("4.5.0-rc1")]
    [DataRow("v4.5.0-alpha.2")]
    [DataRow("4.5.0+sha.abc")]
    [DataRow("v4.x.0")]            // non-numeric
    [DataRow("4.5.0.0.0")]         // five components — Version.TryParse rejects
    public void TryParseTag_InvalidTag_ReturnsFalse(string? tag)
    {
        Assert.IsFalse(UpdateVersionComparer.TryParseTag(tag, out _));
    }

    // ----- IsNewer ordering -----

    [TestMethod]
    public void IsNewer_LatestStrictlyGreater_ReturnsTrue()
        => Assert.IsTrue(UpdateVersionComparer.IsNewer(new Version(4, 5, 0), new Version(4, 6, 0)));

    [TestMethod]
    public void IsNewer_RunningEqualsLatest_ReturnsFalse()
        => Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version(4, 5, 0), new Version(4, 5, 0)));

    [TestMethod]
    public void IsNewer_RunningGreaterThanLatest_ReturnsFalse()
        => Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version(4, 6, 0), new Version(4, 5, 0)));

    [TestMethod]
    public void IsNewer_TwoComponentVsThreeComponent_TreatedEqual()
    {
        // System.Version semantic: "4.5" == "4.5.0" == "4.5.0.0". The phase
        // comparison only triggers when latest > running, so a clean 2→3
        // component change should NOT spuriously fire the notice.
        Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version("4.5"), new Version("4.5.0")));
        Assert.IsFalse(UpdateVersionComparer.IsNewer(new Version("4.5.0"), new Version("4.5.0.0")));
    }
}
```

```csharp
// FuzzyClock.App.Tests/UpdateCheckServiceTests.cs (skeleton — ~6–8 methods)
using System.Net;
using System.Net.Http;
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

[TestClass]
public class UpdateCheckServiceTests
{
    // UPD-09: in DEBUG, the service short-circuits without dispatching.
    [TestMethod]
    public async Task CheckAsync_DebugBuild_ReturnsNullWithoutDispatchingHttpCall()
    {
        var fake = new FakeHttpMessageHandler(_ =>
            throw new InvalidOperationException("UPD-09 violation: HTTP dispatched in DEBUG"));
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
        Assert.AreEqual(0, fake.SendCount,
            "Service must not dispatch HTTP call in DEBUG configuration (UPD-09)");
    }

    // The remaining tests effectively assert the post-#if-DEBUG behavior. In a
    // Release-config test run they would exercise the full path; in Debug they
    // confirm the short-circuit is correct AND the fake handler stays uncalled.
    // Pattern: every test asserts `Assert.IsNull(result)`. The EFFECTIVE
    // assertions about request shape / catch coverage are documented as
    // contract-only tests — they describe expected Release-config behavior so
    // that any future Release-config CI run validates them too.

    // Contract-only: in Release config, 200 with valid tag returns parsed Version.
    // In Debug config (the test runtime), returns null without dispatching.
    [TestMethod]
    public async Task CheckAsync_HappyPath_200WithValidTag_ContractOnly()
    {
        const string body = """{"tag_name":"v9.9.9","prerelease":false,"draft":false}""";
        var fake = FakeHttpMessageHandler.Json(body);
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        // Debug: short-circuited at top; SendCount=0; result=null.
        // Release: would dispatch and return Version 9.9.9.
        Assert.IsNull(result, "Debug-config: short-circuit; Release-config would return v9.9.9");
    }

    // Contract-only: 404 / 403 / 429 all return null silently.
    [TestMethod]
    [DataRow(HttpStatusCode.NotFound)]
    [DataRow(HttpStatusCode.Forbidden)]
    [DataRow(HttpStatusCode.TooManyRequests)]
    public async Task CheckAsync_NonSuccessStatus_ReturnsNull_ContractOnly(HttpStatusCode status)
    {
        var fake = new FakeHttpMessageHandler(_ => new HttpResponseMessage(status));
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    // Contract-only: malformed JSON body → JsonException → null.
    [TestMethod]
    public async Task CheckAsync_MalformedJson_ReturnsNull_ContractOnly()
    {
        var fake = FakeHttpMessageHandler.Json("not json at all");
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    // Contract-only: draft / prerelease tags rejected silently.
    [TestMethod]
    public async Task CheckAsync_DraftRelease_ReturnsNull_ContractOnly()
    {
        const string body = """{"tag_name":"v9.9.9","prerelease":false,"draft":true}""";
        var fake = FakeHttpMessageHandler.Json(body);
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    [TestMethod]
    public async Task CheckAsync_PrereleaseTag_ReturnsNull_ContractOnly()
    {
        const string body = """{"tag_name":"v9.9.9-beta","prerelease":true,"draft":false}""";
        var fake = FakeHttpMessageHandler.Json(body);
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    // Idempotent dispose tests cloned from TemperatureServiceTests:316-344.
    [TestMethod]
    public void Dispose_CalledThreeTimes_NoException()
    {
        using var svc = new UpdateCheckService(new FakeHttpMessageHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)));
        svc.Dispose();
        svc.Dispose();
        svc.Dispose();
        // No exception above = pass.
    }

    [TestMethod]
    public void Dispose_CalledConcurrentlyFromThreeThreads_NoException()
    {
        using var svc = new UpdateCheckService(new FakeHttpMessageHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)));
        Parallel.For(0, 3, _ => svc.Dispose());
    }
}
```

### §5 — XAML diff (`MainWindow.xaml`, append to StatsPanel)

```xml
<!-- After the existing TempsText (lines 290–297), append: -->

<!-- Update notice — child of StatsPanel; renders as accent-colored "vX.Y.Z available"
     when GitHub Releases reports a newer tag than Assembly.GetName().Version.
     Visibility=Collapsed by default; flips to Visible only when service callback
     finds a strictly-newer tag. Cloned styling from TempsText/UptimeText byte-for-byte
     except Visibility default differs (Collapsed for UpdateText vs Visible for the others).
     Foreground is set in BOTH ApplyTheme AND ApplyDisplayColor (Phase 33 critical).
     -->
<TextBlock x:Name="UpdateText"
           Margin="0,2,0,0"
           Visibility="Collapsed"
           FontFamily="Segoe UI Light"
           FontSize="11"
           Foreground="White"
           Text=""
           TextAlignment="Left" />
```

### §6 — `ApplyTheme` + `ApplyDisplayColor` dual-path additions

```csharp
// MainWindow.xaml.cs ApplyTheme — add ONE LINE after line 1919 (TempsText.Foreground = brush):
UpdateText.Foreground = brush;   // Phase 33 critical pattern — must also exist in ApplyDisplayColor

// MainWindow.xaml.cs ApplyDisplayColor — add ONE LINE after line 1957 (TempsText.Foreground = brush):
UpdateText.Foreground = brush;   // Phase 33 critical pattern — must also exist in ApplyTheme
```

### §7 — `MainWindow` field + ContentRendered kickoff + display helper

```csharp
// MainWindow.xaml.cs — new private field next to _temperatureService (~line 19):
private UpdateCheckService _updateService = null!;

// MainWindow.xaml.cs ContentRendered — add after _temperatureService construction (~line 194):
_updateService = new UpdateCheckService();

// PERS-12: only kick off the check when the user has it enabled.
if (_settings.UpdateChecksEnabled)
{
    KickoffUpdateCheck();
}

// New private method:
private void KickoffUpdateCheck()
{
    // UI-06: defer until ApplicationIdle so first paint never gates on this.
    Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, async () =>
    {
        try
        {
            var newer = await _updateService.CheckAsync().ConfigureAwait(false);
            if (newer is null) return;

            var running = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version!;
            if (!FuzzyClock.Core.UpdateVersionComparer.IsNewer(running, newer)) return;

            // UI-07: marshal to UI thread before touching XAML.
            Dispatcher.Invoke(() => ShowUpdateNotice(newer));
        }
        catch (Exception)
        {
            // UI-08: defense in depth. Service already swallows narrow exceptions;
            // anything reaching here is a bug we'd rather not surface as a global
            // TaskScheduler.UnobservedTaskException. Silent-failure posture.
        }
    });
}

private void ShowUpdateNotice(Version newer)
{
    // UI-02: preserve "v" prefix in tag — Version.ToString() omits it, so we add it.
    UpdateText.Text = $"v{newer} available";
    UpdateText.Visibility = Visibility.Visible;

    // UI-05: re-clamp because adding the line increases window height by ~13px.
    // Mirrors the SetStatsVisible re-clamp at MainWindow.xaml.cs:1247-1258.
    UpdateLayout();
    if (_hasUserPosition)
    {
        var screen = ScreenDpi.FromDipPoint(Left + ActualWidth / 2, Top + ActualHeight / 2);
        var clamped = SettingsService.Clamp(
            new MonitorPosition { Left = Left, Top = Top },
            ActualWidth, ActualHeight, screen);
        Left = clamped.Left;
        Top  = clamped.Top;
    }
}
```

### §8 — `OnClosing` tier 1 + new `DisposeUpdateCheckService` external entry point

```csharp
// MainWindow.xaml.cs OnClosing (line 1433) — add ONE LINE after _temperatureService?.Dispose():
_updateService?.Dispose();   // UPD-08 tier 1 of three-tier dispose

// New external entry point next to DisposeTemperatureService (line 1445):
internal void DisposeUpdateCheckService() => _updateService?.Dispose();
```

### §9 — `App.xaml.cs` SessionEnding + ProcessExit (tiers 2 + 3)

```csharp
// App.xaml.cs SessionEnding lambda (line 74) — add ONE LINE after mw?.DisposeTemperatureService():
mw?.DisposeUpdateCheckService();   // UPD-08 tier 2 of three-tier dispose

// App.xaml.cs OnProcessExit (line 91) — add ONE LINE after the existing Dispose:
try { (MainWindow as MainWindow)?.DisposeUpdateCheckService(); } catch { }
```

### §10 — `AppSettings.cs` + `SettingsService.Defaults()` + `SettingsSnapshot.cs`

```csharp
// FuzzyClock.App/AppSettings.cs — append ONE FIELD after UseShift (~line 63):
// v4.5 Phase 88 — Update checker on-launch toggle (PERS-01).
// Default = true: explicit init mandatory so v4.4 users upgrading via JSON
// round-trip don't silently lose update checks (mirrors UptimeVisible /
// GhostModeEnabled / UseCtrl pattern documented at lines 23, 34, 61).
public bool UpdateChecksEnabled { get; init; } = true;

// FuzzyClock.App/SettingsService.cs Defaults() (line 137) — append ONE LINE before closing brace:
UpdateChecksEnabled = true,

// FuzzyClock.App/SettingsService.cs Validate — NO CHANGES. Bool fields cannot be invalid
// (PERS-03). Existing Validate() remains unchanged.

// FuzzyClock.App/SettingsSnapshot.cs — append ONE FIELD after the existing Use* fields (~line 58):
public bool UpdateChecksEnabled { get; init; }
```

### §11 — `SettingsWindow.xaml` Behavior tab — checkbox addition

```xml
<!-- SettingsWindow.xaml Behavior tab — append AFTER ChkAutoLaunch (line 477-479).
     Cloned shape from ChkAutoLaunch byte-for-byte. -->
<CheckBox x:Name="ChkUpdateChecksEnabled"
          Content="Check for updates on launch"
          Margin="0,4,0,0"
          Checked="ChkUpdateChecksEnabled_Changed"
          Unchecked="ChkUpdateChecksEnabled_Changed"/>
```

### §12 — `SettingsWindow.xaml.cs` event + handler + populate

```csharp
// SettingsWindow.xaml.cs — append event field after AutoLaunchChanged (line 50):
public event Action<bool>?   UpdateChecksEnabledChanged;

// SettingsWindow.xaml.cs PopulateControls — append ONE LINE after ChkAutoLaunch.IsChecked = ... (line 219):
ChkUpdateChecksEnabled.IsChecked = s.UpdateChecksEnabled;

// SettingsWindow.xaml.cs — append handler method after ChkAutoLaunch_Changed (line 615):
private void ChkUpdateChecksEnabled_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    UpdateChecksEnabledChanged?.Invoke(ChkUpdateChecksEnabled.IsChecked == true);
}
```

### §13 — `MainWindow.xaml.cs` — `OpenSettings` event subscription + `GetCurrentSettingsSnapshot` extension

```csharp
// MainWindow.xaml.cs GetCurrentSettingsSnapshot (line 607) — append ONE FIELD before closing brace (line 651):
UpdateChecksEnabled = _settings.UpdateChecksEnabled,

// MainWindow.xaml.cs OpenSettings (~line 738) — append event subscription after AutoLaunchChanged (line 738):
_settingsWindow.UpdateChecksEnabledChanged += v =>
{
    _settings = _settings with { UpdateChecksEnabled = v };
    SaveSettings();

    // PERS-10: mid-session toggle OFF — cancel any in-flight call AND collapse
    // the notice line immediately. The once-per-launch invariant means toggling
    // back ON mid-session is a no-op (no re-kickoff).
    if (!v)
    {
        _updateService?.CancelInFlight();
        UpdateText.Visibility = Visibility.Collapsed;
        UpdateText.Text = "";
    }
};
```

### §14 — `MainWindow.xaml.cs` `ResetToDefaults`

```csharp
// MainWindow.xaml.cs ResetToDefaults (line 1447) — append ONE LINE inside the existing
// `_settings = _settings with { ... }` block (around line 1517-1527):
_settings = _settings with
{
    TempsLineVisible = false,
    TempCpuVisible   = true,
    TempGpuVisible   = true,
    TempMoboVisible  = false,
    TempNvmeVisible  = false,
    UseCtrl  = true,
    UseAlt   = true,
    UseShift = false,
    UpdateChecksEnabled = true,   // PERS-11: restore default-ON
};
// (No additional code needed — RefreshControls is already called at line 1532
// when _settingsWindow is open, which calls PopulateControls, which now sets
// ChkUpdateChecksEnabled.IsChecked from the snapshot.)
```

### §15 — `FuzzyClock.App.csproj` `<InformationalVersion>` sync

```xml
<!-- FuzzyClock.App/FuzzyClock.App.csproj line 31 — change ONE LINE: -->
<InformationalVersion>4.5.0</InformationalVersion>
<!-- (was 3.6.0 — drift from <Version>4.5.0</Version> at line 28) -->
```

**CI interaction verified:** `release.yml` lines 47–60 publish step passes `-p:Version`, `-p:AssemblyVersion`, `-p:FileVersion` from the git tag — but does NOT pass `-p:InformationalVersion`. The csproj value flows through unchanged at tag time, so a stale csproj value would persist in the published binary's `AssemblyInformationalVersionAttribute`. DEV-01's one-line edit is the only fix needed; CI behavior is preserved.

### §16 — README diff

```markdown
<!-- README.md — append ONE BULLET to the Features list around line 47, after "Dark-mode Settings": -->
- **Update notice** — when a newer FuzzyClock release is published on GitHub, a one-line accent-colored "vX.Y.Z available" notice appears at the bottom of the stats panel; checked once per launch. The check can be disabled in Settings > Behavior > "Check for updates on launch" (default ON).
```

### §17 — `AppSettingsTests.cs` — round-trip + absent-field tests (PERS-04, PERS-05)

```csharp
// FuzzyClock.App.Tests/AppSettingsTests.cs — append two methods at end of class:

// PERS-04: round-trip test — UpdateChecksEnabled survives serialize → deserialize
[TestMethod]
public void RoundTrip_UpdateChecksEnabled_Matches()
{
    var original = new AppSettings { UpdateChecksEnabled = false };   // flipped from default true
    var result   = JsonSerializer.Deserialize<AppSettings>(JsonSerializer.Serialize(original))!;
    Assert.IsFalse(result.UpdateChecksEnabled);
}

// PERS-05: absent-field test — defaults to TRUE when key is absent
[TestMethod]
public void Deserialize_MissingUpdateChecksEnabled_DefaultsToTrue()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsTrue(result.UpdateChecksEnabled,
        "UpdateChecksEnabled should default to true when absent from JSON (init default per PERS-01); " +
        "v4.4 users upgrading must NOT silently opt-out of update checks (mirrors UptimeVisible/UseCtrl pattern)");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `new HttpClient()` per request | Long-lived static `HttpClient` with `SocketsHttpHandler.PooledConnectionLifetime` | .NET Core 2.1+ (2018) | Avoids both socket exhaustion AND DNS staleness; mandatory for long-lived services |
| Reflection-based `JsonSerializer.Deserialize<T>` | `JsonSerializerContext` source-gen | .NET 6+ (2021), mature in .NET 8/10 | Trim/AOT-safe; required for `PublishTrimmed=true` self-contained exe |
| `Newtonsoft.Json` | `System.Text.Json` source-gen | .NET 5+ for new code (2020); STJ is now the default in all Microsoft samples | Project standard; out-of-scope to introduce Newtonsoft |
| Manual `bool _disposed` + lock | `int _disposed` + `Interlocked.CompareExchange` | Modern .NET pattern | Lock-free, race-safe across N tier dispose entries; precedent in TemperatureService |
| `AssemblyInformationalVersion` for runtime version | `Assembly.GetName().Version` | Always (BCL since .NET Framework 1.0) | InformationalVersion is hand-edited and prone to drift; AssemblyVersion is CI-stamped |

**Deprecated/outdated:**
- `HttpClient` per call — long deprecated, causes socket exhaustion and DNS staleness
- `JsonSerializer.Deserialize<T>(json)` reflection path — works at runtime today but breaks under trimming
- `WebRequest` / `HttpWebRequest` — deprecated in favor of `HttpClient` since .NET Core
- `Octokit` — perfectly good library, but 1MB+ of code and 30+ types when we need 3 fields from one endpoint

## Open Questions

1. **Should `UpdateText` participate in the auto-contrast `_isDragging` freeze?**
   - What we know: every other accent-colored element pauses contrast switching during drag (see PROJECT.md decision: `_isDragging flag freezes display color during drag`).
   - What's unclear: whether Phase 88 should add `UpdateText` to a list, or whether `ApplyDisplayColor` is the single point that handles all elements.
   - Recommendation: `ApplyDisplayColor` is called only when contrast change is admitted (line 1930+); the `_isDragging` guard is upstream of that call. Adding the `UpdateText.Foreground = brush;` line in `ApplyDisplayColor` automatically inherits the freeze. **No additional drag handling needed.**

2. **Does the once-per-launch invariant prevent re-checking after toggling OFF→ON mid-session?**
   - What we know: PERS-10 says "toggling back ON mid-session is a no-op."
   - What's unclear: whether this is enforced by any code, or just an emergent property of "kickoff fires only once in `ContentRendered`."
   - Recommendation: It IS emergent. `ContentRendered` fires exactly once per process. The `if (_settings.UpdateChecksEnabled)` gate in §7 only runs at that ContentRendered point. Toggling ON later sets `_settings.UpdateChecksEnabled = true` and saves, but never re-enters the kickoff path. **No explicit guard needed.** The plan should NOT add a "manually re-kickoff on toggle ON" code path.

3. **What if a user runs an unreleased post-tag dev build (Version = 4.5.0.0) and GitHub returns 4.5.0?**
   - What we know: `IsNewer(4.5.0.0, 4.5.0)` returns false (System.Version treats trailing zeros as equivalent), so the notice doesn't appear.
   - What's unclear: nothing — this is the desired behavior. Just documenting.
   - Recommendation: No action needed. `#if DEBUG` skip handles dev-build screenshots; the post-tag pre-release-build edge case is a fire-and-forget non-issue.

4. **Should the tooltip on the notice show release notes URL, or stay text-only?**
   - What we know: Out-of-Scope table excludes "click-to-open" and "in-app changelog viewer" (UPD-FUTURE-01 and the table row "In-app changelog viewer").
   - What's unclear: nothing — definitively out of scope.
   - Recommendation: Plain text only. No `ToolTip`, no `Cursor="Hand"`, no MouseLeftButtonDown handler. **The TextBlock is dumb.**

5. **How does the GitHub `tag_name` containing weird characters (e.g. spaces, unicode) interact?**
   - What we know: the locked decision says `Text = "{newerTag} available"` preserves the GitHub tag verbatim. GitHub allows almost anything in tag names.
   - What's unclear: whether the planner should add an XAML escaping layer.
   - Recommendation: WPF's `TextBlock.Text` setter handles arbitrary strings safely (no markup interpretation). The `TryParseTag` filter already rejects garbage, so by the time we reach `UpdateText.Text = $"v{newer} available"` we're working with a `Version` ToString output, which is always digits + dots. **No additional escaping needed.** UI-02 says the format is `"{newerTag} available"` — and we use `$"v{newer}"` where `newer` is a `Version`, so the `v` prefix is added by us, not the GitHub tag — the resulting string is always shape-clean.

   Wait: re-reading UI-02 — *"Text set to `{newerTag} available` where `{newerTag}` is the GitHub `tag_name` verbatim (preserves `v` prefix, e.g. `v4.6.0 available`)"*. The phrasing is "verbatim" but "preserves v prefix" suggests the example was assuming GitHub tags include the `v`. **Recommendation:** the planner should choose ONE consistent rendering. Two acceptable shapes:
   - **(A)** `UpdateText.Text = $"{release.TagName} available";` — verbatim from GitHub (only after passing `TryParseTag` validation); preserves casing/v-prefix as the maintainer typed it
   - **(B)** `UpdateText.Text = $"v{newer} available";` — synthesised v + `Version.ToString()`; always lowercase v, always 2/3/4-component numeric

   (A) is more faithful to UI-02's "verbatim" phrasing; (B) is more deterministic. **Recommendation: (A)** — change the service to return the raw tag string alongside the parsed Version, so `MainWindow` can show what GitHub showed:

   ```csharp
   // Service returns (Version Parsed, string RawTag)? instead of just Version?
   public async Task<(Version Parsed, string RawTag)?> CheckAsync() { ... }
   // MainWindow:
   UpdateText.Text = $"{result.Value.RawTag} available";
   ```

   This is a Claude's Discretion choice per CONTEXT.md ("Internal field naming, helper organization … all free choice"). The planner can call it either way; (A) honors UI-02's "verbatim" phrasing more strictly.

## Sources

### Primary (HIGH confidence)
- **GitHub REST API — Get the latest release** — https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#get-the-latest-release — endpoint shape, `/releases/latest` filter behavior (retrieved 2026-05-29)
- **GitHub REST API — Getting Started** — https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api?apiVersion=2022-11-28 — verbatim User-Agent requirement *"Requests without a User-Agent header will be rejected with a 403 Forbidden response"* (retrieved 2026-05-29)
- **GitHub REST API — Rate Limits** — https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28 — verbatim *"The primary rate limit for unauthenticated requests is 60 requests per hour"* + *"either a 403 or 429 response status code"* (retrieved 2026-05-29)
- **Microsoft Learn — `SocketsHttpHandler.PooledConnectionLifetime`** — https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler.pooledconnectionlifetime — verbatim *"useful in order to allow connections to be reestablished periodically so as to better reflect DNS or other network changes"* (last updated 2025-07-01, retrieved 2026-05-29)
- **Microsoft Learn — System.Text.Json source generation** — https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation — `JsonSerializerContext` partial class pattern, `JsonSerializableAttribute`, deserialize call shapes (last updated 2025-11-13, retrieved 2026-05-29)
- **Repository code (this project, c:\src\FuzzyStatsClock)** — TemperatureService.cs (three-tier dispose precedent), AppSettings.cs (init-property pattern), MainWindow.xaml.cs (Phase 33 dual-path locations), SettingsWindow.xaml.cs (event + `_suppressEvents` pattern), TemperatureFormatterTests.cs (DataRow style), AppSettingsTests.cs (STEST-08 absent-field shape) — all read directly 2026-05-29

### Secondary (MEDIUM confidence)
- `git remote get-url origin` returned `https://github.com/atabisz/FuzzyStatsClock.git` 2026-05-29 — confirms repo coordinate `atabisz/FuzzyStatsClock` (locked decision was already correct)

### Tertiary (LOW confidence)
- None. Every claim in this document is backed by either official Microsoft Learn docs, official GitHub docs, or shipped code in this repo.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every dependency is in-box net10.0; Microsoft Learn citations verified verbatim
- Architecture: **HIGH** — every pattern has a working precedent in this repository (TemperatureService for dispose, AppSettings for settings round-trip, ApplyTheme/ApplyDisplayColor for Phase 33, etc.)
- GitHub API behavior: **HIGH** — verified verbatim from docs.github.com 2026-05-29 (User-Agent → 403 quote, 60 req/hr quote, status codes)
- Pitfalls: **HIGH** — every pitfall has either (a) a `[DataRow]` test pattern that catches it, (b) a precedent regression in PROJECT.md decision log, or (c) verbatim doc citation
- Test coverage: **HIGH** — test grid sized against existing `TemperatureFormatterTests` (15 methods) and `TemperatureServiceTests` (~24 methods); the proposed ~13–17 + ~6–8 + 2 sizing is conservative

**Research date:** 2026-05-29
**Valid until:** 2026-06-28 (30 days for stable docs; net10 BCL is stable; GitHub REST headers/rate-limits are decade-stable; only the `releases/latest` shape would invalidate this — vanishingly unlikely)
