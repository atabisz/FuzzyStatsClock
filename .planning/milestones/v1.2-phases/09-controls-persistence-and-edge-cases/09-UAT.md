---
status: complete
phase: 09-controls-persistence-and-edge-cases
source: 09-01-SUMMARY.md
started: 2026-02-26T00:00:00Z
updated: 2026-02-26T00:01:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Stats Show/Hide Toggle
expected: Right-click → Stats → Show Stats shows the CPU/GPU/MEM stats panel below the phrase. Clicking Show Stats again collapses it.
result: pass

### 2. Checkmarks Reflect Current State
expected: Open the right-click Stats submenu. The "Show Stats" item has a checkmark when the panel is visible, no checkmark when hidden. The active update interval (1s / 3s / 10s) has a checkmark; the other two do not. This state is correct every time the menu opens — not just the first time.
result: pass

### 3. Update Interval Change
expected: Right-click → Stats → Update Interval → select 1s. The stats values visibly update every second. Switch to 10s — updates slow to once every 10 seconds. The selected interval item gains a checkmark; the others lose theirs.
result: pass

### 4. Persistence Round-Trip
expected: Set stats to visible and interval to 1s. Close the widget (right-click → Exit or close the window). Relaunch. Stats panel is visible and interval is 1s — exactly as left.
result: pass

### 5. Timer Lifecycle
expected: Hide the stats panel. While hidden, the stats values do not change in the background (no background PDH reads). Show the stats panel — values begin updating again at the configured interval. This can be observed by hiding, waiting, then showing and watching values refresh immediately on show.
result: pass

### 6. Bottom-Edge Re-Clamp
expected: Drag the widget near the bottom edge of the screen such that revealing the stats panel would push it partially off-screen. Hide the stats panel. Then show it — the widget repositions upward so the full widget (phrase + stats) remains on screen.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
