# Requirements: Milestone v3.9 — LCD Clock + Japanese Styles

**Milestone:** v3.9
**Status:** Active
**Created:** 2026-03-24

---

## LCD Clock UI

- [ ] **LCD-01**: User can select LCD clock style from Settings > Appearance Clock Style rail (BtnLcd added; Phrase/Dial/Nixie/LCD are four mutually exclusive buttons)
- [ ] **LCD-02**: User can toggle between 12-hour (H:MM) and 24-hour (HH:MM) in Settings when LCD is active; persists and restores on launch
- [ ] **LCD-03**: User can show or hide the seconds row (SS digits) in Settings when LCD is active; persists and restores on launch
- [ ] **LCD-04**: User can select LCD segment style (Dark/Paper/Silver) in Settings when LCD is active; persists and restores on launch
- [ ] **LCD-05**: LCD settings panel (24hr, seconds row, style) is visible only when LCD is the active clock style; collapsed for Phrase/Dial/Nixie
- [ ] **LCD-06**: LCD clock colon (between HH and MM digits) blinks on/off every second
- [ ] **LCD-07**: STEST-01 round-trip test covers all LCD AppSettings fields (LcdUse24Hr, LcdShowSeconds, LcdStyle, LcdSize)
- [ ] **LCD-08**: SettingsService.Validate() corrects invalid LcdStyle values to the Dark default

## Japanese Phrase Styles

- [ ] **JA-01**: Japanese Terse phrase style covers all 12 five-minute buckets, noon, and midnight; active when Windows UI language is Japanese and Terse style is selected
- [ ] **JA-02**: Japanese Poetic phrase style covers all 12 five-minute buckets, noon, and midnight; active when Japanese + Poetic selected (marked provisional pending native review)
- [ ] **JA-03**: Japanese Rude phrase style covers all 12 five-minute buckets, noon, and midnight; active when Japanese + Rude selected (marked provisional pending native review)
- [ ] **JA-04**: Phrase style selector in Settings is enabled when Japanese locale is active (all four styles: Classic/Terse/Poetic/Rude)
- [ ] **JA-05**: Selecting a Japanese phrase style persists to settings.json and is correctly restored on app restart (all routing sites updated via ResolveLocaleKey helper)
- [ ] **JA-06**: Unit tests for each Japanese style provider cover all 12 buckets plus noon and midnight cases

---

## Future Requirements

- French/Spanish/German/Polish phrase style variants (deferred — English + Japanese styles first)
- AM/PM label on LCD face (out of scope for v3.9)
- LCD digit crossfade animation (out of scope)

## Out of Scope

- AM/PM label on LCD face — minimal aesthetic; no other clock style shows labels
- LCD digit crossfade animation — inconsistent with the widget's instant-update design
- Time-of-day period labels (朝/昼/夕/夜) in Japanese providers — adds complexity without matching the English phrase design
- French/Spanish/German/Polish style variants — English + Japanese are the two fully-supported style languages; other locales deferred
- Separate tray menu items for LCD sub-settings — Settings window is the primary settings surface since v3.2
- New DispatcherTimer for colon blink — existing 1s tick in LcdClockView is the correct driver
- Blinking Colon2 (seconds separator) — Colon1 (HH:MM) only

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| LCD-01 | Phase 63 | Pending |
| LCD-02 | Phase 63 | Pending |
| LCD-03 | Phase 63 | Pending |
| LCD-04 | Phase 63 | Pending |
| LCD-05 | Phase 63 | Pending |
| LCD-06 | Phase 64 | Pending |
| LCD-07 | Phase 65 | Pending |
| LCD-08 | Phase 65 | Pending |
| JA-01  | Phase 61 | Pending |
| JA-02  | Phase 61 | Pending |
| JA-03  | Phase 61 | Pending |
| JA-04  | Phase 62 | Pending |
| JA-05  | Phase 62 | Pending |
| JA-06  | Phase 61 | Pending |
