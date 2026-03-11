---
last_updated: 2026-03-11
---

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
- **v3.2 Expanded Experience** (2026-03-09) — Settings window (3-tab), named themes, battery low alert, English phrase style personalities, multilingual phrases. 7 phases (41–47), 16 plans. → [Archive](milestones/v3.2-ROADMAP.md)
- **v3.3 LCD Clock** (2026-03-11) — 7-segment LCD clock type; WPF-drawn segments; ghost segments; 17 retro color themes; 12/24hr toggle; show/hide seconds; three size variants. 7 phases (48–54), 13 plans. → [Archive](milestones/v3.3-ROADMAP.md)
- **v3.4 Personalities & Nixie** (in progress) — 7 new phrase personality styles (Rude 2.0 + Pirate/Dwarf/Jive/Valley Girl/Yoda/Shakespearean), Nixie tube clock as fourth clock type, dial round/oval shape and size scaling. 3 phases (55–57).

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

<details>
<summary>✅ v3.2 Expanded Experience (Phases 41–47) — SHIPPED 2026-03-09</summary>

- [x] **Phase 41: PhraseEngine Provider Refactor** - Extract IPhraseProvider interface + EnglishPhraseProvider; PhraseEngine becomes static dispatcher; all 122 tests still pass (completed 2026-03-08)
- [x] **Phase 42: Settings Window Infrastructure** - SettingsWindow (3 tabs), "Open Settings..." tray item, modeless Owner=MainWindow, SettingsChanged event wired to ApplySettings+SaveSettings (completed 2026-03-08)
- [x] **Phase 43: Named Themes** - ThemeDefinition record, BuiltInThemes registry (5 presets), ApplyNamedTheme() batch method, AppSettings.Theme persisted (completed 2026-03-08)
- [x] **Phase 44: Battery Low Alert** - Red override on battery row when below threshold and unplugged; BatteryAlertEnabled/BatteryAlertPercent in AppSettings; configurable in Settings window Behavior tab (completed 2026-03-09)
- [x] **Phase 45: English Phrase Style Personalities** - PhraseStyle enum (Classic/Terse/Poetic/Rude); bucket tables in EnglishPhraseProvider; AppSettings.PhraseStyle; Settings window wiring; per-style tests (completed 2026-03-09)
- [x] **Phase 46: Multilingual Phrases** - Fr/Es/De/Ja/Pl providers; CultureInfo.CurrentUICulture detection; AppSettings.PhraseLocale; Settings window language selector; exhaustive per-language tests (completed 2026-03-09)
- [x] **Phase 47: Tech Debt Cleanup** - Ghost theme FontSize 28→24 (Settings button alignment); remove stale AppSettings.cs comment (Phase 45 shipped); remove redundant `_suppressEvents = true` in SettingsWindow constructor (completed 2026-03-09)

</details>

<details>
<summary>✅ v3.3 LCD Clock (Phases 48–54) — SHIPPED 2026-03-11</summary>

- [x] **Phase 48: ClockType Enum Migration** — Replace `bool DialMode` with `ClockType` enum (Phrase/Dial/Lcd) across AppSettings, MainWindow, SettingsWindow, TrayMenuBuilder; JSON backward-compat migration; all 224 existing tests remain green (completed 2026-03-10)
- [x] **Phase 49: SevenSegmentEncoder** — `SevenSegmentEncoder.Encode(char): byte` in FuzzyClock.Core; 7-bit segment masks for digits 0–9, colon, space; 13 unit tests (completed 2026-03-10)
- [x] **Phase 50: WPF Segment Controls** — `SevenSegmentDigit` UserControl (7 Polygon segments, ghost effect, LcdTheme, scales with SegmentHeight); `LcdClockView` UserControl (full HH:MM or HH:MM:SS display, LcdSize enum, 12/24hr, 1s DispatcherTimer) (completed 2026-03-10)
- [x] **Phase 51: App Integration** — AppSettings new fields (LcdTheme/LcdUse24Hr/LcdShowSeconds); MainWindow 3-way clock switching; SettingsWindow LCD button + LCD options panel; Tray "Clock Type" submenu; ResetToDefaults (completed 2026-03-10)
- [x] **Phase 52: Tests + README** — AppSettings round-trip tests for new fields; LcdTimeFormat helper tests; README LCD section + Nixie backlog note; test count updated (completed 2026-03-10)
- [x] **Phase 53: v3.3 LCD Tech Debt Cleanup** — Fix LcdSize persistence in SaveSettings(); add LcdSize to SettingsSnapshot; add Ghost color column to README LCD theme table (completed 2026-03-10)
- [x] **Phase 54: Additional LCD Themes** — Expand LcdTheme enum from 5 to 17 values; add LcdPalette.Get() cases; replace SettingsWindow ComboBox with WrapPanel swatch row; 3 round-trip tests; README updated to 17 themes (completed 2026-03-11)

</details>

### v3.4 Personalities & Nixie (Phases 55–57) — IN PROGRESS

- [x] **Phase 55: Phrase Personalities** - Rude 2.0 rewrite + 6 new English personality providers (Pirate, Dwarf, Jive, Valley Girl, Yoda, Shakespearean); all registered in PhraseEngine, wired in Settings ComboBox, and test-covered (265 tests passing)
- [ ] **Phase 56: Nixie Tube Clock** - NixieClockView + NixieDigit WPF UserControls; warm orange glow via stacked RadialGradientBrush (no UIElement.Effect); stacked ghost cathodes; glass tube border; wire mesh overlay; ClockType.Nixie as 4th enum value; full integration in Settings and tray
- [ ] **Phase 57: Dial Enhancements** - Parametric dial geometry refactor (no more literal 40.0 center); round/oval shape toggle; dial canvas size scales with font size setting; AppSettings.DialShape persisted

## Phase Details

*v3.2 phase details archived to [milestones/v3.2-ROADMAP.md](milestones/v3.2-ROADMAP.md)*
*v3.3 phase details archived to [milestones/v3.3-ROADMAP.md](milestones/v3.3-ROADMAP.md)*

### Phase 55: Phrase Personalities
**Goal**: Users can choose from 7 personality styles for the English phrase clock, each with a distinct vocabulary that transforms how the time reads
**Depends on**: Phase 54 (v3.3 complete)
**Requirements**: PHRASE-01, PHRASE-02, PHRASE-03, PHRASE-04, PHRASE-05, PHRASE-06, PHRASE-07, PHRASE-08, PHRASE-09
**Success Criteria** (what must be TRUE):
  1. Selecting "Rude" in Settings produces visibly coarser vocabulary (WTF, dafaq, tf) instead of the v3.2 passive-aggressive British register
  2. Each of the 6 new styles (Pirate, Dwarf, Jive, Valley Girl, Yoda, Shakespearean) appears as a selectable item in the Settings window Phrase Style ComboBox
  3. Switching to any new style immediately updates the displayed phrase without restarting the widget
  4. The selected style persists across a restart and is restored exactly (not falling back to Classic)
  5. All 7 new/rewritten providers have at least 2 passing test methods each verifying distinct phrase samples
**Plans**: 3 plans
Plans:
- [x] 55-01-PLAN.md — Rude 2.0 rewrite + 6 new provider classes (FuzzyClock.Core)
- [x] 55-02-PLAN.md — PhraseEngine registration, MainWindow routing, SettingsWindow wiring, Validate() guard
- [x] 55-03-PLAN.md — Updated Rude tests + 6 new provider test classes

### Phase 56: Nixie Tube Clock
**Goal**: Users can select a Nixie tube clock as a fourth clock type that renders a retro warm-orange digit display entirely from WPF vector primitives
**Depends on**: Phase 55
**Requirements**: NIXIE-01, NIXIE-02, NIXIE-03, NIXIE-04, NIXIE-05, NIXIE-06, NIXIE-07
**Success Criteria** (what must be TRUE):
  1. Selecting "Nixie" in the Settings Clock Style row or tray Clock Type submenu switches the clock face to the Nixie display and hides the phrase/dial/LCD controls
  2. Each active digit glows with a warm orange bloom (no black rectangle artifacts at any zoom or DPI — glow uses stacked RadialGradientBrush, not UIElement.Effect)
  3. All 10 ghost cathode digits are visible behind the active digit as faint stacked shadows
  4. Each digit slot is enclosed in a rounded glass tube border with a faint wire mesh overlay
  5. Selecting Nixie type, closing and reopening the widget restores Nixie — the ClockType.Nixie value round-trips through settings.json
**Plans**: 3 plans
Plans:
- [ ] 56-01-PLAN.md — NixieDigit + NixieClockView UserControls + NixieSizeMap helper (WPF render core)
- [ ] 56-02-PLAN.md — ClockType.Nixie enum + full integration (MainWindow 5 sites, SettingsWindow, TrayMenuBuilder)
- [ ] 56-03-PLAN.md — NixieSizeMap unit tests + visual review checkpoint

### Phase 57: Dial Enhancements
**Goal**: Users can choose between round and oval dial shapes, and the dial canvas scales automatically with the font size setting
**Depends on**: Phase 56
**Requirements**: DIAL-01, DIAL-02, DIAL-03
**Success Criteria** (what must be TRUE):
  1. The Appearance tab of the Settings window shows round/oval shape radio buttons that immediately change the dial shape when clicked
  2. Switching font size to Small, Medium, or Large while in dial mode changes the dial canvas to the corresponding size (80px / 110px / 150px)
  3. The selected dial shape persists across a restart (AppSettings.DialShape round-trips through settings.json)
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
| 41. PhraseEngine Provider Refactor | v3.2 | 2/2 | Complete | 2026-03-08 |
| 42. Settings Window Infrastructure | v3.2 | 4/4 | Complete | 2026-03-08 |
| 43. Named Themes | v3.2 | 3/3 | Complete | 2026-03-08 |
| 44. Battery Low Alert | v3.2 | 2/2 | Complete | 2026-03-09 |
| 45. English Phrase Style Personalities | v3.2 | 2/2 | Complete | 2026-03-09 |
| 46. Multilingual Phrases | v3.2 | 2/2 | Complete | 2026-03-09 |
| 47. Tech Debt Cleanup | v3.2 | 1/1 | Complete | 2026-03-09 |
| 48. ClockType Enum Migration | v3.3 | 1/1 | Complete | 2026-03-10 |
| 49. SevenSegmentEncoder | v3.3 | 1/1 | Complete | 2026-03-10 |
| 50. WPF Segment Controls | v3.3 | 2/2 | Complete | 2026-03-10 |
| 51. App Integration | v3.3 | 2/2 | Complete | 2026-03-10 |
| 52. Tests + README | v3.3 | 3/3 | Complete | 2026-03-10 |
| 53. v3.3 LCD Tech Debt Cleanup | v3.3 | 1/1 | Complete | 2026-03-10 |
| 54. Additional LCD Themes | v3.3 | 3/3 | Complete | 2026-03-11 |
| 55. Phrase Personalities | v3.4 | Complete    | 2026-03-11 | 2026-03-11 |
| 56. Nixie Tube Clock | 2/3 | In Progress|  | - |
| 57. Dial Enhancements | v3.4 | 0/? | Not started | - |

---
*Last updated: 2026-03-11 — Phase 56 planned (3 plans)*
