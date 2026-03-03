# Phase 33: Auto-Contrast - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Tray toggle enables screen-color sampling under the widget footprint; automatically switches text to black or white (or an adjusted accent) when the configured accent color fails WCAG contrast against the background; restores accent color when contrast is sufficient again. Screen capture API selection, contrast math, and tray toggle wiring are within scope. No new UI surfaces beyond the tray menu item.

</domain>

<decisions>
## Implementation Decisions

### Flicker prevention
- Use a hysteresis band: enter override mode when contrast ratio drops below 4.5:1; exit override and restore accent only when ratio rises above 5.5:1
- Freeze text color while the user is actively dragging the window; resume the sampling loop on mouse-up

### Override color strategy
- When the accent color fails the 4.5:1 threshold, first try adjusting the accent to pass: darken it if the background is light, lighten it if the background is dark
- If the adjusted accent still cannot reach 4.5:1 contrast (e.g., mid-saturation hue over mid-gray), fall back to pure black or white — whichever achieves higher contrast
- No UI indicator of which state is active — silent, invisible adaptation

### Sampling
- Capture the full widget bounding box for each sample
- Average the pixel colors across the entire captured region to derive the effective background color
- Sample every 500ms

### Visibility / sampling pause
- Pause the sampling loop when ghost mode is active (Opacity = 0 via WS_EX_TRANSPARENT path)
- Also pause when window opacity is 0% via the opacity slider
- On resume, display the last known text color until the first new sample arrives
- Also freeze (not pause) text color during drag; sampling loop stays initialized but does not update the displayed color until drag ends

### Claude's Discretion
- Screen capture API choice (BitBlt, PrintWindow, Magnification API, etc.)
- Exact HSL/HSV adjustment curve for accent lightening/darkening
- Whether to clamp adjustment attempts (e.g., max ±40 lightness steps before giving up)
- Contrast formula implementation (luminance calculation per WCAG 2.1 spec)
- Timer integration (whether 500ms sampler piggybacks on existing refresh timer or runs independently)

</decisions>

<specifics>
## Specific Ideas

- WCAG AA threshold (4.5:1) is the enter threshold — the canonical minimum for normal text
- The 1-point hysteresis gap (4.5 → 5.5) is intentional to prevent boundary-crossing flicker on gradual transitions (e.g., slow video)
- Auto-contrast is off by default (same pattern as Auto-Launch in Phase 31)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-auto-contrast*
*Context gathered: 2026-03-03*
