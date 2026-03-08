# Requirements: FuzzyClock v3.2

**Defined:** 2026-03-08
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.2 Requirements

### Settings UI

- [x] **SETT-01**: User can open a Settings window via "Open Settings..." item in the system tray menu
- [x] **SETT-02**: Settings window has three tabs — Appearance, Stats, and Behavior
- [x] **SETT-03**: Appearance tab exposes accent color, opacity, font size, clock style, phrase style, and theme selector controls
- [x] **SETT-04**: Stats tab exposes per-row visibility toggles, update interval, process count threshold, and date format controls
- [x] **SETT-05**: Behavior tab exposes ghost mode, auto-contrast, auto-launch, and battery alert threshold controls
- [x] **SETT-06**: All settings changes apply immediately to the live widget (modeless; no Apply button needed)
- [x] **SETT-07**: Tray menu retains existing quick toggles (Ghost Mode, Stats, Auto-Contrast, Auto-Launch) alongside "Open Settings..."

### Themes

- [ ] **THM-01**: Settings window Appearance tab offers 5 named built-in themes selectable by the user
- [ ] **THM-02**: Applying a theme atomically sets accent color, opacity, font size, clock style, and stats panel visibility
- [ ] **THM-03**: Active theme name persists to settings.json and restores on launch

### Phrase Styles

- [ ] **STYLE-01**: User can select Terse style (compact: "half three", "quarter past", "noon") in the Settings window
- [ ] **STYLE-02**: User can select Poetic style (evocative: "the small hours", "the day grows long") in the Settings window
- [ ] **STYLE-03**: User can select Rude style (blunt: "nearly four, move it", "just gone midnight, go to bed") in the Settings window
- [ ] **STYLE-04**: Selected phrase style persists to settings.json and restores on launch

### Multilingual

- [ ] **LANG-01**: Widget detects Windows UI culture (`CultureInfo.CurrentUICulture`) and displays phrases in the matching language when supported
- [ ] **LANG-02**: Supported languages: English (default fallback), French, Spanish, German, Japanese, Polish
- [ ] **LANG-03**: Each supported language provides phrase sets covering all 5-minute time buckets (all hours, noon, midnight special cases)
- [ ] **LANG-04**: Unsupported locales display phrases in English

### Battery Alert

- [ ] **ALERT-01**: When battery is below the alert threshold and not plugged in, the battery stat row accent color shifts to red
- [ ] **ALERT-02**: Battery row returns to normal accent color when battery rises above threshold or is plugged in
- [ ] **ALERT-03**: Battery alert threshold is configurable in Settings window Behavior tab (10% / 15% / 20%; default 20%)

## Future Requirements (v3.x+)

- Live theme preview in settings window — two-window coupling complexity; apply-on-change is sufficient for v3.2
- User-created / saved custom themes — requires separate storage and rename UI
- Additional languages (Italian, Portuguese, Dutch) — validate demand after v3.2 ships
- Per-locale date format defaults — too many combinations to specify now
- Phrase style personalities for non-English languages — English-only for v3.2; extend later

## Out of Scope

| Feature | Reason |
|---------|--------|
| Settings window with Apply/Cancel buttons | Modeless live-apply is simpler and consistent with existing tray-menu behavior |
| Custom theme authoring | Only built-in named presets for v3.2 |
| Phrase style selector visible for non-English locales | Terse/Poetic/Rude are English-only; control is disabled when non-English language is active |
| LocBaml WPF localization | Only works with .NET Framework, not .NET 10 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETT-01 | Phase 42 | Complete |
| SETT-02 | Phase 42 | Complete |
| SETT-03 | Phase 42 | Complete |
| SETT-04 | Phase 42 | Complete |
| SETT-05 | Phase 42 | Complete |
| SETT-06 | Phase 42 | Complete |
| SETT-07 | Phase 42 | Complete |
| THM-01 | Phase 43 | Pending |
| THM-02 | Phase 43 | Pending |
| THM-03 | Phase 43 | Pending |
| STYLE-01 | Phase 45 | Pending |
| STYLE-02 | Phase 45 | Pending |
| STYLE-03 | Phase 45 | Pending |
| STYLE-04 | Phase 45 | Pending |
| LANG-01 | Phase 46 | Pending |
| LANG-02 | Phase 46 | Pending |
| LANG-03 | Phase 46 | Pending |
| LANG-04 | Phase 46 | Pending |
| ALERT-01 | Phase 44 | Pending |
| ALERT-02 | Phase 44 | Pending |
| ALERT-03 | Phase 44 | Pending |

**Coverage:**
- v3.2 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after initial definition*
