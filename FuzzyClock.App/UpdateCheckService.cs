// Source: BCL HttpClient + SocketsHttpHandler.PooledConnectionLifetime
//   https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler.pooledconnectionlifetime
// Source: BCL CancellationTokenSource.CreateLinkedTokenSource
//   https://learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtokensource.createlinkedtokensource
// Source: System.Text.Json source generation
//   https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation
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
using FuzzyClock.Core;

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

    private int _disposed;   // Interlocked guard (mirrors TemperatureService._disposed)

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
        // DEV-02: Assembly.GetName().Version (NOT AssemblyInformationalVersion).
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
        // UPD-07: narrow catches ONLY. Order matters — TaskCanceledException is a
        // subclass of OperationCanceledException; catch the more-derived first.
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
        // Mirrors TemperatureService.Dispose verbatim (FuzzyClock.App/TemperatureService.cs:281-300).
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
