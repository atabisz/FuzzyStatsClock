# Roadmap: Fuzzy Clock

## Milestones

- **v1.0 MVP** (2026-02-25) — Phrase engine, transparent WPF overlay, full integration. 3 phases, 7 plans. → [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Position + Font Size** (2026-02-25) — Drag reposition, position persistence, font size selector. 2 phases, 3 plans. → [Archive](milestones/v1.1-ROADMAP.md)
- **v1.2 System Stats** (2026-02-26) — CPU / GPU / MEM stats panel, update interval selector, show/hide toggle, persistence. 4 phases, 5 plans. → [Archive](milestones/v1.2-ROADMAP.md)
- **v1.3 Individual Stat Visibility** (2026-02-26) — Per-row CPU/GPU/MEM visibility toggles, auto-collapse, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.3-ROADMAP.md)
- **v1.4 PAG Stat Row** (2026-02-26) — Paging file % usage as fourth stat row, visibility toggle, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.4-ROADMAP.md)
- **v1.5 Hover Fast-Refresh** (2026-02-26) — Mouse-hover accelerates stats to 0.5s cadence; leave restores configured rate; guarded when stats hidden. 1 phase, 1 plan. → [Archive](milestones/v1.5-ROADMAP.md)
- **v1.6 Dial Mode** (2026-02-26) — Minimal analog dial (hour + minute hands, no face) toggle via right-click menu; persisted; stats panel unaffected. 1 phase, 2 plans. → [Archive](milestones/v1.6-ROADMAP.md)
- **v1.7 Visual Polish** (2026-02-26) — Hover backdrop (semi-transparent when stats visible), drag pause. 1 phase, 1 plan. → [Archive](milestones/v1.7-ROADMAP.md)
- **v1.8 Dial Enhancement** (2026-02-26) — Unconditional hover backdrop fix; dial face decorations (tick marks, minute marks, hour numbers) with per-item toggles, persistence, and mode-conditional menu visibility. 2 phases, 3 plans. → [Archive](milestones/v1.8-ROADMAP.md)
- **v1.9 Context-Aware Menus** (2026-02-26) — Font Size submenu hidden in dial mode; reappears in phrase mode. 1 phase, 2 plans. → [Archive](milestones/v1.9-ROADMAP.md)
- **v2.0 Visual Identity** (2026-02-27) — Accent color themes (5 presets + custom picker) and window opacity control (presets + scroll wheel). 4 phases, 7 plans. → [Archive](milestones/v2.0-ROADMAP.md)
- **v2.1 Uptime** (2026-02-27) — System uptime and rolling CPU load averages (1m/5m/15m) as a compact single line below the stats panel; toggleable and persisted. 2 phases, 2 plans. → [Archive](milestones/v2.1-ROADMAP.md)
- **v2.2 System Tray** (2026-03-02) — System tray icon (analog clock face) with Reset to Defaults and Quit; clean icon removal on exit. 1 phase, 2 plans. → [Archive](milestones/v2.2-ROADMAP.md)
- **v2.3 Ghost Mode** (2026-03-02) — Phrase text centering; auto-hide on hover (Opacity=0 + click-through); Ctrl+Alt interaction modifier. 3 phases, 3 plans. → [Archive](milestones/v2.3-ROADMAP.md)
- **v2.4 Tray-Only Controls** (2026-03-03) — All settings migrated to system tray ContextMenuStrip; right-click context menu removed from widget. Ad-hoc, no formal phases.
- **v2.5 Unit Tests** (In Progress) — Core logic extraction into FuzzyClock.Core; FuzzyClock.App.Tests project; SettingsService refactor for testability; CI test gate. 3 phases.

## Phases

<details>
<summary>✅ v2.2 System Tray (Phase 24) — SHIPPED 2026-03-02</summary>

- [x] **Phase 24: System Tray Icon** — NotifyIcon with tray context menu (Reset to Defaults, Quit); Reset sets White accent + 100% opacity + 16pt font + phrase mode + centered position and saves immediately; Quit exits cleanly; analog clock face icon (16×16 dark circle, white hands at 10:10); tray icon disposed on window close (completed 2026-03-02)

</details>

<details>
<summary>✅ v2.3 Ghost Mode (Phases 25–27) — SHIPPED 2026-03-02</summary>

**Milestone Goal:** The widget gets out of your way automatically — it disappears when you hover over it and reappears when you move away, with Ctrl+Alt as the opt-in interaction modifier.

- [x] **Phase 25: Centered Phrase Text** — TextAlignment=Center on PhraseText and ShadowText TextBlocks; phrase text is horizontally centered in the widget content area (completed 2026-03-02)
- [x] **Phase 26: Ghost Mode Core** — Widget becomes Opacity=0 and click-through (WS_EX_TRANSPARENT) on MouseEnter with no modifier; restores on mouse exit with all hover state cleanly reset (completed 2026-03-02)
- [x] **Phase 27: Ctrl+Alt Interaction Modifier** — Holding left Ctrl+left Alt while hovering suppresses ghost activation; all existing hover behaviors (backdrop, fast-refresh, drag, right-click, scroll) activate normally (completed 2026-03-02)

### Phase 25: Centered Phrase Text
**Goal**: Phrase text is horizontally centered within the widget content area in phrase mode
**Depends on**: Phase 24 (v2.2 complete) | **Requirements**: CENTER-01

Plans:
- [x] 25-01-PLAN.md — Add TextAlignment=Center + HorizontalAlignment=Stretch to ShadowText and PhraseText; human verify centering at all font sizes (completed 2026-03-02)

### Phase 26: Ghost Mode Core
**Goal**: Widget auto-hides when the mouse enters — becomes invisible and click-through — and restores to its configured state when the mouse leaves
**Depends on**: Phase 25 | **Requirements**: GHOST-01, GHOST-02, GHOST-03

Plans:
- [x] 26-01-PLAN.md — Implement ghost mode core (P/Invoke + DispatcherTimer+GetCursorPos) and human verify activation/restore/state correctness (completed 2026-03-02)

### Phase 27: Ctrl+Alt Interaction Modifier
**Goal**: Holding left Ctrl + left Alt while hovering suppresses ghost mode and keeps the widget fully interactive
**Depends on**: Phase 26 | **Requirements**: CTRLALT-01, CTRLALT-02

Plans:
- [x] 27-01-PLAN.md — Add GetAsyncKeyState P/Invoke + Ctrl+Alt guard in Window_MouseEnter; human verify modifier suppresses ghost and activates hover behaviors (completed 2026-03-02)

</details>

### v2.5 Unit Tests (Phases 28–30)

**Milestone Goal:** Core logic is independently testable in FuzzyClock.Core; SettingsService validation is testable without file I/O; CI prevents a broken build from producing a release artifact.

- [x] **Phase 28: Core Logic Extraction + Tests** — Extract UptimeFormatter and DialGeometry into FuzzyClock.Core; add tests for both in FuzzyClock.Core.Tests (completed 2026-03-02)
- [x] **Phase 29: App Test Infrastructure + Settings Tests** — Add FuzzyClock.App.Tests project; refactor SettingsService for testability (Validate method + pure Clamp overload); write all settings tests (completed 2026-03-03)
- [ ] **Phase 30: CI Test Gate** — Add dotnet test step to release.yml before dotnet publish; workflow fails fast on test failure

## Phase Details

### Phase 28: Core Logic Extraction + Tests
**Goal**: Pure functions from MainWindow live in FuzzyClock.Core with verified behavior across known boundary inputs
**Depends on**: Nothing (first phase of milestone)
**Requirements**: EXTRACT-01, EXTRACT-02, UTEST-01, UTEST-02
**Success Criteria** (what must be TRUE):
  1. `dotnet test FuzzyClock.Core.Tests` reports all UptimeFormatter and DialGeometry tests passing with zero failures
  2. UptimeFormatter.Format handles sub-hour (no days/hours prefix), exactly-1h boundary, hours-only, exactly-1d boundary, and days+hours+minutes — each case returns the correct "up ..." string
  3. DialGeometry.GetHandAngle for 12:00 returns 0 degrees for both hour and minute hands; 3:00 returns 90 degrees for the hour hand; 6:00 returns 180 degrees; 3:15 returns correct interpolated minute-hand angle
  4. The application builds, launches, and displays uptime/dial identically to before extraction — no behavior change visible at runtime
**Plans**: 1 plan
Plans:
- [ ] 28-01-PLAN.md — Extract UptimeFormatter + DialGeometry into FuzzyClock.Core; add tests; update MainWindow call sites

### Phase 29: App Test Infrastructure + Settings Tests
**Goal**: SettingsService validation and AppSettings JSON behavior are verified by an automated test suite in FuzzyClock.App.Tests
**Depends on**: Phase 28
**Requirements**: TINFRA-01, STEST-01, STEST-02, STEST-03, STEST-04, STEST-05, STEST-06, STEST-07
**Success Criteria** (what must be TRUE):
  1. `dotnet test FuzzyClock.App.Tests` reports all settings tests passing with zero failures; `dotnet test` from the solution root runs both test projects
  2. AppSettings round-trip test passes: a fully-populated AppSettings instance serializes to JSON and deserializes back with every field matching the original value
  3. Deserializing JSON that omits the UptimeVisible field yields UptimeVisible=true (the init default), confirming the absent-field-as-init-default pattern is enforced
  4. SettingsService.Validate() is a callable static method with no file I/O dependency; tests confirm it corrects StatsIntervalSeconds=0 to 3, Opacity=0.0 to 1.0, and null/whitespace AccentColor to "#FFFFFFFF"
  5. SettingsService.Clamp() pure overload (taking explicit vLeft/vTop/vWidth/vHeight parameters) clamps out-of-bounds positions into bounds and leaves already-in-bounds positions unchanged
**Plans**: 1 plan
Plans:
- [ ] 29-01-PLAN.md — Create FuzzyClock.App.Tests project; refactor SettingsService (Validate + pure Clamp); write AppSettingsTests + SettingsServiceTests; verify dotnet test passes

### Phase 30: CI Test Gate
**Goal**: A broken build cannot produce a GitHub release artifact
**Depends on**: Phase 29
**Requirements**: CI-01
**Success Criteria** (what must be TRUE):
  1. release.yml contains a `dotnet test` step that runs before any `dotnet publish` step
  2. Introducing a deliberate failing test assertion causes the GitHub Actions workflow to fail before the publish/upload steps execute — no release artifact is created
  3. Reverting the deliberate failure and pushing a clean build produces the release artifact as before — no regressions to the existing release workflow
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–23 | v1.0–v2.1 | All | Complete | See archives |
| 24. System Tray Icon | v2.2 | 2/2 | Complete | 2026-03-02 |
| 25. Centered Phrase Text | v2.3 | 1/1 | Complete | 2026-03-02 |
| 26. Ghost Mode Core | v2.3 | 1/1 | Complete | 2026-03-02 |
| 27. Ctrl+Alt Interaction Modifier | v2.3 | 1/1 | Complete | 2026-03-02 |
| 28. Core Logic Extraction + Tests | v2.5 | 1/1 | Complete | 2026-03-02 |
| 29. App Test Infrastructure + Settings Tests | 1/1 | Complete    | 2026-03-03 | - |
| 30. CI Test Gate | v2.5 | 0/? | Not started | - |

---
*Last updated: 2026-03-03 — Phase 29 planned (1 plan)*
