# Requirements: Fuzzy Clock

**Defined:** 2026-03-19
**Core Value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

## v3.7 Requirements

### Clock Type Migration

- [x] **NIX-01**: `AppSettings` and `SettingsSnapshot` use `ClockType` enum instead of `DialMode` bool; LCD fields added; JSON migration preserves existing dial/phrase preferences on upgrade
- [ ] **NIX-02**: `SettingsWindow` exposes a 3-button Clock Style rail (Phrase / Dial / Nixie) with `ClockTypeChanged` event; all 7 missing event declarations added (`ClockTypeChanged`, `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged`)
- [ ] **NIX-03**: Selecting Nixie in Settings activates the Nixie tube clock face on the widget; `_clockType` field drives all clock-type branching in `MainWindow`

### Build Integrity

- [x] **NIX-04**: Pre-existing build errors resolved (stale `_dialMode` reference in `ApplyPhraseWrap()`); project compiles clean with `dotnet build`

### Backdrop Cleanup

- [ ] **BACK-05**: The phrase/clock-area hover backdrop (`ContentBorder` background set in `Window_MouseEnter`) is removed; `BackdropBorder` is the sole hover backdrop for the widget

## Future Requirements

### LCD Clock

- LCD digit display as a fourth clock type (after Nixie plumbing is in place)

## Out of Scope

| Feature | Reason |
|---------|--------|
| LCD settings UI (24hr, seconds, style) | Phase 57 scope is Nixie only; LCD settings surfacing is future work |
| NixieDigit/NixieClockView rendering changes | Pre-existing controls are complete; no visual changes needed |
| Nixie accent color theming | UI-SPEC prohibits accent color bleed onto Nixie face; hardcoded amber palette is intentional |
| Nixie animation / cathode flicker | Out of scope for re-introduction; static digit display only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NIX-01 | Phase 58 | Complete |
| NIX-04 (GetSegmentKey errors) | Phase 58 | Pending |
| NIX-02 | Phase 59 | Pending |
| NIX-03 | Phase 59 | Pending |
| NIX-04 (stale _dialMode reference) | Phase 59 | Pending |
| BACK-05 | Phase 59 | Pending |

**Coverage:**
- v3.7 requirements: 5 total
- Mapped to phases: 5 (NIX-04 spans both phases; all requirements covered)
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — traceability updated for v3.7 roadmap (phases 58-59)*
