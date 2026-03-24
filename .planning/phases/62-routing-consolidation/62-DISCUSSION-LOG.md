# Phase 62: Routing Consolidation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 62-routing-consolidation
**Areas discussed:** Auto-detected Japanese, "ja" bare key, SetPhraseStyle scope

---

## Auto-detected Japanese

| Option | Description | Selected |
|--------|-------------|----------|
| Enable for auto-detect | Enable style combo when Windows locale is Japanese + user chose 'Auto' | |
| Explicit selection only | Only enable when user explicitly selects 'Japanese' in Language dropdown | ✓ |

**User's choice:** Explicit selection only (1B)
**Notes:** Japanese users who never touch the Language setting stay on Classic. Keeps the combo state unambiguous — it reflects the stored PhraseLocale field directly.

---

## "ja" Bare Key in PhraseEngine

| Option | Description | Selected |
|--------|-------------|----------|
| Remove it | Clean up; routing uses ja-classic/terse/poetic/rude; bare key is dead code | ✓ |
| Keep as fallback | Conservative; backward compat for any code that might call SetLocale("ja") | |

**User's choice:** Remove it (2A)
**Notes:** Phase 61 explicitly deferred this decision to Phase 62. Now executed.

---

## SetPhraseStyle Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Keep no-op for fr/es/de/pl | Style changes silently ignored for non-English/non-Japanese locales | ✓ |
| Route uniformly | ResolveLocaleKey for all locales; fr always returns "fr" ignoring style | |

**User's choice:** Keep no-op for fr/es/de/pl (3A)
**Notes:** Only en-* and ja-* have style variants in v3.9. No-op guard is correct behavior, not a limitation.

---

## Claude's Discretion

- Variable naming for updated isNonEnglish/isJapanese logic in SettingsWindow
- Whether to inline "ja-" + style expression or use nested switch
- Exact XAML Tag values on Language combo items

## Deferred Ideas

- Enabling style combo for auto-detected Japanese (out of scope per decision 1B)
- Style variants for fr/es/de/pl (future milestone)
