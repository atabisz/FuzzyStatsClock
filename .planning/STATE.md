---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: milestone
status: completed
last_updated: "2026-04-01T23:07:36.832Z"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 8
  completed_plans: 8
  percent: 83
---

# Project State: FuzzyStatsClock

**Last updated:** 2026-04-01
**Current milestone:** v4.1 Polish & Phrases
**Status:** v4.1 milestone complete

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Phase 74 — remove-named-themes

## Current Position

Phase: 74
Plan: Not started
**Status:** Phase 73 in progress — Pirate provider expanded (plan 02), Jive (plan 01) and Yoda (plan 03) remaining
**Progress:** [████████░░] 83%

## Performance Metrics

**Velocity:** N/A (milestone start)
**Test suite:** 467 MSTest tests (399 Core + 68 App), 0 failures (expanded in Phase 72)
**Technical debt:** Low (mature codebase with 481 decisions logged)

## Accumulated Context

### Key Decisions This Milestone

- Phase numbering continues from v4.0 (phases 70-74)
- Phases 72 and 73 can run in parallel (independent content work)
- Phase 74 must wait for Phase 71 schema stability
- All features leverage existing patterns (no new dependencies)
- **Phase 70-01:** Doubled ContentBorder padding from 6px to 12px for balanced appearance
- **Phase 70-01:** Added horizontal margins (12px) to DateText and StatsPanel for alignment with ContentBorder
- **Phase 70-01:** Increased vertical gaps to 8px (from 2px and 4px) between clock/date/stats
- **Phase 70-01:** No C# code changes required — WPF SizeToContent propagates new dimensions automatically
- **Phase 71-01:** StatsIntervalSeconds migrated from int to double with 2.0s default (was 3s)
- **Phase 71-01:** Continuous slider (0.5-10.0s) replaces discrete ComboBox (1s/3s/10s)
- **Phase 71-01:** Validation: range [0.5, 10.0], Math.Round(value, 1) for precision
- **Phase 71-01:** ResetToDefaults now resets stats interval to 2.0s (was missing before)
- **Phase 72-01:** EnglishPhraseProvider (Classic) expanded to 70 candidates (14 slots × 5 each)
- **Phase 72-02:** TersePhraseProvider expanded to 65 candidates (13 slots × 5 each, British idiom)
- **Phase 72-02:** GetSegmentKey changed from phrase-based to bucket-index based for stability across random selection
- **Phase 73-02:** PiratePhraseProvider expanded to 70 candidates with authentic nautical language
- **Phase 73-02:** Removed movie cliches ("shiver me timbers", "it's X o'clock") in favor of maritime terms (bells, watch, glass, mark, course, bearing, trim, log, strike)
- **Phase 73-02:** All 14 slots (12 buckets + noon + midnight) expanded to 5 candidates each for consistent variety

### Open Questions

1. ~~**Backdrop padding amount:** Research suggests 12-16px; needs design decision in Phase 70 planning~~ RESOLVED: 12px selected and implemented in Phase 70-01
2. ~~**Stats slider default:** Keep 3s default or shift to 1s now that 0.5s is available?~~ RESOLVED: 2.0s chosen as practical midpoint (Phase 71-01)
3. **Phrase expansion targets:** Uniform 3/provider (27 total) or prioritize personalities at 5/provider?
4. **Non-English expansion:** Defer French/Spanish/German/Japanese/Polish until native review? (flagged in research)
5. **Theme migration scope:** Inject theme values only for absent fields (preserves custom) or overwrite all fields?

### Active TODOs

- [x] Begin Phase 70 planning with `/gsd:plan-phase 70` — COMPLETE
- [x] Decide backdrop padding amount (8px / 12px / 16px / 20px) — 12px selected
- [x] Audit all 7 GetWindowRect call sites before Phase 70 implementation — not needed (SizeToContent handles all)
- [ ] Flag non-English phrase expansion for native review (Phase 72)
- [ ] Flag Jive/Pirate/Yoda linguistic research for Phase 73

### Known Blockers

None. All phases have clear requirements and established patterns.

## Session Continuity

### What Just Happened

Phase 72-02 execution complete:

- Expanded TersePhraseProvider to 65 phrase candidates (13 slots × 5 each)
- Added 11 new TersePhraseProviderExpandedTests covering all buckets, British idiom, segment key stability, randomization
- Fixed 18 broken tests from Phase 72-01 (Classic provider randomization regression)
- Updated PhraseEngineTests, SegmentKeyTests, PhraseStyleProviderTests to pattern-based assertions
- All 467 tests pass (399 Core + 68 App)
- Commits: 3b8901d (Terse expansion), d0440b0 (tests + regression fixes)
- Phase 72 complete: Both Classic and Terse providers now have multi-candidate phrase variety

### Next Session Should Know

- This is a polish milestone — no new architectural components, zero new dependencies
- All five features use existing WPF primitives and validated patterns from v1.0-v4.0
- Research identified 5 critical/moderate pitfalls with specific prevention strategies
- Phases 72 and 73 are pure content work (can be split across parallel efforts)
- Phase 74 migration logic must handle all 5 built-in theme names plus null/absent field

### Context for Continuation

- Milestone goal: Polish + phrase variety + settings simplification
- Previous milestone: v4.0 Proximity Ghost Mode (phases 66-69, shipped 2026-03-27)
- Test baseline: 414 tests passing
- Config: mode=yolo, granularity=standard, research=true, commit_docs=true

---
*State snapshot: 2026-04-01 after Phase 72-02 execution*
