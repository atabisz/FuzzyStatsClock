# Phase 61: Japanese Phrase Providers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 61-japanese-phrase-providers
**Mode:** --auto (all selections made automatically)
**Areas discussed:** Provider structure, Phrase vocabulary, PhraseEngine registry, Test pattern

---

## Provider Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Classic structure | Same HourWords[], Buckets[], {h}/{h1} templates, noon/midnight guards | ✓ |
| Independent bucket designs | Each style defines its own bucket boundaries and template system | |

**Auto-selected:** Mirror Classic structure
**Notes:** JapanesePhraseProvider (Classic) is the explicitly designated reference baseline per STATE.md. Same structure enables easy side-by-side code review and test reuse.

---

## Phrase Vocabulary

| Option | Description | Selected |
|--------|-------------|----------|
| Map English style registers to Japanese | Terse=compact/colloquial, Poetic=atmospheric imagery, Rude=blunt+particles | ✓ |
| Full native Japanese redesign | Design vocabulary from scratch without English-style mapping | |

**Auto-selected:** Map English style registers to Japanese (with provisional marking)
**Notes:** English counterparts (TersePhraseProvider, PoeticPhraseProvider, RudePhraseProvider) serve as register guides. Vocabulary is LOW confidence per STATE.md; both Poetic and Rude classes will carry provisional XML doc comments. Exact phrase wording left to Claude's discretion.

---

## PhraseEngine Registry

| Option | Description | Selected |
|--------|-------------|----------|
| Add ja-classic alias + ja-terse/poetic/rude | Keep "ja" key, add 4 new keys | ✓ |
| Replace "ja" with "ja-classic" | Rename existing key | |

**Auto-selected:** Add ja-classic alias alongside existing "ja" key
**Notes:** Renaming "ja" is Phase 62's concern (routing consolidation). Phase 61 only adds the new keys so they exist for Phase 62 to wire up.

---

## Test Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Follow MultilingualPhraseProviderTests.cs | 4 tests per class: noon, midnight, all-buckets DataRow, GetStructuredPhrase | ✓ |
| Follow PhraseStyleProviderTests.cs | Bucket-specific named test methods | |

**Auto-selected:** Follow MultilingualPhraseProviderTests.cs pattern
**Notes:** Japanese providers are multilingual in nature (not English style variants), so the multilingual test pattern is the correct match. Coordinator tests (SetLocale round-trips for ja-* keys) go in PhraseEngineCoordinatorTests with [DoNotParallelize].

---

## Claude's Discretion

- Exact Japanese phrase wording for all 12 buckets in each style
- Whether to append new test classes to MultilingualPhraseProviderTests.cs or create JapaneseStyleProviderTests.cs

## Deferred Ideas

- Phrase style selector routing in SettingsWindow — Phase 62
- Period labels (朝/昼/夕/夜) — out of scope per REQUIREMENTS.md
