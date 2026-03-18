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
- **v3.4 Polish + Fixes** (2026-03-18) — Settings window visual redesign, bug fixes (reset defaults, single-instance IPC, AbandonedMutex), edge snapping. 2 phases (48–49). ← SHIPPED
- **v3.5 Phrase Wrap + Installer** — Per-user Inno Setup installer with CI release pipeline, phrase wrapping for long phrases, README docs pass. 3 phases (50–52). ← CURRENT

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
<summary>✅ v3.4 Polish + Fixes (Phases 48–49) — SHIPPED 2026-03-18</summary>

- [x] **Phase 48: Settings Window Visual Redesign** — Dark-mode styling for SettingsWindow (SETR-01 to SETR-04) (completed 2026-03-17)
- [x] **Phase 49: Fixes + Edge Snapping** — Bug fixes for reset defaults, single-instance bring-to-front, AbandonedMutexException; edge snap post-DragMove (FIX-01, FIX-02, FIX-03, SNAP-01, SNAP-02, SNAP-03) (completed 2026-03-18)

</details>

### v3.5 Phrase Wrap + Installer (Phases 50–52) — CURRENT

- [x] **Phase 50: Installer + CI** — Inno Setup per-user installer script and CI artifact integration (INST-01 to INST-09) (completed 2026-03-18)
- [x] **Phase 51: README Docs Pass** — Document v3.2–v3.4 features including installer, phrase wrapping (DOCS-04) (completed 2026-03-18)
- [x] **Phase 52: Phrase Wrapping** — Auto-wrap long phrase text to two lines with configurable split style (WRAP-01, WRAP-02, WRAP-03) (completed 2026-03-18)

## Phase Details

*v3.2 phase details archived to [milestones/v3.2-ROADMAP.md](milestones/v3.2-ROADMAP.md)*

### Phase 48: Settings Window Visual Redesign
**Goal**: Users see a dark-mode Settings window that matches the widget's minimal aesthetic
**Depends on**: Nothing (pure XAML, no logic changes)
**Requirements**: SETR-01, SETR-02, SETR-03, SETR-04
**Success Criteria** (what must be TRUE):
  1. Opening Settings shows a dark background with light foreground text — no light gray system-default chrome
  2. Every interactive control (CheckBox, RadioButton, ComboBox, Button, Slider) renders with a consistent dark-mode appearance
  3. Section groups have visible breathing room; nothing feels cramped or overlapping
  4. Opening the main widget's right-click menu or tray menu shows no visual change — MainWindow is unaffected by the new styles
**Plans**: 1 plan
Plans:
- [x] 48-01-PLAN.md — Apply ThemeMode="Dark" + replace hardcoded light colors + human visual sign-off

### Phase 49: Fixes + Edge Snapping
**Goal**: The app behaves correctly on crash-restart, second launch, and drag near screen edges
**Depends on**: Nothing (self-contained App.xaml.cs and MainWindow.xaml.cs changes)
**Requirements**: FIX-01, FIX-02, FIX-03, SNAP-01, SNAP-02, SNAP-03
**Success Criteria** (what must be TRUE):
  1. Pressing Reset to Defaults from the tray resets phrase style to Classic and phrase locale to auto, not just the visual settings
  2. Launching the app when it is already running brings the existing window to the front instead of silently doing nothing
  3. After killing the app via Task Manager and relaunching, the app starts normally without an unhandled exception
  4. Dragging the widget to within 8px of any screen edge and releasing causes it to snap flush to that edge
  5. The snapped position respects the taskbar working area — the widget does not slide under the taskbar
  6. Dragging the widget freely in the middle of the screen and releasing does not trigger a snap
**Plans**: 2 plans
Plans:
- [x] 49-01-PLAN.md — AbandonedMutexException handling + named pipe bring-to-front IPC
- [x] 49-02-PLAN.md — ResetToDefaults phrase reset + SnapToEdge post-DragMove

### Phase 50: Installer + CI
**Goal**: Users can download a setup file, install FuzzyClock like any normal Windows app, and CI automatically produces versioned release artifacts on every git tag push
**Depends on**: Phase 49 (stable, tested EXE to package)
**Requirements**: INST-01, INST-02, INST-03, INST-04, INST-05, INST-06, INST-07, INST-08, INST-09
**Success Criteria** (what must be TRUE):
  1. Running FuzzyClockSetup.exe installs the app to %LOCALAPPDATA%\Programs\FuzzyClock\ with no UAC elevation prompt
  2. Running the installer over an existing installation completes successfully and the app version is updated; settings.json is unchanged
  3. After installation, FuzzyClock appears in the Start Menu and can be launched from there; it also appears in Settings > Apps > Installed Apps with a working Uninstall button
  4. After uninstalling, the app is removed from the Start Menu and Apps list; settings.json remains in %LOCALAPPDATA%\FuzzyClock\ by default; an optional checkbox during uninstall lets the user remove it
  5. If auto-launch was enabled before upgrading, the app still launches at login after the upgrade (HKCU Run entry points to the new install path)
  6. When the installer detects a running FuzzyClock instance, it prompts the user to close it before proceeding
  7. The installer finish page shows a "Launch FuzzyClock" checkbox; leaving it checked launches the app when the installer closes
  8. Pushing a version tag (e.g. v3.5) to GitHub triggers CI: tests run, then both FuzzyClock-3.5.0.exe and FuzzyClockSetup-3.5.0.exe plus checksums.txt appear as a draft GitHub Release
**Plans**: 2 plans
Plans:
- [x] 50-01-PLAN.md — Inno Setup installer script (FuzzyClock.iss)
- [x] 50-02-PLAN.md — CI release workflow update (version injection, installer compilation, checksums, draft release)

### Phase 51: README Docs Pass
**Goal**: The README accurately describes all features available in v3.2 through v3.5
**Depends on**: Phase 50 (installer instructions reference the Setup.exe artifact), Phase 52 (phrase wrapping documented)
**Requirements**: DOCS-04
**Success Criteria** (what must be TRUE):
  1. README describes the Settings window (how to open it, its three tabs) and named themes
  2. README describes English phrase style personalities (Classic/Terse/Poetic/Rude) and language selection
  3. README installation section references FuzzyClockSetup.exe as the primary install path and documents the SmartScreen "More info → Run anyway" workaround
  4. README describes edge snapping, single-instance behavior, and dark-mode Settings window styling
  5. README describes phrase wrapping: when it triggers, the two split styles, and how to configure it
**Plans**: 1 plan
Plans:
- [ ] 51-01-PLAN.md — Update README with v3.2-v3.5 features (Settings window, themes, phrase styles, installer, edge snapping, phrase wrapping)

### Phase 52: Phrase Wrapping
**Goal**: Long phrase text wraps to two lines instead of overflowing or truncating, with a user-configurable split style
**Depends on**: Phase 49 (stable phrase rendering baseline post-fixes)
**Requirements**: WRAP-01, WRAP-02, WRAP-03
**Success Criteria** (what must be TRUE):
  1. When the rendered phrase text is wider than the stats panel width plus 10%, it splits across two lines automatically; no split occurs when the phrase fits within that bound
  2. With the "Nearest Midpoint" split style, the break occurs at the word boundary closest to the middle of the phrase string (e.g. "just a little after / eleven")
  3. With the "Natural Pause" split style, the break occurs after the first grammatical or tonal beat (e.g. "almost a quarter past / three")
  4. Both PhraseText and ShadowText wrap identically — shadow text does not shift or misalign relative to the main text
  5. The selected split style and wrap-enabled state persist to settings.json and restore correctly on relaunch
  6. In dial mode, no wrap logic runs — the phrase text path is inactive and wrap state has no visible effect
**Plans**: 2 plans
Plans:
- [ ] 52-01-PLAN.md — PhraseWrapService static class with midpoint + natural split algorithms and unit tests
- [ ] 52-02-PLAN.md — MainWindow Inlines integration, AppSettings persistence, SettingsWindow wrap controls

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
| 48. Settings Window Visual Redesign | v3.4 | 1/1 | Complete | 2026-03-17 |
| 49. Fixes + Edge Snapping | v3.4 | 2/2 | Complete | 2026-03-18 |
| 50. Installer + CI | v3.5 | 2/2 | Complete | 2026-03-18 |
| 51. README Docs Pass | 1/1 | Complete   | 2026-03-18 | - |
| 52. Phrase Wrapping | 2/2 | Complete    | 2026-03-18 | - |

---
*Last updated: 2026-03-18 — Phase 52 planned (2 plans in 2 waves)*
