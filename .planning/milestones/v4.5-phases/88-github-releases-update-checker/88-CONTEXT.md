# Phase 88: GitHub Releases Update Checker - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a once-per-launch GitHub Releases update check that renders an accent-colored "vX.Y.Z available" notice as the new 8th/last child of the widget's StatsPanel (immediately below `TempsText`), backed by:

- A pure version-comparison helper in `FuzzyClock.Core` (`UpdateVersionComparer.TryParseTag` / `IsNewer`)
- A new `UpdateCheckService` in `FuzzyClock.App` (long-lived static `HttpClient`, 5s linked CTS, source-gen `JsonSerializerContext`, narrow exception set, `#if DEBUG` skip, three-tier dispose mirroring `TemperatureService`)
- A new `UpdateText` TextBlock in `MainWindow.xaml`/`.cs` participating in the Phase 33 dual-path (`ApplyTheme` + `ApplyDisplayColor`) and re-clamp on visibility flip
- A new `AppSettings.UpdateChecksEnabled = true` init field with JSON round-trip + absent-field tests
- A new `ChkUpdateChecksEnabled` checkbox in the Settings → Behavior tab cloning the existing `ChkAutoLaunchEnabled` shape
- One-line csproj `<InformationalVersion>` sync (3.6.0 → 4.5.0) and `Assembly.GetName().Version` as the canonical running-version source
- A README mention of the notice line and the Settings toggle

Out of scope for this phase (carried forward to v4.6+ or explicitly rejected by the milestone Out-of-Scope table): auto-update flow, click-to-open, manual "Check now", pre-release/beta channel, dismiss/snooze, polling, telemetry, configurable repo URL, OAuth, ETag conditional GETs, third-party SDKs, in-app changelog viewer, failure indicator UI.

</domain>

<decisions>
## Implementation Decisions

### Repo URL
- `internal const string RepoUrl = "https://api.github.com/repos/atabisz/FuzzyStatsClock/releases/latest";` — confirmed against live `git remote get-url origin` (REQUIREMENTS.md placeholder `{owner}/FuzzyClock` was generic; actual repo is `atabisz/FuzzyStatsClock`)
- Hard-coded as `internal const`, never read from `settings.json` (UPD-10 — security: prevents redirect-via-malicious-settings)

### Plan Split (4 plans)
- **88-01** — `UpdateVersionComparer` Core helper + tests (`FuzzyClock.Core/UpdateVersionComparer.cs` + ~13–17 DataRow rows in `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs`)
- **88-02** — `UpdateCheckService` + `AppSettings.UpdateChecksEnabled = true` init field + ~6–8 service-shape tests via `FakeHttpMessageHandler` seam + `<InformationalVersion>` sync (3.6.0 → 4.5.0)
- **88-03** — UI wiring (`UpdateText` TextBlock, `ContentRendered` kickoff, `ApplyTheme` + `ApplyDisplayColor` dual-path, re-clamp, mid-session CTS cancel, `OpenSettings` event subscription, `ResetToDefaults` reset) + `SettingsWindow` Behavior tab checkbox + `App.xaml.cs` `SessionEnding` + `OnProcessExit` dispose tiers
- **88-04** — Human-verify checklist + close-out + README pass

Each plan is RED→GREEN with atomic commits. Plan boundaries are also natural seams for `/gsd:execute-phase` wave parallelization (none here — strict sequential dependency: Core helper → service → UI).

### Service Shape
- Long-lived static `HttpClient` (single instance per process); `SocketsHttpHandler.PooledConnectionLifetime = 15min`
- `Timeout = TimeSpan.FromSeconds(5)` set on the `HttpClient` instance + per-call `CancellationTokenSource.CancelAfter(5s)` linked to a service-owned shutdown CTS via `CreateLinkedTokenSource` — both gates so app shutdown unwinds in ms
- Required headers per GitHub API conventions: `User-Agent: FuzzyClock/{AssemblyVersion}` and `Accept: application/vnd.github+json`
- Source-gen `JsonSerializerContext` for `GitHubRelease` POCO (fields: `tag_name`, `prerelease`, `draft`); no reflection deserialization
- Narrow catch set ONLY: `HttpRequestException`, `TaskCanceledException`, `OperationCanceledException`, `JsonException`, `FormatException`, `ArgumentException`. Never `catch (Exception)`. On any catch: returns `Version?` = null
- `#if DEBUG` skip: method body returns null at the very top in DEBUG builds (prevents dev screenshots showing nonsensical "vX.Y.Z available" notices). Service-shape test in `FuzzyClock.App.Tests` verifies the DEBUG-config null return as the natural test-runtime assertion (DEV-03)

### Dispose Pattern (mirrors TemperatureService)
- `int _disposed` field guarded by `Interlocked.CompareExchange` for idempotence
- Three-tier registration: `MainWindow.OnClosing` (tier 1), `App.SessionEnding` (tier 2), `AppDomain.CurrentDomain.ProcessExit` (tier 3)
- Mid-session toggle OFF cancels the in-flight CTS immediately (PERS-10) — the active CTS is held in a service field; toggling back ON mid-session is a no-op (next-launch only invariant)

### UI / Phase 33 Dual-Path
- `UpdateText` is the 8th and final child of `StatsPanel`, immediately below `TempsText`
- Styling cloned byte-for-byte from `TempsText`/`UptimeText`: `Margin="0,2,0,0"`, `FontFamily="Segoe UI Light"`, `FontSize="11"`, `TextAlignment="Left"`, design-time `Foreground="White"`, `Text=""`
- `Visibility = Collapsed` by default; flips to `Visible` only when service callback returns a tag whose parsed `Version` is strictly newer than `Assembly.GetExecutingAssembly().GetName().Version`
- `Foreground = brush;` set in BOTH `ApplyTheme` AND `ApplyDisplayColor` (same Phase 33 critical pattern as `TempsText`)
- 100% accent (full alpha) — DateText's 55% (0x8C) muted treatment is NOT applied here
- On visibility flip → `Visible`: re-call existing `SettingsService.Clamp` with current `Left`/`Top` so a near-edge widget doesn't clip the new line off-screen (UI-05)

### Kickoff Path
- `Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, async () => { ... })` from `MainWindow.ContentRendered` — first paint never gated on network call dispatch
- Outer `try { } catch (Exception) { }` at the kickoff boundary as defense in depth (the service already catches narrow exceptions, but `TaskScheduler.UnobservedTaskException` from the fire-and-forget edge stays silenced)
- Service callback marshals to UI thread via `Dispatcher.Invoke` before touching `UpdateText.Text` or `.Visibility`
- When `_settings.UpdateChecksEnabled == false` at launch: service constructed and registered for dispose, but no kickoff `BeginInvoke` is scheduled

### Settings Plumbing
- `bool UpdateChecksEnabled { get; init; } = true;` on `AppSettings` record — explicit `= true` mandatory for absent-field upgrade safety
- `SettingsService.Defaults()` returns `UpdateChecksEnabled = true`
- `SettingsService.Validate()` requires no new guard (bool cannot be invalid)
- `SettingsSnapshot` gains `UpdateChecksEnabled` bool; `MainWindow.GetCurrentSettingsSnapshot()` populates from `_settings.UpdateChecksEnabled`
- New `<CheckBox x:Name="ChkUpdateChecksEnabled">` in `SettingsWindow.xaml` Behavior tab with label `Check for updates on launch` — clones `ChkAutoLaunchEnabled` placement and styling
- `event Action<bool>? UpdateChecksEnabledChanged;` fired from `Checked`/`Unchecked` handlers; `_suppressEvents` guard during `PopulateControls` (existing pattern)
- `MainWindow.OpenSettings` immediate-persist: `_settings = _settings with { UpdateChecksEnabled = v }; SaveSettings();`
- `ResetToDefaults()` restores `UpdateChecksEnabled = true` and refreshes via `RefreshControls(GetCurrentSettingsSnapshot())`

### Version Comparison
- `UpdateVersionComparer.TryParseTag(string? tag, out Version version)`:
  - Strips leading `v`/`V` (case-insensitive single-char strip)
  - Accepts 2-component (`4.5`), 3-component (`4.5.0`), 4-component (`4.5.0.0`) numeric tags
  - Rejects pre-release suffixes (`-beta`, `-rc1`, `-alpha.2`)
  - Rejects build metadata (`+sha.abc`)
  - Returns false on null, empty, whitespace, garbage, or any non-numeric segment
- `IsNewer(Version running, Version latest)` returns `latest > running` strictly (equal returns false)
- `Assembly.GetExecutingAssembly().GetName().Version` is the canonical "running version" source — never `AssemblyInformationalVersion` (DEV-02)

### Csproj Sync
- `<InformationalVersion>3.6.0</InformationalVersion>` → `<InformationalVersion>4.5.0</InformationalVersion>` to match `<Version>4.5.0</Version>`
- One-line edit; CI tag-push override behavior in `release.yml` unchanged

### Test Coverage
- `UpdateVersionComparerTests`: ~13–17 DataRow rows covering: v-prefix strip, 2/3/4-component happy paths, prerelease reject (`-beta`/`-rc1`/`-alpha.2`), build-metadata reject (`+sha`), null/empty/whitespace/garbage reject, IsNewer ordering (running<latest=true, running=latest=false, running>latest=false, multi-component edge cases)
- Service-shape tests (~6–8 in `FuzzyClock.App.Tests` via `FakeHttpMessageHandler` seam): happy path 200 with valid tag, 404 returns null, 403 returns null, 429 returns null, malformed JSON returns null, draft/prerelease tag silently rejected, `#if DEBUG` returns null without dispatching, request shape (User-Agent + Accept headers present)
- `AppSettings` round-trip + absent-field tests for `UpdateChecksEnabled` survival and `= true` default (extends STEST-01 round-trip; new STEST-09 absent-field follows STEST-08 pattern)

### Claude's Discretion
- Internal field naming, helper organization, exact test method names, README paragraph wording — all free choice within the patterns above
- Specific exception logging output during DEV builds (acceptable as `Debug.WriteLine` for triage; never to console/stderr in RELEASE)
- Whether the `UpdateCheckService` field on `MainWindow` is constructed eagerly in `ApplySettings` or lazily on `ContentRendered` — both work; pick whichever cleanest matches `TemperatureService` precedent

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **TempsText / UptimeText TextBlock styling** (`MainWindow.xaml` StatsPanel children) — clone byte-for-byte for `UpdateText`
- **TemperatureService.cs** (`FuzzyClock.App/Services/`) — three-tier dispose pattern with `Interlocked.CompareExchange` on `int _disposed` and async init via `Task.WhenAny` is the canonical reference
- **AppSettings init-property pattern** (init defaults like `UptimeVisible = true`, `GhostModeEnabled = true`) — every new bool field must use the explicit `= true` form for absent-field upgrade safety
- **SettingsService.Validate()** — pure static returning corrected `AppSettings`; covered by direct unit tests; no new guard needed for a bool
- **Phase 33 dual-path** (`ApplyTheme` + `ApplyDisplayColor`) — every accent-colored TextBlock MUST be touched in BOTH methods; missing one is the most common regression
- **STEST-01 round-trip + STEST-02/STEST-08 absent-field test pattern** — extend or clone for `UpdateChecksEnabled`
- **Phase 78 immediate-persist event-handler pattern** in `MainWindow.OpenSettings` (5 Temps event handlers each `_settings = _settings with { ... }; SaveSettings();`) — clone shape for `UpdateChecksEnabledChanged`
- **`_suppressEvents` guard** in `SettingsWindow.PopulateControls` — already used by every existing checkbox; just include the new one
- **`SettingsSnapshot` immutable record** — append `UpdateChecksEnabled` bool field; `GetCurrentSettingsSnapshot()` populates it

### Established Patterns
- **HttpClient lifecycle**: long-lived static instance per process — `IHttpClientFactory` is overkill for one call per launch (per Out-of-Scope table)
- **JSON shape**: `System.Text.Json` source-generated `JsonSerializerContext` (project standard; Newtonsoft.Json explicitly out of scope)
- **Three-tier dispose**: `OnClosing` (tier 1) + `SessionEnding` (tier 2) + `ProcessExit` (tier 3) — proven in `TemperatureService`
- **Phase 33 critical pattern**: ALL accent-colored `Foreground` assignments in BOTH `ApplyTheme` and `ApplyDisplayColor`
- **Idempotent dispose**: `Interlocked.CompareExchange(ref _disposed, 1, 0) == 0` gate
- **#if DEBUG skip**: top-of-method early-return prevents dev-build noise
- **Atomic commits per RED → GREEN**: TDD-flavored commit pattern; each plan ends green

### Integration Points
- **MainWindow.xaml** — `StatsPanel` (already 7 children: CpuRow, GpuRow, MemRow, PagRow, BattRow, UptimeText, TempsText) — append `UpdateText` as 8th child immediately below `TempsText`
- **MainWindow.xaml.cs** — `ContentRendered` (kickoff dispatch), `ApplyTheme` (foreground assign), `ApplyDisplayColor` (foreground assign), `OnClosing` (dispose tier 1), `OpenSettings` (event subscription), `ResetToDefaults` (field reset), new `UpdateUpdateNoticeDisplay()` helper, new `_updateService` field
- **App.xaml.cs** — `SessionEnding` (dispose tier 2) + `OnProcessExit` registration in `OnStartup` (dispose tier 3)
- **SettingsWindow.xaml** — Behavior tab gains new `<CheckBox x:Name="ChkUpdateChecksEnabled">` cloning `ChkAutoLaunchEnabled`
- **SettingsWindow.xaml.cs** — `_suppressEvents`-guarded `Checked`/`Unchecked` handlers + `event Action<bool>? UpdateChecksEnabledChanged;` + `PopulateControls` extension + `SettingsSnapshot.UpdateChecksEnabled` consumer
- **AppSettings.cs** — new `UpdateChecksEnabled = true` init field
- **SettingsService.cs** — `Defaults()` returns `UpdateChecksEnabled = true`; `Validate()` unchanged
- **FuzzyClock.App.csproj** — `<InformationalVersion>3.6.0</InformationalVersion>` → `4.5.0`
- **README.md** — one-paragraph mention of notice line + Settings toggle

</code_context>

<specifics>
## Specific Ideas

- Repo coordinate is `atabisz/FuzzyStatsClock` (verified against live `git remote get-url origin`); REQUIREMENTS.md placeholder `{owner}/FuzzyClock` resolves to this concrete value as `internal const string`.
- Service-shape tests use a `FakeHttpMessageHandler` seam injected via the `UpdateCheckService` constructor's optional `HttpMessageHandler` parameter — same shape as common HttpClient testability patterns. The default constructor uses the long-lived static `HttpClient` (single static instance, 5s timeout, `SocketsHttpHandler.PooledConnectionLifetime = 15min`).
- `<InformationalVersion>` is currently stale at `3.6.0` while `<Version>` is `4.5.0` — DEV-01 fixes this with a single one-line edit. The CI tag-push override behavior in `release.yml` is preserved (CI overrides csproj at tag time).
- `Assembly.GetExecutingAssembly().GetName().Version` is the canonical running-version source. Never use `AssemblyInformationalVersion` for the comparison (it's hand-edited and known stale).

</specifics>

<deferred>
## Deferred Ideas

These were explicitly noted by the milestone Out-of-Scope table and remain out of scope for v4.5:

- **PERF-FOLLOW-01** — investigate occasional brief freeze observed during ghost-mode fade under sustained 25–50% CPU load (v4.4 PERF-01 `barely-stepping` verdict); v4.5 doesn't touch the fade-render path so this is carried forward to v4.6+
- **UPD-FUTURE-01** — clickable notice opens GitHub release URL in browser (v4.5 is plain text)
- **UPD-FUTURE-02** — manual "Check now" tray menu item (v4.5 is once-per-launch only)
- **UPD-FUTURE-03** — pre-release / beta-channel toggle (v4.5 uses `/releases/latest` which filters server-side)
- **UPD-FUTURE-04** — snooze / dismiss `DismissedVersion` field (adds state complexity)

</deferred>
