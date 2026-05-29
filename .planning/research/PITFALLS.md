# Domain Pitfalls: GitHub Releases Update Checker for FuzzyClock (v4.5)

**Domain:** Adding the first network call (once-per-launch HTTPS GET to api.github.com) to a previously-offline-only WPF widget on .NET 10
**Researched:** 2026-05-29
**Confidence:** HIGH (HttpClient/async/STJ guidance verified against current .NET 10 docs and Microsoft `IHttpClientFactory` advice; GitHub API behavior verified against `docs.github.com/en/rest/releases`; WPF threading rules are stable invariants)

## Reading Map for Roadmapper

Each pitfall is tagged with:
- **Phase to address** — which roadmap phase must prevent it (`UPD-SVC` = service phase, `UPD-VER` = version-compare phase in Core, `UPD-WIRE` = MainWindow integration phase, `UPD-SETT` = SettingsWindow toggle phase, `UPD-VERIFY` = human-verify/release phase)
- **Code-shape rule** — the concrete pattern that prevents it (not vague advice)
- **Cross-ref** — existing FuzzyClock decision/pattern that already proves the principle
- **Test surface** — what unit/integration tests must cover

---

## Critical Pitfalls

Mistakes that cause crashes, regressions, lost startup paint, or non-silent failures.

---

### Pitfall 1: HttpClient Lifetime — Wrong Patterns for the Wrong Reasons

**What goes wrong:**
For a once-per-process call, three competing pieces of advice circulate and developers pick the wrong one:
1. `using (var client = new HttpClient())` — naive disposal pattern
2. Long-lived static singleton — copy-paste from web app guidance
3. `IHttpClientFactory` — DI infrastructure overkill for one call

The naive `using` pattern in a long-running app over many calls causes socket exhaustion (TIME_WAIT pile-up). A static singleton in a long-running app eventually hits DNS staleness — the resolved IP for `api.github.com` is cached for the process lifetime and won't follow GitHub's load balancer rotations.

**Why it happens:**
The "don't use `using HttpClient`" guidance was written for high-frequency callers in web servers. FuzzyClock is **not** a high-frequency caller — it makes **exactly one call per launch**. Both the socket-exhaustion concern and the DNS-staleness concern are absent at this call rate.

**Why this is actually a non-issue for FuzzyClock specifically:**
- **One call per process** — socket exhaustion needs many calls per second; one call cannot exhaust anything
- **Process is not long-lived for HTTP purposes** — the call happens in the first ~5 seconds and is never repeated; DNS staleness over hours/days is irrelevant
- **No `IHttpClientFactory` benefit** — the factory exists to manage handler pools across many short-lived clients; we have one long-lived client used once

**Prevention — the actual safe pattern:**
```csharp
internal sealed class UpdateCheckService : IDisposable
{
    private readonly HttpClient _http;
    private bool _disposed;

    public UpdateCheckService(HttpClient? http = null)
    {
        _http = http ?? CreateDefaultClient();
    }

    private static HttpClient CreateDefaultClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(5)  // global hard cap
        };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("FuzzyClock/4.5 (+https://github.com/...)"); // GitHub requires UA
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
        return client;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _http.Dispose();  // safe — call is single-shot, no in-flight requests after CTS cancel
    }
}
```

**Cross-ref:** Same disposal pattern as `TemperatureService` (`Interlocked.CompareExchange` on `_disposed`). Constructor injection seam mirrors the `ITempSource` pattern that already exists in `FuzzyClock.App/ITempSource.cs`.

**Test surface:**
- Constructor-injected `HttpClient` with a fake `HttpMessageHandler` (see Pitfall 14)
- `Dispose` is idempotent (call twice, no exception)
- `Dispose` while a check is in-flight cancels gracefully (no `ObjectDisposedException` leaking)

**Phase to address:** UPD-SVC

---

### Pitfall 2: `.Result`/`.Wait()` Deadlock on the WPF Dispatcher Thread

**What goes wrong:**
A developer writing the integration code calls the async service synchronously from a UI handler:
```csharp
// IN MainWindow.xaml.cs ContentRendered:
var result = _updateCheckService.CheckAsync().Result;  // DEADLOCK on WPF dispatcher
UpdateText.Text = result.NoticeText;
```
The continuation of `CheckAsync` tries to resume on the captured `SynchronizationContext` (the WPF dispatcher), but that thread is blocked waiting on `.Result` — classic two-deadlock. App hangs at startup forever, no exception, no error.

**Why it happens:**
Three reinforcing causes:
1. The rest of MainWindow is event-handler-driven and not async — adding `async` to `ContentRendered_Click` feels like a refactor
2. `.Result` "looks synchronous" and is therefore tempting in a startup path
3. The deadlock doesn't occur in unit tests (no `SynchronizationContext`) so it ships green

**Prevention — fire-and-forget with proper exception handling:**
```csharp
// In MainWindow.xaml.cs ContentRendered:
_ = CheckForUpdatesAsync();  // discard, don't await — fire-and-forget

private async Task CheckForUpdatesAsync()
{
    try
    {
        var result = await _updateCheckService.CheckAsync(_appShutdownCts.Token);
        // resumes on WPF dispatcher because that's where we awaited from — safe to touch UI
        UpdateText.Text = result.NoticeText ?? "";
        UpdateText.Visibility = result.HasUpdate ? Visibility.Visible : Visibility.Collapsed;
    }
    catch (OperationCanceledException) { /* app shutting down — silent */ }
    catch (Exception)                    { /* silent failure posture (see Pitfall 4) */ }
}
```

**Why this works without deadlock:**
- No `.Result` / `.Wait()` blocks the dispatcher
- The `await` captures the dispatcher context, so the continuation runs back on the UI thread automatically — `UpdateText.Text =` is safe
- Exceptions are caught **inside** the async method, so they don't escape to `TaskScheduler.UnobservedTaskException`

**Cross-ref:** `Dispatcher.Invoke` pattern documented in PROJECT.md ("Dispatcher.Invoke for WinForms → WPF thread marshal") — same principle: never block the dispatcher thread on async work.

**Test surface:**
- Integration test: invoke the service from a `DispatcherFrame` and verify no deadlock with a short timeout fake
- Verify `UpdateText.Text` is set on the UI thread (not the threadpool)

**Phase to address:** UPD-WIRE

---

### Pitfall 3: `ConfigureAwait(false)` Misuse — Service vs. UI Boundaries

**What goes wrong:**
Following generic library guidance, the developer adds `.ConfigureAwait(false)` to every `await` in the service:
```csharp
var response = await _http.GetAsync(url, ct).ConfigureAwait(false);
var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
```
That's fine **inside the service**. But then the integration code does:
```csharp
var result = await _updateCheckService.CheckAsync(ct).ConfigureAwait(false);
UpdateText.Text = result.NoticeText;  // CRASH: not on UI thread
```
The `ConfigureAwait(false)` at the call site causes the continuation to run on the threadpool, and touching `UpdateText.Text` throws `InvalidOperationException: The calling thread cannot access this object because a different thread owns it.`

**Why it happens:**
"Always use `ConfigureAwait(false)` in libraries" guidance gets cargo-culted to application code. The rule is library-internal — at the UI boundary, you **want** the dispatcher context.

**Prevention — explicit rule per layer:**
- **Inside `UpdateCheckService` (library-like code):** Use `ConfigureAwait(false)` on every `await` — no UI dependency, threadpool resumption is fine
- **In `MainWindow.CheckForUpdatesAsync` (UI code):** Do **not** use `ConfigureAwait(false)` — let continuations resume on the dispatcher so UI assignment is safe

```csharp
// In UpdateCheckService.cs
public async Task<UpdateCheckResult> CheckAsync(CancellationToken ct)
{
    using var resp = await _http.GetAsync(url, ct).ConfigureAwait(false);  // OK
    var json = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);  // OK
    return Parse(json);
}

// In MainWindow.xaml.cs
private async Task CheckForUpdatesAsync()
{
    var result = await _updateCheckService.CheckAsync(_cts.Token);  // NO ConfigureAwait(false)
    UpdateText.Text = result.NoticeText;  // safe — back on dispatcher
}
```

**Cross-ref:** This is the standard async/library boundary rule from .NET docs (`docs.microsoft.com/en-us/archive/msdn-magazine/2013/march/async-await-best-practices-in-asynchronous-programming`), but the rule is invariant: same guidance applies to .NET 10.

**Test surface:**
- Service tests run on threadpool (no `SynchronizationContext`) and verify behavior
- Integration test verifies UI assignment doesn't throw `InvalidOperationException`

**Phase to address:** UPD-SVC (service) + UPD-WIRE (integration)

---

### Pitfall 4: Overly Broad `catch (Exception)` Swallows Process-Fatal Errors

**What goes wrong:**
"Silent failure posture" is interpreted as `catch (Exception) { }`, which silently swallows:
- `OutOfMemoryException` — process is corrupted but appears fine
- `StackOverflowException` — actually uncatchable in .NET, but...
- `ThreadAbortException` (legacy) — disrupts shutdown
- `AccessViolationException` — security indicator hidden
- `InvalidOperationException` from UI thread misuse (Pitfall 3) — bug hidden
- Any future library exception that's a real bug

If the catch is also "silent" (no log, no telemetry — per the silent-failure requirement), the bug exists forever and is invisible.

**Why it happens:**
The user-facing "silent failure" requirement is read as "swallow everything"; the developer doesn't distinguish "silent to the **user**" from "silent to **logs/diagnostics**".

**Prevention — catch specific network/parsing exceptions only:**
```csharp
public async Task<UpdateCheckResult> CheckAsync(CancellationToken ct)
{
    try
    {
        // ... HTTP + JSON work
    }
    catch (HttpRequestException)        { return UpdateCheckResult.NoUpdate; }   // network down, DNS, TLS, status >= 400
    catch (TaskCanceledException)       { return UpdateCheckResult.NoUpdate; }   // timeout (HttpClient throws this on Timeout) OR app shutdown CTS
    catch (OperationCanceledException)  { return UpdateCheckResult.NoUpdate; }   // app shutdown CTS (subclass safety net)
    catch (JsonException)               { return UpdateCheckResult.NoUpdate; }   // GitHub returned HTML during outage
    catch (FormatException)             { return UpdateCheckResult.NoUpdate; }   // Version.Parse on garbage tag
    catch (ArgumentException)           { return UpdateCheckResult.NoUpdate; }   // Version.Parse on empty/null
    // NO catch (Exception) — let OOM/AccessViolation/programmer errors propagate
}
```

**Critical: TaskCanceledException is the Timeout signal**
`HttpClient.Timeout` does not throw `TimeoutException` — it throws `TaskCanceledException` (which is a subclass of `OperationCanceledException`). Catching only `OperationCanceledException` covers both the timeout and the app-shutdown CTS, but `TaskCanceledException` is more specific so listing it explicitly documents intent. **In .NET 6+** there is also a `TimeoutException` inner cause exposed via `ex.InnerException is TimeoutException` — distinguish if needed, but for silent-failure both go to "no update".

**Cross-ref:** The `TemperatureService` `IsReady` / `-1f` discipline applies the same principle — known sentinel for "data not available", real bugs propagate.

**Test surface:**
- Per-exception test: feed a fake handler that throws each of the five caught types; verify `NoUpdate` returned
- Negative test: handler throws `OutOfMemoryException`; verify it propagates (test asserts `Assert.ThrowsException<OutOfMemoryException>`)

**Phase to address:** UPD-SVC

---

### Pitfall 5: CancellationToken Wiring — Timeout AND App-Shutdown Must Both Work

**What goes wrong:**
Three buggy patterns are common:
1. **Only `HttpClient.Timeout`** — App shutdown waits the full 5 seconds because the network call has no shutdown CTS
2. **Only an external CTS** — Network call hangs forever if `HttpClient.Timeout` is `Infinite`
3. **Both, but uncombined** — `_http.GetAsync(url, ct)` is passed only the shutdown token; the timeout fires but doesn't propagate back as cancellation

The user closes the app within 1 second of launch; the update check is mid-DNS-resolve; the process hangs at exit waiting for the 5s `HttpClient.Timeout` to fire. Looks like the app "doesn't quit cleanly".

**Why it happens:**
`CancellationTokenSource(TimeSpan)` is one source; the app-shutdown CTS is another. They must be linked via `CancellationTokenSource.CreateLinkedTokenSource(...)` so cancellation from **either** wins.

**Prevention — linked CTS pattern:**
```csharp
// In MainWindow.xaml.cs at field-init level:
private readonly CancellationTokenSource _appShutdownCts = new();

// In OnClosing:
protected override void OnClosing(CancelEventArgs e)
{
    _appShutdownCts.Cancel();
    base.OnClosing(e);
}

// In CheckForUpdatesAsync:
private async Task CheckForUpdatesAsync()
{
    using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
        _appShutdownCts.Token, timeoutCts.Token);
    try
    {
        var result = await _updateCheckService.CheckAsync(linkedCts.Token);
        // ...
    }
    catch (OperationCanceledException) { /* either source fired — both are fine */ }
}
```

Also set **`HttpClient.Timeout = Timeout.InfiniteTimeSpan`** if you're using a CTS for timeout — otherwise the two timeout sources race and you get unpredictable cancellation reasons. Or keep the 5s `HttpClient.Timeout` as a defense-in-depth ceiling (recommended).

**Cross-ref:** `TemperatureService` uses CTS-backed background task with timeout-on-init (`Task.WhenAny` + 5s timeout) per PROJECT.md memory; same pattern.

**Test surface:**
- Cancel the linked CTS mid-call; verify `OperationCanceledException` is observed at the await point in <50ms
- Set timeout to 100ms with a fake handler that delays 1s; verify cancellation fires
- Cancel app-shutdown CTS during in-flight check; verify Dispose returns within timeout

**Phase to address:** UPD-SVC

---

### Pitfall 6: Version.Parse Foot-Guns — `v` Prefix, Pre-release Suffixes, Build Metadata

**What goes wrong:**
GitHub release tags conventionally start with `v` (`v4.5.0`). `System.Version.Parse("v4.5.0")` throws `FormatException`. Naive code:
```csharp
var latest = Version.Parse(release.tag_name);  // BOOM if tag is "v4.5.0"
```

Worse foot-guns when GitHub tags include semver pre-release/build suffixes:
- `v4.5.0-beta` → `FormatException`
- `v4.5.0+build.123` → `FormatException`
- `v4.5.0-rc.1` → `FormatException`
- `v4` (single component) → `ArgumentException` (Version requires major.minor minimum)

And the silent-equality trap:
- `Version.Parse("4.5")` returns `4.5.-1.-1` (Build/Revision = -1 sentinel)
- `Version.Parse("4.5.0")` returns `4.5.0` (Build = 0, Revision = -1)
- These are **NOT equal**: `new Version("4.5") != new Version("4.5.0")`

Compare semantics: `new Version("4.5") < new Version("4.5.0")` returns **true** because -1 < 0. So a user on `4.5` sees the notice "v4.5.0 available" even though they're already on 4.5. (Less likely to bite if always 3-component, but FuzzyClock currently emits both 3-component and 4-component versions — see Pitfall 9.)

**Why it happens:**
The semver / `System.Version` mismatch is well-known in .NET, but easy to forget when wiring the comparison. `System.Version` is **not** semver — it's `major.minor[.build[.revision]]` with no pre-release support.

**Prevention — pure normalize-and-compare helper in Core:**
```csharp
// FuzzyClock.Core/UpdateVersionComparer.cs
namespace FuzzyClock.Core;

public static class UpdateVersionComparer
{
    /// <summary>
    /// Compares a GitHub release tag against the running assembly version.
    /// Returns null if either input is unparseable (silent failure).
    /// </summary>
    public static int? Compare(string runningVersion, string githubTag)
    {
        var a = Normalize(runningVersion);
        var b = Normalize(githubTag);
        if (a is null || b is null) return null;
        return a.CompareTo(b);
    }

    public static Version? Normalize(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var trimmed = raw.Trim();

        // Strip leading 'v' or 'V'
        if (trimmed.Length > 0 && (trimmed[0] == 'v' || trimmed[0] == 'V'))
            trimmed = trimmed[1..];

        // Strip pre-release suffix '-...' (out-of-scope per PROJECT.md "Pre-release / draft release detection" line)
        var dashIdx = trimmed.IndexOf('-');
        if (dashIdx >= 0) trimmed = trimmed[..dashIdx];

        // Strip build metadata '+...'
        var plusIdx = trimmed.IndexOf('+');
        if (plusIdx >= 0) trimmed = trimmed[..plusIdx];

        // Pad to 3-component to avoid -1 sentinel comparison surprise
        var parts = trimmed.Split('.');
        if (parts.Length < 2) return null;  // require at least major.minor
        if (parts.Length == 2) trimmed += ".0";  // 4.5 -> 4.5.0
        // Drop 4th component if present (we don't ship revisioned tags)
        if (parts.Length == 4) trimmed = string.Join('.', parts[0], parts[1], parts[2]);

        return Version.TryParse(trimmed, out var v) ? new Version(v.Major, v.Minor, Math.Max(0, v.Build)) : null;
    }
}
```

**Pre-release filter — out of scope per PROJECT.md "Pre-release / draft release detection":** The GitHub Releases API has a separate `/releases` endpoint listing all releases including pre-release/draft. Use `/releases/latest` which **already filters to non-prerelease, non-draft** by GitHub's API (see Pitfall 7). But still strip `-...` suffix in `Normalize` as defense-in-depth in case `tag_name` happens to contain one (it can — pre-release tags in `/releases/latest` payload have `prerelease: true`, but if the user creates a "stable" release with `-rc1` in its tag for some reason, we don't want to crash).

**Cross-ref:** Same "pure static helper in `FuzzyClock.Core`" pattern as `DateFormatter`, `UptimeFormatter`, `TemperatureFormatter`, `DialGeometry`, `PhraseWrapService`. Testable without WPF.

**Test surface (DataRow exhaustive):**
| running | github tag | expected sign | notes |
|---------|-----------|---------------|-------|
| `4.5.0` | `v4.5.0` | 0 | leading-v stripped |
| `4.5.0` | `v4.5.1` | -1 | newer available |
| `4.5.1` | `v4.5.0` | +1 | older release on GitHub |
| `4.5` | `v4.5.0` | 0 | major.minor padded |
| `4.5.0` | `v4.5.0-beta` | 0 | pre-release suffix stripped |
| `4.5.0` | `v4.5.0+build.42` | 0 | build metadata stripped |
| `4.5.0.0` | `v4.5.0` | 0 | revision component dropped |
| `4.5.0` | ` v4.5.0 ` | 0 | whitespace tolerance |
| `4.5.0` | `` | null | empty tag returns null |
| `4.5.0` | `garbage` | null | unparseable returns null |
| `4.5.0` | `v4` | null | single-component returns null |

**Phase to address:** UPD-VER

---

### Pitfall 7: GitHub API Quirks — Redirects, Empty Releases, Rate Limits

**What goes wrong:**
Five GitHub API behaviors that bite:

1. **`/releases/latest` returns 302 redirect** when the latest release tag changes — `HttpClient` auto-follows by default, so this is usually fine, but if `AllowAutoRedirect` was disabled (say to inspect headers) the body is empty
2. **`/releases/latest` returns 404 when zero releases exist** — first-ever check on a fresh repo with no published releases
3. **Rate limit 403 with JSON body** `{"message":"API rate limit exceeded ...","documentation_url":"..."}` — schema looks like a release object but has no `tag_name`. Naive `Deserialize<GitHubRelease>().tag_name` returns null, version comparison crashes or silently works (returns null) and we flag-as-no-update — fine. But check `response.StatusCode == HttpStatusCode.Forbidden && headers["x-ratelimit-remaining"] == "0"` to distinguish rate limit from real auth/repo error
4. **`/releases/latest` excludes pre-releases and drafts automatically** — this is exactly what we want per PROJECT.md "Pre-release / draft release detection" out-of-scope
5. **HTML during outage** — GitHub serves a maintenance HTML page during incidents; `Deserialize<GitHubRelease>("...HTML...")` throws `JsonException` (caught per Pitfall 4 → no update)

**Why it happens:**
Developers test only the happy path (200 OK with valid JSON) and miss redirect chains, rate limits, and outages.

**Prevention — defensive response handling:**
```csharp
const string Url = "https://api.github.com/repos/{owner}/FuzzyClock/releases/latest";

using var resp = await _http.GetAsync(Url, ct).ConfigureAwait(false);

if (resp.StatusCode == HttpStatusCode.NotFound)
    return UpdateCheckResult.NoUpdate;  // no published releases
if (resp.StatusCode == HttpStatusCode.Forbidden)
    return UpdateCheckResult.NoUpdate;  // rate-limited or repo private
if (!resp.IsSuccessStatusCode)
    return UpdateCheckResult.NoUpdate;  // any other non-2xx

// Reject obviously-not-JSON responses early
var contentType = resp.Content.Headers.ContentType?.MediaType ?? "";
if (!contentType.Contains("json", StringComparison.OrdinalIgnoreCase))
    return UpdateCheckResult.NoUpdate;  // HTML during outage

await using var stream = await resp.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
var release = await JsonSerializer.DeserializeAsync<GitHubRelease>(stream, JsonOpts, ct).ConfigureAwait(false);

if (release is null || string.IsNullOrWhiteSpace(release.TagName))
    return UpdateCheckResult.NoUpdate;
```

**User-Agent header is REQUIRED by GitHub:** Requests without a User-Agent return 403. The HttpClient setup in Pitfall 1 includes `client.DefaultRequestHeaders.UserAgent.ParseAdd("FuzzyClock/4.5 ...")`. Verify with a unit test against a fake handler that asserts the header is present.

**`X-GitHub-Api-Version: 2022-11-28` header recommended** to pin response shape (per current GitHub REST docs); not required, but future-proofs.

**Cross-ref:** Same "guard every external response" discipline as `StatsService` PDH counter exception guards (`_gpuAvailable` fallback, paging-file try/catch, BatteryPercent -1f sentinel).

**Test surface:**
- Fake handler returning 200 + valid JSON → returns parsed version
- Fake handler returning 404 → `NoUpdate`
- Fake handler returning 403 + rate-limit JSON body → `NoUpdate`
- Fake handler returning 200 + HTML body (with `Content-Type: text/html`) → `NoUpdate`
- Fake handler returning 200 + valid JSON with `tag_name: null` → `NoUpdate`
- Fake handler returning 200 + valid JSON with `tag_name: ""` → `NoUpdate`
- Verify request includes `User-Agent` and `Accept: application/vnd.github+json` headers

**Phase to address:** UPD-SVC

---

### Pitfall 8: System.Text.Json Source Generators / Trim Warnings (Future Trim/AOT Risk)

**What goes wrong:**
`JsonSerializer.Deserialize<GitHubRelease>(json)` uses **runtime reflection** by default. Under `<PublishTrimmed>true</PublishTrimmed>` or `<PublishAot>true</PublishAot>`, this emits warning **IL2026** ("RequiresUnreferencedCode") and may **throw at runtime** because `GitHubRelease`'s properties have been trimmed out.

**Current state of FuzzyClock:** Csproj does NOT set `PublishTrimmed` or `PublishAot` (verified via grep) — so this is not a today-bug. But it's a **dormant trap** that bites when someone enables trimming for installer-size reasons later.

**Why it happens:**
Trim/AOT is a future optimization; STJ source generators are the future-safe pattern. Adopting STJ source generators **now** costs ~10 lines and prevents a hard-to-debug runtime failure later.

**Prevention — opt into STJ source generators preemptively:**
```csharp
// FuzzyClock.App/UpdateCheckService.cs
internal sealed record GitHubRelease(
    [property: JsonPropertyName("tag_name")] string? TagName,
    [property: JsonPropertyName("html_url")]  string? HtmlUrl,
    [property: JsonPropertyName("name")]      string? Name,
    [property: JsonPropertyName("prerelease")] bool Prerelease);

[JsonSerializable(typeof(GitHubRelease))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower,
    AllowTrailingCommas = false,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
internal partial class UpdateJsonContext : JsonSerializerContext { }

// At call site:
var release = await JsonSerializer.DeserializeAsync(stream, UpdateJsonContext.Default.GitHubRelease, ct);
```

**Cross-ref:** This is the .NET 7+ STJ source-generator pattern (current as of .NET 10). Documented at `learn.microsoft.com/dotnet/standard/serialization/system-text-json/source-generation`.

**Test surface:**
- Same deserialize tests run against the source-gen path (TypeInfo, not reflection)
- Build-time check: `dotnet build /p:PublishTrimmed=true` for `UpdateCheckService` should produce zero IL2026 warnings (smoke check, not a CI gate)

**Phase to address:** UPD-SVC

---

### Pitfall 9: Dev-Box Version Mismatch — Stale csproj `<Version>` Showing Wrong Notices

**What goes wrong:**
The running assembly's version is read via `Assembly.GetExecutingAssembly().GetName().Version` or `typeof(App).Assembly.GetName().Version`. On a dev box, the csproj `<Version>` is hand-edited and frequently lags — for example `<Version>3.6.0</Version>` is seen in the current csproj on the **InformationalVersion** line (verified) while AssemblyVersion is 4.5.0.0. CI overrides this with the git tag version on tag push.

The risk depends on which property you read:
- `GetName().Version` → reads **AssemblyVersion** (4.5.0.0) — CI-correct
- `GetCustomAttribute<AssemblyInformationalVersionAttribute>()` → reads **InformationalVersion** (`3.6.0` in current csproj — STALE)
- `Assembly.GetName().Version` is generally what we want

But on a dev box, AssemblyVersion can also be stale if not bumped along with releases. Result: dev runs of FuzzyClock show "v4.5.0 available" notice persistently because the running version (3.6.0 / pre-bump) is older than the latest GitHub release (4.4.0 from previous milestone, or 4.5.0 once we tag).

**Consequences:**
- Screenshots taken during dev show wrong update notices
- Dev verification can't tell "feature is broken" from "feature is correct, version is stale"
- Commits accidentally include screenshots showing nonsensical "v4.4.0 available" while running 4.5.0-dev

**Why it happens:**
Three reinforcing causes:
1. `<Version>` and `<InformationalVersion>` in csproj drift independently (they already do — verified)
2. Dev builds don't get the CI version-injection from `release.yml`
3. The update checker has no concept of "this is a dev build"

**Prevention — three layers, lightest first:**

1. **Read AssemblyVersion (not InformationalVersion).** It's at least machine-tracked and gets bumped on releases. Don't read `InformationalVersion`.

2. **Detect dev/debug builds and skip the check:**
```csharp
public async Task<UpdateCheckResult> CheckAsync(CancellationToken ct)
{
#if DEBUG
    return UpdateCheckResult.NoUpdate;  // dev box: never check
#endif
    // ... real check
}
```
   This is the simplest and matches "silent failure posture" from the user perspective. Dev builds never display the notice.

3. **Or: detect debugger attached at runtime:**
```csharp
if (System.Diagnostics.Debugger.IsAttached) return UpdateCheckResult.NoUpdate;
```
   Catches both Debug and Release-with-debugger-attached.

**Recommended:** Layer 2 (`#if DEBUG`) — covers the common case (running from `dotnet run` or VS); paths in `dotnet publish -c Release` from CI never carry DEBUG so the real check fires for users.

**Cross-ref:** No direct precedent in FuzzyClock, but the principle (dev-box vs. production behavior gating) matches the PRINCIPAL.md "Verify before claiming success" working preference.

**Test surface:**
- Unit test reads `Assembly.GetName().Version` and verifies it matches `4.5.0.0` (AssemblyVersion, not InformationalVersion) — this acts as a tripwire if someone reverts the version-read path
- No automated test for `#if DEBUG` skip (test runner is itself DEBUG, can't easily verify) — manual checklist item

**Phase to address:** UPD-VERIFY (also mentioned in UPD-SVC for the `#if DEBUG` guard)

---

### Pitfall 10: ApplyTheme + ApplyDisplayColor Coverage — The Phase 33 Bug Reincarnated

**What goes wrong:**
A new `UpdateText` TextBlock is added to MainWindow.xaml. Both `ApplyTheme()` and `ApplyDisplayColor()` mutate the foreground brush of every accent-colored text element. Forgetting to add the new TextBlock to **both** methods produces a half-broken accent color:
- Theme change works (ApplyTheme covers it) but auto-contrast switch doesn't update UpdateText (ApplyDisplayColor missed it)
- OR: Auto-contrast works but theme switch doesn't update UpdateText
- OR (worst): both miss it and UpdateText stays at design-time White forever

**Why it happens:**
`ApplyTheme` and `ApplyDisplayColor` are **two parallel mutation paths** for accent color. Both must enumerate the same element set. The bug shape is well-documented in PROJECT.md ("Stats label TextBlocks must have x:Name") — it's literally the same trap that bit Phase 33.

**Prevention — three rules (all three required):**

1. **`x:Name="UpdateText"` on the new TextBlock** so it's reachable from code-behind (xaml x:Name pattern). Phase 33 lesson verbatim.

2. **Add `UpdateText.Foreground = brush;` in BOTH methods.** Find both methods, find the line for `TempsText.Foreground = brush;`, append `UpdateText.Foreground = brush;` immediately after in BOTH places. The two methods live around `MainWindow.xaml.cs:1637` (ApplyTheme) and `~1674` (ApplyDisplayColor) per project memory.

3. **Add a parametric test that asserts coverage parity:**
```csharp
[TestMethod]
public void ApplyTheme_AndApplyDisplayColor_CoverSameElementSet()
{
    var themeFields = ExtractForegroundAssignments("ApplyTheme");
    var displayFields = ExtractForegroundAssignments("ApplyDisplayColor");
    CollectionAssert.AreEquivalent(themeFields, displayFields,
        "ApplyTheme and ApplyDisplayColor must mutate the same element set");
}
```
   Implementation can use Roslyn or a simpler regex over the source file.

**Cross-ref:** Direct. PROJECT.md decision: "Stats label TextBlocks must have x:Name — both `ApplyDisplayColor` and `ApplyTheme` must cover the same full element set" — Validated v2.7. Same principle for Phase 78/79 `TempsText`.

**Test surface:**
- Regex/Roslyn test that both methods reference the same set of `*.Foreground = brush` element names
- Manual verification: change accent color → UpdateText updates; trigger auto-contrast over light bg → UpdateText switches to black

**Phase to address:** UPD-WIRE

---

### Pitfall 11: StatsPanel 8th Child — Off-Screen Push at Low Monitor Heights

**What goes wrong:**
Adding `UpdateText` as the 8th child of `StatsPanel` increases the widget's natural height by ~13px (font 11 line-height + Margin 0,2,0,0). On a 720p laptop monitor with the widget anchored near the bottom, the new height pushes the widget off-screen. The v1.1 position-clamp invariant catches this on **first launch** (re-clamp in `ContentRendered`) but only if `SizeToContent=WidthAndHeight` recalculates and the clamp fires.

**Worse case:** widget is visible until the **first** check fires. The check completes ~2 seconds after launch, sets `UpdateText.Visibility = Visible`, the widget grows by 13px, position is now off-screen, **and the re-clamp has already fired in `ContentRendered`** (before the visibility change). The widget partially clips off the bottom edge of the screen. User has no idea why.

**Why it happens:**
Two reinforcing causes:
1. The clamp pattern fires once at startup, not on every layout change
2. PROJECT.md ("Re-clamp after every phrase change") explicitly handles phrase-change re-clamping — but **does it handle Visibility-change re-clamping for StatsPanel children?** Need to verify in code.

**Prevention — three options, prefer Option A:**

**Option A (recommended): Re-clamp after the update notice becomes visible.**
```csharp
private async Task CheckForUpdatesAsync()
{
    var result = await _updateCheckService.CheckAsync(...);
    UpdateText.Text = result.NoticeText ?? "";
    UpdateText.Visibility = result.HasUpdate ? Visibility.Visible : Visibility.Collapsed;

    if (result.HasUpdate)
    {
        UpdateLayout();  // force layout pass so ActualHeight reflects new size
        ClampToScreen(); // re-clamp using existing helper
    }
}
```

**Option B:** Subscribe to `UpdateText.IsVisibleChanged` and re-clamp from there. Cleaner separation but adds an event subscription for a one-shot operation.

**Option C:** Always clamp on `SizeChanged` of the widget. Heavier but handles all future StatsPanel additions automatically. Probably overkill.

**Worst-case risk: notice toggling at the bottom of the screen pushes the widget up and down repeatedly.** This is `MonitorPositions` territory — when the widget shifts, save the new position? Or treat the notice-driven shift as transient and don't persist? **Recommendation:** Don't persist — the user's intended position is the pre-notice position; restore it next launch.

**Cross-ref:** PROJECT.md "Re-clamp after every phrase change", "WIN-05 widget position restored on startup, clamped if off-screen", "v1.1 position persistence". Same invariant — extend to "and after every height-changing update notice toggle".

**Test surface:**
- Unit-style test for `ClampToScreen`: simulate widget at `Top = screenHeight - 100`, height = 90 (clear), then height = 110 (clipped); verify `Top` adjusts upward
- Integration test: render widget at bottom edge, fire mock check returning `HasUpdate=true`, verify widget is fully on-screen after layout pass
- Manual: 1080p → 720p monitor switch test with widget near the bottom

**Phase to address:** UPD-WIRE

---

### Pitfall 12: AppSettings JSON Forward/Backward Compat — `UpdateChecksEnabled` Default-True Trap

**What goes wrong:**
Adding `UpdateChecksEnabled` to `AppSettings` as a positional record field would break old `settings.json` files. But FuzzyClock already uses **init-property records** (verified v1.1 decision in PROJECT.md). Adding `bool UpdateChecksEnabled { get; init; } = true;` is forward-compat correct.

**However:** the C# default for `bool` is `false`, not `true`. If the field is declared without an explicit `= true;` initializer, then a settings.json missing the field deserializes to `false`. Users upgrading from v4.4 silently have update checks **disabled** by default — opposite of the intent.

**Cross-ref:** This is exactly the bug pattern documented in PROJECT.md as `UptimeVisible init default = true` — "Bool JSON-deserializes as false when field absent from old settings.json; explicit `= true` required for upgrade safety from v2.0". Same trap, same fix.

**Why it happens:**
Forgetting the `= true` init initializer is invisible during testing if the test setup always serializes a fresh AppSettings (which has the C# default = false default). The bug only fires when reading an **old** settings.json without the field.

**Prevention — explicit init default + absent-field test:**
```csharp
// AppSettings.cs
public bool UpdateChecksEnabled { get; init; } = true;  // EXPLICIT default-true
```

```csharp
// AppSettingsTests.cs
[TestMethod]
public void Deserialize_AbsentUpdateChecksEnabled_ReturnsTrue()
{
    var json = "{}";  // minimal JSON, field absent
    var settings = JsonSerializer.Deserialize<AppSettings>(json);
    Assert.IsTrue(settings!.UpdateChecksEnabled);
}
```

**Cross-ref:** Direct mirror of `STEST-02` pattern: "AppSettings deserialization with UptimeVisible absent returns true (init default, not C# false default)". Same test shape, new field.

**Test surface:**
- Round-trip test: serialize AppSettings with `UpdateChecksEnabled = false`, deserialize, assert false
- Round-trip test: serialize AppSettings with `UpdateChecksEnabled = true`, deserialize, assert true
- Absent-field test (above) — proves init default
- Negative test: corrupted JSON `{"UpdateChecksEnabled": "not a bool"}` doesn't crash app — `SettingsService.Validate()` may need to handle this; STJ throws `JsonException` which is fine if Load catches it (verify existing pattern)

**Phase to address:** UPD-SETT

---

### Pitfall 13: Settings Toggle Race — Toggle While Check In-Flight

**What goes wrong:**
User opens Settings during launch (within the 2-5 second window before the check completes). User unchecks "Check for updates on launch". User closes Settings.

Three race scenarios:
1. **Check completes after toggle, notice shows anyway** — the in-flight check resolves and writes `UpdateText.Visibility = Visible`. User just disabled it; expects no notice this session.
2. **Settings.json double-write race** — Toggle saves immediately (per FuzzyClock convention); the in-flight check has no settings dependency so this is fine. But if a future feature has the check write settings (e.g. "remember last-known latest version"), the two writes can race.
3. **Toggle ON during in-flight cancelled check** — User toggles OFF then ON quickly; check is cancelled mid-flight; user expects a check to fire. Currently it won't (once-per-launch). Document as expected.

**Why it happens:**
"Once-per-launch" is per-process, but the user's mental model can be "this session". Race on the in-flight result not honoring the new toggle is the most common surprise.

**Prevention — read live setting before mutating UI:**
```csharp
private async Task CheckForUpdatesAsync()
{
    var result = await _updateCheckService.CheckAsync(...);

    // Re-read live setting at the LAST moment before mutating UI
    // (user may have toggled OFF while the network call was in flight)
    if (!_settings.UpdateChecksEnabled || !result.HasUpdate)
    {
        UpdateText.Visibility = Visibility.Collapsed;
        return;
    }

    UpdateText.Text = result.NoticeText;
    UpdateText.Visibility = Visibility.Visible;
    UpdateLayout();
    ClampToScreen();
}
```

**Also:** When the toggle is unchecked in Settings, immediately set `UpdateText.Visibility = Collapsed` regardless of whether the check is in-flight. The handler should not depend on whether the check has resolved.

**Decision: do NOT cancel the in-flight check on toggle-off.** Cancelling is more code for no user-visible benefit (user already won't see the notice). Let the check complete, just don't render.

**Cross-ref:** PROJECT.md "_settings field cached in ApplyTheme" — _settings is the live source of truth, always read it at the point of UI mutation, not at the time of network call dispatch.

**Test surface:**
- Integration test: kick off check, set `_settings = _settings with { UpdateChecksEnabled = false }` mid-call, complete the check; verify `UpdateText.Visibility == Collapsed`
- Integration test: toggle the checkbox while a check is in-flight; verify subsequent UI mutation respects the new setting

**Phase to address:** UPD-WIRE + UPD-SETT

---

### Pitfall 14: Unit Testability — HttpClient is Hard to Fake

**What goes wrong:**
`HttpClient` is a sealed class (well, it's not sealed in modern .NET, but `SendAsync` is virtual). Mocking it with traditional mocking libraries is ugly. Without a clean seam, the service is impossible to unit-test deterministically — you end up:
- Hitting api.github.com from tests (flaky, rate-limited, slow)
- Skipping tests for "the network code"
- Refactoring under fire late in the milestone

**Prevention — `HttpMessageHandler` injection seam:**
The cleanest seam is the `HttpMessageHandler` constructor parameter on `HttpClient`. Inject a fake handler that returns canned responses.

```csharp
internal sealed class FakeHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
    public FakeHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
        => Task.FromResult(_responder(req));
}

// In tests:
var handler = new FakeHttpMessageHandler(req => new HttpResponseMessage(HttpStatusCode.OK)
{
    Content = new StringContent("{\"tag_name\":\"v4.6.0\"}", Encoding.UTF8, "application/json")
});
var client = new HttpClient(handler);
var service = new UpdateCheckService(client);
var result = await service.CheckAsync(CancellationToken.None);
Assert.AreEqual("v4.6.0 available", result.NoticeText);
```

**Even cleaner alternative: Func<Task<string>> network delegate** — the service takes a `Func<CancellationToken, Task<string>>` that returns the JSON body. Tests pass a lambda that returns canned JSON. No `HttpClient` involved in tests at all. **Trade-off:** can't test redirect/status-code behavior in the service. **Recommendation:** Use `HttpMessageHandler` injection for full coverage.

**Even cleanest alternative: extract `IUpdateCheckClient` interface** — `UpdateCheckService` takes an `IUpdateCheckClient`; production impl uses HttpClient; tests use a fake. This is over-engineered for one method.

**Best balance:** Constructor injection of `HttpClient` (allowing fake handler), service public surface is `Task<UpdateCheckResult> CheckAsync(CancellationToken)`.

**Cross-ref:** Same "constructor-injected dependency for testability" pattern as `ITempSource` injected into `TemperatureService`, `IGhostSampler` injected into `GhostModeController`. FuzzyClock has a strong tradition of test seams.

**Test surface:**
- All Pitfall 4 + Pitfall 7 cases use this seam
- Verify the seam itself: constructor accepts `null` and uses default; constructor accepts injected client and uses it

**Phase to address:** UPD-SVC

---

### Pitfall 15: WPF Startup Paint Blocking — Where to Fire the Check

**What goes wrong:**
Firing the check too early blocks the first paint. The dispatcher is busy with layout/render passes during startup; a synchronous-looking call from `App.OnStartup` or `MainWindow.ctor` can delay the first frame by hundreds of ms. The widget visibly hangs at launch.

**Why it happens:**
Developers reach for `App.OnStartup` because it's "the startup hook". But that fires before the window is even constructed. If you fire-and-forget there, the await continuation may happen before WPF is ready to mutate UI elements (`UpdateText` doesn't exist yet).

**Prevention — fire from `ContentRendered` or later:**
```csharp
// MainWindow.xaml.cs
private void Window_ContentRendered(object? sender, EventArgs e)
{
    // ... existing startup work (clamp, decoration init, timer start, ApplyTheme) ...

    // LAST: fire-and-forget the update check
    _ = CheckForUpdatesAsync();
}
```

**Why ContentRendered is correct:**
- All UI elements exist (the page has been laid out and rendered once)
- `ApplyTheme` has run (Phase 33 lesson — UpdateText foreground is correct)
- Existing startup work has finished — first paint already done

**Even safer (overkill, do not adopt unless needed):** dispatch the kickoff via `Dispatcher.BeginInvoke(DispatcherPriority.Background, ...)`. But in practice, `ContentRendered` happens after first paint anyway; the kickoff itself is `_ = CheckForUpdatesAsync()` which returns immediately and the `await` inside doesn't block synchronously.

**Cross-ref:** PROJECT.md "ContentRendered for startup clamp, decoration init, timer start" — same pattern. The update-check kickoff is just one more piece of post-paint startup work.

**Anti-pattern: Don't do this:**
```csharp
// App.xaml.cs - WRONG
protected override async void OnStartup(StartupEventArgs e)
{
    base.OnStartup(e);
    await _updateCheckService.CheckAsync(...);  // DELAYS WINDOW CREATION
    // ...
}
```

**Test surface:**
- Smoke test: measure time from process start to first window-rendered (e.g. `Stopwatch` in test harness with `Window.Loaded`); verify update check doesn't add >50ms
- Manual: dev-box "feels instant on launch" check, no perceptible delay vs. v4.4

**Phase to address:** UPD-WIRE

---

### Pitfall 16: Antivirus/Firewall — First Outbound HTTPS Triggers SmartScreen?

**What goes wrong:**
FuzzyClock has been an offline app for 4+ milestones. Existing user installations have built up antivirus reputation as "no network behavior". The first version to make an outbound HTTPS call to api.github.com **may** trigger:
- **Windows Defender SmartScreen** — unlikely for HTTPS to a well-known domain; no executable download, just JSON
- **Third-party AV behavioral blockers** — some flag previously-offline binaries that suddenly make network calls
- **Corporate firewalls** — block api.github.com without exception

**Likelihood is low but non-zero.** The widget is per-user installed, signed by Inno Setup, and api.github.com is well-known. SmartScreen primarily flags executable downloads, not HTTPS requests by signed binaries.

**What developers worry about that doesn't happen:**
- Defender does not flag HTTPS GETs to api.github.com from signed binaries — verified by GitHub Desktop, VS Code, and dozens of other apps doing the same
- HTTPS already uses port 443; no firewall hole to punch

**What can actually happen:**
- Corporate firewall blocks api.github.com → check fails silently (per Pitfall 4) → no notice shown → no user impact (silent failure posture honored)
- Captive portal returns HTML 200 → caught by Pitfall 7 content-type check
- DNS poisoning / hostile network → TLS validation fails → `HttpRequestException` → caught

**Prevention — defensive posture only:**
- The 5s timeout (Pitfall 5) bounds firewall-block latency
- The silent failure posture (Pitfall 4) handles all of these gracefully
- No extra code needed beyond what Pitfalls 1-7 already cover

**Recommended: don't try to "fix" antivirus problems pre-emptively.** Test on a representative dev box with Defender enabled (default Windows). If a real AV flag emerges in QA or user reports, address it then.

**Cross-ref:** None directly. FuzzyClock's first outbound HTTPS — no precedent.

**Test surface:**
- Manual verification on a stock Windows 11 install with Defender + SmartScreen enabled
- Document expected behavior in dev box: 200 OK in <500ms typically

**Phase to address:** UPD-VERIFY (manual test only; no code change)

---

### Pitfall 17: TaskScheduler.UnobservedTaskException — Fire-and-Forget Done Wrong

**What goes wrong:**
A common (wrong) pattern:
```csharp
_ = CheckForUpdatesAsync();  // good
async Task CheckForUpdatesAsync()
{
    var result = await _updateCheckService.CheckAsync(_cts.Token);  // exception escapes
    UpdateText.Text = result.NoticeText;
}
```
If `CheckAsync` throws an uncaught exception (because Pitfall 4 catches were missed inside the service), the exception propagates up to the discarded Task. In .NET 4.5+ this **does not** crash the process by default (the legacy "crash on UnobservedTaskException" behavior is off), but:
- The exception is invisible (no log, no user notice)
- A `TaskScheduler.UnobservedTaskException` handler **could** flag it, but FuzzyClock doesn't have one
- Real bugs (programmer errors) hide forever

**Prevention — wrap the fire-and-forget in try/catch:**
```csharp
private async Task CheckForUpdatesAsync()
{
    try
    {
        var result = await _updateCheckService.CheckAsync(_cts.Token);
        if (_settings.UpdateChecksEnabled && result.HasUpdate)
        {
            UpdateText.Text = result.NoticeText;
            UpdateText.Visibility = Visibility.Visible;
            UpdateLayout();
            ClampToScreen();
        }
        else
        {
            UpdateText.Visibility = Visibility.Collapsed;
        }
    }
    catch (OperationCanceledException) { /* shutdown — silent */ }
    catch (Exception)                    { /* silent failure posture; service should have caught its own */ }
}
```

The `catch (Exception)` here is **at the top of the fire-and-forget boundary**, not inside the service. This is the only place where catching Exception is justified, and only because:
- The service already catches its specific types (Pitfall 4)
- This is the last line of defense for genuinely unexpected errors
- Without it, the exception is lost to UnobservedTaskException

**Cross-ref:** Standard `Task` discard discipline. No FuzzyClock precedent (no other fire-and-forget paths exist — verified by grep on `_ = `).

**Test surface:**
- Service throws an unexpected exception (use a fake handler that throws `InvalidOperationException`); verify the fire-and-forget catch doesn't crash the app
- Service throws `OperationCanceledException` after CTS cancel; verify it's caught, no UnobservedTaskException fires

**Phase to address:** UPD-WIRE

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip STJ source generators (use reflection) | -10 lines, no JsonSerializerContext file | Trim/AOT future-blocker; IL2026 warnings on first attempt to optimize installer size | Acceptable in v4.5 if PublishTrimmed is explicitly out of roadmap; revisit when shrinking installer size |
| Hardcode the GitHub repo URL in service | Simple constant, no config plumbing | Forking the project requires a code edit to change the update source | Acceptable — FuzzyClock has one upstream; OSS forks can fork-and-edit |
| Skip cancellation linking, use only HttpClient.Timeout | Less code | App-shutdown delays up to 5s when check is in-flight; "doesn't quit cleanly" reports | Never — Pitfall 5 prevention is the bar |
| No `#if DEBUG` guard on dev box | Don't have to test the check path differently | Screenshots / commits include wrong "vX.Y.Z available" notices | Never — Pitfall 9 prevention is mandatory |
| `catch (Exception)` everywhere in service | "Silent failure" goal achieved with one line | Real bugs (UI thread misuse, OOM, programmer errors) silently lost forever | Never — Pitfall 4 specific-types pattern is the bar |
| Skip ApplyTheme/ApplyDisplayColor coverage test | -1 test class | Phase 33 bug shape returns: half-broken accent on UpdateText | Never — Pitfall 10 parity test is mandatory |
| Read InformationalVersion (semver-y) instead of AssemblyVersion | Pretty version strings | InformationalVersion is hand-edited and known-stale (current value `3.6.0` while real is `4.5.0.0`) | Never |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub API | Missing `User-Agent` header → 403 Forbidden on every request | Set User-Agent to `FuzzyClock/4.5 (+url)` per GitHub API requirement |
| GitHub API | Using `/releases` (all releases) instead of `/releases/latest` | `/releases/latest` filters out drafts and pre-releases automatically — exactly what PROJECT.md "out of scope: pre-release detection" requires |
| GitHub API | Not handling 404 from `/releases/latest` (zero releases case) | Treat 404 as `NoUpdate`; do not log/error |
| GitHub API | Treating rate-limit 403 same as auth 403 | Both → silent NoUpdate per silent-failure posture; no need to distinguish for v4.5 |
| GitHub API | Using HTTPS but trusting any response body as JSON | Verify `Content-Type` includes `json` before deserializing — defends against outage HTML |
| GitHub API | Hardcoding `https://api.github.com/...` and forgetting to make it const | One `const string Url = "..."` constant in service; no config flag (out of scope) |
| WPF + async | Awaiting on dispatcher thread without `ConfigureAwait(false)` in service code | Service uses `ConfigureAwait(false)`; integration code does NOT (Pitfall 3) |
| Settings | New AppSettings field without explicit init default | All bool fields require `= true` or `= false` initializer (Pitfall 12) |
| StatsPanel | Adding child without considering height impact on widget position | Re-clamp after toggling Visibility on any new child (Pitfall 11) |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Repeated checks on phrase change / settings save | Network call fires every 5 minutes; rate limit hit within 8 hours | Once-per-launch only, gated by `_hasChecked` field | If anyone adds a "Recheck" button or DispatcherTimer-driven recheck — explicit out of scope per PROJECT.md |
| Synchronous version compare on hot path | None at this scale | `UpdateVersionComparer.Compare` is called once per launch; no concern | N/A |
| HttpClient creation per call | At 1 call/launch, no concern; would be problem at 10+/sec | Use service-lifetime HttpClient (Pitfall 1) | Never reaches problem scale unless background polling is added |
| StatsPanel layout recalculation on visibility change | First-launch only ~5ms; imperceptible | UpdateLayout() called once when notice toggles | Never at this UI complexity |
| Reading Assembly.GetName().Version per check | Reflection at startup is microsecond-level | Cache the running version in a static field | Never |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting `release.html_url` for click-to-browser | Could be hijacked if attacker controls the GitHub repo (impossible for our org) but defense-in-depth: only render `tag_name` as text, no clickable link in v4.5 | PROJECT.md out-of-scope: "In-app changelog or release notes display — too much surface area" — also covers no link rendering |
| Disabling TLS certificate validation for dev | Ships to production, MITM on api.github.com possible | Never use `HttpClientHandler { ServerCertificateCustomValidationCallback = ... }` — even in dev |
| Logging response body | Responses contain repo metadata that may be sensitive in private-repo scenarios | Don't log responses; silent-failure posture aligns with this anyway |
| Including settings.json contents in network request | None today; risk if future "telemetry on update check" feature added | Out of scope: don't send any user data with the check; pure GET request |
| Storing GitHub API token | Public repo doesn't need auth; rate limits at 60/hr unauthenticated, sufficient for once-per-launch | Don't add auth — adds risk with no benefit at this scale |
| Trusting `tag_name` as a path component | Nothing in v4.5 uses tag_name as a path; defense-in-depth: never concat into `Process.Start` etc. | Out of scope (no auto-update); but document the principle for future contributors |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Notice line color matches accent → blends with phrase, missed | User never notices update available | Same accent color is correct per design (PROJECT.md "Update notice line ... accent-colored"); rely on text content "vX.Y.Z available" being explicit; do NOT add red/yellow alert color |
| Notice line shown briefly then collapsed | User sees flicker on launch | Set `UpdateText.Visibility = Collapsed` initially in XAML; only flip to Visible after check completes (never the reverse) |
| Notice persists after user updates | User upgrades to v4.6.0 but cached state still shows "v4.6.0 available" | Once-per-launch invalidates this — every launch re-runs the comparison; running 4.6.0 vs latest 4.6.0 = no notice |
| Notice on dev/debug builds (Pitfall 9) | Dev sees confusing notices, screenshots polluted | `#if DEBUG` skip in service |
| Settings > Behavior toggle disables but old notice still visible | User toggles OFF, notice stays until next launch | Toggle handler hides notice immediately: `UpdateText.Visibility = Collapsed; SaveSettings();` |
| Notice appears under stats panel near bottom of widget | At small monitor heights, widget pushed off-screen (Pitfall 11) | Re-clamp after notice becomes visible |
| Phantom notice when GitHub API returns garbage | Parser fails → "v? available" rendered | Pitfall 7 + Pitfall 4 ensure parse failures → NoUpdate, no rendering |
| User clicks the notice expecting to download/install | No-op; user confused | Plain TextBlock (not Hyperlink); design intent per PROJECT.md "out of scope: in-app changelog or release notes display" — user opens browser themselves; if pressure mounts later, add a tray menu item, not a clickable widget element |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **HttpClient setup:** User-Agent header set (without it: 403 from GitHub on first call) — verify with handler-fake test asserting header
- [ ] **HttpClient setup:** Accept header `application/vnd.github+json` set (defends against future API version drift)
- [ ] **HttpClient setup:** `Timeout = 5s` set explicitly (default is 100s, far too long for once-per-launch)
- [ ] **CTS wiring:** Both timeout AND app-shutdown linked via `CreateLinkedTokenSource` — verify by cancelling app-shutdown CTS during in-flight call
- [ ] **Exception handling:** Specific catches (HttpRequestException, TaskCanceledException, OperationCanceledException, JsonException, FormatException, ArgumentException) — NOT `catch (Exception)` in service
- [ ] **Fire-and-forget boundary:** `try/catch (Exception)` at the kickoff site to prevent UnobservedTaskException
- [ ] **Version comparer:** Strip `v` prefix, strip `-...` pre-release, strip `+...` build metadata, pad major.minor to 3-component
- [ ] **Version comparer:** Returns null for unparseable input (silent failure honored)
- [ ] **Response handling:** 200 + non-JSON content-type → NoUpdate (HTML during outage)
- [ ] **Response handling:** 404 → NoUpdate (zero releases case)
- [ ] **Response handling:** 403 → NoUpdate (rate limit OR private repo)
- [ ] **Response handling:** `tag_name == null` or `tag_name == ""` → NoUpdate
- [ ] **AppSettings:** `UpdateChecksEnabled { get; init; } = true;` — explicit `= true`, NOT default-bool-false
- [ ] **AppSettings:** Round-trip test + absent-field test (mirrors STEST-08 pattern)
- [ ] **MainWindow:** UpdateText has `x:Name="UpdateText"` — reachable from code-behind
- [ ] **MainWindow:** UpdateText.Foreground set in BOTH ApplyTheme and ApplyDisplayColor
- [ ] **MainWindow:** Test asserting ApplyTheme/ApplyDisplayColor coverage parity
- [ ] **MainWindow:** Re-clamp after notice becomes visible (Pitfall 11)
- [ ] **MainWindow:** Fire-and-forget kickoff in `ContentRendered` (NOT App.OnStartup)
- [ ] **SettingsWindow:** Toggle persists immediately (matches Phase 78 immediate-persist pattern, not deferred)
- [ ] **SettingsWindow:** Toggle OFF immediately collapses UpdateText (do not wait for next launch)
- [ ] **SettingsWindow:** Reset to Defaults sets `UpdateChecksEnabled = true`
- [ ] **Dev-box:** `#if DEBUG return UpdateCheckResult.NoUpdate;` at top of `CheckAsync`
- [ ] **Dev-box:** csproj `<Version>` matches running tag — sanity check before commit (still stale at 3.6.0 in InformationalVersion, fix as part of milestone)
- [ ] **HttpClient seam:** Constructor accepts injected HttpClient (or HttpMessageHandler) for tests
- [ ] **Tests:** All Pitfall scenarios covered (per-pitfall test surface lists above)
- [ ] **Manual:** Verify on stock Windows 11 + Defender that no SmartScreen / firewall flag fires
- [ ] **Manual:** Verify on offline machine (disconnect WiFi) that app launches normally with no notice and no error
- [ ] **Manual:** Verify behavior when running newer-than-latest (e.g. running 4.5.0 with latest still 4.4.0) — no notice
- [ ] **Manual:** Verify behavior on first launch after fresh install of older version (running 4.4.0, latest is 4.5.0) — notice shows

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong notice shown on dev (Pitfall 9) | LOW | Add `#if DEBUG` guard; rebuild; verify next dev run shows no notice |
| Half-broken accent (Pitfall 10) | LOW | Add the missing `UpdateText.Foreground = brush;` line in the missed method; rebuild; verify with theme + auto-contrast tests |
| Off-screen widget at low monitor height (Pitfall 11) | LOW | Add `UpdateLayout(); ClampToScreen();` after Visibility set; rebuild |
| Settings toggle doesn't take effect (Pitfall 13) | LOW | Move the `_settings.UpdateChecksEnabled` check to the post-await point; rebuild |
| Default-false on upgrade (Pitfall 12) | MEDIUM | Add `= true` initializer; users who upgraded with the bug must toggle ON in Settings (or wait for v4.5.1); document in release notes |
| Process hangs on quit (Pitfall 5) | LOW | Wire CTS linking; rebuild; verify with rapid launch+quit |
| App crashes mid-check on UI thread (Pitfall 3) | LOW | Remove `.ConfigureAwait(false)` from integration code; rebuild |
| Process deadlock on launch (Pitfall 2) | LOW | Replace `.Result`/`.Wait()` with `_ = ...Async()` fire-and-forget; rebuild |
| First version shipped with reflection STJ, then trim attempted (Pitfall 8) | MEDIUM | Add JsonSerializerContext partial class; switch deserialize call to use TypeInfo; rebuild |
| Anti-virus / firewall blocks api.github.com on user machine | LOW (no app change) | Silent failure posture handles this; user sees no notice but app works normally; document FAQ entry |
| GitHub API returns unexpected schema in future | LOW | STJ ignores unknown fields by default; existing code is forward-compat |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. HttpClient lifetime | UPD-SVC | Constructor injection seam test; Dispose idempotent test |
| 2. Sync `.Result` deadlock | UPD-WIRE | DispatcherFrame integration test; manual launch smoke test |
| 3. ConfigureAwait(false) misuse | UPD-SVC + UPD-WIRE | Service tests on threadpool pass; integration tests on dispatcher pass |
| 4. Broad catch (Exception) | UPD-SVC | Per-exception unit tests (HttpRequestException, TaskCanceledException, JsonException, FormatException, ArgumentException, OperationCanceledException); negative test that OOM propagates |
| 5. CTS wiring | UPD-SVC | Cancel timeout CTS test; cancel app-shutdown CTS test; combined linked-CTS test |
| 6. Version compare foot-guns | UPD-VER | DataRow exhaustive test (10+ cases per table above) |
| 7. GitHub API quirks | UPD-SVC | Per-status-code fake handler tests (200/404/403/500/HTML); User-Agent header assertion |
| 8. STJ trim/AOT warnings | UPD-SVC | Source-generator JsonSerializerContext in service; build smoke check with PublishTrimmed=true (no IL2026) |
| 9. Dev-box version mismatch | UPD-SVC + UPD-VERIFY | `#if DEBUG` guard in service; manual verify dev runs show no notice |
| 10. ApplyTheme/ApplyDisplayColor coverage | UPD-WIRE | Coverage parity test (regex or Roslyn); manual: theme switch + auto-contrast switch both update UpdateText |
| 11. StatsPanel 8th-child off-screen | UPD-WIRE | Re-clamp test at low monitor height; manual: 720p test with widget at bottom |
| 12. AppSettings bool default-false on upgrade | UPD-SETT | Round-trip + absent-field tests (mirror STEST-08); manual upgrade test from v4.4 settings.json |
| 13. Settings toggle in-flight race | UPD-WIRE + UPD-SETT | Integration test: toggle OFF mid-check, verify Visibility=Collapsed |
| 14. HttpClient testability | UPD-SVC | All Pitfall 4/7 tests use the seam — proves seam works |
| 15. Startup paint blocking | UPD-WIRE | Stopwatch in test from start to ContentRendered, asserts <50ms add |
| 16. Antivirus / firewall | UPD-VERIFY | Manual on stock Windows 11; manual on offline machine |
| 17. UnobservedTaskException | UPD-WIRE | Service throws unexpected exception → fire-and-forget catch verified |

---

## Phase-Specific Warnings (Quick Reference for Roadmap)

| Phase | Likely Pitfalls | Mitigation |
|-------|----------------|------------|
| **UPD-VER** (Core version comparer) | 6 | Pure static class in `FuzzyClock.Core/UpdateVersionComparer.cs`; mirrors DateFormatter/UptimeFormatter pattern; 10+ DataRow tests covering all version-string variants |
| **UPD-SVC** (UpdateCheckService) | 1, 3, 4, 5, 7, 8, 9, 14 | HttpClient with User-Agent + 5s timeout; constructor injection seam; specific-exception catches; linked CTS pattern; STJ source generators; `#if DEBUG` skip; defensive content-type check |
| **UPD-WIRE** (MainWindow integration) | 2, 3, 10, 11, 13, 15, 17 | Fire-and-forget in `ContentRendered`; no `.Result`/`.Wait()`; both `ApplyTheme` and `ApplyDisplayColor` mutate `UpdateText.Foreground`; re-clamp after Visibility flip; live-read `_settings` at UI mutation point; outer `try/catch` at fire-and-forget boundary |
| **UPD-SETT** (SettingsWindow toggle) | 12, 13 | `UpdateChecksEnabled { get; init; } = true;` (explicit); immediate-persist pattern (Phase 78); collapse `UpdateText` immediately on toggle OFF; absent-field test (mirrors STEST-08) |
| **UPD-VERIFY** (human verify + release) | 9, 16 | Dev-box screenshot review; offline launch smoke; cross-version manual test (older + newer + equal); stock Windows 11 + Defender pass |

---

## Sources

- **System.Net.Http.HttpClient lifetime guidance** — `learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines` (HIGH — official)
- **GitHub REST API: releases/latest** — `docs.github.com/en/rest/releases/releases#get-the-latest-release` (HIGH — official: "The latest release is the most recent non-prerelease, non-draft release")
- **GitHub REST API: User-Agent requirement** — `docs.github.com/en/rest/overview/resources-in-the-rest-api#user-agent-required` (HIGH — official)
- **System.Text.Json source generation** — `learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation` (HIGH — official)
- **Async/await best practices in WPF** — Stephen Cleary's "Async and Await" series + MS docs; established invariants for ConfigureAwait(false) library/UI boundary (HIGH — Cleary is the canonical source)
- **TaskCanceledException vs OperationCanceledException for HttpClient.Timeout** — `learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.timeout` (HIGH — official; .NET 6+ exposes inner TimeoutException)
- **CancellationTokenSource.CreateLinkedTokenSource** — `learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtokensource.createlinkedtokensource` (HIGH — official)
- **System.Version semantics** — `learn.microsoft.com/en-us/dotnet/api/system.version` (HIGH — official; -1 sentinel behavior documented)
- **FuzzyClock PROJECT.md** — internal source of truth; verified patterns: STEST-02 (init default for bool), Phase 33 lesson (ApplyTheme/ApplyDisplayColor coverage), v1.1 (re-clamp invariant), TemperatureService (CTS-backed background task with timeout) — HIGH confidence (in-repo, verified)
- **FuzzyClock csproj inspection** — verified `<InformationalVersion>3.6.0</InformationalVersion>` is stale relative to `<Version>4.5.0</Version>`; verified no `PublishTrimmed`/`PublishAot` flags present (HIGH — direct file read)

---
*Pitfalls research for: GitHub Releases update-checker for FuzzyClock v4.5*
*Researched: 2026-05-29*
