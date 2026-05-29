# Feature Research — v4.5 Update Checker

**Domain:** Lightweight Windows desktop widget — once-per-launch GitHub Releases update notice
**Researched:** 2026-05-29
**Confidence:** HIGH (decisions backed by GitHub REST docs, SemVer spec, Microsoft writing-style guide, and existing FuzzyClock conventions)

---

## Question-by-Question Resolution

This section answers each of the 8 questions from the research prompt directly. Downstream consumers (roadmapper, plan-phase) should treat the **Recommendation** lines as the authoritative decision unless the user overrides.

### Q1. Notice text format

**User's choice:** `vX.Y.Z available` (e.g. `v4.6.0 available`)

**Common variants surveyed:**

| Format | Example | Where it shows up | Verdict |
|--------|---------|-------------------|---------|
| `vX.Y.Z available` | `v4.6.0 available` | Indie utilities (RetroBar, Files, ShareX bottom-strip notices) | **Recommended** — verb-last reads as a complete clause; matches existing widget vocabulary (`up 5h 3m`, `⚡ 87%`) — terse-noun-then-state style |
| `Update: vX.Y.Z` | `Update: v4.6.0` | Sparkle/WinSparkle dialog titles | Stronger imperative; reads as a label; fine for dialogs but slightly noisy on a passive one-line strip |
| `New version: vX.Y.Z` | `New version: v4.6.0` | Some Electron apps | Verbose; "new" duplicates the implication of "available" |
| `↑ vX.Y.Z` | `↑ v4.6.0` | None observed in mainstream Windows utilities | Symbol-first feels like a notification badge; user already chose plain text |
| `vX.Y.Z` (bare) | `v4.6.0` | Status bars in some IDEs | Ambiguous — could read as "you are running v4.6.0" |

**Recommendation:** Confirm `vX.Y.Z available`. It is the cleanest and most common phrasing for passive "FYI" strip notices in lightweight Windows utilities, and it parallels the existing `up 5h 3m … 142p` and `⚡ 87%` vocabulary on the widget — plain text, no symbol, terse.

**Confidence:** HIGH (format aligns with existing widget terseness and is the most common pattern in surveyed indie utilities). Microsoft writing-style guide reinforces "lead with what's important" — the version number leads, "available" follows.

---

### Q2. When to suppress the notice — full state matrix

The roadmap mentions three suppression states; here is the **complete** matrix that plan-phase should encode.

| State | Notice rendered? | Rationale |
|-------|------------------|-----------|
| Running version >= latest tag | NO (Collapsed) | Already up to date — silence is correct |
| User has `UpdateChecksEnabled = false` | NO (Collapsed) | User opted out — checker also skips the network call |
| Check pending (in flight, not yet returned) | NO (Collapsed) | Default state until first response — empty TextBlock equivalent to TempsText pre-warmup |
| Check failed (network error / timeout / non-200 / bad JSON / rate-limit / DNS) | NO (Collapsed) | Silent-failure posture, mirrors `_temperatureService?.IsReady` pattern |
| Check disabled mid-launch (toggled OFF after success) | NO (Collapsed) | UpdateText immediately hides via existing event-handler pattern (mirrors TempsText, see ChkTempsVisible) |
| Latest tag is a pre-release or draft (when using `/releases` listing) | NO (Collapsed) | See Q4 — but the recommended `/releases/latest` endpoint already filters these |
| Running version == latest tag | NO (Collapsed) | Equality means up-to-date |
| Running version > latest tag (dev/CI build ahead of tag) | NO (Collapsed) | See Q3 — never show "you should downgrade" |
| Running version < latest tag (the only "show" case) | YES (Visible) | The single happy-path positive state |

**Other states sometimes seen in larger desktop apps that we are explicitly NOT considering:**

| State | Why excluded for FuzzyClock v4.5 |
|-------|----------------------------------|
| "User dismissed for this version" | Anti-feature — user already explicitly disabled snooze/dismiss UI. Adds new persisted field (`DismissedVersion`), changes `Update*` settings shape. |
| "Snooze until X" | Anti-feature — user explicitly excluded multi-cadence options. |
| "Forced update" / "critical security alert" | Out of scope — silent-passive notice posture; FuzzyClock is a desktop ornament, not a security boundary. |
| "Update channel" (stable / beta / nightly) | Out of scope — user runs only published GitHub Releases. |

**Recommendation:** Use the **8-state matrix above** as the authoritative truth table for plan-phase. The single positive case is `running < latest`; all other states render the line as `Visibility.Collapsed`. Treat "check pending" as the default constructor state (empty `Text`, `Visibility.Collapsed`) — same shape as `TempsText` before the first temperature tick lands.

**Confidence:** HIGH

---

### Q3. Version-equal handling — what about asymmetric depths and dev-ahead-of-tag?

**Scenario:** Running `v4.4.1` vs latest tag `v4.4` (or `v4.5.0-dev` running vs `v4.4.0` published).

**SemVer spec rule (from semver.org):** "Major, minor, and patch versions are always compared numerically." Build metadata is ignored for precedence. Pre-release identifiers (`-alpha`, `-rc1`) rank lower than the bare version.

**FuzzyClock-specific reality:**

- Running version comes from `Assembly.GetExecutingAssembly().GetName().Version` which is always 4 components (`Major.Minor.Build.Revision`, e.g. `4.4.0.0`).
- GitHub tags are 3-component SemVer (`v4.4.0`, `v4.4.1`).
- CI release pipeline injects version from git tag (validated v3.5 INST-07), so a developer working between releases can reasonably have a binary whose `AssemblyVersion` is **ahead** of the latest tag.

**The four edge cases:**

| Running (Assembly) | Latest tag | Numeric compare | Recommended behavior |
|--------------------|------------|-----------------|---------------------|
| `4.4.0.0` | `v4.4.1` | running < latest | **Show** — happy path |
| `4.4.1.0` | `v4.4.0` | running > latest | **Hide** — dev/CI build ahead of tag |
| `4.4.0.0` | `v4.4.0` | running == latest | **Hide** — up to date |
| `4.4.1.0` | `v4.4` (2-component tag) | parse `v4.4` → `4.4.0`; running > latest | **Hide** — treat missing patch as `.0` |

**Parsing rule:** Strip leading `v` (case-insensitive), then parse the remainder with `System.Version.TryParse`. If the tag is 2-component (`4.4`), `System.Version` parses as `Major=4, Minor=4, Build=-1` — normalize `-1` components to `0` before comparison so `v4.4` becomes `v4.4.0`. If parsing fails entirely (e.g. user pushed a non-SemVer tag like `nightly-2026-05-29`), treat as **failed check** → hide notice (see Q2).

**Recommendation:**
1. Parse both running and latest as `System.Version` after stripping leading `v` and normalizing `-1` components to `0`.
2. Compare with `System.Version.CompareTo` (which is the standard `Major → Minor → Build → Revision` left-to-right numeric compare per SemVer §11).
3. **Show only when** `latest.CompareTo(running) > 0`. Equal or running-ahead → hide.
4. Ignore the 4th `Revision` component if the tag has only 3 components: pad the 3-component tag to 4 components with `Revision=0` so that `4.4.0.0` (running) compared against `v4.4.0 → 4.4.0.0` is correctly equal, not "running ahead by Revision=0".
5. Pre-release tags (`v4.5.0-rc1`) are filtered out by the API endpoint choice (see Q4); if one slips through somehow, `System.Version.TryParse` will reject it and the comparison falls through to "failed check" → hide.

**This goes in `FuzzyClock.Core`** as a pure static helper for testability — same pattern as `DateFormatter`, `UptimeFormatter`, `TemperatureFormatter`, `ComputeProximityRatio`. Suggested name: `VersionComparator` or `UpdateVersionLogic` with a method like `ShouldShowUpdate(string runningVersion, string latestTag) → bool`.

**Confidence:** HIGH (matches SemVer §11 and `System.Version.CompareTo` is the canonical .NET implementation)

---

### Q4. Pre-release / draft filtering

**GitHub REST API documentation (verified):** The endpoint `GET /repos/{owner}/{repo}/releases/latest` returns "the most recent non-prerelease, non-draft release, sorted by the created_at attribute." The filtering happens **server-side**.

The alternative `GET /repos/{owner}/{repo}/releases` returns *all* releases including drafts (visible only to users with push access) and pre-releases.

**Standard expectation in indie Windows utilities:**

- Sparkle / WinSparkle frameworks default to filtering pre-releases unless an explicit "I want beta builds" channel is enabled.
- The vast majority of GitHub-hosted indie utilities use `/releases/latest` precisely because it gives them automatic filtering at zero cost.
- Users running a stable build expect to be notified about **stable** releases only.

**Recommendation:** **Use `GET /repos/{owner}/{repo}/releases/latest`** — single response, server-side filters drafts and pre-releases, no client-side filter logic needed. This is also already documented as Out of Scope in PROJECT.md (`"Pre-release / draft release detection — checker considers only published, non-prerelease tags"`) — the recommended endpoint *gives us the desired behavior automatically*.

**Edge case:** If a repository has only pre-release tags (no stable release ever published), `/releases/latest` returns HTTP 404. Treat as **failed check** → hide notice. This is the correct posture: a project with no stable release has nothing to recommend an upgrade to.

**JSON shape returned:** For comparison logic, you only need `tag_name` (string, e.g. `"v4.6.0"`). Optionally also `html_url` for "release link in browser" — but that is out of scope for v4.5. Other fields (`name`, `body`, `published_at`, `assets[]`) are unused.

**Confidence:** HIGH (verified against GitHub docs)

---

### Q5. First-launch / new-install behavior

**The two competing schools:**

| Approach | Rationale | Where seen |
|----------|-----------|------------|
| **Run on every launch including first** | First launch is just another launch; the user just installed v4.5.0 → API returns v4.5.0 → comparison says "up to date" → notice hidden anyway → no harm | Most CLI tools, most Electron apps, Sparkle's default |
| Skip until second launch | "Just installed; can't possibly need an update yet" | Some installer-driven app suites that want a quiet first-run experience |

**FuzzyClock-specific reality:**

- The user just downloaded `FuzzyClockSetup-X.Y.Z.exe` from GitHub Releases. The installed version IS by definition the latest published release at install time.
- On first launch, `running == latest` is overwhelmingly likely → suppression case (Q2) → notice hidden.
- The only first-launch case where the notice would render is if a newer release was published between the user's download click and their first launch (rare, harmless edge case — and the user should reasonably be told).
- Adding "skip on first launch" requires persisting `HasLaunchedBefore` (or sentinel), which adds:
  - One new AppSettings field
  - One new round-trip test
  - Logic to flip the bool on first ContentRendered
  - A subtle question: if user upgrades from v4.4 to v4.5, is that "first launch of v4.5"? (Yes, but their settings.json has `HasLaunchedBefore=false` if absent — needs `init = true` default to suppress only true first installs).

**Recommendation:** **Run on every launch including the first.** The `running >= latest` check is self-suppressing on the realistic first-launch case; the overhead of a dedicated first-launch suppression bool is not justified by the rare edge it prevents.

**Confidence:** HIGH

---

### Q6. Concurrency — toggle OFF during in-flight request

**The two viable postures:**

| Posture | Mechanism | Pros | Cons |
|---------|-----------|------|------|
| **Cancel in-flight request** | `CancellationTokenSource` passed to `HttpClient.GetAsync(uri, ct)`; toggle-off handler calls `_cts.Cancel()` | Free network bandwidth saved; clean resource teardown; immediate response to user intent | One extra field on the service; one extra try/catch around `OperationCanceledException` |
| Let request complete, discard result | Boolean check at the response-handling site: `if (!_settings.UpdateChecksEnabled) return;` | Trivially simple — no CTS plumbing | "Wastes" the in-flight network call and any allocated buffers; if response is delayed (slow network) the discard happens late |

**FuzzyClock-specific precedent — TemperatureService.cs:**

```csharp
private CancellationTokenSource? _cts;
...
_cts = new CancellationTokenSource();
...
private async Task BackgroundLoop(CancellationToken ct)
```

The existing TemperatureService **already uses the CancellationTokenSource pattern** for its background loop. Adopting the same pattern for UpdateCheckService gives architectural consistency.

**Recommendation:** **Cancel in-flight request via `CancellationTokenSource`.** The pattern is already established in `TemperatureService.cs`; the cost is one field plus one `OperationCanceledException` catch (which silently absorbs into the silent-failure posture — no logging, no UI feedback). This also handles a second case for free: app shutdown while a request is in flight (Dispose path cancels CTS, request unwinds cleanly without orphaned threads).

The HttpClient request itself should also have a hard timeout (~5s mentioned in roadmap) implemented as `_cts.CancelAfter(TimeSpan.FromSeconds(5))` — this **stacks cleanly** with the user-toggle cancel: whichever fires first wins, both unwind through the same `OperationCanceledException` path.

**Confidence:** HIGH

---

### Q7. Visual placement and icon/symbol prefix

**User decision:** Plain text, no symbol, below `TempsText` (8th and last child of `StatsPanel`).

**Symbols seen in the wild:**

| Prefix | Where seen | Verdict |
|--------|-----------|---------|
| (none — plain text) | RetroBar status messages, ShareX strip notices, command-line `apt list --upgradable` summaries | **Recommended** — passive notice fits the FuzzyClock minimalist aesthetic |
| `↑` (upward arrow) | npm `npm-check`, Brew `brew outdated` | Conveys "newer" but adds visual weight |
| `•` (bullet) | Some IDE status bars | Implies a list item — not appropriate for a single line |
| `→` (arrow) | Atom/VS Code update notices | Implies action ("click here") which would be misleading on a non-clickable line |
| `★` / `✨` / 🎉 | Electron apps targeting consumer audiences | Off-tone for a minimalist desktop ornament |

**FuzzyClock vocabulary parallels:**

- Battery row: `⚡ 87%` — symbol IS the AC indicator (semantic glyph)
- Uptime row: `up 5h 3m   0.52  0.47  0.43  142p` — pure plain text, no symbol
- Temps row: `GPU 51°` — no leading glyph, only the `°` unit

The widget consistently uses **glyphs only when they carry semantic meaning** (the lightning bolt means "AC connected"; `°` means "degrees"). A leading arrow on the update line would be decorative, not semantic.

**Recommendation:** Confirm **plain text, no symbol**. `vX.Y.Z available` matches the widget's existing terse-and-semantic typography rules. Layout placement as 8th/last child of `StatsPanel` is correct — clones `TempsText` styling (Margin, FontFamily=Segoe UI Light, FontSize=11, TextAlignment=Left, design-time `Foreground=White`). Both `ApplyTheme` and `ApplyDisplayColor` must be extended to set `UpdateText.Foreground = brush;` (Phase 33 critical pattern — see lines 1918, 1956 of MainWindow.xaml.cs where TempsText.Foreground is dual-pathed).

**Confidence:** HIGH (matches widget's established symbol-discipline and minimalist aesthetic)

---

### Q8. Settings checkbox label

**Common label conventions in lightweight Windows utilities:**

| Label | Style | Typical context |
|-------|-------|-----------------|
| `Check for updates on launch` | Action-oriented, frequency-explicit | Most common in indie utilities (RetroBar, RoboForm, KeePass, Notepad++) |
| `Automatically check for updates` | Action-oriented, no cadence | Common in larger apps with background polling — implies recurring check |
| `Notify me of new versions` | User-perspective, outcome-focused | Less common; sometimes seen in consumer apps |
| `Enable update notifications` | Generic, on/off flavor | Bland; no user agency in phrasing |

**Microsoft Writing Style Guide principles applied:**

- "Lead with what's important" — verb first when it's an action setting.
- "Address the user as 'you'" — implicit "you" via imperative `Check for updates on launch`.
- "Don't end checkbox text with a period."
- "Be crisp and clear" — "on launch" is frequency-explicit and matches the actual once-per-launch behavior of the feature.

**FuzzyClock's existing checkbox vocabulary in Settings → Behavior tab:**

- `Ghost Mode` (terse noun)
- `Auto-Contrast` (terse noun)
- `Auto-Launch at Windows startup` (verb-noun-prepositional)

**Recommendation:** **`Check for updates on launch`**

Rationale (in priority order):
1. **Frequency-explicit:** the phrase "on launch" is honest about the behavior — the user knows there is no background polling. Aligns with the user's explicit choice of once-per-launch only and pre-empts a future support question ("does it check while running?").
2. **Action-oriented:** matches Microsoft Writing Style "active voice" guidance and parallels the existing `Auto-Launch at Windows startup` (verb-led-with-context).
3. **No period** (per Microsoft style guide for checkbox labels).
4. **Most common in lightweight indie Windows utilities** (KeePass, Notepad++, ShareX, RoboForm all use "Check for updates" with frequency suffix).

**Why not `Automatically check for updates`:** "automatically" implies recurring/background polling, which is **explicitly out of scope** (PROJECT.md: "Background polling for new releases — once-per-launch only"). The label would mislead about the actual behavior.

**Why not `Notify me of new versions`:** Less common in Windows utility space; "notify" hints at toast/popup, but the actual behavior is a passive in-widget line.

**XAML naming:** Following established `ChkXxxVisible` and `ChkAutoLaunch` patterns, the checkbox should be `x:Name="ChkUpdateChecksEnabled"` — matches the AppSettings field name `UpdateChecksEnabled` (already chosen in PROJECT.md "Key context").

**Confidence:** HIGH

---

## Feature Landscape

### Table Stakes (Users Expect These for an Update-Notification Feature)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Show "new version available" notice on widget when newer release exists | This IS the feature — without it, the milestone has no value | LOW | New `UpdateText` TextBlock, 8th child of StatsPanel, mirrors TempsText styling |
| Settings toggle to disable update checks | Privacy/network-conscious users expect opt-out | LOW | New `ChkUpdateChecksEnabled` checkbox in Settings → Behavior tab; default ON; immediate persistence |
| Skip the network call entirely when checks are disabled | Honoring opt-out means no telemetry-by-other-means | LOW | UpdateCheckService.RunCheckAsync() short-circuits if `_settings.UpdateChecksEnabled == false` |
| Silent failure on network errors | Network-troubled environments shouldn't see error toast/icon — quiet desktop ornament aesthetic | LOW | Catch-all try/catch returning hidden state; no UI feedback (mirrors TempsText -1f and StatsService -1f) |
| Hide notice when `running >= latest` | Up-to-date state should be silent | LOW | Pure helper in FuzzyClock.Core; testable |
| Filter pre-releases and drafts | Stable-channel users shouldn't see beta tags | LOW | Use `/releases/latest` endpoint — server-side filtering, no client logic needed |
| Hard timeout on the network call | Slow/hanging network shouldn't delay shutdown | LOW | `CancellationTokenSource.CancelAfter(5s)` |
| Run check off-thread (don't block UI) | Synchronous network I/O on UI thread = freeze on launch | LOW | `async Task` started from ContentRendered; HttpClient is async by design |

### Differentiators (FuzzyClock-Specific Polish)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `UpdateText` participates in `ApplyTheme` AND `ApplyDisplayColor` | Notice color matches accent + auto-contrast for visual coherence | LOW | Phase 33 critical pattern — both methods must set `UpdateText.Foreground = brush;` |
| `UpdateText` hides via `Visibility.Collapsed` when toggled off mid-session | Toggle is responsive, not "next launch only" | LOW | `UpdateChecksEnabledChanged` event in SettingsWindow, handler in MainWindow calls `UpdateText.Visibility = Collapsed` and cancels in-flight CTS |
| Cancel in-flight HttpClient request on toggle-off | Architectural consistency with TemperatureService precedent | LOW | `CancellationTokenSource` field on UpdateCheckService, exposed Cancel() or just Dispose() |
| Pure version-comparison helper in FuzzyClock.Core | Testable without WPF/HttpClient | LOW | `VersionComparator.ShouldShowUpdate(string running, string latestTag) → bool` — full unit test coverage |

### Anti-Features (Out of Scope — Already in PROJECT.md, Surface Here for plan-phase)

The user has explicitly chosen a minimal/silent posture. These are documented in PROJECT.md "Out of Scope" for v4.5 and **must not** appear in REQUIREMENTS.md or any phase plan:

| Feature | Why Requested | Why Problematic for v4.5 | Alternative |
|---------|---------------|--------------------------|-------------|
| In-app changelog viewer | "What's new in this version?" | New window, scrollable, MD or HTML rendering — ~5x the surface area of the whole feature | User clicks the GitHub release URL in their browser if they want to read notes (NOT in v4.5; `html_url` field is unused) |
| "Download now" button | "I want to upgrade in one click" | Web download flow inside WPF; security implications; per-user installer launch logic | User downloads from GitHub Releases manually; per-user Inno Setup pattern preserved |
| Auto-update / one-click upgrade | "Just do it for me" | Complete installer integration, signing checks, rollback path; Squirrel.Windows-class scope | Manual user upgrade flow remains the contract |
| Snooze ("remind me later") UI | "I don't want to upgrade right now" | Persisted dismissal state; new AppSettings field; `DismissedVersion` semantics | Toggle the entire feature OFF in Settings if it bothers the user |
| Multiple cadence options ("hourly", "daily") | "I want fresh data" | Background DispatcherTimer; rate-limit risk against GitHub API; adds complexity for rare benefit | Once-per-launch only; relaunches are sufficiently frequent for desktop-widget users |
| "Critical update" / forced-upgrade flag | "What if a security issue is found?" | Reads `release.body` for keywords; UX disruption; FuzzyClock is a desktop ornament not a security boundary | Manual user upgrade path is sufficient |
| Pre-release / draft notification path | "Show me beta builds too" | New "channel" setting; multiple endpoints; `/releases` listing parsing; user confusion about stability | `/releases/latest` filters server-side; dedicated channel is out of scope |
| Failure indicator (red dot, ⚠ icon) | "I want to know if the check failed" | Breaks silent-failure posture; visual noise; offline users see permanent error indicator | No indicator; failed checks render `Visibility.Collapsed` exactly as up-to-date checks do |
| Telemetry / analytics on check outcome | "We want to know how many users are upgrading" | Privacy concern; new dependency surface; requires opt-in dialog | Not applicable — this is a personal-use widget |

---

## Feature Dependencies

```
UpdateText TextBlock (XAML, 8th StatsPanel child)
    └── requires ── UpdateChecksEnabled AppSettings field (init default = true)
                        └── requires ── AppSettings JSON round-trip test (STEST-XX)
                                            └── requires ── absent-field test (init default = true on upgrade from v4.4)
    └── requires ── UpdateCheckService (FuzzyClock.App)
                        └── requires ── HttpClient with CancellationTokenSource + 5s timeout
                        └── requires ── VersionComparator pure helper (FuzzyClock.Core)
                                            └── requires ── unit tests for: equal, ahead, behind,
                                                            2-component tag, 4-component running,
                                                            unparseable tag, leading 'v' strip
    └── requires ── ApplyTheme(brush) sets UpdateText.Foreground (line ~1918)
    └── requires ── ApplyDisplayColor(brush) sets UpdateText.Foreground (line ~1956)
                        (Phase 33 critical pattern — both methods must cover the same elements)

ChkUpdateChecksEnabled checkbox (Settings → Behavior tab)
    └── requires ── SettingsSnapshot.UpdateChecksEnabled field
    └── requires ── UpdateChecksEnabledChanged event hook (Action<bool>?)
    └── requires ── MainWindow handler that:
                        - persists immediately via SaveSettings()
                        - cancels in-flight CTS on toggle OFF
                        - sets UpdateText.Visibility = Collapsed on toggle OFF
                        - does NOT re-trigger a check on toggle ON (next launch only)
    └── requires ── ResetToDefaults() sets UpdateChecksEnabled = true and refreshes snapshot
```

### Dependency Notes

- **VersionComparator must live in FuzzyClock.Core** (not App) for unit-test isolation — same pattern as `DateFormatter`, `UptimeFormatter`, `TemperatureFormatter`, `ComputeProximityRatio`. Core is net10.0 (no WPF), the version logic has zero WPF dependencies, and that's where the App.Tests-style fast unit tests live.
- **UpdateCheckService must live in FuzzyClock.App** (not Core) — Core is HttpClient-free and net10.0 only; App owns network and platform-bound services (mirrors `TemperatureService.cs` precedent). This also preserves `REL-03` (Core stays MPL-2.0/network-dependency-free).
- **Settings toggle handler MUST cancel in-flight CTS** — without this, toggling OFF after the user opts out would leak the in-progress request and hide the visual effect, but still complete the network call. `_cts?.Cancel(); _cts?.Dispose();` is the established TemperatureService pattern.
- **AppSettings.UpdateChecksEnabled init default = true** is critical — bool fields JSON-deserialize as `false` when absent, and absent-field is the upgrade-from-v4.4 case. Without `= true` in the init expression, every existing user would silently have update checks disabled on first launch of v4.5. Same fix pattern as `UptimeVisible = true` (validated v2.5 STEST-02).
- **ResetToDefaults() must reset UpdateChecksEnabled = true and refresh the SettingsSnapshot** — same pattern as v4.0 `GhostFadeRadiusPx` reset. Otherwise the Settings tab UI shows stale state after a reset.

---

## MVP Definition

The entire v4.5 milestone IS the MVP — there is no "phase 2 of update checking" planned. Listed in priority order for plan-phase ordering:

### Launch With (v4.5)

- [x] **`VersionComparator` pure helper in FuzzyClock.Core** — testable in isolation; unblocks all other work
  - Method: `bool ShouldShowUpdate(string runningVersion, string latestTag)`
  - Strip leading `v`, normalize 2-component tags by padding to `Major.Minor.0`, normalize `-1` build/revision components to `0`, compare via `System.Version.CompareTo`, return `latest > running`.
  - Unit tests: equal, behind, ahead, 2-component tag, 4-component running, unparseable tag, empty/null inputs, leading `V` (uppercase), pre-release tag fallback.
- [x] **`AppSettings.UpdateChecksEnabled` field with init default `true`** — JSON round-trip test + absent-field test
- [x] **`UpdateCheckService` in FuzzyClock.App** — HttpClient, GET `/repos/{owner}/{repo}/releases/latest`, parse `tag_name`, 5s timeout via `CancellationTokenSource.CancelAfter`, silent-failure try/catch
- [x] **`UpdateText` TextBlock in MainWindow.xaml** as 8th and last child of StatsPanel, immediately below TempsText
- [x] **`UpdateText.Foreground` set in `ApplyTheme` AND `ApplyDisplayColor`** (Phase 33 critical pattern — confirmed by lines 1918, 1956 of MainWindow.xaml.cs)
- [x] **`ChkUpdateChecksEnabled` checkbox in Settings → Behavior tab** with label `Check for updates on launch`
- [x] **`UpdateChecksEnabledChanged` event in SettingsWindow** with MainWindow handler that persists, cancels in-flight CTS, hides UpdateText
- [x] **`ResetToDefaults()` resets `UpdateChecksEnabled = true`** and triggers SettingsSnapshot refresh
- [x] **End-to-end check kicked off in `ContentRendered`** (mirrors TemperatureService init timing) — fire-and-forget `_ = RunCheckAsync(...)` pattern; never await, never block UI thread

### Add After Validation (v4.6+)

Nothing planned. The user's stated intent is minimal/silent. If post-launch user feedback surfaces a real need, candidates that *might* be worth revisiting (each one a deliberate scope expansion to the user's "out" list):

- [ ] Clickable UpdateText that opens GitHub release URL in browser — trigger: user feedback that they want to read release notes
- [ ] Optional badge/glyph prefix (`↑ vX.Y.Z available`) — trigger: user explicitly asks
- [ ] In-tray "Check for updates now…" menu item — trigger: user requests on-demand check

### Future Consideration (v5+)

- [ ] Auto-download / one-click upgrade — would require Squirrel.Windows or equivalent; large scope; tracked in PROJECT.md "Out of Scope"
- [ ] Beta channel toggle — would require `/releases` listing parser and channel UX

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `VersionComparator` Core helper + unit tests | HIGH (testable foundation) | LOW | P1 — must have, blocks all other work |
| `AppSettings.UpdateChecksEnabled` + persistence + reset | HIGH (opt-out mechanism) | LOW | P1 — must have for privacy/network ethics |
| `UpdateCheckService` HTTP + parse + timeout + cancel | HIGH (the actual network logic) | MEDIUM (async + threading discipline) | P1 — core feature |
| `UpdateText` TextBlock + theme/contrast wiring | HIGH (the visible artifact) | LOW (clones TempsText pattern) | P1 — core feature |
| `ChkUpdateChecksEnabled` checkbox + event + handler | HIGH (user-facing toggle) | LOW (clones existing checkbox pattern) | P1 — core feature |
| Cancel in-flight CTS on toggle OFF | MEDIUM (architectural cleanliness) | LOW (one extra Cancel call) | P1 — "do it once, do it right" |
| Silent failure on network errors | HIGH (don't break the desktop ornament aesthetic) | LOW (try/catch wrapper) | P1 — core feature |
| AppSettings absent-field test for upgrade safety | HIGH (prevents silent opt-out for v4.4 users) | LOW (clones STEST-02 pattern) | P1 — must have |

All features are P1 for v4.5. There is no P2 in this milestone.

---

## Competitor / Reference App Analysis

| Feature | Notepad++ | KeePass | ShareX | RetroBar | FuzzyClock v4.5 |
|---------|-----------|---------|--------|----------|-----------------|
| Notice format | Modal dialog "A new version is available!" | Modal dialog "New version available" | Toast notification | In-app status strip | In-widget passive line `vX.Y.Z available` |
| Suppression states | Disabled toggle, version-equal | Disabled toggle, version-equal | Disabled toggle | Disabled toggle, version-equal, network failure | Disabled, version-equal-or-ahead, network failure, in-flight |
| Pre-release filter | Stable channel only | Stable channel only | Stable channel only | Stable channel only | Stable only via `/releases/latest` |
| Cadence | On-launch + manual | On-launch + manual | Configurable | On-launch | On-launch only (no manual, no recurring) |
| Settings label | "Check for updates" | "Check for updates" | "Check for updates" | "Check for updates" | `Check for updates on launch` (frequency-explicit) |
| Failure indicator | Sometimes shows error dialog | Silent | Silent | Silent | Silent (matches indie-utility consensus) |
| Symbol prefix on notice | None | None | None | None | None (matches consensus) |

**Verdict:** FuzzyClock's chosen patterns align with the **dominant indie-Windows-utility consensus** on every dimension. The choice to be **more silent than average** (no toast, no dialog, no failure indicator, no manual check) is consistent with the widget's minimalist aesthetic and is a deliberate scope choice, not a missing feature.

---

## Open Questions for plan-phase

These are questions I could not resolve from research; they should surface in REQUIREMENTS.md or be answered by the user before phase planning:

1. **GitHub repo coordinates:** What are the canonical `{owner}` and `{repo}` for the GitHub Releases API URL? The .iss / release.yml files reference `FuzzyClock` but the GitHub repo URL needs explicit confirmation. Suggested env var or hard-coded const in UpdateCheckService.
2. **User-Agent header:** GitHub's API requires a User-Agent header (returns 403 without it). Suggested: `FuzzyClock/{Assembly.GetExecutingAssembly().GetName().Version}`.
3. **Rate-limit posture:** Anonymous GitHub API allows 60 requests/hour per IP. With once-per-launch and a desktop widget, this is a non-issue, but plan-phase should be aware. No ETag / If-None-Match handling needed for v4.5.
4. **Test stub for UpdateCheckService:** Should there be an `IUpdateSource` interface for test injection (mirrors `ITempSource` in v4.2)? Recommended yes — it enables an `IUpdateSource` test double in App.Tests that returns canned `tag_name` strings, avoiding network calls in CI. Same pattern as `FakeTempSource`.
5. **Assembly version source:** `Assembly.GetExecutingAssembly().GetName().Version` vs `AssemblyInformationalVersionAttribute`? The CI pipeline (release.yml) injects from git tag — confirm which attribute it sets. If it sets `AssemblyVersion`, use `GetName().Version`. If it sets `InformationalVersion`, use that (but that field can include pre-release suffixes like `-beta`, requiring extra parsing).

---

## Sources

- **GitHub REST API documentation** — `/repos/{owner}/{repo}/releases/latest` filtering behavior — verified via WebFetch, **HIGH confidence**
- **Semantic Versioning 2.0.0 spec (semver.org)** — §11 precedence rules — verified via WebFetch, **HIGH confidence**
- **Microsoft Writing Style Guide for Windows Apps** (`learn.microsoft.com/en-us/windows/apps/design/style/writing-style`) — verified via WebFetch, **HIGH confidence**
  - "Lead with what's important", "Be crisp and clear", "Don't end checkbox text with a period", "Active voice"
- **FuzzyClock TemperatureService.cs** — existing CancellationTokenSource pattern at `FuzzyClock.App/TemperatureService.cs` lines 70, 139, 220 — **HIGH confidence**
- **FuzzyClock MainWindow.xaml.cs** — Phase 33 dual-path Foreground pattern at lines 1918 + 1956 — **HIGH confidence**
- **FuzzyClock PROJECT.md "Out of Scope" v4.5 entries** — confirms anti-feature list — **HIGH confidence**
- **Indie Windows utility consensus** (KeePass, Notepad++, ShareX, RetroBar) — checkbox label conventions and notice phrasing — **MEDIUM confidence** (no single canonical source, but pattern is consistent across the surveyed apps)

---

*Feature research for: v4.5 Update Checker (FuzzyClock)*
*Researched: 2026-05-29*
