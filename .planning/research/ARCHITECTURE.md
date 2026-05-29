# Architecture Research: v4.5 GitHub Releases Update Checker

**Domain:** Network-dependent service integration in pre-existing offline-first WPF widget (FuzzyClock)
**Researched:** 2026-05-29
**Confidence:** HIGH (every recommendation grounded in existing precedent already shipping in v4.2/v4.4)

---

## TL;DR (consumer-friendly summary)

| Question | Decision | One-line rationale |
|----------|----------|---------------------|
| 1. Service location | `FuzzyClock.App/UpdateCheckService.cs` | Mirrors TemperatureService — services with non-pure-logic dependencies (HttpClient, JSON parse, IO/network) live in App; Core stays pure-static and WPF-free. |
| 2. Pure helper | `FuzzyClock.Core/VersionComparer.cs` with `bool IsNewer(...)` and `Version? ParseTag(string)` | Pure static, deterministic, comprehensively unit-testable; isolates the only piece with non-trivial logic (tag-string normalization + comparison). |
| 3. Lifecycle / when to fire | Option **(d)**: deferred via `Dispatcher.BeginInvoke(... DispatcherPriority.ApplicationIdle)` from `MainWindow.ContentRendered` | First paint must never wait on a network call; `ContentRendered` already owns "after first frame" startup work; `ApplicationIdle` priority defers further until pump is quiet. |
| 4. UI update path | Option **(c)**: one-shot `Dispatcher.Invoke(UpdateUpdateNoticeDisplay)` from the service on completion | Once-per-launch — polling on stats tick is wasted CPU after the first hit; event subscription is heavier wiring for a single fire. |
| 5. Settings → service mid-session | Option **(b)**: hide notice **and** cancel any in-flight task | Keeps the silent-failure invariant clean (no notice flickers in after user opted out); CTS cancellation costs ~nothing and is the safe pattern. |
| 6. UpdateText placement | New 8th and final child of `StatsPanel`, immediately after `TempsText`. **Byte-for-byte clone** of `UptimeText`/`TempsText`: `Margin=0,2,0,0`, `FontFamily=Segoe UI Light`, `FontSize=11`, `Foreground=White` (design-time), `TextAlignment=Left`, `Text=""`, `Visibility=Visible`. | No styling differences. Stats line precedent is locked. |
| 7. ApplyTheme / ApplyDisplayColor | **Both** must add `UpdateText.Foreground = brush;` immediately after the `TempsText.Foreground = brush;` line in **both** methods. Phase 33 critical pattern enforced. | Hard-locked invariant — see `MainWindow.xaml.cs` lines 1918–1919 and 1956–1957 for the pattern. Missing either causes auto-contrast or theme switch to leave UpdateText stuck on `White`. |
| 8. Cancellation | Service-owned `CancellationTokenSource _cts`. Pass `_cts.Token` to `HttpClient.SendAsync`. `Dispose()` does `_cts?.Cancel(); _backgroundTask?.Wait(500ms); _cts?.Dispose();` guarded by `Interlocked.CompareExchange` on `int _disposed`. Wired to all three tiers (OnClosing, SessionEnding, ProcessExit). | Identical pattern to TemperatureService; reuse `DisposeXxxService()` external-entry-point shape. |
| 9. Test surface | Unit tests on `VersionComparer` only (deterministic). `UpdateCheckService` gets a small surface of integration-style tests (subclass seam à la `InitializeCore`) using `HttpMessageHandler` fake. `MainWindow` integration is human-verify. | Same split as TemperatureService: pure helpers in Core (8+ tests), service-shape tests in App (4–6), human-verify checklist for live network + UI. |
| 10. Reading running version | `Assembly.GetExecutingAssembly().GetName().Version` of `FuzzyClock.App` (the WinExe). Caveat: dev-box debug builds carry the **csproj-frozen** version (currently `4.5.0`). Treat dev-box mismatches as expected; CI tag-push pipeline overrides via `-p:AssemblyVersion=`. Production-only behavior — no special handling required. | Already verified — `release.yml` line 58 already injects `-p:AssemblyVersion=${{ steps.version.outputs.version }}.0` from the git tag, so production binaries always have the correct version. |

**Phase boundary recommendation:** **Single phase**, 3–4 plans. The work is small and tightly coupled. See [§ Phase Boundary](#phase-boundary-recommendation) below.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                            FuzzyClock.App                            │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │                          App.xaml.cs                           │   │
│ │  OnStartup → MainWindow.Show() → tier 2/3 dispose subscriptions│   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                  ▼                                    │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │                       MainWindow.xaml.cs                       │   │
│ │   ┌─────────────────────────┐  ┌───────────────────────────┐   │   │
│ │   │  ContentRendered:       │  │  _statsTimer.Tick lambda  │   │   │
│ │   │  Dispatcher.BeginInvoke │  │  UpdateStatsDisplay       │   │   │
│ │   │   (Idle, () =>          │  │  UpdateUptimeDisplay      │   │   │
│ │   │    _updateService       │  │  UpdateTempsDisplay       │   │   │
│ │   │      .CheckAsync())     │  │  (no UpdateUpdateNotice — │   │   │
│ │   │                         │  │   service fires it once   │   │   │
│ │   │                         │  │   on completion)          │   │   │
│ │   └─────────────────────────┘  └───────────────────────────┘   │   │
│ │   UpdateText.Foreground in ApplyTheme + ApplyDisplayColor      │   │
│ └────────────────────────────────────────────────────────────────┘   │
│   │                    │                    │                         │
│   ▼                    ▼                    ▼                         │
│ ┌────────────┐   ┌──────────────────┐   ┌──────────────────────┐     │
│ │ Settings   │   │ Temperature      │   │ ★ UpdateCheckService │     │
│ │ Service    │   │ Service          │   │ (NEW) HttpClient +    │     │
│ │ (existing) │   │ (existing v4.2)  │   │  JsonSerializer       │     │
│ └────────────┘   └──────────────────┘   │  + CTS dispose        │     │
│                                         └──────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (one HTTPS GET on launch)
                ┌─────────────────────────────────────────┐
                │  api.github.com/repos/{owner}/{repo}    │
                │  /releases/latest  (no auth required)   │
                └─────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                            FuzzyClock.Core                           │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │ ★ VersionComparer (NEW)                                    │      │
│  │   public static Version? ParseTag(string tag)              │      │
│  │   public static bool IsNewer(Version current, Version other)│     │
│  │   public static bool IsNewer(string currentRaw,            │      │
│  │                              string latestTag)             │      │
│  │   — Pure static. WPF-free. Net10.0. Fully unit-testable.   │      │
│  └────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| `FuzzyClock.Core/VersionComparer.cs` (NEW) | Tag-string parsing, version comparison — pure logic | `public static class`, no instance state, no I/O, no WPF |
| `FuzzyClock.App/UpdateCheckService.cs` (NEW) | HTTP fetch, JSON parse, sentinel state, CTS dispose, completion callback into UI | `internal class`, `IDisposable`, async init pattern (StatsService/TemperatureService parity), `internal virtual` seam for tests |
| `FuzzyClock.App/MainWindow.xaml` (MOD) | New `<TextBlock x:Name="UpdateText">` as 8th/last child of `StatsPanel` | Byte-for-byte UptimeText clone |
| `FuzzyClock.App/MainWindow.xaml.cs` (MOD) | Service construction, `ContentRendered` deferred fire, completion callback, `ApplyTheme`/`ApplyDisplayColor` coverage, `OnClosing` dispose, `OpenSettings` toggle hook | Mirrors `_temperatureService` patterns line-for-line |
| `FuzzyClock.App/AppSettings.cs` (MOD) | Add `UpdateChecksEnabled { get; init; } = true;` | Init-property record convention |
| `FuzzyClock.App/SettingsService.cs` (MOD) | `Defaults()` adds `UpdateChecksEnabled = true`. **No** `Validate()` guard needed (bool is safe — no zero-equivalent danger). | One-line addition |
| `FuzzyClock.App/SettingsWindow.xaml` (MOD) | New `<CheckBox x:Name="ChkUpdateChecksEnabled">` in Behavior tab | Mirrors `ChkAutoLaunchEnabled` markup |
| `FuzzyClock.App/SettingsWindow.xaml.cs` (MOD) | New `event Action<bool>? UpdateChecksEnabledChanged;`; `_suppressEvents` guard in `PopulateControls`; `Checked/Unchecked` handlers fire event | Mirrors `ChkAutoLaunchEnabled` event pattern |
| `FuzzyClock.App/App.xaml.cs` (MOD) | Tier-2 + tier-3 dispose: extend the existing `DisposeTemperatureService()` call sites to also call `DisposeUpdateCheckService()` | Two new lines (one in `SessionEnding`, one in `OnProcessExit`) |
| `FuzzyClock.Core.Tests/VersionComparerTests.cs` (NEW) | 12+ unit tests for `ParseTag` and `IsNewer` | MSTest 4.0.1, no WPF |
| `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs` (NEW) | Subclass-seam tests with fake HTTP behaviour | MSTest 4.0.1, net10.0-windows + UseWPF |

---

## File-By-File Integration Touchpoints

### 1. `FuzzyClock.Core/VersionComparer.cs` (NEW — pure helper)

```csharp
namespace FuzzyClock.Core;

/// <summary>
/// Pure static version comparison + GitHub release tag parsing.
/// Zero dependencies on WPF, HttpClient, or any platform code.
/// REL-03 invariant: this file references nothing outside System.
/// </summary>
public static class VersionComparer
{
    /// <summary>
    /// Parse a GitHub release tag like "v4.5.0", "4.5.0", "v4.5.0.0", "v4.5"
    /// into a System.Version. Returns null on any malformed input.
    /// Tolerates leading 'v'/'V', surrounding whitespace, and missing
    /// build/revision components (System.Version handles 2-, 3-, or 4-part).
    /// </summary>
    public static Version? ParseTag(string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag)) return null;
        var s = tag.Trim();
        if (s.Length > 0 && (s[0] == 'v' || s[0] == 'V')) s = s.Substring(1);
        return Version.TryParse(s, out var v) ? v : null;
    }

    /// <summary>True iff <paramref name="other"/> is strictly newer than <paramref name="current"/>.</summary>
    public static bool IsNewer(Version current, Version other) => other > current;

    /// <summary>
    /// Convenience overload: parse both, return false on any null.
    /// Returns false (not throw) so silent-failure posture is preserved at every layer.
    /// </summary>
    public static bool IsNewer(string? currentRaw, string? latestTag)
    {
        var c = ParseTag(currentRaw);
        var n = ParseTag(latestTag);
        if (c is null || n is null) return false;
        return IsNewer(c, n);
    }
}
```

Why these signatures:
- `ParseTag(string?)` returning `Version?` separates parsing from comparison and is easy to test in isolation.
- Two `IsNewer` overloads: the strongly-typed one is the primary; the string overload is what the service actually calls and bakes silent-failure-on-malformed-input into the helper.
- No `string` normalization beyond `Trim` + leading-`v` strip — anything else (e.g. "v4.5.0-rc.1") returns null and is treated as "no newer version" by the silent-failure rule. This matches the v4.5 milestone scope ("Pre-release / draft release detection — checker considers only published, non-prerelease tags").

### 2. `FuzzyClock.App/UpdateCheckService.cs` (NEW — network service)

Pattern lifted from `TemperatureService`:

```csharp
internal class UpdateCheckService : IDisposable
{
    // Tunables
    internal const int RequestTimeoutSeconds = 5;
    internal const string GitHubReleasesUrl =
        "https://api.github.com/repos/{owner}/FuzzyClock/releases/latest";
    private const string UserAgent = "FuzzyClock-UpdateCheck";

    // State
    private readonly HttpClient _http;
    private readonly Action<string?> _onResult;   // UI-thread completion callback
    private CancellationTokenSource? _cts = new();
    private int _disposed;
    public  string? LatestTag { get; private set; }
    public  bool    HasNewer  { get; private set; }   // current < latest
    public  bool    IsReady   { get; private set; }

    public UpdateCheckService(string runningVersion, Action<string?> onResult)
    {
        // onResult is invoked exactly once with either the latest tag string
        // (when newer) or null (no update / failure / cancelled). Caller is
        // responsible for marshalling to the UI thread inside onResult.
        _runningVersion = runningVersion;
        _onResult = onResult;

        var handler = new HttpClientHandler();   // production
        _http = new HttpClient(handler);
        _http.Timeout = TimeSpan.FromSeconds(RequestTimeoutSeconds);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
        _http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    }

    public Task CheckAsync() => CheckAsyncCore(_cts!.Token);

    // virtual seam for tests — production override of HttpClient handler is the
    // simplest extension point (TestableUpdateCheckService overrides this and
    // injects a mock HttpMessageHandler in the constructor).
    protected virtual async Task CheckAsyncCore(CancellationToken ct)
    {
        try
        {
            var json = await _http.GetStringAsync(GitHubReleasesUrl, ct).ConfigureAwait(false);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var tag = doc.RootElement.GetProperty("tag_name").GetString();
            LatestTag = tag;
            HasNewer  = FuzzyClock.Core.VersionComparer.IsNewer(_runningVersion, tag);
            IsReady   = true;
            _onResult(HasNewer ? tag : null);
        }
        catch
        {
            // Silent-failure per scope ("offline/rate-limited/malformed" all
            // produce zero visible feedback). _onResult never called on failure.
            IsReady = true;
        }
    }

    public void Dispose()
    {
        if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0) return;
        try { _cts?.Cancel(); } catch { }
        try { _cts?.Dispose(); } catch { }
        _cts = null;
        try { _http.Dispose(); } catch { }
    }
}
```

Three things to note vs. TemperatureService:
- **No background loop.** The whole service is one async call; once it completes, the service is dormant. CheckAsync resolves before the user can plausibly tab through Settings.
- **No IsReady gate on a re-check timer.** Once-per-launch — the whole reason `IsReady` exists is so the public API has the same shape as TemperatureService for symmetry, but nothing reads it. (Could be omitted; keeping it makes the test surface uniform.)
- **`Action<string?> _onResult` callback** is the once-on-completion path (option 4-c). The MainWindow constructs the service with `tag => Dispatcher.Invoke(() => UpdateUpdateNoticeDisplay(tag))`.

### 3. `FuzzyClock.App/MainWindow.xaml` (MOD)

Insert immediately after `TempsText` (line 297, between `</TextBlock>` and `</StackPanel>`):

```xml
<!-- Update notice — child of StatsPanel so it hides with stats.
     UpdateText.Visibility is driven by (UpdateChecksEnabled && newer-version-available).
     Service fires a single Dispatcher.Invoke completion callback with the new tag string.
     Clone of UptimeText/TempsText styling per the stats-line append pattern. -->
<TextBlock x:Name="UpdateText"
           Margin="0,2,0,0"
           Visibility="Collapsed"
           FontFamily="Segoe UI Light"
           FontSize="11"
           Foreground="White"
           Text=""
           TextAlignment="Left" />
```

Note: initial `Visibility="Collapsed"` (not `"Visible"` like TempsText) because there's no value to show until the network call resolves. Keeps the layout stable from first paint.

### 4. `FuzzyClock.App/MainWindow.xaml.cs` (MOD)

Six discrete edits:

1. **Field declaration** (near `_temperatureService` ~line 19):
   ```csharp
   private UpdateCheckService _updateCheckService = null!;
   ```

2. **Construction in `ContentRendered`** (after `_temperatureService = new TemperatureService();` ~line 194):
   ```csharp
   var runningVersion =
       System.Reflection.Assembly.GetExecutingAssembly()
           .GetName().Version?.ToString() ?? "0.0.0";
   _updateCheckService = new UpdateCheckService(
       runningVersion,
       tag => Dispatcher.Invoke(() => UpdateUpdateNoticeDisplay(tag)));

   // Defer until layout pump is idle — first paint must never wait on network.
   if (_settings.UpdateChecksEnabled)
   {
       Dispatcher.BeginInvoke(
           new Action(async () => await _updateCheckService.CheckAsync()),
           System.Windows.Threading.DispatcherPriority.ApplicationIdle);
   }
   ```

3. **New private method `UpdateUpdateNoticeDisplay`** (locate near `UpdateTempsDisplay` ~line 1189):
   ```csharp
   // v4.5 — Update notice render path.
   // Called once on service completion (Dispatcher.Invoke marshalled by the service).
   // Foreground is NOT touched here; that lives in ApplyTheme + ApplyDisplayColor.
   private void UpdateUpdateNoticeDisplay(string? newerTag)
   {
       if (!_settings.UpdateChecksEnabled || string.IsNullOrWhiteSpace(newerTag))
       {
           UpdateText.Visibility = Visibility.Collapsed;
           UpdateText.Text = "";
           return;
       }
       UpdateText.Text = $"{newerTag} available";   // GitHub tags already include 'v' prefix
       UpdateText.Visibility = Visibility.Visible;
   }
   ```

4. **`ApplyTheme` coverage** (after `TempsText.Foreground = brush;` ~line 1919):
   ```csharp
   UpdateText.Foreground = brush;   // v4.5 — Phase 33 critical pattern parity
   ```

5. **`ApplyDisplayColor` coverage** (after `TempsText.Foreground = brush;` ~line 1957):
   ```csharp
   UpdateText.Foreground = brush;   // v4.5 — Phase 33 critical pattern parity
   ```

6. **`OnClosing` dispose** (after `_temperatureService?.Dispose();` ~line 1437):
   ```csharp
   _updateCheckService?.Dispose();   // tier 1 of three-tier dispose
   ```

7. **External entry point for tiers 2/3** (after `DisposeTemperatureService` ~line 1445):
   ```csharp
   internal void DisposeUpdateCheckService() => _updateCheckService?.Dispose();
   ```

8. **`OpenSettings` event subscription** (after the `TempNvmeVisibleChanged` block ~line 770):
   ```csharp
   _settingsWindow.UpdateChecksEnabledChanged += v =>
   {
       _settings = _settings with { UpdateChecksEnabled = v };
       SaveSettings();
       if (!v)
       {
           // Cancel any in-flight check + hide the notice immediately.
           _updateCheckService?.Dispose();
           UpdateUpdateNoticeDisplay(null);
       }
       // Note: re-enabling mid-session does NOT re-fire the check —
       // once-per-launch is the documented invariant. Next launch picks it up.
   };
   ```

9. **`ResetToDefaults`** — append `UpdateChecksEnabled = true` to the `_settings with { ... }` initializer (mirrors how `TempsLineVisible = false` was added in 78-02).

### 5. `FuzzyClock.App/AppSettings.cs` (MOD)

One new init-property field, placed near the v4.4 fields:

```csharp
// v4.5 — once-per-launch GitHub release version check
public bool UpdateChecksEnabled { get; init; } = true;
```

Init default = `true` is **upgrade-safe**: bool absent from old settings.json → C# default `false`; explicit `= true` is required to make the v4.4 → v4.5 upgrade enable checking. (Same pattern as `UptimeVisible`, `GhostModeEnabled`, `UseCtrl`, `UseAlt`.)

### 6. `FuzzyClock.App/SettingsService.cs` (MOD)

`Defaults()` body — one new field-initializer:

```csharp
UpdateChecksEnabled = true,
```

`Validate()` — **no change required**. Bool fields don't need a guard (no zero-equivalent danger; corrupt JSON just deserializes as false, which is a survivable state — user sees no notice, can re-enable in Settings).

### 7. `FuzzyClock.App/SettingsWindow.xaml` (MOD)

Add a `<CheckBox>` in the Behavior tab. Mirror the existing `ChkAutoLaunchEnabled` markup byte-for-byte (margins, style, indentation). One new line; no panel restructure.

### 8. `FuzzyClock.App/SettingsWindow.xaml.cs` (MOD)

Three discrete edits, all mirroring the AutoLaunchEnabled pattern:

1. **Field/event declaration:**
   ```csharp
   public event Action<bool>? UpdateChecksEnabledChanged;
   ```
2. **`PopulateControls`** (inside the existing `_suppressEvents = true` block):
   ```csharp
   ChkUpdateChecksEnabled.IsChecked = snapshot.UpdateChecksEnabled;
   ```
3. **Click handlers (Checked/Unchecked):**
   ```csharp
   private void ChkUpdateChecksEnabled_Checked(object sender, RoutedEventArgs e)
       { if (!_suppressEvents) UpdateChecksEnabledChanged?.Invoke(true); }
   private void ChkUpdateChecksEnabled_Unchecked(object sender, RoutedEventArgs e)
       { if (!_suppressEvents) UpdateChecksEnabledChanged?.Invoke(false); }
   ```
4. **`SettingsSnapshot`** record — add `UpdateChecksEnabled` field.
5. **`MainWindow.GetCurrentSettingsSnapshot`** — add `UpdateChecksEnabled = _settings.UpdateChecksEnabled` mapping.

### 9. `FuzzyClock.App/App.xaml.cs` (MOD)

Two new lines, both in shutdown paths:

```csharp
// In SessionEnding (~line 78):
mw?.DisposeUpdateCheckService();

// In OnProcessExit (~line 93):
try { (MainWindow as MainWindow)?.DisposeUpdateCheckService(); } catch { }
```

---

## Architectural Patterns

### Pattern 1: Service-Singleton with Async Init + Three-Tier Dispose

**What:** Service owns its own state, exposes `IsReady`-style readiness flag, init runs off the constructor on a Task, dispose is single-entry-guarded by `Interlocked.CompareExchange` and called from three lifetime tiers.

**When to use:** Any service that holds an external resource (HTTP connection, hardware handle, file lock) that must be cleanly released regardless of how the app shuts down.

**Trade-offs:**
- ✅ Crash-safe, log-off-safe, force-kill-safe.
- ✅ Init never blocks UI thread.
- ⚠ Extra wiring complexity (3 dispose tiers vs. 1) — for a one-shot HTTP call this is conservative, but the precedent is locked and consistency wins.

**Example:** `TemperatureService.cs` lines 39–88 (state declarations + `InitializeAsync` + dispose). UpdateCheckService follows the same skeleton minus the background loop.

### Pattern 2: Pure-Static Helper in Core for Testability

**What:** Extract any non-trivial, deterministic logic into a pure static class in `FuzzyClock.Core` so it can be exercised by `FuzzyClock.Core.Tests` (net10.0 — no WPF).

**When to use:** When the logic has clear inputs and outputs and no platform/runtime side effects.

**Trade-offs:**
- ✅ Tests run in fractions of a second; no WPF dispatcher, no UI thread.
- ✅ Logic is reusable and reviewable in isolation.
- ⚠ Marshalling between Core types and WPF/HTTP types happens at the call site (e.g. `tag.ToString()`, `Version.Parse(...)`) — this is by design.

**Examples:** `UptimeFormatter`, `DateFormatter`, `TemperatureFormatter`, `PhraseWrapService`, `ContrastService`. `VersionComparer` joins this list.

### Pattern 3: Stats Line Append (Byte-for-Byte Clone)

**What:** New stats lines are appended as the next child of `StatsPanel` and clone the previous line's XAML byte-for-byte to maintain visual rhythm.

**When to use:** Any new bottom-of-widget single-line text element.

**Trade-offs:**
- ✅ Zero design re-thinking; users get visual consistency for free.
- ✅ ApplyTheme/ApplyDisplayColor coverage is mechanical (one new line in each).
- ⚠ Drift risk: if you forget either coverage line, the new TextBlock is stuck on White.

**Example:** `TempsText` was a clone of `UptimeText` in v4.2 Phase 79. `UpdateText` is a clone of `TempsText` in v4.5.

### Pattern 4: Deferred Startup Work (`Dispatcher.BeginInvoke` at `ApplicationIdle`)

**What:** Defer non-essential startup work past `ContentRendered` to a moment when the dispatcher pump is quiet.

**When to use:** Anything that doesn't need to run before first paint and could plausibly take >100ms. Network calls, optional file I/O, telemetry.

**Trade-offs:**
- ✅ First paint is never gated on a slow operation.
- ✅ Composes naturally with WPF lifetime — no manual timer needed.
- ⚠ "Idle" is best-effort; on a busy machine this could push the call out by hundreds of ms — fine for a once-per-launch update check.

**Example reference:** `Dispatcher.BeginInvoke(action, DispatcherPriority.ApplicationIdle)` in WPF docs. Not currently used in FuzzyClock — this is a new pattern introduced for v4.5.

### Pattern 5: Once-on-Completion Callback (vs. Polling, vs. Event)

**What:** Service receives an `Action<T>` callback in its constructor and invokes it once when its async work completes. Caller marshals to UI thread inside the callback.

**When to use:** Single-fire async work where the caller needs to be notified exactly once.

**Trade-offs:**
- ✅ Lighter than `event` (one subscriber, no `+=` plumbing).
- ✅ Lighter than polling (no wasted timer ticks after the result lands).
- ⚠ Caller is responsible for thread marshalling — easy to get wrong; mitigation is to put a `Dispatcher.Invoke` wrapper in the lambda passed at construction time.

---

## Data Flow

### Launch-Time Flow (Happy Path)

```
[App.OnStartup]
    │
    ▼
[MainWindow constructor + ApplySettings + SetInitialPhrase + Show]
    │
    ▼
[MainWindow.ContentRendered]
    │
    ├─ _statsService = new StatsService()
    ├─ _temperatureService = new TemperatureService()  (existing)
    ├─ _updateCheckService = new UpdateCheckService(runningVersion, callback)  (NEW)
    │
    ├─ if (_settings.UpdateChecksEnabled)
    │     Dispatcher.BeginInvoke(  ← deferred past first paint
    │         () => _updateCheckService.CheckAsync(),
    │         DispatcherPriority.ApplicationIdle)
    │
    └─ [first frame painted — widget visible]
                                │
                                ▼ (some ms later, idle)
              [UpdateCheckService.CheckAsync]
                  HttpClient.GetStringAsync(.../releases/latest)
                                │
                                ▼ (~100ms-5s later)
              [JsonDocument.Parse → tag_name]
              VersionComparer.IsNewer(running, tag) ? tag : null
                                │
                                ▼ (callback)
              Dispatcher.Invoke(() => UpdateUpdateNoticeDisplay(tag))
                                │
                                ▼
              UpdateText.Text = "v4.6.0 available"
              UpdateText.Visibility = Visible
```

### Settings Toggle (Mid-Session)

```
User unchecks "Check for updates on launch"
    │
    ▼
SettingsWindow.ChkUpdateChecksEnabled_Unchecked
    │
    ▼
event UpdateChecksEnabledChanged(false)
    │
    ▼
MainWindow handler:
    _settings = _settings with { UpdateChecksEnabled = false }
    SaveSettings()
    _updateCheckService?.Dispose()    ← cancels in-flight CTS
    UpdateUpdateNoticeDisplay(null)   ← hides the notice immediately
```

### Shutdown Flow (All Three Tiers)

```
Tier 1: Window.Closing   →  MainWindow.OnClosing  →  _updateCheckService?.Dispose()
Tier 2: SessionEnding    →  App handler           →  mw?.DisposeUpdateCheckService()
Tier 3: ProcessExit      →  App.OnProcessExit     →  (MainWindow as MainWindow)?.DisposeUpdateCheckService()
```

`Interlocked.CompareExchange(ref _disposed, 1, 0)` makes all three calls safe — only the first wins; the other two short-circuit.

---

## Test Surface

### `FuzzyClock.Core.Tests/VersionComparerTests.cs` — 13 tests

Pure-helper tests (deterministic, fast):

| # | Test name | Verifies |
|---|-----------|----------|
| 1 | `ParseTag_WithVPrefix_ReturnsVersion` | `"v4.5.0"` → `Version(4,5,0)` |
| 2 | `ParseTag_WithoutVPrefix_ReturnsVersion` | `"4.5.0"` → `Version(4,5,0)` |
| 3 | `ParseTag_WithCapitalVPrefix_ReturnsVersion` | `"V4.5.0"` → `Version(4,5,0)` |
| 4 | `ParseTag_WithFourComponents_ReturnsVersion` | `"v4.5.0.0"` → `Version(4,5,0,0)` |
| 5 | `ParseTag_WithTwoComponents_ReturnsVersion` | `"v4.5"` → `Version(4,5)` |
| 6 | `ParseTag_WithSurroundingWhitespace_ReturnsVersion` | `"  v4.5.0\n"` → `Version(4,5,0)` |
| 7 | `ParseTag_WithPrereleaseSuffix_ReturnsNull` | `"v4.5.0-rc.1"` → `null` (silent-failure scope) |
| 8 | `ParseTag_WithJunk_ReturnsNull` | `"not-a-version"` → `null` |
| 9 | `ParseTag_WithEmptyString_ReturnsNull` | `""` → `null` |
| 10 | `ParseTag_WithNull_ReturnsNull` | `null` → `null` |
| 11 | `IsNewer_WhenLatestIsNewer_ReturnsTrue` | `4.5.0` vs `4.5.1` → `true` |
| 12 | `IsNewer_WhenLatestIsSame_ReturnsFalse` | `4.5.0` vs `4.5.0` → `false` |
| 13 | `IsNewer_WhenLatestIsOlder_ReturnsFalse` | `4.5.1` vs `4.5.0` → `false` |
| 14 | `IsNewer_WhenStringOverloadGetsNull_ReturnsFalse` | `IsNewer("4.5.0", null)` → `false` |
| 15 | `IsNewer_WhenStringOverloadGetsJunk_ReturnsFalse` | `IsNewer("4.5.0", "garbage")` → `false` |
| 16 | `IsNewer_AcrossMajorBoundary_ReturnsTrue` | `4.5.0` vs `5.0.0` → `true` |
| 17 | `IsNewer_DotZeroVsThreePart_HandlesCorrectly` | `Version(4,5)` vs `Version(4,5,0)` — confirm System.Version semantics |

### `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs` — 6 tests

Service-shape tests using a `TestableUpdateCheckService` subclass with overridden `CheckAsyncCore` (à la `TestableTemperatureService`):

| # | Test name | Verifies |
|---|-----------|----------|
| 1 | `Construction_NeverThrows` | Constructor returns immediately even with malformed running version |
| 2 | `CheckAsync_OnSuccess_InvokesCallbackWithTag` | Mock returns `{"tag_name":"v4.6.0"}` → callback receives `"v4.6.0"` |
| 3 | `CheckAsync_OnSuccessButNotNewer_InvokesCallbackWithNull` | Mock returns same version → callback receives `null` |
| 4 | `CheckAsync_OnHttpException_DoesNotInvokeCallback` | Mock throws `HttpRequestException` → callback never invoked |
| 5 | `CheckAsync_OnMalformedJson_DoesNotInvokeCallback` | Mock returns `"not-json"` → callback never invoked |
| 6 | `Dispose_IsIdempotent` | Three sequential `Dispose()` calls — only first cancels CTS, others no-op |
| 7 | `Dispose_CancelsInFlightCheck` | CheckAsync started, Dispose called, callback never fires (CTS short-circuit) |

### `AppSettings` JSON round-trip — 2 additional tests

| # | Test name | Verifies |
|---|-----------|----------|
| 1 | `Roundtrip_IncludesUpdateChecksEnabled` | Serialize → deserialize preserves the bool |
| 2 | `Deserialize_AbsentField_DefaultsTrue` | Old v4.4 settings.json (no field) → init default `true` |

### Human-Verify (live network + UI)

- Out-of-the-box launch on a machine where the live GitHub `latest` is newer than the running build → notice line appears within seconds, accent-colored, byte-for-byte UptimeText/TempsText style.
- Same launch with `UpdateChecksEnabled = false` in settings.json → no notice ever appears.
- Toggle Settings checkbox OFF after the notice appeared → notice disappears within one frame.
- Toggle airplane mode ON, restart app → no notice (silent failure).
- Toggle Auto-Contrast on/off with notice visible → UpdateText switches to black/white correctly (Phase 33 critical pattern verification).

---

## Phase Boundary Recommendation

**Recommendation: ONE phase, 3–4 plans.**

The work is small, tightly scoped, and additive. Splitting into two phases adds milestone overhead without giving any natural seam.

Suggested plan breakdown for the single phase:

| Plan | Focus | Files touched |
|------|-------|----------------|
| Plan-01 | Core helper + tests (RED→GREEN, no UI) | `FuzzyClock.Core/VersionComparer.cs`, `FuzzyClock.Core.Tests/VersionComparerTests.cs` |
| Plan-02 | UpdateCheckService + AppSettings + service tests | `FuzzyClock.App/UpdateCheckService.cs`, `FuzzyClock.App/AppSettings.cs`, `FuzzyClock.App/SettingsService.cs`, `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs` (settings round-trip + service shape) |
| Plan-03 | UI wiring + Settings tab + dispose tiers | `MainWindow.xaml`, `MainWindow.xaml.cs`, `SettingsWindow.xaml`, `SettingsWindow.xaml.cs`, `App.xaml.cs` |
| Plan-04 | Human-verify + closeout | (no code) — checklist run on dev box, a tagged production build with newer GitHub release for end-to-end verification |

Build order is enforced by C# project references: Core → App → tests. Plan-01 must land before Plan-02 (App.csproj references Core). Plan-02 must land before Plan-03 (MainWindow references the service). Plan-04 has no code.

If yolo mode wants to compress: Plan-01 + Plan-02 can land in a single commit set since they're separate files; Plan-03 is the only non-trivial integration.

---

## Anti-Patterns

### Anti-Pattern 1: Synchronous Network Call Anywhere on UI Thread

**What people do:** Call `httpClient.GetStringAsync(...).Result` or `httpClient.GetString(...)` on the UI thread.
**Why it's wrong:** Deadlocks on WPF dispatcher; blocks first paint for up to 5s on slow networks.
**Do this instead:** Always `await ... .ConfigureAwait(false)` inside a method that was itself fired from `Dispatcher.BeginInvoke` (which moves the synchronization context off the UI thread for the await suspension).

### Anti-Pattern 2: Putting the Network Service in Core

**What people do:** "HttpClient is BCL, it's portable, put it in Core."
**Why it's wrong:** Inconsistent with FuzzyClock's established discipline (`StatsService`, `TemperatureService`, `MonitorService`, `AutoLaunchService`, `ContrastSamplerService` all live in App). Also: the service has UI-thread marshalling concerns (`Dispatcher.Invoke` callback) that pull in WPF; trying to keep that in Core would force an awkward callback contract and split logic across assemblies.
**Do this instead:** Service in App. Pure helper (`VersionComparer`) in Core. Same line as TemperatureService vs. TemperatureFormatter.

### Anti-Pattern 3: Polling on Stats Timer for One-Shot Result

**What people do:** Read `_updateCheckService.LatestTag` every stats tick (1s–10s cadence) like `UpdateTempsDisplay` does.
**Why it's wrong:** TemperatureService is **continuously** polled because temps change every tick; UpdateCheckService fires **once** then is dormant for the rest of the session. Polling wastes a few CPU cycles per tick for the 99.99% of the session after the result has landed.
**Do this instead:** Once-on-completion callback (option 4-c). Service does `_onResult(tag)` exactly once; UI updates exactly once; nothing reads the service state on the timer tick.

### Anti-Pattern 4: Showing a "Check Failed" Indicator

**What people do:** Render a red exclamation point or "could not check" message when the network call fails.
**Why it's wrong:** Out of scope (`Failure indicator on the widget — silent failure posture`). Conflicts with FuzzyClock's "minimal footprint" design ethos.
**Do this instead:** On any failure path, do not invoke the completion callback — UpdateText stays Collapsed.

### Anti-Pattern 5: Re-Firing Check When User Re-Enables Mid-Session

**What people do:** When `UpdateChecksEnabledChanged(true)` fires, immediately call `_updateCheckService.CheckAsync()` again.
**Why it's wrong:** The scope says **once-per-launch**. Re-firing on toggle adds complexity and could hammer the GitHub API in a checkbox-flicking session. Also: the service was just disposed when the user disabled it — to re-fire we'd have to re-construct, which is more wiring.
**Do this instead:** Toggle ON mid-session is a no-op (cosmetic state only). Persisted ON setting takes effect at next launch.

### Anti-Pattern 6: Using `WebClient` or `HttpWebRequest`

**What people do:** Reach for `WebClient.DownloadString` because it's "simpler".
**Why it's wrong:** Both are deprecated in modern .NET. `HttpClient` is the supported BCL HTTP client.
**Do this instead:** `HttpClient` with explicit `Timeout`, `User-Agent`, `Accept` header — see service code above.

### Anti-Pattern 7: Forgetting the User-Agent Header

**What people do:** `new HttpClient().GetStringAsync("https://api.github.com/...")` with no User-Agent.
**Why it's wrong:** GitHub's API requires a User-Agent header; requests without one return 403.
**Do this instead:** `_http.DefaultRequestHeaders.UserAgent.ParseAdd("FuzzyClock-UpdateCheck");`

### Anti-Pattern 8: Hard-Coding the GitHub Repo URL

**What people do:** Inline the repo URL in three places (service, tests, README).
**Why it's wrong:** Refactoring nightmare; tests can't override; repo path lives in CI but isn't a single source of truth in the app.
**Do this instead:** Single `internal const string GitHubReleasesUrl` in the service. Tests use the subclass seam, not URL injection.

### Anti-Pattern 9: Skipping the Three-Tier Dispose

**What people do:** Dispose in `OnClosing` only; assume that's enough.
**Why it's wrong:** `OnClosing` doesn't fire on Windows log-off, shutdown, or task-manager kill. `HttpClient` has its own connection-pool teardown; CTS leaks on force-kill leak handles.
**Do this instead:** Mirror TemperatureService — three tiers, Interlocked-guarded.

### Anti-Pattern 10: Not Marshalling Back to UI Thread in the Callback

**What people do:** `_onResult(tag)` from inside the async method — runs on a thread-pool thread; touching `UpdateText.Text` from there throws `InvalidOperationException` (cross-thread access).
**Why it's wrong:** WPF UI elements are thread-affine.
**Do this instead:** Caller wraps the callback in `Dispatcher.Invoke`: `tag => Dispatcher.Invoke(() => UpdateUpdateNoticeDisplay(tag))`.

---

## Common Mistakes Specific to Adding a Network-Dependent Service to a Pre-Existing Offline-First Widget

These are the integration pitfalls (network code itself is in PITFALLS.md):

1. **Letting startup paint slip behind the network call.** Trap: putting `await CheckAsync()` directly inside `ContentRendered`. Fix: `Dispatcher.BeginInvoke` with `ApplicationIdle` priority.

2. **Forgetting that "silent failure" cuts both ways.** Trap: testing only the success path on a dev machine with internet, then shipping; first user without internet sees ugly errors in Visual Studio output window because of unhandled exceptions inside the catch block. Fix: catch must be fully empty; no `Console.WriteLine`, `Debug.WriteLine`, or `EventLog`.

3. **Shipping with debug-only HttpClient handler instrumentation.** Trap: leaving a `LoggingHandler` wrapper in the production HttpClient construction. Fix: production `HttpClientHandler` only; test seam is the subclass override.

4. **Not freezing the running version at startup.** Trap: re-reading `Assembly.GetExecutingAssembly().GetName().Version` on every check. Fix: capture once at service construction and cache as `_runningVersion`.

5. **Shipping the service when its repo string still says `{owner}`.** Trap: forgetting to fill in the actual GitHub owner/repo before tagging. Fix: review `GitHubReleasesUrl` constant before phase close-out; CI gate (grep) is overkill for a one-time check but a unit test that the URL contains "github.com/" and not "{owner}" is cheap insurance.

6. **Not exercising the OnClosing dispose path.** Trap: a CTS that's never cancelled because the user clicks the X-button → silent thread leak (background pool thread blocked on TLS handshake). Fix: tier-1 dispose verified via `Dispose_CancelsInFlightCheck` test.

7. **Ignoring that LHM/HttpClient connection pools share the System.Net.Http stack.** Trap: assuming `HttpClient.Dispose()` is fast — it isn't on a half-open connection. Fix: use `_cts.Cancel()` first, then `Dispose()`; the cancellation aborts the pending TLS handshake immediately.

8. **Loading network code into Core to "make it testable" via DI.** Trap: introducing an `IHttpClient` interface in Core, dragging `System.Net.Http` references into a project that's currently dependency-free. Fix: subclass seam in App is the precedent (`TestableTemperatureService.InitializeCore`); follow it.

9. **Putting the deferred fire in the constructor instead of ContentRendered.** Trap: `Dispatcher.BeginInvoke` from MainWindow constructor — the dispatcher exists but ContentRendered hasn't fired, so the work runs **before** first paint, defeating the point. Fix: defer **inside** ContentRendered, post-`new TemperatureService()` line, mirror Temps service ordering.

10. **Forgetting to fold the new field into `ResetToDefaults`.** Trap: Reset to Defaults restores all behavior bools except this one — confusing for users, drift risk over time. Fix: `ResetToDefaults` plan-03 checklist item; mirrors `TempsLineVisible` reset pattern from 78-02.

11. **Not testing the upgrade path.** Trap: shipping a v4.5 binary that, when run with a v4.4 settings.json, defaults `UpdateChecksEnabled` to `false` (because bool absent → C# default). Fix: explicit `= true` init default + the absent-field round-trip test (STEST-08 pattern).

12. **Tagging UpdateText.Foreground as "obviously themed" and skipping ApplyDisplayColor.** Trap: only adding the line to `ApplyTheme`; auto-contrast then leaves UpdateText stuck on accent color over light backgrounds. Fix: Phase 33 critical pattern is **both** methods always.

---

## Integration Points Summary (for Roadmapper)

### New files
- `FuzzyClock.Core/VersionComparer.cs`
- `FuzzyClock.Core.Tests/VersionComparerTests.cs`
- `FuzzyClock.App/UpdateCheckService.cs`
- `FuzzyClock.App.Tests/UpdateCheckServiceTests.cs`

### Modified files
- `FuzzyClock.App/AppSettings.cs` — one new init-property
- `FuzzyClock.App/SettingsService.cs` — `Defaults()` adds field; no `Validate()` change
- `FuzzyClock.App/MainWindow.xaml` — one new `<TextBlock>`
- `FuzzyClock.App/MainWindow.xaml.cs` — 8 discrete edits (field, ContentRendered, callback method, ApplyTheme line, ApplyDisplayColor line, OnClosing dispose, external dispose entry point, OpenSettings hook, ResetToDefaults field)
- `FuzzyClock.App/SettingsWindow.xaml` — one new `<CheckBox>`
- `FuzzyClock.App/SettingsWindow.xaml.cs` — event, PopulateControls field, two click handlers, snapshot field
- `FuzzyClock.App/App.xaml.cs` — two dispose-tier wiring lines

### Build order
1. `FuzzyClock.Core/VersionComparer.cs` + Core tests
2. `FuzzyClock.App/AppSettings.cs` + `FuzzyClock.App/SettingsService.cs`
3. `FuzzyClock.App/UpdateCheckService.cs` + App service tests
4. `FuzzyClock.App/MainWindow.xaml(.cs)` UI integration
5. `FuzzyClock.App/SettingsWindow.xaml(.cs)` settings integration
6. `FuzzyClock.App/App.xaml.cs` shutdown wiring
7. Human-verify checklist

### Estimated diff size
- ~150 lines new code in `VersionComparer.cs` (with XML doc comments)
- ~100 lines new code in `UpdateCheckService.cs`
- ~30 lines spread across MainWindow / SettingsWindow / AppSettings / App
- ~200 lines of unit tests

Total: roughly 500 lines of net-new content, none of it touching existing critical-path code paths in a way that risks regression. The append-only patterns (XAML stats line, MainWindow handler list, App.xaml.cs dispose) are the lowest-risk integration shape FuzzyClock has.

---

## Sources

- TemperatureService precedent: `FuzzyClock.App/TemperatureService.cs` (HIGH confidence — read in full)
- Stats line append precedent: `FuzzyClock.App/MainWindow.xaml` lines 286–298 (TempsText) (HIGH)
- ApplyTheme/ApplyDisplayColor critical-pattern lines: `FuzzyClock.App/MainWindow.xaml.cs` 1918–1919 + 1956–1957 (HIGH)
- App lifecycle + three-tier dispose: `FuzzyClock.App/App.xaml.cs` lines 73–94 (HIGH)
- Settings event/snapshot pattern: `FuzzyClock.App/MainWindow.xaml.cs` 738–771 (Temps event subscriptions) (HIGH)
- AppSettings init-property pattern + upgrade safety: `FuzzyClock.App/AppSettings.cs` lines 49–63 + decision log entry "GhostFadeRadiusPx init-property with = 80" (HIGH)
- Pure-static helper precedent: `FuzzyClock.Core/TemperatureFormatter.cs` (HIGH)
- Test split convention: `FuzzyClock.Core.Tests` (net10.0) vs. `FuzzyClock.App.Tests` (net10.0-windows + UseWPF) — confirmed in MEMORY.md (HIGH)
- CI version override: `.github/workflows/release.yml` line 58 `-p:AssemblyVersion=${{ steps.version.outputs.version }}.0` (HIGH)
- Dispatcher.BeginInvoke + DispatcherPriority.ApplicationIdle: official MSDN docs (MEDIUM — pattern is well-known but not previously used in this codebase)
- GitHub API User-Agent requirement: GitHub REST API docs at https://docs.github.com/en/rest/overview/resources-in-the-rest-api#user-agent-required (MEDIUM)
- WPF cross-thread access exception (`InvalidOperationException`): well-established WPF rule (HIGH)

---

*Architecture research for: v4.5 Update Checker integration into FuzzyClock*
*Researched: 2026-05-29*
