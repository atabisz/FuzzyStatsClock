# Roadmap: Fuzzy Clock

## Milestones

- ✅ **v1.0 MVP** - Phases 1-3 (shipped 2026-02-25)
- ✅ **v1.1 Position + Font Size** - Phases 4-5 (shipped 2026-02-25)
- ✅ **v1.2 System Stats** - Phases 6-9 (shipped 2026-02-26)
- ✅ **v1.3 Individual Stat Visibility** - Phase 10 (shipped 2026-02-26)
- ✅ **v1.4 PAG Stat Row** - Phase 11 (shipped 2026-02-26)
- ✅ **v1.5 Hover Fast-Refresh** - Phase 12 (shipped 2026-02-26)
- ✅ **v1.6 Dial Mode** - Phase 13 (shipped 2026-02-26)
- ✅ **v1.7 Visual Polish** - Phase 14 (shipped 2026-02-26)
- ✅ **v1.8 Dial Enhancement** - Phases 15-16 (shipped 2026-02-26)
- ✅ **v1.9 Context-Aware Menus** - Phase 17 (shipped 2026-02-26)
- ✅ **v2.0 Visual Identity** - Phases 18-21 (shipped 2026-02-27)
- ✅ **v2.1 Uptime** - Phases 22-23 (shipped 2026-02-27)
- ✅ **v2.2 System Tray** - Phase 24 (shipped 2026-03-02)
- ✅ **v2.3 Ghost Mode** - Phases 25-27 (shipped 2026-03-02)
- ✅ **v2.5 Unit Tests** - Phases 28-30 (shipped 2026-03-03)
- ✅ **v2.6 Polish** - Phases 31-32 (shipped 2026-03-03)
- ✅ **v2.7 Auto-Contrast** - Phase 33 (shipped 2026-03-03)
- ✅ **v2.8 Uptime and Docs** - Phase 34 (shipped 2026-03-04)
- ✅ **v2.9 Process Threshold** - Phase 35 (shipped 2026-03-05)
- ✅ **v3.1 Quality + Battery** - Phases 37-40 (shipped 2026-03-08)
- ✅ **v3.2 Expanded Experience** - Phases 41-47 (shipped 2026-03-09)
- ✅ **v3.5 Phrase Wrap + Installer** - Phases 48-55 (shipped 2026-03-18)
- ✅ **v3.6 Settings Appearance Compact** - Phase 56 (shipped 2026-03-18)
- ✅ **v3.6.1 Contrast Flicker Fix** - Phase 57 (shipped 2026-03-19)
- ✅ **v3.7 Nixie Clock** - Phases 58-59 (shipped 2026-03-23)
- ✅ **v3.8 Dial Settings** - Phase 60 (shipped 2026-03-23)
- 🔄 **v3.9 LCD Clock + Japanese Styles** - Phases 61-65 (in progress)

## Phases

<details>
<summary>✅ Phases 1-57 — SHIPPED (see MILESTONES.md for details)</summary>

Phases 1-57 are complete. See `.planning/MILESTONES.md` for per-milestone summaries.

</details>

<details>
<summary>✅ v3.7 Nixie Clock (Phases 58-59) — SHIPPED 2026-03-23</summary>

- [x] Phase 58: Data Model Foundation (1/1 plans) — completed 2026-03-19
- [x] Phase 59: UI Wiring and Build Clean (1/1 plans) — completed 2026-03-23

Full details: `.planning/milestones/v3.7-ROADMAP.md`

</details>

<details>
<summary>✅ v3.8 Dial Settings (Phase 60) — SHIPPED 2026-03-23</summary>

- [x] Phase 60: Dial Decoration Settings UI (1/1 plans) — completed 2026-03-23

Full details: `.planning/milestones/v3.8-ROADMAP.md`

</details>

### v3.9 LCD Clock + Japanese Styles

- [x] **Phase 61: Japanese Phrase Providers** - Three new IPhraseProvider implementations (Terse/Poetic/Rude) and PhraseEngine registry entries for ja-* keys (completed 2026-03-24)
- [x] **Phase 62: Routing Consolidation** - ResolveLocaleKey helper; all three MainWindow routing sites updated; Japanese style selector enabled in SettingsWindow (completed 2026-03-24)
- [x] **Phase 63: SettingsWindow LCD UI** - BtnLcd in Clock Style rail; LcdOptionsPanel with 24hr/seconds/style controls; visibility gating; PopulateControls LCD section (completed 2026-03-24)
- [ ] **Phase 64: Blinking Colon** - _colonVisible toggle in LcdClockView.UpdateTime(); Colon2 gated on ShowSeconds
- [ ] **Phase 65: Settings Persistence Hardening** - STEST-01 round-trip assertions for LCD fields; SettingsService.Validate() guard for LcdStyle

## Phase Details

### Phase 61: Japanese Phrase Providers
**Goal**: All three Japanese phrase style providers exist in FuzzyClock.Core, are registered in PhraseEngine, and are covered by unit tests
**Depends on**: Nothing (FuzzyClock.Core only; no UI dependencies)
**Requirements**: JA-01, JA-02, JA-03, JA-06
**Success Criteria** (what must be TRUE):
  1. JapaneseTersePhraseProvider returns a non-empty phrase for all 12 five-minute buckets, noon, and midnight
  2. JapanesePoeticPhraseProvider returns a non-empty phrase for all 12 five-minute buckets, noon, and midnight
  3. JapaneseRudePhraseProvider returns a non-empty phrase for all 12 five-minute buckets, noon, and midnight
  4. PhraseEngine registry contains entries for "ja-classic", "ja-terse", "ja-poetic", and "ja-rude" keys; SetLocale("ja-terse") succeeds
  5. Unit tests for all three providers cover all 12 buckets plus noon and midnight (isolation tests; no PhraseEngine coordinator involvement)
**Plans**: 2 plans
Plans:
- [x] 61-01-PLAN.md — Create three Japanese phrase style providers and register in PhraseEngine
- [ ] 61-02-PLAN.md — Unit tests for all three providers and coordinator round-trip tests

### Phase 62: Routing Consolidation
**Goal**: Japanese style selection, persistence, and app-restart restoration all route correctly through a single ResolveLocaleKey helper; Japanese style selector is enabled in SettingsWindow
**Depends on**: Phase 61 (ja-* registry keys must exist before routing can reference them)
**Requirements**: JA-04, JA-05
**Success Criteria** (what must be TRUE):
  1. Switching to Japanese Terse/Poetic/Rude in Settings > Appearance immediately activates the correct provider on the live widget
  2. The Phrase Style combo box in Settings is enabled (not greyed out) when Japanese locale is active
  3. After selecting Japanese Terse and restarting the app, the Terse provider is active on next launch (not Classic fallback)
  4. ResolveLocaleKey private helper consolidates all three MainWindow routing sites (ApplySettings, SetLanguage, SetPhraseStyle); no duplicate locale-switch logic remains
  5. Coordinator tests for ja-* locale round-trips pass in the DoNotParallelize PhraseEngineCoordinatorTests class
**Plans**: 1 plan
Plans:
- [x] 62-01-PLAN.md — Extract ResolveLocaleKey, consolidate routing, update SettingsWindow combo, fix and extend coordinator tests

### Phase 63: SettingsWindow LCD UI
**Goal**: Users can select LCD clock style and configure its options (12/24h, seconds row, segment style) from Settings > Appearance, with the LCD options panel visible only when LCD is the active clock style
**Depends on**: Phase 62 (routing stability confirmed; SettingsWindow patterns established)
**Requirements**: LCD-01, LCD-02, LCD-03, LCD-04, LCD-05
**Success Criteria** (what must be TRUE):
  1. Settings > Appearance shows a fourth "LCD" button in the Clock Style rail alongside Phrase/Dial/Nixie; clicking it activates the LCD clock face on the widget
  2. The LCD options panel (24hr toggle, seconds row toggle, segment style selector) is visible when LCD is selected and collapsed when Phrase, Dial, or Nixie is selected
  3. Opening Settings while LCD is active shows each LCD option in the state matching the current persisted value (PopulateControls reads SettingsSnapshot LCD fields)
  4. Toggling 24hr mode or the seconds row in Settings immediately changes the LCD display on the live widget
  5. Selecting a segment style (Dark/Paper/Silver) in Settings immediately applies the new style to the LCD digits on the live widget
**Plans**: 1 plan
Plans:
- [x] 63-01-PLAN.md — Add BtnLcd to Clock Style rail, LCD options panel with 24hr/seconds/style controls, visibility gating, PopulateControls LCD section
**UI hint**: yes

### Phase 64: Blinking Colon
**Goal**: The colon between the HH and MM digit groups on the LCD clock face blinks on/off every second while LCD is the active clock style
**Depends on**: Phase 63 (LCD clock face must be selectable before colon behavior is observable)
**Requirements**: LCD-06
**Success Criteria** (what must be TRUE):
  1. When LCD clock style is active, the colon between hours and minutes visibly alternates between lit and unlit every second
  2. Colon blink uses the existing 1s DispatcherTimer in LcdClockView (no new timer added to the codebase)
  3. Colon2 (seconds separator, if seconds row is visible) does not blink — only Colon1 blinks
**Plans**: TBD
**UI hint**: yes

### Phase 65: Settings Persistence Hardening
**Goal**: LCD settings fields are covered by the round-trip serialization test and protected against invalid persisted values
**Depends on**: Phase 63 (LCD fields must be wired before they can be round-trip tested)
**Requirements**: LCD-07, LCD-08
**Success Criteria** (what must be TRUE):
  1. The STEST-01 AppSettings round-trip test asserts all four LCD fields (LcdUse24Hr, LcdShowSeconds, LcdStyle, LcdSize) survive a serialize/deserialize cycle with correct values
  2. SettingsService.Validate() corrects an invalid LcdStyle string (e.g. "Broken") to the Dark default without throwing
  3. A settings.json containing an unrecognized LcdStyle value loads cleanly and shows Dark-style LCD digits on the widget
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 61. Japanese Phrase Providers | 1/2 | Complete    | 2026-03-24 |
| 62. Routing Consolidation | 1/1 | Complete    | 2026-03-24 |
| 63. SettingsWindow LCD UI | 1/1 | Complete    | 2026-03-24 |
| 64. Blinking Colon | 0/? | Not started | - |
| 65. Settings Persistence Hardening | 0/? | Not started | - |
