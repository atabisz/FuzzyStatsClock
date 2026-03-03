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
- **v2.5 Unit Tests** (2026-03-03) — Core logic extraction (UptimeFormatter + DialGeometry); FuzzyClock.App.Tests; SettingsService testability refactor; CI test gate. 3 phases, 3 plans. → [Archive](milestones/v2.5-ROADMAP.md)

## Phases

<details>
<summary>✅ v2.2 System Tray (Phase 24) — SHIPPED 2026-03-02</summary>

- [x] **Phase 24: System Tray Icon** — NotifyIcon with tray context menu (Reset to Defaults, Quit); Reset sets White accent + 100% opacity + 16pt font + phrase mode + centered position and saves immediately; Quit exits cleanly; analog clock face icon (16×16 dark circle, white hands at 10:10); tray icon disposed on window close (completed 2026-03-02)

</details>

<details>
<summary>✅ v2.3 Ghost Mode (Phases 25–27) — SHIPPED 2026-03-02</summary>

- [x] **Phase 25: Centered Phrase Text** — TextAlignment=Center on PhraseText and ShadowText TextBlocks; phrase text is horizontally centered in the widget content area (completed 2026-03-02)
- [x] **Phase 26: Ghost Mode Core** — Widget becomes Opacity=0 and click-through (WS_EX_TRANSPARENT) on MouseEnter with no modifier; restores on mouse exit with all hover state cleanly reset (completed 2026-03-02)
- [x] **Phase 27: Ctrl+Alt Interaction Modifier** — Holding left Ctrl+left Alt while hovering suppresses ghost activation; all existing hover behaviors (backdrop, fast-refresh, drag, right-click, scroll) activate normally (completed 2026-03-02)

</details>

<details>
<summary>✅ v2.5 Unit Tests (Phases 28–30) — SHIPPED 2026-03-03</summary>

- [x] **Phase 28: Core Logic Extraction + Tests** — UptimeFormatter and DialGeometry extracted into FuzzyClock.Core as pure static classes; 13 MSTest boundary-condition tests (7 + 6) all passing (completed 2026-03-02)
- [x] **Phase 29: App Test Infrastructure + Settings Tests** — FuzzyClock.App.Tests (net10.0-windows, MSTest 4.0.1); SettingsService refactored with Validate() + pure Clamp() overload; 9 test cases passing (completed 2026-03-03)
- [x] **Phase 30: CI Test Gate** — dotnet restore → dotnet test → dotnet publish step order in release.yml; no continue-on-error; all 73 tests gate the release artifact (completed 2026-03-03)

</details>

### v2.6 Polish (In Progress)

**Milestone Goal:** Widget is effortless to set up — launches automatically at Windows login and always returns to the right position on the right monitor.

- [x] **Phase 31: Auto-Launch at Login** — Tray toggle writes/removes HKCU Run registry entry; state shown as checkmark; persisted to settings.json (completed 2026-03-03)
- [x] **Phase 32: Per-Monitor Position Memory** — Widget tracks last-used position per monitor by identity; restores to correct monitor on startup; centers on primary if monitor absent (completed 2026-03-03)
- [ ] **Phase 33: Auto-Contrast** — Tray toggle enables screen-color sampling under widget footprint; switches text to black or white when WCAG contrast insufficient; restores accent color when contrast is sufficient again

## Phase Details

### Phase 31: Auto-Launch at Login
**Goal**: User can make the widget start automatically at Windows login, controlled from the tray menu
**Depends on**: Phase 30
**Requirements**: STRT-01, STRT-02, STRT-03
**Plans**: 1 plan
Plans:
- [ ] 31-01-PLAN.md — Add AutoLaunchEnabled to AppSettings, create AutoLaunchService, wire tray toggle
**Success Criteria** (what must be TRUE):
  1. Tray context menu has an "Auto-Launch at Login" item with a checkmark that reflects the current state each time the menu opens
  2. Clicking the item toggles auto-launch on and off; the checkmark updates immediately
  3. When auto-launch is enabled, a registry entry under HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run points to the application executable
  4. When auto-launch is disabled, the registry entry is absent
  5. The auto-launch preference survives an application restart (persisted to settings.json and restored on launch)

### Phase 32: Per-Monitor Position Memory
**Goal**: Widget restores to the last-used position on the active monitor, not a fixed default
**Depends on**: Phase 31
**Requirements**: MON-01, MON-02, MON-03
**Plans**: 3 plans
Plans:
- [ ] 32-01-PLAN.md — Create MonitorService and update AppSettings schema (MonitorPositions + LastActiveMonitor)
- [ ] 32-02-PLAN.md — Update SettingsService (migration, new Clamp overloads, tests)
- [ ] 32-03-PLAN.md — Wire MainWindow (ApplySettings restore, SaveSettings per-monitor, cross-monitor drag)
**Success Criteria** (what must be TRUE):
  1. After dragging the widget on a given monitor and restarting, the widget appears at the saved position on that same monitor
  2. With two monitors connected, positions saved on each monitor are independent — moving the widget on monitor A does not affect the saved position on monitor B
  3. When a previously-used monitor is not connected at startup, the widget centers on the primary screen instead of appearing off-screen

### Phase 33: Auto-Contrast
**Goal**: Widget text remains readable regardless of what is on the screen behind it
**Depends on**: Phase 32
**Requirements**: CONTRAST-01, CONTRAST-02, CONTRAST-03, CONTRAST-04
**Success Criteria** (what must be TRUE):
  1. Tray context menu has an "Auto-Contrast" item (off by default); clicking it enables the feature; clicking again disables it; state persisted to settings.json
  2. When auto-contrast is enabled and the widget is over a light background, the text switches to black (or white, whichever provides better contrast) automatically
  3. When the background behind the widget becomes dark enough that the configured accent color meets the WCAG contrast threshold, the text restores to the configured accent color
  4. When auto-contrast is disabled, text always displays in the configured accent color regardless of background
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
| 29. App Test Infrastructure + Settings Tests | v2.5 | 1/1 | Complete | 2026-03-03 |
| 30. CI Test Gate | v2.5 | 1/1 | Complete | 2026-03-03 |
| 31. Auto-Launch at Login | v2.6 | 1/1 | Complete | 2026-03-03 |
| 32. Per-Monitor Position Memory | 3/3 | Complete    | 2026-03-03 | - |
| 33. Auto-Contrast | v2.6 | 0/? | Not started | - |

---
*Last updated: 2026-03-03 — Phase 32 planned (3 plans)*
