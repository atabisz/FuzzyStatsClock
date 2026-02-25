# Phase 2: Window Shell - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a transparent, frameless, always-on-top WPF window that floats on the desktop with a right-click "Close" menu. No phrase logic wired yet — this phase proves the window configuration is correct and the overlay exists. Phrase integration is Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Default window position

- Opens at **top-right corner** of the primary screen
- **20px padding** from both the right edge and top edge
- Position is fixed on launch (no persistence yet — deferred to v2)

### Text appearance

- **Font:** Segoe UI Light
- **Size:** 32pt
- **Color:** White (`#FFFFFF`)
- **Drop shadow:** Dark shadow for legibility on light wallpapers (ClearType is disabled on transparent WPF windows — greyscale AA makes shadow essential)
- **Weight:** Light / Thin (the phrase floats, doesn't shout)
- Placeholder text for Phase 2 shell: any static string that confirms the window renders (e.g. "half past 3")

### Close menu

- **Single item: "Close"** — exits the application
- No app name header, no About item
- Matches the no-chrome philosophy

### Always-on-top behavior

- `Topmost=True` unconditionally — no fullscreen detection or suppression
- Widget is visible over games, video, presentations — simple, no edge-case logic
- **Hide from Alt+Tab** — `ShowInTaskbar=False` plus the window-owner trick to suppress from the Alt+Tab switcher
- Window does **not** appear in the Windows taskbar

### Claude's Discretion

- Exact `DropShadowEffect` parameters (blur radius, opacity, depth) — tune for legibility
- Near-transparent Grid background (`#01000000`) to enable dragging over transparent areas — use this to ensure the full window surface responds to mouse events even with transparent background
- Single-instance enforcement via named Mutex — include in this phase since a second launch would create a second always-on-top overlay

</decisions>

<specifics>
## Specific Ideas

- The window should feel like floating text, not a widget — the "no chrome" aesthetic is paramount
- ClearType is disabled on transparent windows (Windows DWM constraint, not a WPF bug) — design with this in mind from the start

</specifics>

<deferred>
## Deferred Ideas

- Window drag-to-reposition (WIN-04) — Phase 3 or v2
- Position persistence across restarts (WIN-05) — v2
- Windows startup launch (STRT-01) — v2
- Fullscreen detection / widget suppression — out of scope entirely

</deferred>

---

*Phase: 02-window-shell*
*Context gathered: 2026-02-25*
