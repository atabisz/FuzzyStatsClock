# Phase 72: Expand Phrase Providers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 72-expand-phrase-providers
**Areas discussed:** Provider scope, Candidate count, Classic style identity

---

## Provider Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Classic + Terse only | The only English non-novelty providers with 1 candidate per bucket. Poetic/Rude already have 4-5. Non-English deferred per REQUIREMENTS. Novelty is Phase 73. | ✓ |
| Classic + Terse + bump Poetic/Rude to 5+ | Also add 1-2 more candidates per bucket to Poetic (4→5+) and Rude (4-5→5+) for uniformity. | |
| All 10 English providers | Per REQUIREMENTS PHRASE-01 literally — includes novelty providers too (overlaps with Phase 73). | |

**User's choice:** Classic + Terse only
**Notes:** Poetic/Rude already sufficient. Novelty providers are Phase 73. Non-English deferred per REQUIREMENTS.

---

## Candidate Count

| Option | Description | Selected |
|--------|-------------|----------|
| 5 per bucket | Matches REQUIREMENTS PHRASE-01. Aligns with Rude provider (4-5 currently). Enough variety that you rarely see the same phrase twice in a row. | ✓ |
| 3 per bucket | Matches ROADMAP success criteria. Less writing effort. Noticeable variety but occasional repeats. | |
| 4 per bucket | Matches Poetic provider. Middle ground between ROADMAP and REQUIREMENTS targets. | |

**User's choice:** 5 per bucket
**Notes:** None

### Follow-up: Noon/Midnight

| Option | Description | Selected |
|--------|-------------|----------|
| Keep single ('noon' / 'midnight') | Clean and unambiguous. These are exact moments, not fuzzy ranges. | |
| 5 candidates each | Per REQUIREMENTS: '12 buckets + noon + midnight'. Adds variety. | ✓ |

**User's choice:** 5 candidates each for noon and midnight
**Notes:** Matches REQUIREMENTS literally.

---

## Classic Style Identity

| Option | Description | Selected |
|--------|-------------|----------|
| Close synonyms | Keep the same neutral, everyday tone. Variants like 'ten after three' vs 'ten past three' vs 'ten minutes past three'. Never poetic or slangy. | ✓ |
| Allow mild variety | Still neutral but slightly wider range. Could include 'about half past three' or 'coming up on four'. | |
| You decide | Claude has discretion within 'neutral everyday English' constraint. | |

**User's choice:** Close synonyms
**Notes:** None

### Follow-up: Terse Tone

| Option | Description | Selected |
|--------|-------------|----------|
| Strictly British | Keep the 'half four' / 'just gone three' / 'quarter to' British idiom. Variants are British synonyms only. | ✓ |
| Allow general terse | Can include short non-British forms like 'ten til four' (American) alongside British forms. | |
| You decide | Claude has discretion within 'compact/brief' constraint. | |

**User's choice:** Strictly British
**Notes:** None

---

## Claude's Discretion

- Exact phrase content within style constraints
- Bucket data structure refactoring approach
- GetSegmentKey() and GetStructuredPhrase() implementation details
- Test structure and assertions

## Deferred Ideas

- Non-English phrase expansion — future milestone, requires native review
- Bumping Poetic/Rude candidate count — already sufficient
