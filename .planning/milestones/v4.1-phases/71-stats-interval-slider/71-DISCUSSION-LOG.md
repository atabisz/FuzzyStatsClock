# Phase 71: Stats Interval Slider - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 71-stats-interval-slider
**Areas discussed:** Default interval, Slider presentation, Tray menu cleanup

---

## Default Interval

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 3s (Recommended) | Proven balance of responsiveness vs resource use. Existing users upgrading won't notice a change. | |
| Shift to 1s | More responsive out of the box. Slightly higher CPU from more frequent WMI/perf counter queries. | |
| Shift to 2s | Compromise — noticeably snappier than 3s without the overhead of 1s. | ✓ |

**User's choice:** Shift to 2s
**Notes:** User chose the middle ground — responsive enough to feel snappy without unnecessary overhead.

---

## Slider Presentation — Tick Marks

| Option | Description | Selected |
|--------|-------------|----------|
| Clean slider (Recommended) | Matches existing Opacity and GhostFadeRadius sliders — consistent look. Value label shows current value. | ✓ |
| Tick marks at key values | Small ticks at 1s, 2s, 3s, 5s, 10s help users land on round numbers. Slightly busier visual. | |

**User's choice:** Clean slider
**Notes:** Consistency with existing slider patterns preferred.

## Slider Presentation — Label Format

| Option | Description | Selected |
|--------|-------------|----------|
| Compact: "2.5s" | Matches the terse style of the widget itself. Same density as GhostFadeRadius label ("80px"). | ✓ |
| Spelled out: "2.5 sec" | Slightly more readable, still compact. | |
| Full: "2.5 seconds" | Fully spelled out — clearest but takes more space in the Stats tab. | |

**User's choice:** Compact: "2.5s"
**Notes:** Matches GhostFadeRadiusLabel density.

---

## Tray Menu Cleanup

No options presented — investigation revealed the stats interval control is already exclusively in Settings > Stats (moved in v3.2). No tray submenu exists to clean up.

**User's choice:** N/A — no action needed
**Notes:** Confirmed no tray cleanup required.

---

## Claude's Discretion

- Field type migration (int → double) strategy
- Slider step granularity (0.1s implied by STAT-04)
- CPU load average math adjustment for fractional intervals

## Deferred Ideas

None — discussion stayed within phase scope.
