# Phase 79: Temps Line on Widget — Discussion Log

**Session date:** 2026-05-04
**Mode:** discuss (default, interactive)
**Areas selected:** All 4 gray areas selected; 1 follow-up question asked on accent/auto-contrast

---

## Area 1: Refresh Throttle Mechanism (TEMP-LINE-05)

**Q:** TemperatureService Path 2 already rate-limits itself at 2s cadence. What throttle does the widget need?

**Options presented:**
- **Nothing — widget reads volatile fields every tick (Recommended)** — service-layer throttling satisfies TEMP-LINE-05
- Widget-side `_lastTempsUpdate` timestamp — redundant
- Reformat only when values change — premature optimization

**User selected:** Nothing — widget reads volatile fields every tick (Recommended)

**Captured as:** D-01 + D-02

---

## Area 2: Empty-Line Visibility Policy (TEMP-LINE-04)

**Q:** When TemperatureFormatter.Format returns empty string, what does TempsText do?

**Options presented:**
- **Collapsed — StatsPanel reflows height (Recommended)** — matches existing convention (UptimeText.Visibility at MainWindow.xaml.cs:1111)
- Visible with empty Text — reserves an empty stripe; looks broken
- Hybrid — inconsistent UX

**User selected:** Collapsed — StatsPanel reflows height (Recommended)

**Captured as:** D-03 + D-04

---

## Area 3: Master/Stats Gating Predicate (TEMP-LINE-01)

**Q:** What's the complete visibility gate for TempsText?

**Options presented:**
- **`Visibility = (TempsLineVisible && formatted.Length > 0) ? Visible : Collapsed` (Recommended)** — Stats-off handled by WPF layout inheritance (TempsText is child of StatsPanel)
- Explicit compound check — redundant
- Separate gates — same as option 1

**User selected:** Option 1 — master + formatter-output check only; Stats-off inherits

**Captured as:** D-05 + D-06

---

## Area 4: Event Reflow vs Timer Reflow (TEMP-TAB-05 SC5)

**Q:** How does the widget reflect Settings toggle changes — immediately on event, or next tick?

**Options presented:**
- **Extend Phase 78 handlers — each also calls UpdateTempsDisplay() (Recommended)** — immediate visual reflow on toggle; matches "no widget restart" spec
- Let next timer tick pick up — up to 500ms lag (hover) or 5s lag (normal)
- Dirty-flag hybrid — more moving parts, no gain

**User selected:** Extend Phase 78 handlers (Recommended)

**Captured as:** D-07 + D-08 + D-09

---

## Follow-up: Accent Color + Auto-Contrast (TEMP-LINE-06)

**Q:** Mirror UptimeText pattern for TempsText.Foreground — any concerns?

**Options presented:**
- **Clone the pattern at both ApplyDisplayColor AND ApplyTheme sites (Recommended)** — CLAUDE.md critical pattern from Phase 33 v2.7 lesson
- Single-site addition — risk of theme-switch leaving TempsText un-recolored
- Style resource with accent binding — heavier refactor, no precedent in this codebase

**User selected:** Clone the pattern at both sites (Recommended)

**Captured as:** D-10 + D-11 + D-12

---

## Claude's Discretion (deferred to planner)

- Exact call site for `UpdateTempsDisplay()` inside the timer tick (right after `UpdateUptimeDisplay` is the obvious placement)
- Whether `UpdateTempsDisplay` splits into a pure helper + UI wrapper for testability
- Test file naming (`TempsLineTests.cs` vs extending `AppSettingsTests.cs`)
- Plan count — 1 vs 2 plans; human-verify as its own plan vs final task (follow Phase 78 = 2-plan split per D-18)
- Exact commit structure and naming (follow Phase 78 atomic-commit discipline)

---

## Deferred Ideas Captured

- Widget-side throttle / dirty-flag — rejected D-01/D-02
- Test-seam split — planner discretion, not locked
- Per-segment color coding (e.g. red at CPU > 90°) — Future Requirements, not Phase 79
- Per-core CPU / Fahrenheit toggle / sparklines — Future Requirements

---

*Discussion complete — 4/4 primary gray areas + 1 follow-up resolved; 0 scope creep; CONTEXT.md written with 19 locked decisions (D-01..D-19).*
