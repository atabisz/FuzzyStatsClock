# Requirements: FuzzyClock v4.5 Update Checker

**Defined:** 2026-05-29
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Milestone goal:** Notify the user when a newer FuzzyClock release is available on GitHub by rendering a one-line accent-colored "vX.Y.Z available" notice at the bottom of the stats panel; provide a Settings toggle to disable the check entirely.

## v1 Requirements (v4.5)

### Update Check Service (UPD)

Pure version compare in Core; HTTP-using service in App; silent-failure posture.

- [ ] **UPD-01**: `UpdateVersionComparer` pure static class in `FuzzyClock.Core` exposes `bool TryParseTag(string? tag, out Version version)` — strips leading `v`/`V`, accepts 2-/3-/4-component tags, rejects pre-release suffixes (`-beta`, `-rc1`), rejects build metadata (`+sha`), returns false on null/empty/garbage input
- [ ] **UPD-02**: `UpdateVersionComparer.IsNewer(Version running, Version latest)` returns true iff `latest > running` (running version greater-than-or-equal returns false; equal returns false)
- [ ] **UPD-03**: `UpdateCheckService` in `FuzzyClock.App` performs a single anonymous HTTPS GET to `https://api.github.com/repos/{owner}/FuzzyClock/releases/latest` per app launch, with required headers `User-Agent: FuzzyClock/{AssemblyVersion}` and `Accept: application/vnd.github+json`
- [ ] **UPD-04**: Network call uses a service-owned long-lived `HttpClient` (single static instance, `Timeout = 5s`, `SocketsHttpHandler.PooledConnectionLifetime = 15min`); constructor accepts optional `HttpMessageHandler` for test injection (`FakeHttpMessageHandler` seam)
- [ ] **UPD-05**: Hard 5-second timeout via `CancellationTokenSource.CancelAfter(TimeSpan.FromSeconds(5))` linked to an app-shutdown CTS via `CancellationTokenSource.CreateLinkedTokenSource`, so app shutdown during in-flight check unwinds within milliseconds, not 5 seconds
- [ ] **UPD-06**: Service uses `System.Text.Json` source-generated `JsonSerializerContext` for the `GitHubRelease` POCO (`tag_name`, `prerelease`, `draft`); no reflection-based deserialization; trim/AOT-safe even with `PublishTrimmed=false` today
- [ ] **UPD-07**: Service catches `HttpRequestException`, `TaskCanceledException`, `OperationCanceledException`, `JsonException`, `FormatException`, `ArgumentException` only — never `catch (Exception)`; on any caught exception, returns `Version?` = null (silent failure)
- [ ] **UPD-08**: Service is idempotently disposable via `Interlocked.CompareExchange` on `int _disposed` — three-tier dispose registered from `MainWindow.OnClosing`, `App.SessionEnding`, `AppDomain.CurrentDomain.ProcessExit` (mirrors `TemperatureService` pattern)
- [ ] **UPD-09**: Service skips the network call entirely (`return null` at top of method) when compiled in `#if DEBUG` configuration — prevents dev-box screenshots showing nonsensical "v4.4.0 available" notices when running an untagged dev build
- [ ] **UPD-10**: GitHub repo coordinates (`owner/repo`) are hard-coded as an `internal const string` in `UpdateCheckService` — never read from `settings.json` (security: prevents malicious settings file from redirecting the check to a hostile endpoint)

### Widget UI Notice (UI)

UpdateText TextBlock + Phase 33 dual-path coverage.

- [ ] **UI-01**: New `<TextBlock x:Name="UpdateText">` added as 8th and final child of `StatsPanel` in `MainWindow.xaml`, immediately below `TempsText`; styling cloned byte-for-byte from `TempsText`/`UptimeText` (Margin=0,2,0,0; FontFamily=Segoe UI Light; FontSize=11; design-time Foreground=White; TextAlignment=Left; Text="")
- [ ] **UI-02**: `UpdateText.Text` set to `"{newerTag} available"` where `{newerTag}` is the GitHub `tag_name` verbatim (preserves `v` prefix, e.g. `"v4.6.0 available"`)
- [ ] **UI-03**: `UpdateText.Visibility` is `Collapsed` by default and only flips to `Visible` when the service callback fires with a tag whose parsed `Version` is strictly newer than `Assembly.GetExecutingAssembly().GetName().Version`
- [ ] **UI-04**: `UpdateText.Foreground = brush;` is added to BOTH `ApplyTheme` AND `ApplyDisplayColor` (Phase 33 critical pattern) so the notice participates in accent-color theming and auto-contrast switching
- [ ] **UI-05**: When `UpdateText.Visibility` flips to `Visible`, the existing window-position clamp invariant is preserved — re-clamp via `SettingsService.Clamp` so a near-edge widget doesn't clip the new line off-screen
- [ ] **UI-06**: Service kickoff fires from `MainWindow.ContentRendered` via `Dispatcher.BeginInvoke` at `DispatcherPriority.ApplicationIdle` — first paint never gated on network call dispatch
- [ ] **UI-07**: When the service completion callback fires, it marshals to the UI thread via `Dispatcher.Invoke` before touching `UpdateText.Text` or `UpdateText.Visibility`
- [ ] **UI-08**: Fire-and-forget kickoff is wrapped in an outer `try/catch (Exception)` at the boundary so any unexpected exception in the kickoff path doesn't surface as `TaskScheduler.UnobservedTaskException` (defense in depth — the service already catches narrow exceptions internally)

### Settings + Persistence (PERS)

AppSettings field + Settings checkbox + reset behavior.

- [ ] **PERS-01**: New `bool UpdateChecksEnabled { get; init; } = true;` field in `AppSettings` record — explicit `= true` is mandatory so v4.4 users upgrading via JSON round-trip don't silently lose update checks (mirrors `UptimeVisible`/`GhostModeEnabled`/`UseCtrl` pattern)
- [ ] **PERS-02**: `SettingsService.Defaults()` returns an `AppSettings` with `UpdateChecksEnabled = true`
- [ ] **PERS-03**: `SettingsService.Validate()` requires no new guard for this field (a bool cannot be invalid); existing Validate() return shape unchanged
- [ ] **PERS-04**: `AppSettings` JSON round-trip test verifies `UpdateChecksEnabled` survives serialize → deserialize cycle (extends existing STEST-01 round-trip test or adds STEST-09)
- [ ] **PERS-05**: Absent-field test verifies that deserializing a JSON document with no `UpdateChecksEnabled` key yields an `AppSettings` instance with `UpdateChecksEnabled == true` (mirrors STEST-02 / STEST-08 pattern)
- [ ] **PERS-06**: New `<CheckBox x:Name="ChkUpdateChecksEnabled">` added to `SettingsWindow.xaml` Behavior tab with label `Check for updates on launch` — placement and styling clone the existing `ChkAutoLaunchEnabled` checkbox
- [ ] **PERS-07**: `SettingsWindow` exposes `event Action<bool>? UpdateChecksEnabledChanged;` — fired from `Checked`/`Unchecked` handlers, suppressed during `PopulateControls` via existing `_suppressEvents` guard
- [ ] **PERS-08**: `SettingsSnapshot` immutable record gains an `UpdateChecksEnabled` bool field; `MainWindow.GetCurrentSettingsSnapshot()` populates it from `_settings.UpdateChecksEnabled`
- [ ] **PERS-09**: `MainWindow.OpenSettings` subscribes to `UpdateChecksEnabledChanged` with the immediate-persist pattern: `_settings = _settings with { UpdateChecksEnabled = v }; SaveSettings();` — same shape as the 5 Phase 78 Temps event handlers
- [ ] **PERS-10**: When the user toggles the checkbox OFF mid-session, the active in-flight CTS (if any) is cancelled and `UpdateText.Visibility` collapses immediately; toggling back ON mid-session is a no-op (the once-per-launch invariant means re-enabling takes effect on next launch)
- [ ] **PERS-11**: `MainWindow.ResetToDefaults()` restores `UpdateChecksEnabled = true` and refreshes the Settings snapshot via `RefreshControls(GetCurrentSettingsSnapshot())` so the checkbox UI re-evaluates
- [ ] **PERS-12**: When `_settings.UpdateChecksEnabled == false` at app launch, the network call is skipped entirely — the service is constructed and registered for dispose, but no kickoff `BeginInvoke` is scheduled

### Dev-Build Hygiene (DEV)

csproj version sync + #if DEBUG safety.

- [ ] **DEV-01**: `FuzzyClock.App/FuzzyClock.App.csproj` `<InformationalVersion>` synced to match `<Version>` (currently stale at `3.6.0` while `<Version>` is the active version) — one-line edit; CI tag-push override behavior unchanged
- [ ] **DEV-02**: `Assembly.GetExecutingAssembly().GetName().Version` is the canonical source for "running version" — never `AssemblyInformationalVersion` (which is hand-edited and known stale)
- [ ] **DEV-03**: Service `#if DEBUG` skip is unit-test-validated by a service-shape test in `FuzzyClock.App.Tests` that verifies the method returns null in DEBUG builds (test runs in DEBUG configuration so this is the natural assertion)

### Documentation (DOCS)

- [ ] **DOCS-01**: README updated to mention the new update notice line on the widget (one short paragraph) and the `Check for updates on launch` toggle in Settings → Behavior; placement consistent with v3.1 DOCS-03 / v2.8 DOCS-01 pattern (concise feature mention, not a full manual)

## v2 Requirements (deferred to v4.6+)

### Performance follow-up (PERF)

- **PERF-FOLLOW-01**: Investigate occasional brief freeze observed during ghost-mode fade under sustained 25–50% CPU load (v4.4 PERF-01 `barely-stepping` verdict). Suspected cause: deferred Phase 86 advisory WR-01. Out of v4.5 scope because v4.5 doesn't touch the fade-render path.

### Update-checker enhancements (UPD-FUTURE)

- **UPD-FUTURE-01**: Click-to-open notice — clickable notice opens GitHub release URL in browser. Deferred — v4.5 is plain text.
- **UPD-FUTURE-02**: Manual "Check now" tray menu item — on-demand re-check without restart. Deferred — v4.5 is once-per-launch only.
- **UPD-FUTURE-03**: Pre-release / beta-channel toggle — surface releases marked `prerelease=true`. Deferred — v4.5 uses `/releases/latest` which filters server-side.
- **UPD-FUTURE-04**: Snooze / dismiss — `DismissedVersion` field that suppresses the notice for a specific version. Deferred — adds state complexity.

## Out of Scope

Explicitly excluded for v4.5. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-update / one-click install | Per-user Inno Setup installer flow stays unchanged; v4.5 notifies only |
| In-app changelog viewer | User clicks through to GitHub for release notes |
| Background polling / DispatcherTimer recheck | Once-per-launch only — no background timer |
| Multiple cadence options (hourly/daily/etc) | Once-per-launch; configurability adds surface for no value |
| Failure indicator on widget (red dot, ⚠ icon, error toast) | Silent-failure posture by user choice — zero visible feedback on failure |
| Telemetry on check outcome | No analytics; no phoning home beyond the single GitHub call |
| Pre-release / draft release detection | `/releases/latest` filters server-side; never surface drafts/pre-releases |
| Configurable repo URL via settings.json | Security: hard-coded only, prevents redirect-via-malicious-settings |
| PAT / OAuth token | Anonymous public API call; 60 req/hr/IP rate limit is plenty for once-per-launch |
| ETag / If-None-Match conditional requests | Once per launch; bandwidth optimization unwarranted |
| `IHttpClientFactory` / DI infrastructure | One call per process — overkill |
| Squirrel / Velopack / AutoUpdater.NET frameworks | Notify-only; no auto-update flow |
| `Octokit` / third-party GitHub SDK | One endpoint, simple POCO; HttpClient + STJ is sufficient |
| Newtonsoft.Json | `System.Text.Json` already the project standard |
| Failure indicator on the widget | User chose silent failure; no `(check failed)` text |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UPD-01 | Phase 88 | Pending |
| UPD-02 | Phase 88 | Pending |
| UPD-03 | Phase 88 | Pending |
| UPD-04 | Phase 88 | Pending |
| UPD-05 | Phase 88 | Pending |
| UPD-06 | Phase 88 | Pending |
| UPD-07 | Phase 88 | Pending |
| UPD-08 | Phase 88 | Pending |
| UPD-09 | Phase 88 | Pending |
| UPD-10 | Phase 88 | Pending |
| UI-01 | Phase 88 | Pending |
| UI-02 | Phase 88 | Pending |
| UI-03 | Phase 88 | Pending |
| UI-04 | Phase 88 | Pending |
| UI-05 | Phase 88 | Pending |
| UI-06 | Phase 88 | Pending |
| UI-07 | Phase 88 | Pending |
| UI-08 | Phase 88 | Pending |
| PERS-01 | Phase 88 | Pending |
| PERS-02 | Phase 88 | Pending |
| PERS-03 | Phase 88 | Pending |
| PERS-04 | Phase 88 | Pending |
| PERS-05 | Phase 88 | Pending |
| PERS-06 | Phase 88 | Pending |
| PERS-07 | Phase 88 | Pending |
| PERS-08 | Phase 88 | Pending |
| PERS-09 | Phase 88 | Pending |
| PERS-10 | Phase 88 | Pending |
| PERS-11 | Phase 88 | Pending |
| PERS-12 | Phase 88 | Pending |
| DEV-01 | Phase 88 | Pending |
| DEV-02 | Phase 88 | Pending |
| DEV-03 | Phase 88 | Pending |
| DOCS-01 | Phase 88 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to Phase 88: 34 ✓ (confirmed by roadmapper 2026-05-29; single-phase milestone per all-4-researcher convergence)
- Unmapped: 0 ✓

---

*Requirements defined: 2026-05-29*
*Last updated: 2026-05-29 — Traceability confirmed by roadmapper; all 34 v1 requirements mapped to Phase 88*
