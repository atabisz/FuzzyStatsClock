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
- ✅ **v3.5 Phrase Wrap + Installer** (2026-03-18) — Dark-mode Settings, edge snapping, IPC fixes, Inno Setup installer, CI release pipeline, phrase wrapping, backdrop enhancement, poetic hour hints. 8 phases (48–55), 12 plans. → [Archive](milestones/v3.5-ROADMAP.md)
- 🚧 **v3.6 Settings Layout Fix** — Appearance tab fully visible within 480×600 window; compact theme cards; tighter spacing. 1 phase (56). In progress.

## Phases

<details>
<summary>v2.2 System Tray (Phase 24) — SHIPPED 2026-03-02</summary>

- [x] **Phase 24: System Tray Icon** — NotifyIcon with tray context menu (Reset to Defaults, Quit); Reset sets White accent + 100% opacity + 16pt font + phrase mode + centered position and saves immediately; Quit exits cleanly; analog clock face icon (16x16 dark circle, white hands at 10:10); tray icon disposed on window close (completed 2026-03-02)

</details>

<details>
<summary>v2.3 Ghost Mode (Phases 25-27) — SHIPPED 2026-03-02</summary>

- [x] **Phase 25: Centered Phrase Text** — TextAlignment=Center on PhraseText and ShadowText TextBlocks; phrase text is horizontally centered in the widget content area (completed 2026-03-02)
- [x] **Phase 26: Ghost Mode Core** — Widget becomes Opacity=0 and click-through (WS_EX_TRANSPARENT) on MouseEnter with no modifier; restores on mouse exit with all hover state cleanly reset (completed 2026-03-02)
- [x] **Phase 27: Ctrl+Alt Interaction Modifier** — Holding left Ctrl+left Alt while hovering suppresses ghost activation; all existing hover behaviors (backdrop, fast-refresh, drag, right-click, scroll) activate normally (completed 2026-03-02)

</details>

<details>
<summary>v2.5 Unit Tests (Phases 28-30) — SHIPPED 2026-03-03</summary>

- [x] **Phase 28: Core Logic Extraction + Tests** — UptimeFormatter and DialGeometry extracted into FuzzyClock.Core as pure static classes; 13 MSTest boundary-condition tests (7 + 6) all passing (completed 2026-03-02)
- [x] **Phase 29: App Test Infrastructure + Settings Tests** — FuzzyClock.App.Tests (net10.0-windows, MSTest 4.0.1); SettingsService refactored with Validate() + pure Clamp() overload; 9 test cases passing (completed 2026-03-03)
- [x] **Phase 30: CI Test Gate** — dotnet restore -> dotnet test -> dotnet publish step order in release.yml; no continue-on-error; all 73 tests gate the release artifact (completed 2026-03-03)

</details>

<details>
<summary>v2.6 Polish (Phases 31-32) — SHIPPED 2026-03-03</summary>

- [x] **Phase 31: Auto-Launch at Login** — Tray toggle writes/removes HKCU Run registry entry; state shown as checkmark; persisted to settings.json (completed 2026-03-03)
- [x] **Phase 32: Per-Monitor Position Memory** — Widget tracks last-used position per monitor by identity; restores to correct monitor on startup; centers on primary if monitor absent (completed 2026-03-03)

</details>

<details>
<summary>v2.7 Auto-Contrast (Phase 33) — SHIPPED 2026-03-03</summary>

- [x] **Phase 33: Auto-Contrast** — Tray toggle enables screen-color sampling under widget footprint (BitBlt/WCAG); switches text to black or white when contrast insufficient; restores accent when contrast is sufficient; pauses on ghost mode/opacity=0/drag (completed 2026-03-03)

</details>

<details>
<summary>v2.8 Uptime and Docs (Phase 34) — SHIPPED 2026-03-04</summary>

- [x] **Phase 34: Uptime Process Count + README** — Verify process count appended to uptime line; README accurately reflects all v2.7+ features and interaction model (completed 2026-03-04)

</details>

<details>
<summary>v2.9 Process Threshold (Phase 35) — SHIPPED 2026-03-05</summary>

- [x] **Phase 35: Process Count Threshold** — `ProcessCountThresholdPercent` (default 5.0) in AppSettings; three mutually-exclusive checkable tray Stats submenu items (2%/5%/10%); `UpdateUptimeDisplay()` uses persisted threshold; immediate display refresh; Reset to Defaults restores 5% (completed 2026-03-05)

</details>

<details>
<summary>v3.0 Date Display (Phase 36) — SHIPPED 2026-03-07</summary>

- [x] **Phase 36: Date Display Under Clock** — DateText element below phrase/dial in muted accent color (55% alpha); 4 format options (Short/Long/Numeric/ISO); Show Date tray toggle + Date Format submenu; persisted to settings.json; ResetToDefaults restores defaults (completed 2026-03-07)

</details>

<details>
<summary>v3.1 Quality + Battery (Phases 37-40) — SHIPPED 2026-03-08</summary>

- [x] **Phase 37: Battery Stat Row** — Battery charge % stat row below PAG; horizontal bar + percentage text; `⚡ {pct}%` when AC-connected; "N/A" on desktops/VMs; tray Stats toggle; all-five-rows auto-collapse; persisted with default enabled (completed 2026-03-07)
- [x] **Phase 38: Tests + Code Cleanup** — DateFormatter extracted from MainWindow into FuzzyClock.Core with 6 unit tests (all 4 formats); AppSettings round-trip tests for DateVisible/DateFormat; FormatDate deleted from MainWindow; 122 tests total (completed 2026-03-07)
- [x] **Phase 39: Docs Pass** — README updated to describe v3.0 date display and battery row (completed 2026-03-07)
- [x] **Phase 40: README Accuracy Fixes** — Short/Long format examples corrected to match DateFormatter output; test count updated to 122 (completed 2026-03-08)

</details>

<details>
<summary>v3.2 Expanded Experience (Phases 41-47) — SHIPPED 2026-03-09</summary>

- [x] **Phase 41: PhraseEngine Provider Refactor** - Extract IPhraseProvider interface + EnglishPhraseProvider; PhraseEngine becomes static dispatcher; all 122 tests still pass (completed 2026-03-08)
- [x] **Phase 42: Settings Window Infrastructure** - SettingsWindow (3 tabs), "Open Settings..." tray item, modeless Owner=MainWindow, SettingsChanged event wired to ApplySettings+SaveSettings (completed 2026-03-08)
- [x] **Phase 43: Named Themes** - ThemeDefinition record, BuiltInThemes registry (5 presets), ApplyNamedTheme() batch method, AppSettings.Theme persisted (completed 2026-03-08)
- [x] **Phase 44: Battery Low Alert** - Red override on battery row when below threshold and unplugged; BatteryAlertEnabled/BatteryAlertPercent in AppSettings; configurable in Settings window Behavior tab (completed 2026-03-09)
- [x] **Phase 45: English Phrase Style Personalities** - PhraseStyle enum (Classic/Terse/Poetic/Rude); bucket tables in EnglishPhraseProvider; AppSettings.PhraseStyle; Settings window wiring; per-style tests (completed 2026-03-09)
- [x] **Phase 46: Multilingual Phrases** - Fr/Es/De/Ja/Pl providers; CultureInfo.CurrentUICulture detection; AppSettings.PhraseLocale; Settings window language selector; exhaustive per-language tests (completed 2026-03-09)
- [x] **Phase 47: Tech Debt Cleanup** - Ghost theme FontSize 28->24 (Settings button alignment); remove stale AppSettings.cs comment (Phase 45 shipped); remove redundant `_suppressEvents = true` in SettingsWindow constructor (completed 2026-03-09)

</details>

<details>
<summary>✅ v3.5 Phrase Wrap + Installer (Phases 48–55) — SHIPPED 2026-03-18</summary>

- [x] **Phase 48: Settings Window Visual Redesign** — Dark-mode styling for SettingsWindow via ThemeMode="Dark"; zero style leakage to MainWindow (SETR-01–04) (completed 2026-03-17)
- [x] **Phase 49: Fixes + Edge Snapping** — AbandonedMutexException crash recovery; named-pipe IPC for second-launch bring-to-front; ResetToDefaults phrase/locale reset; 8px SnapToEdge post-DragMove (FIX-01–03, SNAP-01–03) (completed 2026-03-18)
- [x] **Phase 50: Installer + CI** — Inno Setup per-user installer (FuzzyClock.iss); GitHub Actions CI release pipeline with version injection, installer compilation, SHA256 checksums, draft GitHub Release (INST-01–09) (completed 2026-03-18)
- [x] **Phase 51: README Docs Pass** — README updated for v3.2–v3.5 features, Settings window, themes, phrase styles, installer, edge snapping, phrase wrapping (DOCS-04) (completed 2026-03-18)
- [x] **Phase 52: Phrase Wrapping** — PhraseWrapService (midpoint + natural pause algorithms); Inlines-based renderer; AppSettings + SettingsWindow controls (WRAP-01–03) (completed 2026-03-18)
- [x] **Phase 53: Fix Phrase Update Rate** — IPhraseProvider.GetSegmentKey(); segment-key guard in UpdatePhraseIfChanged; phrase only changes on bucket advance (SEGKEY-01–03) (completed 2026-03-18)
- [x] **Phase 54: Backdrop Enhancement** — BackdropBorder covering full widget footprint; BackdropAlwaysVisible; BackdropOpacityPercent slider (BDROP-01–03) (completed 2026-03-18)
- [x] **Phase 55: Poetic Hour Hints** — PoeticPhraseProvider rewritten with 48 {h}/{h1} templates; GetStructuredPhrase qualifier/emphasis split (POETIC-01) (completed 2026-03-18)

</details>

### 🚧 v3.6 Settings Layout Fix (In Progress)

**Milestone Goal:** The Appearance tab is fully visible within the existing 480×600 Settings window without clipping; Stats and Behavior tabs are unaffected.

#### Phase 56: Settings Window Layout Redesign

**Goal**: All controls on the Appearance tab are visible within the 480×600 window without clipping, achieved by compacting theme cards and tightening inter-section spacing
**Depends on**: Phase 55 (v3.5 complete)
**Requirements**: SETT-01, SETT-02, SETT-03, SETT-04
**Success Criteria** (what must be TRUE):
  1. Opening the Settings window and selecting the Appearance tab shows all controls without any element clipped, cut off, or hidden below the window edge
  2. Theme preset cards use a more compact visual form — noticeably less vertical space per card than the v3.5 layout
  3. Margins and padding between sections on the Appearance tab are visibly tighter; no large blank gaps separate adjacent sections
  4. The Stats tab and Behavior tab look identical to their v3.5 state; no layout change is visible on either tab
**Plans**: 1 plan

Plans:
- [ ] 56-01: Compact theme cards and tighten Appearance tab spacing in SettingsWindow.xaml

## Phase Details

### Phase 56: Settings Window Layout Redesign
**Goal**: All controls on the Appearance tab are visible within the 480×600 window without clipping, achieved by compacting theme cards and tightening inter-section spacing
**Depends on**: Phase 55
**Requirements**: SETT-01, SETT-02, SETT-03, SETT-04
**Success Criteria** (what must be TRUE):
  1. Opening the Settings window and selecting the Appearance tab shows all controls without any element clipped, cut off, or hidden below the window edge
  2. Theme preset cards use a more compact visual form — noticeably less vertical space per card than the v3.5 layout
  3. Margins and padding between sections on the Appearance tab are visibly tighter; no large blank gaps separate adjacent sections
  4. The Stats tab and Behavior tab look identical to their v3.5 state; no layout change is visible on either tab
**Plans**: 1 plan

Plans:
- [ ] 56-01: Compact theme cards and tighten Appearance tab spacing in SettingsWindow.xaml

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-23 | v1.0-v2.1 | All | Complete | See archives |
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
| 48. Settings Window Visual Redesign | v3.5 | 1/1 | Complete | 2026-03-17 |
| 49. Fixes + Edge Snapping | v3.5 | 2/2 | Complete | 2026-03-18 |
| 50. Installer + CI | v3.5 | 2/2 | Complete | 2026-03-18 |
| 51. README Docs Pass | v3.5 | 1/1 | Complete | 2026-03-18 |
| 52. Phrase Wrapping | v3.5 | 2/2 | Complete | 2026-03-18 |
| 53. Fix Phrase Update Rate | v3.5 | 2/2 | Complete | 2026-03-18 |
| 54. Backdrop Enhancement | v3.5 | 1/1 | Complete | 2026-03-18 |
| 55. Poetic Hour Hints | v3.5 | 1/1 | Complete | 2026-03-18 |
| 56. Settings Window Layout Redesign | 1/1 | Complete    | 2026-03-18 | - |

---
*Last updated: 2026-03-18 — v3.6 roadmap created*
