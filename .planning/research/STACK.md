# Technology Stack — v4.5 Update Checker

**Project:** FuzzyClock v4.5 — once-per-launch GitHub Releases update checker
**Researched:** 2026-05-29
**Confidence:** HIGH (Microsoft Learn for HttpClient lifecycle, System.Text.Json source-gen, System.Version; GitHub REST API docs for headers and rate limits)

## TL;DR for the Roadmapper

- **No new NuGet packages.** Everything required ships in-box with .NET 10 BCL: `HttpClient` (`System.Net.Http`), `System.Text.Json` (already used by `SettingsService`), `System.Version`, `System.Threading.Tasks`, `System.Reflection.Assembly`.
- **HttpClient lifetime:** single private static `HttpClient` field on `UpdateCheckService` with `SocketsHttpHandler.PooledConnectionLifetime = TimeSpan.FromMinutes(15)`, owned for app lifetime, never disposed (process-end reclaims). Set `Timeout = TimeSpan.FromSeconds(5)`.
- **JSON parse:** `System.Text.Json` with a tiny POCO (3 fields). Add a `JsonSerializerContext` source-generator partial class so the path stays trim/AOT-safe even though `PublishTrimmed` is currently off — costs nothing at runtime, future-proofs the path.
- **Version comparison:** `System.Version.TryParse` after stripping a leading `v`. Tags follow `vX.Y` or `vX.Y.Z` only — semver pre-release/build-metadata is not in scope (already excluded by milestone). `Version` implements `IComparable<Version>`, so `running >= latest` works out of the box.
- **User-Agent header:** `FuzzyClock/<assembly-version>` — required by GitHub or it returns `403 Forbidden`.
- **Service location:** `FuzzyClock.App/UpdateCheckService.cs` (HTTP-using runtime); pure version-comparison helper extracted to `FuzzyClock.Core/UpdateVersionComparer.cs` for testability via `FuzzyClock.Core.Tests`.

## Recommended Stack

### Core Technologies (all in-box, no NuGet additions)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `System.Net.Http.HttpClient` | .NET 10 BCL | One-shot HTTPS GET to `api.github.com/repos/{owner}/{repo}/releases/latest` | Microsoft's documented "use either *long-lived* clients with `PooledConnectionLifetime` ... or *short-lived* clients created by `IHttpClientFactory`" — for a desktop app with one call per process, the long-lived static is the simpler fit. `IHttpClientFactory` is recommended only when you need DI, multiple named clients, Polly resilience policies, or a server-side workload — none of which apply here. |
| `System.Net.Http.SocketsHttpHandler` | .NET 10 BCL | Backs the static HttpClient; sets `PooledConnectionLifetime` to bound DNS staleness | Per Microsoft Learn: "[HttpClient] only resolves DNS entries when a connection is created. It doesn't track any time to live (TTL) durations specified by the DNS server. ... limit the lifetime of the connection by setting the `PooledConnectionLifetime` property". 15 min is the documented illustrative value; for a once-per-launch tool the connection probably never gets reused, but the setting is cheap and self-documents intent. |
| `System.Text.Json` | .NET 10 BCL | Deserialize the GitHub releases response | Already the project's chosen JSON library (`SettingsService`). Three-field POCO is trivial. Forward-compat: unknown JSON fields are ignored by default — GitHub can extend its response without breaking us. |
| `System.Text.Json.Serialization.JsonSerializerContext` (source generator) | .NET 10 BCL | Compile-time metadata for the response POCO | "If you don't specify this property and `PublishTrimmed` is enabled, reflection-based serialization is automatically disabled." Adding the source-gen context now means turning on `PublishTrimmed` later is a no-op for this path. Zero runtime cost. |
| `System.Version` | .NET 10 BCL | Parse and compare 2- or 3-component version numbers | Implements `IComparable<Version>` and `>=` operator out of the box. Fully covers the project's tag format (`v4.0`, `v4.5.0`). Pre-release / build-metadata are explicitly out of scope per the v4.5 Out-of-Scope list. |
| `System.Reflection.Assembly` | .NET 10 BCL | Read the running assembly version (`typeof(App).Assembly.GetName().Version`) | The `<Version>4.5.0</Version>` element in `FuzzyClock.App.csproj` populates `AssemblyVersion`/`FileVersion`; `Assembly.GetName().Version` returns a `System.Version` directly — no string parse needed for the running side. |
| `System.Threading.Tasks.Task` / `async`/`await` / `CancellationTokenSource` | .NET 10 BCL | Fire-and-forget async kick-off from `MainWindow.ContentRendered`; 5 s timeout via `CancellationTokenSource(TimeSpan.FromSeconds(5))` | `HttpClient.Timeout` plus a `CancellationToken` covers both connect-stall and read-stall cases; `try { ... } catch { /* silent */ }` matches the existing `TemperatureService` silent-failure posture. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **(none)** | — | — | No third-party libraries are required or recommended for this feature. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| MSTest 4.0.1 (already in use) | Unit-test the pure version-comparison helper in `FuzzyClock.Core.Tests` | `FuzzyClock.Core.Tests` is `net10.0` (no WPF/WinForms). Keep `UpdateVersionComparer` in `FuzzyClock.Core` so it is testable there; keep all networking and `HttpClient` ownership in `FuzzyClock.App`. |
| `[DataRow]` parametric tests | Cover the version-tag matrix (running > latest, running == latest, running < latest, malformed tag, leading-v stripped, 2-component vs 3-component) | Same pattern used throughout the existing test suite (e.g. `RightClickMenuGate.ShouldOpen` in v4.2 phase 77). |

## Installation

No package additions. The csproj diff is zero NuGet lines for v4.5.

```xml
<!-- FuzzyClock.App.csproj — NO CHANGES REQUIRED for the network/JSON dependencies -->
<!-- Existing PackageReferences (System.Diagnostics.PerformanceCounter, LibreHardwareMonitorLib) stay as-is. -->
<!-- The UpdateCheckService is implemented entirely against the BCL. -->
```

If a future milestone enables trimming, the only relevant addition is an MSBuild property (still no NuGet):

```xml
<PropertyGroup>
  <!-- Future-proofing only; NOT required for v4.5: -->
  <JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>
</PropertyGroup>
```

This is documented as the recommended belt-and-braces flag once `PublishTrimmed=true` is set; with the source-gen context already in place the deserialize call continues to work.

## Recommended Code Shape

### HttpClient lifetime — single static field on the service

```csharp
// FuzzyClock.App/UpdateCheckService.cs
internal sealed class UpdateCheckService
{
    // One static instance, owned for the entire app lifetime.
    // PooledConnectionLifetime bounds DNS staleness even though we typically make one call.
    private static readonly HttpClient s_http = CreateClient();

    private static HttpClient CreateClient()
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(15),
            AutomaticDecompression = System.Net.DecompressionMethods.All
        };
        var client = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(5),
            BaseAddress = new Uri("https://api.github.com/")
        };
        // GitHub REQUIRES a User-Agent. Format: <product>/<version>.
        var version = typeof(UpdateCheckService).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
        client.DefaultRequestHeaders.UserAgent.Add(
            new System.Net.Http.Headers.ProductInfoHeaderValue("FuzzyClock", version));
        client.DefaultRequestHeaders.Accept.Add(
            new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        // X-GitHub-Api-Version is not required (a default applies); recommended for stability.
        client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
        return client;
    }

    // Silent-failure once-per-launch entry point. Returns null on any failure.
    public async Task<Version?> TryGetLatestReleaseVersionAsync(
        string owner, string repo, CancellationToken ct = default)
    {
        try
        {
            using var response = await s_http.GetAsync(
                $"repos/{owner}/{repo}/releases/latest",
                HttpCompletionOption.ResponseHeadersRead,
                ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) return null;       // 403/404/429 -> silent
            await using var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            var release = await JsonSerializer.DeserializeAsync(
                stream, GitHubJsonContext.Default.GitHubRelease, ct).ConfigureAwait(false);
            if (release is null || release.Draft || release.Prerelease) return null;
            return UpdateVersionComparer.TryParseTag(release.TagName, out var v) ? v : null;
        }
        catch { return null; }     // offline, timeout, malformed JSON, anything -> silent
    }
}
```

### JSON POCO — minimal three-field shape

```csharp
// FuzzyClock.App/UpdateCheckService.cs (or a sibling file in the same project)
internal sealed class GitHubRelease
{
    [JsonPropertyName("tag_name")]   public string TagName    { get; init; } = "";
    [JsonPropertyName("prerelease")] public bool   Prerelease { get; init; }
    [JsonPropertyName("draft")]      public bool   Draft      { get; init; }
}

[JsonSerializable(typeof(GitHubRelease))]
internal partial class GitHubJsonContext : JsonSerializerContext { }
```

`[JsonPropertyName]` is fully supported under source-generation metadata mode and works on `init`-only properties.

### Pure version comparer — lives in Core for testability

```csharp
// FuzzyClock.Core/UpdateVersionComparer.cs
public static class UpdateVersionComparer
{
    /// <summary>
    /// Strips a leading 'v' or 'V' and parses with System.Version.
    /// Accepts "v4.2", "v4.5.0", "4.5.0", etc. Rejects everything else (silent caller).
    /// </summary>
    public static bool TryParseTag(string? tag, out Version version)
    {
        version = new Version(0, 0);
        if (string.IsNullOrWhiteSpace(tag)) return false;
        var trimmed = tag.AsSpan().TrimStart();
        if (trimmed.Length > 0 && (trimmed[0] == 'v' || trimmed[0] == 'V')) trimmed = trimmed[1..];
        return Version.TryParse(trimmed, out version!);
    }

    /// <summary>True iff <paramref name="latest"/> is strictly greater than <paramref name="running"/>.</summary>
    public static bool IsNewer(Version running, Version latest) => latest > running;
}
```

`System.Version` implements both `IComparable<Version>` and the `>=`/`>`/`<` operators in .NET 5+, so no manual component-by-component comparison is needed.

## User-Agent Format

GitHub's documented requirement: "All API requests must include a valid `User-Agent` header. Requests with no `User-Agent` header will be rejected. ... If you provide an invalid `User-Agent` header, you will receive a `403 Forbidden` response." The recommended convention is the GitHub username or application name.

Use the standard `Product/Version` form via `ProductInfoHeaderValue`:

```
User-Agent: FuzzyClock/4.5.0
```

`ProductInfoHeaderValue("FuzzyClock", "4.5.0")` produces the exact RFC 7231 token form. Prefer reading the version from `Assembly.GetName().Version` over hard-coding so it tracks `<Version>` in the csproj automatically.

## Rate Limiting — what to expect

GitHub's documented limits for unauthenticated public-API requests:

- **60 requests per hour per IP.**
- On exceedance: `403` or `429` HTTP status (per current docs).
- Diagnostic headers: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-used`, `x-ratelimit-reset` (UTC epoch seconds).

For once-per-launch this is essentially irrelevant — a user would have to relaunch FuzzyClock 60+ times in an hour to trip the limit. The silent-failure posture in the spec already covers it: the `IsSuccessStatusCode` check in the service treats `403`, `404`, and `429` identically (no notice rendered, app continues normally). No retry, no backoff, no rate-limit-specific UX is needed for v4.5.

## Trim / AOT Compatibility

Currently FuzzyClock does NOT set `PublishTrimmed=true`. The recommended code shape above is already trim/AOT-safe so a future milestone can enable trimming with no rework:

| Concern | Mitigation in recommended shape |
|---------|----------------------------------|
| `JsonSerializer.Deserialize<T>` reflection trim warnings | Source-gen `JsonSerializerContext` (`GitHubJsonContext`) — emits compile-time metadata; deserializer never reflects. |
| Reflection-based fallback silently kicking in under trimming | Optionally set `<JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>` to make any reflection-based path throw at runtime instead of crashing later. (Not required for v4.5; documented for the future trim milestone.) |
| `HttpClient` itself | Trim-friendly out of the box; the `SocketsHttpHandler` path is the documented trim-safe handler. |
| `System.Version.TryParse` | Trim-friendly; pure BCL, no reflection. |
| `Assembly.GetName().Version` | Trim-friendly; metadata for the running assembly is always preserved. |

## Service Location — App vs Core

**Recommendation: split.** The existing project boundary is `Core = pure .NET, no WPF, no WinForms, fully testable on net10.0`; `App = WPF WinExe with WinForms`. Update-check has both a "pure logic" half (parse/compare versions) and an "I/O" half (HTTP, async, lifecycle).

| Piece | Project | File | Rationale |
|-------|---------|------|-----------|
| `UpdateVersionComparer` (static, pure) | `FuzzyClock.Core` | `FuzzyClock.Core/UpdateVersionComparer.cs` | Same precedent as `UptimeFormatter`, `DateFormatter`, `PhraseWrapService`, `ContrastService`, `ComputeProximityRatio`, `RightClickMenuGate`, `LerpRatio` — every "pure logic" extraction in this codebase has gone to Core for `MSTest 4.0.1` coverage in `FuzzyClock.Core.Tests`. |
| `GitHubRelease` POCO + `GitHubJsonContext` | `FuzzyClock.App` | `FuzzyClock.App/UpdateCheckService.cs` (same file) | The shape is a network-protocol detail; keeping it next to the HTTP call avoids exposing GitHub-shaped types from Core. |
| `UpdateCheckService` (HTTP, async) | `FuzzyClock.App` | `FuzzyClock.App/UpdateCheckService.cs` | Same precedent as `TemperatureService`, `StatsService`, `ContrastSamplerService` — every long-lived runtime service that owns OS resources or background work lives in App. Core stays free of `HttpClient`, `Timer`, `Dispatcher`, etc. |

**One-line rationale:** Pure version-comparison logic -> `Core` (testable, no HTTP); HTTP-owning service -> `App` (mirrors `TemperatureService` lifecycle and disposal patterns).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Single static `HttpClient` with `PooledConnectionLifetime` | `IHttpClientFactory` + `Microsoft.Extensions.DependencyInjection` | Only if FuzzyClock adopts a generic-host / DI container later, or starts making many parallel HTTP calls to multiple endpoints with different policies. For a single once-per-launch GET, the factory's "configurability ... and HttpMessageHandler pool" features are pure overhead — Microsoft Learn explicitly endorses the static pattern as solving "both the port exhaustion and DNS changes problems without adding the overhead of `IHttpClientFactory`". |
| Single static `HttpClient` | `using var client = new HttpClient()` per call | Acceptable in a true one-shot CLI, but Microsoft's guidance is unambiguous: "we recommend reusing `HttpClient` instances for as many HTTP requests as possible". The service may be called more than once per process lifetime (manual "Check now" button could be a future addition); the static pattern is the safer default at zero cost. |
| `System.Text.Json` source-gen | Reflection-based `JsonSerializer.Deserialize<T>(string)` | Only if `PublishTrimmed` is guaranteed never to be enabled and the team prefers a 1-line deserialize call. Source-gen costs a 6-line partial class and is mandatory for trim safety; no reason to skip it. |
| `System.Version.Parse` (with leading-v strip) | `NuGet.Versioning.SemanticVersion` (NuGet.Versioning 7.6.0, Apache-2.0) | Only if tags ever introduce pre-release suffixes (`v5.0.0-beta1`), build metadata (`v5.0.0+abc1234`), or 4-component versions where the 4th matters semantically. The v4.5 milestone explicitly excludes pre-release/draft. NuGet.Versioning would add one transitive dependency for capability we have no requirement for. |
| `Assembly.GetName().Version` for running version | `Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion` | If the running version ever needs to be a SemVer string with suffix (e.g. `4.5.0-rc1`). Today `<Version>4.5.0</Version>` populates `AssemblyVersion = 4.5.0.0`, which `System.Version` parses cleanly. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Squirrel / Squirrel.Windows** | Auto-updater framework; takes over installer lifecycle and update download/apply. The v4.5 spec is *notify-only*; the existing per-user Inno Setup installer must be preserved as-is per `Out of Scope`: "Auto-update / one-click upgrade — v4.5 only notifies; user installs the new version manually". | The recommended static-`HttpClient` + `System.Text.Json` shape above. |
| **Velopack** | Same problem as Squirrel — modern auto-update framework. Out of scope. | Same. |
| **AutoUpdater.NET** (NuGet) | Notify-and-prompt-with-installer-fetch framework; opens a built-in update dialog and downloads the installer. Adds a NuGet dependency, a UI surface, and auto-launch-installer behavior the spec explicitly rejects. | Same. |
| **ClickOnce** | Whole separate deployment model; would replace Inno Setup entirely. | Keep Inno Setup; do nothing to the deployment path for v4.5. |
| **`Octokit` NuGet** | Full GitHub API client (~1.4MB). Massive surface for a single anonymous `GET /releases/latest` call. Drags in many transitive dependencies and adds maintenance/upgrade cost for an in-box-doable task. | Raw `HttpClient` + 3-field POCO. |
| **`Newtonsoft.Json`** | Project standardized on `System.Text.Json` in v1.0 (see `Key Decisions`: "System.Text.Json (in-box .NET 10) ... Validated"). Adding Newtonsoft would split JSON tooling for no reason. | `System.Text.Json` (already used). |
| **`new HttpClient()` per call (allocate-and-dispose)** | Documented anti-pattern: "TCP ports aren't released immediately after connection closure ... If the rate of requests is high, the operating system limit of available ports might be exhausted." Even at low rates it adds connection-establishment overhead and breaks DNS-lifetime control. | Single static `HttpClient` with `PooledConnectionLifetime`. |
| **Polling timer (`DispatcherTimer`, `System.Threading.Timer`) for scheduled re-checks** | Out-of-scope per the milestone: "Background polling for new releases — once-per-launch only; no DispatcherTimer, no scheduled re-check". | Single async fire-and-forget kicked off from `MainWindow.ContentRendered`. |
| **PAT / OAuth token in client** | The spec is anonymous-only. Embedding a token in a desktop client is a security anti-pattern (extractable). Increases the rate-limit ceiling at the cost of a credential-management problem we don't need. | Anonymous request; 60 req/hour is plenty for once-per-launch. |
| **`HttpWebRequest` / `WebClient`** | Both are legacy (`WebClient` deprecated since .NET 6; `HttpWebRequest` documented as "obsolete for new development" in favor of `HttpClient`). | `HttpClient`. |

## Stack Patterns by Variant

**If trimming/AOT is enabled in a future milestone:**
- The recommended source-gen `JsonSerializerContext` shape continues to work unchanged.
- Add `<JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>` to surface any accidentally-reflection-bound path at runtime.
- `HttpClient`/`SocketsHttpHandler` remain trim-safe; no changes needed.
- Because Microsoft's docs say reflection-based serialization is *automatically* disabled when `PublishTrimmed=true`, code that didn't go through source-gen first would silently break. Adopting source-gen now (when no trimming pressure exists) is the cheapest insurance.

**If a "Check now" button is later added (manual re-check):**
- The static-`HttpClient` shape supports it with no changes.
- Add an in-memory cache + last-checked timestamp on the service to avoid hammering GitHub on rapid clicks.
- Same silent-failure posture; just expose `TryGetLatestReleaseVersionAsync` to a Settings button click handler.

**If the GitHub repo is renamed or moved:**
- The owner/repo strings are passed as parameters in the recommended `TryGetLatestReleaseVersionAsync(string owner, string repo, CancellationToken)` signature, so configurability lives at the call site.
- Hard-code the `owner`/`repo` constants alongside the service (or in a `const string GitHubOwner = "..."`) — settings-file configurability is unnecessary and adds attack surface (a malicious settings.json could redirect the check to a hostile endpoint).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `System.Net.Http.HttpClient` (BCL .NET 10) | `SocketsHttpHandler` (BCL .NET 10) | `SocketsHttpHandler` is the default underlying handler since .NET Core 2.1 — no opt-in needed. |
| `System.Text.Json` (BCL .NET 10) | `JsonSerializerContext` source generator (BCL .NET 10) | Source-gen is shipped in-box; no separate analyzer NuGet needed. |
| `System.Version` (BCL .NET 10) | `Assembly.GetName().Version` (BCL .NET 10) | Both return `System.Version`; comparison via `>` operator works directly. |
| `<UseWindowsForms>true</UseWindowsForms>` | `System.Net.Http.HttpClient` | No interaction. WinForms collision (Application/MouseEventArgs) does not extend to networking types. |

## Concrete Signatures the Roadmap and Plan-Phase Should Pin

```csharp
// FuzzyClock.Core/UpdateVersionComparer.cs
public static class UpdateVersionComparer
{
    public static bool TryParseTag(string? tag, out Version version);
    public static bool IsNewer(Version running, Version latest);
}

// FuzzyClock.App/UpdateCheckService.cs
internal sealed class UpdateCheckService
{
    public async Task<Version?> TryGetLatestReleaseVersionAsync(
        string owner, string repo, CancellationToken ct = default);
}

// AppSettings (init-property record, established convention)
public record AppSettings
{
    // ... existing fields ...
    public bool UpdateChecksEnabled { get; init; } = true;     // default ON per spec
}

// SettingsSnapshot (immutable populate-on-open record, established convention)
public record SettingsSnapshot
{
    // ... existing fields ...
    public bool UpdateChecksEnabled { get; init; } = true;
}
```

Notes for the planner:

- `UpdateChecksEnabled` MUST have an explicit `= true` initializer — bool fields absent from old `settings.json` deserialize to `false` without it, which would silently disable the feature on upgrade from v4.4 (same gotcha as `UptimeVisible`, `GhostModeEnabled`, etc., already documented in `Key Decisions`).
- `SettingsService.Validate()` does not need a new guard for `UpdateChecksEnabled` — bools have no dangerous zero-equivalent (consistent with other bool AppSettings fields per `Key Decisions`).
- The `UpdateText` TextBlock must participate in BOTH `ApplyTheme` and `ApplyDisplayColor` — Phase 33 critical pattern, called out explicitly in the milestone goal.
- The async kick-off in `MainWindow` should be fire-and-forget from `ContentRendered` (after `InitDialDecorations()` and `ApplyTheme()`) so it never delays the first frame; the UI update on completion goes through `Dispatcher.BeginInvoke` (same pattern as `GhostModeController`'s thread-pool-to-UI marshal in v4.4).

## Sources

- Microsoft Learn — *HttpClient guidelines for .NET* (`learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines`, last updated 2025-10-28). Confidence: HIGH. Verified the static-`HttpClient` + `PooledConnectionLifetime` pattern, the DNS-staleness explanation, and the explicit "without adding the overhead of `IHttpClientFactory`" recommendation for desktop scenarios.
- Microsoft Learn — *How to use source generation in System.Text.Json* (`learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation`, last updated 2026-03-30). Confidence: HIGH. Verified source-gen `JsonSerializerContext` syntax, `[JsonSerializable(typeof(T))]` attribute, the `JsonSerializerIsReflectionEnabledByDefault` MSBuild flag, and the auto-disable-reflection-when-trimming behavior.
- Microsoft Learn — *Source-generation modes in System.Text.Json* (`learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation-modes`, last updated 2025-12-04). Confidence: HIGH. Verified `[JsonPropertyName]` is supported under source-gen.
- Microsoft Learn — *Version Class (System)* (`learn.microsoft.com/en-us/dotnet/api/system.version`, default moniker `net-10.0`). Confidence: HIGH. Verified `IComparable<Version>` and `>`/`>=`/`<`/`<=` operator implementations in .NET 5+.
- GitHub Docs — *Resources in the REST API* (`docs.github.com/en/rest/overview/resources-in-the-rest-api`). Confidence: HIGH. Verified User-Agent requirement: "All API requests must include a valid `User-Agent` header. ... Requests with no `User-Agent` header will be rejected." and "If you provide an invalid `User-Agent` header, you will receive a `403 Forbidden` response."
- GitHub Docs — *Rate limits for the REST API* (`docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`). Confidence: HIGH. Verified 60 req/hour anonymous limit, `403` or `429` status, and the four `x-ratelimit-*` headers.
- GitHub Docs — *Releases REST API* (`docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28`). Confidence: HIGH. Verified `GET /repos/{owner}/{repo}/releases/latest` endpoint and the `tag_name` (string), `prerelease` (bool), `draft` (bool) response fields.
- GitHub Docs — *API versions* (`docs.github.com/en/rest/overview/api-versions`). Confidence: MEDIUM. Verified `X-GitHub-Api-Version` header is optional with a default; recommended for stability but unauthenticated `/releases/latest` works without it.
- NuGet.org — *NuGet.Versioning 7.6.0* package page. Confidence: HIGH. Verified Apache-2.0 license, `net8.0`-and-higher target, semver/pre-release/build-metadata support — the capabilities NOT needed for this milestone, justifying the "not recommended" stance.
- Direct codebase inspection: `FuzzyClock.App/FuzzyClock.App.csproj` (`<Version>4.5.0</Version>` confirms `Assembly.GetName().Version` will return `4.5.0.0`); `git tag --list` output (`v1.4` ... `v4.4`, `v2.5.1`, etc.) confirms the leading-`v` 2- or 3-component tag pattern with no pre-release suffixes.

---
*Stack research for: v4.5 Update Checker — once-per-launch GitHub Releases version compare for FuzzyClock (.NET 10 / WPF)*
*Researched: 2026-05-29*
