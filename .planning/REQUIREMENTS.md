# Requirements: v3.4 Personalities & Nixie

**Defined:** 2026-03-11
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

---

## Goal

Expand the phrase clock with 7 new personality styles (including a much ruder Rude), add a
visually-distinctive Nixie tube clock face as a fourth clock type, and give the dial clock
shape and size options.

---

## v3.4 Requirements

### Phrase Personalities

- [x] **PHRASE-01**: User sees significantly ruder vocabulary in Rude style (WTF, dafaq, tf, etc.)
- [x] **PHRASE-02**: User can select Pirate phrase style ("'Tis nearly half past the third bell, yarr")
- [x] **PHRASE-03**: User can select Dwarf phrase style (gruff, blunt, mining/ale references)
- [x] **PHRASE-04**: User can select Jive phrase style (1940s Harlem Jive slang)
- [x] **PHRASE-05**: User can select Valley Girl phrase style ("like, it's literally almost noon")
- [x] **PHRASE-06**: User can select Yoda phrase style ("quarter past three, it is")
- [x] **PHRASE-07**: User can select Shakespearean phrase style ("Hark! 'Tis a quarter past the third hour")
- [ ] **PHRASE-08**: All new styles appear in Settings window Phrase Style selector and persist across restarts
- [ ] **PHRASE-09**: Tests cover each new style with ≥ 2 phrase samples verified per provider

### Nixie Tube Clock

- [ ] **NIXIE-01**: User can select Nixie as a fourth clock type (alongside Phrase, Dial, LCD)
- [ ] **NIXIE-02**: Nixie digits show warm orange glow/bloom effect around each active digit
- [ ] **NIXIE-03**: All 10 digit ghost cathodes are visible behind the active digit (stacked digit shadow)
- [ ] **NIXIE-04**: Each digit slot is enclosed in a glass tube border
- [ ] **NIXIE-05**: A faint wire mesh / anode grid texture overlays each digit slot
- [ ] **NIXIE-06**: Nixie clock type is available in Settings window and tray Clock Type submenu
- [ ] **NIXIE-07**: Nixie clock type persists across restarts via `AppSettings.ClockType`

### Dial Enhancements

- [ ] **DIAL-01**: User can select round or oval dial shape in the Appearance tab of Settings window
- [ ] **DIAL-02**: Dial size scales automatically with Font Size setting (Small/Medium/Large → small/medium/large dial canvas)
- [ ] **DIAL-03**: Dial shape preference persists across restarts

---

## v5+ Requirements (Deferred)

### Phrase Personalities

- **PHRASE-X**: Italian, Portuguese, Dutch phrase locales
- **PHRASE-X**: User-authored custom phrase sets

### Nixie

- **NIXIE-X**: Nixie has its own color theme options (e.g. blue/green Nixie variants)
- **NIXIE-X**: Nixie blink colon separator

### Dial

- **DIAL-X**: Smooth continuous second-hand sweep (sub-second update)
- **DIAL-X**: User-configurable dial colors independent of accent color

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Nixie seconds display | Adds significant UI width; defer until Nixie size options exist |
| Nixie 12/24hr toggle | Nixie displays 12hr only for v3.4; simplifies initial build |
| Phrase styles for non-English locales | English-only personalities; locale variants are a separate concern |
| Blinking colon on Nixie | Deferred; not requested in v3.4 |
| AM/PM indicator on Nixie | Same decision as LCD; natural English implies 12hr |

---

## Constraints

- **ClockType enum**: Nixie adds as 4th value `ClockType.Nixie`; JSON serialized as string via `JsonStringEnumConverter`
- **WPF-only rendering**: Nixie glow via WPF `RadialGradientBrush` effects, no image assets
- **248 existing tests must pass** with zero regressions; new tests target ≥ 265 total
- **Provider pattern**: New phrase styles follow `IPhraseProvider` pattern established in v3.2

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PHRASE-01 | Phase 55 | Complete |
| PHRASE-02 | Phase 55 | Complete |
| PHRASE-03 | Phase 55 | Complete |
| PHRASE-04 | Phase 55 | Complete |
| PHRASE-05 | Phase 55 | Complete |
| PHRASE-06 | Phase 55 | Complete |
| PHRASE-07 | Phase 55 | Complete |
| PHRASE-08 | Phase 55 | Pending |
| PHRASE-09 | Phase 55 | Pending |
| NIXIE-01 | Phase 56 | Pending |
| NIXIE-02 | Phase 56 | Pending |
| NIXIE-03 | Phase 56 | Pending |
| NIXIE-04 | Phase 56 | Pending |
| NIXIE-05 | Phase 56 | Pending |
| NIXIE-06 | Phase 56 | Pending |
| NIXIE-07 | Phase 56 | Pending |
| DIAL-01 | Phase 57 | Pending |
| DIAL-02 | Phase 57 | Pending |
| DIAL-03 | Phase 57 | Pending |

**Coverage:**
- v3.4 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 — traceability complete after roadmap creation*
