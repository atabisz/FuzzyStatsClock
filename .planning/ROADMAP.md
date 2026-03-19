# Roadmap: FuzzyClock v3.6.2

## Milestones

- ✅ **v3.6.1 Contrast Flicker Fix** - Phase 57 (shipped 2026-03-19)
- 🚧 **v3.6.2 Contrast Flicker Regression Fix** - Phase 58 (in progress)

## Phases

<details>
<summary>✅ Prior milestones (Phases 1–57) — SHIPPED</summary>

See MILESTONES.md for full history.

</details>

### 🚧 v3.6.2 Contrast Flicker Regression Fix (In Progress)

**Milestone Goal:** Re-investigate and permanently fix the contrast/backdrop flicker that regressed after v3.6.1. The `HasAppWindowBeneath` guard was human-verified at the time of shipping v3.6.1 but the flicker has returned. Root cause must be identified before applying a fix.

## Phase Details

### Phase 58: Contrast Flicker Regression Fix
**Goal**: Users who enable AutoContrast or BackdropAlwaysVisible see no flicker or oscillation over an empty desktop, while contrast still correctly switches when an application window is beneath the widget
**Depends on**: Phase 57 (v3.6.1 guard implementation)
**Requirements**: FIX-04, FIX-05, FIX-06
**Success Criteria** (what must be TRUE):
  1. With AutoContrast enabled and the widget over an empty desktop, the text color does not flicker or oscillate — it holds stable across at least 30 consecutive sampling ticks
  2. With BackdropAlwaysVisible enabled and the widget over an empty desktop, the backdrop color and text color do not flicker or oscillate
  3. With AutoContrast enabled and the widget dragged over an application window, the text color correctly switches to black or white within one sampling tick
  4. The fix does not regress any of the 274 existing MSTest tests (all pass, 0 failures)
**Plans:** 1 plan

Plans:
- [ ] 58-01-PLAN.md — Add SHELLDLL_DefView to shell exclusion list + human verify flicker-free

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 58. Contrast Flicker Regression Fix | v3.6.2 | 0/1 | Not started | - |
