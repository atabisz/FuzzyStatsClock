# Phase 1: Phrase Engine - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A pure C# function that takes a `DateTime` and returns a natural English time phrase. No WPF dependency. The phrase vocabulary — all 12 five-minute bucket mappings, special cases, and wording style — is defined and locked here.

</domain>

<decisions>
## Implementation Decisions

### Phrase vocabulary

Full 12-bucket mapping per hour. Decisions confirmed:

| Bucket | Minutes | Phrase |
|--------|---------|--------|
| :00 | 0–2 | `[h] o'clock` (e.g. "3 o'clock") |
| :05 | 3–7 | `just after [h]` |
| :10 | 8–12 | Claude's discretion |
| :15 | 13–17 | `a quarter past [h]` |
| :20 | 18–22 | `just after quarter past [h]` |
| :25 | 23–27 | Claude's discretion |
| :30 | 28–32 | `half past [h]` |
| :35 | 33–37 | Claude's discretion |
| :40 | 38–42 | Claude's discretion |
| :45 | 43–47 | `a quarter before [h+1]` |
| :50 | 48–52 | Claude's discretion |
| :55 | 53–57 | `almost [h+1]` |

Special cases override the bucket logic:
- 12:00 PM → **"noon"**
- 12:00 AM → **"midnight"**

Fuzzy buckets near noon/midnight (e.g. :55 approaching midnight, :05 after noon) follow the same pattern as regular hours — "almost midnight", "just after noon". No special time-of-day phrasing.

### Number format

- Always use **numerals**, not words: "3 o'clock" not "three o'clock"
- :00 slot format: `[h] o'clock` (confirmed by project examples)

### AM/PM context

- Phrases do **not** indicate morning/afternoon/evening
- The hour number alone is sufficient — no "in the afternoon" suffix
- Exception: only at exact 12:00 PM/AM (noon/midnight special case above)

### Claude's Discretion

- Exact wording for buckets :10, :25, :35, :40, :50 — choose phrases consistent with the confirmed style (informal, poetic, English-idiomatic). Suggestions: "just past [h]" / "almost half past [h]" / "just past half past [h]" / "almost a quarter before [h+1]" / "nearly [h+1]"
- Bucket boundary widths for undecided slots — align to the ~5-min pattern established above
- Unit test structure and coverage strategy

</decisions>

<specifics>
## Specific Ideas

- Project's own examples established the register: "12 o'clock", "a quarter before 1", "just a little after 11"
- The :45 slot explicitly uses "a quarter **before**" (American English style), not "quarter to" (British)
- The :05 slot uses "just after" (not "just a little after" from the examples — user selected this shorter form)
- The overall tone is informal and conversational, not precise or digital

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-phrase-engine*
*Context gathered: 2026-02-25*
