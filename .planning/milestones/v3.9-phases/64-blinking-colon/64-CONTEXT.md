# Phase 64: Blinking Colon - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a blinking colon to `LcdClockView`: the colon between HH and MM (`Colon1`) toggles visible/hidden on every 1-second timer tick. No new timer, no new settings, no new events — the existing `DispatcherTimer` already fires `UpdateTime()` every second.

This is a single-file change: `FuzzyClock.App/Controls/LcdClockView.xaml.cs`. ~4 lines of C#.

</domain>

<decisions>
## Implementation Decisions

### Toggle field
- **D-01:** Add `private bool _colonVisible = true;` field to `LcdClockView`. Initial state `true` so the colon is visible immediately on first render before the timer fires.

### UpdateTime modification
- **D-02:** In `UpdateTime()`, flip `_colonVisible = !_colonVisible;` at the start of the method (before any digit assignments).
- **D-03:** Replace the unconditional `Colon1.Character = ':'` with `Colon1.Character = _colonVisible ? ':' : ' ';`. Space character renders all segments hidden (layout preserved) via the existing `SevenSegmentDigit` logic.

### Colon2 (seconds separator)
- **D-04:** `Colon2` does NOT blink — per REQUIREMENTS.md out-of-scope note "Blinking Colon2 (seconds separator) — Colon1 (HH:MM) only".

### Timer guard
- **D-05:** No guard needed for when LCD is not the active clock type. The timer tick is harmless; `_colonVisible` resets within 1 second when LCD becomes active again. Adding a guard would be unnecessary complexity.

### Claude's Discretion
- Exact line positioning within `UpdateTime()` (toggle at top of method before digit assignments is natural)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §LCD-06 — acceptance criterion for blinking colon

### Primary file to modify
- `FuzzyClock.App/Controls/LcdClockView.xaml.cs` — `UpdateTime()` method; `Colon1` field; existing `_timer` wiring

### Reference (read-only)
- `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — confirms `Character = ' '` hides all segments while preserving layout space

</canonical_refs>

<code_context>
## Existing Code Insights

### LcdClockView.xaml.cs
- `DispatcherTimer _timer` fires every 1 second, calls `UpdateTime()`
- `UpdateTime()` currently sets `Colon1.Character = ':'` unconditionally
- `Colon2.Visibility` is already gated on `ShowSeconds` — do not change `Colon2`
- No existing `_colonVisible` field — this phase adds it

### SevenSegmentDigit.xaml.cs
- `Character = ' '` → all segment `Path` elements set to `Visibility.Hidden` (layout space preserved)
- `Character = ':'` → colon-specific rendering (two dots)
- Space is the correct "blank/off" value for the blink-off state

### Integration Points
- `LcdClockView.xaml.cs` only: add 1 field + 2 line changes in `UpdateTime()`
- No changes to MainWindow, SettingsWindow, AppSettings, XAML, or test files

</code_context>

<specifics>
## Specific Ideas

- The toggle fires on every tick regardless of whether LCD is the active clock type. This is intentional — the blink phase resets naturally within 1 second when LCD becomes active, and adding a `ClockType` guard would require LcdClockView to know about the active clock type.

</specifics>

<deferred>
## Deferred Ideas

None — no gray areas remained after context review.

</deferred>

---

*Phase: 64-blinking-colon*
*Context gathered: 2026-03-24*
