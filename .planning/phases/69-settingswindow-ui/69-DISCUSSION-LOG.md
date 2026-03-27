# Phase 69: SettingsWindow UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 69-settingswindow-ui
**Areas discussed:** Slider placement

---

## Slider placement

| Option | Description | Selected |
|--------|-------------|----------|
| Indented sub-panel below checkbox | Nested StackPanel directly below ChkGhostMode — visually grouped as a child setting of Ghost Mode. Same WrapStylePanel pattern. | ✓ |
| Separate labeled section | Own section heading "Proximity Fade Radius" with description text, below the three checkboxes. Same visual weight as the Battery Alert section. | |

**User's choice:** Indented sub-panel below checkbox (Recommended)

---

## Claude's Discretion

- Tick granularity (10px steps, IsSnapToTickEnabled=True)
- Label text: "Fade Radius" header + "{N} px" value
- x:Name values: GhostFadeRadiusSlider, GhostFadeRadiusLabel, GhostFadeRadiusPanel
- Live-update event pattern (Action<int>? GhostFadeRadiusPxChanged — consistent with all other settings events)
- Tick granularity / snap behavior (not discussed)

## Deferred Ideas

None.
