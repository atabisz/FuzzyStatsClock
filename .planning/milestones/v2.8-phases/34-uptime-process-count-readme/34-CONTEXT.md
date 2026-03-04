# Phase 34: Uptime Process Count + README - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Two independent deliverables:
1. The uptime line shows a process count in `{N}p` format — updated each stats tick
2. The README accurately documents all current features and interaction modes

Creating new features, changing the stats layout, or adding new README sections beyond feature coverage are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Process count behavior
- Count shows only processes with **≥5% CPU utilization** (not total process count)
- Uses delta of `TotalProcessorTime` between consecutive ticks, divided by elapsed time × `ProcessorCount`
- First tick yields 0 (no prior baseline) — this is acceptable; subsequent ticks show accurate active count
- Format stays as `{N}p` — no qualifier suffix or label change. The number speaks for itself.
- Processes that exit between ticks or deny access are silently skipped (try/catch per-process)

### Process count display position
- Appended at the end of the uptime line, same as before: `up 5h 3m   0.52  0.47  0.43  7p`
- No layout or spacing changes to the uptime TextBlock

### README coverage (DOCS-01)
- Must include all v2.7-era features: ghost mode, auto-contrast, tray controls, accent colors, window opacity, uptime row, auto-launch at login, per-monitor position memory
- Process count in the uptime row must be described accurately as **active processes (≥5% CPU)**, not total process count
- Prose style — no screenshots required. Code examples not needed for a UI app.

### README interaction modes (DOCS-02)
- Three modes documented: right-click context menu, mouse interactions (drag + scroll wheel), system tray controls
- Each mode gets its own subsection so users can find what they need

### Claude's Discretion
- Exact wording and heading structure of README sections
- Whether to include a feature table or bullet list
- README intro/tagline

</decisions>

<specifics>
## Specific Ideas

- The active-process count (≥5% CPU) is the deliberate behavior — the README and any inline comments should reflect this accurately, not describe it as "total process count"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 34-uptime-process-count-readme*
*Context gathered: 2026-03-04*
