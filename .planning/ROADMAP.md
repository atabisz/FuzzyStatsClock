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
- **v2.6 Polish** (2026-03-03) — Auto-launch at login (registry toggle via tray) and per-monitor position memory (MonitorService + AppSettings migration). 2 phases, 4 plans. → [Archive](milestones/v2.6-ROADMAP.md)
- **v2.7 Auto-Contrast** (2026-03-03) — WCAG screen-color sampling under widget footprint; text switches to black/white when contrast insufficient; restores accent when contrast is sufficient. 1 phase, 3 plans. → [Archive](milestones/v2.7-ROADMAP.md)
- **v2.8 Uptime and Docs** (2026-03-04) — Active process count (`{N}p`) on uptime line; README accuracy pass. 1 phase, 2 plans. → [Archive](milestones/v2.8-ROADMAP.md)
- **v2.9 Process Threshold** (2026-03-05) — Configurable process count threshold (2%/5%/10% CPU) selectable from tray Stats submenu; persisted; immediate display refresh. 1 phase, 1 plan. → [Archive](milestones/v2.9-ROADMAP.md)
- **v3.0 Date Display** (2026-03-07) — Date line below clock/dial, muted accent color, 4 format options, show/hide tray toggle, persisted. 1 phase, 2 plans. → [Archive](milestones/v3.0-ROADMAP.md)
- **v3.1 Quality + Battery** (2026-03-08) — Battery stat row, DateFormatter extraction with tests, AppSettings round-trip coverage, README accuracy pass. 4 phases, 6 plans. → [Archive](milestones/v3.1-ROADMAP.md)
- **v3.2 Expanded Experience** (in progress) — Settings window (3-tab), named themes, battery low alert, English phrase style personalities, multilingual phrases. 6 phases, 41–46.

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

<details>
<summary>✅ v2.6 Polish (Phases 31–32) — SHIPPED 2026-03-03</summary>

- [x] **Phase 31: Auto-Launch at Login** — Tray toggle writes/removes HKCU Run registry entry; state shown as checkmark; persisted to settings.json (completed 2026-03-03)
- [x] **Phase 32: Per-Monitor Position Memory** — Widget tracks last-used position per monitor by identity; restores to correct monitor on startup; centers on primary if monitor absent (completed 2026-03-03)

</details>

<details>
<summary>✅ v2.7 Auto-Contrast (Phase 33) — SHIPPED 2026-03-03</summary>

- [x] **Phase 33: Auto-Contrast** — Tray toggle enables screen-color sampling under widget footprint (BitBlt/WCAG); switches text to black or white when contrast insufficient; restores accent when contrast is sufficient; pauses on ghost mode/opacity=0/drag (completed 2026-03-03)

</details>

<details>
<summary>✅ v2.8 Uptime and Docs (Phase 34) — SHIPPED 2026-03-04</summary>

- [x] **Phase 34: Uptime Process Count + README** — Verify process count appended to uptime line; README accurately reflects all v2.7+ features and interaction model (completed 2026-03-04)

</details>

<details>
<summary>✅ v2.9 Process Threshold (Phase 35) — SHIPPED 2026-03-05</summary>

- [x] **Phase 35: Process Count Threshold** — `ProcessCountThresholdPercent` (default 5.0) in AppSettings; three mutually-exclusive checkable tray Stats submenu items (2%/5%/10%); `UpdateUptimeDisplay()` uses persisted threshold; immediate display refresh; Reset to Defaults restores 5% (completed 2026-03-05)

</details>

<details>
<summary>✅ v3.0 Date Display (Phase 36) — SHIPPED 2026-03-07</summary>

- [x] **Phase 36: Date Display Under Clock** — DateText element below phrase/dial in muted accent color (55% alpha); 4 format options (Short/Long/Numeric/ISO); Show Date tray toggle + Date Format submenu; persisted to settings.json; ResetToDefaults restores defaults (completed 2026-03-07)

</details>

<details>
<summary>✅ v3.1 Quality + Battery (Phases 37–40) — SHIPPED 2026-03-08</summary>

- [x] **Phase 37: Battery Stat Row** — Battery charge % stat row below PAG; horizontal bar + percentage text; `⚡ {pct}%` when AC-connected; "N/A" on desktops/VMs; tray Stats toggle; all-five-rows auto-collapse; persisted with default enabled (completed 2026-03-07)
- [x] **Phase 38: Tests + Code Cleanup** — DateFormatter extracted from MainWindow into FuzzyClock.Core with 6 unit tests (all 4 formats); AppSettings round-trip tests for DateVisible/DateFormat; FormatDate deleted from MainWindow; 122 tests total (completed 2026-03-07)
- [x] **Phase 39: Docs Pass** — README updated to describe v3.0 date display and battery row (completed 2026-03-07)
- [x] **Phase 40: README Accuracy Fixes** — Short/Long format examples corrected to match DateFormatter output; test count updated to 122 (completed 2026-03-08)

</details>

### v3.2 Expanded Experience (In Progress)

**Milestone Goal:** Replace the unwieldy tray menu with a proper Settings window; add five named visual themes; introduce English phrase style personalities (Terse/Poetic/Rude); add native phrase sets for French, Spanish, German, Japanese, and Polish; and alert the user when battery is low with a red stat row.

- [x] **Phase 41: PhraseEngine Provider Refactor** - Extract IPhraseProvider interface + EnglishPhraseProvider; PhraseEngine becomes static dispatcher; all 122 tests still pass (completed 2026-03-08)
- [ ] **Phase 42: Settings Window Infrastructure** - SettingsWindow (3 tabs), "Open Settings..." tray item, modeless Owner=MainWindow, SettingsChanged event wired to ApplySettings+SaveSettings
- [ ] **Phase 43: Named Themes** - ThemeDefinition record, BuiltInThemes registry (5 presets), ApplyNamedTheme() batch method, AppSettings.Theme persisted
- [ ] **Phase 44: Battery Low Alert** - Red override on battery row when below threshold and unplugged; BatteryAlertEnabled/BatteryAlertPercent in AppSettings; configurable in Settings window Behavior tab
- [ ] **Phase 45: English Phrase Style Personalities** - PhraseStyle enum (Classic/Terse/Poetic/Rude); bucket tables in EnglishPhraseProvider; AppSettings.PhraseStyle; Settings window wiring; per-style tests
- [ ] **Phase 46: Multilingual Phrases** - Fr/Es/De/Ja/Pl providers; CultureInfo.CurrentUICulture detection; AppSettings.PhraseLocale; Settings window language selector; 1440-minute tests per language

## Phase Details

### Phase 41: PhraseEngine Provider Refactor
**Goal**: Users continue seeing accurate time phrases while the Core is restructured to support multiple phrase styles and languages
**Depends on**: Nothing (first phase of milestone; builds on stable v3.1)
**Requirements**: (infrastructure — no user-visible requirements; unblocks STYLE-01–04 and LANG-01–04)
**Success Criteria** (what must be TRUE):
  1. All 122 existing tests pass without modification after the refactor
  2. `PhraseEngine.GetPhrase()` and `GetStructuredPhrase()` produce identical output to pre-refactor for English Classic style
  3. `IPhraseProvider` interface exists in FuzzyClock.Core and `EnglishPhraseProvider` implements it
  4. `PhraseEngine.SetLocale()` accepts a locale string and can swap providers at runtime
**Plans**: 2 plans
Plans:
- [ ] 41-01-PLAN.md — IPhraseProvider interface + EnglishPhraseProvider extraction + PhraseEngine static facade
- [ ] 41-02-PLAN.md — PhraseEngine coordinator TDD (SetLocale/CurrentLocale contract tests)

### Phase 42: Settings Window Infrastructure
**Goal**: Users can open a dedicated Settings window from the system tray and change all widget settings without hunting through a 40-item tray menu
**Depends on**: Phase 41
**Requirements**: SETT-01, SETT-02, SETT-03, SETT-04, SETT-05, SETT-06, SETT-07
**Success Criteria** (what must be TRUE):
  1. Clicking "Open Settings..." in the tray menu opens a modeless window with three tabs: Appearance, Stats, and Behavior
  2. Changing any control in the Settings window immediately updates the live widget (no Apply button required)
  3. The Settings window stays open and usable while the widget is visible; the widget remains interactive
  4. Tray menu retains Ghost Mode, Stats, Auto-Contrast, and Auto-Launch quick toggles alongside the new "Open Settings..." item
  5. Opening Settings a second time while it is already open brings the existing window to front rather than opening a duplicate
**Plans**: TBD

### Phase 43: Named Themes
**Goal**: Users can apply a named visual theme that sets accent color, opacity, font size, clock style, and stats visibility in one click
**Depends on**: Phase 42
**Requirements**: THM-01, THM-02, THM-03
**Success Criteria** (what must be TRUE):
  1. The Appearance tab in the Settings window offers 5 named built-in themes selectable by the user
  2. Selecting a theme atomically updates accent color, opacity, font size, clock style, and stats panel visibility on the live widget
  3. The active theme name is saved to settings.json and the same theme is restored when the app restarts
  4. All 122 existing tests still pass after theme infrastructure is added
**Plans**: TBD

### Phase 44: Battery Low Alert
**Goal**: Users are visually warned when the battery drops below the configured threshold while unplugged, without needing to check the battery icon
**Depends on**: Phase 43
**Requirements**: ALERT-01, ALERT-02, ALERT-03
**Success Criteria** (what must be TRUE):
  1. When battery is below the alert threshold and not plugged in, the battery stat row text and bar shift to red (`#FFFF4444`)
  2. When the battery rises above the threshold or is plugged in, the battery row returns to the normal accent color
  3. The alert threshold is selectable (10% / 15% / 20%) in the Settings window Behavior tab, defaulting to 20%
  4. The red alert color is not overridden by auto-contrast sampling (both `ApplyTheme()` and `ApplyDisplayColor()` respect the `_batteryAlertActive` flag)
**Plans**: TBD

### Phase 45: English Phrase Style Personalities
**Goal**: Users who want more personality from the widget can switch the English phrase vocabulary to Terse, Poetic, or Rude styles
**Depends on**: Phase 41
**Requirements**: STYLE-01, STYLE-02, STYLE-03, STYLE-04
**Success Criteria** (what must be TRUE):
  1. The Appearance tab in the Settings window offers a Phrase Style selector (Classic / Terse / Poetic / Rude)
  2. Switching to Terse style immediately shows compact phrases such as "half three" or "quarter past" on the live widget
  3. Switching to Poetic style immediately shows evocative phrases such as "the small hours" or "the day grows long" on the live widget
  4. Switching to Rude style immediately shows blunt phrases such as "nearly four, move it" on the live widget
  5. The selected phrase style persists to settings.json and is restored on next launch
**Plans**: TBD

### Phase 46: Multilingual Phrases
**Goal**: Users whose Windows UI language is French, Spanish, German, Japanese, or Polish see time phrases in their native language automatically
**Depends on**: Phase 41, Phase 45
**Requirements**: LANG-01, LANG-02, LANG-03, LANG-04
**Success Criteria** (what must be TRUE):
  1. Widget auto-detects `CultureInfo.CurrentUICulture` on launch and displays phrases in the matching language when supported (fr/es/de/ja/pl)
  2. Each supported language covers all 5-minute time buckets (verified by passing a 1440-minute exhaustive test per language)
  3. A user with an unsupported locale (e.g., Italian) sees English phrases rather than an error
  4. Language is selectable manually via a Phrase Language control in the Settings window Behavior tab, overriding auto-detection
  5. The selected language persists to settings.json and is restored on next launch
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
| 32. Per-Monitor Position Memory | v2.6 | 3/3 | Complete | 2026-03-03 |
| 33. Auto-Contrast | v2.7 | 3/3 | Complete | 2026-03-03 |
| 34. Uptime Process Count + README | v2.8 | 2/2 | Complete | 2026-03-04 |
| 35. Process Count Threshold | v2.9 | 1/1 | Complete | 2026-03-05 |
| 36. Date Display Under Clock | v3.0 | 2/2 | Complete | 2026-03-07 |
| 37. Battery Stat Row | v3.1 | 2/2 | Complete | 2026-03-07 |
| 38. Tests + Code Cleanup | v3.1 | 2/2 | Complete | 2026-03-07 |
| 39. Docs Pass | v3.1 | 1/1 | Complete | 2026-03-07 |
| 40. README Accuracy Fixes | v3.1 | 1/1 | Complete | 2026-03-08 |
| 41. PhraseEngine Provider Refactor | 2/2 | Complete   | 2026-03-08 | - |
| 42. Settings Window Infrastructure | v3.2 | 0/TBD | Not started | - |
| 43. Named Themes | v3.2 | 0/TBD | Not started | - |
| 44. Battery Low Alert | v3.2 | 0/TBD | Not started | - |
| 45. English Phrase Style Personalities | v3.2 | 0/TBD | Not started | - |
| 46. Multilingual Phrases | v3.2 | 0/TBD | Not started | - |

---
*Last updated: 2026-03-08 — Phase 41 planned (2 plans)*
