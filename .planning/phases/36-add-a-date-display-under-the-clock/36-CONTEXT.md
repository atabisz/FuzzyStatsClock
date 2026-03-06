# Phase 36: Add a date display under the clock - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a date text line to the widget displayed directly below the time phrase or analog dial. Users see the current date at a glance alongside the time. The date is toggleable and its format is configurable from the tray menu.

</domain>

<decisions>
## Implementation Decisions

### Date format
- Four format options available via tray submenu: Short / Long / Numeric / ISO
  - Short: "Fri, Mar 6" (default)
  - Long: "Friday, March 6"
  - Numeric: "3/6/2026" (year included)
  - ISO: "2026-03-06" (year included)
- Short and Long formats omit the year; Numeric and ISO include it
- Default format (first launch and Reset to Defaults): Short ("Fri, Mar 6")

### Visibility toggle
- Date display is toggleable from the tray (show/hide), persisted to settings
- Visible by default on first launch and after Reset to Defaults
- Tray layout: top-level "Show Date" checkable menu item + "Date Format" submenu for the four format options
- "Date Format" submenu items are mutually exclusive checkmarks (same pattern as other submenus)

### Placement & styling
- Positioned directly below the time phrase or dial, above the stats panel
- Color: dimmer/muted variant of the current accent color — visually subordinate to the time phrase
- Font size: smaller than the phrase (approximately 70-80% of the current phrase font size)
- Drop shadow: same treatment as the time phrase text for legibility on any background

### Display modes
- Date is shown in both phrase mode and dial mode
- Auto-updates at midnight via the existing timer — no restart required

### Claude's Discretion
- Exact opacity/brightness reduction for the muted accent variant
- Precise font size ratio (within the ~70-80% range)
- Spacing/margin between the time phrase and the date line

</decisions>

<specifics>
## Specific Ideas

- Follows the same tray submenu pattern as existing submenus (e.g., Text Style, Process Threshold) — mutually exclusive checkmarks
- Muted accent should feel clearly secondary but still readable and color-matched, not grey

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 36-add-a-date-display-under-the-clock*
*Context gathered: 2026-03-06*
