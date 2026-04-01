# Roadmap: v4.1 Polish & Phrases

**Milestone:** v4.1 Polish & Phrases
**Created:** 2026-03-31
**Granularity:** Standard (5 phases)
**Requirements:** 16 total (100% coverage)

## Vision

Improve visual polish, expand phrase variety, and simplify settings by removing unused themes. This milestone refines the mature v4.0 codebase with zero new dependencies — all features leverage existing WPF primitives and established patterns.

## Phases

- [x] **Phase 70: Backdrop Padding** - Add visual breathing room around content with inner margins (completed 2026-04-01)
- [ ] **Phase 71: Stats Interval Slider** - Replace discrete 1s/3s/10s selector with continuous 0.5-10s slider
- [ ] **Phase 72: Expand Phrase Providers** - Add 3-5 variations per bucket across all 9 non-novelty providers
- [ ] **Phase 73: Deepen Jive/Pirate/Yoda** - Expand personality providers with authentic linguistic patterns
- [ ] **Phase 74: Remove Named Themes** - Delete obsolete theme infrastructure with settings migration

## Phase Details

### Phase 70: Backdrop Padding
**Goal:** Widget has generous visual breathing room around clock text, date, stats, and uptime content without breaking edge snapping, ghost mode, contrast sampling, or position clamping.

**Depends on:** Nothing (first phase)

**Requirements:** VIS-01, VIS-02

**Success Criteria** (what must be TRUE):
1. Backdrop has visibly larger padding (12-16px) around all content elements
2. Padding uses inner margins on StackPanel children, NOT Border.Padding property
3. Edge snapping still triggers within 8px of screen edges after drag
4. Ghost mode hit-testing (GetWindowRect) works correctly with new dimensions
5. Contrast sampling footprint matches visible backdrop area

**Plans:** 1/1 plans complete

Plans:
- [x] 70-01-PLAN.md — Increase backdrop padding to 12px with visual verification

---

### Phase 71: Stats Interval Slider
**Goal:** Users can fine-tune stats update rate with continuous control instead of arbitrary ladder values.

**Depends on:** Nothing (independent of Phase 70)

**Requirements:** STAT-01, STAT-02, STAT-03, STAT-04

**Success Criteria** (what must be TRUE):
1. Settings > Stats tab shows a continuous slider (0.5-10.0s range) with value display
2. Discrete 1s/3s/10s selector no longer exists in Settings
3. Slider changes apply immediately to the live stats timer interval
4. Stats interval persists as a decimal value (e.g. 2.3) to settings.json
5. SettingsService.Validate() clamps interval to 0.5-10.0 range with Math.Round to 1 decimal place

**Plans:** TBD

---

### Phase 72: Expand Phrase Providers
**Goal:** All non-novelty phrase providers have multiple variations per time bucket to reduce repetition.

**Depends on:** Nothing (pure content work, independent of other phases)

**Requirements:** PHRASE-01, PHRASE-02, PHRASE-03

**Success Criteria** (what must be TRUE):
1. Each of the 9 non-novelty providers (English Classic/Terse/Poetic/Rude, French, Spanish, German, Japanese, Polish) has at least 3 phrase candidates per bucket
2. Phrases randomize within each bucket so consecutive same-bucket ticks can show different text
3. Unit tests verify all 9 providers have complete coverage (12 buckets + noon + midnight = 14 cases each)
4. Users notice phrase variety within the first week of use (no more than 2-3 identical phrases per day)

**Plans:** TBD

---

### Phase 73: Deepen Jive/Pirate/Yoda
**Goal:** Novelty personality providers feel authentic and consistent, not gimmicky.

**Depends on:** Nothing (can run in parallel with Phase 72)

**Requirements:** PERS-01, PERS-02, PERS-03

**Success Criteria** (what must be TRUE):
1. Jive provider uses rhythmic, expressive AAVE-inspired phrasing consistently across all buckets
2. Pirate provider uses nautical metaphors and seafaring language naturally in time expressions
3. Yoda provider consistently applies OSV (Object-Subject-Verb) syntax inversion to phrases
4. All three providers have at least 3 variations per bucket (same coverage as Phase 72)
5. Human review confirms authenticity (no caricature or unreadable density)

**Plans:** TBD

---

### Phase 74: Remove Named Themes
**Goal:** Settings window is simpler with named themes removed; users with saved themes migrate cleanly to direct accent color control.

**Depends on:** Phase 71 (requires stable AppSettings schema after StatsIntervalSeconds type change)

**Requirements:** CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04

**Success Criteria** (what must be TRUE):
1. Settings > Appearance no longer shows named themes (Midnight/Neon/Ghost/Warm/Terminal)
2. ThemeDefinition record, BuiltInThemes registry, and ApplyNamedTheme() method deleted from codebase
3. Users upgrading from v4.0 with a saved Theme field in settings.json see their current accent color preserved
4. AppSettings.Theme field removed; SettingsService.Validate() no longer references themes
5. Migration logic handles all 5 built-in theme names plus null/absent field cases

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 70. Backdrop Padding | 1/1 | Complete   | 2026-04-01 |
| 71. Stats Interval Slider | 0/? | Not started | - |
| 72. Expand Phrase Providers | 0/? | Not started | - |
| 73. Deepen Jive/Pirate/Yoda | 0/? | Not started | - |
| 74. Remove Named Themes | 0/? | Not started | - |

## Coverage Map

| Requirement | Phase | Description |
|-------------|-------|-------------|
| VIS-01 | 70 | Backdrop padding visibly larger |
| VIS-02 | 70 | Padding doesn't break layout assumptions |
| STAT-01 | 71 | Continuous slider in Settings |
| STAT-02 | 71 | Replaces discrete selector |
| STAT-03 | 71 | Persists as decimal value |
| STAT-04 | 71 | Validation clamps and rounds |
| PHRASE-01 | 72 | 5+ candidates per bucket |
| PHRASE-02 | 72 | Randomized selection |
| PHRASE-03 | 72 | Unit test coverage |
| PERS-01 | 73 | Jive linguistic patterns |
| PERS-02 | 73 | Pirate nautical metaphors |
| PERS-03 | 73 | Yoda OSV syntax |
| CLEAN-01 | 74 | Themes removed from Settings |
| CLEAN-02 | 74 | Theme code deleted |
| CLEAN-03 | 74 | Migration preserves accent color |
| CLEAN-04 | 74 | Theme field removed from AppSettings |

**Coverage:** 16/16 requirements mapped (100%)

## Dependencies

```
Phase 70: Backdrop Padding (independent)
Phase 71: Stats Interval Slider (independent)
Phase 72: Expand Phrase Providers (independent, can parallel with 73)
Phase 73: Deepen Jive/Pirate/Yoda (independent, can parallel with 72)
Phase 74: Remove Named Themes (depends on Phase 71 schema stability)
```

## Research Notes

From research/SUMMARY.md:
- **Critical Pitfall #1 (Phase 70):** Use inner margins on content, NOT Border.Padding (avoids GetWindowRect cascade at 5+ sites)
- **Critical Pitfall #2 (Phase 71):** Add Math.Round(value, 1) in slider handler to prevent floating-point drift
- **Critical Pitfall #3 (Phase 74):** Write Theme→AccentColor migration in Load() BEFORE deleting BuiltInThemes
- **Moderate Pitfall #4 (Phases 72/73):** Add exhaustive 14-case test per provider before expansion work
- **Moderate Pitfall #5 (Phase 73):** Human review every phrase; "dial it back" pass removes 30% of dialect markers

---
*Last updated: 2026-04-01*
