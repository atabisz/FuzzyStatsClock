# Roadmap: FuzzyStatsClock

## Milestones

- 🚧 **v4.5 Update Checker** — Phase 88 (in progress, started 2026-05-29)
- ✅ **v4.4 Smooth Ghost Fade Under Load** — Phases 85–87 (shipped 2026-05-21) — [archive](./milestones/v4.4-ROADMAP.md)
- ✅ **v4.3 Configurable Ghost Override** — Phases 81–84 (shipped 2026-05-07) — [archive](./milestones/v4.3-ROADMAP.md)
- ✅ **v4.2 Temps & Menu** — Phases 75–80 (shipped 2026-05-04) — [archive](./milestones/v4.2-ROADMAP.md)
- ✅ **v4.1 Polish & Phrases** — Phases 70–74 (shipped 2026-04-01) — [archive](./milestones/v4.1-ROADMAP.md)
- ✅ **v4.0 Proximity Ghost Mode** — Phases 66–69 (shipped 2026-03-27) — [archive](./milestones/v4.0-ROADMAP.md)
- ✅ **v3.9 LCD Clock + Japanese** — Phases 61–65 (shipped 2026-03-27) — [archive](./milestones/v3.9-ROADMAP.md)
- ✅ **v3.8 Dial Settings** — Phase 60 (shipped 2026-03-23) — [archive](./milestones/v3.8-ROADMAP.md)
- ✅ **v3.7 Nixie Clock** — Phases 58–59 (shipped 2026-03-23) — [archive](./milestones/v3.7-ROADMAP.md)
- ✅ **v3.6.2 Contrast Fix** — Phase 58 (shipped 2026-03-19) — [archive](./milestones/v3.6.2-ROADMAP.md)
- ✅ **v3.5 Phrase Wrap + Installer** — Phases 48–55 (shipped 2026-03-18) — [archive](./milestones/v3.5-ROADMAP.md)
- ✅ **v3.2 Expanded Experience** — Phases 41–47 (shipped 2026-09-09) — [archive](./milestones/v3.2-ROADMAP.md)
- ✅ **v3.1 Quality + Battery** — Phases 37–40 (shipped 2026-03-08) — [archive](./milestones/v3.1-ROADMAP.md)
- ✅ **v3.0 Date Display** — Phase 36 (shipped 2026-03-07) — [archive](./milestones/v3.0-ROADMAP.md)
- ✅ Earlier milestones (v1.0 – v2.9) — see [archives](./milestones/) + [MILESTONES.md](./MILESTONES.md)

---

## 🚧 v4.5 Update Checker (In Progress)

**Milestone Goal:** Notify the user when a newer FuzzyClock release is available on GitHub by rendering a one-line accent-colored "vX.Y.Z available" notice at the bottom of the stats panel; provide a Settings toggle to disable the check entirely. Pure additive feature — no breaking changes to existing surfaces, silent-failure posture.

**Defined:** 2026-05-29
**Granularity:** standard
**Coverage:** 34/34 v1 requirements mapped to Phase 88 ✓

### Phases

- [ ] **Phase 88: GitHub Releases Update Checker** — Once-per-launch GitHub release lookup with accent-colored widget notice and Settings toggle

### Phase Details

#### Phase 88: GitHub Releases Update Checker

**Goal**: Once-per-launch GitHub Releases API lookup with accent-colored "vX.Y.Z available" notice line on widget, Settings → Behavior toggle (default ON) for opt-out, silent-failure posture across all error paths, full Phase 33 dual-path theme/contrast participation, three-tier dispose for the new service, dev-build `#if DEBUG` skip to prevent polluted screenshots.
**Depends on**: Phase 87 (v4.4 Smooth Ghost Fade) — milestone-tail, no in-milestone predecessor
**Requirements**: UPD-01, UPD-02, UPD-03, UPD-04, UPD-05, UPD-06, UPD-07, UPD-08, UPD-09, UPD-10, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, PERS-01, PERS-02, PERS-03, PERS-04, PERS-05, PERS-06, PERS-07, PERS-08, PERS-09, PERS-10, PERS-11, PERS-12, DEV-01, DEV-02, DEV-03, DOCS-01
**Success Criteria** (what must be TRUE when this phase completes):

  1. **User sees the notice when a newer release exists.** When a tagged GitHub release exists with a version strictly greater than the running assembly version, the widget displays `vX.Y.Z available` (with `v` prefix preserved) as a new 8th/last child of `StatsPanel`, immediately below `TempsText`. Notice is byte-for-byte styled identically to `TempsText`/`UptimeText` (Margin=0,2,0,0; Segoe UI Light; FontSize=11; design-time White; Left-aligned).
  2. **The user-controlled opt-out works in both directions.** With "Check for updates on launch" toggled ON in Settings → Behavior (default), the once-per-launch HTTPS GET to `api.github.com/repos/{owner}/FuzzyClock/releases/latest` runs at `ContentRendered` via `Dispatcher.BeginInvoke(ApplicationIdle)`. Toggling OFF mid-session immediately collapses any visible notice and cancels the in-flight CTS; with the toggle OFF at launch, no network call is dispatched at all. The setting persists across restarts via `AppSettings.UpdateChecksEnabled` (init default `= true`, JSON round-trip + absent-field tests pass).
  3. **The notice participates in accent theming and auto-contrast (Phase 33 dual-path invariant).** `UpdateText.Foreground` is set in BOTH `ApplyTheme` AND `ApplyDisplayColor`, so the notice tracks the user's accent color through both preset/custom selection AND auto-contrast black/white switching when over a low-contrast background.
  4. **All failure paths produce zero visible feedback (silent-failure posture).** Network errors, timeouts (5s hard cap via linked CTS), 403/404/429 status codes, malformed JSON, draft/pre-release tags, parse failures in `UpdateVersionComparer.TryParseTag`, and `#if DEBUG` builds all leave `UpdateText.Visibility = Collapsed`. `UpdateCheckService` catches only the narrow exception set (`HttpRequestException`, `TaskCanceledException`, `OperationCanceledException`, `JsonException`, `FormatException`, `ArgumentException`) — never `catch (Exception)`. Service Dispose is idempotent via `Interlocked.CompareExchange` and registered three-tier (`OnClosing` + `SessionEnding` + `ProcessExit`) mirroring `TemperatureService`.
  5. **The full v4.4 baseline (587 MSTest) plus new tests pass green; csproj version drift fixed.** `UpdateVersionComparerTests` (~13–17 DataRow rows) covers tag parse normal + reject paths and `IsNewer` ordering. Service-shape tests (~6–8 via `FakeHttpMessageHandler` seam) validate happy path, narrow-exception handling, `#if DEBUG` skip, and request shape (User-Agent, Accept). AppSettings round-trip + absent-field tests cover `UpdateChecksEnabled` survival and `= true` default. `<InformationalVersion>` synced to match `<Version>` (currently stale at `3.6.0`). `Assembly.GetName().Version` is the canonical running-version source, never `AssemblyInformationalVersion`. README updated with one-paragraph mention of the notice line and Settings toggle.

**Plans**: 4 plans

Plans:
- [ ] 88-01: UpdateVersionComparer Core helper + tests — `FuzzyClock.Core/UpdateVersionComparer.cs` (`TryParseTag`/`IsNewer`), `FuzzyClock.Core.Tests/UpdateVersionComparerTests.cs` (~13–17 DataRow rows). Pitfall tag: UPD-VER. Requirements: UPD-01, UPD-02.
- [ ] 88-02: UpdateCheckService + AppSettings + service-shape tests + csproj version sync — Service in `FuzzyClock.App` (`HttpClient` static + 5s linked CTS + source-gen `JsonSerializerContext` + narrow exceptions + `#if DEBUG` skip + `Interlocked` Dispose), `AppSettings.UpdateChecksEnabled = true` init field, ~6–8 tests via `FakeHttpMessageHandler` seam, `<InformationalVersion>` sync to `<Version>`, `git remote get-url origin` resolution for `internal const` repo URL. Pitfall tags: UPD-SVC + UPD-SETT (settings half) + DEV-VER. Requirements: UPD-03..UPD-10, PERS-01..PERS-05, DEV-01, DEV-02, DEV-03.
- [x] 88-03: UI wiring + Settings tab + three-tier dispose — `MainWindow.xaml` (new `UpdateText` TextBlock as 8th StatsPanel child) + `MainWindow.xaml.cs` (~8 discrete edits: service field, `ContentRendered` kickoff, `UpdateUpdateNoticeDisplay`, `ApplyTheme` + `ApplyDisplayColor` Phase 33 dual-path, re-clamp on visibility flip, `OnClosing` Dispose tier 1, `OpenSettings` event subscription with mid-session CTS cancel, `ResetToDefaults` field reset). `SettingsWindow.xaml` (new `ChkUpdateChecksEnabled` checkbox in Behavior tab cloning `ChkAutoLaunchEnabled`) + `SettingsWindow.xaml.cs` (event + `_suppressEvents`-guarded `PopulateControls` + `SettingsSnapshot.UpdateChecksEnabled`). `App.xaml.cs` dispose tiers 2 + 3 (`SessionEnding` + `OnProcessExit`). Pitfall tags: UPD-WIRE + UPD-SETT (UI half). Requirements: UI-01..UI-08, PERS-06..PERS-12.
- [ ] 88-04: Human-verify + close-out — No code. Live dev-box checklist: `#if DEBUG` shows no notice; offline launch is silent; toggle OFF mid-flight cancels and collapses; theme switch + auto-contrast flip both repaint `UpdateText`; SmartScreen/Defender behavior on first outbound HTTPS; absent-field upgrade test from real v4.4 `settings.json`; near-edge re-clamp when notice flips visible; README pass. Pitfall tag: UPD-VERIFY. Requirements: DOCS-01 (final write — README mention).

**Single-phase rationale (research-confirmed by all 4 researchers — STACK, FEATURES, ARCHITECTURE, PITFALLS):** Build order is FORCED by C# project references (`FuzzyClock.Core` → `FuzzyClock.App` → tests → UI). The whole feature is smaller than any single v4.4 phase — splitting into multiple milestone phases would add ceremony without seams. Plan-level seams (Plan-01 through Plan-04) provide all the natural boundaries needed.

---

## Progress

**Execution Order:**
Phases execute in numeric order. v4.5 has a single phase (88) with 4 internal plans executing 88-01 → 88-02 → 88-03 → 88-04.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 88. GitHub Releases Update Checker | 3/4 | In Progress|  | - |

---

*Roadmap drafted: 2026-05-29 — v4.5 Update Checker, single phase 88, 4 plans, 34/34 requirements mapped*
