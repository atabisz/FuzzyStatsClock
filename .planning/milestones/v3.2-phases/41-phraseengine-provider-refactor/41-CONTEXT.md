# Phase 41: PhraseEngine Provider Refactor - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure `PhraseEngine` internals to use a provider interface pattern (`IPhraseProvider` / `EnglishPhraseProvider`), add `SetLocale()` for runtime provider swapping, and expose `CurrentLocale`. No user-visible behavior changes. Unblocks future phrase styles (STYLE-01–04) and language support (LANG-01–04).

</domain>

<decisions>
## Implementation Decisions

### Unknown locale handling
- When `SetLocale("fr")` is called but no French provider is registered, silently keep the current active provider — no exception, no fallback to English Classic
- `SetLocale()` returns `bool`: `true` = locale accepted and provider swapped, `false` = locale unknown (provider unchanged)
- Default locale on startup: `"en-classic"` — hardcoded, maps to `EnglishPhraseProvider`, preserves existing behavior
- `PhraseEngine` exposes a `CurrentLocale` string property so callers and tests can verify which locale is active

### Claude's Discretion
- Which methods belong on `IPhraseProvider` (GetPhrase, GetStructuredPhrase, or others) — Claude determines based on current PhraseEngine surface
- How providers are registered (hard-coded, dictionary, etc.) — Claude picks the simplest approach that keeps tests green
- Whether test files are literally unmodified or just logically equivalent — Claude ensures all 122 assertions still hold; minor restructuring of test helpers is acceptable if needed

</decisions>

<specifics>
## Specific Ideas

- No specific references. Infrastructure refactor — standard C# interface extraction patterns apply.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 41-phraseengine-provider-refactor*
*Context gathered: 2026-03-08*
